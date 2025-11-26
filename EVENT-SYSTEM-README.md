# Event Handling System

## Overview

The Event Handling System enables automated responses to events occurring within the application. It uses a ZeroMQ-based event router, a rule engine with multiple condition types, and integrates with vector and RDF stores for semantic and knowledge-graph queries.

## Architecture

### Backend Components

- **EventRouter** (`backend/src/event-handling/core/event-router.service.ts`)
  - ZeroMQ PUB/PULL sockets for event distribution
  - Named pipes: `ipc:///tmp/etienne-events-pub` and `ipc:///tmp/etienne-events-pull`

- **RuleEngine** (`backend/src/event-handling/core/rule-engine.service.ts`)
  - Evaluates events against configured rules
  - Supports 5 condition types: simple, semantic, knowledge-graph, compound, temporal

- **EventStore** (`backend/src/event-handling/core/event-store.service.ts`)
  - Stores only events that trigger rules
  - Archives to vector store (embeddings) + RDF store (metadata)
  - Writes to `workspace/<project>/.etienne/event-log/<date>.jsonl`

- **SSEPublisher** (`backend/src/event-handling/publishers/sse-publisher.service.ts`)
  - Real-time event streaming to frontend
  - Heartbeat every 30 seconds

### Event Sources

Events are automatically published from:
- **Claude Code Hooks** - File operations (created, modified), tool usage
- **MQTT Client** - IoT sensor messages
- **Scheduler** - Task execution (to be integrated)
- **Manual API** - External systems via `POST /api/events/:project`

## Event Schema

```typescript
interface InternalEvent {
  id: string;           // Auto-generated UUID
  timestamp: string;    // Auto-generated ISO 8601
  name: string;         // e.g., "File Created", "MQTT Message Received"
  topic?: string;       // e.g., "/sensors/temperature" (optional)
  group: string;        // "Filesystem", "MQTT", "Scheduling", "Claude Code"
  source: string;       // e.g., "Claude Agent SDK", "MQTT Client"
  payload: object;      // Event-specific data
}
```

## Condition Types

### 1. Simple Condition
Exact pattern matching on event fields.

```json
{
  "type": "simple",
  "event": {
    "group": "Claude Code",
    "name": "File Created",
    "payload.path": "*.py"
  }
}
```

Supports:
- Exact field matching
- Wildcard patterns (`*` and `**`)
- Nested payload field matching with `payload.` prefix

### 2. Semantic Condition
Vector similarity search using embeddings (threshold: 0.86).

```json
{
  "type": "semantic",
  "event": {
    "group": "Claude Code",
    "payload": {
      "similarity": {
        "query": "error exception failure crash bug",
        "threshold": 0.86,
        "tags": ["filesystem"]
      }
    }
  }
}
```

### 3. Knowledge-Graph Condition
SPARQL queries against RDF store.

```json
{
  "type": "knowledge-graph",
  "sparqlQuery": "SELECT ?event WHERE { ?event etienne:group 'Filesystem' . }"
}
```

### 4. Compound Condition
Logical combinations of conditions.

```json
{
  "type": "compound",
  "operator": "AND",
  "conditions": [
    {
      "type": "simple",
      "event": { "group": "MQTT" }
    },
    {
      "time": {
        "after": "18:00",
        "dayOfWeek": [0, 6]
      }
    }
  ],
  "timeWindow": 300000
}
```

Operators: `AND`, `OR`, `NOT`

### 5. Temporal Constraint
Time-based filtering.

```json
{
  "time": {
    "after": "09:00",
    "before": "17:00",
    "dayOfWeek": [1, 2, 3, 4, 5]
  }
}
```

## Configuration

### Rule Configuration File

Rules are stored per project:
```
workspace/<project>/.etienne/event-handling.json
```

Example:
```json
{
  "rules": [
    {
      "id": "file-created-python",
      "name": "Python File Created Alert",
      "enabled": true,
      "condition": {
        "type": "simple",
        "event": {
          "group": "Claude Code",
          "name": "File Created",
          "payload.path": "*.py"
        }
      },
      "action": {
        "type": "prompt",
        "promptId": "analyze-python-file"
      },
      "createdAt": "2025-11-24T00:00:00.000Z",
      "updatedAt": "2025-11-24T00:00:00.000Z"
    }
  ]
}
```

See `event-handling.example.json` for more examples.

## API Endpoints

### Event Ingestion
```http
POST /api/events/:project
Content-Type: application/json

{
  "name": "File Created",
  "group": "Filesystem",
  "source": "External System",
  "topic": "/workspace/docs",
  "payload": {
    "path": "/workspace/project1/docs/readme.md",
    "size": 1024
  }
}
```

### Rule Management
```http
GET    /api/rules/:project              # List all rules
POST   /api/rules/:project              # Create rule
PUT    /api/rules/:project/:ruleId      # Update rule
DELETE /api/rules/:project/:ruleId      # Delete rule
GET    /api/rules/:project/groups       # Get event groups
```

### Event Search
```http
GET /api/events/:project/search?q=error&limit=10    # Semantic search
GET /api/events/:project/range?start=2025-11-01&end=2025-11-24  # Date range
```

### Real-Time Stream
```http
GET /api/events/:project/stream    # Server-Sent Events (SSE)
```

## Frontend

Access the Event Handling UI by clicking the event icon (📝) in the top toolbar.

Features:
- View and manage rules
- Real-time event monitoring
- Enable/disable rules
- Delete rules

## Event Storage

### Storage Policy
- Events are **ephemeral** by default
- Only events that **trigger rules** are stored
- Storage locations:
  1. **Vector Store** - Embeddings for semantic search
  2. **RDF Store** - Structured metadata and relationships
  3. **File Log** - `workspace/<project>/.etienne/event-log/<YYYY-MM-DD>.jsonl`

### Event Log Format
```jsonl
{"event": {...}, "triggeredRules": ["rule-id-1"], "timestamp": "..."}
```

## Integration Examples

### From Claude Code Hooks
Automatically published when files are created/modified:
```typescript
// backend/src/claude/sdk/sdk-hook-emitter.service.ts
await eventRouter.publishEvent({
  name: 'File Created',
  group: 'Claude Code',
  source: 'Claude Agent SDK',
  payload: { path: '/workspace/project1/app.py' }
});
```

### From MQTT
Automatically published on message receipt:
```typescript
// backend/src/external-events/mqtt-client.service.ts
await eventRouter.publishEvent({
  name: 'MQTT Message Received',
  group: 'MQTT',
  source: 'MQTT Client',
  topic: '/sensors/temperature',
  payload: { message: '22.5', qos: 0 }
});
```

### External API
```bash
curl -X POST http://localhost:6060/api/events/my-project \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Custom Event",
    "group": "External",
    "source": "MyApp",
    "payload": { "data": "example" }
  }'
```

## Development

### Start the Backend
```bash
cd backend
npm run dev
```

### Start the Frontend
```bash
cd frontend
npm run dev
```

### Create a Test Rule
1. Create `workspace/<project>/.etienne/event-handling.json`
2. Add a rule (see example above)
3. Trigger an event (e.g., create a file with Claude Code)
4. Check frontend for live events

### Debug
- Backend logs: Check console output
- Frontend: Open browser DevTools → Network → EventSource
- Event logs: `workspace/<project>/.etienne/event-log/`

## Troubleshooting

### No events appearing
1. Check backend is running
2. Verify project name matches
3. Check SSE connection in Network tab
4. Ensure rule is `"enabled": true`

### Rule not triggering
1. Check condition matches event fields exactly
2. Review backend logs for errors
3. Test with simple condition first
4. Verify event group/name match

### ZeroMQ errors
- Ensure `/tmp` directory exists and is writable
- Check no other process is using the sockets
- Restart backend service

## Future Enhancements

- Visual rule builder (drag-and-drop)
- Rule templates library
- Event replay from logs
- Rule effectiveness analytics
- Scheduler integration
- Webhook actions
