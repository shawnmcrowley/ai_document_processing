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

// Fast text chunking with optimized processing
function chunkText(text, maxChunkSize = 5000) {
    const timer = new Timer('chunkText');
    const overlap = Math.floor(maxChunkSize * 0.1); // 10% overlap
    const processedChunks = [];
    
    logDebug('chunkText:start', { 
        inputLength: text.length,
        maxChunkSize,
        overlap
    });

    // Efficient text normalization
    const normalizedText = text
        .replace(/\r\n/g, '\n')
        .replace(/\s+/g, ' ')
        .trim();
    
    timer.checkpoint('text normalized');
    
    // Split into manageable sections using structural patterns
    const sections = normalizedText.split(/(?:\n\s*\n|\n(?=[A-Z][A-Z\s]*:|\d+\.))/);
    
    logDebug('initial-split', {
        sectionCount: sections.length,
        averageLength: Math.round(sections.reduce((sum, s) => sum + s.length, 0) / sections.length)
    });

    // Track the current context and buffer
    let currentContext = '';
    let buffer = '';
    let bufferContextLength = 0;
    
    // Process sections with context awareness
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i].trim();
        if (!section) continue;
        
        // Check if section starts with a header-like pattern
        const headerMatch = /^(?:[A-Z][A-Z\s]{2,}[A-Z]|(?:\d+\.)+\s+[A-Z]|[A-Z][a-zA-Z\s]{0,40}:|(?:SECTION|CHAPTER|APPENDIX|EXHIBIT)\s+\d+)/i.exec(section);
        
        if (headerMatch) {
            // Save current buffer before starting new context
            if (buffer) {
                processedChunks.push(
                    currentContext ? `[Context: ${currentContext}]\n\n${buffer}` : buffer
                );
                timer.checkpoint(`chunk-${processedChunks.length}`);
            }
            currentContext = section;
            buffer = '';
            bufferContextLength = section.length + 20; // Account for context wrapper
            continue;
        }
        
        // Calculate effective length including potential context
        const effectiveLength = buffer.length + section.length + 
            (buffer ? 2 : 0) + // Newlines between sections
            (currentContext ? bufferContextLength : 0);
            
        if (effectiveLength <= maxChunkSize) {
            // Add to current buffer
            buffer += (buffer ? '\n\n' : '') + section;
        } else {
            // Save current buffer and start new one
            if (buffer) {
                processedChunks.push(
                    currentContext ? `[Context: ${currentContext}]\n\n${buffer}` : buffer
                );
                timer.checkpoint(`chunk-${processedChunks.length}`);
            }
            
            // Handle oversized sections
            if (section.length > maxChunkSize) {
                // Split by sentences first
                const sentences = section.split(/(?<=[.!?])\s+(?=[A-Z])/);
                let tempBuffer = '';
                
                for (const sentence of sentences) {
                    const tempLength = tempBuffer.length + sentence.length + 
                        (tempBuffer ? 1 : 0) + // Space between sentences
                        (currentContext ? bufferContextLength : 0);
                        
                    if (tempLength <= maxChunkSize) {
                        tempBuffer += (tempBuffer ? ' ' : '') + sentence;
                    } else {
                        if (tempBuffer) {
                            processedChunks.push(
                                currentContext ? `[Context: ${currentContext}]\n\n${tempBuffer}` : tempBuffer
                            );
                            timer.checkpoint(`chunk-${processedChunks.length}`);
                        }
                        // Handle very long sentences
                        if (sentence.length > maxChunkSize) {
                            const words = sentence.split(' ');
                            tempBuffer = '';
                            
                            for (const word of words) {
                                const wordLength = tempBuffer.length + word.length + 
                                    (tempBuffer ? 1 : 0) + // Space between words
                                    (currentContext ? bufferContextLength : 0);
                                    
                                if (wordLength <= maxChunkSize) {
                                    tempBuffer += (tempBuffer ? ' ' : '') + word;
                                } else {
                                    if (tempBuffer) {
                                        processedChunks.push(
                                            currentContext ? `[Context: ${currentContext}]\n\n${tempBuffer}` : tempBuffer
                                        );
                                        timer.checkpoint(`chunk-${processedChunks.length}`);
                                    }
                                    tempBuffer = word;
                                }
                            }
                        } else {
                            tempBuffer = sentence;
                        }
                    }
                }
                
                if (tempBuffer) {
                    processedChunks.push(
                        currentContext ? `[Context: ${currentContext}]\n\n${tempBuffer}` : tempBuffer
                    );
                    timer.checkpoint(`chunk-${processedChunks.length}`);
                }
            } else {
                buffer = section;
            }
        }
        
        // Log progress for long documents
        if (i > 0 && i % 100 === 0) {
            logDebug('chunking-progress', {
                processedSections: i,
                totalSections: sections.length,
                currentChunks: processedChunks.length
            });
        }
    }
    
    // Add final buffer if not empty
    if (buffer) {
        processedChunks.push(
            currentContext ? `[Context: ${currentContext}]\n\n${buffer}` : buffer
        );
        timer.checkpoint(`chunk-${processedChunks.length}`);
    }
    
    logDebug('chunkText:complete', {
        chunkCount: processedChunks.length,
        averageChunkSize: Math.round(processedChunks.reduce((sum, chunk) => sum + chunk.length, 0) / processedChunks.length),
        timing: timer.timings
    });
    
    // Final cleanup and normalization
    return processedChunks.map(chunk => 
        chunk
            .replace(/\n{3,}/g, '\n\n') // Normalize excessive newlines
            .trim()
    );
}

// Helper: Clean text content for better chunk quality
function cleanTextContent(text) {
    if (!text || typeof text !== 'string') return '';
    
    return text
        // Normalize unicode characters
        .normalize('NFKC')
        // Replace various dash types with standard dash
        .replace(/[\u2013\u2014\u2015]/g, '-')
        // Replace multiple spaces with single space
        .replace(/\s+/g, ' ')
        // Replace multiple newlines with double newline
        .replace(/\n{3,}/g, '\n\n')
        // Remove zero-width spaces and other invisible characters
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        // Remove non-printable characters
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

        // Extract and clean text from PDF
        const data = await pdfParse(pdfBuffer, {
            // Ensure we get text content
            pagerender: function(pageData) {
                return pageData.getTextContent();
            }
        });
        timer.checkpoint('pdf parsed');
        
        logDebug('pdf-raw', {
            pageCount: data.numpages,
            rawTextLength: data.text?.length || 0,
            firstChars: data.text?.slice(0, 100)
        });

        // Clean the extracted text
        const cleanedText = cleanTextContent(data.text);
        
        logDebug('pdf-cleaned', {
            pageCount: data.numpages,
            originalLength: data.text?.length || 0,
            cleanedLength: cleanedText.length,
            sampleText: cleanedText.slice(0, 200)
        });

        if (!cleanedText || cleanedText.length === 0) {
            throw new Error('PDF text extraction or cleaning produced no valid content');
        }
        
        // Process text and validate PDF content
        const textWithMarkers = cleanedText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !/^\s*$/.test(line))
            .join('\n');
            
        logDebug('text-preparation', {
            originalLength: data.text.length,
            preparedLength: textWithMarkers.length,
            firstLines: textWithMarkers.split('\n').slice(0, 3)
        });

        if (!textWithMarkers || textWithMarkers.length === 0) {
            throw new Error('Text preparation resulted in empty content');
        }

        // Generate chunks with validation
        let chunks = chunkText(textWithMarkers, 5000);
        timer.checkpoint('text chunked');

        // Validate and clean chunks
        chunks = chunks
            .filter(chunk => chunk && typeof chunk === 'string' && chunk.trim().length > 0)
            .map(chunk => chunk.trim())
            .filter(chunk => chunk.length >= 50); // Minimum meaningful chunk size
        
        // Validate chunks before processing
        if (!chunks || chunks.length === 0) {
            throw new Error('No valid text chunks generated from PDF');
        }
        
        logDebug('chunks-info', {
            count: chunks.length,
            averageSize: Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length),
            sizes: chunks.map(c => c.length),
            firstChunkPreview: chunks[0].slice(0, 200)
        });
        
        // Verify Ollama is available
        try {
            const testResult = await ollama.embeddings({
                model: "snowflake-arctic-embed2",
                prompt: "test embedding generation"
            });
            
            if (!testResult?.embedding) {
                throw new Error('Ollama test embedding failed');
            }
            
            logDebug('ollama-test', {
                status: 'success',
                embeddingSize: testResult.embedding.length
            });
        } catch (error) {
            logDebug('ollama-test-failed', {
                error: error.message,
                stack: error.stack
            });
            throw new Error(`Ollama service error: ${error.message}`);
        }
        
        // Process embeddings in smaller batches with validation
        const embeddings = [];
        const batchSize = 3; // Reduced batch size for better reliability
        
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
            logDebug('processing-batch', {
                batchNumber: Math.floor(i / batchSize) + 1,
                batchSize: batch.length,
                startIndex: i
            });
            
            const batchEmbeddings = await Promise.all(
                batch.map(async (chunk) => {
                    const result = await ollama.embeddings({
                        model: "snowflake-arctic-embed2",
                        prompt: chunk
                    });
                    
                    if (!result?.embedding) {
                        throw new Error('Missing embedding in Ollama response');
                    }
                    
                    return l2Normalize(result.embedding);
                })
            );
            
            embeddings.push(...batchEmbeddings);
            
            logDebug('batch-complete', {
                totalProcessed: embeddings.length,
                remaining: chunks.length - embeddings.length
            });
        }
        timer.checkpoint('embeddings generated');

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
        // Use the normalized text content for the document
        const docContent = data.text;
        const docEmbedding = meanVector(embeddings);
        const docInsert = await db.query(
            `INSERT INTO documents (filename, content, metadata, embedding) VALUES ($1, $2, $3, $4) RETURNING id`,
            [fileName, docContent, metadata, toPgVector(docEmbedding)]
        );
        const documentId = docInsert.rows[0].id;

        // Batch insert chunks using a single transaction
        await db.query('BEGIN');
        try {
            const batchSize = 50;
            for (let i = 0; i < chunks.length; i += batchSize) {
                const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
                const values = batch.map((chunk, idx) => 
                    `($1, $${idx * 3 + 2}, $${idx * 3 + 3}, $${idx * 3 + 4})`
                ).join(',');
                
                const params = [documentId];
                batch.forEach((chunk, idx) => {
                    params.push(i + idx);
                    params.push(chunk);
                    params.push(toPgVector(embeddings[i + idx]));
                });
                
                await db.query(
                    `INSERT INTO document_chunks (document_id, chunk_index, content, embedding) 
                     VALUES ${values}`,
                    params
                );
                
                logDebug('db-batch-insert', {
                    processed: Math.min(i + batchSize, chunks.length),
                    total: chunks.length,
                    batchSize
                });
            }
            await db.query('COMMIT');
        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
        timer.checkpoint('database inserts complete');

        // Return processing results
        return NextResponse.json({
            fileName,
            content: docContent,
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
