import { NextResponse } from "next/server";
import db from "@/lib/postgres";
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
    model: "mxbai-embed-large:335m",
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

/**
 * @swagger
 * /api/v1/search:
 *   get:
 *     summary: Search for relevant documents
 *     description: Semantic search using vector embeddings to find relevant document chunks
 *     tags:
 *       - Search
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query text
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Maximum number of results to return
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       content:
 *                         type: string
 *                         description: Full chunk content
 *                       paragraphs:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: Content split into paragraphs
 *                       relevance:
 *                         type: number
 *                         description: Relevance score (0-1)
 *                       distance:
 *                         type: number
 *                         description: Vector distance
 *                       metadata:
 *                         type: object
 *                         properties:
 *                           filename:
 *                             type: string
 *                           chunk_index:
 *                             type: integer
 *                           document_id:
 *                             type: integer
 *       400:
 *         description: Missing query parameter
 *       500:
 *         description: Internal server error
 */

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query");
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    
    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
    }

    const queryEmbedding = await getQueryEmbedding(query);
    const formattedEmbedding = `[${queryEmbedding.join(',')}]`;

    const { rows } = await db.query(SIMILARITY_SQL, [formattedEmbedding, limit * 5]);

    const results = rows
      .map(row => {
        const distance = Number(row.distance);
        const similarity = 1 / (1 + Math.abs(distance));
        const relevance = Math.max(0, Math.min(1, similarity));
        const content = String(row.content || '');
        
        const sentences = content.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim().length > 20);
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
          paragraphs: paragraphs.filter(p => p.trim().length > 30),
          relevance,
          distance,
          metadata: {
            filename: row.filename,
            chunk_index: row.chunk_index,
            document_id: row.document_id
          }
        };
      })
      .filter(r => r.relevance > 0.2)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    console.log('Search results:', results.map(r => ({ 
      relevance: r.relevance.toFixed(3), 
      distance: r.distance.toFixed(3) 
    })));

    return NextResponse.json({ results }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
