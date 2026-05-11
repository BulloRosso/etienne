import { promises as fs } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { safeRoot } from '../../claude/utils/path.utils';
import { DreamingCollectionsService } from '../chroma/dreaming-collections.service';
import { DreamingQueue } from '../queue/queue';
import { DreamFile, DreamItem } from '../dto/dreaming-settings.dto';
import { ConsolidatedCandidate, IndexPayload } from './stage-types';

const log = new Logger('Dreaming/INDEX');

/**
 * Per-candidate INDEX:
 *  1. Atomic SKILL.md write under .claude/skills/strategies/<domain>/<id>/SKILL.md
 *  2. Embed description into ChromaDB strategy collection
 *  3. Append to .claude/skills/strategies/<domain>/log.md
 *  4. Append the candidate to the run's accumulator file (in queue run_state),
 *     so the run-completion finalizer can write dream-<date>.dreams.json once.
 */
export async function runIndex(
  workspaceRoot: string,
  payload: IndexPayload,
  queue: DreamingQueue,
  chroma: DreamingCollectionsService,
): Promise<void> {
  const project = payload.project;
  const projectRoot = safeRoot(workspaceRoot, project);
  const candidate = payload.candidate;
  const skillId = slugify(candidate.title);

  const skillDir = join(projectRoot, '.claude', 'skills', 'strategies', payload.domain, skillId);
  await fs.mkdir(skillDir, { recursive: true });
  const skillPath = join(skillDir, 'SKILL.md');
  const skillBody = renderSkillMd(candidate, skillId);
  const tmp = `${skillPath}.tmp`;
  await fs.writeFile(tmp, skillBody, 'utf8');
  await fs.rename(tmp, skillPath);

  const description = renderDescription(candidate);
  try {
    await chroma.upsertStrategy(project, skillId, description, {
      skill_name: skillId,
      skill_path: skillPath,
      domain: payload.domain,
      status: candidate.contested ? 'contested' : 'active',
      confidence: candidate.confidence,
      support_count: candidate.supportCount,
      last_verified: new Date().toISOString().slice(0, 10),
    });
  } catch (err: any) {
    log.warn(`[${project}] Could not upsert ChromaDB embedding for ${skillId}: ${err.message}`);
  }

  const logPath = join(projectRoot, '.claude', 'skills', 'strategies', payload.domain, 'log.md');
  const logLine = `## [${new Date().toISOString().slice(0, 10)}] promoted | ${skillId} | support=${candidate.supportCount} score=${candidate.compositeScore.toFixed(3)}\n`;
  await fs.appendFile(logPath, logLine, 'utf8');

  // Accumulate top-N items for the run summary file.
  const stateKey = `dreams_${payload.runId}`;
  const accRaw = queue.getRunState(stateKey);
  const acc: DreamItem[] = accRaw ? JSON.parse(accRaw) : [];
  acc.push({
    id: skillId,
    domain: payload.domain,
    title: candidate.title,
    body: skillBody,
    evidence: candidate.evidence,
    compositeScore: candidate.compositeScore,
    status: candidate.contested ? 'contested' : 'active',
    dismissedByUser: false,
  });
  queue.setRunState(stateKey, JSON.stringify(acc));

  log.log(`[${project}] INDEXed ${skillId} (${payload.domain}) score=${candidate.compositeScore.toFixed(3)}`);
}

/**
 * Finalize the run by writing the dream-<date>.dreams.json artifact.
 * Always writes the file — even an empty-items run produces an artifact so the
 * user sees "the pipeline ran, here's what came out (nothing)" instead of silence.
 * Called when the worker observes that no more pending jobs exist for runId.
 */
export async function finalizeRun(
  workspaceRoot: string,
  project: string,
  runId: string,
  maxItems: number,
  queue: DreamingQueue,
): Promise<string | null> {
  const stateKey = `dreams_${runId}`;
  const accRaw = queue.getRunState(stateKey);
  const acc: DreamItem[] = accRaw ? JSON.parse(accRaw) : [];

  const top = [...acc].sort((a, b) => b.compositeScore - a.compositeScore).slice(0, maxItems);
  const dream: DreamFile = {
    runId,
    generatedAt: new Date().toISOString(),
    items: top,
  };
  const projectRoot = safeRoot(workspaceRoot, project);
  const dreamingDir = join(projectRoot, 'dreaming');
  await fs.mkdir(dreamingDir, { recursive: true });
  const fileName = `dream-${new Date().toISOString().slice(0, 10)}.dreams.json`;
  const fullPath = join(dreamingDir, fileName);
  const tmp = `${fullPath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(dream, null, 2), 'utf8');
  await fs.rename(tmp, fullPath);

  // Clear the accumulator
  queue.setRunState(stateKey, '[]');
  log.log(`[${project}] Finalized run ${runId}: wrote ${fileName} with ${top.length} items`);
  return fileName;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'strategy';
}

function renderDescription(c: ConsolidatedCandidate): string {
  return `${c.title}. Use when: ${c.when}. Provides: ${c.do}.`;
}

function renderSkillMd(c: ConsolidatedCandidate, skillId: string): string {
  const description = renderDescription(c);
  const evidenceList = c.evidence.map((e) => `- ${e}`).join('\n') || '- (no explicit evidence captured)';
  const sources = c.webSources.map((w) => `- ${w.url} — ${w.verdict}${w.note ? `: ${w.note}` : ''}`).join('\n') || '- (no web sources)';
  const status = c.contested ? 'contested' : 'active';
  const today = new Date().toISOString().slice(0, 10);
  return `---
name: ${skillId}
description: |
  ${description}
version: 1.0.0
---

# ${c.title}

## Provenance
- domain: ${c.domain}
- type: heuristic
- status: ${status}
- confidence: ${c.confidence.toFixed(2)}
- support_count: ${c.supportCount}
- composite_score: ${c.compositeScore.toFixed(3)}
- last_verified: ${today}
- supportTrajectories: ${c.supportTrajectories.join(', ') || '(none)'}

## WHEN
${c.when}

## DO
${c.do}

## BECAUSE
${c.because}

## EVIDENCE
${evidenceList}

## WEB SOURCES
${sources}
`;
}
