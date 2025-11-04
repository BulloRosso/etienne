# Strategy feature

The strategy for a project is in a markdown file located at `.claude/CLAUDE.md` within the project directory.

The user can edit this file in the frontend.

We will use axios for calling REST APIs.

## Frontend
In the ArtifactsPane.jsx there is a second tab "Strategy" which has the Strategy.jsx component in its tab content area.

Strategy.jsx loads and stores the CLAUDE.md via REST API methods by passing the currently selected project name. 

The content of CLAUDE.md is displayed in monaco code editor with light theme which is preset to edit markdown content. The code editor has 100% width and a responsive layout to take the available height.

Below the monaco code editor there is a right aligned button "Save" which calls POST api/strategy.

## Backend
We have these API endpoints to process the `.claude/CLAUDE.md` file inside a project directory. All endpoints are content type application/json.

Each JSON contains a parameter "projectName" which is passed in the JSON.

1. GET api/strategy returns the content of `.claude/CLAUDE.md`
2. POST api/strategy saves the passed content to `.claude/CLAUDE.md`
