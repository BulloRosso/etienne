#!/usr/bin/env python3
"""
Multi-Tenant ChromaDB Server
Supports dynamic project workspaces without server restart
URL pattern: /api/v1/{project_name}/collections/...
Data stored in: workspace/{project_name}/knowledge-graph/
"""
import os
import logging
from pathlib import Path
from typing import Dict, Optional, Any
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
import chromadb
from chromadb.config import Settings


# Configuration
class MultiTenantConfig:
    def __init__(self):
        self.base_workspace_dir = os.getenv('WORKSPACE_DIR', './workspace')
        self.knowledge_graph_subdir = os.getenv('KNOWLEDGE_GRAPH_SUBDIR', 'knowledge-graph')
        self.server_host = os.getenv('CHROMA_HOST', '0.0.0.0')
        self.server_port = int(os.getenv('CHROMA_PORT', '7100'))
        self.cors_origins = os.getenv('CORS_ORIGINS', '["*"]')
        
        # Ensure base directory exists
        Path(self.base_workspace_dir).mkdir(parents=True, exist_ok=True)
        
    def get_project_path(self, project_name: str) -> str:
        """Get the full path for a project's ChromaDB storage"""
        project_path = Path(self.base_workspace_dir) / project_name / self.knowledge_graph_subdir
        project_path.mkdir(parents=True, exist_ok=True)
        return str(project_path)


# Global configuration and client manager
config = MultiTenantConfig()
project_clients: Dict[str, chromadb.PersistentClient] = {}


def get_or_create_project_client(project_name: str) -> chromadb.PersistentClient:
    """Get or create a ChromaDB client for a specific project"""
    if project_name not in project_clients:
        project_path = config.get_project_path(project_name)
        
        # Create ChromaDB client for this project
        client = chromadb.PersistentClient(
            path=project_path,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        project_clients[project_name] = client
        logging.info(f"Created new ChromaDB client for project: {project_name} at {project_path}")
    
    return project_clients[project_name]


def validate_project_name(project_name: str) -> bool:
    """Validate project name to prevent directory traversal attacks"""
    if not project_name:
        return False
    
    # Check for dangerous characters
    dangerous_chars = ['..', '/', '\\', ':', '*', '?', '"', '<', '>', '|']
    if any(char in project_name for char in dangerous_chars):
        return False
    
    # Check length
    if len(project_name) > 50:
        return False
        
    return True


# FastAPI app setup
@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info(f"Starting Multi-Tenant ChromaDB Server")
    logging.info(f"Base workspace directory: {config.base_workspace_dir}")
    logging.info(f"Knowledge graph subdirectory: {config.knowledge_graph_subdir}")
    yield
    
    # Cleanup on shutdown
    for project_name, client in project_clients.items():
        logging.info(f"Closing client for project: {project_name}")


app = FastAPI(
    title="Multi-Tenant ChromaDB Server",
    description="ChromaDB server with per-project workspaces",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure as needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.get("/")
async def root():
    return {
        "message": "Multi-Tenant ChromaDB Server",
        "version": "1.0.0",
        "base_workspace": config.base_workspace_dir
    }


@app.get("/api/v1/heartbeat")
async def heartbeat():
    """Health check endpoint"""
    return {"status": "ok"}


@app.get("/api/v1/version")
async def version():
    """Version endpoint"""
    return {"version": chromadb.__version__}


@app.get("/api/v1/projects")
async def list_projects():
    """List all existing projects"""
    workspace_path = Path(config.base_workspace_dir)
    if not workspace_path.exists():
        return {"projects": []}
    
    projects = []
    for item in workspace_path.iterdir():
        if item.is_dir():
            knowledge_graph_path = item / config.knowledge_graph_subdir
            if knowledge_graph_path.exists():
                projects.append({
                    "name": item.name,
                    "path": str(knowledge_graph_path),
                    "collections": len(list(knowledge_graph_path.glob("*.sqlite*")))
                })
    
    return {"projects": projects}


@app.get("/api/v1/{project_name}/collections")
async def list_collections(project_name: str):
    """List collections for a specific project"""
    if not validate_project_name(project_name):
        raise HTTPException(status_code=400, detail="Invalid project name")
    
    try:
        client = get_or_create_project_client(project_name)
        collections = client.list_collections()
        
        return {
            "project": project_name,
            "collections": [
                {
                    "name": col.name,
                    "id": str(col.id),
                    "metadata": col.metadata,
                    "count": col.count()
                }
                for col in collections
            ]
        }
    except Exception as e:
        logger.error(f"Error listing collections for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/{project_name}/collections")
async def create_collection(project_name: str, request: Request):
    """Create a new collection in a project"""
    if not validate_project_name(project_name):
        raise HTTPException(status_code=400, detail="Invalid project name")
    
    try:
        data = await request.json()
        collection_name = data.get("name")
        metadata = data.get("metadata", {})
        get_or_create = data.get("get_or_create", False)

        if not collection_name:
            raise HTTPException(status_code=400, detail="Collection name is required")

        # Set default distance function to cosine if not specified
        if 'hnsw:space' not in metadata:
            metadata['hnsw:space'] = 'cosine'

        client = get_or_create_project_client(project_name)

        if get_or_create:
            collection = client.get_or_create_collection(
                name=collection_name,
                metadata=metadata,
                embedding_function=None  # We provide embeddings directly
            )
        else:
            collection = client.create_collection(
                name=collection_name,
                metadata=metadata,
                embedding_function=None  # We provide embeddings directly
            )
        
        return {
            "project": project_name,
            "collection": {
                "name": collection.name,
                "id": str(collection.id),
                "metadata": collection.metadata
            }
        }
    except Exception as e:
        logger.error(f"Error creating collection in {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/{project_name}/collections/{collection_name}")
async def get_collection(project_name: str, collection_name: str):
    """Get collection information"""
    if not validate_project_name(project_name):
        raise HTTPException(status_code=400, detail="Invalid project name")
    
    try:
        client = get_or_create_project_client(project_name)
        collection = client.get_collection(collection_name)
        
        return {
            "project": project_name,
            "collection": {
                "name": collection.name,
                "id": str(collection.id),
                "metadata": collection.metadata,
                "count": collection.count()
            }
        }
    except Exception as e:
        logger.error(f"Error getting collection {collection_name} in {project_name}: {e}")
        raise HTTPException(status_code=404, detail=f"Collection not found: {collection_name}")


@app.post("/api/v1/{project_name}/collections/{collection_name}/add")
async def add_to_collection(project_name: str, collection_name: str, request: Request):
    """Add documents to a collection"""
    if not validate_project_name(project_name):
        raise HTTPException(status_code=400, detail="Invalid project name")
    
    try:
        data = await request.json()
        
        client = get_or_create_project_client(project_name)
        collection = client.get_collection(collection_name)
        
        # Extract data
        embeddings = data.get("embeddings")
        documents = data.get("documents")
        metadatas = data.get("metadatas")
        ids = data.get("ids")
        
        collection.add(
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
        
        return {
            "project": project_name,
            "collection": collection_name,
            "added": len(ids) if ids else 0,
            "total_count": collection.count()
        }
    except Exception as e:
        logger.error(f"Error adding to collection {collection_name} in {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/{project_name}/collections/{collection_name}/query")
async def query_collection(project_name: str, collection_name: str, request: Request):
    """Query a collection"""
    if not validate_project_name(project_name):
        raise HTTPException(status_code=400, detail="Invalid project name")
    
    try:
        data = await request.json()
        
        client = get_or_create_project_client(project_name)
        collection = client.get_collection(collection_name)
        
        # Extract query parameters
        query_embeddings = data.get("query_embeddings")
        query_texts = data.get("query_texts")
        n_results = data.get("n_results", 10)
        where = data.get("where")
        where_document = data.get("where_document")
        include = data.get("include", ["documents", "metadatas", "distances"])
        
        results = collection.query(
            query_embeddings=query_embeddings,
            query_texts=query_texts,
            n_results=n_results,
            where=where,
            where_document=where_document,
            include=include
        )
        
        return {
            "project": project_name,
            "collection": collection_name,
            "results": results
        }
    except Exception as e:
        logger.error(f"Error querying collection {collection_name} in {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/v1/{project_name}/collections/{collection_name}")
async def delete_collection(project_name: str, collection_name: str):
    """Delete a collection"""
    if not validate_project_name(project_name):
        raise HTTPException(status_code=400, detail="Invalid project name")
    
    try:
        client = get_or_create_project_client(project_name)
        client.delete_collection(collection_name)
        
        return {
            "project": project_name,
            "message": f"Collection '{collection_name}' deleted successfully"
        }
    except Exception as e:
        logger.error(f"Error deleting collection {collection_name} in {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/{project_name}/collections/{collection_name}/get")
async def get_from_collection(project_name: str, collection_name: str, request: Request):
    """Get documents from a collection"""
    if not validate_project_name(project_name):
        raise HTTPException(status_code=400, detail="Invalid project name")

    try:
        # Parse query parameters
        ids = request.query_params.getlist("ids")
        limit = request.query_params.get("limit")
        offset = request.query_params.get("offset")
        include = request.query_params.getlist("include") or ["documents", "metadatas"]

        client = get_or_create_project_client(project_name)
        collection = client.get_collection(collection_name)

        kwargs = {"include": include}
        if ids:
            kwargs["ids"] = ids
        if limit:
            kwargs["limit"] = int(limit)
        if offset:
            kwargs["offset"] = int(offset)

        results = collection.get(**kwargs)

        return {
            "project": project_name,
            "collection": collection_name,
            "results": results
        }
    except Exception as e:
        logger.error(f"Error getting from collection {collection_name} in {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/v1/{project_name}/collections/{collection_name}/documents")
async def delete_from_collection(project_name: str, collection_name: str, request: Request):
    """Delete documents from a collection"""
    if not validate_project_name(project_name):
        raise HTTPException(status_code=400, detail="Invalid project name")

    try:
        data = await request.json()
        ids = data.get("ids")

        if not ids:
            raise HTTPException(status_code=400, detail="Document IDs are required")

        client = get_or_create_project_client(project_name)
        collection = client.get_collection(collection_name)

        collection.delete(ids=ids)

        return {
            "project": project_name,
            "collection": collection_name,
            "deleted": len(ids),
            "total_count": collection.count()
        }
    except Exception as e:
        logger.error(f"Error deleting from collection {collection_name} in {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def start_server():
    """Start the multi-tenant ChromaDB server"""
    logger.info(f"Starting Multi-Tenant ChromaDB Server")
    logger.info(f"Base workspace: {config.base_workspace_dir}")
    logger.info(f"Server: http://{config.server_host}:{config.server_port}")
    logger.info(f"API docs: http://{config.server_host}:{config.server_port}/docs")
    
    uvicorn.run(
        app,
        host=config.server_host,
        port=config.server_port,
        log_level="info"
    )


if __name__ == "__main__":
    start_server()