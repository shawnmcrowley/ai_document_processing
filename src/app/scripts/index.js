/*
Command Line Utility to Chat with a PDF File - Takes a single file input
and uses pdf-parse to extract text from the PDF, then uses OpenAI's
GPT model to answer questions based on the extracted text.  
This script is designed to be run from the command line and requires Node.js.
It uses the ModelFusion library to handle vector indexing and
retrieval of information from the PDF.
*/

const { Command } = require("commander");
const dotenv = require("dotenv");
const fs = require("fs/promises");
const pdfParse = require("pdf-parse");
const {
  MemoryVectorIndex,
  VectorIndexRetriever,
  generateText,
  openai,
  retrieve,
  splitAtToken,
  splitTextChunks,
  streamText,
  upsertIntoVectorIndex,
} = require("modelfusion");
const readline = require("node:readline/promises");

dotenv.config();

const program = new Command();

program
  .description("Chat with a PDF file")
  .requiredOption("-f, --file <value>", "Path to PDF file")
  .parse(process.argv);

const { file } = program.opts();

async function main() {
  console.log("Indexing PDF...");

  // Read the PDF file from disk:
  const pdfData = await fs.readFile(file);

  // Extract text from PDF using pdf-parse
  const data = await pdfParse(pdfData);
  const allText = data.text;

 const embeddingModel = openai.TextEmbedder({
    model: "text-embedding-ada-002",
  });

  // Chunk the text using the same logic as before
  const chunks = await splitTextChunks(
    splitAtToken({
      maxTokensPerChunk: 256,
      tokenizer: embeddingModel.tokenizer, // tokenizer is optional for plain text
    }),
    [{ text: allText }]
  );

 

  const vectorIndex = new MemoryVectorIndex();

  await upsertIntoVectorIndex({
    vectorIndex,
    embeddingModel,
    objects: chunks,
    getValueToEmbed: (chunk) => chunk.text,
  });

  console.log("Ready.");
  console.log();

  // chat loop:
  const chat = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    const question = await chat.question("You: ");

    // hypothetical document embeddings:
    const hypotheticalAnswer = await generateText({
      // use cheaper model to generate hypothetical answer:
      model: openai.ChatTextGenerator({
        model: "gpt-3.5-turbo",
        temperature: 0,
      }),
      prompt: [
        openai.ChatMessage.system(`Answer the user's question.`),
        openai.ChatMessage.user(question),
      ],
    });

    // search for text chunks that are similar to the hypothetical answer:
    const information = await retrieve(
      new VectorIndexRetriever({
        vectorIndex,
        embeddingModel,
        maxResults: 5,
        similarityThreshold: 0.75,
      }),
      hypotheticalAnswer
    );

    // answer the user's question using the retrieved information:
    const textStream = await streamText({
      // use stronger model to answer the question:
      model: openai.ChatTextGenerator({ model: "gpt-4", temperature: 0 }),
      prompt: [
        openai.ChatMessage.system(
          // Instruct the model on how to answer:
          `Answer the user's question using only the provided information.\n` +
            // Provide some context:
            `Include the page number of the information that you are using.\n` +
            // To reduce hallucination, it is important to give the model an answer
            // that it can use when the information is not sufficient:
            `If the user's question cannot be answered using the provided information, ` +
            `respond with "I don't know".`
        ),
        openai.ChatMessage.user(question),
        openai.ChatMessage.fn({
          fnName: "getInformation",
          content: JSON.stringify(information),
        }),
      ],
    });

    // stream the answer to the terminal:
    process.stdout.write("\nAI : ");
    for await (const textPart of textStream) {
      process.stdout.write(textPart);
    }
    process.stdout.write("\n\n");
  }
}

main();