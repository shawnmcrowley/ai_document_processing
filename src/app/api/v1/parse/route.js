// Next.js 15 App Router API route for PDF parsing and embedding
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import ollama from "ollama";

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
    const result = await ollama.embeddings({
        model: "snowflake-arctic-embed:2",
        prompt: texts,
    });
    return result.embedding;
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

        // Add file name to metadata
        const fileName = file.name || "uploaded.pdf";
        const metadata = {
            ...data.metadata,
            fileName,
        };

        // Return chunks and embeddings
        return NextResponse.json({
            fileName,
            allText,
            chunks,
            //embeddings,
            pageCount: data.numpages,
            info: data.info,
            metadata,
        }, { status: 200 });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
