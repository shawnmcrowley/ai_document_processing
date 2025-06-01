// Next.js 15 App Router API route for PDF parsing and embedding
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import ollama from "ollama";
import db from "@/utils/postgres";

// Helper: Simplified but effective text chunking for better readability
function chunkText(text, maxChunkSize = 3000) {
    // Step 1: Clean up text for better paragraph detection
    const cleanedText = text
        .replace(/\r\n/g, '\n')
        .replace(/([a-z])\n([a-z])/gi, '$1 $2')  // Join broken sentences
        .replace(/\n{3,}/g, '\n\n')              // Normalize multiple line breaks
        .replace(/\s{2,}/g, ' ');                // Normalize multiple spaces
    
    // Step 2: Split into paragraphs more aggressively
    // Look for actual paragraph breaks, section headers, bullet points
    const paragraphSplitters = [
        /\n\s*\n/,                              // Double line breaks
        /\n(?=[A-Z][A-Z\s]{2,}[A-Z])/,          // ALL CAPS HEADERS
        /\n(?=\d+\.\s+[A-Z])/,                  // Numbered sections (1. Title)
        /\n(?=[A-Z][a-zA-Z\s]{0,30}:)/,         // Title: format
        /\n(?=•|\*|\-\s+[A-Z])/                 // Bullet points
    ];
    
    // Join all splitters with OR operator
    const splitPattern = new RegExp(paragraphSplitters.map(p => p.source).join('|'), 'g');
    
    // Split text and filter out empty paragraphs
    const paragraphs = cleanedText
        .split(splitPattern)
        .map(p => p.trim())
        .filter(p => p.length > 20);  // Minimum meaningful paragraph size
    
    // Step 3: Create chunks from paragraphs
    const chunks = [];
    let currentChunk = "";
    
    for (const paragraph of paragraphs) {
        // If this single paragraph is too large, split by sentences
        if (paragraph.length > maxChunkSize) {
            // Save current chunk if not empty
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = "";
            }
            
            // Split by sentences and create chunks
            const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
            let sentenceChunk = "";
            
            for (const sentence of sentences) {
                if (sentenceChunk.length + sentence.length > maxChunkSize && sentenceChunk.length > 0) {
                    chunks.push(sentenceChunk.trim());
                    sentenceChunk = sentence;
                } else {
                    sentenceChunk += sentence;
                }
            }
            
            if (sentenceChunk.length > 0) {
                chunks.push(sentenceChunk.trim());
            }
        }
        // If adding this paragraph would exceed max size, start a new chunk
        else if (currentChunk.length + paragraph.length + 2 > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = paragraph;
        } 
        // Otherwise add to current chunk
        else {
            if (currentChunk.length > 0) {
                currentChunk += "\n\n";
            }
            currentChunk += paragraph;
        }
    }
    
    // Add the last chunk if not empty
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
}

// Helper: Call local Ollama embedding model using the ollama npm package
async function getEmbeddingsOllama(texts) {
    // snowflake-arctic-embed-2 must be running in Ollama
    // Ollama expects a single string for 'prompt', not an array
    // To get per-chunk embeddings, call embeddings for each chunk
    const embeddings = [];
    for (const text of texts) {
        const result = await ollama.embeddings({
            model: "snowflake-arctic-embed2",
            prompt: text,
        });
        embeddings.push(result.embedding);
    }
    return embeddings;
}

export async function POST(req) {
    try {
        // Accept PDF as multipart/form-data
        const formData = await req.formData();
        const file = formData.get("file");
        if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        const arrayBuffer = await file.arrayBuffer();
        // Use Uint8Array instead of Buffer (Buffer is deprecated in edge/serverless runtimes)
        const pdfBuffer = new Uint8Array(arrayBuffer);

        // Extract text from PDF using pdf-parse
        const data = await pdfParse(pdfBuffer);
        const allText = data.text;
        const chunks = chunkText(allText, 3000);

        // Get embeddings using Ollama
        const embeddings = await getEmbeddingsOllama(chunks);

        // Add file name to metadata
        const fileName = file.name || "uploaded.pdf";
        const metadata = {
            ...data.metadata,
            fileName,
        };

        // Insert document into documents table (use the mean embedding for the document)
        // Convert embedding arrays to Postgres vector literal format
        function toPgVector(arr) {
            return '[' + arr.join(',') + ']';
        }
        function meanVector(vectors) {
            if (!vectors.length) return [];
            const dim = vectors[0].length;
            const mean = Array(dim).fill(0);
            for (const v of vectors) {
                for (let i = 0; i < dim; i++) {
                    mean[i] += v[i];
                }
            }
            for (let i = 0; i < dim; i++) {
                mean[i] /= vectors.length;
            }
            return mean;
        }
        const docEmbedding = meanVector(embeddings);
        const docInsert = await db.query(
            `INSERT INTO documents (filename, content, metadata, embedding) VALUES ($1, $2, $3, $4) RETURNING id`,
            [fileName, allText, metadata, toPgVector(docEmbedding)]
        );
        const documentId = docInsert.rows[0].id;

        // Insert chunks into document_chunks table (each chunk gets its own embedding)
        for (let i = 0; i < chunks.length; i++) {
            await db.query(
                `INSERT INTO document_chunks (document_id, chunk_index, content, embedding) VALUES ($1, $2, $3, $4)`,
                [documentId, i, chunks[i], toPgVector(embeddings[i])]
            );
        }

        // Return chunks and embeddings
        return NextResponse.json({
            fileName,
            allText,
            chunks,
            embeddings,
            pageCount: data.numpages,
            info: data.info,
            metadata,
            documentId,
        }, { status: 200 });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
