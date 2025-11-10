#!/usr/bin/env node

// Bridge process to load and manage ES modules for CommonJS environment
import { createServer } from 'net';

const PORT = process.env.ESM_BRIDGE_PORT || 0; // 0 = random available port

class QuadstoreBridge {
  constructor() {
    this.stores = new Map();
    this.DataFactory = null;
  }

  async initialize(project, dataDir) {
    if (this.stores.has(project)) {
      return { success: true, message: 'Already initialized' };
    }

    try {
      const rdfDataFactory = await import('rdf-data-factory');
      const classicLevelModule = await import('classic-level');
      const quadstoreModule = await import('quadstore');

      if (!this.DataFactory) {
        this.DataFactory = new rdfDataFactory.DataFactory();
      }

      const backend = new classicLevelModule.ClassicLevel(dataDir);
      const store = new quadstoreModule.Quadstore({
        backend: backend,
        dataFactory: this.DataFactory
      });

      await store.open();
      this.stores.set(project, { store, backend });

      return { success: true, message: `Quadstore initialized for ${project}` };
    } catch (error) {
      return { success: false, error: error.message, stack: error.stack };
    }
  }

  async close(project) {
    const storeData = this.stores.get(project);
    if (storeData) {
      await storeData.store.close();
      this.stores.delete(project);
      return { success: true };
    }
    return { success: false, error: 'Store not found' };
  }

  async put(project, quad) {
    const storeData = this.stores.get(project);
    if (!storeData) {
      return { success: false, error: 'Store not initialized' };
    }

    try {
      await storeData.store.put(this.deserializeQuad(quad));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async match(project, subject, predicate, object) {
    const storeData = this.stores.get(project);
    if (!storeData) {
      return { success: false, error: 'Store not initialized' };
    }

    try {
      const s = subject ? this.DataFactory.namedNode(subject) : null;
      const p = predicate ? this.DataFactory.namedNode(predicate) : null;
      const o = object ? this.DataFactory.namedNode(object) : null;

      const stream = await storeData.store.match(s, p, o, null);
      const results = [];

      for await (const quad of stream) {
        results.push(this.serializeQuad(quad));
      }

      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  serializeQuad(quad) {
    return {
      subject: { type: quad.subject.termType, value: quad.subject.value },
      predicate: { type: quad.predicate.termType, value: quad.predicate.value },
      object: { type: quad.object.termType, value: quad.object.value }
    };
  }

  deserializeQuad(quad) {
    const s = quad.subject.type === 'NamedNode'
      ? this.DataFactory.namedNode(quad.subject.value)
      : this.DataFactory.literal(quad.subject.value);
    const p = this.DataFactory.namedNode(quad.predicate.value);
    const o = quad.object.type === 'NamedNode'
      ? this.DataFactory.namedNode(quad.object.value)
      : this.DataFactory.literal(quad.object.value);

    return this.DataFactory.quad(s, p, o);
  }
}

const bridge = new QuadstoreBridge();

const server = createServer((socket) => {
  socket.on('data', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      let response;

      switch (message.action) {
        case 'initialize':
          response = await bridge.initialize(message.project, message.dataDir);
          break;
        case 'close':
          response = await bridge.close(message.project);
          break;
        case 'put':
          response = await bridge.put(message.project, message.quad);
          break;
        case 'match':
          response = await bridge.match(message.project, message.subject, message.predicate, message.object);
          break;
        default:
          response = { success: false, error: 'Unknown action' };
      }

      socket.write(JSON.stringify(response) + '\n');
    } catch (error) {
      socket.write(JSON.stringify({ success: false, error: error.message }) + '\n');
    }
  });
});

server.listen(PORT, () => {
  const addr = server.address();
  console.log(JSON.stringify({ type: 'ready', port: addr.port }));
});
