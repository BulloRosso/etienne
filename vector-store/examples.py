"""
Multi-Tenant ChromaDB Example Usage Scenarios
"""
import numpy as np
from sentence_transformers import SentenceTransformer
from multi_tenant_client import MultiTenantChromaClient, ProjectCollection


def example_semantic_search():
    """Example: Semantic search with real embeddings"""
    print("=== Semantic Search Example ===")
    
    # Initialize client and embedding model
    client = MultiTenantChromaClient()
    
    try:
        model = SentenceTransformer('all-MiniLM-L6-v2')
    except ImportError:
        print("Install sentence-transformers: pip install sentence-transformers")
        return
    
    project_name = "semantic-search-demo"
    collection_name = "documents"
    
    # Create collection
    client.create_collection(
        name=collection_name,
        metadata={"type": "semantic_search", "model": "all-MiniLM-L6-v2"},
        get_or_create=True,
        project_name=project_name
    )
    
    # Example documents
    documents = [
        "Machine learning algorithms can process large amounts of data",
        "Python is a popular programming language for data science",
        "Vector databases enable fast similarity search",
        "Natural language processing helps computers understand text",
        "Deep learning models require substantial computational resources",
        "ChromaDB is an open-source vector database for AI applications"
    ]
    
    # Generate real embeddings
    embeddings = model.encode(documents).tolist()
    ids = [f"semantic_doc_{i}" for i in range(len(documents))]
    metadatas = [{"category": "tech", "index": i} for i in range(len(documents))]
    
    # Add documents
    client.add(
        collection_name=collection_name,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas,
        ids=ids,
        project_name=project_name
    )
    
    # Semantic search
    queries = [
        "programming languages for AI",
        "database technology for vectors",
        "computational requirements for AI"
    ]
    
    for query in queries:
        print(f"\nQuery: '{query}'")
        query_embedding = model.encode([query]).tolist()
        
        results = client.query(
            collection_name=collection_name,
            query_embeddings=query_embedding,
            n_results=2,
            project_name=project_name
        )
        
        for i, (doc, distance) in enumerate(zip(
            results['documents'][0],
            results['distances'][0]
        )):
            similarity = 1 - distance
            print(f"  {i+1}. Similarity: {similarity:.3f} - {doc}")


def example_multi_project_workflow():
    """Example: Managing multiple projects"""
    print("\n=== Multi-Project Workflow Example ===")
    
    client = MultiTenantChromaClient()
    
    projects = [
        {"name": "ecommerce-app", "docs": ["Product recommendations", "Customer reviews"]},
        {"name": "chatbot-project", "docs": ["FAQ responses", "User queries"]},
        {"name": "document-search", "docs": ["Legal documents", "Research papers"]}
    ]
    
    for project in projects:
        project_name = project["name"]
        collection_name = "main_collection"
        
        print(f"\nSetting up project: {project_name}")
        
        # Create collection
        client.create_collection(
            name=collection_name,
            metadata={"project": project_name, "created_by": "example"},
            get_or_create=True,
            project_name=project_name
        )
        
        # Add documents
        documents = project["docs"]
        embeddings = [np.random.rand(384).tolist() for _ in documents]
        ids = [f"{project_name}_doc_{i}" for i in range(len(documents))]
        
        client.add(
            collection_name=collection_name,
            embeddings=embeddings,
            documents=documents,
            ids=ids,
            project_name=project_name
        )
        
        print(f"  Added {len(documents)} documents to {project_name}")
    
    # List all projects
    print("\nAll Projects:")
    all_projects = client.list_projects()
    for proj in all_projects:
        print(f"  - {proj['name']}: {proj['collections']} collections")


def example_project_collection_helper():
    """Example: Using ProjectCollection helper class"""
    print("\n=== ProjectCollection Helper Example ===")
    
    client = MultiTenantChromaClient()
    project_name = "helper-demo"
    collection_name = "test_collection"
    
    # Create collection first
    client.create_collection(
        name=collection_name,
        get_or_create=True,
        project_name=project_name
    )
    
    # Use helper class
    collection = ProjectCollection(client, project_name, collection_name)
    
    # Add documents using helper
    documents = ["Helper class makes it easier", "Simplified API calls"]
    embeddings = [np.random.rand(384).tolist() for _ in documents]
    ids = ["helper_1", "helper_2"]
    
    collection.add(
        embeddings=embeddings,
        documents=documents,
        ids=ids
    )
    
    print(f"Collection count: {collection.count()}")
    
    # Query using helper
    query_embedding = [np.random.rand(384).tolist()]
    results = collection.query(query_embeddings=query_embedding, n_results=1)
    
    print(f"Query result: {results['documents'][0][0]}")


def example_metadata_filtering():
    """Example: Advanced querying with metadata filtering"""
    print("\n=== Metadata Filtering Example ===")
    
    client = MultiTenantChromaClient()
    project_name = "filtering-demo"
    collection_name = "filtered_docs"
    
    # Create collection
    client.create_collection(
        name=collection_name,
        get_or_create=True,
        project_name=project_name
    )
    
    # Documents with different categories
    documents = [
        "Machine learning tutorial for beginners",
        "Advanced deep learning concepts",
        "Python programming basics",
        "JavaScript web development",
        "Database design principles",
        "AI ethics and responsibility"
    ]
    
    embeddings = [np.random.rand(384).tolist() for _ in documents]
    ids = [f"filtered_doc_{i}" for i in range(len(documents))]
    metadatas = [
        {"category": "ai", "difficulty": "beginner"},
        {"category": "ai", "difficulty": "advanced"},
        {"category": "programming", "difficulty": "beginner"},
        {"category": "programming", "difficulty": "intermediate"},
        {"category": "database", "difficulty": "intermediate"},
        {"category": "ai", "difficulty": "advanced"}
    ]
    
    client.add(
        collection_name=collection_name,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas,
        ids=ids,
        project_name=project_name
    )
    
    # Query with metadata filtering
    query_embedding = [np.random.rand(384).tolist()]
    
    # Filter by category
    print("AI documents only:")
    results = client.query(
        collection_name=collection_name,
        query_embeddings=query_embedding,
        n_results=10,
        where={"category": "ai"},
        project_name=project_name
    )
    
    for doc, metadata in zip(results['documents'][0], results['metadatas'][0]):
        print(f"  - {doc} ({metadata})")
    
    # Filter by difficulty
    print("\nBeginner documents only:")
    results = client.query(
        collection_name=collection_name,
        query_embeddings=query_embedding,
        n_results=10,
        where={"difficulty": "beginner"},
        project_name=project_name
    )
    
    for doc, metadata in zip(results['documents'][0], results['metadatas'][0]):
        print(f"  - {doc} ({metadata})")


def demonstrate_directory_structure():
    """Show the directory structure created by the multi-tenant system"""
    print("\n=== Directory Structure Demonstration ===")
    
    import os
    from pathlib import Path
    
    # Run some operations to create directory structure
    client = MultiTenantChromaClient()
    
    test_projects = ["demo-project-1", "demo-project-2", "my-awesome-app"]
    
    for project in test_projects:
        client.create_collection(
            name="sample_collection",
            get_or_create=True,
            project_name=project
        )
    
    # Show directory structure
    workspace_dir = Path("./workspace")
    if workspace_dir.exists():
        print("Created directory structure:")
        for root, dirs, files in os.walk(workspace_dir):
            level = root.replace(str(workspace_dir), '').count(os.sep)
            indent = ' ' * 2 * level
            print(f"{indent}{os.path.basename(root)}/")
            sub_indent = ' ' * 2 * (level + 1)
            for file in files:
                print(f"{sub_indent}{file}")


if __name__ == "__main__":
    print("Multi-Tenant ChromaDB Usage Examples")
    print("Make sure the server is running: python multi_tenant_chromadb.py")
    print("=" * 60)
    
    try:
        # Test server connection first
        client = MultiTenantChromaClient()
        client.heartbeat()
        
        # Run examples
        example_multi_project_workflow()
        example_project_collection_helper()
        example_metadata_filtering()
        demonstrate_directory_structure()
        
        # Try semantic search if sentence-transformers is available
        try:
            import sentence_transformers
            example_semantic_search()
        except ImportError:
            print("\nSkipping semantic search example (sentence-transformers not installed)")
        
        print("\n✅ All examples completed successfully!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        print("Make sure the multi-tenant server is running on port 7100")