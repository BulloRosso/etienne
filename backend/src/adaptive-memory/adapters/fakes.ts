/**
 * In-memory fake adapters for Adaptive-Memory integration tests.
 *
 * Each fake honours its interface exactly. Behaviour aims to be the simplest
 * possible thing that lets the Picker/Packer/Agent flow exercise its real
 * code path:
 *   - WikiFake: keyword search is naïve substring scoring; getPage returns
 *     whole pages (per PRD §5.2 whole-page rule).
 *   - KGFake: in-memory triple store; subgraph walks edges BFS to `depth`.
 *   - RAGFake: returns fragments filtered by classification; no embeddings.
 *   - SORFake: hand-registered connectors, each with a `read` callback.
 *   - PreferencesFake: simple intent → preference list.
 *
 * Fakes deliberately do NOT enforce the firewall: that's the writeback tool's
 * job at the boundary. Tests construct fakes pre-loaded with already-classified
 * entries so the Packer's classification ceiling can be exercised cleanly.
 */

import type {
  Classification,
  KGEdge,
  KGEntity,
  Preference,
  RAGFragment,
  WikiPage,
} from '../../memory/types';
import type {
  KGAdapter,
  PreferencesAdapter,
  RAGAdapter,
  SORAdapter,
  SORConnector,
  WikiAdapter,
  WikiPageSource,
} from './adapter.types';

// --- WikiFake ------------------------------------------------------------

export class WikiFake implements WikiAdapter {
  /** project → slug → WikiPage. Pages are stored whole; never split. */
  pages = new Map<string, Map<string, WikiPage>>();

  seed(project: string, page: WikiPage): void {
    if (!this.pages.has(project)) this.pages.set(project, new Map());
    this.pages.get(project)!.set(page.slug, page);
  }

  async getPage(project: string, slug: string): Promise<WikiPage | null> {
    return this.pages.get(project)?.get(slug) ?? null;
  }

  async search(
    project: string,
    keywords: string[],
    opts?: { limit?: number },
  ): Promise<Array<{ slug: string; score: number }>> {
    const pages = this.pages.get(project);
    if (!pages) return [];
    const lowered = keywords.map((k) => k.toLowerCase());
    const hits: Array<{ slug: string; score: number }> = [];
    for (const page of pages.values()) {
      const haystack = `${page.title}\n${page.body}\n${page.links.join(' ')}`.toLowerCase();
      let score = 0;
      for (const kw of lowered) if (haystack.includes(kw)) score += 1;
      if (score > 0) hits.push({ slug: page.slug, score });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, opts?.limit ?? hits.length);
  }

  async putPage(
    project: string,
    input: {
      title: string;
      slug?: string;
      body: string;
      tags?: string[];
      sources: WikiPageSource[];
      classification: Classification;
      provenance: import('../../memory/types').Provenance;
    },
  ): Promise<{ slug: string }> {
    const slug =
      input.slug ?? input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const page: WikiPage = {
      id: slug,
      classification: input.classification,
      provenance: input.provenance,
      title: input.title,
      slug,
      body: input.body,
      links: [],
    };
    this.seed(project, page);
    return { slug };
  }

  async delete(project: string, slug: string): Promise<{ noop: boolean }> {
    const m = this.pages.get(project);
    if (!m || !m.has(slug)) return { noop: true };
    m.delete(slug);
    return { noop: false };
  }
}

// --- KGFake --------------------------------------------------------------

export class KGFake implements KGAdapter {
  entities = new Map<string, Map<string, KGEntity>>();
  edges = new Map<string, KGEdge[]>();

  seedEntity(project: string, e: KGEntity): void {
    if (!this.entities.has(project)) this.entities.set(project, new Map());
    this.entities.get(project)!.set(e.id, e);
  }

  seedEdge(project: string, edge: KGEdge): void {
    if (!this.edges.has(project)) this.edges.set(project, []);
    this.edges.get(project)!.push(edge);
  }

  async subgraph(
    project: string,
    rootId: string,
    depth: number,
  ): Promise<{ entities: KGEntity[]; edges: KGEdge[] }> {
    const projEntities = this.entities.get(project) ?? new Map();
    const projEdges = this.edges.get(project) ?? [];

    const visitedEntities = new Set<string>();
    const visitedEdges = new Set<KGEdge>();
    const frontier = new Set<string>([rootId]);

    for (let d = 0; d <= depth; d++) {
      const next = new Set<string>();
      for (const id of frontier) {
        if (visitedEntities.has(id)) continue;
        visitedEntities.add(id);
        if (d === depth) continue;
        for (const edge of projEdges) {
          if (edge.subject === id) {
            visitedEdges.add(edge);
            next.add(edge.object);
          }
          if (edge.object === id) {
            visitedEdges.add(edge);
            next.add(edge.subject);
          }
        }
      }
      if (next.size === 0) break;
      frontier.clear();
      next.forEach((n) => frontier.add(n));
    }
    return {
      entities: [...visitedEntities]
        .map((id) => projEntities.get(id))
        .filter((e): e is KGEntity => Boolean(e)),
      edges: [...visitedEdges],
    };
  }

  async assertEntity(project: string, entity: KGEntity): Promise<void> {
    this.seedEntity(project, entity);
  }

  async assertEdge(project: string, edge: KGEdge): Promise<void> {
    this.seedEdge(project, edge);
  }

  async prune(project: string, entityIds: string[]): Promise<{ removed: number }> {
    const m = this.entities.get(project);
    if (!m) return { removed: 0 };
    let removed = 0;
    for (const id of entityIds) {
      if (m.delete(id)) removed += 1;
    }
    // Drop any edges that referenced removed entities.
    const edges = this.edges.get(project);
    if (edges) {
      this.edges.set(
        project,
        edges.filter(
          (e) => m.has(e.subject) && m.has(e.object),
        ),
      );
    }
    return { removed };
  }
}

// --- RAGFake -------------------------------------------------------------

export class RAGFake implements RAGAdapter {
  fragments = new Map<string, RAGFragment[]>();

  seed(project: string, fragment: RAGFragment): void {
    if (!this.fragments.has(project)) this.fragments.set(project, []);
    this.fragments.get(project)!.push(fragment);
  }

  async query(
    project: string,
    text: string,
    opts: { topK: number; classificationFilter?: Classification[] },
  ): Promise<RAGFragment[]> {
    const all = this.fragments.get(project) ?? [];
    const lowered = text.toLowerCase();
    const filter = opts.classificationFilter
      ? new Set(opts.classificationFilter)
      : null;
    const scored = all
      .filter((f) => !filter || filter.has(f.classification))
      .map((f) => {
        const hay = `${f.text}\n${f.tags.join(' ')}`.toLowerCase();
        // Crude similarity: count keyword matches; ties broken by tag matches.
        const score = lowered
          .split(/\s+/)
          .filter(Boolean)
          .reduce((s, kw) => s + (hay.includes(kw) ? 1 : 0), 0);
        return { fragment: f, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, opts.topK).map((x) => x.fragment);
  }

  async index(project: string, fragment: RAGFragment): Promise<void> {
    this.seed(project, fragment);
  }

  async delete(project: string, id: string): Promise<{ removed: boolean }> {
    const arr = this.fragments.get(project);
    if (!arr) return { removed: false };
    const before = arr.length;
    this.fragments.set(
      project,
      arr.filter((f) => f.id !== id),
    );
    return { removed: arr.length !== before };
  }
}

// --- SORFake -------------------------------------------------------------

export class SORFake implements SORAdapter {
  private connectors = new Map<string, Map<string, SORConnector & { read: (q: unknown) => unknown }>>();

  register(
    project: string,
    name: string,
    description: string,
    read: (query: unknown) => unknown,
  ): void {
    if (!this.connectors.has(project)) this.connectors.set(project, new Map());
    this.connectors.get(project)!.set(name, { name, description, read });
  }

  async listAvailable(project: string): Promise<SORConnector[]> {
    const m = this.connectors.get(project);
    if (!m) return [];
    return [...m.values()].map(({ name, description }) => ({ name, description }));
  }

  async read(
    project: string,
    connector: string,
    query: unknown,
  ): Promise<{ source: string; payload: unknown }> {
    const c = this.connectors.get(project)?.get(connector);
    if (!c) throw new Error(`unknown SOR connector: ${connector}`);
    return { source: connector, payload: c.read(query) };
  }
}

// --- PreferencesFake -----------------------------------------------------

export class PreferencesFake implements PreferencesAdapter {
  prefs = new Map<string, Preference[]>();

  seed(project: string, pref: Preference): void {
    if (!this.prefs.has(project)) this.prefs.set(project, []);
    this.prefs.get(project)!.push(pref);
  }

  async matching(project: string, intent: string): Promise<Preference[]> {
    const all = this.prefs.get(project) ?? [];
    const lowered = intent.toLowerCase();
    const intentWords = new Set(lowered.split(/\s+/).filter(Boolean));
    return all.filter((p) => {
      const subject = p.subject?.toLowerCase();
      if (subject && lowered.includes(subject)) return true;
      // Match when any *meaningful* statement word (length ≥ 3) overlaps the
      // intent. Short common words like "of" would over-match.
      return p.statement
        .toLowerCase()
        .split(/\s+/)
        .some((w) => w.length >= 3 && intentWords.has(w));
    });
  }

  async record(project: string, pref: Preference): Promise<void> {
    this.seed(project, pref);
  }
}
