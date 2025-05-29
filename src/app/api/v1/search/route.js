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
  const systemPrompt = `You are a helpful assistant. Use the following document chunks to answer the user's question. If the answer is not in the chunks, say you don't know.`;
  const context = topChunks.map((c, i) => `Chunk ${i + 1}: ${c.content}`).join("\n\n");
  
  const response = await ollama.chat({
    model: "llama3.2",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Question: ${query}\n\nDocument Chunks:\n${context}` }
    ],
    options: {
      temperature: 0.2
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

    // Convert distance to relevance (1 - normalized distance)
    const results = rows.map(row => ({
      content: row.content,
      relevance: 1 - Math.min(Math.max(row.distance, 0), 1),
      metadata: {
        filename: row.filename,
        chunk_index: row.chunk_index,
        ...row.metadata,
      },
    }));

    // Use llama3.2 to generate a semantic answer from the top chunks
    const answer = await getLlamaSearchAnswer(query, results.slice(0, 5));

    return NextResponse.json({ results, answer }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}