# Document Creation Example project

Our agent should support the user with copying different sections from one or more PDF or word documents into a single new word docx document.

It supports two work modes "freestyle" and "structured checklist". 

We create an agent skil "document-creation" which expects the source documents in a folder source/ and creates the output in target/

## Structured Checklist approach

The agent decomposes source documents (PDF or docx) into sections and remembers their section headings and numbers. It also looks up the sections and numbers in the target (template) word document.

The agent remembers the section mappings in a file source-target.sectionmappings.json and the user can comment optionally how to do the copy like "only take the images" or "ignore images" (which is applied as a data transformation from source to target).

In structured mode the agent waits until the user has finished all mappings and presses the "create document now" in the section mapping dashboard.

The structured mode can be hardened by using the option "Requirements" mode which leads to a classification according to the EARS standard of the source documents while parsing the structure.

### Tipp: Existing implementation

The RequirementsViewer.jsx component is a similar approach.

### Section Mapping Dashboard

The section mapping is a HTML page which reads the section mappings and displays two columns: the left column contains the sections from the source document (if there are more than one a dropdown combo allows the user to select one) and the left column displays the template .docx sections.

The user can enter the transformation from source to target section after established.

There's an existing similar frontend component  frontend/src/components/RequirementsViewer.jsx.

## Freestyle approach

In Freestyle approach the user says everything in the chat and the agent maintains the source-target.sectionmappings.json during the chat. The user must also give the command to create the target document.

## Implementation

Use the modal in the frontend OfferGeneratorModal.jsx and the related existing API endpoints for target creation.

backend/src/mcpserver/document-analysis-tools.ts does the ears transformation

backend/src/mcpserver/requirements-matcher-tools.ts matches one structure to another (automapping of source and target - one option in the section mapping dashboard)




