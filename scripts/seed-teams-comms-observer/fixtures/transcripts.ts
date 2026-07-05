/**
 * Sample Teams channel transcripts for the two mirrored channels.
 *
 * The messages deliberately exhibit the hive-mind pattern taxonomy so the
 * demo tells its story without a live Teams tenant:
 *   - po-ping-storm-anna            (general, day −4 morning)
 *   - po-after-hours-anna-priya     (general, day −3 evening)
 *   - po-unanswered-blocker-priya   (dev, day −3 → day −2, 26 h)
 *   - po-undocumented-decision-auth (dev, day −2)
 *   - po-jargon-ac                  (dev, day −2)
 *   - po-cascade-tomas              (dev, day −1 morning)
 *
 * Dates are generated relative to the seed day so the data always looks
 * fresh. The jsonl lines match the TranscriptMessage shape written by the
 * backend's TeamsChannelSyncService; daily .md files match its renderer
 * closely enough for the agent to treat both sources identically.
 */

export interface PersonDef {
  name: string;
  aadId: string;
}

export const PERSONS: Record<string, PersonDef> = {
  anna: { name: 'Anna Meier', aadId: 'aad-anna-0001' },
  jonas: { name: 'Jonas Weber', aadId: 'aad-jonas-0002' },
  priya: { name: 'Priya Nair', aadId: 'aad-priya-0003' },
  tomas: { name: 'Tomas Eriksen', aadId: 'aad-tomas-0004' },
  bot: { name: 'Etienne', aadId: 'app-etienne' },
};

export interface SeedMessage {
  /** negative offset from the seed day, e.g. -4 */
  day: number;
  /** 'HH:MM' UTC */
  time: string;
  author: keyof typeof PERSONS;
  text: string;
  /** reference key of the thread root this message replies to */
  replyTo?: string;
  /** key other messages can reference as their thread root */
  key?: string;
  reactions?: Array<{ type: string; count: number }>;
  mentions?: string[];
}

const GENERAL: SeedMessage[] = [
  // day −5 — ordinary day
  { day: -5, time: '08:58', author: 'anna', key: 'g-standup-5', text: 'Standup notes: release branch cut today, demo prep Thursday. Anything blocking, shout here.', reactions: [{ type: 'like', count: 3 }] },
  { day: -5, time: '09:40', author: 'jonas', replyTo: 'g-standup-5', text: 'Branch is cut. CI green.' },
  { day: -5, time: '11:15', author: 'priya', text: 'Heads-up: staging deploy at 13:00, expect ~5 min downtime.' , reactions: [{ type: 'like', count: 2 }] },
  { day: -5, time: '16:20', author: 'tomas', text: 'Posted the draft architecture note for the gateway split in the wiki. Comments welcome until Friday.' },

  // day −4 — ping-storm morning (po-ping-storm-anna) + ambiguous ownership
  { day: -4, time: '09:02', author: 'anna', key: 'g-storm', text: 'quick thing re the demo' },
  { day: -4, time: '09:02', author: 'anna', text: 'actually two things' },
  { day: -4, time: '09:03', author: 'anna', text: 'do we show the new onboarding flow or the old one?' },
  { day: -4, time: '09:04', author: 'anna', text: 'and who has the customer sandbox login?' },
  { day: -4, time: '09:04', author: 'anna', text: 'also the deck still has the Q2 numbers' },
  { day: -4, time: '09:05', author: 'anna', text: 'can someone update those' },
  { day: -4, time: '09:06', author: 'anna', text: 'sorry, three things :)' },
  { day: -4, time: '09:07', author: 'priya', text: 'New flow works on staging, I’d show that one.' },
  { day: -4, time: '09:08', author: 'priya', text: 'Sandbox login is in the vault under customer-demo.' },
  { day: -4, time: '09:20', author: 'anna', text: 'any update on the deck numbers??' },
  { day: -4, time: '10:02', author: 'jonas', text: 'Deck updated.' },
  { day: -4, time: '14:30', author: 'anna', key: 'g-relnotes', text: 'Can someone review the release notes before tomorrow?' },
  // (no reply that day — duplicate replies next morning = ambiguous ownership)
  { day: -3, time: '08:45', author: 'jonas', replyTo: 'g-relnotes', text: 'Looked through them, two typos fixed.' },
  { day: -3, time: '08:52', author: 'priya', replyTo: 'g-relnotes', text: 'Also reviewed — oh, Jonas was faster. We both did it then.' },

  // day −3 — after-hours exchange (po-after-hours-anna-priya)
  { day: -3, time: '22:10', author: 'anna', key: 'g-afterhours', text: 'Sorry for the late ping — customer call moved to 08:30 tomorrow. Can we get the sync fix onto the demo env tonight?' },
  { day: -3, time: '22:12', author: 'priya', replyTo: 'g-afterhours', text: 'On it, give me 20 minutes.' },
  { day: -3, time: '22:13', author: 'anna', replyTo: 'g-afterhours', text: 'you’re a star 🙏' },
  { day: -3, time: '22:34', author: 'priya', replyTo: 'g-afterhours', text: 'Deployed. Smoke test passes.' },
  { day: -3, time: '22:36', author: 'anna', replyTo: 'g-afterhours', text: 'Perfect, thanks!! 🎉', reactions: [{ type: 'heart', count: 1 }] },

  // day −2 — ordinary + a hint of self-awareness
  { day: -2, time: '10:15', author: 'anna', text: 'Demo went great this morning 🎉 customer wants the pilot.', reactions: [{ type: 'like', count: 4 }, { type: 'heart', count: 2 }] },
  { day: -2, time: '11:30', author: 'jonas', key: 'g-focus', text: 'Honest question: can we do something about the ping density in here? I lose the morning to notifications more days than not.', reactions: [{ type: 'like', count: 3 }] },
  { day: -2, time: '11:34', author: 'anna', replyTo: 'g-focus', text: 'Fair. Guilty as charged 🙈 — open to trying a quiet block.' },
  { day: -2, time: '11:41', author: 'tomas', replyTo: 'g-focus', text: 'Suggest we look at what the observer has collected before we pick rules.' },

  // day −1 — @mention of the observer bot (inner perspective in action)
  { day: -1, time: '13:05', author: 'anna', key: 'g-ask-bot', text: '@Etienne where do we currently lose the most focused time?', mentions: ['Etienne'] },
  { day: -1, time: '13:06', author: 'bot', replyTo: 'g-ask-bot', text: 'Based on the last 4 days: (1) morning message bursts in #general — e.g. 7 messages in 4 min with instant-reply expectation; (2) an unanswered blocker in #dev cost ~26 h; (3) after-hours exchanges keep response pressure high in the evening. Details and evidence: out/hive-mind-report.md — a morning deep-work block plus a 4 h response norm would address (1) and (3).' },
  { day: -1, time: '13:12', author: 'anna', replyTo: 'g-ask-bot', text: 'ok that 26h one hurts. Let’s discuss the agreement draft in Friday’s retro.', reactions: [{ type: 'like', count: 2 }] },
];

const DEV: SeedMessage[] = [
  // day −5 — healthy thread for contrast
  { day: -5, time: '10:20', author: 'priya', key: 'd-fixtures', text: 'Where do the integration-test fixtures for the billing service live now? The old path 404s.' },
  { day: -5, time: '13:25', author: 'jonas', replyTo: 'd-fixtures', text: 'Moved to tests/fixtures/billing in the monorepo. The README in tests/ has the mapping.', reactions: [{ type: 'like', count: 1 }] },
  { day: -5, time: '13:30', author: 'priya', replyTo: 'd-fixtures', text: 'Found it, thanks.' },

  // day −3 — the unanswered blocker (po-unanswered-blocker-priya): 26 h
  { day: -3, time: '10:05', author: 'priya', key: 'd-blocker', text: 'I’m blocked on the token refresh: does the gateway strip the Authorization header on retries, or is that our client? Can’t ship the sync fix until I know.' },
  { day: -3, time: '15:40', author: 'priya', replyTo: 'd-blocker', text: 'still stuck on this — anyone?' },
  { day: -2, time: '12:15', author: 'jonas', replyTo: 'd-blocker', text: 'The gateway strips it on cross-zone retries only — known quirk, workaround is the retry-safe header. Sorry, saw this just now.', reactions: [{ type: 'like', count: 1 }] },
  { day: -2, time: '12:20', author: 'priya', replyTo: 'd-blocker', text: 'That was it. Lost a day on this one.' },

  // day −2 — undocumented decision (po-undocumented-decision-auth)
  { day: -2, time: '14:00', author: 'tomas', key: 'd-auth', text: 'We need to settle the service-to-service auth flow before the pilot. Options: keep v1 (shared secret) or move to v2 (client credentials + on-behalf-of). v2 costs us a week now, saves the token-leak class of bugs forever.' },
  { day: -2, time: '14:12', author: 'jonas', replyTo: 'd-auth', text: 'v2. The shared secret already leaked into a log once.' },
  { day: -2, time: '14:25', author: 'priya', replyTo: 'd-auth', text: 'v2 works for the sync service too, I checked the token size limits.' },
  { day: -2, time: '14:38', author: 'tomas', replyTo: 'd-auth', text: 'OK — decided, we go v2: client credentials + on-behalf-of. I’ll plan the migration for next sprint.', reactions: [{ type: 'like', count: 2 }] },
  { day: -2, time: '14:40', author: 'anna', replyTo: 'd-auth', text: 'agreed 👍' },
  // (no artifact/wiki/ticket link ever posted → undocumented decision)

  // day −2 — jargon mismatch (po-jargon-ac)
  { day: -2, time: '15:05', author: 'tomas', key: 'd-jargon', text: 'For the gateway split: the AC needs to cover the retry path as well, otherwise the billing calls leak domain objects.' },
  { day: -2, time: '15:15', author: 'priya', replyTo: 'd-jargon', text: 'Hmm, the acceptance criteria don’t mention retries at all? I can add a criterion.' },
  { day: -2, time: '15:22', author: 'tomas', replyTo: 'd-jargon', text: 'Sorry — by AC I meant the anti-corruption layer, not acceptance criteria. The ACL module in the gateway.' },
  { day: -2, time: '15:24', author: 'priya', replyTo: 'd-jargon', text: 'Ah. That’s the second time AC bit us — can we pick names? 😅' },

  // day −1 — interruption cascade (po-cascade-tomas)
  { day: -1, time: '09:10', author: 'tomas', key: 'd-cascade', text: '@Jonas Weber quick one: does the ACL rewrite touch the retry middleware?', mentions: ['Jonas Weber'] },
  { day: -1, time: '09:11', author: 'jonas', replyTo: 'd-cascade', text: 'Yes, both interceptors. Why?' },
  { day: -1, time: '09:13', author: 'tomas', replyTo: 'd-cascade', text: '@Priya Nair then your sync fix and the rewrite collide — which lands first?', mentions: ['Priya Nair'] },
  { day: -1, time: '09:14', author: 'priya', replyTo: 'd-cascade', text: 'Sync fix is ready today, rewrite is next sprint — mine first?' },
  { day: -1, time: '09:16', author: 'tomas', replyTo: 'd-cascade', text: '@Anna Meier does the pilot date allow us to hold the rewrite until after the sync fix bakes for a week?', mentions: ['Anna Meier'] },
  { day: -1, time: '09:18', author: 'anna', replyTo: 'd-cascade', text: 'Pilot starts on the 15th, so yes — one week works.' },
  { day: -1, time: '09:20', author: 'tomas', replyTo: 'd-cascade', text: 'Great: sync fix now, rewrite after one week of bake time.' },
  { day: -1, time: '09:25', author: 'jonas', replyTo: 'd-cascade', text: 'Noted. That was three context switches before 09:30, for the record 🙃', reactions: [{ type: 'laugh', count: 2 }] },
];

export const CHANNELS: Record<string, { teamName: string; channelName: string; messages: SeedMessage[] }> = {
  'hive-alpha--general': { teamName: 'Hive Alpha', channelName: 'General', messages: GENERAL },
  'hive-alpha--dev': { teamName: 'Hive Alpha', channelName: 'Dev', messages: DEV },
};

// ─── builder ────────────────────────────────────────────────────────────────

export interface TranscriptMessage {
  id: string;
  replyToId: string | null;
  channelSlug: string;
  from: { name: string; aadId?: string; kind: 'user' | 'bot' | 'system' };
  createdDateTime: string;
  lastModifiedDateTime: string;
  deleted: boolean;
  edited: boolean;
  subject?: string;
  text: string;
  mentions: string[];
  reactions: Array<{ type: string; count: number }>;
  attachments: Array<{ name?: string; contentUrl?: string; contentType?: string }>;
  assets: string[];
  webUrl?: string;
}

/**
 * Shift `base` by `offset` WORKDAYS (Mon–Fri). Keeps the planted core-time
 * patterns (morning ping-storms etc.) on weekdays no matter which day the
 * seed runs — otherwise a Sunday seed would put "day −1" on a Saturday and
 * every core-time event would count as after-hours.
 */
export function shiftWorkdays(base: Date, offset: number): Date {
  const d = new Date(base);
  // Start from the most recent weekday at or before base.
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  let remaining = Math.abs(offset);
  const step = offset < 0 ? -1 : 1;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) remaining--;
  }
  return d;
}

function iso(base: Date, day: number, time: string): string {
  const d = shiftWorkdays(base, day);
  const [h, m] = time.split(':').map(Number);
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
}

export function buildChannelTranscript(
  slug: string,
  baseDate: Date,
): { jsonl: string; dailyMd: Record<string, string> } {
  const def = CHANNELS[slug];
  const keyToId = new Map<string, string>();
  const out: TranscriptMessage[] = [];

  for (const m of def.messages) {
    const created = iso(baseDate, m.day, m.time);
    const id = String(Date.parse(created));
    if (m.key) keyToId.set(m.key, id);
    const person = PERSONS[m.author];
    const threadRoot = m.replyTo ? keyToId.get(m.replyTo) ?? null : null;
    out.push({
      id,
      replyToId: threadRoot,
      channelSlug: slug,
      from: {
        name: person.name,
        aadId: person.aadId,
        kind: m.author === 'bot' ? 'bot' : 'user',
      },
      createdDateTime: created,
      lastModifiedDateTime: created,
      deleted: false,
      edited: false,
      text: m.text,
      mentions: m.mentions ?? [],
      reactions: m.reactions ?? [],
      attachments: [],
      assets: [],
      webUrl: `https://teams.microsoft.com/l/message/19%3A${slug.replace(/[^a-z0-9]/g, '')}%40thread.tacv2/${id}`,
    });
  }

  out.sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime));
  const jsonl = out.map((m) => JSON.stringify(m)).join('\n') + '\n';

  // Daily markdown — same structure the backend sync renders.
  const byDay = new Map<string, TranscriptMessage[]>();
  for (const m of out) {
    const day = m.createdDateTime.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), m]);
  }
  const dailyMd: Record<string, string> = {};
  for (const [day, msgs] of byDay) {
    const roots = msgs.filter((m) => !m.replyToId);
    const rootIds = new Set(roots.map((r) => r.id));
    const lines: string[] = [`# ${slug} — ${day}`, ''];
    const render = (m: TranscriptMessage, heading: string) => {
      const time = m.createdDateTime.slice(11, 16);
      const botTag = m.from.kind === 'bot' ? ' `BOT`' : '';
      lines.push(`${heading} ${time} ${m.from.name}${botTag}  ·  [link](${m.webUrl})`);
      lines.push(m.text);
      const ann: string[] = [];
      if (m.reactions.length) ann.push('reactions: ' + m.reactions.map((r) => `${r.type}×${r.count}`).join(' '));
      if (ann.length) lines.push('· ' + ann.join(' · '));
      lines.push('');
    };
    for (const root of roots) {
      render(root, '##');
      for (const reply of msgs.filter((m) => m.replyToId === root.id)) render(reply, '### ↳');
    }
    for (const orphan of msgs.filter((m) => m.replyToId && !rootIds.has(m.replyToId))) {
      render(orphan, '## ↳ (reply) —');
    }
    dailyMd[day] = lines.join('\n');
  }

  return { jsonl, dailyMd };
}
