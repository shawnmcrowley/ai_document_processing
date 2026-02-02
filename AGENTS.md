# AI Document Processing - Agent Guidelines

## Build Commands

```bash
# Development (with Turbopack)
npm run dev

# Development with proxy
npm run dev:proxy

# Production build
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## Testing

**No test framework is currently configured.** To add tests:
- Install Jest/Vitest with: `npm install --save-dev jest @testing-library/react @testing-library/jest-dom`
- Run tests: `npm test`
- Run single test: `npm test -- path/to/test.js`

## Project Structure

```
src/
  app/              # Next.js App Router
    api/v1/         # API routes (parse, search)
    api-docs/       # Swagger documentation
    scripts/        # CLI tools
    page.js         # Main upload/search page
  components/       # React components
    ui/            # shadcn/ui components
  lib/             # Utilities & database
public/            # Static assets
```

## Code Style Guidelines

### General
- **Language**: JavaScript (JSX), no TypeScript
- **Framework**: Next.js 16 with React 19
- **Styling**: Tailwind CSS 4 with CSS variables (oklch color space)

### Formatting
- Use double quotes for strings
- Prefer 2-space indentation (some files use 4)
- Trailing commas in multi-line objects/arrays
- No semicolons required (follow existing patterns)

### Imports
- Use path aliases from `jsconfig.json`:
  - `@/components/*` for components
  - `@/lib/*` for utilities
  - `@/app/*` for app code
- Group imports: React/Next first, then libraries, then local imports
- Example: `import { cn } from "@/lib/utils"`

### Component Conventions
- **Client components**: Add `"use client"` at top
- **Server components**: Default (no directive needed)
- **Naming**: PascalCase for components (e.g., `FileUploader.js`)
- **shadcn/ui**: Use `cva` for variants, `cn()` for class merging
- Place UI components in `src/components/ui/`

### API Routes
- Use JSDoc Swagger comments for API documentation
- Export `maxDuration` and `dynamic` config when needed
- Return `NextResponse.json()` for responses
- Error format: `{ error: message }` with appropriate status

### Error Handling
- Use try/catch blocks for async operations
- Log errors with context: `console.error('Context:', err)`
- Return user-friendly error messages in API responses
- Validate inputs before processing

### Naming Conventions
- **Components**: PascalCase (e.g., `FileUploader`)
- **Functions**: camelCase (e.g., `handleFileChange`)
- **Constants**: UPPER_SNAKE_CASE for true constants
- **Database**: Use SQL in backticks, name queries descriptively
- **Files**: Match component name (e.g., `button.jsx`)

### Database
- Use parameterized queries: `db.query(sql, [params])`
- Batch inserts in transactions when possible
- Use pgvector format: `'[' + arr.join(',') + ']'`

### Environment
- Store secrets in `.env.local` (never commit)
- Required vars: `DATABASE_URL`, `OLLAMA_HOST`

### External Dependencies
- **Ollama**: Local LLM for embeddings (mxbai-embed-large:335m)
- **PostgreSQL**: With pgvector extension for vectors
- **pdf-parse**: For PDF text extraction

## Key Libraries

- Next.js 16 + React 19
- Tailwind CSS 4 + shadcn/ui
- Radix UI primitives
- class-variance-authority (cva)
- lucide-react (icons)
- ollama (embeddings)
- pg (PostgreSQL)

## Documentation

- API docs at `/api-docs` (Swagger UI)
- JSDoc comments required for all API endpoints
- Include request/response schemas in Swagger comments
