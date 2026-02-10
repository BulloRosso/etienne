---
name: rag-search
description: Indexes and searches documents in the my-documents folder using knowledge graph vector store
---
# RAG Search

This skill enables document indexing and semantic search over files placed in the `my-documents/` folder. Documents are automatically indexed into the knowledge base vector store when created or modified, and removed when deleted. Users can query the knowledge base in conversation by mentioning "my documents", "my-documents", "knowledge base", or "our kb".

## Dependencies

This skill requires the vector-store service to be running and listening on port 7100.

## When to Use This Skill

Use this skill when:
- The user asks to set up document search or a knowledge base for their project
- The user places files in the `my-documents/` folder
- The user mentions "my documents", "my-documents", "knowledge base", or "our kb" in conversation and wants to search or reference indexed documents
- The user asks questions that should be answered from their uploaded documents

## Automatic Initialization on First Message

**IMPORTANT**: On every conversation turn, before handling the user's request, you MUST check whether the RAG Search rules have been initialized for this project. Call `GET /api/rules/{project}` and look for rules named "RAG: File Created", "RAG: File Deleted", and "RAG: File Modified". If any of these three rules are missing, run the full Initialization steps below **silently before responding to the user's actual request**. This ensures documents dropped into `my-documents/` are indexed automatically from the very first interaction, without requiring the user to explicitly ask for setup.

If all three rules already exist, skip initialization and proceed directly to handling the user's request.

## Initialization Steps

Perform the following setup steps in order.

### Step 1: Create the my-documents Directory

Check if `my-documents/` exists in the project directory. If not, create it:

```python
python3 -c "import os; os.makedirs('my-documents', exist_ok=True)"
```

### Step 2: Install markitdown

Check if markitdown is available:

```bash
python3 -c "import markitdown"
```

If the import fails, install it:

```bash
pip3 install markitdown
```

### Step 3: Create Prompts via API

Create three prompts that will be used as rule actions. Replace `{project}` with the actual project name.

**Prompt 1 - Index New Document:**

```
POST /api/prompts/{project}
Content-Type: application/json; charset=utf-8

{
  "title": "RAG: Index New Document",
  "content": "A new file was added to the my-documents folder. You must index it into the knowledge base using the document indexing workflow.\n\nSteps:\n1. Extract the file path from the 'File:' line above.\n2. Check the file extension.\n3. If the file has a binary extension (.pdf, .docx, .xlsx, .pptx), you MUST convert it to markdown first using markitdown:\n   ```\n   python3 -c \"\nfrom markitdown import MarkItDown\nmd = MarkItDown()\nresult = md.convert('/workspace/{project}/<filepath>')\nprint(result.text_content)\n   \"\n   ```\n   Then call kg_learn_document with the project name, the original file path, and the converted text in the 'content' parameter.\n4. For text-based files (.md, .txt, .csv, .json, etc.), call kg_learn_document with just the project name and file path - it will read the file directly.\n5. Confirm the document was indexed successfully."
}
```

Save the returned `prompt.id` as `promptId1`.

**Prompt 2 - Remove Deleted Document:**

```
POST /api/prompts/{project}
Content-Type: application/json; charset=utf-8

{
  "title": "RAG: Remove Deleted Document",
  "content": "A file was deleted from the my-documents folder. You must remove it from the knowledge base.\n\nSteps:\n1. Extract the file path from the 'File:' line above.\n2. Call the kg_forget_document MCP tool with the project name and the file path (relative to the project directory).\n3. Confirm the document was removed from the knowledge base."
}
```

Save the returned `prompt.id` as `promptId2`.

**Prompt 3 - Re-index Modified Document:**

```
POST /api/prompts/{project}
Content-Type: application/json; charset=utf-8

{
  "title": "RAG: Re-index Modified Document",
  "content": "A file was modified in the my-documents folder. You must update it in the knowledge base by removing the old version and indexing the new one.\n\nSteps:\n1. Extract the file path from the 'File:' line above.\n2. First, call kg_forget_document MCP tool with the project name and file path (relative to the project directory) to remove the old version.\n3. Wait for the forget operation to complete before proceeding.\n4. Check the file extension.\n5. If the file has a binary extension (.pdf, .docx, .xlsx, .pptx), you MUST convert it to markdown first using markitdown:\n   ```\n   python3 -c \"\nfrom markitdown import MarkItDown\nmd = MarkItDown()\nresult = md.convert('/workspace/{project}/<filepath>')\nprint(result.text_content)\n   \"\n   ```\n   Then call kg_learn_document with the project name, the original file path, and the converted text in the 'content' parameter.\n6. For text-based files, call kg_learn_document with just the project name and file path.\n7. Confirm the document was re-indexed successfully."
}
```

Save the returned `prompt.id` as `promptId3`.

### Step 4: Create Rules via API

Create three rules referencing the prompt IDs from Step 3. Replace `{project}` with the actual project name and `<promptIdN>` with the actual prompt IDs.

**Rule 1 - File Created in my-documents:**

```
POST /api/rules/{project}
Content-Type: application/json; charset=utf-8

{
  "name": "RAG: File Created",
  "enabled": true,
  "condition": {
    "type": "simple",
    "event": {
      "group": "Filesystem",
      "name": "File Created",
      "payload.path": "*/my-documents/*"
    }
  },
  "action": {
    "type": "prompt",
    "promptId": "<promptId1>"
  }
}
```

**Rule 2 - File Deleted from my-documents:**

```
POST /api/rules/{project}
Content-Type: application/json; charset=utf-8

{
  "name": "RAG: File Deleted",
  "enabled": true,
  "condition": {
    "type": "simple",
    "event": {
      "group": "Filesystem",
      "name": "File Deleted",
      "payload.path": "*/my-documents/*"
    }
  },
  "action": {
    "type": "prompt",
    "promptId": "<promptId2>"
  }
}
```

**Rule 3 - File Modified in my-documents:**

```
POST /api/rules/{project}
Content-Type: application/json; charset=utf-8

{
  "name": "RAG: File Modified",
  "enabled": true,
  "condition": {
    "type": "simple",
    "event": {
      "group": "Filesystem",
      "name": "File Modified",
      "payload.path": "*/my-documents/*"
    }
  },
  "action": {
    "type": "prompt",
    "promptId": "<promptId3>"
  }
}
```

### Step 5: Index Existing Files

After creating the rules, scan the `my-documents/` directory for any files already present. For each file found, index it into the knowledge base following the Document Indexing Workflow below. This ensures documents that were placed before initialization are searchable immediately.

### Step 6: Confirm Setup

After all prompts, rules are created, and existing documents are indexed, briefly inform the user that the knowledge base has been initialized with automatic document indexing. Keep it short - the user did not explicitly ask for setup, so don't overwhelm them. Then proceed to handle their original request.

## Document Indexing Workflow

**IMPORTANT**: The `kg_learn_document` tool reads files as UTF-8 text. Binary formats (PDF, DOCX, XLSX, PPTX) will produce garbage or errors if read directly. You MUST preprocess binary files with markitdown before indexing.

To index a document:

1. **Check the file extension** to determine if it is a binary format.
2. **For binary files** (.pdf, .docx, .xlsx, .pptx):
   - Convert to markdown using markitdown:
     ```bash
     python3 -c "
     from markitdown import MarkItDown
     md = MarkItDown()
     result = md.convert('/workspace/{project}/{filepath}')
     print(result.text_content)
     "
     ```
   - Call `kg_learn_document` with `project`, `filepath` (the original path like `my-documents/report.pdf`), and `content` (the converted markdown text from markitdown output).
3. **For text-based files** (.md, .txt, .csv, .json, etc.):
   - Call `kg_learn_document` with just `project` and `filepath`. The tool will read the file content directly.

## Workflow - Document Search (Conversation)

When the user mentions "my documents", "my-documents", "knowledge base", or "our kb" in a question or request, follow these steps:

### Step 1: Search the Knowledge Base

Call the `kg_search_document` MCP tool with:
- `project`: The current project name (extract from the working directory)
- `query`: The user's question or search intent (extract the semantic meaning)

### Step 2: Present Results with Citations

If the search returns results:
- Summarize the relevant information from the matched documents
- Include citation links to the source documents using markdown link format
- The `filepath` from the search results is relative to the project directory

**Citation format for single source:**
```
According to [filename.pdf](my-documents/filename.pdf), the policy states that ...
```

**Citation format for multiple sources:**
```
Based on [document1.pdf](my-documents/document1.pdf) and [document2.docx](my-documents/document2.docx), the answer is ...
```

If no results are found:
- Inform the user that no matching documents were found in the knowledge base
- Suggest they add relevant documents to the `my-documents/` folder

## API Reference

### Create Prompt
```
POST /api/prompts/{project}
Body: { title: string, content: string }
Response: { success: boolean, prompt: { id: string, title: string, content: string, createdAt: string, updatedAt: string } }
```

### List Rules (for idempotency check)
```
GET /api/rules/{project}
Response: { success: boolean, count: number, rules: EventRule[] }
```

### Create Rule
```
POST /api/rules/{project}
Body: { name: string, enabled: boolean, condition: EventCondition, action: RuleAction }
Response: { success: boolean, rule: { id: string, name: string, enabled: boolean, condition: EventCondition, action: RuleAction, createdAt: string, updatedAt: string } }
```

## MCP Tools Reference

### kg_learn_document
Adds a document to the vector store knowledge base. Generates embeddings and stores the content for semantic search.
- `project` (string, required): The project name (directory name in workspace)
- `filepath` (string, required): Relative path to the document file within the project workspace (e.g., "my-documents/report.md"). Used as the document identifier.
- `content` (string, optional): Pre-extracted text content. When provided, the tool uses this instead of reading from the file. **Use this for binary files (PDF, DOCX, XLSX, PPTX) that have been converted to text using markitdown.**

### kg_search_document
Searches documents in the vector store knowledge base. Returns the top 3 matching document contents with filepath and similarity score.
- `project` (string, required): The project name
- `query` (string, required): Natural language query or question (e.g., "What is the return policy for electronics?")

### kg_forget_document
Removes a document from the vector store knowledge base.
- `project` (string, required): The project name
- `filepath` (string, required): Relative path to the document file within the project workspace (e.g., "my-documents/old-report.md")

## Example Interactions

### Example 1: First Message (Auto-initialization)

**User**: "In regard to our knowledge base how should customer returns in the category food be handled?"

**Agent** (detects rules are missing → silently runs initialization Steps 1-6, indexing any existing files in my-documents → then calls kg_search_document):

"I've initialized the knowledge base for your project. According to [return-policy.pdf](my-documents/return-policy.pdf) we accept food returns only up to 3 days after the purchase date in original and unbroken packaging."

### Example 2: Subsequent Query (Rules Already Exist)

**User**: "What does our kb say about warranty claims?"

**Agent** (checks rules → all 3 exist → skips initialization → calls kg_search_document):

"According to [warranty-policy.pdf](my-documents/warranty-policy.pdf) warranty claims must be filed within 12 months of purchase with proof of purchase."

### Example 3: Multiple Source Results

**User**: "What do my documents say about employee onboarding?"

**Agent** (internally calls kg_search_document with query "employee onboarding process"):

"Based on [hr-handbook.pdf](my-documents/hr-handbook.pdf) and [onboarding-checklist.docx](my-documents/onboarding-checklist.docx), new employees go through a 2-week onboarding program that includes IT setup on day 1, team introductions on day 2, and role-specific training during the first two weeks."

### Example 4: No Results

**User**: "What does our kb say about shipping to Alaska?"

**Agent** (internally calls kg_search_document, gets no results):

"I couldn't find any information about shipping to Alaska in your knowledge base. You may want to add relevant shipping policy documents to the `my-documents/` folder so I can index and search them for you."

## Notes

- The file watcher emits `payload.path` as workspace-relative paths (e.g., `projectname/my-documents/file.pdf`). The wildcard pattern `*/my-documents/*` matches this format correctly.
- When a rule fires for a Filesystem event, the system prepends `Event: {event name}` and `File: {path relative to project}` to the prompt content. The file path is already relative to the project root (e.g., `my-documents/file.pdf`), so you can use it directly with MCP tools.
- **Binary file handling is critical**: The `kg_learn_document` tool reads files as UTF-8 text. Binary formats (PDF, DOCX, XLSX, PPTX) will fail or produce garbage. You MUST convert them to markdown using markitdown first, then pass the converted text via the `content` parameter while keeping the original `filepath` as the document identifier.
- Always use `charset=utf-8` in the Content-Type header when making API calls to ensure proper encoding of non-ASCII characters.
- Initialization is idempotent - always check for existing rules before creating duplicates.
