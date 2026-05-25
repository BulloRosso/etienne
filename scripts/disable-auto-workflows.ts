/**
 * Disable every autonomous LLM call mechanism on the existing seeded projects.
 *
 * For each project (default: desalination-devices, factory-line-sim,
 * tanker-long-horizon):
 *   1. Dreaming     → POST /api/dreaming/<p>/settings { enabled: false }
 *   2. Scheduled    → for every task: DELETE /api/scheduler/<p>/task/<id>.
 *                     (TaskDefinition has no `enabled` field, and the cron
 *                     library rejects truly-never expressions like Feb 30.
 *                     Delete is reversible by re-running the seed step that
 *                     registered the task; the task body is in source.)
 *   3. Event rules  → for every enabled rule (e.g. rag-auto-index-documents):
 *                     PUT /api/rules/<p>/<ruleId> { enabled: false }.
 *
 * Idempotent. Per-project errors are surfaced but don't abort the loop.
 *
 * Run:
 *   npx tsx scripts/disable-auto-workflows.ts
 *   npx tsx scripts/disable-auto-workflows.ts --projects desalination-devices,tanker-long-horizon
 */
import { login } from './seed-long-horizon-commitments/lib/auth';
import { apiFetch, ApiError, type ApiContext } from './seed-long-horizon-commitments/lib/api';

const DEFAULT_PROJECTS = ['desalination-devices', 'factory-line-sim', 'tanker-long-horizon'];

interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  cronExpression: string;
  timeZone?: string;
  type?: 'recurring' | 'one-time';
}

interface EventRule {
  id: string;
  name: string;
  enabled: boolean;
  condition: unknown;
  action: unknown;
}

interface ProjectChange {
  project: string;
  dreaming?: { wasEnabled: boolean; nowEnabled: boolean };
  tasks: Array<{ taskId: string; cron: string; action: 'deleted' | 'already-absent' }>;
  rules: Array<{ ruleId: string; wasEnabled: boolean; nowEnabled: boolean }>;
  errors: string[];
}

function header(s: string) { console.log(`\n\x1b[1m▸ ${s}\x1b[0m`); }
function ok(s: string)     { console.log(`  \x1b[32m✓\x1b[0m ${s}`); }
function info(s: string)   { console.log(`  \x1b[2m·\x1b[0m ${s}`); }
function warn(s: string)   { console.log(`  \x1b[33m!\x1b[0m ${s}`); }

async function disableDreaming(ctx: ApiContext, project: string, change: ProjectChange): Promise<void> {
  try {
    const current = await apiFetch<{ enabled?: boolean }>(ctx, `/api/dreaming/${project}/settings`);
    const wasEnabled = !!current?.enabled;
    if (!wasEnabled) {
      info(`dreaming: already disabled`);
      change.dreaming = { wasEnabled: false, nowEnabled: false };
      return;
    }
    await apiFetch(ctx, `/api/dreaming/${project}/settings`, {
      method: 'POST',
      body: JSON.stringify({ enabled: false }),
    });
    ok(`dreaming: ON → OFF`);
    change.dreaming = { wasEnabled: true, nowEnabled: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`dreaming: ${msg}`);
    change.errors.push(`dreaming: ${msg}`);
  }
}

async function disableScheduledTasks(ctx: ApiContext, project: string, change: ProjectChange): Promise<void> {
  let tasks: ScheduledTask[] = [];
  try {
    // Endpoint returns either a bare array or { tasks: [...] } depending on
    // the controller version; handle both shapes.
    const resp = await apiFetch<ScheduledTask[] | { tasks?: ScheduledTask[] }>(
      ctx, `/api/scheduler/${project}/tasks`,
    );
    tasks = Array.isArray(resp) ? resp : (resp?.tasks ?? []);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      info(`scheduler: no tasks`);
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    warn(`scheduler list: ${msg}`);
    change.errors.push(`scheduler list: ${msg}`);
    return;
  }

  if (tasks.length === 0) {
    info(`scheduler: no tasks`);
    return;
  }

  for (const task of tasks) {
    try {
      await apiFetch(ctx, `/api/scheduler/${project}/task/${encodeURIComponent(task.id)}`, {
        method: 'DELETE',
      });
      ok(`task ${task.id}: deleted (was cron=${task.cronExpression})`);
      change.tasks.push({ taskId: task.id, cron: task.cronExpression, action: 'deleted' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warn(`task ${task.id}: ${msg}`);
      change.errors.push(`task ${task.id}: ${msg}`);
    }
  }
}

async function disableEventRules(ctx: ApiContext, project: string, change: ProjectChange): Promise<void> {
  let rules: EventRule[] = [];
  try {
    // Rules controller is mounted at /api/rules and returns
    // { success: true, count: N, rules: [...] }.
    const resp = await apiFetch<{ success?: boolean; rules?: EventRule[] } | EventRule[]>(
      ctx, `/api/rules/${project}`,
    );
    rules = Array.isArray(resp) ? resp : (resp?.rules ?? []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`event rules list: ${msg}`);
    change.errors.push(`event rules list: ${msg}`);
    return;
  }

  if (rules.length === 0) {
    info(`event rules: none`);
    return;
  }

  const enabled = rules.filter((r) => r.enabled);
  if (enabled.length === 0) {
    info(`event rules: ${rules.length} present, all already disabled`);
    return;
  }

  for (const rule of enabled) {
    try {
      await apiFetch(ctx, `/api/rules/${project}/${encodeURIComponent(rule.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: false }),
      });
      ok(`rule ${rule.id}: ON → OFF`);
      change.rules.push({ ruleId: rule.id, wasEnabled: true, nowEnabled: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warn(`rule ${rule.id}: ${msg}`);
      change.errors.push(`rule ${rule.id}: ${msg}`);
    }
  }
}

function parseProjectsArg(): string[] {
  const argv = process.argv.slice(2);
  const idx = argv.findIndex((a) => a === '--projects' || a.startsWith('--projects='));
  if (idx === -1) return DEFAULT_PROJECTS;
  const arg = argv[idx];
  const value = arg.includes('=') ? arg.split('=', 2)[1] : argv[idx + 1];
  if (!value) return DEFAULT_PROJECTS;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function printReport(changes: ProjectChange[]): void {
  console.log('\n\x1b[1m=== summary ===\x1b[0m');
  for (const c of changes) {
    console.log(`\n  \x1b[1m${c.project}\x1b[0m`);
    if (c.dreaming) {
      console.log(`    dreaming      : ${c.dreaming.wasEnabled ? 'ON' : 'off'} → ${c.dreaming.nowEnabled ? 'ON' : 'off'}`);
    }
    if (c.tasks.length === 0) {
      console.log(`    tasks         : (none)`);
    } else {
      for (const t of c.tasks) {
        console.log(`    task ${t.taskId.padEnd(28)}: ${t.action} (was cron=${t.cron})`);
      }
    }
    if (c.rules.length === 0) {
      console.log(`    rules         : (none flipped)`);
    } else {
      for (const r of c.rules) {
        console.log(`    rule ${r.ruleId.padEnd(28)}: ${r.wasEnabled ? 'ON' : 'off'} → ${r.nowEnabled ? 'ON' : 'off'}`);
      }
    }
    if (c.errors.length > 0) {
      console.log(`    \x1b[31merrors\x1b[0m: ${c.errors.length}`);
      for (const e of c.errors) console.log(`      - ${e}`);
    }
  }
}

async function main(): Promise<void> {
  const projects = parseProjectsArg();
  console.log(`\x1b[1mDisabling autonomous LLM mechanisms on:\x1b[0m ${projects.join(', ')}`);

  header('Authenticate');
  const auth = await login();
  const ctx: ApiContext = { accessToken: auth.accessToken };
  ok(`logged in as ${auth.user.username}`);

  const changes: ProjectChange[] = [];
  for (const project of projects) {
    header(project);
    const change: ProjectChange = { project, tasks: [], rules: [], errors: [] };
    await disableDreaming(ctx, project, change);
    await disableScheduledTasks(ctx, project, change);
    await disableEventRules(ctx, project, change);
    changes.push(change);
  }

  printReport(changes);

  const hardErrors = changes.some((c) => c.errors.length > 0);
  if (hardErrors) {
    console.log(`\n\x1b[33m! completed with per-project errors\x1b[0m`);
  } else {
    console.log(`\n\x1b[32m✓ done\x1b[0m`);
  }
}

main().catch((err) => {
  console.error(`\n\x1b[31m✗ FAILED:\x1b[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
