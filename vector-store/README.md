# Multi-Tenant ChromaDB Server

A FastAPI-based multi-tenant ChromaDB server that supports dynamic project workspaces without requiring server restarts.

## Features

- **Multi-tenant architecture**: Each project gets its own isolated ChromaDB instance
- **Dynamic project creation**: New projects are created automatically when first accessed
- **Configurable directory structure**: `workspace/{project_name}/knowledge-graph/`
- **Full ChromaDB API compatibility**: Supports all standard ChromaDB operations
- **RESTful API**: Easy to integrate with any application
- **No server restarts required**: Projects can be added/removed dynamically

## Directory Structure

```
workspace/
├── project-alpha/
│   └── knowledge-graph/
│       ├── chroma.sqlite3
│       ├── index/
│       └── ...
├── project-beta/
│   └── knowledge-graph/
│       ├── chroma.sqlite3
│       ├── index/
│       └── ...
└── my-ai-app/
    └── knowledge-graph/
        ├── chroma.sqlite3
        ├── index/
        └── ...
```

## Quick Start

### 1. Installation

```bash
# Install dependencies
pip install fastapi uvicorn chromadb requests numpy sentence-transformers

# Or use requirements file
pip install -r multi_tenant_requirements.txt
```

### 2. Start the Server

```bash
# Using the startup script
./start_multi_tenant.sh

# Or directly
python multi_tenant_chromadb.py
```

### 3. Test the Server

```bash
# Test with client
python multi_tenant_client.py

# Or test with curl
curl http://localhost:7100/api/v1/heartbeat
```

## API Endpoints

### Server-Level Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Server information |
| GET | `/api/v1/heartbeat` | Health check |
| GET | `/api/v1/version` | ChromaDB version |
| GET | `/api/v1/projects` | List all projects |

### Project-Level Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/{project}/collections` | List collections in project |
| POST | `/api/v1/{project}/collections` | Create collection in project |
| GET | `/api/v1/{project}/collections/{collection}` | Get collection info |
| DELETE | `/api/v1/{project}/collections/{collection}` | Delete collection |

### Collection Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/{project}/collections/{collection}/add` | Add documents |
| POST | `/api/v1/{project}/collections/{collection}/query` | Query collection |
| GET | `/api/v1/{project}/collections/{collection}/get` | Get documents |

## Configuration

### Environment Variables

```bash
# Base directory for workspaces
WORKSPACE_DIR=./workspace

# Subdirectory for ChromaDB data
KNOWLEDGE_GRAPH_SUBDIR=knowledge-graph

# Server settings
CHROMA_HOST=0.0.0.0
CHROMA_PORT=7100

# CORS settings
CORS_ORIGINS=["*"]
```

### Using .env File

Create a `.env` file with your configuration:

```env
WORKSPACE_DIR=./workspace
KNOWLEDGE_GRAPH_SUBDIR=knowledge-graph
CHROMA_HOST=0.0.0.0
CHROMA_PORT=7100
```

## Usage Examples

### Basic Client Usage

```python
from multi_tenant_client import MultiTenantChromaClient

# Initialize client
client = MultiTenantChromaClient(host="localhost", port=7100)

# Create collection in project
client.create_collection(
    name="my_collection",
    metadata={"description": "My documents"},
    project_name="my_project"
)

# Add documents
client.add(
    collection_name="my_collection",
    documents=["Document 1", "Document 2"],
    embeddings=[[0.1, 0.2, ...], [0.3, 0.4, ...]],
    ids=["doc1", "doc2"],
    project_name="my_project"
)

# Query documents
results = client.query(
    collection_name="my_collection",
    query_embeddings=[[0.1, 0.2, ...]],
    n_results=5,
    project_name="my_project"
)
```

### Using ProjectCollection Helper

```python
from multi_tenant_client import ProjectCollection

# Create helper instance
collection = ProjectCollection(client, "my_project", "my_collection")

# Simplified operations
collection.add(documents=["New document"], embeddings=[[0.5, 0.6, ...]], ids=["doc3"])
results = collection.query(query_embeddings=[[0.1, 0.2, ...]], n_results=3)
count = collection.count()
```

### HTTP API Examples

```bash
# Create collection
curl -X POST http://localhost:7100/api/v1/my-project/collections \
  -H "Content-Type: application/json" \
  -d '{"name": "test_collection", "metadata": {"type": "demo"}}'

# Add documents
curl -X POST http://localhost:7100/api/v1/my-project/collections/test_collection/add \
  -H "Content-Type: application/json" \
  -d '{
    "documents": ["Hello world", "ChromaDB is great"],
    "embeddings": [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
    "ids": ["doc1", "doc2"]
  }'

# Query documents
curl -X POST http://localhost:7100/api/v1/my-project/collections/test_collection/query \
  -H "Content-Type: application/json" \
  -d '{
    "query_embeddings": [[0.1, 0.2, 0.3]],
    "n_results": 2
  }'
```

## Advanced Features

### Metadata Filtering

```python
# Query with metadata filters
results = client.query(
    collection_name="my_collection",
    query_embeddings=[[0.1, 0.2, ...]],
    where={"category": "technology", "difficulty": "beginner"},
    n_results=5,
    project_name="my_project"
)
```

### Real Embeddings with Sentence Transformers

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('all-MiniLM-L6-v2')

documents = ["Text to embed", "Another document"]
embeddings = model.encode(documents).tolist()

client.add(
    collection_name="semantic_collection",
    documents=documents,
    embeddings=embeddings,
    ids=["emb1", "emb2"],
    project_name="semantic_project"
)
```

## Security Considerations

### Production Deployment

1. **CORS Configuration**: Don't use `["*"]` in production
2. **Authentication**: Add API key or JWT authentication
3. **HTTPS**: Use reverse proxy with SSL termination
4. **Input Validation**: Additional validation for production use
5. **Rate Limiting**: Add rate limiting for API endpoints

### Example Nginx Configuration

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://127.0.0.1:7100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Monitoring and Maintenance

### Health Checks

```python
# Simple health check
response = requests.get("http://localhost:7100/api/v1/heartbeat")
assert response.json()["status"] == "ok"
```

### Backup Strategy

```bash
# Backup entire workspace
tar -czf backup_$(date +%Y%m%d).tar.gz workspace/

# Backup specific project
tar -czf project_backup_$(date +%Y%m%d).tar.gz workspace/my-project/
```

### Log Monitoring

The server provides structured logging. Key log messages:
- Project client creation
- Collection operations
- Error conditions
- Performance metrics

## Troubleshooting

### Common Issues

1. **Port already in use**: Check with `lsof -i :7100` and kill the process
2. **Permission denied**: Ensure write access to workspace directory
3. **Import errors**: Install missing dependencies with pip
4. **Memory issues**: Monitor memory usage for large embeddings

### Debug Mode

```python
# Enable debug logging
import logging
logging.basicConfig(level=logging.DEBUG)

# Start server with debug
uvicorn.run(app, host="0.0.0.0", port=7100, log_level="debug")
```

## Performance Optimization

### Tips for Better Performance

1. **Batch Operations**: Use batch add/query operations
2. **Embedding Dimensions**: Use smaller dimensions for faster similarity search
3. **Memory Management**: Monitor memory usage with large collections
4. **SSD Storage**: Store workspace on SSD for better I/O performance
5. **Connection Pooling**: Reuse client connections where possible

### Benchmarking

```python
import time

start_time = time.time()
results = client.query(...)
query_time = time.time() - start_time
print(f"Query took {query_time:.3f} seconds")
```

## Contributing

To extend the multi-tenant server:

1. Add new endpoints to `multi_tenant_chromadb.py`
2. Update the client in `multi_tenant_client.py`
3. Add tests and examples
4. Update documentation

## License

This implementation is provided as an example and can be adapted for your specific needs.