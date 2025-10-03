// claudeCodeParser.js - Parse Claude Code non-interactive output
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

class ClaudeCodeParser extends EventEmitter {
  constructor() {
    super();
    this.buffer = '';
    this.activeToolCalls = new Map();
    this.activeSubagents = new Map();
    this.pendingPermissions = new Map();
  }

  // Parse different Claude Code output patterns
  parseLine(line) {
    // User message/response (most common)
    if (line.startsWith('Assistant:') || (!line.startsWith('[') && line.trim())) {
      return {
        type: 'user_message',
        content: line.replace('Assistant:', '').trim(),
        timestamp: new Date().toISOString()
      };
    }

    // Tool calls - format: [TOOL_CALL] tool_name(args)
    const toolCallMatch = line.match(/\[TOOL_CALL\]\s+(\w+)\((.*)\)/);
    if (toolCallMatch) {
      const [, toolName, argsStr] = toolCallMatch;
      let args = {};
      try {
        args = JSON.parse(argsStr || '{}');
      } catch (e) {
        args = { raw: argsStr };
      }
      
      const callId = `${toolName}_${Date.now()}`;
      this.activeToolCalls.set(callId, { toolName, args, startTime: Date.now() });
      
      return {
        type: 'tool_call',
        toolName,
        args,
        status: 'running',
        callId
      };
    }

    // Tool results - format: [TOOL_RESULT] result_data
    const toolResultMatch = line.match(/\[TOOL_RESULT\]\s+(.*)/);
    if (toolResultMatch) {
      const [, result] = toolResultMatch;
      const lastCall = Array.from(this.activeToolCalls.entries()).pop();
      
      if (lastCall) {
        const [callId, callData] = lastCall;
        this.activeToolCalls.delete(callId);
        
        return {
          type: 'tool_call',
          toolName: callData.toolName,
          args: callData.args,
          status: 'complete',
          result,
          callId
        };
      }
    }

    // Permission requests - format: [PERMISSION_REQUIRED] message
    const permissionMatch = line.match(/\[PERMISSION_REQUIRED\]\s+(.*)/);
    if (permissionMatch) {
      const [, message] = permissionMatch;
      const permissionId = `perm_${Date.now()}`;
      
      this.pendingPermissions.set(permissionId, {
        message,
        timestamp: Date.now(),
        resolved: false
      });
      
      return {
        type: 'permission_request',
        permissionId,
        message
      };
    }

    // Errors - format: [ERROR] error_message
    const errorMatch = line.match(/\[ERROR\]\s+(.*)/);
    if (errorMatch) {
      return {
        type: 'error',
        message: errorMatch[1],
        timestamp: new Date().toISOString()
      };
    }

    // Subagent start - format: [SUBAGENT_START] name
    const subagentStartMatch = line.match(/\[SUBAGENT_START\]\s+(.*)/);
    if (subagentStartMatch) {
      const name = subagentStartMatch[1];
      this.activeSubagents.set(name, { startTime: Date.now() });
      
      return {
        type: 'subagent_start',
        name,
        status: 'active'
      };
    }

    // Subagent end - format: [SUBAGENT_END] name
    const subagentEndMatch = line.match(/\[SUBAGENT_END\]\s+(.*)/);
    if (subagentEndMatch) {
      const name = subagentEndMatch[1];
      this.activeSubagents.delete(name);
      
      return {
        type: 'subagent_end',
        name,
        status: 'complete'
      };
    }

    return null;
  }

  parseChunk(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    
    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || '';
    
    const events = [];
    for (const line of lines) {
      const event = this.parseLine(line.trim());
      if (event) {
        events.push(event);
      }
    }
    
    return events;
  }

  resolvePermission(permissionId, approved) {
    const perm = this.pendingPermissions.get(permissionId);
    if (perm && !perm.resolved) {
      perm.resolved = true;
      perm.response = approved;
      return true;
    }
    return false;
  }
}

// sseHandler.js - Express SSE endpoint handler
export class ClaudeCodeSSEHandler {
  constructor() {
    this.clients = new Set();
    this.parser = new ClaudeCodeParser();
    this.claudeProcess = null;
  }

  // Add SSE client
  addClient(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    this.clients.add(res);

    // Send initial connection message
    this.sendToClient(res, {
      type: 'connection',
      status: 'connected',
      timestamp: new Date().toISOString()
    });

    // Handle client disconnect
    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  // Send event to specific client
  sendToClient(client, data) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  // Broadcast to all clients
  broadcast(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }

  // Start Claude Code process
  startClaudeCode(command, args = []) {
    this.claudeProcess = spawn('claude', ['code', '--non-interactive', ...args, command], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Handle stdout
    this.claudeProcess.stdout.on('data', (chunk) => {
      const events = this.parser.parseChunk(chunk.toString());
      events.forEach(event => this.broadcast(event));
    });

    // Handle stderr
    this.claudeProcess.stderr.on('data', (chunk) => {
      this.broadcast({
        type: 'error',
        message: 'Process error',
        details: chunk.toString()
      });
    });

    // Handle process exit
    this.claudeProcess.on('close', (code) => {
      this.broadcast({
        type: 'completion',
        exitCode: code,
        timestamp: new Date().toISOString()
      });
    });

    return this.claudeProcess;
  }

  // Handle permission response from client
  handlePermissionResponse(permissionId, approved) {
    const resolved = this.parser.resolvePermission(permissionId, approved);
    
    if (resolved && this.claudeProcess) {
      // Send approval/denial to Claude Code stdin
      this.claudeProcess.stdin.write(approved ? 'y\n' : 'n\n');
      return true;
    }
    
    return false;
  }

  // Cleanup
  cleanup() {
    if (this.claudeProcess) {
      this.claudeProcess.kill();
    }
    
    for (const client of this.clients) {
      client.end();
    }
    
    this.clients.clear();
  }
}

// Express route setup example
export function setupClaudeCodeRoutes(app) {
  const handler = new ClaudeCodeSSEHandler();

  // SSE stream endpoint
  app.get('/api/claude-code/stream', (req, res) => {
    handler.addClient(res);
  });

  // Start Claude Code task
  app.post('/api/claude-code/start', (req, res) => {
    const { command, args } = req.body;
    
    try {
      handler.startClaudeCode(command, args);
      res.json({ success: true, message: 'Claude Code started' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Handle permission responses
  app.post('/api/claude-code/permission', (req, res) => {
    const { permissionId, approved } = req.body;
    
    const resolved = handler.handlePermissionResponse(permissionId, approved);
    
    if (resolved) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: 'Permission not found or already resolved' });
    }
  });

  // Cleanup on server shutdown
  process.on('SIGINT', () => {
    handler.cleanup();
    process.exit();
  });

  return handler;
}

export { ClaudeCodeParser };