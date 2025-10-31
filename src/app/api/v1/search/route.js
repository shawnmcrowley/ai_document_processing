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

// Helper: Calculate cosine similarity in SQL
const SIMILARITY_SQL = `
  SELECT c.id, c.content, c.embedding, c.chunk_index, d.filename, d.metadata,
         (c.embedding <#> $1::vector) AS distance
  FROM document_chunks c
  JOIN documents d ON c.document_id = d.id
  ORDER BY distance ASC
  LIMIT 10
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

    // Compute normalized relevance scores across the result set
    const distances = rows.map(r => r.distance);
    const minDist = Math.min(...distances);
    const maxDist = Math.max(...distances);
    
    // Parameters for relevance calculation
    const alpha = 10;  // Controls exponential decay rate
    
    const results = rows.map((row, idx) => {
      // First normalize the distance to [0,1] range
      let normalized;
      if (maxDist - minDist < 1e-12) {
        // If all distances are equal, only first result gets high relevance
        normalized = idx === 0 ? 1 : 0.5;
      } else {
        // Otherwise normalize based on min/max distance
        normalized = (maxDist - row.distance) / (maxDist - minDist);
        normalized = Math.max(0, Math.min(1, normalized));
      }
      
      // Convert normalized distance to relevance score using exponential transform
      const relevance = Math.tanh(alpha * normalized);
      
      return {
        content: row.content,
        relevance,
        rawDistance: row.distance,  // Include raw distance for debugging
        metadata: {
          filename: row.filename,
          chunk_index: row.chunk_index,
          ...row.metadata,
        },
      };
    });

    // Use llama3.2 to generate a semantic answer from the top chunks
    const answer = await getLlamaSearchAnswer(query, results.slice(0, 5));

    return NextResponse.json({ results, answer }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}