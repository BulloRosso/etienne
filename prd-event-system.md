I'll help you refine these requirements for your AI application's event handling system. Here's a more structured and detailed version:

# Event Handling System Requirements

## Overview
A ZeroMQ-based event handling system that connects services within a Docker container, processes events through configurable rules, and triggers prompt executions based on defined conditions.

## Architecture

### Core Components
1. **Event Router** - Central ZeroMQ-based message broker using named sockets
2. **Rule Engine** - Evaluates conditions and triggers actions
3. **REST API** - Handles external event ingestion and configuration management
4. **SSE Publisher** - Streams events to frontend for real-time updates

### Event Producers
- **Claude Code**: Hooks & events (e.g., post-tool-use, file creation)
- **Content Management Service** (Node.js): Filesystem events via watchers
- **MQTT Client**: Sensor data and IoT events
- **Scheduling Service** (Node.js): Task execution notifications

## Event Schema

```typescript
interface InternalEvent {
  id: string;           // UUIDv4
  timestamp: string;    // ISO 8601 format
  name: string;         // e.g., "File Created", "MQTT Message Received"
  topic?: string;       // e.g., "/sensors/coffeemachine" (optional)
  group: string;        // e.g., "Filesystem", "MQTT", "Scheduling"
  source: string;       // e.g., "Claude Agent SDK", "CMS Watcher"
  payload: object;      // JSON data specific to event type
}
```

## Rule Engine

### Condition Types
1. **Simple Conditions**: Single event triggers
   - File operations in specific directories
   - MQTT messages on specific topics
   - Time-based scheduling events

2. **Compound Conditions**: Multiple event combinations
   - Logical operators: AND, OR, NOT
   - Time windows for event correlation
   - Sequence matching

3. **Temporal Conditions**
   - Time of day constraints
   - Day of week filters
   - Event frequency thresholds

### Example Rules
```json
{
  "rules": [
    {
      "id": "doc-deletion-alert",
      "name": "Document Deletion Alert",
      "condition": {
        "type": "simple",
        "event": {
          "group": "Filesystem",
          "name": "File Deleted",
          "payload.path": "/workspace/{project}/documents/*"
        }
      },
      "action": {
        "type": "prompt",
        "promptId": "handle-document-deletion"
      }
    },
    {
      "id": "weekend-evening-sensor",
      "name": "Weekend Evening Sensor Alert",
      "condition": {
        "type": "compound",
        "operator": "AND",
        "conditions": [
          {
            "event": {
              "group": "MQTT",
              "topic": "/sensors/*"
            }
          },
          {
            "time": {
              "after": "18:00",
              "dayOfWeek": [0] // Sunday
            }
          }
        ]
      },
      "action": {
        "type": "prompt",
        "promptId": "weekend-sensor-alert"
      }
    }
  ]
}
```

## Technical Implementation

### Backend Structure
```
backend/src/event-handling/
├── core/
│   ├── EventRouter.js         // ZeroMQ message broker
│   ├── RuleEngine.js          // Condition evaluation
│   └── EventStore.js          // Optional: event persistence
├── api/
│   ├── events.js              // POST /api/events (ingestion)
│   ├── rules.js               // CRUD for rules configuration
│   └── webhooks.js            // External webhook management
├── publishers/
│   ├── SSEPublisher.js        // Server-sent events for frontend
│   └── WebhookPublisher.js    // External webhook delivery
└── index.js                   // Service entry point
```

### ZeroMQ Socket Configuration
- **PUB Socket**: Event distribution to subscribers
- **PULL Socket**: Event collection from producers
- **REQ/REP Sockets**: API communication
- **Named Sockets**: `/tmp/etienne-events-{socket-type}`

### API Endpoints

#### Event Ingestion
```
POST /api/events
Content-Type: application/json

{
  "name": "File Created",
  "group": "Filesystem",
  "source": "Content Management",
  "topic": "/workspace/project1/documents",
  "payload": {
    "path": "/workspace/project1/documents/report.pdf",
    "size": 1024
  }
}
```

#### Rule Management
```
GET    /api/rules              // List all rules
POST   /api/rules              // Create new rule
PUT    /api/rules/:id          // Update rule
DELETE /api/rules/:id          // Delete rule
GET    /api/rules/groups       // Get available event groups
```

#### Webhook Configuration
```
GET    /api/webhooks           // List configured webhooks
POST   /api/webhooks           // Add webhook
DELETE /api/webhooks/:id       // Remove webhook
```

## Frontend Implementation

### Route Structure
```
/eventhandling
├── /overview                  // Dashboard with recent events
├── /rules                     // Rule configuration matrix
├── /groups/:groupName         // Group-specific rule management
└── /webhooks                  // External webhook configuration
```

### Event Handling Modal Features
1. **Rule Matrix Display**
   - Grouped by `Event.Group`
   - Visual condition builder
   - Real-time event preview

2. **Condition Builder**
   - Drag-and-drop interface for compound conditions
   - Event payload field selector
   - Time/date constraint picker

3. **Real-time Event Monitor**
   - Live event stream via SSE
   - Event filtering and search
   - Rule execution history

## Configuration

### Environment Variables
```bash
# ZeroMQ Configuration
ZEROMQ_EVENT_SOCKET=/tmp/etienne-events-pub
ZEROMQ_API_SOCKET=/tmp/etienne-events-api

# External Integration
EXTERNAL_WEBHOOKS=https://api.example.com/webhook1,https://hooks.slack.com/webhook2

# Workspace Configuration
WORKSPACE_ROOT=/workspace
PROJECT_CONFIG_DIR=.etienne

# SSE Configuration
SSE_HEARTBEAT_INTERVAL=30000
SSE_MAX_CONNECTIONS=100
```

### Configuration Storage
Rules and settings stored in:
```
/workspace/<project>/.etienne/event-handling.json
```

## Data Flow

1. **Event Production**: Services publish events via ZeroMQ or REST API
2. **Event Routing**: Central router distributes to subscribers
3. **Rule Evaluation**: Rule engine processes events against conditions
4. **Action Execution**: Matching rules trigger prompt execution requests
5. **Frontend Updates**: Real-time events streamed via SSE
6. **External Integration**: Selected events forwarded to configured webhooks

## Security & Limitations

### Security Model
- **No Authentication**: Services assumed to be within same container
- **Named Sockets**: Unix domain sockets for inter-process communication
- **File System Permissions**: Standard Unix permissions for configuration files

### Performance Considerations
- **No Buffering**: Events processed in real-time only
- **Memory-based**: No persistent event storage by default
- **Single Container**: Designed for single-node deployment

### Scope Limitations
- **Prompt Execution**: Out of scope - system only triggers execution requests
- **Event Persistence**: Optional - primarily real-time processing
- **Authentication**: Not implemented - container-internal communication only

This refined specification provides clearer technical details, better structure, and more concrete implementation guidance while maintaining your original vision.

