// Next.js 15 App Router API route for PDF parsing and embedding
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import ollama from "ollama";
import db from "@/utils/postgres";

// Helper: Chunk text (simple split by N words)
function chunkText(text, chunkSize = 256) {
    const words = text.split(" ");
    const chunks = [];
    for (let i = 0; i < words.length; i += chunkSize) {
        chunks.push(words.slice(i, i + chunkSize).join(" "));
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
        const chunks = chunkText(allText, 256);

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
