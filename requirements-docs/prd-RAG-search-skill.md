# RAG Search Skill

I want to create a new optional skill "RAG Search" in the skill-repository root directory.

The RAG Search skill describes how to index and search documents in a project directory called "my-documents" with the MCP server knowledge-graph tools
* kg_learn_document
* kg_search_document
* kg_forget_document

## Dependencies
This skill depends on the vector-store service being started and listening on port 7100. 

## Initialization Code
If there is no directory "my-documents" in the project directory the skill needs to create python code to create this directory.

Then the code needs register a 3 new rules for the event group "Filesystem" with the condition monitoring system which is implemented in backend/src/event-handling service and API endpoints:
* If a file is created in the "my-documents" folder the MCP method kg_learn_document must be called. The agent will use the microsoft python library "markitdown" to preprocess the content of PDF, DOCX, XLSX and PPTX files to markdown before handing it over to the MCP method for indexing.
* If a file is deleted in the "my-documents" folder the MCP method kg_forget_document must be called
* If a file is modified in the "my-documents" folder the MCP method kg_forget_document and after this has finished the kg_learn_document method must be called

Before creating the rule we must create the action (prompt) with the prompt service and reference it inside the rule.

## Referring to my-documents in a conversation
If the users mentions "my documents", "my-documents" or "knowledge base" or "our kb" in a converstation with the agent then he wants to use the kg_search_document method to be used internally.

The agent will then first call the agent and present the response and the referenced documents as citation links rendered as markdown.

Example:
----------
User input "In regard to our knowledge base how should customer returns in the category food be handeled?"
Agent output "According to [document name relative to project directory] we accept food returns only up to 3 days after the purchase date in original and unbroken packaging."
-----------