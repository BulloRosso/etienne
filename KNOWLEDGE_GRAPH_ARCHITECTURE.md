# Knowledge Graph Architecture

## Entity Deduplication and Document Linking

### Overview

When you upload markdown content to the Knowledge Base, the system performs the following operations:

1. **Entity Extraction** - Uses OpenAI GPT-4.1-mini to extract entities (Person, Company, Product)
2. **Entity Deduplication** - Checks if entities already exist before creating duplicates
3. **Document Entity Creation** - Creates a Document entity to represent the uploaded content
4. **Relationship Linking** - Links the Document to all extracted entities

---

## How Entity Deduplication Works

### ID Generation

Entities are assigned consistent IDs based on their normalized names:

```typescript
generateId(type: string, name: string): string {
  // "John Doe" -> "john-doe"
  // "Tech Corp" -> "tech-corp"
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized;
}
```

**Examples:**
- Person: "Dr. Jane Smith" → ID: `jane-smith`
- Company: "Tech Corp." → ID: `tech-corp`
- Product: "AI Research Platform" → ID: `ai-research-platform`

### Duplicate Detection

Before adding an entity, the system checks if it already exists:

```typescript
async entityExists(project: string, entityType: string, entityId: string): Promise<boolean> {
  // Query: Does entity with this URI exist?
  const entityUri = `http://example.org/kg/${entityType}/${entityId}`;

  // Check if any triples exist with this entity as subject
  const response = await quadstore.match({
    subject: entityUri,
    predicate: 'rdf:type',
    object: null
  });

  return response.results.length > 0;
}
```

**What happens when you upload the same content multiple times:**

1. **First Upload:**
   - Entity "John Doe" → Created with ID `john-doe`
   - Entity "Tech Corp" → Created with ID `tech-corp`
   - Document `doc-1234567890` → Created
   - Relationships: `doc-1234567890 --contains--> john-doe`, `doc-1234567890 --contains--> tech-corp`

2. **Second Upload (same content):**
   - Entity "John Doe" → **Skipped** (already exists)
   - Entity "Tech Corp" → **Skipped** (already exists)
   - Document `doc-1234567891` → Created (new document)
   - Relationships: `doc-1234567891 --contains--> john-doe`, `doc-1234567891 --contains--> tech-corp`

**Result:** Entities are reused across documents, preventing duplication.

---

## Document Entity and Linking

### Document Entity Structure

Each uploaded markdown creates a Document entity:

```json
{
  "id": "doc-1234567890",
  "type": "Document",
  "properties": {
    "content": "First 500 characters as preview...",
    "uploadedAt": "2025-11-10T12:34:56.789Z",
    "entityCount": 5,
    "fullContentLength": 1234
  }
}
```

### RDF Triples Created

For a document containing "John Doe" (Person) and "Tech Corp" (Company):

```sparql
# Document entity
<http://example.org/kg/Document/doc-1234567890> rdf:type <http://example.org/kg/Document> .
<http://example.org/kg/Document/doc-1234567890> kg:content "First 500 chars..." .
<http://example.org/kg/Document/doc-1234567890> kg:uploadedAt "2025-11-10T12:34:56.789Z" .
<http://example.org/kg/Document/doc-1234567890> kg:entityCount "5" .

# Person entity (if not exists)
<http://example.org/kg/Person/john-doe> rdf:type <http://example.org/kg/Person> .
<http://example.org/kg/Person/john-doe> kg:name "John Doe" .

# Company entity (if not exists)
<http://example.org/kg/Company/tech-corp> rdf:type <http://example.org/kg/Company> .
<http://example.org/kg/Company/tech-corp> kg:name "Tech Corp" .

# Document -> Entity relationships
<http://example.org/kg/Document/doc-1234567890> kg:contains <http://example.org/kg/Person/john-doe> .
<http://example.org/kg/Document/doc-1234567890> kg:contains <http://example.org/kg/Company/tech-corp> .
```

---

## Vector Store and Knowledge Graph Connection

### Current Implementation

The uploaded content is stored in **two separate systems**:

1. **Vector Store** (hnswsqlite)
   - Stores document content as embeddings
   - Used for semantic search
   - Location: `workspace/<project>/vector-store/`

2. **Knowledge Graph** (Quadstore)
   - Stores entities and relationships as RDF triples
   - Used for structured queries
   - Location: `workspace/<project>/knowledge-graph/`

### Linking Vector Store to Knowledge Graph

The Document entity created in the knowledge graph has the **same ID** as the document stored in the vector store:

```typescript
// In KnowledgeGraphBrowser.jsx
const docId = `doc-${Date.now()}`;

// 1. Vector Store Document
await fetch('/api/knowledge-graph/${project}/documents', {
  body: JSON.stringify({
    id: docId,  // Same ID
    content: markdownContent,
    metadata: { ... }
  })
});

// 2. Knowledge Graph Document Entity
const documentEntity = {
  id: docId,  // Same ID
  type: 'Document',
  properties: { ... }
};
```

This allows you to:
- **Query by entity** in knowledge graph → Find related document IDs
- **Retrieve document content** from vector store using the ID
- **Cross-reference** between semantic search results and structured relationships

---

## Example Queries

### Find all documents containing a specific person

```sparql
PREFIX kg: <http://example.org/kg/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT ?document ?content WHERE {
  ?document rdf:type kg:Document .
  ?document kg:contains ?person .
  ?person kg:name "John Doe" .
  ?document kg:content ?content .
}
```

### Find all entities in a document

```sparql
PREFIX kg: <http://example.org/kg/>

SELECT ?entityType ?entityName WHERE {
  <http://example.org/kg/Document/doc-1234567890> kg:contains ?entity .
  ?entity rdf:type ?entityType .
  ?entity kg:name ?entityName .
}
```

### Count documents per entity (co-occurrence analysis)

```sparql
PREFIX kg: <http://example.org/kg/>

SELECT ?entityName (COUNT(?document) as ?documentCount) WHERE {
  ?document kg:contains ?entity .
  ?entity kg:name ?entityName .
}
GROUP BY ?entityName
ORDER BY DESC(?documentCount)
```

---

## Upload Flow Summary

```
User uploads markdown
    ↓
OpenAI extracts entities (Person, Company, Product)
    ↓
For each entity:
    Check if exists? → Yes: Skip, No: Create
    ↓
Create Document entity (always new)
    ↓
Link Document → contains → Entity (all entities)
    ↓
Store in Vector Store (for semantic search)
    ↓
Return statistics:
    - totalEntities: 10
    - entitiesAdded: 5 (new)
    - entitiesSkipped: 5 (duplicates)
    - documentId: "doc-1234567890"
```

---

## Benefits

1. **No Entity Duplication**: "John Doe" mentioned in 10 documents = 1 entity + 10 relationships
2. **Document Tracking**: Every upload creates a Document entity with metadata
3. **Cross-Document Analysis**: Query which documents mention the same entities
4. **Efficient Storage**: Entities stored once, referenced many times
5. **Hybrid Search**: Combine vector search (semantic) with graph queries (structured)

---

## Technical Implementation

### Key Files

- **[graph-builder.service.ts](backend/src/knowledge-graph/graph-builder.service.ts)**: Entity deduplication logic
- **[search.service.ts](backend/src/knowledge-graph/search/search.service.ts)**: Document creation and linking
- **[KnowledgeGraphBrowser.jsx](frontend/src/components/KnowledgeGraphBrowser.jsx)**: Upload UI

### Methods

- `entityExists()`: Check if entity already exists
- `addEntityIfNotExists()`: Add only if not duplicate
- `addEntities()`: Batch add with deduplication statistics
- `addRelationship()`: Link Document to Entity
