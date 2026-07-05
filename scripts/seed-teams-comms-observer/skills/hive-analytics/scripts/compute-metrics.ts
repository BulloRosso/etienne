/**
 * hive-analytics — deterministic communication metrics for the mirrored
 * Teams channels.
 *
 * Reads  : data/teams/<channel>/messages.jsonl   (latest line per id wins)
 * Writes : data/metrics/<today>.json             (full result)
 *          reports/data/hive-metrics.json        (Hive Pulse dashboard feed)
 *
 * Run from the project root:  npx tsx .claude/skills/hive-analytics/scripts/compute-metrics.ts
 * Optional: --project-root <dir>
 *
 * No dependencies beyond node built-ins. Definitions:
 * wiki/topics/metrics-reference.md. Core time: 08:00–18:00 UTC, Mon–Fri.
 */

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface Msg {
  id: string;
  replyToId: string | null;
  channelSlug: string;
  from: { name: string; kind: string };
  createdDateTime: string;
  deleted: boolean;
  text: string;
  mentions: string[];
}

const CORE_START = 8;
const CORE_END = 18;
const BURST_WINDOW_MS = 2 * 60 * 1000;
const BLOCKER_WINDOW_MS = 4 * 60 * 60 * 1000;
const CASCADE_WINDOW_MS = 30 * 60 * 1000;

const TARGETS = {
  medianReplyLatencyMin: 240, // ceiling (norm), not a speed target
  afterHoursSharePct: 5,
  burstIndexPct: 25,
  unansweredBlockers: 0,
  cascadeDepth: 1,
};

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const PROJECT_ROOT = argValue('--project-root') || process.cwd();

function isAfterHours(iso: string): boolean {
  const d = new Date(iso);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return true;
  const h = d.getUTCHours();
  return h < CORE_START || h >= CORE_END;
}

function isBlockerQuestion(text: string): boolean {
  return /\?/.test(text) && /(block|stuck|waiting|can'?t\s+(ship|proceed|continue))/i.test(text);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function round1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}

// ─── load ───────────────────────────────────────────────────────────────────

function loadChannel(slug: string): Msg[] {
  const file = join(PROJECT_ROOT, 'data', 'teams', slug, 'messages.jsonl');
  if (!existsSync(file)) return [];
  const latest = new Map<string, Msg>();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const m = JSON.parse(t) as Msg;
      latest.set(m.id, m);
    } catch { /* skip malformed */ }
  }
  return [...latest.values()]
    .filter((m) => !m.deleted)
    .sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime));
}

const teamsDir = join(PROJECT_ROOT, 'data', 'teams');
const slugs = existsSync(teamsDir)
  ? readdirSync(teamsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== '.meta')
      .map((e) => e.name)
  : [];

if (slugs.length === 0) {
  console.error(`No channels found under ${teamsDir} — nothing to compute.`);
  process.exit(1);
}

// ─── per-channel metric engine ──────────────────────────────────────────────

interface Bucket {
  messages: number;
  replyLatencies: number[]; // minutes, first reply by another person per root
  afterHours: number;
  bursts: number;
  unansweredBlockers: number;
  cascadeDepth: number;
}

function newBucket(): Bucket {
  return { messages: 0, replyLatencies: [], afterHours: 0, bursts: 0, unansweredBlockers: 0, cascadeDepth: 0 };
}

interface PersonAgg {
  messages: number;
  replyLatencies: number[]; // minutes since the previous message in the thread
  afterHours: number;
  bursts: number;
}

const byDayChannel = new Map<string, Map<string, Bucket>>(); // day -> slug -> bucket
const persons = new Map<string, PersonAgg>();

// weekday(0=Sun)×hour message counts — feeds the Pattern Radar heatmap
const emptyGrid = (): number[][] => Array.from({ length: 7 }, () => Array(24).fill(0));
const activityOverall = emptyGrid();
const activityByChannel = new Map<string, number[][]>();

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function bucketFor(day: string, slug: string): Bucket {
  let m = byDayChannel.get(day);
  if (!m) { m = new Map(); byDayChannel.set(day, m); }
  let b = m.get(slug);
  if (!b) { b = newBucket(); m.set(slug, b); }
  return b;
}

function personFor(name: string): PersonAgg {
  let p = persons.get(name);
  if (!p) { p = { messages: 0, replyLatencies: [], afterHours: 0, bursts: 0 }; persons.set(name, p); }
  return p;
}

for (const slug of slugs) {
  const msgs = loadChannel(slug);
  const byId = new Map(msgs.map((m) => [m.id, m]));
  const lastBySender = new Map<string, number>();
  const lastInThread = new Map<string, Msg>(); // rootId -> latest message in thread

  for (const m of msgs) {
    const t = Date.parse(m.createdDateTime);
    const day = dayOf(m.createdDateTime);
    const b = bucketFor(day, slug);
    const p = personFor(m.from.name);

    b.messages++;
    p.messages++;
    if (isAfterHours(m.createdDateTime)) { b.afterHours++; p.afterHours++; }

    const dObj = new Date(m.createdDateTime);
    activityOverall[dObj.getUTCDay()][dObj.getUTCHours()]++;
    if (!activityByChannel.has(slug)) activityByChannel.set(slug, emptyGrid());
    activityByChannel.get(slug)![dObj.getUTCDay()][dObj.getUTCHours()]++;

    // burst: same sender, same channel, < 2 min after their previous message
    const prev = lastBySender.get(m.from.name);
    if (prev !== undefined && t - prev < BURST_WINDOW_MS) { b.bursts++; p.bursts++; }
    lastBySender.set(m.from.name, t);

    // reply latency
    if (m.replyToId) {
      const root = byId.get(m.replyToId);
      const prevInThread = lastInThread.get(m.replyToId) ?? root;
      if (root && m.from.name !== root.from.name) {
        // first reply by another person defines the root's latency
        const firstReplySoFar = (root as any).__firstReplyAt as number | undefined;
        if (firstReplySoFar === undefined) {
          (root as any).__firstReplyAt = t;
          const latencyMin = (t - Date.parse(root.createdDateTime)) / 60000;
          bucketFor(dayOf(root.createdDateTime), slug).replyLatencies.push(latencyMin);
        }
      }
      if (prevInThread && prevInThread.from.name !== m.from.name) {
        p.replyLatencies.push((t - Date.parse(prevInThread.createdDateTime)) / 60000);
      }
      lastInThread.set(m.replyToId, m);
    }
  }

  // unanswered blockers: blocker roots without a reply by another person ≤ 4 h
  for (const m of msgs) {
    if (m.replyToId || !isBlockerQuestion(m.text)) continue;
    const firstReplyAt = (m as any).__firstReplyAt as number | undefined;
    const answeredInTime =
      firstReplyAt !== undefined && firstReplyAt - Date.parse(m.createdDateTime) <= BLOCKER_WINDOW_MS;
    if (!answeredInTime) bucketFor(dayOf(m.createdDateTime), slug).unansweredBlockers++;
  }

  // cascade depth: per thread with @mentions, distinct authors within 30 min
  const threads = new Map<string, Msg[]>();
  for (const m of msgs) {
    const rootId = m.replyToId ?? m.id;
    threads.set(rootId, [...(threads.get(rootId) ?? []), m]);
  }
  for (const [rootId, thread] of threads) {
    if (!thread.some((m) => (m.mentions ?? []).length > 0)) continue;
    const start = Date.parse(thread[0].createdDateTime);
    const inWindow = thread.filter((m) => Date.parse(m.createdDateTime) - start <= CASCADE_WINDOW_MS);
    const authors = new Set(inWindow.map((m) => m.from.name));
    const root = byId.get(rootId) ?? thread[0];
    const b = bucketFor(dayOf(root.createdDateTime), slug);
    b.cascadeDepth = Math.max(b.cascadeDepth, authors.size);
  }
}

// ─── aggregate + score ──────────────────────────────────────────────────────

function metricsOf(b: Bucket) {
  return {
    messages: b.messages,
    medianReplyLatencyMin: round1(median(b.replyLatencies)),
    afterHoursSharePct: b.messages ? round1((b.afterHours / b.messages) * 100) : 0,
    burstIndexPct: b.messages ? round1((b.bursts / b.messages) * 100) : 0,
    unansweredBlockers: b.unansweredBlockers,
    cascadeDepth: b.cascadeDepth,
  };
}

function healthScore(m: ReturnType<typeof metricsOf>): number {
  let penalty = 0;
  // instant-response pressure: median latency far below a humane pace
  if (m.medianReplyLatencyMin !== null && m.medianReplyLatencyMin < 15) {
    penalty += Math.min(25, ((15 - m.medianReplyLatencyMin) / 15) * 25);
  }
  penalty += Math.min(25, Math.max(0, ((m.afterHoursSharePct ?? 0) - TARGETS.afterHoursSharePct) / TARGETS.afterHoursSharePct) * 12.5);
  penalty += Math.min(20, Math.max(0, ((m.burstIndexPct ?? 0) - TARGETS.burstIndexPct) / TARGETS.burstIndexPct) * 20);
  penalty += Math.min(30, m.unansweredBlockers * 15);
  penalty += Math.min(15, Math.max(0, m.cascadeDepth - TARGETS.cascadeDepth) * 7.5);
  return Math.max(0, Math.round(100 - penalty));
}

const days = [...byDayChannel.keys()].sort();
const daysOut = days.map((day) => {
  const channels: Record<string, unknown> = {};
  const overall = newBucket();
  for (const [slug, b] of byDayChannel.get(day)!) {
    channels[slug] = { ...metricsOf(b), healthScore: healthScore(metricsOf(b)) };
    overall.messages += b.messages;
    overall.replyLatencies.push(...b.replyLatencies);
    overall.afterHours += b.afterHours;
    overall.bursts += b.bursts;
    overall.unansweredBlockers += b.unansweredBlockers;
    overall.cascadeDepth = Math.max(overall.cascadeDepth, b.cascadeDepth);
  }
  const om = metricsOf(overall);
  return { date: day, overall: { ...om, healthScore: healthScore(om) }, channels };
});

const personsOut = [...persons.entries()]
  .map(([name, p]) => ({
    name,
    messages: p.messages,
    medianReplyLatencyMin: round1(median(p.replyLatencies)),
    afterHoursSharePct: p.messages ? round1((p.afterHours / p.messages) * 100) : 0,
    burstIndexPct: p.messages ? round1((p.bursts / p.messages) * 100) : 0,
  }))
  .sort((a, b) => b.messages - a.messages);

const result = {
  generatedAt: new Date().toISOString(),
  coreHours: { startUtc: CORE_START, endUtc: CORE_END },
  targets: TARGETS,
  channels: slugs,
  days: daysOut,
  persons: personsOut,
  // weekday(0=Sun)×hour message counts over the whole loaded window
  activity: {
    overall: activityOverall,
    channels: Object.fromEntries(activityByChannel),
  },
};

// ─── write ──────────────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);
const metricsDir = join(PROJECT_ROOT, 'data', 'metrics');
mkdirSync(metricsDir, { recursive: true });
writeFileSync(join(metricsDir, `${today}.json`), JSON.stringify(result, null, 2), 'utf8');

const reportsDataDir = join(PROJECT_ROOT, 'reports', 'data');
mkdirSync(reportsDataDir, { recursive: true });
writeFileSync(join(reportsDataDir, 'hive-metrics.json'), JSON.stringify(result, null, 2), 'utf8');

console.log(JSON.stringify({
  ok: true,
  days: days.length,
  channels: slugs,
  persons: personsOut.length,
  wrote: [`data/metrics/${today}.json`, 'reports/data/hive-metrics.json'],
}));
