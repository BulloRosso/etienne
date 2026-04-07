---
name: document-search
description: Index and search documents using semantic search (RAG). Automatically indexes files in the project's documents/ folder and enables natural language document retrieval.
---

# Document Search (RAG)

This skill enables semantic document search using Retrieval-Augmented Generation (RAG). Documents are chunked, embedded, and stored in a vector database for fast natural language retrieval.

## Three Document Libraries

Documents are organized into **libraries** (scopes) that control where content is indexed and searched:

### Project Library (default)
- **Scope**: `project_<project_name>` (e.g., `project_my-app`)
- **What**: Documents specific to a single project
- **Where**: Files in `documents/` folder are auto-indexed here
- **Use when**: "Search my project docs", "Find the architecture document"

### Global Library
- **Scope**: `global`
- **What**: Knowledge shared across all projects
- **Where**: Manually indexed from any project
- **Use when**: "Search across all projects", "Find any document about compliance"

### Domain Library
- **Scope**: `domain_<name>` (e.g., `domain_legal`, `domain_engineering`)
- **What**: Topic-specific collections that span projects
- **Where**: Manually indexed by topic
- **Use when**: "Search all legal documents", "Find engineering specs across projects"

## When to Activate This Skill

Trigger this skill when the user:
- Asks to search or find documents: "I'm looking for a document about...", "Find the report on...", "Search for..."
- Asks to index or learn a document: "Index this file", "Add this to the knowledge base"
- Places files in the `documents/` directory (auto-indexed via event rule)
- Asks about cross-project or domain-specific searches

## Available MCP Tools

### `rag_index_document`
Index a file for semantic search. Supports PDF, Word, Excel, PowerPoint, and text/markdown files.

```
scope_name: "project_<name>" | "global" | "domain_<name>"
document_path: "documents/report.pdf"  (relative to project root)
```

### `rag_index_text`
Index a short text snippet (up to 2000 characters). Use for notes, extracted content, or quick knowledge capture.

```
scope_name: "project_<name>" | "global" | "domain_<name>"
text_part: "The authentication system uses JWT tokens with..."
```

### `rag_index_search`
Search indexed documents using natural language. Returns the top matching chunks with similarity scores.

```
scope_name: "project_<name>" | "global" | "domain_<name>"
search_query: "How does authentication work?"
```

## Automatic Document Indexing

When this skill is provisioned, an event rule is created that watches for new files in the `documents/` directory. When a file is added:

1. The file watcher detects the new file
2. The event rule triggers the `rag_index_document` tool
3. The document is automatically indexed into the project library

**Supported file formats for auto-indexing:**
- Text: `.md`, `.txt`, `.csv`, `.tsv`, `.json`, `.yaml`, `.xml`
- PDF: `.pdf` (including scanned PDFs with OCR)
- Office: `.docx`, `.xlsx`, `.pptx`, `.doc`, `.xls`, `.ppt`, `.odt`, `.ods`, `.odp`

## Workflow

### Indexing a document manually
```
User: "Index the file documents/architecture.pdf"
Agent: Calls rag_index_document with scope_name="project_<current_project>" 
       and document_path="documents/architecture.pdf"
Agent: "Indexed architecture.pdf — 12 chunks stored in your project library."
```

### Searching for documents
```
User: "I'm looking for a document about the authentication flow"
Agent: Calls rag_index_search with scope_name="project_<current_project>"
       and search_query="authentication flow"
Agent: "Found 3 relevant documents: ..."
```

### Cross-project search
```
User: "Search across all projects for compliance guidelines"
Agent: Calls rag_index_search with scope_name="global"
       and search_query="compliance guidelines"
```

### Domain-specific indexing
```
User: "Add this legal document to the legal domain library"
Agent: Calls rag_index_document with scope_name="domain_legal"
       and document_path="documents/terms-of-service.pdf"
```

## File & Folder Conventions

- Place documents to index in `workspace/<project>/documents/`
- Subdirectories within `documents/` are supported
- Binary files (PDF, Office) are automatically parsed to text using liteparse
- Text files are read directly
