# Project Management Features

Etienne organizes its workspace directory by creating one folder per project. This document describes the usability features for organizing skills, MCP tools and other Etienne features across projects.

Etienne is a designed agent experience - means an administrator or central business unit is responsibe for evaluating/providing a list of approved skills or MCP tools. These pre-approved items are listed in ...-repositry or ...-registry files or directories.

## Backend 

### Skill Repository
There is a directory skill-repository in the root of the project (default). If an environment variable SKILL_REPOSITORY is set it points to the location of skill-repository, if this variable is not set or points to an invalid location we fallback to the default in the root of the project.

The skill-repository/standard contains subdirectories which must be copied to the workspace/<project name> when creating a new project. 

We need to extend the backend/src/skills API to be able to copy one or more directories from the repository to a project with a single API call. This is called provisioning skills.

#### Docker File parameters
We must extend the Docker file with the environment variable SKILL_REPOSITORY

### MCP Registry
There is a optional file /backend/mcp-server-registry.json containing a list of MCP servers for the protocol types SSE or HTTP together with their authenticationinformation. We already have the existing logic and backend code to be found in the frontend at /frontend/src/components/MCPServerConfiguration.jsx. 

#### Docker File parameters
We must extend the Docker file with the environment variable MCP_REGISTRY which maps a mounted mcp-server-registry.json 

## Frontend 

### Create Project Modal
The existing modal dialog "Create Project" must be extended:
* there's a tab strip below the name input text field with "Mission Brief","Skills", "Tools". "External Agents" and "Customize UI" as tab strip items
* Mission brief tab content is a white themed monaco editor preconfigured for markdown content. The user input here is mandatory. The description is "Describe the desired results of our project as detailled as possible".
* Skills tab content contains the list of standard skills with a tailing list item "Choose additional skill" which let's the user choose skills from the skill-repository/optional folder
* Tools tab content contains the list of current MCP tools with a tailing list item "Add MCP server" which let's the user enter a MCP server's URL and authentication information followed by a action button "Connect to server". After the connection to the MCP server has been established the user can select one or more tools from this server
* External Agents tab content contains the list of agents from the A2A registry. The user can select optional agents to be available in the project.
* customize UI contains the "copy from" of the existing modal dialog

We must extend the backend's existing create project API endpoint to handle the copy of the default skills and the optional skills. also we need to make sure that we write the mission brief text to a file CLAUDE.md in the project directory. We must register the MCP tools and A2A agents by using the existing API endpoints.

### MCP Tools Indicator
In the preview pane tab strip row there's a new component mcp-tools-indicator.tsx rendered.

If there are no mcp tools active in the current project the component does not display anything.

It there are any mcp tools available a black bullet point with white color font containing the number of active tools followed by the label " tools available". The user can click the label which opens a menu component containing the names of all MCP tools ordered in ascending sequence.

This component is invisible for the role admin.

### Skill Indicator
In the preview pane tab strip row there's a new component skill-indicator.tsx rendered. 

If there are no skills active in the current project the component does not display anything.

It there are any skills in the project directory the component renders a orange bullet point with white color font containing the number of active skills followed by the label " skills active". The user can click the label which opens the existing modal skills dialog.

This component is invisible for the role admin.

### External Agents Indicator
In the preview pane tab strip row there's a new component a2a-agents-indicator.tsx rendered. 

If there are no external agents active in the current project the component does not display anything.

It there are any external agents configured in the project directory the component renders a navy blue bullet point with white color font containing the number of configured A2A agents followed by the label " agents available". The user can click the label which opens a menu component containing the names of all configured A2A agents for the project ordered in ascending sequence.

This component is invisible for the role admin.

### A2A Registry
There is a optional file /backend/a2a-registry.json containing a JSON file with a list of agent cards according to the A2A standard. We already have the existing logic and backend code to be found in the frontend at /frontend/src/components/A2ASettings.jsx. 

#### Docker File parameters
We must extend the Docker file with the environment variable A2A_REGISTRY which maps a mounted a2a-registry.json 

## Documentation
Create a new markdown file project-structure.md which explains the features as described in this document to non technical persons. 