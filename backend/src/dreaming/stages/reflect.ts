import { Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { CandidateStrategy, ReflectPayload, Trajectory } from './stage-types';
import { reflectPrompt } from '../prompts/reflect.prompt';
import { reflectOutputSchema } from '../schemas/candidate.schema';

const log = new Logger('Dreaming/REFLECT');
const MAX_RETRY = 2;

/**
 * Run a single LLM REFLECT pass on one trajectory. Returns 0..N candidate strategies.
 */
export async function runReflect(
  payload: ReflectPayload,
  llm: LlmService,
): Promise<CandidateStrategy[]> {
  const trajectorySummary = summarizeTrajectory(payload.trajectory);
  let lastErr: string | null = null;

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    const userPrompt = lastErr
      ? `${trajectorySummary}\n\n# Previous attempt failed schema validation: ${lastErr}\n# Re-emit valid JSON only.`
      : trajectorySummary;
    let raw: string;
    try {
      raw = await llm.generateTextWithMessages({
        tier: 'small',
        messages: [
          { role: 'system', content: reflectPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxOutputTokens: 2048,
        projectDir: payload.project,
      });
    } catch (err: any) {
      log.warn(`[${payload.project}] REFLECT call failed (attempt ${attempt + 1}): ${err.message}`);
      lastErr = err.message;
      continue;
    }

    const parsed = tryParseJson(raw);
    if (!parsed) { lastErr = 'response was not valid JSON'; continue; }
    const validation = reflectOutputSchema.safeParse(parsed);
    if (!validation.success) { lastErr = validation.error.message; continue; }

    return validation.data.candidates.map((c, i) => ({
      candidateId: `${payload.trajectory.trajectoryId}-c${i}`,
      domain: payload.trajectory.domain,
      title: c.title,
      when: c.when,
      do: c.do,
      because: c.because,
      evidence: c.evidence,
      confidence: c.confidence,
      supportTrajectories: [payload.trajectory.trajectoryId],
    }));
  }

  log.warn(`[${payload.project}] REFLECT giving up on trajectory ${payload.trajectory.trajectoryId}: ${lastErr}`);
  return [];
}

function summarizeTrajectory(t: Trajectory): string {
  const turnLines = t.turns.map((turn, i) => {
    const role = turn.isAgent ? 'agent' : 'user';
    const text = String(turn.message ?? '').slice(0, 800);
    return `[${i}] ${role}: ${text}`;
  });
  return `# Trajectory ${t.trajectoryId} (domain=${t.domain}, outcome=${t.outcome})\n` +
    `# Outcome signals: toolErrors=${t.outcomeSignals.toolErrors} retries=${t.outcomeSignals.retries}\n\n` +
    turnLines.join('\n');
}

function tryParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { /* try to extract a fenced block */ }
  const fence = s.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* fall through */ } }
  return null;
}
