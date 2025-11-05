// Next.js 15 App Router API route for PDF parsing and embedding
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import ollama from "ollama";
import db from "@/utils/postgres";

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

function chunkText(text, maxChunkSize = 5000) {
    if (typeof text !== 'string') text = String(text);
    
    const processedChunks = [];
    const paragraphs = text
        .replace(/\r\n/g, '\n')
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
    
    let currentChunk = [];
    let currentSize = 0;
    
    for (const paragraph of paragraphs) {
        const paraSize = paragraph.length + 2; // +2 for \n\n
        
        if (currentSize + paraSize <= maxChunkSize) {
            currentChunk.push(paragraph);
            currentSize += paraSize;
        } else {
            if (currentChunk.length > 0) {
                processedChunks.push(currentChunk.join('\n\n'));
            }
            currentChunk = [paragraph];
            currentSize = paragraph.length;
        }
    }
    
    if (currentChunk.length > 0) {
        processedChunks.push(currentChunk.join('\n\n'));
    }
    
    return processedChunks;
}

function cleanTextContent(text) {
    if (!text || typeof text !== 'string') return '';
    
    return text
        .normalize('NFKC')
        .replace(/[\u2013\u2014\u2015]/g, '-')
        .replace(/[^\S\n]+/g, ' ')  // Replace spaces/tabs but keep newlines
        .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '')
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

// Helper: Call local Ollama embedding model using the ollama npm package
async function getEmbeddingsOllama(texts) {
    // snowflake-arctic-embed-2 must be running in Ollama
    // Ollama expects a single string for 'prompt', not an array
    // To get per-chunk embeddings, call embeddings for each chunk
    const embeddings = [];
    for (const text of texts) {
        try {
            const result = await ollama.embeddings({
                model: "snowflake-arctic-embed2",
                prompt: text,
            });
            
            // Validate embedding vector
            if (!result?.embedding || !Array.isArray(result.embedding) || result.embedding.length === 0) {
                throw new Error('Invalid embedding received from Ollama');
            }
            
            // L2 normalize the embedding before storing
            embeddings.push(l2Normalize(result.embedding));
            
        } catch (error) {
            console.error('Embedding generation failed:', error);
            // Return a default embedding vector of appropriate size (1024 for this model)
            const defaultVector = new Array(1024).fill(1 / Math.sqrt(1024));
            embeddings.push(defaultVector);
        }
    }
    return embeddings;
}

// Batch process helper for embeddings with enhanced error handling
async function processBatch(texts, batchSize = 5) {
    const results = [];
    let lastValidEmbedding = null;
    let errorCount = 0;
    const maxErrors = Math.ceil(texts.length * 0.1); // Allow up to 10% errors

    logDebug('batch-start', {
        totalTexts: texts.length,
        batchSize,
        expectedBatches: Math.ceil(texts.length / batchSize)
    });

    // Verify Ollama is running and model is available
    try {
        logDebug('model-check-start', {
            model: "snowflake-arctic-embed2",
            timestamp: new Date().toISOString()
        });

        const testEmbed = await ollama.embeddings({
            model: "snowflake-arctic-embed2",
            prompt: "test"
        }).catch(error => {
            logDebug('model-check-error', {
                error: error.message,
                stack: error.stack,
                name: error.name
            });
            return null;
        });

        if (!testEmbed) {
            // Instead of throwing, create a default embedding
            logDebug('model-check-fallback', {
                message: 'Using default embedding',
                dimension: 1024
            });
            lastValidEmbedding = new Array(1024).fill(1 / Math.sqrt(1024));
        } else if (!testEmbed.embedding || !Array.isArray(testEmbed.embedding) || testEmbed.embedding.length === 0) {
            logDebug('model-check-invalid', {
                response: JSON.stringify(testEmbed)
            });
            lastValidEmbedding = new Array(1024).fill(1 / Math.sqrt(1024));
        } else {
            lastValidEmbedding = l2Normalize(testEmbed.embedding);
            logDebug('model-check-success', {
                embeddingSize: testEmbed.embedding.length
            });
        }
    } catch (error) {
        // Log error but continue with default embedding
        logDebug('model-check-fatal', {
            error: error.message,
            stack: error.stack,
            type: error.name
        });
        lastValidEmbedding = new Array(1024).fill(1 / Math.sqrt(1024));
    }

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchStartTime = Date.now();
        
        try {
            const batchResults = await Promise.all(
                batch.map(async (text, idx) => {
                    try {
                        const result = await ollama.embeddings({
                            model: "snowflake-arctic-embed2",
                            prompt: text
                        }).catch(error => {
                            logDebug('embedding-request-error', {
                                error: error.message,
                                textLength: text.length,
                                textPreview: text.slice(0, 100)
                            });
                            return null;
                        });
                        
                        // Enhanced validation with graceful fallback
                        if (!result) {
                            logDebug('embedding-null-result', {
                                textLength: text.length
                            });
                            return lastValidEmbedding;
                        }
                        
                        if (!result.embedding) {
                            logDebug('embedding-missing', {
                                response: JSON.stringify(result)
                            });
                            return lastValidEmbedding;
                        }
                        
                        if (!Array.isArray(result.embedding)) {
                            logDebug('embedding-invalid-type', {
                                type: typeof result.embedding
                            });
                            return lastValidEmbedding;
                        }
                        
                        if (result.embedding.length === 0) {
                            logDebug('embedding-empty-array', {
                                response: JSON.stringify(result)
                            });
                            return lastValidEmbedding;
                        }
                        
                        const normalized = l2Normalize(result.embedding);
                        lastValidEmbedding = normalized;
                        return normalized;
                    } catch (error) {
                        errorCount++;
                        logDebug('embedding-error', {
                            batchIndex: i,
                            textIndex: idx,
                            textLength: text.length,
                            errorMessage: error.message
                        });
                        
                        if (errorCount > maxErrors) {
                            throw new Error(`Too many embedding failures: ${errorCount} errors`);
                        }
                        
                        // Use last valid embedding or create a default one
                        return lastValidEmbedding || new Array(1024).fill(1 / Math.sqrt(1024));
                    }
                })
            );
            
            const batchTime = Date.now() - batchStartTime;
            results.push(...batchResults);
            
            logDebug('embedding-batch', { 
                processed: results.length,
                total: texts.length,
                batchSize,
                currentBatch: Math.floor(i / batchSize) + 1,
                embeddingDimension: batchResults[0]?.length,
                processingTimeMs: batchTime,
                errorCount
            });
            
        } catch (error) {
            logDebug('batch-error', {
                batchIndex: i,
                error: error.message,
                errorCount
            });
            
            if (errorCount > maxErrors) {
                throw new Error(`Batch processing failed: ${error.message}`);
            }
            
            // Fill the batch with default embeddings
            const defaultEmbeddings = Array(batch.length).fill(
                lastValidEmbedding || new Array(1024).fill(1 / Math.sqrt(1024))
            );
            results.push(...defaultEmbeddings);
        }
    }
    
    // Final validation with detailed diagnostics
    if (!results.length) {
        throw new Error('No embeddings generated');
    }
    
    if (!results[0]?.length) {
        throw new Error('Generated embeddings have zero dimensions');
    }
    
    logDebug('batch-complete', {
        totalEmbeddings: results.length,
        embeddingDimension: results[0].length,
        errorCount,
        successRate: ((texts.length - errorCount) / texts.length * 100).toFixed(2) + '%'
    });
    
    return results;
}

export async function POST(req) {
    const timer = new Timer('pdf-processing');
    try {
        const formData = await req.formData();
        const file = formData.get("file");
        if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        
        logDebug('file-info', {
            name: file.name,
            size: file.size,
            type: file.type
        });

        const arrayBuffer = await file.arrayBuffer();
        const pdfBuffer = new Uint8Array(arrayBuffer);
        timer.checkpoint('file loaded');

        // Extract text from PDF
        const data = await pdfParse(pdfBuffer);
        timer.checkpoint('pdf parsed');
        
        // Ensure we have a plain text string
        const rawText = String(data.text || '');
        
        logDebug('pdf-raw', {
            pageCount: data.numpages,
            rawTextLength: rawText.length,
            textType: typeof rawText,
            firstChars: rawText.slice(0, 100)
        });

        // Clean the extracted text
        const cleanedText = cleanTextContent(rawText);
        
        logDebug('pdf-cleaned', {
            pageCount: data.numpages,
            originalLength: data.text?.length || 0,
            cleanedLength: cleanedText.length,
            sampleText: cleanedText.slice(0, 200)
        });

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

        logDebug('chunks-info', {
            count: chunks.length,
            averageSize: Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length)
        });
        
        // Generate embeddings in batches
        const embeddings = [];
        const batchSize = 5;
        
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const batchEmbeddings = await Promise.all(
                batch.map(async (chunk) => {
                    const result = await ollama.embeddings({
                        model: "snowflake-arctic-embed2",
                        prompt: chunk
                    });
                    return l2Normalize(result.embedding);
                })
            );
            embeddings.push(...batchEmbeddings);
        }
        timer.checkpoint('embeddings generated');

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
        
        logDebug('pre-insert-validation', {
            fileNameType: typeof fileName,
            docContentType: typeof docContent,
            docContentLength: docContent.length,
            docContentSample: docContent.slice(0, 100),
            metadataType: typeof metadataJson
        });
        
        const docInsert = await db.query(
            `INSERT INTO documents (filename, content, metadata, embedding) VALUES ($1, $2, $3, $4) RETURNING id`,
            [fileName, docContent, metadataJson, toPgVector(docEmbedding)]
        );
        const documentId = docInsert.rows[0].id;

        // Batch insert chunks
        await db.query('BEGIN');
        try {
            const dbBatchSize = 50;
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
            await db.query('COMMIT');
        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
        timer.checkpoint('database inserts complete');

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
