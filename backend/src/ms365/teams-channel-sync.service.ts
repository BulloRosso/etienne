import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { GraphClientService, ChatMessage } from './graph-client.service';
import { FilesystemEventsService } from './filesystem-events.service';
import { teamsHtmlToMarkdown, decodeEntities } from './teams-html';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace';

// ============================================
// Config (user/seed-editable) & sync state (service-owned)
// ============================================

export interface ObserverChannel {
  teamId: string;
  channelId: string;
  teamName: string;
  channelName: string;
  slug: string;
}

export interface ObserverConfig {
  version: 1;
  enabled: boolean;
  syncIntervalSec: number;
  refreshWindowHours: number;
  downloadHostedContent: boolean;
  backfillDays: number;
  channels: ObserverChannel[];
}

export const DEFAULT_OBSERVER_CONFIG: ObserverConfig = {
  version: 1,
  enabled: false,
  syncIntervalSec: 120,
  refreshWindowHours: 24,
  downloadHostedContent: true,
  backfillDays: 90,
  channels: [],
};

interface ChannelSyncState {
  mode: 'delta' | 'hwm';
  deltaLink?: string;
  highWaterMark?: string;
  knownIdsTail: string[];
  lastSyncedAt?: string;
  lastRefreshAt?: string;
  messageCount: number;
  consecutiveFailures: number;
  skipUntil?: number;
  lastError?: string | null;
}

interface ObserverState {
  version: 1;
  channels: Record<string, ChannelSyncState>;
}

/** One line of data/teams/<slug>/messages.jsonl (append-only event log; latest-per-id wins). */
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

const KNOWN_IDS_TAIL_MAX = 200;
const MAX_BACKOFF_MS = 15 * 60 * 1000;

function projectRoot(project: string): string {
  return path.join(WORKSPACE_ROOT, project);
}

function teamsDataRoot(project: string): string {
  return path.join(projectRoot(project), 'data', 'teams');
}

function channelDir(project: string, slug: string): string {
  return path.join(teamsDataRoot(project), slug);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'channel';
}

@Injectable()
export class TeamsChannelSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TeamsChannelSyncService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly stateLocks = new Map<string, Promise<void>>();
  private readonly syncInFlight = new Set<string>();
  /** In-memory latest-per-id index per `${project}/${slug}` (lazy-loaded from jsonl). */
  private readonly latestCache = new Map<string, Map<string, TranscriptMessage>>();

  constructor(
    private readonly graph: GraphClientService,
    private readonly fsEvents: FilesystemEventsService,
  ) {}

  async onModuleInit() {
    try {
      const entries = await fs.readdir(WORKSPACE_ROOT, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        try {
          const cfg = await this.loadConfig(e.name);
          if (cfg.enabled && cfg.channels.length > 0) {
            this.startPolling(e.name);
            this.logger.log(`Resumed Teams channel observer for project ${e.name} (${cfg.channels.length} channel(s))`);
          }
        } catch { /* no observer config */ }
      }
    } catch (err: any) {
      this.logger.warn(`Teams observer boot scan failed: ${err.message}`);
    }
  }

  onModuleDestroy() {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }

  // ============================================
  // Config & state persistence
  // ============================================

  private configPath(project: string): string {
    return path.join(projectRoot(project), '.etienne', 'teams-observer.json');
  }

  private statePath(project: string): string {
    return path.join(teamsDataRoot(project), '.meta', 'state.json');
  }

  async loadConfig(project: string): Promise<ObserverConfig> {
    const raw = await fs.readFile(this.configPath(project), 'utf8');
    const cfg = JSON.parse(raw) as Partial<ObserverConfig>;
    return { ...DEFAULT_OBSERVER_CONFIG, ...cfg, channels: cfg.channels || [] };
  }

  async loadConfigOrDefault(project: string): Promise<ObserverConfig> {
    try {
      return await this.loadConfig(project);
    } catch {
      return { ...DEFAULT_OBSERVER_CONFIG, channels: [] };
    }
  }

  async saveConfig(project: string, cfg: ObserverConfig): Promise<void> {
    const p = this.configPath(project);
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = p + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(cfg, null, 2), 'utf8');
    await fs.rename(tmp, p);
  }

  private async loadState(project: string): Promise<ObserverState> {
    try {
      const raw = await fs.readFile(this.statePath(project), 'utf8');
      return JSON.parse(raw) as ObserverState;
    } catch {
      return { version: 1, channels: {} };
    }
  }

  private async saveState(project: string, state: ObserverState): Promise<void> {
    const p = this.statePath(project);
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = p + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tmp, p);
  }

  private async withState<T>(project: string, fn: (s: ObserverState) => Promise<T>): Promise<T> {
    while (this.stateLocks.has(project)) await this.stateLocks.get(project);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    this.stateLocks.set(project, gate);
    try {
      const state = await this.loadState(project);
      const result = await fn(state);
      await this.saveState(project, state);
      return result;
    } finally {
      this.stateLocks.delete(project);
      release();
    }
  }

  // ============================================
  // Polling lifecycle
  // ============================================

  startPolling(project: string): void {
    if (this.timers.has(project)) return;
    this.loadConfigOrDefault(project).then((cfg) => {
      if (this.timers.has(project)) return;
      const baseMs = Math.max(30, cfg.syncIntervalSec) * 1000;
      const jitter = Math.floor(Math.random() * baseMs * 0.1);
      const timer = setInterval(() => {
        this.syncNow(project).catch((err) =>
          this.logger.error(`Teams sync failed for ${project}: ${err.message}`),
        );
      }, baseMs + jitter);
      this.timers.set(project, timer);
      // Kick off an immediate first cycle.
      this.syncNow(project).catch((err) =>
        this.logger.error(`Teams initial sync failed for ${project}: ${err.message}`),
      );
      this.logger.log(`Started Teams channel polling for ${project} every ~${Math.round((baseMs + jitter) / 1000)}s`);
    });
  }

  stopPolling(project: string): void {
    const t = this.timers.get(project);
    if (t) {
      clearInterval(t);
      this.timers.delete(project);
      this.logger.log(`Stopped Teams channel polling for ${project}`);
    }
  }

  isPolling(project: string): boolean {
    return this.timers.has(project);
  }

  async getStatus(project: string): Promise<any> {
    const cfg = await this.loadConfigOrDefault(project);
    const state = await this.loadState(project);
    return {
      enabled: cfg.enabled,
      polling: this.isPolling(project),
      syncIntervalSec: cfg.syncIntervalSec,
      channels: cfg.channels.map((ch) => ({
        slug: ch.slug,
        teamName: ch.teamName,
        channelName: ch.channelName,
        mode: state.channels[ch.slug]?.mode || 'delta',
        lastSyncedAt: state.channels[ch.slug]?.lastSyncedAt || null,
        messageCount: state.channels[ch.slug]?.messageCount || 0,
        lastError: state.channels[ch.slug]?.lastError || null,
      })),
    };
  }

  // ============================================
  // Sync cycle
  // ============================================

  async syncNow(project: string): Promise<Record<string, { new: number; updated: number; deleted: number }>> {
    if (this.syncInFlight.has(project)) return {};
    this.syncInFlight.add(project);
    try {
      const cfg = await this.loadConfigOrDefault(project);
      const results: Record<string, { new: number; updated: number; deleted: number }> = {};
      if (!cfg.enabled || cfg.channels.length === 0) return results;

      // Channels sequential — Graph budgets for channel-message endpoints are small.
      for (const ch of cfg.channels) {
        try {
          results[ch.slug] = await this.syncChannel(project, cfg, ch);
          await this.withState(project, async (s) => {
            const cs = this.channelState(s, ch.slug);
            cs.lastSyncedAt = new Date().toISOString();
            cs.consecutiveFailures = 0;
            cs.skipUntil = undefined;
            cs.lastError = null;
          });
        } catch (err: any) {
          if (/MS365 not connected/.test(err.message)) {
            // Project hasn't connected MS365 — nothing to sync, not an error.
            continue;
          }
          this.logger.error(`Teams sync for ${project}/${ch.slug} failed: ${err.message}`);
          await this.withState(project, async (s) => {
            const cs = this.channelState(s, ch.slug);
            cs.consecutiveFailures += 1;
            const backoff = Math.min(MAX_BACKOFF_MS, 30_000 * 2 ** (cs.consecutiveFailures - 1));
            cs.skipUntil = Date.now() + backoff;
            cs.lastError = err.message;
          });
        }
      }
      return results;
    } finally {
      this.syncInFlight.delete(project);
    }
  }

  private channelState(s: ObserverState, slug: string): ChannelSyncState {
    if (!s.channels[slug]) {
      s.channels[slug] = { mode: 'delta', knownIdsTail: [], messageCount: 0, consecutiveFailures: 0 };
    }
    return s.channels[slug];
  }

  private async syncChannel(
    project: string,
    cfg: ObserverConfig,
    ch: ObserverChannel,
  ): Promise<{ new: number; updated: number; deleted: number }> {
    const state = await this.loadState(project);
    const cs = this.channelState(state, ch.slug);
    const counts = { new: 0, updated: 0, deleted: 0 };
    if (cs.skipUntil && cs.skipUntil > Date.now()) return counts;

    const latest = await this.getLatestIndex(project, ch.slug);
    const touchedDays = new Set<string>();
    const horizon = new Date(Date.now() - cfg.backfillDays * 24 * 3600 * 1000).toISOString();

    const roots: ChatMessage[] = [];

    if (cs.mode === 'delta') {
      try {
        let cursor = cs.deltaLink;
        // Page through delta until we obtain the new deltaLink.
        // First run (no stored link) = full page-through, bounded by the
        // backfillDays horizon filter applied during processing below.
        for (;;) {
          const page = await this.graph.getChannelMessagesDelta(project, ch.teamId, ch.channelId, cursor);
          for (const m of page.messages) roots.push(m);
          if (page.deltaLink) {
            cs.deltaLink = page.deltaLink;
            break;
          }
          if (!page.nextLink) break;
          cursor = page.nextLink;
        }
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 400 || status === 403) {
          // Known Graph flakiness with stored delta tokens — fall back permanently to HWM.
          this.logger.warn(`Delta failed (${status}) for ${project}/${ch.slug}; switching to high-water-mark mode`);
          cs.mode = 'hwm';
          cs.deltaLink = undefined;
        } else {
          throw err;
        }
      }
    }

    if (cs.mode === 'hwm') {
      // Newest-first paging until everything on a page is older than the HWM and already known.
      let nextLink: string | undefined;
      let pages = 0;
      const known = new Set(cs.knownIdsTail);
      for (;;) {
        const page = await this.graph.listChannelMessages(project, ch.teamId, ch.channelId, nextLink);
        let allSeen = page.messages.length > 0;
        for (const m of page.messages) {
          roots.push(m);
          const isOld = cs.highWaterMark && (m.createdDateTime || '') < cs.highWaterMark;
          if (!(isOld && known.has(m.id))) allSeen = false;
        }
        pages++;
        if (allSeen || !page.nextLink || pages >= 40) break;
        if (page.messages.length > 0) {
          const oldest = page.messages[page.messages.length - 1];
          if ((oldest.createdDateTime || '') < horizon) break;
        }
        nextLink = page.nextLink;
      }
    }

    // Process root messages (skip system events and out-of-horizon)
    const seenRootIds: string[] = [];
    for (const m of roots) {
      if (!m.id) continue;
      if ((m.createdDateTime || '') < horizon) continue;
      if (m.messageType && m.messageType !== 'message') continue;
      seenRootIds.push(m.id);
      const applied = await this.applyMessage(project, cfg, ch, m, null, latest, touchedDays);
      this.tally(counts, applied);

      // Replies: prefer $expand payload; delta returns roots only -> page explicitly.
      let replies: ChatMessage[] = Array.isArray(m.replies) ? m.replies : [];
      if ((!replies.length && cs.mode === 'delta') || m['replies@odata.nextLink']) {
        replies = await this.fetchAllReplies(project, ch, m.id, replies, m['replies@odata.nextLink']);
      }
      for (const r of replies) {
        if (r.messageType && r.messageType !== 'message') continue;
        const appliedReply = await this.applyMessage(project, cfg, ch, r, m.id, latest, touchedDays);
        this.tally(counts, appliedReply);
      }
    }

    // Refresh window: reactions (and missed edits) don't reliably surface via delta.
    const refreshDue =
      !cs.lastRefreshAt || Date.now() - Date.parse(cs.lastRefreshAt) > 60 * 60 * 1000;
    if (cs.mode === 'delta' && refreshDue) {
      const windowStart = new Date(Date.now() - cfg.refreshWindowHours * 3600 * 1000).toISOString();
      let nextLink: string | undefined;
      let pages = 0;
      for (;;) {
        const page = await this.graph.listChannelMessages(project, ch.teamId, ch.channelId, nextLink);
        for (const m of page.messages) {
          if ((m.createdDateTime || '') < windowStart) continue;
          if (m.messageType && m.messageType !== 'message') continue;
          this.tally(counts, await this.applyMessage(project, cfg, ch, m, null, latest, touchedDays));
          const replies = Array.isArray(m.replies) ? m.replies : [];
          for (const r of replies) {
            if (r.messageType && r.messageType !== 'message') continue;
            this.tally(counts, await this.applyMessage(project, cfg, ch, r, m.id, latest, touchedDays));
          }
        }
        pages++;
        const oldest = page.messages[page.messages.length - 1];
        if (!page.nextLink || pages >= 10 || (oldest && (oldest.createdDateTime || '') < windowStart)) break;
        nextLink = page.nextLink;
      }
      cs.lastRefreshAt = new Date().toISOString();
    }

    // Update HWM bookkeeping (used by hwm mode, harmless in delta mode)
    for (const id of seenRootIds) {
      if (!cs.knownIdsTail.includes(id)) cs.knownIdsTail.push(id);
    }
    if (cs.knownIdsTail.length > KNOWN_IDS_TAIL_MAX) {
      cs.knownIdsTail = cs.knownIdsTail.slice(-KNOWN_IDS_TAIL_MAX);
    }
    const maxCreated = roots.reduce((acc, m) => ((m.createdDateTime || '') > acc ? m.createdDateTime! : acc), cs.highWaterMark || '');
    if (maxCreated) cs.highWaterMark = maxCreated;
    cs.messageCount = latest.size;

    // Regenerate daily transcripts for every day touched in this cycle.
    for (const day of touchedDays) {
      await this.regenerateDailyTranscript(project, ch.slug, day, latest);
    }

    // Persist channel state (merge into current on-disk state under the lock).
    await this.withState(project, async (s) => {
      s.channels[ch.slug] = cs;
    });

    return counts;
  }

  private tally(
    counts: { new: number; updated: number; deleted: number },
    applied: 'new' | 'updated' | 'deleted' | null,
  ): void {
    if (applied) counts[applied]++;
  }

  private async fetchAllReplies(
    project: string,
    ch: ObserverChannel,
    rootId: string,
    initial: ChatMessage[],
    nextLink?: string,
  ): Promise<ChatMessage[]> {
    const all = [...initial];
    let cursor = nextLink;
    for (;;) {
      const page = await this.graph.listMessageReplies(project, ch.teamId, ch.channelId, rootId, cursor);
      all.push(...page.messages);
      if (!page.nextLink) break;
      cursor = page.nextLink;
      if (all.length > 2000) break; // sanity cap
    }
    return all;
  }

  // ============================================
  // Normalization + transcript writing
  // ============================================

  /** Returns what happened ('new' | 'updated' | 'deleted') or null when unchanged. */
  private async applyMessage(
    project: string,
    cfg: ObserverConfig,
    ch: ObserverChannel,
    m: ChatMessage,
    replyToId: string | null,
    latest: Map<string, TranscriptMessage>,
    touchedDays: Set<string>,
  ): Promise<'new' | 'updated' | 'deleted' | null> {
    const normalized = await this.normalize(project, cfg, ch, m, replyToId);
    const existing = latest.get(normalized.id);
    if (existing && !this.hasChanged(existing, normalized)) return null;

    await this.appendJsonl(project, ch.slug, normalized);
    latest.set(normalized.id, normalized);
    if (normalized.createdDateTime) touchedDays.add(normalized.createdDateTime.slice(0, 10));

    if (!existing) return normalized.deleted ? 'deleted' : 'new';
    return normalized.deleted && !existing.deleted ? 'deleted' : 'updated';
  }

  private hasChanged(a: TranscriptMessage, b: TranscriptMessage): boolean {
    return (
      a.text !== b.text ||
      a.deleted !== b.deleted ||
      a.lastModifiedDateTime !== b.lastModifiedDateTime ||
      JSON.stringify(a.reactions) !== JSON.stringify(b.reactions) ||
      JSON.stringify(a.attachments) !== JSON.stringify(b.attachments)
    );
  }

  private async normalize(
    project: string,
    cfg: ObserverConfig,
    ch: ObserverChannel,
    m: ChatMessage,
    replyToId: string | null,
  ): Promise<TranscriptMessage> {
    const assets: string[] = [];
    const assetRef = (hcId: string | null, src: string): string => {
      if (!hcId) return src ? `![img](${src})` : '';
      const fileName = `${m.id}-${hcId}.png`;
      assets.push(`assets/${fileName}`);
      return `![img](assets/${fileName})`;
    };

    const isHtml = (m.body?.contentType || '').toLowerCase() === 'html';
    const conv = isHtml
      ? teamsHtmlToMarkdown(m.body?.content || '', assetRef)
      : { text: decodeEntities(m.body?.content || ''), mentions: [] as string[], hostedContentIds: [] as string[] };

    // Download hosted inline images next to the transcript (best-effort).
    if (cfg.downloadHostedContent && conv.hostedContentIds.length > 0 && !m.deletedDateTime) {
      const assetsDir = path.join(channelDir(project, ch.slug), 'assets');
      await fs.mkdir(assetsDir, { recursive: true });
      for (const hcId of conv.hostedContentIds) {
        const fileName = `${m.id}-${hcId}.png`;
        const abs = path.join(assetsDir, fileName);
        try {
          await fs.access(abs);
        } catch {
          try {
            const { bytes } = await this.graph.getHostedContentBytes(
              project, ch.teamId, ch.channelId, replyToId ?? m.id, hcId, replyToId ? m.id : undefined,
            );
            await fs.writeFile(abs, bytes);
            this.fsEvents.emit({ type: 'fs.added', project, path: abs, source: 'teams' });
          } catch (err: any) {
            this.logger.warn(`hostedContent download failed for ${ch.slug}/${m.id}/${hcId}: ${err.message}`);
          }
        }
      }
    }

    // Aggregate reactions by type
    const reactionCounts = new Map<string, number>();
    for (const r of m.reactions || []) {
      const t = r.reactionType || 'unknown';
      reactionCounts.set(t, (reactionCounts.get(t) || 0) + 1);
    }

    const fromUser = m.from?.user;
    const fromApp = m.from?.application;
    const from: TranscriptMessage['from'] = fromUser
      ? { name: fromUser.displayName || 'Unknown', aadId: fromUser.id, kind: 'user' }
      : fromApp
        ? { name: fromApp.displayName || 'Bot', aadId: fromApp.id, kind: 'bot' }
        : { name: 'System', kind: 'system' };

    return {
      id: m.id,
      replyToId: replyToId ?? m.replyToId ?? null,
      channelSlug: ch.slug,
      from,
      createdDateTime: m.createdDateTime || new Date().toISOString(),
      lastModifiedDateTime: m.lastModifiedDateTime || m.createdDateTime || '',
      deleted: !!m.deletedDateTime,
      edited: !!m.lastEditedDateTime,
      subject: m.subject || undefined,
      text: m.deletedDateTime ? '' : conv.text,
      mentions: conv.mentions,
      reactions: [...reactionCounts.entries()].map(([type, count]) => ({ type, count })),
      attachments: (m.attachments || [])
        .filter((a) => a.contentType === 'reference' || a.name)
        .map((a) => ({ name: a.name, contentUrl: a.contentUrl, contentType: a.contentType })),
      assets,
      webUrl: m.webUrl,
    };
  }

  private async getLatestIndex(project: string, slug: string): Promise<Map<string, TranscriptMessage>> {
    const key = `${project}/${slug}`;
    const cached = this.latestCache.get(key);
    if (cached) return cached;
    const index = new Map<string, TranscriptMessage>();
    try {
      const raw = await fs.readFile(path.join(channelDir(project, slug), 'messages.jsonl'), 'utf8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as TranscriptMessage;
          index.set(msg.id, msg); // later lines win
        } catch { /* skip malformed line */ }
      }
    } catch { /* no transcript yet */ }
    this.latestCache.set(key, index);
    return index;
  }

  private async appendJsonl(project: string, slug: string, msg: TranscriptMessage): Promise<void> {
    const dir = channelDir(project, slug);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, 'messages.jsonl');
    let existed = true;
    try { await fs.access(file); } catch { existed = false; }
    await fs.appendFile(file, JSON.stringify(msg) + '\n', 'utf8');
    this.fsEvents.emit({ type: existed ? 'fs.changed' : 'fs.added', project, path: file, source: 'teams' });
  }

  /**
   * Regenerate the daily markdown transcript for one UTC day from the
   * latest-per-id index. Idempotent — edits and deletions render cleanly.
   */
  private async regenerateDailyTranscript(
    project: string,
    slug: string,
    day: string,
    latest: Map<string, TranscriptMessage>,
  ): Promise<void> {
    const all = [...latest.values()].filter((m) => m.createdDateTime.slice(0, 10) === day);
    if (all.length === 0) return;
    all.sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime));

    const roots = all.filter((m) => !m.replyToId);
    const rootIdsToday = new Set(roots.map((r) => r.id));
    const repliesByRoot = new Map<string, TranscriptMessage[]>();
    const orphanReplies: TranscriptMessage[] = [];
    for (const m of all) {
      if (!m.replyToId) continue;
      if (rootIdsToday.has(m.replyToId)) {
        const list = repliesByRoot.get(m.replyToId) || [];
        list.push(m);
        repliesByRoot.set(m.replyToId, list);
      } else {
        orphanReplies.push(m);
      }
    }

    const lines: string[] = [`# ${slug} — ${day}`, ''];
    const renderOne = (m: TranscriptMessage, heading: string): void => {
      const time = m.createdDateTime.slice(11, 16);
      const link = m.webUrl ? `  ·  [link](${m.webUrl})` : '';
      const botTag = m.from.kind === 'bot' ? ' `BOT`' : '';
      lines.push(`${heading} ${time} ${m.from.name}${botTag}${link}`);
      if (m.deleted) {
        lines.push('~~[message deleted]~~');
      } else {
        if (m.subject) lines.push(`**${m.subject}**`);
        lines.push(m.text || '');
        const annotations: string[] = [];
        if (m.edited) annotations.push('*(edited)*');
        if (m.reactions.length) annotations.push('reactions: ' + m.reactions.map((r) => `${r.type}×${r.count}`).join(' '));
        for (const a of m.attachments) {
          annotations.push(a.contentUrl ? `attachment: [${a.name || 'file'}](${a.contentUrl})` : `attachment: ${a.name || 'file'}`);
        }
        if (annotations.length) lines.push('· ' + annotations.join(' · '));
      }
      lines.push('');
    };

    for (const root of roots) {
      renderOne(root, '##');
      for (const reply of repliesByRoot.get(root.id) || []) {
        renderOne(reply, '### ↳');
      }
    }
    for (const orphan of orphanReplies) {
      const rootMsg = latest.get(orphan.replyToId!);
      const ref = rootMsg ? ` (reply to ${rootMsg.from.name}, ${rootMsg.createdDateTime.slice(0, 10)})` : ' (reply)';
      renderOne({ ...orphan, subject: orphan.subject }, `## ↳${ref} —`);
    }

    const file = path.join(channelDir(project, slug), `${day}.md`);
    let existed = true;
    try { await fs.access(file); } catch { existed = false; }
    const tmp = file + '.tmp';
    await fs.writeFile(tmp, lines.join('\n'), 'utf8');
    await fs.rename(tmp, file);
    this.fsEvents.emit({ type: existed ? 'fs.changed' : 'fs.added', project, path: file, source: 'teams' });
  }
}
