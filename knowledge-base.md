# Knowledge Base Feature

The Knowledge Base feature provides a hybrid semantic search system combining **RDF knowledge graphs** and **vector stores** for intelligent information retrieval. It enables storing, querying, and visualizing structured knowledge extracted from documents.

## Architecture

The system consists of three microservices:

1. **Backend API** (`/backend` - NestJS on port 6060)
   - Coordinates between vector store and RDF store services
   - Handles entity extraction using OpenAI GPT-4.1-mini
   - Generates embeddings using OpenAI text-embedding-3-small
   - Provides unified REST API for knowledge graph operations

2. **Vector Store Service** (`/vector-store` - Python FastAPI on port 7100)
   - Multi-tenant ChromaDB server with project isolation
   - Each project gets dedicated ChromaDB instance: `workspace/<project>/knowledge-graph/chroma.sqlite3`
   - Uses cosine similarity for semantic search (configured via `hnsw:space: cosine`)
   - Persistent storage with HNSW indexing for fast retrieval
   - RESTful API: `/api/v1/{project}/collections/{collection}/...`

3. **RDF Store Service** (`/rdf-store` - Node.js Quadstore on port 7000)
   - Multi-tenant RDF triple store with LevelDB backend
   - Stores entities and relationships as RDF triples
   - Supports SPARQL 1.1 queries for graph traversal
   - Persistent storage: `workspace/<project>/knowledge-graph/` (LevelDB files)
   - RESTful API with SPARQL endpoint

## Entity Extraction & Storage Flow

Documents uploaded to the Knowledge Base are automatically processed:

1. **Upload** → Backend API receives markdown content
2. **Embedding Generation** → OpenAI creates vector embeddings (text-embedding-3-small)
3. **Vector Storage** → Document + embedding stored in ChromaDB via HTTP API
4. **Entity Extraction** (optional, if "Use Graph Layer" enabled):
   - OpenAI GPT-4.1-mini extracts entities using custom or default schema
   - Entities parsed from structured JSON response
5. **RDF Storage** → Entities and relationships stored as triples via Quadstore HTTP API
6. **Deduplication** → Entities deduplicated by type and ID before RDF insertion

## Customizable Schema & Prompts

Each project can customize entity extraction behavior:

**Entity Schema** (`.etienne-entity-schema.json`):
- Define entity types (e.g., Company, Employee, Technology, Product)
- Specify JSON schema for structured extraction
- Configure relationships between entity types
- Stored as RDF ontology definitions

**Extraction Prompt** (`.etienne-extraction-prompt.md`):
- Custom instructions for the AI extraction model
- Define extraction rules and guidelines
- Specify output format and entity criteria
- Fallback to default if not configured

Configuration files location:
```
workspace/<project>/knowledge-graph/
├── .etienne-entity-schema.json      # RDF ontology schema
└── .etienne-extraction-prompt.md    # Entity extraction prompt
```

## Query Capabilities

The Knowledge Base supports multiple query interfaces:

1. **Similarity Search** (Primary Interface)
   - Semantic search using ChromaDB cosine similarity
   - OpenAI embeddings for query vectorization
   - Configurable threshold filter (default: 20% minimum similarity)
   - Results sorted by similarity descending
   - Displays: Document ID, content preview, similarity score, graph layer status

2. **Natural Language Search** (Graph Layer)
   - Translates natural language to SPARQL automatically
   - Uses GPT-4 for query translation
   - Example: "Who works at which company?"

3. **SPARQL Queries** (Graph Layer)
   - Direct SPARQL query execution against Quadstore
   - Full SPARQL 1.1 specification support
   - Graph pattern matching and filtering

4. **Hybrid Search**
   - Combines vector similarity (70% weight) and graph queries (30% weight)
   - Provides comprehensive results from both systems
   - Merged and ranked by relevance score

## Data Visualization

The frontend provides an interactive graph visualization:

- **Graph Viewer**: Renders entities and relationships as interactive nodes/edges
- **Node Click**: Displays source documents containing clicked entities
- **Statistics Dashboard**: Shows entity counts, document counts, and RDF triple counts
- **Monaco Editor**: Inline SPARQL query editor with syntax highlighting

## Storage Requirements & Setup

**Services Required**:

1. **ChromaDB Vector Store** (port 7100):
   ```bash
   cd vector-store
   pip install -r requirements.txt
   python multi-tenant-chromadb.py
   ```
   - Uses ChromaDB 1.3.4+ with HNSW indexing
   - Persistent storage: `workspace/<project>/knowledge-graph/chroma.sqlite3`
   - Automatically configures cosine similarity for all collections

2. **Quadstore RDF Store** (port 7000):
   ```bash
   cd rdf-store
   npm install
   node server.js
   ```
   - Uses Quadstore with LevelDB backend
   - Persistent storage: `workspace/<project>/knowledge-graph/` (LevelDB)
   - SPARQL 1.1 query support

**External API Dependencies**:
- OpenAI API: Required for embeddings (`text-embedding-3-small`) and entity extraction (`gpt-4.1-mini`)
- Configured via `OPENAI_API_KEY` in backend `.env`

**Data Location**:
```
workspace/<project>/knowledge-graph/
├── chroma.sqlite3              # ChromaDB vector embeddings
├── CURRENT                     # LevelDB descriptor files
├── LOCK                        # LevelDB lock
├── LOG                         # LevelDB transaction log
├── MANIFEST-*                  # LevelDB manifest
└── *.ldb, *.log               # LevelDB SSTable files (RDF triples)
```

## Use Cases

- **Document Knowledge Extraction**: Upload research documents, extract entities automatically
- **Relationship Mapping**: Discover connections between people, companies, and technologies
- **Semantic Search**: Find documents by meaning, not just keywords
- **Graph Queries**: Answer complex questions requiring multi-hop reasoning
- **Custom Ontologies**: Define domain-specific entity types and relationships
