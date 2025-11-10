import { NextResponse } from "next/server";
import db from "@/utils/postgres";
import ollama from "ollama";

function normalizeVector(vector) {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Invalid vector for normalization');
  }
  const squareSum = vector.reduce((sum, val) => sum + val * val, 0);
  const length = Math.sqrt(squareSum);
  
  if (length === 0 || !isFinite(length)) {
    return vector.map(() => 0);
  }
  
  return vector.map(val => val / length);
}

async function getQueryEmbedding(query) {
  const result = await ollama.embeddings({
    model: "snowflake-arctic-embed2",
    prompt: query,
  });
  return normalizeVector(result.embedding);
}

const SIMILARITY_SQL = `
  SELECT 
    c.id,
    c.content,
    c.chunk_index,
    c.document_id,
    d.filename,
    d.metadata,
    (c.embedding <#> $1::vector) AS distance
  FROM document_chunks c
  JOIN documents d ON c.document_id = d.id
  ORDER BY distance ASC
  LIMIT $2
`;

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query");
    const limit = parseInt(searchParams.get("limit") || "5", 10);
    
    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
    }

    const queryEmbedding = await getQueryEmbedding(query);
    const formattedEmbedding = `[${queryEmbedding.join(',')}]`;

    const { rows } = await db.query(SIMILARITY_SQL, [formattedEmbedding, limit * 2]);

    const results = rows
      .map(row => {
        const distance = Number(row.distance);
        const similarity = Math.max(0, Math.min(1, 1 - distance));
        const relevance = Math.pow(similarity, 0.8);
        const content = String(row.content || '');
        // Split into paragraphs (sentences grouped by topic)
        const sentences = content.split(/(?<=[.!?])\s+(?=[A-Z])/);
        const paragraphs = [];
        let currentPara = [];
        
        sentences.forEach((s, i) => {
          currentPara.push(s);
          if (currentPara.length >= 3 || i === sentences.length - 1) {
            paragraphs.push(currentPara.join(' '));
            currentPara = [];
          }
        });
        
        return {
          content,
          paragraphs: paragraphs.filter(p => p.trim().length > 0),
          relevance,
          distance,
          metadata: {
            filename: row.filename,
            chunk_index: row.chunk_index,
            document_id: row.document_id
          }
        };
      })
      .filter(r => r.relevance > 0.3)
      .slice(0, limit);

    return NextResponse.json({ results }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
