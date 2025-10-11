# System Diagnosis

I want to extend the Frontend to check the health of the backend system. The backend system checks the health of the Claude Code Docker container.

The Frontend will check the /api/claude/health endpoint on start up and then in 10 second intervals. If there are any errors reported when this endpoint returns anything else than a httpt status 200 code a toast is displayed on the bottom on the artifacts pane which cannot be closed by the user. The toast can render markdown using marked and DOMPurify.

If the health endpoint is not available (timeout: 300ms) then this error is reported:
----
**Backend does not respond** Please start the backend using 
```
cd backend
npm i
npm run dev
```
If the backend is running check whether it is running on Port :6060
------


## Backend health check endpoint
The backend health endpoint /api/claude/health checks for these error conditions:

### Error: Docker Container not running or Docker not installed
The command line docker was not found or docker exec into the container "claude-code" failed.

### Error: Claude not found in the Docker container
The command docker exec bash into the container suceeeds, but "claude --version" command is not available or fails.

### Error: Unsupported Claude Code version (must be 2.x)
The command docker exec bash into the container suceeeds, "claude --version" command is available but returns a version number not staring with 2.  