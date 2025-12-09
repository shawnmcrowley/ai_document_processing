/*
Command Line Utility to Chat with a PDF File - No ModelFusion dependency
Uses OpenAI SDK directly with in-memory vector storage
*/

const { Command } = require("commander");
const dotenv = require("dotenv");
const fs = require("fs/promises");
const path = require("path");
const pdfParse = require("pdf-parse");
const readline = require("node:readline/promises");

// Load .env.local from scripts directory
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

const program = new Command();

// Sample Command with Sample Document - node src/app/scripts/index.js -f ~/Source/ai_document_processing/src/app/scripts/pdfs/AIAgents.pdf

program
  .description("Chat with a PDF file")
  .requiredOption("-f, --file <value>", "Path to PDF file")
  .parse(process.argv);

const { file } = program.opts();

// Simple text chunking by token count (approximation: ~4 chars per token)
function chunkText(text, maxTokens = 256) {
  const maxChars = maxTokens * 4;
  const chunks = [];
  const sentences = text.split(/[.!?]+\s+/);
  
  let currentChunk = "";
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChars && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ". " : "") + sentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  
  return chunks.map(text => ({ text }));
}

// Cosine similarity between two vectors
function cosineSimilarity(a, b) {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magA * magB);
}

// In-memory vector store
class VectorStore {
  constructor() {
    this.vectors = [];
  }

  async add(text, embedding) {
    this.vectors.push({ text, embedding });
  }

  async search(queryEmbedding, maxResults = 5, threshold = 0.75) {
    const results = this.vectors
      .map(item => ({
        text: item.text,
        similarity: cosineSimilarity(queryEmbedding, item.embedding)
      }))
      .filter(item => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);
    
    return results;
  }
}

// OpenAI API calls

async function createEmbedding(text) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "text-embedding-ada-002",
      input: text
    })
  });
  
  const data = await response.json();
  
  if (!response.ok || !data.data) {
    console.error("OpenAI API Error:", data);
    throw new Error(data.error?.message || "Failed to create embedding");
  }
  
  return data.data[0].embedding;
}

async function generateChatCompletion(messages) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages,
      temperature: 0
    })
  });
  
  const data = await response.json();
  
  if (!response.ok || !data.choices) {
    console.error("OpenAI API Error:", data);
    throw new Error(data.error?.message || "Failed to generate completion");
  }
  
  return data.choices[0].message.content;
}

async function* streamChatCompletion(messages) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages,
      temperature: 0,
      stream: true
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n").filter(line => line.trim().startsWith("data: "));

    for (const line of lines) {
      const data = line.replace("data: ", "");
      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices[0]?.delta?.content;
        if (content) yield content;
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }
}

async function main() {
  console.log("Indexing PDF...");

  // Read and parse PDF
  const pdfData = await fs.readFile(file);
  const data = await pdfParse(pdfData);
  const allText = data.text;

  // Chunk text
  const chunks = chunkText(allText, 256);
  console.log(`Created ${chunks.length} chunks`);
  // Create embeddings and store in vector index
  const vectorStore = new VectorStore();
  
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await createEmbedding(chunks[i].text);
    await vectorStore.add(chunks[i].text, embedding);
    process.stdout.write(`\rIndexing: ${i + 1}/${chunks.length}`);
  }
  
  console.log("\n\nReady.");
  console.log();

  // Chat loop
  const chat = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    const question = await chat.question("You: ");

    // Generate hypothetical answer for better retrieval
    const hypotheticalAnswer = await generateChatCompletion([
      { role: "system", content: "Answer the user's question." },
      { role: "user", content: question }
    ]);

    // Search for relevant chunks
    const queryEmbedding = await createEmbedding(hypotheticalAnswer);
    const results = await vectorStore.search(queryEmbedding, 5, 0.75);

    // Generate final answer with context
    const messages = [
      {
        role: "system",
        content: `Answer the user's question using only the provided information.\n` +
          `Include the page number of the information that you are using.\n` +
          `If the user's question cannot be answered using the provided information, ` +
          `respond with "I don't know".`
      },
      { role: "user", content: question },
      {
        role: "function",
        name: "getInformation",
        content: JSON.stringify(results)
      }
    ];

    // Stream answer
    process.stdout.write("\nAI : ");
    for await (const textPart of streamChatCompletion(messages)) {
      process.stdout.write(textPart);
    }
    process.stdout.write("\n\n");
  }
}

main().catch(console.error);
