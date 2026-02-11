# Public Website

We have a webserver running on port 4000 which is configured in the frontend's vite.config to forward all outside requests for the URL path /web to this webserver.

The webserver is aware of the projects and servers content from the workspace's project directories, for example /web/project1 for /workspace/project1

The agent can construct professional outbound public websites by putting static website content into the project's subdirectory /web and FastAPI endpoints to the /api subdirectory.

The magic is that the coding agent can create any API methods because the web server will hot reload the API when detecting changes. Also the API can access all the data in the project directory. This enables us to create things like web questionaires which write their data directly into the project folder in the workspace.

A skill will be used to guide the coding agent's actions.

## public-website Skill

Create a skill definition which gives coding and structure guidelines to the AI coding assistant.

These are the policies:
* The website is public and does not require any form of authentication
* Use React and the MUI components and Icons, use references to public CDNs 
* Create a calm and professional website with the MUI default color theme
* for internal links and routing use server relative links like /web/workspace1/index.html
* the start document index.html is located in the project directory /web
* ask the user which language to support, he might want a German website though the conversation with the coding agent is in English language
* use local storage to remember user settings or choices
* the API endpoints use FastAPI and is subdivided into the service and the endpoint file

## Review the /webserver routes

We need to double check the existing routing logic in /webserver. If there are differences adjust the routing according to this requirement doc.

Create a simple index.html in one of the existing projects for testing and try to GET it using curl.