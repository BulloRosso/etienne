# Knowledge Graph Integration Test

This test demonstrates the complete integration of the knowledge-graph module into the claude-multitenant application.

## Overview

The knowledge graph integration combines:
- **Vector Search**: Semantic search using OpenAI embeddings
- **Knowledge Graph (RDF)**: Structured entity/relationship queries using Quadstore
- **Natural Language Queries**: AI-powered translation of questions to SPARQL

## Test Scenario

The test imports a scientific article about **Electric Vehicle Component Inventors** which includes:
- 4 inventors (Person entities)
- 4 companies (Firma entities)
- 4 EV components (Produkt entities)
- Relationships: employment, invention, manufacturing

## Running the Test

### Prerequisites

1. **Start the backend server**:
   ```bash
   cd backend
   npm run dev
   ```

2. **Ensure OpenAI API key is configured** in your environment variables or backend configuration.

### Execute the Test

```bash
cd tests/knowledge-graph
node test-knowledge-graph.js
```

## Test Flow

1. **Import Phase**:
   - Creates Person entities (Dr. Sarah Chen, Michael Rodriguez, Dr. Yuki Tanaka, Emily Watson)
   - Creates Firma entities (TechVolt Industries, PowerDrive Motors, GreenTech Solutions, ChargeTech Inc.)
   - Creates Produkt entities (Battery Management System, Motor Controller, Regenerative Brake, Charging Port)
   - Establishes relationships (employment, invention, manufacturing)
   - Creates document with embeddings for vector search

2. **Query Phase**:
   - Natural language query: "Who built the Battery Management System?"
   - Natural language query: "Who invented components in the electric vehicles category?"
   - Natural language query: "What companies manufacture EV components?"

3. **Results**:
   - Shows generated SPARQL queries
   - Displays knowledge graph results (RDF triples)
   - Shows vector search results with similarity scores

## Example Queries

### Natural Language Queries

```javascript
"Who built the Battery Management System?"
"Who invented components in the electric vehicles category?"
"What companies manufacture EV components?"
"Who works at TechVolt Industries?"
```

### Direct SPARQL Queries

You can also query directly via the API:

```sparql
PREFIX kg: <http://example.org/kg/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

# Find all inventors and their inventions
SELECT ?person ?name ?product ?productName WHERE {
  ?person rdf:type kg:Person .
  ?person kg:name ?name .
  ?person kg:hatErfunden ?product .
  ?product kg:name ?productName .
}

# Find all companies and their employees
SELECT ?firma ?firmaName ?person ?personName WHERE {
  ?firma rdf:type kg:Firma .
  ?firma kg:name ?firmaName .
  ?person kg:istAngestelltBei ?firma .
  ?person kg:name ?personName .
}
```

## Frontend Usage

After running the test, you can browse the knowledge graph via the UI:

1. Open the application in your browser
2. Select a project
3. Click the menu icon (☰)
4. Select **"Knowledge Base"**
5. Use the two tabs:
   - **Natural Language**: Ask questions in plain English
   - **SPARQL**: Write and execute SPARQL queries directly

## API Endpoints

The knowledge graph module exposes the following endpoints:

### Entities
- `POST /api/knowledge-graph/entities` - Create entity
- `GET /api/knowledge-graph/entities/:id` - Get entity
- `GET /api/knowledge-graph/entities?type=Person` - Get entities by type
- `DELETE /api/knowledge-graph/entities/:id` - Delete entity

### Relationships
- `POST /api/knowledge-graph/relationships` - Create relationship
- `GET /api/knowledge-graph/entities/:id/relationships` - Get entity relationships

### Documents
- `POST /api/knowledge-graph/documents` - Create document with embeddings

### Search
- `POST /api/knowledge-graph/search/hybrid` - Hybrid search (vector + KG)
- `POST /api/knowledge-graph/search/vector` - Vector-only search
- `POST /api/knowledge-graph/search/sparql` - Execute SPARQL query
- `POST /api/knowledge-graph/translate/sparql` - Translate natural language to SPARQL

### System
- `GET /api/knowledge-graph/stats` - Get statistics

## Data Schema

### Entity Types

**Person**
- name: string
- email: string
- phone: string

**Firma** (Company)
- name: string
- industry: string
- location: string

**Produkt** (Product)
- name: string
- description: string
- category: string

### Relationship Types

- `istAngestelltBei` - Person → Firma (is employed at)
- `stelltHer` - Firma → Produkt (manufactures)
- `hatErfunden` - Person → Produkt (invented)
- `arbeitetMit` - Person → Person (works with)
- `hatKunde` - Firma → Firma (has customer)

## Data Storage

The knowledge graph data is stored in:

```
workspace/
  data/
    knowledge-graph/   # LevelDB storage for RDF triples
    vectors.db         # SQLite storage for embeddings (mock implementation)
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend UI                           │
│  (KnowledgeGraphBrowser component with tabs)            │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│              Search Controller                           │
│         (REST API endpoints)                            │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│              Search Service                              │
│  (Orchestrates vector store + knowledge graph)          │
└───────┬─────────────────────────┬───────────────────────┘
        │                         │
        ▼                         ▼
┌──────────────────┐    ┌──────────────────────┐
│  Vector Store    │    │  Knowledge Graph     │
│  Service         │    │  Service             │
│  (Embeddings)    │    │  (RDF/SPARQL)        │
└──────────────────┘    └──────────────────────┘
        │                         │
        ▼                         ▼
┌──────────────────┐    ┌──────────────────────┐
│  Mock Vector DB  │    │  Quadstore           │
│  (In-memory)     │    │  (LevelDB)           │
└──────────────────┘    └──────────────────────┘
```

## Notes

- The vector store currently uses a mock in-memory implementation since hnswsqlite requires native compilation
- For production use, you should implement a proper vector database (e.g., Pinecone, Weaviate, or compile hnswsqlite with proper build tools)
- OpenAI API key is required for embeddings and SPARQL translation
- The test data persists in the `workspace/data/` directory

## Troubleshooting

**Issue**: OpenAI API errors
- **Solution**: Ensure `OPENAI_API_KEY` environment variable is set

**Issue**: SPARQL queries fail
- **Solution**: Check the backend logs for detailed error messages. The system will fall back to simple entity search.

**Issue**: No results returned
- **Solution**: Run the test script first to populate the knowledge graph with sample data

## Future Enhancements

- Add D3.js graph visualization in the frontend
- Implement proper vector database (when native compilation is available)
- Add more entity types and relationships
- Implement graph algorithms (shortest path, centrality metrics)
- Add real-time updates via WebSockets
- Implement caching layer for frequently accessed queries
