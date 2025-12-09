<div align="center">

# AI Document Processing

**Intelligent document processing with semantic search and vector embeddings**

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-blue)](https://github.com/pgvector/pgvector)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[Features](#-features) •
[Getting Started](#-getting-started) •
[Database Setup](#-database-setup) •
[Usage](#-usage) •
[Contributing](#-contributing)

</div>

---

## 📋 Overview

A production-ready document processing application that combines Next.js 16, PostgreSQL with pgvector, and Ollama embeddings to provide intelligent semantic search across your documents. Upload PDFs, extract text, generate embeddings, and query your documents using natural language.

## ✨ Features

- 📄 **Multi-Format Support** - PDF document processing
- 🧠 **Semantic Search** - Vector-based similarity search using OpenAI embeddings
- 📊 **PostgreSQL + pgvector** - Scalable vector database with IVFFlat indexing
- 🖥️ **Modern UI** - Drag-and-drop file upload with real-time progress
- 📝 **Text Chunking** - Intelligent document segmentation for optimal retrieval
- 🔍 **CLI Tool** - Interactive command-line interface for PDF chat
- ⚡ **No External Dependencies** - Pure fetch API, no OpenAI SDK required
- 💾 **Metadata Tracking** - Document metadata with timestamps and file info

## 🚀 Getting Started

### Prerequisites

- Node.js 18.17 or later
- PostgreSQL 14+ with pgvector extension
- OpenAI API key

### Installation

```bash
# Clone the repository
git clone https://github.com/shawnmcrowley/ai_document_processing.git

# Navigate to project directory
cd ai_document_processing

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## 🗄️ Database Setup

### 1. Install pgvector Extension

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Create Document Chunks Table and Index

```sql
-- Table: public.document_chunks

-- DROP TABLE IF EXISTS public.document_chunks;

CREATE TABLE IF NOT EXISTS public.document_chunks
(
    id integer NOT NULL DEFAULT nextval('document_chunks_id_seq'::regclass),
    document_id integer,
    chunk_index integer NOT NULL,
    content text COLLATE pg_catalog."default" NOT NULL,
    embedding vector(1024) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT document_chunks_pkey PRIMARY KEY (id),
    CONSTRAINT document_chunks_document_id_fkey FOREIGN KEY (document_id)
        REFERENCES public.documents (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.document_chunks
    OWNER to postgres;
-- Index: idx_document_chunks_embedding

-- DROP INDEX IF EXISTS public.idx_document_chunks_embedding;

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
    ON public.document_chunks USING ivfflat
    (embedding vector_cosine_ops)
    WITH (lists=100)
    TABLESPACE pg_default;
```

### 3. Create Documents Table and Index

```sql
-- Table: public.documents

-- DROP TABLE IF EXISTS public.documents;

CREATE TABLE IF NOT EXISTS public.documents
(
    id integer NOT NULL DEFAULT nextval('documents_id_seq'::regclass),
    filename text COLLATE pg_catalog."default" NOT NULL,
    content text COLLATE pg_catalog."default" NOT NULL,
    metadata jsonb NOT NULL,
    embedding vector(1024),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT documents_pkey PRIMARY KEY (id)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.documents
    OWNER to postgres;
-- Index: idx_documents_embedding

-- DROP INDEX IF EXISTS public.idx_documents_embedding;

CREATE INDEX IF NOT EXISTS idx_documents_embedding
    ON public.documents USING ivfflat
    (embedding vector_cosine_ops)
    WITH (lists=100)
    TABLESPACE pg_default;
```

## 🔧 Configuration

### Environment Variables

Create `.env.local` in the project root:

```env
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

### PDF Parse Fix

If you encounter issues with pdf-parse:

1. Open `node_modules/pdf-parse/index.js`
2. Change line 6: `let isDebugMode = ! module.parent;` to `let isDebugMode = false;`
3. Clear Next.js cache: `rm -rf .next/cache`

## 🎯 Usage

### Web Interface

1. Upload documents via drag-and-drop or file picker
2. Documents are automatically processed and chunked
3. Use the search interface to query documents semantically
4. View results with similarity scores and metadata

### CLI Tool

```bash
node src/app/scripts/index.js -f document.pdf
```

Interactive chat session:
```
You: What is this document about?
AI: [Streams response based on document content]
```

## 🚀 Deployment

### Building for Production

```bash
npm run build
npm start
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Next.js team for the amazing framework
- PostgreSQL and pgvector for vector database capabilities
- Ollama for embeddings and chat completions
- Snowflake for Arctic Embed model

## 📧 Contact

[Creator - Shawn M. Crowley](mailto:shawn.crowley@lycra.com)

Project Link: [https://github.com/shawnmcrowley/ai_document_processing](https://github.com/shawnmcrowley/ai_document_processing)

---

<div align="center">
Made with ❤️ using Next.js 16 and PostgreSQL
</div> 
