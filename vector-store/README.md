# Quadstore RDF Triple Store Service

This is a standalone service that provides RDF triple store functionality using Quadstore and ClassicLevel.

## Why a Separate Service?

Quadstore is an ES module-only package that cannot be directly imported in the CommonJS backend environment. Running it as a separate service solves this module compatibility issue.

## Installation

```bash
cd vector-store
npm install
```

## Running the Service

```bash
npm start
```

The service will start on port 7000.

## Development Mode

```bash
npm run dev
```

This uses Node's `--watch` flag to auto-restart on file changes.

## API Endpoints

### Health Check
```
GET /health
```

### Add a Quad (Triple)
```
POST /:project/quad
{
  "subject": "http://example.org/kg/entity1",
  "predicate": "http://example.org/kg/hasProperty",
  "object": "value",
  "objectType": "literal"  // or "namedNode"
}
```

### Delete a Quad
```
DELETE /:project/quad
{
  "subject": "http://example.org/kg/entity1",
  "predicate": "http://example.org/kg/hasProperty",
  "object": "value",
  "objectType": "literal"
}
```

### Match/Query Quads
```
POST /:project/match
{
  "subject": "http://example.org/kg/entity1",  // null to match any
  "predicate": null,
  "object": null
}
```

### Delete Entity
```
DELETE /:project/entity/:entityUri
```

### Get Statistics
```
GET /:project/stats
```

### Close Store
```
POST /:project/close
```

## Data Storage

Data is stored in `vector-store/data/<project-name>` directory using ClassicLevel.

## Environment Variables

- `QUADSTORE_URL` - URL of the Quadstore service (default: `http://localhost:7000`)

## Graceful Shutdown

The service handles SIGINT (Ctrl+C) gracefully, closing all open stores before exiting.
