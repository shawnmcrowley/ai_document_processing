// Next.js 15 App Router API route for PDF parsing and embedding
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import ollama from "ollama";
import db from "@/utils/postgres";

// Helper: Enhanced text chunking for improved readability and semantic coherence
function chunkText(text, maxChunkSize = 3000) {
    // Step 1: Normalize and clean text for better structure detection
    const cleanedText = text
        .replace(/\r\n/g, '\n')
        .replace(/([a-z0-9])\n([a-z0-9])/gi, '$1 $2')  // Join broken sentences
        .replace(/\n{3,}/g, '\n\n')                    // Normalize multiple line breaks
        .replace(/\s{2,}/g, ' ')                       // Normalize multiple spaces
        .trim();
    
    // Step 2: Identify document structure elements
    const structureElements = {
        // Headers and titles
        headers: /\n(?=[A-Z][A-Z0-9\s]{2,}[A-Z0-9])/,                  // ALL CAPS HEADERS
        numberedSections: /\n(?=(?:\d+\.)+\s+[A-Z])/,                  // Numbered sections (1.2.3. Title)
        titleFormat: /\n(?=[A-Z][a-zA-Z0-9\s]{0,40}:)/,                // Title: format
        
        // Lists and bullet points
        bulletPoints: /\n(?=(?:•|\*|\-|\+|\d+[.)])\s+\S)/,             // Any kind of list item
        
        // Tables and structured data
        tables: /\n(?=[\|\+\-]{3,})/,                                  // Table borders
        
        // Paragraph breaks
        paragraphBreaks: /\n\s*\n/,                                    // Double line breaks
        
        // Special document sections
        sections: /\n(?=(?:SECTION|CHAPTER|APPENDIX|EXHIBIT)\s+\d+)/i  // Common document section markers
    };
    
    // Create a combined pattern for splitting
    const splitPatternSource = Object.values(structureElements)
        .map(pattern => pattern.source)
        .join('|');
    const splitPattern = new RegExp(splitPatternSource, 'g');
    
    // Split text into semantic blocks and filter out tiny fragments
    const blocks = cleanedText
        .split(splitPattern)
        .map(block => block.trim())
        .filter(block => block.length > 15);  // Minimum meaningful block size
    
    // Step 3: Create semantically coherent chunks
    const chunks = [];
    let currentChunk = "";
    let currentChunkContext = "";  // Track the context of the current chunk
    
    // Helper to check if a block is a header/title
    const isHeaderOrTitle = (block) => {
        return (
            /^[A-Z][A-Z\s]{2,}[A-Z]/.test(block) ||                // ALL CAPS HEADER
            /^(?:\d+\.)+\s+[A-Z]/.test(block) ||                   // Numbered section
            /^[A-Z][a-zA-Z\s]{0,40}:/.test(block) ||              // Title: format
            /^(?:SECTION|CHAPTER|APPENDIX|EXHIBIT)\s+\d+/i.test(block)  // Section marker
        );
    };
    
    // Process each semantic block
    for (const block of blocks) {
        // Case 1: Block is too large for a single chunk
        if (block.length > maxChunkSize) {
            // Save current chunk if not empty
            if (currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = "";
            }
            
            // For large blocks, try to split by semantic units first
            const subBlocks = block
                .split(/(?<=\.|\?|\!)\s+(?=[A-Z])/)  // Split by sentence boundaries
                .filter(sb => sb.trim().length > 0);
            
            if (subBlocks.length > 1) {
                // Process sentences into chunks
                let subChunk = "";
                for (const sentence of subBlocks) {
                    if ((subChunk.length + sentence.length + 1) > maxChunkSize && subChunk.length > 0) {
                        chunks.push(subChunk.trim());
                        subChunk = sentence;
                    } else {
                        subChunk += (subChunk.length > 0 ? ' ' : '') + sentence;
                    }
                }
                if (subChunk.length > 0) {
                    chunks.push(subChunk.trim());
                }
            } else {
                // If we can't split semantically, split by character count as last resort
                for (let i = 0; i < block.length; i += maxChunkSize) {
                    // Try to find a space to break at
                    let endPos = Math.min(i + maxChunkSize, block.length);
                    if (endPos < block.length) {
                        const nextSpace = block.indexOf(' ', endPos - 100);
                        if (nextSpace > 0 && nextSpace < endPos + 100) {
                            endPos = nextSpace;
                        }
                    }
                    chunks.push(block.substring(i, endPos).trim());
                }
            }
            
            continue;  // Skip to next block
        }
        
        // Case 2: Block is a header/title - start a new chunk to keep headers with their content
        if (isHeaderOrTitle(block)) {
            // If we already have content, save the current chunk
            if (currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
            }
            
            // Start a new chunk with this header
            currentChunk = block;
            currentChunkContext = block;  // Track this as the current context
            continue;
        }
        
        // Case 3: Adding this block would exceed max size
        if ((currentChunk.length + block.length + 4) > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            
            // If we have context, start new chunk with context reminder + new block
            if (currentChunkContext && currentChunkContext !== block) {
                // Only include context if it's short enough
                if (currentChunkContext.length < 100) {
                    currentChunk = `[Continued: ${currentChunkContext}]\n\n${block}`;
                } else {
                    currentChunk = block;
                }
            } else {
                currentChunk = block;
            }
        } 
        // Case 4: Add to current chunk with appropriate spacing
        else {
            if (currentChunk.length > 0) {
                // Determine appropriate separator based on content type
                if (/^(?:•|\*|\-|\+|\d+[.)])\s+/.test(block)) {
                    // List items get a single newline
                    currentChunk += '\n' + block;
                } else if (/[\|\+\-]{3,}/.test(block)) {
                    // Table elements get a single newline
                    currentChunk += '\n' + block;
                } else {
                    // Regular paragraphs get double newline
                    currentChunk += '\n\n' + block;
                }
            } else {
                currentChunk = block;
            }
        }
    }
    
    // Add the last chunk if not empty
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    
    // Step 4: Post-process chunks to ensure they're well-formed
    return chunks.map(chunk => {
        // Ensure lists and tables maintain their structure
        return chunk
            .replace(/\n{3,}/g, '\n\n')  // Normalize excessive newlines
            .trim();
    });
}

// Helper: L2 normalize a vector
function l2Normalize(vector) {
    const sumSquares = vector.reduce((sum, val) => sum + val * val, 0);
    const norm = Math.sqrt(sumSquares) || 1;  // fallback to 1 if zero vector
    return vector.map(x => x / norm);
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
        // L2 normalize the embedding before storing
        embeddings.push(l2Normalize(result.embedding));
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
            // Normalize the mean vector before returning
            return l2Normalize(mean);
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
