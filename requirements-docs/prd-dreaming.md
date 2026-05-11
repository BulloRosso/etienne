# Dreaming

Dreaming is the term for an agent's offline process to optimize its memory and drawing conclusions from its recent collaboration with the user.

Offline memory building and maintenance comes with the risk of creating unwanted and contraproductive strategies - thus a human must be in the loop.

**Important** create an adr (architecture decision record) when finished

## Organization

Anthropic calls an isolated factual memory "memory store". In Etienne this means there's a /wiki directory inside a project directory which is maintained with the auto-wiki agent skill.

The agent's overarching strategies and learnings related to these memory stores are stored in <workspace>/.agent/wiki. This is the same storage format, but focused on strategies, lessons learned and things to explore in the future. The link between the agent's wiki and the memory stores in the project again is some kind of factual knowlede.

## Offline Processing

A cron triggered MQ pipeline investigates the most recent sessions of all projects which have an existing /wiki directory - we use the <workspace>/<project folder>/.etienne/chat-history-... files to eval the sessions.

The process maintain sthe .agent/wiki structure and creates a <workspace>/<project folder>/dreaming/dream-<day timestamp>.dreams.json file for the human feedback loop. Each json has a field "dismissedByUser" which indicates whether the user has seen and closed it.

The dreams file includes the 10 most important created by the last offline processing run. The user can give feedback: a) good (thumb up, keep) b) bad (thumb down, delete) and c) deepen (investigate further, import { TbShovel } from "react-icons/tb"; as icon). These questions will be answered in the feedback loop by the user. 

Offline processing

## Administration

In the frontend we will add a new tile in the settings section using public/dreams.png and give it the title "Dreaming". It opens a new modal showing the new component DreamingSettings.jsx which allows the user to:

* enter the daily start time when the offline dreaming process is started with a cron expression (default: 22:00)
* enter an amount of max llm calls to spend for dreamin OR a maximum budget to spend on dreaming 
* it shows the dreams.png image in the left column and a description what dreaming is below the heading
* the heading has a right aligned close icon button and a right aligned "Save" action button on the bottom
* settings are saved inside the .agent folder (use the existing agent behaviour .json)
* we can set how many items a dream should produce at max (default: 10)
* we must display the name of the agent skill which is used to dream as a link: the link opens the existing edit skill pane
* add anything I forgot and use tabs if we got too many items

## Feedback Loops

If a project is opened we check whether there's a undismissed dream file and links a new quick action item above the chat input pane to this file. If there a onder quick action we replace it because there should be only one quick action opening the most recent dream. We use import { BsCloudMoon } from "react-icons/bs"; as an quick action icon.

We have to extend the quick actions semantics to open a preview for a file in the preview pane.

When clicking the quick action in the preview pane we open a new previewer configured for the file type .dreams.json: This is a questionaire for the up 10 ideas where the user gives feedback from a. to c. and finally submitts. When submitting we write instructions for the next offline processing run to the agent's wiki (we don't do any processing immediatelly!).

After submitting the feedback we must remove the item from the quick actions above the chat pane.

## Documentation

Create a linkedIn article targeted docs/dreaming.md and put a link to it in the root readme.md. We should include a mermaid flowchart for the wiki structure and explain that dreaming is not a defined process, but a research topic which can lead to different answers depending on the expectations for agentic process.

Add also information from the implementation ideas we actually used in the end.

# Architektur-Blueprint v2: Dreaming Batch Process auf Claude Agent SDK + ChromaDB + SQLite-MQ

Use the following descriptions to implement Etienne's dreaming feature. You must use the existing infrastructure and project semantics - but feel free to adjust the auto-wiki skill to make it match the dreaming feature.

## TL;DR

- **Stack-Wechsel:** Statt Mastra/Vercel-AI-SDK + LanceDB + BullMQ jetzt **Claude Agent SDK (TypeScript)** + **ChromaDB** (lokaler Server-Subprozess) + **SQLite-Eigenbau-MQ**.
- **Kern-Synergie:** Das Skill-Format des Agent SDK *ist* das Strategy-Card-Format. Skills sind YAML-Frontmatter-Markdown, werden anhand ihrer `description` autonom vom Modell ausgewählt — exakt das Voyager-Pattern „skill indexed by description", aber als first-class-feature des SDK.
- **Architektur:** Ein **Inference-Agent** (`query()`) und ein **Dreaming-Agent** (gleicher SDK, batch-getriggert) teilen sich denselben Filesystem-Layer (`wiki/`, `.claude/skills/strategies/`, `sessions/*.jsonl`). ChromaDB indexiert Wiki-Chunks und Strategy-Descriptions; SQLite-Queue koordiniert die nächtliche Pipeline.
- **Was sich nicht ändert:** Karpathy-Wiki-Pattern (raw / wiki / schema), 8-Stage-Pipeline (Harvest → Segment → Reflect → Distill → Ground → Consolidate → Promote → Index), Threshold-Gates, Web-Grounding, Trade-off-Analyse.

---

## 1. Warum dieser Stack — der „aha" Moment

Das **Skill-Konzept des Agent SDK** ist nicht nur eine bequeme Speicherform für Strategien. Es ist genau der Mechanismus, den frühere Forschung mühsam selbst nachbauen musste. Drei Eigenschaften greifen ineinander:

1. **Filesystem-natives Format**: Skills sind `.claude/skills/<name>/SKILL.md` mit YAML-Frontmatter (`name`, `description`). Git-versionierbar, Mensch-reviewbar, Diff-fähig — exakt das, was wir für Strategy-Cards wollten.
2. **Description-basiertes Retrieval**: Beim Start scannt der SDK alle SKILL.md-Frontmatter; bei jeder Anfrage wählt das Modell autonom die passenden Skills anhand ihrer `description`. Das ist Voyagers „skill indexed by description" geschenkt — ohne dass wir Embedding-Index, Top-k-Retrieval und Prompt-Komposition selbst bauen müssen.
3. **Progressive Disclosure**: Nur Frontmatter aller Skills landet im Kontext; der Body wird erst geladen, wenn das Modell den Skill via `Skill`-Tool aufruft. Token-Budget bleibt eng auch bei vielen Strategien — eine Eigenschaft, die wir mit RAG selbst hätten implementieren müssen.

ChromaDB übernimmt zwei orthogonale Aufgaben: (a) Wiki-Chunk-Index (Vector-Search im Faktenspeicher) und (b) **Pre-Filter** für Skills, wenn die Anzahl der Strategy-Skills das SDK-Frontmatter-Budget zu sprengen droht (siehe §6.3).

SQLite-MQ koordiniert den Dreaming-Batch persistent ohne externe Infrastruktur — wie schon im vorigen Bericht festgeschrieben.

---

## 2. Stack-Mapping zur Architektur

| Schicht | Komponente | Verantwortung |
|---|---|---|
| **Storage** | Markdown im Filesystem | Wiki-Pages (`wiki/<domain>/`), Strategy-SKILL.md (`.claude/skills/strategies/<domain>/<id>/`), Session-JSONLs (`sessions/`) |
| **Index** | ChromaDB (lokaler Subprozess) | Collection `wiki_<domain>` für Faktensuche; Collection `strategy_descriptions` für Skill-Pre-Filter |
| **Job-Queue** | SQLite via `better-sqlite3` | Cron-Trigger, Stage-DAG, Retry, Crash-Recovery |
| **Agent-Runtime** | Claude Agent SDK (TS) | Inference-Agent + Dreaming-Agent, beide via `query()` mit `settingSources` und `skills` |
| **Web-Grounding** | SDK Built-in `WebSearch` Tool | Stage 5 (GROUND); kein externer API-Vendor nötig — Anthropic-side WebSearch ist verfügbar |
| **Custom Tools** | SDK MCP via `createSdkMcpServer` | In-Process-Tool für ChromaDB-Queries (Wiki-Search) und Strategie-Verwaltung |
| **Observability** | SDK-Hooks (`SessionEnd`, `TaskCompleted`) + JSONL-Logs | Session-Persistence, Outcome-Detection |

Damit ist die Antwort auf „mit welchen Bausteinen baue ich das?" weniger eklektisch als vorher: drei Hauptpakete (`@anthropic-ai/claude-agent-sdk`, `chromadb`, `better-sqlite3`), ein Markdown-Filesystem, ein Cron-Trigger.

---

## 3. Dateilayout (Single-Repo)

```
project-root/
├── .claude/
│   ├── skills/
│   │   ├── strategies/                       ← STRATEGY STORE
│   │   │   ├── postgres/
│   │   │   │   ├── pg-migration-large-oltp/
│   │   │   │   │   └── SKILL.md
│   │   │   │   └── pg-replica-lag-debug/
│   │   │   │       └── SKILL.md
│   │   │   └── react/...
│   │   └── tooling/                          ← Pipeline-Skills für den Dreaming-Agent
│   │       ├── distill-strategy/SKILL.md
│   │       ├── ground-strategy/SKILL.md
│   │       └── consolidate-strategy/SKILL.md
│   └── settings.json                         ← Agent-SDK-Defaults
├── wiki/                                     ← WIKI MEMORY STORE (Karpathy)
│   └── postgres/
│       ├── index.md
│       ├── log.md
│       ├── pg_dump.md
│       └── ...
├── sessions/                                 ← Roh-Layer
│   └── sess_2026-05-09_a3f.jsonl
├── data/
│   ├── chroma/                               ← Chroma-Subprozess persist-path
│   └── queue.db                              ← SQLite-MQ
├── src/
│   ├── inference.ts                          ← Online Agent
│   ├── dream/
│   │   ├── orchestrator.ts                   ← Cron + Job-Enqueue
│   │   ├── worker.ts                         ← Job-Loop
│   │   ├── stages/{harvest,segment,reflect,...}.ts
│   │   └── chroma-mcp.ts                     ← In-Process MCP-Tool
│   └── queue/{schema.sql,queue.ts}
├── AGENTS.md                                 ← Schema/Persona für Agent
├── WIKI_SCHEMA.md                            ← Wiki-Maintainer-Regeln
└── STRATEGY_SCHEMA.md                        ← Strategy-Card-Format
```

---

## 4. Komponenten

### 4.1 Wiki Memory Store (Karpathy-Pattern)

Unverändert: pro Domain ein Verzeichnis mit `index.md` + `log.md` + Entity-/Concept-Pages, YAML-Frontmatter, append-only Log. Indexierung in **ChromaDB-Collection `wiki_<domain>`**: ein Eintrag pro Markdown-Chunk (Heading-basiert), Embedding via Default-Embed (`@chroma-core/default-embed`) oder via einer Embedding-API-Wahl (Voyage, OpenAI text-embedding-3, BGE-M3 lokal). Sync via `chokidar`-Watcher: bei Änderung an `wiki/**.md` → re-embed + upsert.

### 4.2 Strategy Store (Skills)

Pro promotierter Strategie ein Skill-Verzeichnis. **Das Frontmatter ist das Retrieval-Signal**, der Body ist die ausführbare Anweisung — beides bleibt im selben File:

```markdown
---
name: pg-migration-large-oltp
description: |
  Heuristic for migrating PostgreSQL OLTP databases over 100 GB.
  Use when the user discusses PostgreSQL migrations, dump/restore performance,
  schema-vs-data ordering, parallel COPY, or pg_restore bottlenecks. Provides
  a WHEN/DO/BECAUSE recipe with verified evidence.
version: 1.2.0
---

# Heuristik: Schema-First + Parallel COPY for Large OLTP Migrations

## Provenance
- domain: postgres
- type: heuristic
- status: active
- confidence: 0.82
- support_count: 7
- last_verified: 2026-05-09
- sources: sess_2026-04-12_a3f, sess_2026-04-30_91c, https://www.postgresql.org/docs/16/...
- related_facts: [[wiki/postgres/pg_dump]], [[wiki/postgres/replication-modes]]

## WHEN
Migration einer PostgreSQL-Datenbank > 100 GB mit OLTP-Last.

## DO
1. `pg_dump --schema-only` → Schema separat einspielen
2. Pro großer Tabelle parallel `COPY ... TO STDOUT` / `COPY ... FROM STDIN`
3. Indizes erst nach Bulk-Load erstellen

## BECAUSE
`pg_restore` läuft single-threaded und ist I/O-bound; parallele
COPY-Streams nutzen alle Cores; nachgelagerte Indizes sparen Schreib-Amplifikation.

## EVIDENCE
- 3 Sessions (2026-04-12, 2026-04-30, 2026-05-02) — Faktor 4–6× schneller beobachtet
- Bestätigt durch PostgreSQL-Wiki "Bulk Loading", Crunchy-Data-Blog (verifiziert 2026-05-08)

### ANTI-PATTERN
Niemals `pg_restore -j` allein — der Parallelismus greift erst nach dem Schema-Pass.
```

**Wichtige Beobachtung:** Provenance, Confidence, Sources usw. wandern in einen *Body-Block* statt ins Frontmatter. Grund: nur die Frontmatter-Felder `name` und `description` sind für die SDK-Skill-Auswahl wirksam; alle Metadaten dort aufzublähen verteuert den Kontext-Footprint pro Anfrage. Provenance bleibt sichtbar, sobald der Skill geladen wird — und steht für die Consolidate-Stage maschinell parsbar bereit (YAML-ish Liste oder front-matter-im-body).

#### 4.3 ChromaDB als Subprozess

Der TypeScript-Client (`chromadb` oder `@chroma-core/chromadb-client`) braucht zwingend einen laufenden Server. Das ist der einzige Bruch mit „kein externer Service" — gemildert durch: das `chroma run`-Binary (Rust-CLI) wird beim Anwendungsstart als Child-Process gestartet, hört auf `127.0.0.1:8765`, persistiert in `data/chroma/`, wird beim Anwendungs-Shutdown gestoppt.

**important** use the existing one which is knowen to process-manager

```typescript
// src/chroma-runner.ts (Skelett)
import { spawn, ChildProcess } from 'node:child_process';
import { ChromaClient } from 'chromadb';

let chromaProc: ChildProcess | undefined;

export async function startChroma() {
  chromaProc = spawn('chroma', [
    'run', '--host', '127.0.0.1', '--port', '8765',
    '--path', './data/chroma',
  ], { stdio: 'inherit' });
  // Healthcheck-Loop bis Heartbeat OK
  const client = new ChromaClient({ path: 'http://127.0.0.1:8765' });
  for (let i = 0; i < 30; i++) {
    try { await client.heartbeat(); return client; } catch { await sleep(500); }
  }
  throw new Error('Chroma did not come up');
}

export function stopChroma() { chromaProc?.kill('SIGTERM'); }
```

Voraussetzung: `chroma` CLI binary lokal installiert (Rust-Installer, ein Shell-Befehl, keine Python-/Docker-Abhängigkeit). Alternative für Container-Deployments: Chroma als Sidecar-Container mit Volume-Mount auf `data/chroma/`.

#### 4.4 SQLite Job-Queue

Unverändert wie im vorigen Bericht (§7.1 dort): `better-sqlite3` mit WAL-Mode, `jobs`-Tabelle mit `run_id`/`stage`/`domain`/`parent_id`/`locked_until`, atomares Claim per Transaktion, Exponential-Backoff. `node-cron` triggert nightly. Das DAG-Pattern (Parent HARVEST → Children pro Domain → 7 weitere Stages sequenziell) wird durch verzögertes Enqueuing der Children im Worker realisiert.

#### 4.5 Inference-Agent

```typescript
// src/inference.ts (vereinfacht)
import { query } from '@anthropic-ai/claude-agent-sdk';
import { selectStrategySkillsForQuery } from './chroma-prefilter';

export async function* answer(userMsg: string, domain: string) {
  // 1) Pre-Filter: ChromaDB liefert Top-k SKILL-Namen anhand description-embedding
  const topSkills = await selectStrategySkillsForQuery(userMsg, domain, 5);
  // 2) Query mit gefilterten Skills + Wiki-MCP
  yield* query({
    prompt: userMsg,
    options: {
      cwd: process.cwd(),
      settingSources: ['project'],
      skills: topSkills,                // string[] = nur diese aktivieren
      systemPrompt: { type: 'preset', preset: 'claude_code',
                      append: await loadSchema('AGENTS.md') },
      allowedTools: ['Read', 'Grep', 'Glob', 'WebSearch',
                     'mcp__wiki__search', 'mcp__wiki__read'],
      mcpServers: { wiki: createWikiMcp(domain) },
      model: 'claude-opus-4-7',
    },
  });
}
```

Wesentlich: Nicht alle Strategy-Skills werden geladen, sondern nur die durch ChromaDB vorgefilterten Top-k — sonst sprengt das Frontmatter-Budget den Kontext bei großen Domains.

#### 4.6 Dreaming-Agent

Derselbe SDK, andere Konfiguration: läuft batched, hat **eigene Skills** (`tooling/distill-strategy`, `tooling/ground-strategy`, `tooling/consolidate-strategy`) als Anweisungen für Subagents. Stages, die LLM brauchen, werden über programmatische Subagents im Worker realisiert (siehe §5).

---

### 5. Pipeline (8 Stages, Agent-SDK-Vokabular)

Jede Stage ist ein eigener Job-Typ in der SQLite-Queue. Worker-Code dispatched anhand `job.stage` zum Handler; LLM-Stages rufen `query()` mit Subagent-Konfiguration auf.

#### Stage 1 — HARVEST (programmatisch)

Liest neue Session-JSONLs (Session-IDs > `last_run_ts`), parst Wiki-Diff seit letztem Lauf via `git log` oder mtime. Output: `{ run_id, sessions[], domains[] }`. Enqueued pro Domain einen SEGMENT-Job.

#### Stage 2 — SEGMENT (programmatisch)

Schneidet Trajektorien aus Sessions, annotiert mit Outcome aus `outcome_signals`. Output pro Trajektorie: `{ trajectory_id, turns, outcome }`. Enqueued pro Trajektorie einen REFLECT-Job (gebatched).

#### Stage 3 — REFLECT (Subagent via `query()`)

Programmatischer Subagent mit eingeschränktem Tool-Set, strukturiertem Output über `outputFormat` (Zod-Schema):

```typescript
const reflectAgent = {
  description: 'Strategie-Analyst — extrahiert WHEN/DO/BECAUSE-Kandidaten',
  prompt: REFLECT_SYSTEM_PROMPT,             // siehe vorigen Bericht §8.1
  tools: ['Read'],                           // braucht keine Web/Filesystem-Schreibzugriffe
  model: 'claude-opus-4-7',
};

const result = await runSubagent(reflectAgent, {
  input: { trajectory, domain, outcome },
  outputSchema: candidateStrategiesSchema,   // Zod
});
```

#### Stage 4 — DISTILL (programmatisch)

Cluster ähnlicher Kandidaten innerhalb des Runs via Embedding-Cosine; Schwelle: `min_support=2 OR confidence >= 0.85`. Output: `{ candidate_id, when, do, because, evidence[], support_count }`.

#### Stage 5 — GROUND (Subagent + WebSearch)

Subagent mit `WebSearch`-Tool (built-in). Klassifiziert pro Kandidat 3–8 Web-Quellen als `supports | contradicts | neutral`. Schreibt Verifikations-Score zurück. Web-Grounding-Ziele wie im vorigen Bericht: Bestätigung, Widerlegung, Anreicherung.

#### Stage 6 — CONSOLIDATE (Subagent)

Pro Kandidat: ChromaDB-Search in `strategy_descriptions` → wenn cosine > 0.88 zu existierender Strategie, MERGE-Pass via Subagent (liest existierende SKILL.md, schreibt zusammengeführte Card-Repräsentation als JSON). Konflikt-Detection für `contested`-Status. Output: Liste finaler Card-Objekte.

#### Stage 7 — PROMOTE (programmatisch)

Threshold-Gates wie zuvor: G1 Light (confidence ≥ 0.6, support ≥ 1), G2 REM (Web-supports ODER cross-trajectory ≥ 2), G3 Deep (Composite-Score ≥ τ=0.78 mit w1·confidence + w2·support + w3·web + w4·diversity). Was passiert: nur G3-Kandidaten gehen weiter; G1/G2 bleiben in einem Buffer-Table für nächste Runs.

#### Stage 8 — INDEX (programmatisch)

Pro promotiertem Kandidat:
1. **Schreibe SKILL.md** in `.claude/skills/strategies/<domain>/<id>/SKILL.md` (atomar via temp-file + rename).
2. **Embedding** des `description`-Feldes (Frontmatter, nicht Body — denn das ist das Retrieval-Signal).
3. **Upsert** in ChromaDB-Collection `strategy_descriptions` mit Metadata `{ domain, status, confidence, last_verified, skill_path }`.
4. **Append** in `.claude/skills/strategies/<domain>/log.md`: `## [2026-05-09] promoted | pg-migration-large-oltp | from-sessions: 7`.

---

### 6. Inference-Path im Detail

#### 6.1 Pre-Filter via ChromaDB

```typescript
// src/chroma-prefilter.ts
export async function selectStrategySkillsForQuery(
  query: string, domain: string, k: number,
): Promise<string[]> {
  const collection = await chroma.getCollection({ name: 'strategy_descriptions' });
  const results = await collection.query({
    queryTexts: [query],
    nResults: k,
    where: { domain, status: 'active', confidence_gte: 0.7 },
  });
  return results.metadatas[0]
    ?.map((m) => m.skill_name as string)
    .filter(Boolean) ?? [];
}
```

Begründung der Pre-Filter-Schicht trotz SDK-internem Skill-Selector: Bei N > 50 Skills pro Domain wird das Frontmatter-Budget knapp, und der SDK-interne Selector arbeitet rein auf den Frontmatter-Texten — er hat kein Embedding-Modell. ChromaDB liefert semantische Ähnlichkeit (synonyme Formulierungen, paraphrasierte Goals) zuverlässiger.

#### 6.2 Wiki-MCP

In-Process MCP-Server via `createSdkMcpServer` mit zwei Tools:

| Tool | Eingabe | Verhalten |
|---|---|---|
| `mcp__wiki__search` | `{ query, domain, k }` | ChromaDB-Vector-Search in `wiki_<domain>` → Liste `{ path, excerpt, score }` |
| `mcp__wiki__read` | `{ path }` | `Read` von `wiki/<path>.md` (mit Frontmatter-Parse) |

Damit kann der Agent das Faktenwissen *retrieval-getrieben* abrufen, ohne Wiki-Seiten ins Frontmatter zu pumpen.

#### 6.3 Skill-Auswahl-Logik

Der vom Pre-Filter produzierte Top-k-Set wird via `skills: ['name1','name2',...]` an `query()` durchgereicht. Diese Option (SDK 0.2.120+) **filtert die im SDK-Discovery-Schritt gefundenen Skills** auf genau diese Namen. Der SDK lädt nur deren Frontmatter ins Kontextfenster — der Body kommt erst beim `Skill`-Tool-Aufruf. Damit:

- N (alle Skills im Filesystem) kann beliebig groß sein
- k (Pre-Filter-Top-k) hält Frontmatter-Budget eng (~5 Skills × ~150 Tokens Frontmatter = ~750 Tokens)
- Body (~500–1500 Tokens) wird nur beim aktiv genutzten Skill in den Kontext gezogen

Genau die Progressive-Disclosure-Eigenschaft, die wir wollten.

---

### 7. Datenmodelle

#### 7.1 Chat-Session (JSONL, unverändert)

Wie zuvor, plus zwei Felder, die der Agent SDK über Hooks liefert:
- `session_id` (vom SDK selbst gesetzt)
- `tool_calls[]` mit `tool_name` (z. B. `mcp__wiki__search`) und Parametern

#### 7.2 SKILL.md (siehe §4.2)

Frontmatter-Pflicht: `name`, `description`. Body strukturiert mit Sektionen: Provenance, WHEN, DO, BECAUSE, EVIDENCE, ANTI-PATTERN.

#### 7.3 ChromaDB-Collections

```
wiki_<domain>:
  document: chunk-text
  metadata: { source_path, heading, last_updated, source_hash }

strategy_descriptions:
  document: SKILL.md frontmatter description (full text)
  metadata: { skill_name, domain, status, confidence, support_count,
              last_verified, skill_path }
```

#### 7.4 SQLite-Queue

Schema unverändert (siehe vorigen Bericht §7.1).

---

### 8. Umsetzung mit dem SDK — Kniffe und Stolpersteine

**`settingSources` ist Pflicht.** Per default lädt der SDK keine Filesystem-Settings; ohne `settingSources: ['project']` werden weder SKILL.md noch CLAUDE.md erkannt. Skills tauchen dann als „nicht verfügbar" auf.

**`skills`-Option auto-allows den `Skill`-Tool.** Setze entweder `skills: 'all'` oder eine string-Liste; ohne Setzen muss man `'Skill'` manuell in `allowedTools` aufnehmen.

**Bekannter Bug in SDK 0.1.22**: Skill-Auto-Discovery kann scheitern, wenn `cwd` und `.claude/`-Position nicht exakt aufeinander zeigen — Issue #36 im SDK-Repo. Workaround: explizit `cwd: path.resolve(repoRoot)` setzen, plus Sanity-Check beim Start (`query("/skills")` und prüfen, dass die erwartete Anzahl gelistet wird).

**`allowed-tools` im SKILL.md-Frontmatter wirkt nur in Claude-Code-CLI**, nicht im SDK. Tool-Restriktionen für Skills werden über `allowedTools` in den Options gesteuert. Für Strategy-Skills (die nur Anweisungen sind, keine Tool-Aufrufe machen) ist das unkritisch.

**Subagents programmatisch oder als Files.** Der Reflect/Ground/Consolidate-Subagent kann via `agents`-Option inline definiert werden — bequem, weil keine extra Files. Für Wiederverwendung sind Files (`.claude/agents/<name>.md`) sauberer. Empfehlung: Pipeline-Subagents als Files, einmalige Tasks inline.

**`outputFormat` für Stage 3 (REFLECT) und Stage 6 (CONSOLIDATE).** Strukturierter Output-Mode mit JSON-Schema spart Parse-Heuristiken; läuft mit Zod-Schemas reibungslos.

**Hooks für Session-Logging.** `SessionEnd`-Hook + `TaskCompleted`-Hook schreiben automatisch JSONL nach `sessions/`. Outcome-Detection: Heuristik im Hook (Tool-Errors zählen, User-Feedback-Sentiment), plus optional ein Klassifier-Subagent als Async-Tail-Job in der Queue.

**Built-in `WebSearch`-Tool** in der TypeScript-Edition des SDK ist ausreichend für Stage 5; falls feinere Kontrolle nötig (Rate-Limiting, Source-Diversität), eigenes MCP-Tool mit Brave/Firecrawl.

---

### 9. Implementierungs-Roadmap

| Phase | Dauer | Deliverable |
|---|---|---|
| **P0 — Setup** | 1 Wo | Repo-Struktur; `chroma`-Binary lokal, Subprozess-Runner; SDK-Skelett (`query()` läuft) |
| **P1 — Wiki-Layer** | 2 Wo | Karpathy-Wiki + ChromaDB-Sync via chokidar; `wiki`-MCP-Server; Inference-Agent kann Wiki abfragen |
| **P2 — Session-Logger** | 1 Wo | Hooks schreiben Sessions; Outcome-Detection-Subagent |
| **P3 — SQLite-MQ** | 1 Wo | Queue-Schema, Worker-Loop, Cron-Trigger, Crash-Recovery, kleine Express-Route für `SELECT * FROM jobs` |
| **P4 — Dreaming v1** | 3 Wo | Stages 1–4 (HARVEST → DISTILL); REFLECT-Subagent mit `outputFormat`; ohne Web-Search |
| **P5 — Web-Grounding** | 1 Wo | Stage 5 mit Built-in WebSearch oder Brave-MCP |
| **P6 — Consolidate + Promote + Index** | 2 Wo | Stages 6–8; SKILL.md-Schreiber atomar; ChromaDB-Upsert; Conflict-Detection |
| **P7 — Strategy-Inference** | 1 Wo | Pre-Filter; `skills`-Option im Inference-Agent; A/B-Vergleich |
| **P8 — Eval + Härtung** | 2 Wo | Domain-spezifischer Eval-Set; Stale-Detection; Skill-Validator (Lint vor Promotion) |

**Gesamt:** ~14 Wochen. Eine Woche länger als die vorige Variante — der Mehraufwand für ChromaDB-Subprozess-Management und Pre-Filter wird teilweise durch wegfallende eigene Hybrid-Retriever-Logik ausgeglichen.

---

### 10. Trade-offs gegenüber Variante 1

| Dimension | v1 (Mastra + LanceDB + BullMQ) | v2 (Agent SDK + Chroma + SQLite-MQ) |
|---|---|---|
| Externe Infrastruktur | Redis (BullMQ) | Chroma-Subprozess (lokales Binary) |
| Strategie-Format | Eigene Markdown-Cards + Vector-Index | **SKILL.md — first-class SDK-Konzept** |
| Strategie-Auswahl | Eigener Hybrid-Retriever | **SDK-internes Frontmatter-Routing + ChromaDB-Pre-Filter** |
| Progressive Disclosure | Eigene Implementierung nötig | **Geschenkt durch Skill-Lifecycle** |
| Web-Search | Brave/Tavily/Exa | **Built-in WebSearch des SDK** |
| Job-Queue | BullMQ + Redis | **SQLite-Eigenbau** |
| Vendor-Lock-in | Mastra + Vercel-AI-SDK | Anthropic-SDK (proprietäre Lizenz!) |
| Skalierungsdecke | LanceDB embedded ~Mio. Vektoren | Chroma single-node bis ~10 M; Cloud-Modus optional |
| Best Practice für 2026 | Generisch, vendor-agnostisch | **Optimal für Anthropic-fokussierte Projekte** |

Der zentrale Trade-off: **Vendor-Bindung an Anthropic vs. Eleganz**. Für ein dediziertes Anthropic-Projekt überwiegt die Eleganz deutlich — das Skill-Konzept löst genau die Probleme, die in v1 erst mühsam zusammengeschraubt werden mussten.



### 11. Referenzen

**Konzeptuelle Grundlagen** (unverändert aus v1)
- Karpathy `llm-wiki.md` gist (April 2026)
- CoALA: Sumers/Yao 2023, arXiv:2309.02427
- Generative Agents: Park 2023, arXiv:2304.03442
- Voyager: Wang 2023, arXiv:2305.16291 — **Skill-Library indexed by description**
- Reflexion: Shinn 2023, arXiv:2303.11366
- ExpeL: Zhao 2024, arXiv:2308.10144
- AutoGuide / AutoManual 2024
- Sleep-time Compute: Lin/Snell 2025, arXiv:2504.13171 (Letta)
- ERL 2026, arXiv:2603.24639




