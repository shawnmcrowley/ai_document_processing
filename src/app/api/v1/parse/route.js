// Next.js 16 App Router API route for PDF parsing and embedding
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import ollama from "ollama";
import db from "@/lib/postgres";

// Debug logging helper
function logDebug(stage, info) {
    console.log(`[${stage}]`, JSON.stringify(info, null, 2));
}

// Performance tracking helper
class Timer {
    constructor(name) {
        this.name = name;
        this.start = Date.now();
    }
    
    checkpoint(stage) {
        const elapsed = Date.now() - this.start;
        console.log(`[${this.name}] ${stage}: ${elapsed}ms`);
        return elapsed;
    }
    
    reset() {
        this.start = Date.now();
    }
}

function chunkText(text, maxChunkSize = 2000) {
    if (typeof text !== 'string') text = String(text);
    
    // Split into sentences - match period, exclamation, or question mark followed by space and capital letter
    const sentences = text
        .replace(/\r\n/g, ' ')
        .replace(/\n/g, ' ')
        .split(/(?<=[.!?])\s+(?=[A-Z])/)
        .map(s => s.trim())
        .filter(s => s.length > 15);
    
    const chunks = [];
    let currentChunk = [];
    let currentSize = 0;
    
    for (const sentence of sentences) {
        const sentenceSize = sentence.length + 1;
        
        if (currentSize + sentenceSize <= maxChunkSize) {
            currentChunk.push(sentence);
            currentSize += sentenceSize;
        } else {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk.join(' '));
            }
            currentChunk = [sentence];
            currentSize = sentenceSize;
        }
    }
    
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
    }
    
    return chunks;
}

function cleanTextContent(text) {
    if (!text || typeof text !== 'string') return '';
    
    return text
        .normalize('NFKC')
        // Remove page numbers (e.g., "Page 1", "1", "- 5 -")
        .replace(/^\s*(?:page\s*)?\d+\s*$/gim, '')
        .replace(/^\s*-\s*\d+\s*-\s*$/gm, '')
        // Remove common headers/footers patterns
        .replace(/^\s*\d+\s*\|.+$/gm, '')
        // Remove section numbers (e.g., "1.2.3")
        .replace(/^\s*\d+(\.\d+)*\.?\s*$/gm, '')
        .replace(/[\u2013\u2014\u2015]/g, '-')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Remove empty lines
        .split('\n').filter(line => line.trim().length > 0).join('\n')
        .trim();
}

// Helper: L2 normalize a vector with validation
function l2Normalize(vector) {
    // Input validation
    if (!vector || !Array.isArray(vector) || vector.length === 0) {
        throw new Error('Invalid vector input for normalization');
    }
    
    // Validate all elements are numbers
    if (!vector.every(x => typeof x === 'number' && !isNaN(x))) {
        throw new Error('Vector contains non-numeric values');
    }
    
    const sumSquares = vector.reduce((sum, val) => sum + val * val, 0);
    const norm = Math.sqrt(sumSquares);
    
    // Handle zero vectors or very small norms
    if (norm < 1e-10) {
        // Return a unit vector in the first dimension
        return vector.map((_, i) => i === 0 ? 1 : 0);
    }
    
    return vector.map(x => x / norm);
}

/**
 * @swagger
 * /api/v1/parse:
 *   post:
 *     summary: Upload and parse a PDF document
 *     description: Upload a PDF file to extract text and generate embeddings
 *     tags:
 *       - Documents
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: PDF file to upload
 *     responses:
 *       200:
 *         description: Successfully processed PDF
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documentId:
 *                   type: integer
 *                 fileName:
 *                   type: string
 *                 pageCount:
 *                   type: integer
 *                 chunkCount:
 *                   type: integer
 *                 embeddingDimension:
 *                   type: integer
 *       400:
 *         description: No file uploaded
 *       500:
 *         description: Internal server error
 */

export async function POST(req) {
    const timer = new Timer('pdf-processing');
    try {
        const formData = await req.formData();
        const file = formData.get("file");
        if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        
        logDebug('file-info', { name: file.name, size: file.size });
        
        const arrayBuffer = await file.arrayBuffer();
        const pdfBuffer = new Uint8Array(arrayBuffer);
        timer.checkpoint('file loaded');
        
        const data = await pdfParse(pdfBuffer);
        timer.checkpoint('pdf parsed');
        
        const cleanedText = cleanTextContent(String(data.text || ''));
        logDebug('text-cleaned', { length: cleanedText.length, pages: data.numpages });

        if (!cleanedText || cleanedText.length === 0) {
            throw new Error('PDF text extraction produced no valid content');
        }

        // Generate and validate chunks
        const chunks = chunkText(cleanedText, 5000)
            .filter(chunk => chunk?.trim().length >= 50)
            .map(chunk => chunk.trim());
        
        if (chunks.length === 0) {
            throw new Error('No valid text chunks generated from PDF');
        }
        timer.checkpoint('text chunked');
        logDebug('chunks-created', { count: chunks.length });
        
        // Generate embeddings in parallel
        const embeddings = await Promise.all(
            chunks.map(async (chunk) => {
                const result = await ollama.embeddings({
                    model: "snowflake-arctic-embed2",
                    prompt: chunk
                });
                return l2Normalize(result.embedding);
            })
        );
        timer.checkpoint('embeddings generated');
        logDebug('embeddings-created', { count: embeddings.length });

        // Helper functions
        const toPgVector = (arr) => '[' + arr.join(',') + ']';
        
        const meanVector = (vectors) => {
            const dim = vectors[0].length;
            const mean = new Array(dim).fill(0);
            vectors.forEach(v => v.forEach((val, i) => mean[i] += val));
            return l2Normalize(mean.map(val => val / vectors.length));
        };

        // Prepare document data - ensure all values are proper types
        const fileName = String(file.name || "uploaded.pdf");
        const docContent = String(cleanedText);
        const docEmbedding = meanVector(embeddings);
        const metadataJson = JSON.stringify({ ...data.metadata, fileName });
        
        const docInsert = await db.query(
            `INSERT INTO documents (filename, content, metadata, embedding) VALUES ($1, $2, $3, $4) RETURNING id`,
            [fileName, docContent, metadataJson, toPgVector(docEmbedding)]
        );
        const documentId = docInsert.rows[0].id;

        // Batch insert chunks
        const dbBatchSize = 100;
        for (let i = 0; i < chunks.length; i += dbBatchSize) {
            const batch = chunks.slice(i, i + dbBatchSize);
            const values = batch.map((_, idx) => 
                `($1, $${idx * 3 + 2}, $${idx * 3 + 3}, $${idx * 3 + 4})`
            ).join(',');
            
            const params = [documentId];
            batch.forEach((chunk, idx) => {
                params.push(i + idx, String(chunk), toPgVector(embeddings[i + idx]));
            });
            
            await db.query(
                `INSERT INTO document_chunks (document_id, chunk_index, content, embedding) VALUES ${values}`,
                params
            );
        }
        timer.checkpoint('database inserts complete');
        logDebug('db-insert-complete', { documentId, chunks: chunks.length });

        return NextResponse.json({
            documentId,
            fileName,
            pageCount: data.numpages,
            chunkCount: chunks.length,
            embeddingDimension: embeddings[0].length
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
