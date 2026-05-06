# Context Management / Metadata Layer

The Context Management system provides fine-grained control over which data sources Claude Code can access during task execution. By applying tags to files, vector documents, and knowledge graph entities, you can create named contexts that scope the agent's view to only relevant information.

## Why Use Context Management?

- **Reduce Token Costs**: Limit Claude's filesystem and knowledge base access to only relevant files/data
- **Improve Response Quality**: Focus the agent on specific domains or project areas
- **Multi-tenant Isolation**: Separate customer data, departments, or project phases
- **Privacy & Security**: Exclude sensitive files or documents from specific sessions

## Filesystem Context

**a) Why to use?**

When working on large projects with hundreds of files, filesystem contexts allow you to tag files by domain (e.g., `frontend`, `backend`, `docs`) and create contexts that include/exclude specific tags. This prevents Claude from reading irrelevant files and reduces token consumption.

**b) How to apply in the UI**

1. Navigate to the **Filesystem** panel
2. Right-click any file or folder to open the context menu
3. Select **"Manage Tags"** to add tags like `api`, `frontend`, `tests`, etc.
4. Open **Project Menu → Context/Tagging** (or click the tag icon in the app bar)
5. Create a new context with:
   - **Include files with tags**: Select tags like `frontend`, `ui`
   - **Exclude files with tags**: Select tags like `tests`, `legacy`
6. Switch to the created context using the **Context Switcher** in the app bar

**c) How it affects the agent's data access internally**

When a context is active for a session, the backend filters the filesystem tree returned to Claude Code based on tag rules:
- Files with matching include tags are shown
- Files with exclude tags are hidden, even if they match include tags
- The agent can only read, edit, or reference files within the scoped view
- API endpoint: `GET /api/workspace/:project/contexts/:contextId/scope` returns filtered file paths

## Vector Store Context

**a) Why to use?**

Vector stores contain embedded documents for semantic search. By tagging documents (e.g., `product-docs`, `customer-feedback`, `internal-wiki`), you can create contexts that limit which document collections Claude can search through, improving search relevance and reducing API costs.

**b) How to apply in the UI**

1. When uploading documents to the **Knowledge Graph Browser**, add tags during upload
2. Alternatively, tag existing documents via the document management interface
3. Open **Project Menu → Context/Tagging**
4. Create a new context and configure:
   - **Vector document tags**: Select tags like `product-docs`, `api-specs`
5. Activate the context using the **Context Switcher**

**c) How it affects the agent's data access internally**

When a context with vector tag filters is active:
- Semantic search queries are restricted to documents matching the specified tags
- The vector store filters results by metadata tags before computing similarity scores
- Only matching documents contribute to the agent's knowledge retrieval
- ChromaDB metadata filter: `where: { "tags": { "$in": ["selected-tag"] } }`

## Knowledge Graph Context

**a) Why to use?**

Knowledge graphs store structured entities (People, Companies, Products) and relationships extracted from documents. Contexts allow you to scope queries to specific entity types or tagged subgraphs, enabling domain-specific reasoning while excluding unrelated data.

**b) How to apply in the UI**

1. Ensure entities are tagged during ingestion (e.g., `project-alpha`, `Q4-2024`)
2. Open **Project Menu → Context/Tagging**
3. Create a new context and configure:
   - **Entity tags**: Select tags like `project-alpha`, `customer-facing`
   - **Entity types**: Select types like `Person`, `Company`, `Product`
4. Activate the context via the **Context Switcher**

**c) How it affects the agent's data access internally**

When a knowledge graph context is active:
- SPARQL queries are automatically filtered by entity type and tag predicates
- Only entities matching the context's type/tag filters are returned
- Relationship traversal is limited to entities within scope
- Example SPARQL filter: `?entity rdf:type <Company> . ?entity etienne:hasTag "project-alpha"`
- Natural language to SPARQL translation includes context filters automatically

### Session-Level Context Switching

Each chat session maintains its own active context independently. This enables:
- **Multi-user scenarios**: Different users working on the same project with different data scopes
- **Task isolation**: Switch contexts mid-conversation without affecting other sessions
- **Context comparison**: Run the same query in different contexts to compare results

The active context is stored in session metadata (`GET /api/sessions/:project/:sessionId/context`) and applied automatically to all data access operations during that session.
