# Interceptors Feature
We want to be able to track and trace the behaviour of claude code. Details on the technical foundation are in the file claude-hooks-and-events.md (please read before processing further).

We want to route all hooks and events from claude code to an api endpoint in our backend and visualize them in the frontend.

## Backend
We need to implement a new endpoint POST /api/interceptors/in which receives all hooks and events. We expect the project name which created the events to be in a http header variable 'x-claude-code-project'. It also publishes the new events in realtime to the frontend via the existing SSE channel.

The endpoint stores the received JSONs in-memory - they are NOT persisted to disc. It is intended to loose these JSONS in case of a service restart.

Two new endpoint GET /api/interceptors/hooks/<project> and GET /api/interceptors/events/<project> return the data reading from the in-memory store.

## Frontend
There is a new tab item "Interceptors" which displays a new React component Interceptors.jsx. This component has a top level toggle switch "Events"/"Hooks" with "Events" being the default value.

The component lists the items in descending timestamp order after querying the GET API endpoint first and then listening to the SSE channel after that. The backend propagates new items via SSE.

The list a a simple mui data table with a filter box for each field above the table header. This filter operates only on the frontend side by using simple case-insensitive string matching (substring).

## Current Implementation status

  Backend (NestJS):
  - backend/src/interceptors/interceptors.controller.ts - POST /api/interceptors/in, GET endpoints, SSE stream
  - backend/src/interceptors/interceptors.service.ts - In-memory storage with Map, separate hooks/events per project
  - backend/src/interceptors/dto.ts - DTOs for validation
  - Registered in app.module.ts

  Frontend (React):
  - frontend/src/components/Interceptors.jsx - Toggle between Events/Hooks, filterable MUI table, SSE listener
  - Added "Interceptors" tab to ArtifactsPane.jsx

  Key features:
  - Events/Hooks separated based on event_type (PreToolUse/PostToolUse = hooks, others = events)
  - Descending timestamp sort
  - Real-time updates via SSE
  - Client-side filtering with case-insensitive substring matching
  - Data lost on service restart (as specified)