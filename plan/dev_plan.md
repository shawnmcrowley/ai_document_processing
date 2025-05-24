# Development Plan

## Project Foundation
- [X] **Framework**: Use Next.js 15 as the core framework for the application.
- [X] **Project Structure**:
  - [X] `api/` — for backend API routes and logic.
  - [X] `components/` — for reusable React UI components.
  - [X] `scripts/` — for command-line and utility scripts.
- [X] **Version Control**: Integrate the project with a Git repository for source control and collaboration.
- [X] **Environment Configuration**:
  - [X] Add a `.env.local` file to manage environment variables securely.
  - [X] Add `OPENAPI_KEY` to `.env.local` for API authentication and integration.
  - [X] Update `DOCKERCOMPOSE` with services for Postgres and PgAdmin 
  - [X] Configure `OLLAMA` models in LLM, specifically llama3.2 and snowflake-arctic-embed2
  - [X] Configure tables, vector extension and indexes in `Postgres` database and validate PgAdmin is working

## Development Workflow
1. **Command-Line Scripts First**
   - [X] Develop and test command-line scripts in the `scripts/` folder.
   - [X] Use ModelFusion project dependencies for document processing, embeddings, and vector database integration.
   - [X] Test all scripts using Node.js at the command line before integrating with the UI or API.
   - [X] Modify scripts using Node.js at the command line to use pdf-parse instead of pdf-dist, dist is better for PDF Display, parse is better to extracting text on the server

2. **API Layer**
   - [ ] Build API endpoints in the `api/v1` folder to expose backend functionality to the frontend.
   - [ ] Ensure endpoints are secure and leverage environment variables for sensitive data.

3. **Component Development**
   - [ ] Create modular, reusable UI components in the `components/` folder.
   - [ ] Focus on file/folder upload, search, and metadata display components.

4. **User Interface & Integration**
   - [ ] Integrate command-line script logic into the Next.js API and UI.
   - [ ] Build out the main user interface for uploads, search, and results display.

5. **Testing & Iteration**
   - [ ] Write and run tests for scripts, API endpoints, and UI components.
   - [ ] Iterate based on feedback and test results.

## Notes
- Prioritize backend and script functionality before UI development.
- Use Git for all version control and collaboration.
- Keep sensitive keys and configuration in `.env.local` and never commit them to the repository.

---
This plan ensures a solid foundation, clear structure, and a backend-first approach for robust document processing and search capabilities.