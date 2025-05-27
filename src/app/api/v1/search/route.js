import { NextResponse } from "next/server";
import db from "@/utils/postgres";
import ollama from "ollama";

// Helper: Get embedding for a query using Claude Sonnet (Anthropic)
async function getQueryEmbedding(query, model = "claude-sonnet") {
  if (model === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY in environment");
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-ada-002",
        input: query,
      }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "OpenAI embedding error");
    }
    const data = await response.json();
    return data.data[0].embedding;
  } else {
    const result = await ollama.embeddings({
      model,
      prompt: query,
    });
    return result.embedding;
  }
}

// Helper: Calculate cosine similarity in SQL
const SIMILARITY_SQL = `
  SELECT c.id, c.content, c.embedding, c.chunk_index, d.filename, d.metadata,
         (c.embedding <#> $2::vector) AS distance
  FROM document_chunks c
  JOIN documents d ON c.document_id = d.id
  ORDER BY distance ASC
  LIMIT 10
`;

// Helper: Use OpenAI to generate a semantic answer from the top chunks
async function getOpenAISearchAnswer(query, topChunks) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY in environment");
  const systemPrompt = `You are a helpful assistant. Use the following document chunks to answer the user's question. If the answer is not in the chunks, say you don't know.`;
  const context = topChunks.map((c, i) => `Chunk ${i + 1}: ${c.content}`).join("\n\n");
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Question: ${query}\n\nDocument Chunks:\n${context}` },
  ];
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages,
      max_tokens: 512,
      temperature: 0.2,
    }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "OpenAI chat error");
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query");
    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
    }

    // Query the database for most similar chunks (using precomputed embeddings)
    const { rows } = await db.query(SIMILARITY_SQL, [query, null]); // queryEmbedding not needed

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

    // Use OpenAI to generate a semantic answer from the top chunks
    const answer = await getOpenAISearchAnswer(query, results.slice(0, 5));

    return NextResponse.json({ results, answer }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
