import { promises as fs } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { DreamingQueue } from '../queue/queue';
import { HarvestPayload, SegmentPayload } from './stage-types';
import { safeRoot } from '../../claude/utils/path.utils';

const log = new Logger('Dreaming/HARVEST');

/**
 * Scan .etienne/chat.history-*.jsonl files modified since last_run_ts and
 * .agent/wiki/dreaming-feedback/*.md feedback notes. Group by inferred domain.
 * Enqueue one SEGMENT job per domain (children of the HARVEST parent job).
 */
export async function runHarvest(
  workspaceRoot: string,
  payload: HarvestPayload,
  parentJobId: number,
  runId: string,
  queue: DreamingQueue,
): Promise<void> {
  const project = payload.project;
  const projectRoot = safeRoot(workspaceRoot, project);
  const etienneDir = join(projectRoot, '.etienne');

  // Adaptive-Memory Ponderer can override the scan with a curated list.
  // When the override is present we bypass the last_run_ts gate entirely —
  // the Ponderer already decided which sessions are worth processing.
  const override = payload.sessionFilesOverride;
  const lastRunRaw = queue.getRunState('last_run_ts');
  const lastRunTs = lastRunRaw ? Number(lastRunRaw) : 0;

  const candidateFiles: Array<{ path: string; mtimeMs: number }> = [];
  if (override && override.length > 0) {
    for (const path of override) {
      try {
        const stat = await fs.stat(path);
        candidateFiles.push({ path, mtimeMs: stat.mtimeMs });
      } catch { /* skip unreadable */ }
    }
    log.log(`[${project}] HARVEST using sessionFilesOverride (${override.length} files)`);
  } else {
    let entries: string[] = [];
    try { entries = await fs.readdir(etienneDir); } catch { entries = []; }
    const sessionFiles = entries.filter((f) => f.startsWith('chat.history-') && f.endsWith('.jsonl'));
    for (const f of sessionFiles) {
      const path = join(etienneDir, f);
      try {
        const stat = await fs.stat(path);
        if (stat.mtimeMs > lastRunTs) candidateFiles.push({ path, mtimeMs: stat.mtimeMs });
      } catch { /* skip unreadable */ }
    }
  }

  if (candidateFiles.length === 0) {
    log.log(`[${project}] No new sessions since ${new Date(lastRunTs).toISOString()}; skipping run`);
    return;
  }

  // Group by domain. Heuristic: read first user turn's contextName, fall back to 'general'.
  const byDomain = new Map<string, string[]>();
  for (const cf of candidateFiles) {
    const domain = await inferDomain(cf.path);
    const list = byDomain.get(domain) ?? [];
    list.push(cf.path);
    byDomain.set(domain, list);
  }

  for (const [domain, files] of byDomain) {
    const segmentPayload: SegmentPayload = { project, domain, sessionFiles: files };
    queue.enqueue('segment', segmentPayload, { runId, domain, parentId: parentJobId });
  }

  queue.setRunState('last_run_ts', String(Date.now()));
  log.log(`[${project}] HARVEST run ${runId}: ${candidateFiles.length} sessions across ${byDomain.size} domain(s)`);
}

async function inferDomain(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.contextName) return String(msg.contextName).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }
  } catch { /* fall through */ }
  return 'general';
}
