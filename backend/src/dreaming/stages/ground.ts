import { Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GroundPayload, GroundedCandidate } from './stage-types';
import { groundPrompt } from '../prompts/ground.prompt';
import { groundOutputSchema } from '../schemas/grounding.schema';

const log = new Logger('Dreaming/GROUND');

/**
 * Ask the LLM to assess up to 8 web sources for a candidate strategy and classify each
 * as supports/contradicts/neutral. The LLM response is expected as JSON. We do not
 * actually fetch web pages here — the model uses its internal training knowledge plus
 * any tool use it makes available. This is a pragmatic approximation; a future revision
 * can plug a real WebSearch tool in.
 */
export async function runGround(
  payload: GroundPayload,
  llm: LlmService,
): Promise<GroundedCandidate> {
  const c = payload.candidate;
  const userPrompt =
    `Strategy: ${c.title}\nWHEN: ${c.when}\nDO: ${c.do}\nBECAUSE: ${c.because}\n\n` +
    `Domain: ${payload.domain}\n\n` +
    'Identify 3 to 8 plausible authoritative web sources you would consult to verify or refute this strategy. For each, classify as supports/contradicts/neutral and give a one-sentence note.';

  let webSources: GroundedCandidate['webSources'] = [];
  let webScore: number | null = null;

  try {
    const raw = await llm.generateTextWithMessages({
      tier: 'small',
      messages: [
        { role: 'system', content: groundPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxOutputTokens: 1024,
      projectDir: payload.project,
    });
    const parsed = tryParseJson(raw);
    const validated = parsed ? groundOutputSchema.safeParse(parsed) : null;
    if (validated && validated.success) {
      webSources = validated.data.sources.map((s) => ({ url: s.url, verdict: s.verdict, note: s.note }));
      const supports = webSources.filter((w) => w.verdict === 'supports').length;
      const contradicts = webSources.filter((w) => w.verdict === 'contradicts').length;
      const total = webSources.length || 1;
      webScore = (supports - contradicts) / total;
    } else {
      log.warn(`[${payload.project}] GROUND validation failed for ${c.title}`);
    }
  } catch (err: any) {
    log.warn(`[${payload.project}] GROUND call failed for ${c.title}: ${err.message}`);
  }

  return { ...c, webSources, webScore, supportCount: payload.supportCount };
}

function tryParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { /* try to extract a fenced block */ }
  const fence = s.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* fall through */ } }
  return null;
}
