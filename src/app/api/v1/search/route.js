import { NextResponse } from "next/server";
import db from "@/utils/postgres";
import ollama from "ollama";

// Helper: Get embedding for a query using snowflake-arctic-embed2
async function getQueryEmbedding(query) {
  const result = await ollama.embeddings({
    model: "snowflake-arctic-embed2",
    prompt: query,
  });
  return result.embedding;
}

// Helper: Calculate cosine similarity in SQL with document context
const SIMILARITY_SQL = `
  WITH ranked_chunks AS (
    SELECT 
      c.id,
      c.content,
      c.embedding,
      c.chunk_index,
      c.document_id,
      d.filename,
      d.metadata,
      (c.embedding <#> $1::vector) AS distance,
      LAG(c.chunk_index) OVER (PARTITION BY d.id ORDER BY c.chunk_index) as prev_chunk_idx,
      LEAD(c.chunk_index) OVER (PARTITION BY d.id ORDER BY c.chunk_index) as next_chunk_idx
    FROM document_chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE (c.embedding <#> $1::vector) < 0.8  -- Similarity threshold
    ORDER BY distance ASC
    LIMIT 30
  )
  SELECT 
    rc.*,
    prev.content as prev_chunk_content,
    next.content as next_chunk_content
  FROM ranked_chunks rc
  LEFT JOIN document_chunks prev ON prev.document_id = rc.document_id AND prev.chunk_index = rc.prev_chunk_idx
  LEFT JOIN document_chunks next ON next.document_id = rc.document_id AND next.chunk_index = rc.next_chunk_idx
  ORDER BY distance ASC
`;


// Helper: Use llama3.2 to generate a semantic answer from the top chunks
async function getLlamaSearchAnswer(query, topChunks) {
  const systemPrompt = `You are a strict factual assistant. Follow these rules:
1. Only use information explicitly stated in the provided document chunks
2. For each fact or statement, cite the chunk number in [brackets], e.g. [Chunk 2]
3. If the information needed is not in the chunks, say "I don't know based on the provided documents"
4. Never invent, assume, or infer facts not directly supported by the chunks
5. Keep answers concise and focused on the question`;

  const context = topChunks.map((c, i) => `Chunk ${i + 1}: ${c.content}`).join("\n\n");
  
  const response = await ollama.chat({
    model: "llama3.2",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Question: ${query}\n\nDocument Chunks:\n${context}` }
    ],
    options: {
      temperature: 0.05,  // Very low temperature for factual responses
      maxTokens: 512     // Reasonable limit for focused answers
    }
  });
  
  return response.message.content;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query");
    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
    }

    // Generate embedding for the query using snowflake-arctic-embed2
    const queryEmbedding = await getQueryEmbedding(query);
    
    // Format the embedding as a PostgreSQL vector literal
    const formattedEmbedding = `[${queryEmbedding.join(',')}]`;
    
    // Query the database for most similar chunks using the query embedding
    const { rows } = await db.query(SIMILARITY_SQL, [formattedEmbedding]);

    // Helper to check if chunks are from same section
    function areChunksRelated(chunk1, chunk2) {
      if (!chunk1 || !chunk2) return false;
      // Same document and sequential chunks
      return chunk1.document_id === chunk2.document_id && 
             Math.abs(chunk1.chunk_index - chunk2.chunk_index) <= 1;
    }

    // Group related chunks and compute relevance
    const groupedResults = [];
    let currentGroup = null;
    
    for (const row of rows) {
      const normalized = row.distance < 0.8 ? (0.8 - row.distance) / 0.8 : 0;
      const relevance = Math.tanh(10 * normalized); // alpha = 10
      
      // Create result object with context
      const resultObj = {
        content: row.content,
        prev_content: row.prev_chunk_content,
        next_content: row.next_chunk_content,
        relevance,
        rawDistance: row.distance,
        metadata: {
          filename: row.filename,
          chunk_index: row.chunk_index,
          ...row.metadata,
        },
      };
      
      // Check if this chunk should be merged with previous group
      if (currentGroup && areChunksRelated(currentGroup[currentGroup.length - 1], row)) {
        currentGroup.push(resultObj);
      } else {
        if (currentGroup) {
          groupedResults.push(currentGroup);
        }
        currentGroup = [resultObj];
      }
    }
    if (currentGroup) {
      groupedResults.push(currentGroup);
    }
    
    // Merge chunks in each group
    const results = groupedResults.map(group => {
      if (group.length === 1) {
        const result = group[0];
        // Include surrounding context if available
        let content = '';
        if (result.prev_content) content += result.prev_content + "\n\n";
        content += result.content;
        if (result.next_content) content += "\n\n" + result.next_content;
        return {
          content: content.trim(),
          relevance: result.relevance,
          rawDistance: result.rawDistance,
          metadata: result.metadata,
        };
      }
      
      // Merge multiple related chunks
      return {
        content: group.map(r => r.content).join("\n\n"),
        relevance: Math.max(...group.map(r => r.relevance)),
        rawDistance: Math.min(...group.map(r => r.rawDistance)),
        metadata: {
          ...group[0].metadata,
          chunk_count: group.length,
          chunk_range: `${group[0].metadata.chunk_index}-${group[group.length-1].metadata.chunk_index}`,
        },
      };
    });

    // Use llama3.2 to generate a semantic answer from the most relevant chunks
    // Get top results that meet minimum relevance threshold
    const relevantResults = results.filter(r => r.relevance > 0.4).slice(0, 8);
    const answer = await getLlamaSearchAnswer(query, relevantResults);

    return NextResponse.json({ results, answer }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}