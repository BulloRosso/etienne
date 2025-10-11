  Architecture Changes

  Current (Development)

  Host Machine
  ├── Backend (NestJS) ─────docker exec──────> Docker Container (Claude Code)
  ├── Frontend (Vite)  ─────HTTP───────────────> Backend
  └── Workspace ←──────────mount──────────────> /workspace

  Production (Backend in Container)

  Docker Container
  ├── Backend (NestJS) ─────direct CLI call───> Claude Code
  ├── /workspace (mounted volume)
  └── Exposed Port 6060

  Host/External
  └── Frontend ─────HTTP────> Container:6060

  Required Changes

  1. Dockerfile (extend claude-code image)

  FROM your-claude-code-image:latest

  # Copy backend code
  COPY backend /app/backend
  WORKDIR /app/backend

  # Install backend dependencies
  RUN npm install
  RUN npm run build

  # Expose backend port
  EXPOSE 6060

  # Startup script (run both services)
  COPY start.sh /start.sh
  RUN chmod +x /start.sh
  CMD ["/start.sh"]

  2. Backend Service Changes

  Current approach:
  spawn('docker', ['exec', '-e', 'API_KEY=...', 'claude-code', 'bash', '-lc', script])

  Production approach:
  spawn('bash', ['-lc', script])  // or spawn('claude', [...args])

  3. Configuration Simplification

  claude.config.ts would change from:
  this.container = 'claude-code';
  this.hostRoot = 'C:/Data/.../workspace';  // host path
  this.containerRoot = '/workspace';         // container path

  To:
  this.workspaceRoot = '/workspace';  // single path, already in container
  // No container name needed

  4. Path Handling

  - Remove: Path translation between host and container
  - Remove: posixProjectPath conversions
  - Simplify: All paths are native container paths

  5. Script Builder

  Could potentially eliminate the bash wrapper entirely and call Claude CLI directly:

  spawn('claude', [
    '--print', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    // ... other args
  ], {
    cwd: `/workspace/${projectDir}`,
    env: {
      ANTHROPIC_API_KEY: this.config.anthropicKey,
      HOME: `/workspace/${projectDir}/data`,
      // ...
    }
  })

  6. Process Management (start.sh)

  #!/bin/bash
  # Ensure Claude Code is available
  which claude || exit 1

  # Start backend
  cd /app/backend
  node dist/main.js

  7. Benefits

  - ✅ Lower latency - No docker exec overhead
  - ✅ Simpler deployment - Single container
  - ✅ Better resource sharing - Shared file system
  - ✅ Easier scaling - Standard container orchestration
  - ✅ Cleaner code - Remove docker abstraction layer

  8. Considerations

  - Security: API key stored in container (use secrets management)
  - File permissions: Backend and Claude need compatible user permissions
  - Resource limits: Both services share container resources
  - Debugging: Harder to debug than separate processes

  9. Code Changes Needed

  1. Create new Dockerfile extending claude-code
  2. Refactor claude.service.ts - remove docker spawn, use direct CLI
  3. Simplify claude.config.ts - single workspace path
  4. Update script-builder.ts - remove docker exec wrapper
  5. Remove path translation utilities
  6. Add startup script for process management