/**
 * Fake adapters for DecisionSupportService tests.
 *
 * Why fakes (not mocks): the dreaming/adaptive-memory tests in this folder
 * use the same pattern — small, full-behavior fakes seeded per test. They
 * give us:
 *   - no Quadstore / LevelDB on disk → tests run in milliseconds
 *   - full coverage of the entity/relationship surface used by
 *     DecisionSupportService
 *   - explicit, inspectable state for assertions
 *
 * Methods covered match the surface in
 * backend/src/ontology-core/decision-support.service.ts:
 *   addEntity, addRelationship, findEntityById, findEntitiesByType,
 *   findAllEntityTypes, findRelationshipsByEntity, deleteEntity.
 */

export interface FakeEntityRecord {
  id: string;
  type: string;
  [k: string]: any;
}

export interface FakeRelationship {
  subject: string;
  predicate: string;
  object: string;
}

export interface FakeRelationshipResult extends FakeRelationship {
  direction: 'outgoing' | 'incoming';
}

/**
 * In-memory implementation of the slice of KnowledgeGraphService used by
 * DecisionSupportService. Per-project storage: project name → entities/rels.
 */
export class FakeKnowledgeGraphService {
  private entities = new Map<string, Map<string, FakeEntityRecord>>(); // project → id → entity
  private rels = new Map<string, FakeRelationship[]>(); // project → relationships

  private getEntities(project: string): Map<string, FakeEntityRecord> {
    if (!this.entities.has(project)) this.entities.set(project, new Map());
    return this.entities.get(project)!;
  }

  private getRels(project: string): FakeRelationship[] {
    if (!this.rels.has(project)) this.rels.set(project, []);
    return this.rels.get(project)!;
  }

  async addEntity(
    project: string,
    payload: { id: string; type: string; properties: Record<string, any> },
  ): Promise<void> {
    const map = this.getEntities(project);
    // Upsert semantics: matches the production service which calls addEntity
    // for both create and update (e.g. updateActionStatus).
    map.set(payload.id, { id: payload.id, type: payload.type, ...payload.properties });
  }

  async findEntityById(project: string, id: string): Promise<FakeEntityRecord | null> {
    return this.getEntities(project).get(id) ?? null;
  }

  async findEntitiesByType(project: string, type: string): Promise<FakeEntityRecord[]> {
    const result: FakeEntityRecord[] = [];
    for (const e of this.getEntities(project).values()) {
      if (e.type === type) result.push(e);
    }
    return result;
  }

  async findAllEntityTypes(project: string): Promise<string[]> {
    const types = new Set<string>();
    for (const e of this.getEntities(project).values()) types.add(e.type);
    return [...types];
  }

  async deleteEntity(project: string, id: string): Promise<void> {
    const map = this.getEntities(project);
    if (!map.has(id)) throw new Error(`entity not found: ${id}`);
    map.delete(id);
    // Don't drop relationships — production behavior leaves dangling
    // relationships for explicit cleanup. Tests can assert that.
  }

  async addRelationship(project: string, rel: FakeRelationship): Promise<void> {
    // Quadstore-like set semantics: identical (subject, predicate, object)
    // triples are not duplicated. Production code (saveDecisionGraph etc.)
    // relies on this — re-saving the same graph must not produce extra
    // hasCondition / hasAction edges that would inflate later loads.
    const rels = this.getRels(project);
    if (rels.some((r) => r.subject === rel.subject && r.predicate === rel.predicate && r.object === rel.object)) {
      return;
    }
    rels.push(rel);
  }

  async findRelationshipsByEntity(
    project: string,
    entityId: string,
  ): Promise<FakeRelationshipResult[]> {
    const out: FakeRelationshipResult[] = [];
    for (const r of this.getRels(project)) {
      if (r.subject === entityId) out.push({ ...r, direction: 'outgoing' });
      if (r.object === entityId) out.push({ ...r, direction: 'incoming' });
    }
    return out;
  }

  // Test helper — not on the production interface.
  _allEntities(project: string): FakeEntityRecord[] {
    return [...this.getEntities(project).values()];
  }
  _allRelationships(project: string): FakeRelationship[] {
    return [...this.getRels(project)];
  }
}

/** Fake LLM that returns a hand-authored response. Used by derive-test. */
export class FakeLlmService {
  public lastMessages: any[] | null = null;
  constructor(private readonly response: string) {}

  async generateTextWithMessages(opts: { messages: any[] }): Promise<string> {
    this.lastMessages = opts.messages;
    return this.response;
  }
}

/** Fake RuleEngine — DecisionSupportService.deployAsRules uses addRule + saveRules. */
export class FakeRuleEngineService {
  public rulesAdded: Array<{ project: string; rule: any }> = [];
  public savedFor: string[] = [];

  addRule(project: string, rule: any): void {
    this.rulesAdded.push({ project, rule });
  }

  async saveRules(project: string): Promise<void> {
    this.savedFor.push(project);
  }
}

/** Fake EventRouter — updateActionStatus calls publishEvent. */
export class FakeEventRouterService {
  public published: any[] = [];
  async publishEvent(payload: any): Promise<void> {
    this.published.push(payload);
  }
}

/** Fake GraphBuilder — DecisionSupportService injects it but the test
 * surface doesn't call it. Provide a no-op so the constructor accepts. */
export class FakeGraphBuilderService {}
