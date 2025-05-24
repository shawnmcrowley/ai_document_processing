# Document Processing Application Development Plan

## Project Overview

This project aims to build a robust document processing application with the following core features:

- **UI for Uploading Documents**: Support uploading both files and folders in PDF, DOC, PPT, MD, and XLS formats.
- **Text Processing & Chunking**: Extract and process text from uploaded documents, then generate text chunks for further analysis.
- **Embeddings & Vector Database**: Create embeddings for text chunks using a local instance of `snowflake-arctic-embed` and store them in a vector database.
- **Semantic Search**: Provide a UI-based search function to find similarity matches in the vector database and display relevant text content based on scoring.
- **Document Metadata**: Display an icon in the UI to show metadata for each document (e.g., file type, size, upload date).

## Development Roadmap

1. **UI Development**
    - Design and implement a modern, user-friendly interface for uploading files and folders.
    - Support drag-and-drop and file picker for multiple formats (PDF, DOC, PPT, MD, XLS).
    - Display upload progress and handle errors gracefully.

2. **Backend Processing**
    - Implement file parsing and text extraction for all supported formats.
    - Develop chunking logic to split extracted text into manageable segments.

3. **Embeddings & Vector Database Integration**
    - Integrate with local `snowflake-arctic-embed` for generating embeddings.
    - Store embeddings and associated metadata in a vector database (e.g., Pinecone, Qdrant, or similar).

4. **Search Functionality**
    - Build a semantic search UI to query the vector database.
    - Display search results with relevance scores and highlight matching text.

5. **Metadata Display**
    - Add icons or buttons in the UI to view document metadata.
    - Show details such as file type, size, upload date, and processing status.

6. **Testing & Optimization**
    - Write unit and integration tests for all major components.
    - Optimize performance for large files and batch uploads.

## Future Enhancements

- Support for additional file formats.
- User authentication and access control.
- Advanced analytics and reporting on document content.

---
## Notes

    Modify pdf-parse/index.js:
    Open the file node_modules/pdf-parse/index.js.
    Change line 6 (or the line containing isDebugMode) from let isDebugMode = ! module.parent; to let isDebugMode = false;.

    Clear cache (if needed):
    If you're using a framework like Next.js, delete the cache folder .next/cache. 
