# Backend tests

There is no test framework configured for this backend. Tests are ad-hoc
TypeScript files run with [`tsx`](https://github.com/privatenumber/tsx); each
file is its own `main()` that exits non-zero on failure. Run any test by name:

```bash
cd backend
npx tsx test/<name>.test.ts
```

The tests fall into three groups:

| Group | Filename pattern | What they cover | Requires |
|---|---|---|---|
| Unit | `memory-*.test.ts`, `adaptive-memory-{fakes,config,sessions-store,skills-store,personality-store,picker,packer,writeback,agent,quality-scoring,review-queue,ponderer}.test.ts` | Pure logic + fakes. No network, no live services. | nothing |
| Wiki skill smoke | `skill-repository/standard/wiki/scripts/test-roundtrip.mjs` | The `wiki-add` + `wiki-delete` + frontmatter round-trip through the actual `tsx` scripts. | A node_modules dir provisioned somewhere (the test borrows from `workspace/wiki-test/.claude/skills/wiki/node_modules`) |
| **Integration** | `integration-*.test.ts` | Real adapters / orchestrator against live Chroma + Quadstore. | Vector store on `:7100`, RDF store on `:7000` (see below) |

The unit + smoke groups are deterministic and CI-safe. The integration tests
**auto-skip** when their target service is not reachable, so running every
test in a loop works whether the live stores are up or not.

---

## Unit tests (run anywhere)

| File | Coverage | Asserts |
|---|---|---|
| `memory-classification.test.ts` | `backend/src/memory/classification.ts` — every firewall helper (`maxClassification`, `strictestCeiling`, `enforceWriteClassification`, `applyClassificationCeiling`, `personalityAdmissionCheck`, `assertNoSecretEvidence`). | 26 |
| `memory-verdict-mapping.test.ts` | legacy `good`/`bad`/`deepen` ↔ PRD `pending`/`good`/`badly_reasoned`/`unusable` bridge, type guards, round-trip stability. | 18 |
| `adaptive-memory-fakes.test.ts` | In-memory `WikiFake` / `KGFake` / `RAGFake` / `SORFake` / `PreferencesFake`. The substrate for Picker/Packer/Agent integration tests. | 16 |
| `adaptive-memory-config.test.ts` | `AdaptiveMemoryConfigService`: the file-existence activation gate, two-layer merge (baked-in ← workspace defaults ← per-project), sparse-write semantics, activation/deactivation lifecycle. | 12 |
| `adaptive-memory-sessions-store.test.ts` | Workspace snapshot capture, per-turn `storeWrites`, scoring lifecycle, idempotent close. | 8 |
| `adaptive-memory-skills-store.test.ts` | `originalHash` preserved across writes, frontmatter round-trip, conservative defaults for skills without frontmatter. | 10 |
| `adaptive-memory-personality-store.test.ts` | **Firewall point 3** (admission). Secret → reject, private+non-abstract → reject, private+abstract → admit. Cross-project storage at `workspace/.agent/personality/`. | 10 |
| `adaptive-memory-picker.test.ts` | **Firewall point 4** (Picker has no PersonalityStore dep) — verified by `reflect-metadata` constructor introspection. Whole-page wiki rule. Source-ceiling-based RAG filter at the source. | 7 |
| `adaptive-memory-packer.test.ts` | **Firewall point 2** (pack-time classification ceiling). The 4 levers in order: ceiling → priority → recency → whole-page protection. `meta.sourceSummary` per-store accounting. | 9 |
| `adaptive-memory-writeback.test.ts` | **Firewall point 1** (write-time). Every tool rejects missing/invalid classification; success records to `SessionTurn.storeWrites`; post-firewall failures surface as `ok:false`. | 10 |
| `adaptive-memory-agent.test.ts` | End-to-end `runTask`: activation gate refuses, success path with one writeback persists everywhere, classification firewall blocks within-task writes, event timeline matches PRD order. | 8 |
| `adaptive-memory-quality-scoring.test.ts` | PRD §6.1 quality formula. The PRD-critical ordering property: clean > corrective > retry-spam with the same workspace change. | 10 |
| `adaptive-memory-review-queue.test.ts` | JSONL append-only with tombstones, latest-verdict-wins replay, per-project + cross-project indexes, malformed-line tolerance. | 10 |
| `adaptive-memory-ponderer.test.ts` | End-to-end 5-stage cycle: quality scoring → maintenance → personality induction → self-edit → publish-review. Activation gate. Event emission. | 7 |

Total: **161 assertions** across 14 unit-style files. Run them all:

```bash
cd backend
for f in test/memory-*.test.ts test/adaptive-memory-*.test.ts; do
  echo "--- $f"
  npx tsx "$f" 2>&1 | tail -1
done
```

---

## Integration tests (require live services)

These exercise the same code paths through the **real** ChromaDB (`:7100`)
and Quadstore (`:7000`) services. They auto-skip with a `SKIP …` log line
when the service is not reachable, so they're safe to include in any "run
everything" loop.

Start the services first:

```bash
# RDF store
cd rdf-store && npm i && npm run dev          # :7000

# Vector store
cd vector-store && npm i && npm run dev       # :7100
```

| File | Service | Validates |
|---|---|---|
| `integration-kg-adapter.test.ts` | Quadstore :7000 | `RealKGAdapter.assertEntity / assertEdge / subgraph / prune` round-trips classification + provenance through real RDF triples. Caught the "properties flat vs. nested" reading bug that the in-memory fake couldn't surface. |
| `integration-chroma-firewall.test.ts` | ChromaDB :7100 | **Firewall point 5** at the wire level: a `where: { classification: { $in: [...] } }` query against a real Chroma collection returns only fragments whose stored classification is in the allowed list. Bypasses RagService so it doesn't need the embeddings model. |
| `integration-ponderer-live.test.ts` | Quadstore :7000 | Full Ponderer cycle against the live KG: opt project in, seed a session + a live RDF entity, run `Ponderer.run`, assert ReviewItems are published and a PersonalityEntry is admitted into `workspace/.agent/personality/`. |

Run them:

```bash
cd backend
for f in test/integration-*.test.ts; do
  echo "--- $f"
  npx tsx "$f" 2>&1 | tail -1
done
```

When the live services are up you should see `All ... tests passed`. When a
service is down you'll see `SKIP integration-*` and a clean exit (0).

### Environment variables

| Variable | Default | Used by |
|---|---|---|
| `CHROMADB_URL` | `http://localhost:7100` | `integration-chroma-firewall.test.ts` |
| `QUADSTORE_URL` | `http://localhost:7000` | `integration-kg-adapter.test.ts`, `integration-ponderer-live.test.ts` |
| `WORKSPACE_ROOT` | overridden per-test to a temp dir | every Adaptive-Memory test creates its own throwaway workspace |

### Why integration tests at all?

The unit tests + fakes cover behaviour exhaustively but cannot catch
**wire-format drift** between the Adaptive-Memory adapters and the underlying
services. The KG integration test caught a real bug in
`RealKGAdapter.fetchEntity` (was reading from `raw.properties.*`, the
underlying service returns the flat property bag at the top level of the
return value) — the in-memory `KGFake` hadn't mirrored that shape, so the
unit suite was green while production reads were silently losing
classification and provenance.

The principle: every adapter that translates between the PRD shape and an
external service gets an integration test that exercises a real round-trip.

---

## Adding a new test

1. Decide where it goes:
   - **Unit** → `test/adaptive-memory-<thing>.test.ts` or `test/memory-<thing>.test.ts`.
   - **Integration** → `test/integration-<service>-<thing>.test.ts`.
2. Use the `tsx` + `node:assert` style — no test framework needed.
3. For integration tests, check the service health first and `console.log('SKIP …')`
   + early return when the service is down. **Never** fail the test for a missing service.
4. For temp workspaces, set `process.env.WORKSPACE_ROOT` to a `mkdtempSync` path,
   then dynamically `import` Adaptive-Memory modules so they pick up the env var.
5. Always clean up the temp workspace in a `finally` block (`rmSync(..., { recursive: true, force: true })`).

A reasonable per-assertion `console.log('  PASS …')` is the convention; the
final line should be `All <thing> tests passed.` on success.

---

## Design-support integration tests (Engineering Design Support System)

These prove the **information-flow dependencies** of the Engineering Design
Support System (spec §4) actually propagate. They are HTTP-driven against the
live backend (`:6060`) + OAuth (`:5950`) + Quadstore (`:7000`), use a unique
throwaway project per run, and **auto-`SKIP` (exit 0)** when a required
service is unreachable — safe in any "run everything" loop. Shared harness:
`test/lib/ds-harness.ts`.

| File | Dependency edge proven | Spec |
|---|---|---|
| `integration-ds-relevance-propagation.test.ts` | mission edit → relevance recompute + Gap materialization | §4.1/§4.2, REQ-3,6,8 |
| `integration-ds-focus-budget.test.ts` | focus decay + Σfocus conservation invariant | §4.1, REQ-7 |
| `integration-ds-scrapbook-mirror.test.ts` | KG ⇄ scrapbook projection (forward + reverse, divergence flag) | REQ-5,8,9 |
| `integration-ds-hypothesis-lifecycle.test.ts` | workflow drives lifecycle; onEntry-prompt anti-vagueness gate | optional component, REQ-18 |
| `integration-ds-cascade-on-refutation.test.ts` | **keystone**: refute → CascadeReport + entailed-hypothesis REOPEN + mission-revision Gap | hypothesis side-effects |
| `integration-ds-mission-derivation.test.ts` | mission edit → derivation workflow triage + DerivationTriage audit | §4.2, meta-workflow |
| `integration-ds-report-snapshot.test.ts` | report = query over state; internal vs external filter; immutable snapshots; delta | REQ-23..30 |
| `integration-ds-critic-push.test.ts` | the single push: critic mission-contradiction; pull-only invariant | REQ-20,21 |
| `integration-ds-seed-smoke.test.ts` | seed → workspace reproducibility (design-support artefacts present) | reproducibility |

Run the whole suite in order (PASS/SKIP/FAIL aggregated, non-zero on any FAIL):

```bash
cd backend
node test/run-ds-integration.mjs
```

Or a single edge:

```bash
cd backend
npx tsx test/integration-ds-cascade-on-refutation.test.ts
```

The cascade-on-refutation test passing is the decisive proof that "proving
things wrong" scopes the downstream revision work rather than leaving it
implicit.
