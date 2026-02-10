# RAG Search - Getting Started

Welcome! The **RAG Search** skill has been added to your project. It lets you build a searchable knowledge base from your documents.

## How It Works

1. **Drop files** into the `my-documents/` folder in your project directory
2. Documents are **automatically indexed** into the knowledge base (PDF, DOCX, XLSX, PPTX, and text files are supported)
3. **Ask questions** about your documents in the chat by mentioning "my documents", "knowledge base", or "our kb"

## Quick Start

Simply ask me a question that references your documents, for example:

- *"What does our knowledge base say about the return policy?"*
- *"Search my documents for onboarding instructions"*
- *"According to our kb, what are the compliance requirements?"*

The knowledge base will be initialized automatically on your first message.

## Supported File Formats

| Format | Extension | Processing |
|--------|-----------|------------|
| PDF | `.pdf` | Converted to text via markitdown |
| Word | `.docx` | Converted to text via markitdown |
| Excel | `.xlsx` | Converted to text via markitdown |
| PowerPoint | `.pptx` | Converted to text via markitdown |
| Markdown | `.md` | Indexed directly |
| Plain text | `.txt` | Indexed directly |
| CSV | `.csv` | Indexed directly |
| JSON | `.json` | Indexed directly |

## What Happens Behind the Scenes

- When a file is **added** to `my-documents/`, it is automatically indexed
- When a file is **modified**, the old version is removed and the new version is indexed
- When a file is **deleted**, it is removed from the knowledge base
- Search results include **citation links** to the source documents
