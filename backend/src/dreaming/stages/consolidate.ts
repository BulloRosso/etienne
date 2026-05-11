import { promises as fs } from 'fs';
import { Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { DreamingCollectionsService } from '../chroma/dreaming-collections.service';
import { ConsolidatePayload, ConsolidatedCandidate, GroundedCandidate } from './stage-types';
import { consolidatePrompt } from '../prompts/consolidate.prompt';
import { mergeOutputSchema } from '../schemas/consolidation.schema';

const log = new Logger('Dreaming/CONSOLIDATE');
const MERGE_THRESHOLD = 0.88;

/**
 * Search the strategy collection for an existing skill that overlaps semantically.
 * On hit (cosine > 0.88), call an LLM MERGE pass; on contradiction, mark contested.
 * Compute diversity score from how many distinct trajectories support this candidate
 * (capped at 1.0 once 3+ trajectories support it).
 */
export async function runConsolidate(
  payload: ConsolidatePayload,
  llm: LlmService,
  chroma: DreamingCollectionsService,
): Promise<ConsolidatedCandidate> {
  const c = payload.candidate;
  let mergedSkillName: string | undefined;
  let mergedBody: string | undefined;
  let contested = false;

  try {
    const description = `${c.title}. Use when: ${c.when}.`;
    const hits = await chroma.searchStrategies(payload.project, description, 3, MERGE_THRESHOLD);
    if (hits.length > 0) {
      const top = hits[0];
      let existingBody = '';
      try { existingBody = await fs.readFile(top.metadata.skill_path, 'utf8'); } catch { /* skill file gone */ }

      if (existingBody) {
        const userPrompt =
          `# EXISTING SKILL (${top.metadata.skill_name})\n${existingBody}\n\n# NEW CANDIDATE\n${describeCandidate(c)}`;
        try {
          const raw = await llm.generateTextWithMessages({
            tier: 'regular',
            messages: [
              { role: 'system', content: consolidatePrompt },
              { role: 'user', content: userPrompt },
            ],
            maxOutputTokens: 2048,
            projectDir: payload.project,
          });
          const parsed = tryParseJson(raw);
          const validation = parsed ? mergeOutputSchema.safeParse(parsed) : null;
          if (validation && validation.success) {
            mergedSkillName = top.metadata.skill_name;
            mergedBody = validation.data.mergedBody;
            contested = validation.data.contested;
          }
        } catch (err: any) {
          log.warn(`[${payload.project}] CONSOLIDATE LLM failed for ${c.title}: ${err.message}`);
        }
      }
    }
  } catch (err: any) {
    log.warn(`[${payload.project}] CONSOLIDATE pre-search failed: ${err.message}`);
  }

  const diversityScore = Math.min(1, c.supportTrajectories.length / 3);
  const compositeScore = 0; // computed in PROMOTE
  return { ...c, mergedSkillName, mergedBody, contested, diversityScore, compositeScore };
}

function describeCandidate(c: GroundedCandidate): string {
  return `Title: ${c.title}\nWHEN: ${c.when}\nDO: ${c.do}\nBECAUSE: ${c.because}\nEvidence: ${c.evidence.join('; ')}\nSupport count: ${c.supportCount}`;
}

function tryParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { /* try to extract a fenced block */ }
  const fence = s.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* fall through */ } }
  return null;
}
