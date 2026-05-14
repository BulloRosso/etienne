/**
 * AdaptiveMemoryAgent end-to-end orchestrator test (against fake adapters
 * and a fake LlmService — no network).
 *
 * Validates:
 *   - The activation gate refuses with AdaptiveMemoryInactiveError when the
 *     per-project config file is missing.
 *   - With an active project, runTask drives the full pipeline:
 *     frame → pick → pack → runWithTools → close.
 *   - Events appear on the per-project RxJS Subject in the documented order.
 *   - The fake LLM can invoke writeback tools, and those tools persist to
 *     the underlying adapters AND to SessionTurn.storeWrites.
 *   - The classification firewall fires when the LLM attempts a write
 *     without a valid `classification`.
 *
 * Run with: tsx test/adaptive-memory-agent.test.ts
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'agent-'));
  process.env.WORKSPACE_ROOT = workspace;
  const project = 'agent-proj';

  // --- Provision project ---------------------------------------------------
  // Skill: dreaming, with invocationTrigger that the test prompt matches.
  const skillDir = join(workspace, project, '.claude', 'skills', 'dreaming');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---
description: Reflection skill
classificationContext: private
invocationTriggers:
  - dream
  - reflect
sourcePriorities:
  - store: wiki
    priority: 1
  - store: rag
    priority: 5
---
# Dreaming
`,
    'utf8',
  );
  mkdirSync(join(workspace, project, '.etienne'), { recursive: true });
  console.log(`# workspace: ${workspace}`);

  try {
    const { AdaptiveMemoryAgent, AdaptiveMemoryInactiveError } = await import(
      '../src/adaptive-memory/agent/adaptive-memory-agent.service'
    );
    const { TaskFramingService } = await import(
      '../src/adaptive-memory/agent/task-framing.service'
    );
    const { Picker } = await import(
      '../src/adaptive-memory/subagents/picker.service'
    );
    const { Packer } = await import(
      '../src/adaptive-memory/subagents/packer.service'
    );
    const { SkillsStore } = await import(
      '../src/adaptive-memory/stores/skills.store'
    );
    const { SessionsStore } = await import(
      '../src/adaptive-memory/stores/sessions.store'
    );
    const { AdaptiveMemoryConfigService } = await import(
      '../src/adaptive-memory/config/adaptive-memory-config.service'
    );
    const {
      KGFake,
      PreferencesFake,
      RAGFake,
      SORFake,
      WikiFake,
    } = await import('../src/adaptive-memory/adapters/fakes');

    const PROV = {
      sourceSessions: ['s'],
      sourceEntries: [],
      createdBy: 'agent' as const,
      createdAt: '2026-05-14T00:00:00Z',
      updatedAt: '2026-05-14T00:00:00Z',
    };

    // --- Adapters with seed data ------------------------------------------
    const wiki = new WikiFake();
    const kg = new KGFake();
    const rag = new RAGFake();
    const sor = new SORFake();
    const preferences = new PreferencesFake();
    wiki.seed(project, {
      id: 'mid-century-sofa',
      classification: 'private',
      provenance: PROV,
      title: 'Mid-century Sofa',
      slug: 'mid-century-sofa',
      body: 'A walnut-frame mid-century sofa.',
      links: [],
    });
    rag.seed(project, {
      id: 'r1',
      classification: 'public',
      provenance: PROV,
      text: 'walnut durability',
      embeddingId: 'v1',
      tags: ['furniture'],
    });

    const skills = new SkillsStore();
    const sessions = new SessionsStore();
    const config = new AdaptiveMemoryConfigService();
    const framing = new TaskFramingService({} as any, skills);
    const picker = new Picker(wiki as any, kg as any, rag as any, sor as any, preferences as any, skills);
    const packer = new Packer();

    // --- Fake LlmService ---------------------------------------------------
    // The agent only calls .runWithTools. We simulate one tool call followed
    // by a final-text response. The mock invokes the supplied tool.execute
    // directly so the firewall and SessionTurn.storeWrites side effects fire
    // for real.
    type ToolMap = Record<string, { execute: (input: any) => Promise<any> }>;
    interface ToolPlan {
      tool: string;
      input: Record<string, unknown>;
    }
    const llmCalls: any[] = [];
    function makeFakeLlm(plans: ToolPlan[], finalText: string) {
      return {
        runWithTools: async (opts: {
          system?: string;
          messages: any[];
          tools: ToolMap;
          maxSteps?: number;
          projectDir?: string;
        }) => {
          llmCalls.push(opts);
          let toolCalls = 0;
          for (const plan of plans) {
            const t = opts.tools[plan.tool];
            assert.ok(t, `LlmService.runWithTools was given tool ${plan.tool}`);
            await t.execute(plan.input);
            toolCalls += 1;
          }
          return { text: finalText, toolCalls, steps: 1 + plans.length };
        },
      };
    }

    // === 1. activation gate ===============================================
    const inactiveLlm = makeFakeLlm([], 'should never reach');
    const inactiveAgent = new AdaptiveMemoryAgent(
      framing,
      picker,
      packer,
      inactiveLlm as any,
      sessions,
      config,
      { wiki, kg, rag, preferences } as any,
    );
    await assert.rejects(
      () => inactiveAgent.runTask(project, 'reflect on this'),
      (err: any) => err instanceof AdaptiveMemoryInactiveError && err.project === project,
      'runTask should throw AdaptiveMemoryInactiveError when not opted in',
    );
    console.log('  PASS  runTask refuses with AdaptiveMemoryInactiveError when inactive');

    // === 2. activate the project ==========================================
    await config.save(project, { tokenBudget: 50_000 });
    assert.equal(config.isActive(project), true);

    // === 3. success path with one writeback ===============================
    const successPlan: ToolPlan[] = [
      {
        tool: 'wiki_put_page',
        input: {
          title: 'Reflection on Walnut',
          body: 'Walnut is good.',
          sources: [{ kind: 'conversation', turn: '2026-05-14T00:00:00Z' }],
          classification: 'private',
          provenance: PROV,
        },
      },
    ];
    const fakeLlm = makeFakeLlm(successPlan, 'Reflected and wrote the page.');
    const agent = new AdaptiveMemoryAgent(
      framing,
      picker,
      packer,
      fakeLlm as any,
      sessions,
      config,
      { wiki, kg, rag, preferences } as any,
    );

    const events: any[] = [];
    agent.getEventSubject(project).subscribe((e) => events.push(e));

    const result = await agent.runTask(project, 'Please reflect on walnut and add a wiki page');
    assert.ok(result.sessionId);
    assert.equal(result.text, 'Reflected and wrote the page.');
    assert.equal(result.toolCalls, 1);
    assert.ok(result.durationMs >= 0);
    console.log('  PASS  runTask completes and returns text + toolCalls + duration');

    // === 4. Picker received the framing; LLM received the packed prompt ==
    assert.equal(llmCalls.length, 1);
    const call = llmCalls[0];
    assert.ok(call.system?.includes('Dreaming'), 'system prompt contains active skill body');
    assert.ok(
      String(call.messages?.[0]?.content ?? '').includes('Mid-century Sofa'),
      'wiki page body flowed through Picker → Packer into the LLM user message',
    );
    console.log('  PASS  Picker output reaches Packer reaches runWithTools');

    // === 5. Writeback persisted to the underlying adapter =================
    const newPage = await wiki.getPage(project, 'reflection-on-walnut');
    assert.ok(newPage, 'wiki_put_page should have created the page in the adapter');
    assert.equal(newPage.classification, 'private');
    console.log('  PASS  successful tool call hits the underlying adapter');

    // === 6. SessionTurn.storeWrites populated =============================
    const sess = await sessions.read(project, result.sessionId);
    assert.ok(sess);
    const allWrites = sess.turns.flatMap((t) => t.storeWrites);
    assert.ok(
      allWrites.some((w) => w.store === 'wiki' && w.entryId === 'reflection-on-walnut'),
      'session turn should record the wiki write',
    );
    console.log('  PASS  SessionTurn.storeWrites records successful tool call');

    // === 7. Event timeline ================================================
    const types = events.map((e) => e.type);
    // We expect at least these in this order (other events may interleave).
    const order = ['task-started', 'frame', 'pick', 'pack', 'tool-use', 'task-completed'];
    let cursor = 0;
    for (const want of order) {
      const at = types.indexOf(want, cursor);
      assert.ok(at >= 0, `missing event ${want}; got: ${types.join(',')}`);
      cursor = at + 1;
    }
    console.log('  PASS  event timeline: task-started → frame → pick → pack → tool-use → task-completed');

    // === 8. classification firewall fires when the LLM omits it ===========
    const badPlan: ToolPlan[] = [
      {
        tool: 'wiki_put_page',
        input: {
          title: 'No Classification',
          body: 'b',
          sources: [],
          // classification deliberately omitted
          provenance: PROV,
        },
      },
    ];
    const badLlm = makeFakeLlm(badPlan, 'tried to write without classification');
    const badAgent = new AdaptiveMemoryAgent(
      framing,
      picker,
      packer,
      badLlm as any,
      sessions,
      config,
      { wiki, kg, rag, preferences } as any,
    );
    const badEvents: any[] = [];
    badAgent.getEventSubject(project).subscribe((e) => badEvents.push(e));
    const badResult = await badAgent.runTask(project, 'reflect carelessly');
    // The model's tool call was rejected by the firewall — but runTask itself
    // does not fail; the agent still returns the model's final text. This is
    // PRD-correct: tool rejections are visible to the model and to SSE.
    assert.ok(badResult);
    const rejectionEvent = badEvents.find(
      (e) => e.type === 'tool-use' && e.payload.ok === false,
    );
    assert.ok(rejectionEvent, 'expected a tool-use rejection event');
    assert.equal(rejectionEvent.payload.error, 'writeback_missing_or_invalid_classification');
    // And no rogue page reached the wiki.
    const rogue = await wiki.getPage(project, 'no-classification');
    assert.equal(rogue, null);
    console.log('  PASS  classification firewall blocks writes during the agent loop');

    // === 9. inactive runTask emits no events ==============================
    await config.deactivate(project);
    const postDeactivateEvents: any[] = [];
    agent.getEventSubject(project).subscribe((e) => postDeactivateEvents.push(e));
    await assert.rejects(
      () => agent.runTask(project, 'should be inactive'),
      (err: any) => err instanceof AdaptiveMemoryInactiveError,
    );
    // Activation throws *before* emitting task-started so the post-deactivate
    // listener should see zero events from this call.
    assert.equal(postDeactivateEvents.length, 0);
    console.log('  PASS  inactive runTask emits no events');

    console.log('\nAll AdaptiveMemoryAgent tests passed.');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
