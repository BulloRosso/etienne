import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { DataFactory } from 'rdf-data-factory';
import { ClassicLevel } from 'classic-level';
import { Quadstore } from 'quadstore';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = 7000;
const dataFactory = new DataFactory();
const stores = new Map();
const backends = new Map();

// Get workspace directory from environment or use default
const WORKSPACE_DIR = process.env.WORKSPACE_DIR
  ? path.resolve(__dirname, process.env.WORKSPACE_DIR)
  : path.join(__dirname, '..', 'workspace');

console.log(`📁 Using workspace directory: ${WORKSPACE_DIR}`);

// Initialize Quadstore for a project
async function initializeStore(project) {
  if (stores.has(project)) {
    return stores.get(project);
  }

  // Store data in workspace/<project>/knowledge-graph directory
  const dataDir = path.join(WORKSPACE_DIR, project, 'knowledge-graph');

  // Ensure directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  try {
    const backend = new ClassicLevel(dataDir);
    const store = new Quadstore({
      backend: backend,
      dataFactory: dataFactory
    });

    await store.open();

    stores.set(project, store);
    backends.set(project, backend);

    console.log(`✅ Quadstore initialized for project: ${project}`);
    return store;
  } catch (error) {
    console.error(`❌ Failed to initialize Quadstore for ${project}:`, error.message);
    throw error;
  }
}

// Close store for a project
async function closeStore(project) {
  const store = stores.get(project);
  if (store && store.close) {
    await store.close();
    stores.delete(project);
    backends.delete(project);
  }
}

// Build an object term from request fields.
// objectType 'literal' produces a literal, optionally typed (datatype IRI) or language-tagged.
function buildObjectTerm({ object, objectType, datatype, language }) {
  if (objectType === 'literal') {
    if (language) return dataFactory.literal(object, language);
    if (datatype) return dataFactory.literal(object, dataFactory.namedNode(datatype));
    return dataFactory.literal(object);
  }
  return dataFactory.namedNode(object);
}

// Build the graph term. Omitted/null → default graph (backward compatible).
function buildGraphTerm(graph) {
  if (!graph || graph === 'default') return dataFactory.defaultGraph();
  return dataFactory.namedNode(graph);
}

// Build a full quad from a JSON quad description.
function buildQuad(q) {
  return dataFactory.quad(
    dataFactory.namedNode(q.subject),
    dataFactory.namedNode(q.predicate),
    buildObjectTerm(q),
    buildGraphTerm(q.graph)
  );
}

// Serialize a quad term for JSON responses.
function serializeQuad(quad) {
  const object = {
    type: quad.object.termType,
    value: quad.object.value
  };
  if (quad.object.termType === 'Literal') {
    if (quad.object.language) object.language = quad.object.language;
    if (quad.object.datatype) object.datatype = quad.object.datatype.value;
  }
  return {
    subject: { type: quad.subject.termType, value: quad.subject.value },
    predicate: { type: quad.predicate.termType, value: quad.predicate.value },
    object,
    graph: quad.graph.termType === 'DefaultGraph'
      ? { type: 'DefaultGraph', value: '' }
      : { type: quad.graph.termType, value: quad.graph.value }
  };
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'quadstore',
    projects: Array.from(stores.keys())
  });
});

// Add a quad (triple; optional graph/datatype/language)
app.post('/:project/quad', async (req, res) => {
  try {
    const { project } = req.params;
    const store = await initializeStore(project);
    await store.put(buildQuad(req.body));
    res.json({ success: true, message: 'Quad added' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a quad (optional graph/datatype/language)
app.delete('/:project/quad', async (req, res) => {
  try {
    const { project } = req.params;
    const store = await initializeStore(project);
    await store.del(buildQuad(req.body));
    res.json({ success: true, message: 'Quad deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Atomic batch write: deletes then puts, each as one LevelDB batch.
// Body: { dels: Quad[], puts: Quad[] } with the same quad shape as /quad.
app.post('/:project/batch', async (req, res) => {
  try {
    const { project } = req.params;
    const { dels = [], puts = [] } = req.body;
    const store = await initializeStore(project);

    if (dels.length > 0) {
      await store.multiDel(dels.map(buildQuad));
    }
    if (puts.length > 0) {
      await store.multiPut(puts.map(buildQuad));
    }

    res.json({ success: true, deleted: dels.length, added: puts.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete every quad in one named graph (used for mirror-graph rewrites).
// Body: { graph: '<iri>' } — deleting the default graph is deliberately not allowed.
app.delete('/:project/graph', async (req, res) => {
  try {
    const { project } = req.params;
    const { graph } = req.body;
    if (!graph || graph === 'default') {
      return res.status(400).json({ success: false, error: 'A named graph IRI is required' });
    }

    const store = await initializeStore(project);
    const g = dataFactory.namedNode(graph);
    const stream = await store.match(null, null, null, g);
    const quads = [];
    for await (const quad of stream) {
      quads.push(quad);
    }
    if (quads.length > 0) {
      await store.multiDel(quads);
    }

    res.json({ success: true, deleted: quads.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Match/query quads.
// graph: omitted → all graphs (backward compatible), 'default' → default graph only, IRI → that graph.
// objectType 'literal' (with optional datatype/language) matches literal objects.
app.post('/:project/match', async (req, res) => {
  try {
    const { project } = req.params;
    const { subject, predicate, object, objectType, datatype, language, graph } = req.body;

    const store = await initializeStore(project);

    const s = subject ? dataFactory.namedNode(subject) : null;
    const p = predicate ? dataFactory.namedNode(predicate) : null;
    const o = object ? buildObjectTerm({ object, objectType, datatype, language }) : null;
    const g = graph === undefined || graph === null ? null : buildGraphTerm(graph);

    const results = [];
    try {
      const stream = await store.match(s, p, o, g);
      for await (const quad of stream) {
        results.push(serializeQuad(quad));
      }
    } catch (error) {
      // Quadstore has no index for some pattern/graph combinations (e.g. object+graph
      // with wildcard subject/predicate). Fall back to matching across all graphs and
      // filtering here — correct, just less efficient.
      if (g && /No index compatible/i.test(error.message)) {
        const stream = await store.match(s, p, o, null);
        const wanted = g.termType === 'DefaultGraph' ? '' : g.value;
        for await (const quad of stream) {
          const quadGraph = quad.graph.termType === 'DefaultGraph' ? '' : quad.graph.value;
          if (quadGraph === wanted) results.push(serializeQuad(quad));
        }
      } else {
        throw error;
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete all quads for an entity (subject or object)
app.delete('/:project/entity/:entityUri', async (req, res) => {
  try {
    const { project, entityUri } = req.params;
    const store = await initializeStore(project);

    const entity = dataFactory.namedNode(entityUri);

    // Delete all quads where entity is subject
    const subjectStream = await store.match(entity, null, null, null);
    for await (const quad of subjectStream) {
      await store.del(quad);
    }

    // Delete all quads where entity is object
    const objectStream = await store.match(null, null, entity, null);
    for await (const quad of objectStream) {
      await store.del(quad);
    }

    res.json({ success: true, message: 'Entity deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get statistics
app.get('/:project/stats', async (req, res) => {
  try {
    const { project } = req.params;
    const store = await initializeStore(project);

    const rdfType = dataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
    const baseUri = 'http://example.org/kg/';

    let totalQuads = 0;
    const entityTypes = {
      Person: 0,
      Company: 0,
      Product: 0,
      Document: 0
    };

    // Count total quads
    const allQuadsStream = await store.match(null, null, null, null);
    for await (const quad of allQuadsStream) {
      totalQuads++;
    }

    // Count entities by type
    for (const entityType of ['Person', 'Company', 'Product', 'Document']) {
      const typeUri = dataFactory.namedNode(`${baseUri}${entityType}`);
      const entitiesStream = await store.match(null, rdfType, typeUri, null);
      let count = 0;
      for await (const quad of entitiesStream) {
        count++;
      }
      entityTypes[entityType] = count;
    }

    const entityCount = Object.values(entityTypes).reduce((sum, count) => sum + count, 0);

    res.json({
      success: true,
      stats: {
        totalQuads,
        entityCount,
        entityTypes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Close store for a project
app.post('/:project/close', async (req, res) => {
  try {
    const { project } = req.params;
    await closeStore(project);
    res.json({ success: true, message: 'Store closed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  for (const [project, store] of stores.entries()) {
    console.log(`  Closing store for project: ${project}`);
    await closeStore(project);
  }
  console.log('👋 Goodbye!');
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Quadstore service running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
