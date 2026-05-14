# Triple-P Agent Memory — Implementation Guideline

**Audience:** the coding agent that will build the Triple-P agent memory system.

**Companion document:** the strategy article *The Triple-P Approach for Perfect Agent Memory*. This guideline assumes you have read it. Where the article describes *what* and *why*, this document defines *how*.

---

## 1. Scope

### Build from scratch
1. **Agent harness** — TypeScript / Node.js, built on the Claude Agent SDK. Implements the Picker, Packer, and Ponderer subagents and orchestrates the within-task and between-task loops.
2. **React frontend** — task chat UI, user-review queue for the Ponderer's nightly proposals, Skill diff viewer, settings.
3. **Integration adapters** — typed wrappers around the existing Wiki, RDF store, RAG service, and SOR MCP connectors.
4. **Local stores** — the Skills directory, the Personality store, the Preferences store, and the session recorder.

### Use, do not build
- **Wiki engine** — exposed via HTTP API (`getPage`, `putPage`, `listPages`, `searchPages`).
- **RDF store** — exposed via SPARQL 1.1 endpoint.
- **RAG service** — exposed via HTTP API (`query`, `index`, `delete`). Embeddings are its concern, not yours.
- **SOR systems** — exposed via pre-configured MCP connectors.

---

## 2. Component map

```
┌──────────────────────────────────────────────────────────────────┐
│  React Frontend                                                   │
│  ──────────────                                                   │
│  - /task         chat UI                                          │
│  - /review       Ponderer proposals (Good · BadlyReasoned · Unus.)│
│  - /review/skill skill diff (current vs. git original)            │
│  - /settings     project, Dreaming schedule, classification rules │
└────────────────────────┬─────────────────────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────▼─────────────────────────────────────────┐
│  Agent Harness  (TypeScript · Node · Claude Agent SDK)            │
│  ───────────────────────────────────────────────────              │
│  Subagents:  Picker  ·  Packer  ·  Ponderer                       │
│  Loops:      within-task   ·   between-task                       │
│  Local:      Skills dir · Personality · Preferences · Sessions    │
└────┬───────────────┬───────────────┬───────────────┬─────────────┘
     │               │               │               │
     │ HTTP          │ SPARQL        │ HTTP          │ MCP
     ▼               ▼               ▼               ▼
┌─────────┐    ┌──────────────┐  ┌──────────┐  ┌────────────────┐
│  Wiki   │    │  RDF store   │  │  RAG svc │  │  SOR systems    │
│  RO/RW  │    │  RO/RW       │  │  RO/RW   │  │  read-only      │
└─────────┘    └──────────────┘  └──────────┘  └────────────────┘
```

---

## 3. Data models (TypeScript)

Every entry in every store carries `EntryMeta`. No exceptions. Classification is the load-bearing field; without it the firewall cannot enforce.

```typescript
export type Classification = 'public' | 'private' | 'secret';

export interface Provenance {
  sourceSessions: string[];    // session IDs that contributed
  sourceEntries: string[];     // upstream entry IDs (page, entity, fragment)
  createdBy: 'agent' | 'ponderer' | 'user';
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
  inferenceTag?: string;       // Ponderer only — identifies the inference pattern
}

export interface EntryMeta {
  id: string;
  classification: Classification;
  provenance: Provenance;
}

// Project-local stores ─────────────────────────────────────────────

export interface WikiPage extends EntryMeta {
  title: string;
  slug: string;
  body: string;                // markdown
  links: string[];             // slugs of related pages (see-also)
}

export interface KGEntity extends EntryMeta {
  type: string;
  label: string;
  attributes: Record<string, unknown>;
}

export interface KGEdge extends EntryMeta {
  subject: string;             // entity id
  predicate: string;
  object: string;              // entity id
}

export interface RAGFragment extends EntryMeta {
  text: string;
  embeddingId: string;         // managed by RAG service
  tags: string[];
}

export interface Preference extends EntryMeta {
  scope: 'user' | 'collaborator';
  subject?: string;            // collaborator name when scope === 'collaborator'
  statement: string;
  confidence: number;          // 0..1
}

// Cross-project store ──────────────────────────────────────────────

export interface PersonalityEntry extends EntryMeta {
  principle: string;           // the operating rule
  context: string;             // when it applies
  evidence: string[];          // session IDs that justified induction
}

// Skill ────────────────────────────────────────────────────────────

export type StoreName =
  | 'wiki' | 'kg' | 'rag' | 'preferences' | 'sor' | 'personality';

export interface SkillFrontmatter {
  description: string;
  sourcePriorities: Array<{ store: StoreName; priority: number }>;
  classificationContext: Classification;   // upper bound for context entries
  invocationTriggers: string[];
}

export interface Skill {
  id: string;
  name: string;
  body: string;                // markdown body (workflow steps)
  frontmatter: SkillFrontmatter;
  originalHash: string;        // hash of the git-pulled original
  currentHash: string;         // hash of the local version
}

// Context flow ─────────────────────────────────────────────────────

export interface TaskFraming {
  intent: string;
  keywords: string[];
  activeSkillIds: string[];
}

export interface CandidateContext {
  wikiPages: WikiPage[];
  kgSubgraph: { entities: KGEntity[]; edges: KGEdge[] };
  ragFragments: RAGFragment[];
  preferences: Preference[];
  sorRecords: Array<{ source: string; payload: unknown }>;
  activeSkills: Skill[];
}

export interface ContextPackage {
  systemPrompt: string;        // assembled from active Skills
  knowledge: string;           // compressed serialization of CandidateContext
  userPrompt: string;
  meta: {
    totalTokens: number;
    sourceSummary: Record<StoreName, number>;
    droppedForClassification: number;
  };
}

// Sessions ─────────────────────────────────────────────────────────

export interface SessionTurn {
  role: 'user' | 'agent' | 'tool';
  content: string;
  storeWrites: Array<{ store: StoreName; entryId: string }>;
}

export interface SessionRecord {
  id: string;
  projectId: string;
  startedAt: string;
  endedAt: string;
  turns: SessionTurn[];
  activeSkills: string[];
  workspaceSnapshotBefore: string;   // git ref or content hash
  workspaceSnapshotAfter: string;
  qualityScore?: number;             // filled by Ponderer
}

// Review queue ─────────────────────────────────────────────────────

export type ReviewKind =
  | 'personality_proposal'
  | 'skill_diff'
  | 'stale_data_flag'
  | 'contradiction_resolution'
  | 'large_deletion';

export type ReviewVerdict = 'pending' | 'good' | 'badly_reasoned' | 'unusable';

export interface ReviewItem {
  id: string;
  projectId: string;
  kind: ReviewKind;
  summary: string;
  details: unknown;            // shape depends on kind
  provenance: Provenance;
  status: ReviewVerdict;
  cycleId: string;             // Ponderer cycle that produced it
}
```

---

## 4. Skill format

Skills are markdown files in `skills/`, copied from a central git repo on project init. The Ponderer may rewrite both frontmatter and body. The `originalHash` is preserved so the frontend can show a diff against the upstream version and the user can push improvements back upstream if desired.

```markdown
---
name: experimental_result_query
description: Answer questions about completed experiments and their results.
sourcePriorities:
  - { store: wiki, priority: 1 }
  - { store: kg, priority: 2 }
  - { store: preferences, priority: 4 }
  - { store: rag, priority: 5 }
classificationContext: private
invocationTriggers:
  - "what was the result"
  - "rejection rate"
  - "experiment outcome"
---

# Workflow

1. Identify the experiment or variant the user is asking about.
2. Pull the Wiki page for that variant (whole page, never fragments).
3. Query the KG subgraph rooted at the variant entity to one hop depth.
4. Apply user Preferences for units and verbosity.
5. ...
```

The **Dreaming Skill** (`skills/dreaming.md`) is special: its body is structured into sections that the Ponderer reads and rewrites:

```markdown
---
name: dreaming
description: How to review sessions and produce review items.
---

## Heuristics applied
- ...

## Heuristics down-weighted
- ...

## Inference patterns reinforced
- pattern:turn_efficiency_to_personality — promote principles from sessions where
  turn count < 3 and workspace match score > 0.8

## Inference patterns retired
- ...
```

The Ponderer self-edits this file based on user feedback. See §6.5.

---

## 5. Agent harness — within-task loop

The harness wraps the Claude Agent SDK and exposes `runTask`.

```typescript
import { Agent } from '@anthropic-ai/agent-sdk';
import { Picker } from './subagents/picker';
import { Packer } from './subagents/packer';
import { SessionRecorder } from './stores/sessions';
import { writeBackTools } from './tools/writeback';

export class TriplePAgent {
  constructor(
    private picker: Picker,
    private packer: Packer,
    private sessions: SessionRecorder,
    private agent: Agent,
  ) {}

  async runTask(userPrompt: string, projectId: string): Promise<string> {
    const session = await this.sessions.open(projectId);

    // 1. Frame the task and resolve active Skills.
    const framing = await this.frame(userPrompt, projectId);

    // 2. Picker assembles candidate context (once, after framing).
    const candidate = await this.picker.assemble(framing, projectId);

    // 3. Packer compresses to fit the budget and applies classification policy.
    const pkg = await this.packer.pack(candidate, userPrompt);

    // 4. Run the agent loop with writeback tools attached.
    const result = await this.agent.run({
      systemPrompt: pkg.systemPrompt,
      messages: [
        { role: 'user', content: `${pkg.knowledge}\n\n---\n\n${pkg.userPrompt}` }
      ],
      tools: writeBackTools(projectId, session),
    });

    await this.sessions.close(session, result);
    return result.outputText;
  }

  private async frame(prompt: string, projectId: string): Promise<TaskFraming> {
    // Small Claude call: extract intent, keywords, match against Skill triggers.
    // Return active Skill IDs to drive the Picker.
  }
}
```

### 5.1 Picker

Reads active Skills, follows their declared source priorities, pulls candidate context. Runs once. The Picker **overshoots**; the Packer trims.

```typescript
export class Picker {
  constructor(
    private wiki: WikiAdapter,
    private kg: KGAdapter,
    private rag: RAGAdapter,
    private prefs: PreferencesStore,
    private sor: SORAdapter,
    private skills: SkillsStore,
  ) {}

  async assemble(f: TaskFraming, projectId: string): Promise<CandidateContext> {
    const activeSkills = await this.skills.byIds(f.activeSkillIds);
    const priorities  = mergePriorities(activeSkills);

    const [wikiPages, kgSubgraph, ragFragments, preferences, sorRecords] =
      await Promise.all([
        this.pullWikiPages(f, priorities),
        this.pullKGSubgraph(f, priorities),
        this.pullRAGFragments(f, priorities),
        this.prefs.matching(projectId, f.intent),
        this.pullSOR(f, activeSkills),
      ]);

    return { wikiPages, kgSubgraph, ragFragments, preferences, sorRecords, activeSkills };
  }

  private async pullWikiPages(f: TaskFraming, p: SourcePriorityMap): Promise<WikiPage[]> {
    const slugs = await this.wiki.search(f.keywords, { limit: 12 });
    return Promise.all(slugs.map(s => this.wiki.getPage(s)));
    // Whole pages only. Never split mid-page.
  }

  // pullKGSubgraph: SPARQL anchored on entities matching keywords, depth 1.
  // pullRAGFragments: rag.query with topK ~20, classification-filtered.
  // pullSOR: only invoke SOR connectors a Skill has declared in its priorities.
}
```

### 5.2 Packer

Produces a `ContextPackage` that fits the token budget. Four levers, applied in order:

1. **Classification policy** — drop entries whose classification exceeds the Skill's `classificationContext`. *This step is non-negotiable and happens first.*
2. **Source priority** — drop low-priority sources first.
3. **Recency within store** — older entries summarised or dropped.
4. **Whole-page protection** — Wiki pages are kept whole or dropped entirely.

```typescript
export class Packer {
  constructor(private tokenBudget: number, private compressor: Compressor) {}

  async pack(candidate: CandidateContext, userPrompt: string): Promise<ContextPackage> {
    const skillCeiling = strictestCeiling(candidate.activeSkills);
    const filtered     = this.applyClassificationCeiling(candidate, skillCeiling);
    const ordered      = this.orderBySourcePriority(filtered, candidate.activeSkills);
    const fitted       = await this.fitToBudget(ordered, userPrompt);

    return {
      systemPrompt: assembleSystemPrompt(candidate.activeSkills),
      knowledge: fitted.text,
      userPrompt,
      meta: fitted.meta,
    };
  }
}
```

### 5.3 Writeback tools

The running agent persists new knowledge through Claude Agent SDK custom tools. Every writeback **requires** a `classification` argument; missing classification → tool rejects the call.

```typescript
export function writeBackTools(projectId: string, session: SessionRecord) {
  return [
    {
      name: 'wiki_put_page',
      description: 'Create or update a Wiki page. Whole pages only.',
      input_schema: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          links: { type: 'array', items: { type: 'string' } },
          classification: { enum: ['public', 'private', 'secret'] },
        },
        required: ['slug', 'title', 'body', 'classification'],
      },
      handler: async (input) => {
        recordWrite(session, 'wiki', input.slug);
        return wikiAdapter.putPage(projectId, withProvenance(input, session));
      },
    },
    { name: 'kg_assert_entity',  /* ... */ },
    { name: 'kg_assert_edge',    /* ... */ },
    { name: 'rag_index_fragment',/* ... */ },
    { name: 'preference_record', /* ... */ },
    // Note: NO skill_edit or personality_write tool.
    // Skills and Personality are read-only during within-task.
  ];
}
```

---

## 6. Between-task loop — the Ponderer

Runs on schedule (default nightly) or on demand. Operates per project. Five stages, executed in order. Each stage is independently testable.

```typescript
export class Ponderer {
  async run(projectId: string): Promise<PondererReport> {
    const cycleId  = newCycleId();
    const sessions = await this.sessions.unprocessed(projectId);

    // 1. Quality scoring
    const scored = await this.scoreSessions(sessions);

    // 2. Maintenance — stale data, contradictions, duplicates
    const maintenance = await this.runMaintenance(projectId);

    // 3. Personality induction (cross-project, classification-gated)
    const candidates = await this.induceCandidates(scored);
    const admitted   = candidates.filter(c => this.classificationFirewall(c));

    // 4. Self-edit — apply previous cycle's user feedback to the Dreaming Skill
    const feedback = await this.feedbackStore.unappliedForCycle(projectId);
    await this.applyFeedbackToDreamingSkill(feedback);

    // 5. Publish review queue
    const items = this.buildReviewItems({ admitted, maintenance, cycleId, projectId });
    await this.reviewQueue.publish(items);

    return { sessionsProcessed: sessions.length, reviewItemsPublished: items.length };
  }
}
```

### 6.1 Quality scoring

Quality is derived from **turn efficiency relative to workspace outcome**.

```typescript
private scoreSession(s: SessionRecord): number {
  const userCorrectionTurns = countTurns(s, turn =>
    turn.role === 'user' && isCorrection(turn.content));
  const agentRetryTurns     = countTurns(s, turn =>
    turn.role === 'agent' && isRetry(turn));
  const workspaceMatch      = diffScore(s.workspaceSnapshotBefore, s.workspaceSnapshotAfter);
  const baselineTurns       = expectedBaseline(s.activeSkills);

  // 0..1, higher is better
  return clamp(
    workspaceMatch * (baselineTurns / Math.max(1, baselineTurns + userCorrectionTurns + agentRetryTurns)),
    0, 1
  );
}
```

The exact formula will be tuned; the contract is: a single user turn that produced a good workspace edit scores high; four corrective user turns that eventually produced the same edit scores low.

### 6.2 Maintenance

Top-priority job. The within-task loop is forgiving; the Ponderer is the corrector.

- **Stale Wiki pages** — pages whose claims contradict a newer page or a newer KG fact. Resolution: merge, split, or mark superseded. Large changes → review item.
- **Orphan KG entities** — entities with no recent references and no incoming edges. Pruned; large prunes → review item.
- **Duplicate RAG fragments** — collapsed by similarity threshold.
- **Wiki page boundaries** — pages that grew beyond 2K tokens are split; pages that became near-duplicates are merged.
- **Contradictions** — when two entries disagree, the Ponderer chooses one and emits a review item.

### 6.3 Personality induction

Cross-session pattern recognition. The Ponderer is a Claude subagent invoked with a structured prompt:

```typescript
const prompt = `
Given these ${highQualitySessions.length} high-quality sessions and their
inferred agent strategies, identify operating principles that appeared
consistently and produced good outcomes. Each principle must:

- describe an AGENT behaviour, not a USER preference
- be transferable across projects (no project-specific particulars)
- carry an inferenceTag identifying the reasoning pattern used to induce it

Return as JSON array of { principle, context, evidence[], inferenceTag }.
`;
```

Each candidate is then sent through the **classification firewall** (§6.5).

### 6.4 Classification firewall

Hard rule. No exceptions. Source classification is the maximum classification across all evidence entries.

```typescript
private classificationFirewall(c: PersonalityCandidate): boolean {
  const sourceClassifications = c.evidence
    .flatMap(sessionId => this.evidenceClassifications(sessionId));
  const max = sourceClassifications.reduce(maxClassification, 'public');

  if (max === 'secret') return false;        // never
  if (max === 'private' && !c.isAbstract)    // private requires abstraction
    return false;
  return true;
}
```

A candidate `isAbstract` if it contains no project-specific particulars (no entity names, no quantitative results, no proper nouns from project scope). Test with a separate Claude call: *"Does this principle reference anything project-specific? Answer yes/no."*

### 6.5 Self-edit (the recursive part)

The Dreaming Skill is rewritten from user feedback on the previous cycle's review items.

```typescript
private async applyFeedbackToDreamingSkill(feedback: ReviewItem[]) {
  const dreaming = await this.skills.get('dreaming');

  // Aggregate by inferenceTag
  const byTag = groupBy(feedback, item => item.provenance.inferenceTag);

  const reinforce = [];
  const rewrite   = [];
  const retire    = [];

  for (const [tag, items] of Object.entries(byTag)) {
    const goodCount  = items.filter(i => i.status === 'good').length;
    const badCount   = items.filter(i => i.status === 'badly_reasoned').length;
    const unusedCount= items.filter(i => i.status === 'unusable').length;

    if (goodCount > badCount + unusedCount)  reinforce.push(tag);
    else if (badCount  > goodCount)          rewrite.push({ tag, examples: items });
    else if (unusedCount >= 2)               retire.push(tag);
  }

  const newBody = rewriteDreamingMarkdown(dreaming.body, { reinforce, rewrite, retire });
  await this.skills.write('dreaming', { ...dreaming, body: newBody });
}
```

`rewriteDreamingMarkdown` is itself a Claude call: given the current Dreaming Skill body and the categorised feedback, return a revised body. The frontend shows the Dreaming Skill diff in the next review cycle so the user can sanity-check the recursive change.

---

## 7. Frontend (React)

Stack: React 18+, TanStack Query, React Router, Tailwind. State management is per-route with TanStack Query for server state; no global store needed.

### Pages

```
/                         redirects to /task
/task                     active task chat
/review                   pending review items (this cycle)
/review/history           past cycles, filterable
/review/skill/:skillId    diff: current vs. git original
/review/personality/:id   personality entry with provenance tree
/settings                 project, dreaming schedule, classification policy
```

### Key components

```typescript
// ReviewItemCard.tsx — one card per pending item
<ReviewItemCard item={item}>
  <Badge kind={item.kind} />
  <Summary>{item.summary}</Summary>
  <ExpandableDetails details={item.details} />
  <ProvenanceLink provenance={item.provenance} />
  <VerdictButtons
    onGood={() => verdict('good')}
    onBadlyReasoned={() => verdict('badly_reasoned')}
    onUnusable={() => verdict('unusable')}
  />
</ReviewItemCard>

// SkillDiffViewer.tsx — side-by-side diff (original vs. current)
<SkillDiffViewer skill={skill}>
  <DiffPane lhs={skill.originalBody} rhs={skill.body} />
  <Actions>
    <Button onClick={accept}>Accept current</Button>
    <Button onClick={revert}>Revert to original</Button>
    <Button onClick={pushUpstream}>Push to git</Button>
  </Actions>
</SkillDiffViewer>
```

### Verdict mutation

```typescript
const verdictMutation = useMutation({
  mutationFn: ({ itemId, verdict }: { itemId: string; verdict: ReviewVerdict }) =>
    api.post(`/review/${itemId}/verdict`, { verdict }),
  onMutate: async ({ itemId, verdict }) => {
    // Optimistic: mark the card.
    await queryClient.cancelQueries(['review']);
    const prev = queryClient.getQueryData<ReviewItem[]>(['review']);
    queryClient.setQueryData<ReviewItem[]>(['review'], items =>
      items?.map(i => i.id === itemId ? { ...i, status: verdict } : i));
    return { prev };
  },
  onError: (_e, _v, ctx) => queryClient.setQueryData(['review'], ctx?.prev),
});
```

---

## 8. Integration adapters

### 8.1 Wiki

```typescript
export interface WikiAdapter {
  getPage(slug: string): Promise<WikiPage>;
  putPage(projectId: string, page: WikiPage): Promise<void>;
  listPages(projectId: string, filter?: PageFilter): Promise<WikiPageSummary[]>;
  search(keywords: string[], opts: { limit: number }): Promise<string[]>;  // returns slugs
  delete(slug: string): Promise<void>;
}
```

REST endpoints. Markdown body stored as-is; metadata (classification, provenance, timestamps) stored alongside as JSON keyed by slug. Search returns slugs, not chunks — whole pages flow back through `getPage`.

### 8.2 RDF store

```typescript
export interface KGAdapter {
  query(sparql: string): Promise<KGRecord[]>;
  update(sparql: string): Promise<void>;
  assertEntity(e: KGEntity): Promise<void>;
  assertEdge(e: KGEdge): Promise<void>;
  subgraph(rootId: string, depth: number): Promise<{ entities: KGEntity[]; edges: KGEdge[] }>;
  prune(entityIds: string[]): Promise<void>;
}
```

SPARQL 1.1 against the existing endpoint. Provenance and classification are reified as RDF properties:

```sparql
PREFIX kg: <https://triple-p/kg#>
PREFIX prov: <http://www.w3.org/ns/prov#>

INSERT DATA {
  kg:entity_v7 a kg:MembraneVariant ;
    rdfs:label "V7" ;
    kg:classification "private" ;
    prov:wasGeneratedBy kg:session_abc123 ;
    kg:createdAt "2026-05-14T02:15:00Z"^^xsd:dateTime .
}
```

### 8.3 RAG

```typescript
export interface RAGAdapter {
  query(text: string, opts: {
    topK: number;
    classificationFilter?: Classification[];
    projectId: string;
  }): Promise<RAGFragment[]>;
  index(fragment: RAGFragment): Promise<void>;
  delete(id: string): Promise<void>;
}
```

The RAG service owns embeddings. The adapter never sees vectors. Classification filter is enforced at query time so secret-class fragments never enter a context package built for a private-ceiling Skill.

### 8.4 SOR via MCP

```typescript
export interface SORAdapter {
  listAvailable(projectId: string): Promise<MCPConnector[]>;
  read(connector: string, query: unknown): Promise<unknown>;
  // No write methods. SOR is read-only.
}
```

MCP connectors pre-configured per project in `triple-p.config.json`. Only Skills that declare an SOR connector in `sourcePriorities` may pull from it.

---

## 9. Classification firewall — enforcement points

Test each one explicitly. A leak here breaks the security model of the whole system.

| Point | Where | What it checks |
|-------|-------|---------------|
| Write-time | writeback tool handler | `classification` field present and valid |
| Pack-time | `Packer.applyClassificationCeiling` | entries with classification > Skill ceiling are dropped |
| Personality admission | `Ponderer.classificationFirewall` | secret blocked; private requires abstraction |
| Personality access | Picker | Picker MUST NOT read from Personality store directly |
| RAG query-time | `RAGAdapter.query` | classification filter enforced server-side |

The Picker accessing Personality directly is a design error — Personality only influences Skills, never task context. Add a unit test that asserts the Picker has no dependency on a Personality store.

---

## 10. Configuration

A project's `triple-p.config.json`:

```json
{
  "projectId": "desal-2026",
  "wikiBaseUrl": "https://wiki.internal/api",
  "kgSparqlEndpoint": "https://rdf.internal/sparql",
  "ragServiceUrl": "https://rag.internal/api",
  "mcpConnectors": ["lims", "supplier-erp"],
  "skillsRepo": "git@github.com:org/triple-p-skills.git",
  "ponderer": {
    "schedule": "0 2 * * *",
    "qualityThresholdForInduction": 0.7,
    "maxReviewItemsPerCycle": 25
  },
  "classificationPolicy": {
    "defaultForAgentWrites": "private",
    "secretSorTags": ["customer-data", "ip-protected"]
  },
  "tokenBudget": 100000
}
```

---

## 11. Suggested file structure

```
/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Task.tsx
│   │   │   ├── Review.tsx
│   │   │   ├── SkillDiff.tsx
│   │   │   ├── PersonalityDetail.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/
│   │   │   ├── ReviewItemCard.tsx
│   │   │   ├── VerdictButtons.tsx
│   │   │   ├── DiffViewer.tsx
│   │   │   └── ProvenanceTree.tsx
│   │   ├── api/
│   │   │   └── client.ts
│   │   └── main.tsx
│   └── package.json
│
├── harness/
│   ├── src/
│   │   ├── index.ts                 # HTTP server + WS
│   │   ├── agent.ts                 # TriplePAgent
│   │   ├── subagents/
│   │   │   ├── picker.ts
│   │   │   ├── packer.ts
│   │   │   └── ponderer.ts
│   │   ├── tools/
│   │   │   └── writeback.ts
│   │   ├── adapters/
│   │   │   ├── wiki.ts
│   │   │   ├── kg.ts
│   │   │   ├── rag.ts
│   │   │   └── sor.ts
│   │   ├── stores/
│   │   │   ├── skills.ts
│   │   │   ├── personality.ts
│   │   │   ├── preferences.ts
│   │   │   ├── sessions.ts
│   │   │   └── reviewQueue.ts
│   │   ├── classification.ts        # firewall + helpers
│   │   ├── quality.ts               # scoring algorithm
│   │   └── types.ts
│   ├── tests/
│   │   └── classification_firewall.test.ts   # critical
│   └── package.json
│
├── skills/                          # per project, copied from skillsRepo
│   ├── dreaming.md
│   ├── experimental_result_query.md
│   └── ...
│
├── personality/                     # cross-project markdown wiki
│   └── *.md
│
└── triple-p.config.json
```

---

## 12. Implementation order

Suggested order. Each step ends with tests before moving on.

1. `types.ts` — every interface above. No implementation yet.
2. Adapter stubs against in-memory fakes. Wiki/KG/RAG/SOR all return canned data.
3. `SessionRecorder` + the writeback tool framework.
4. `Picker` against fake adapters; verify it pulls whole pages, not chunks.
5. `Packer` with classification ceiling and budget fitting. **Add the firewall test here.**
6. `TriplePAgent.runTask` end-to-end against fakes.
7. Replace fakes with real adapters one at a time. Wiki first, then KG, then RAG, then SOR.
8. `Ponderer.scoreSessions` and `Ponderer.runMaintenance`.
9. `Ponderer.induceCandidates` and `classificationFirewall`. **Add the cross-project leak test.**
10. `ReviewQueue` publishing.
11. Frontend `/review` page with verdict mutations.
12. `Ponderer.applyFeedbackToDreamingSkill` (the recursive part).
13. Frontend `/review/skill/:id` diff viewer.
14. Frontend `/task` chat UI.
15. Scheduled Ponderer runs in production.

---

## 13. Things to test, not assume

- **Personality never enters context.** Test: build a context package; assert no Personality entries leak in. Add a fake Personality store with a sentinel entry and assert it does not appear.
- **Secret never crosses project.** Test: induce a Personality candidate from a session containing a secret-class entry; assert it is dropped.
- **Skill diff round-trips.** Test: rewrite a Skill, verify the original is preserved and the diff is correct.
- **Quality score correlates.** Test: a curated set of "good" and "bad" sessions; assert the scoring function orders them correctly.
- **Feedback applied to Dreaming Skill.** Test: feed three `badly_reasoned` verdicts on inferenceTag X; assert the Dreaming Skill body changes accordingly on the next cycle.

---

## 14. Known caveats and design choices to preserve

- **The Picker fires once.** If a Skill activates dynamically mid-task, it issues a scoped re-Pick rather than a full re-run. Do not turn this into iterative re-picking by default.
- **Eager writes during within-task are unverified.** That is intentional. The Ponderer is the corrector.
- **The Ponderer can self-edit its own Skill.** This is by design and is gated by user feedback, not by the Ponderer's own reasoning about its own reasoning.
- **Skills are local copies of git originals.** Versioning is the diff against `originalHash`. Do not build a separate version-control system.
- **Personality is cross-project, but only writes Skills.** Do not add a code path that reads Personality directly into a context package.