import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import type { TaskFraming } from '../../memory/types';
import { SkillsStore } from '../stores/skills.store';

/**
 * TaskFraming: extract intent + keywords + activeSkillIds from a user prompt.
 *
 * Strategy:
 *   1. Deterministic baseline (always runs, no LLM needed): tokenise the
 *      prompt and match against every provisioned skill's `invocationTriggers`.
 *      A trigger matches when its substring appears (case-insensitive) in the
 *      prompt. Skills with at least one trigger hit are activated.
 *   2. Optional LLM refinement (small tier): when `useLlm` is true, ask the
 *      small model to extract a 1-line intent and a refined keyword set. The
 *      LLM call is best-effort; on failure we keep the deterministic result.
 *
 * The Picker treats the activeSkillIds list as the source of `classification
 * Context` (ceiling) and `sourcePriorities`. Empty activeSkillIds → loosest
 * ceiling (PRD §5.2), which is the right behaviour for an unscoped prompt.
 */
@Injectable()
export class TaskFramingService {
  private readonly logger = new Logger(TaskFramingService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly skills: SkillsStore,
  ) {}

  async frame(
    project: string,
    prompt: string,
    opts: { useLlm?: boolean } = {},
  ): Promise<TaskFraming> {
    const skillNames = await this.skills.list(project);
    const skills = await this.skills.byIds(project, skillNames);

    const lowered = prompt.toLowerCase();
    const activeSkillIds: string[] = [];
    for (const skill of skills) {
      const triggers = skill.frontmatter.invocationTriggers ?? [];
      const matched = triggers.some((t) => lowered.includes(t.toLowerCase()));
      if (matched) activeSkillIds.push(skill.name);
    }

    // Deterministic keyword extraction: words ≥4 chars, no duplicates, capped
    // at the 12 most "informative" (rare-ish) tokens. Cheap and lossless
    // enough that the Picker's whole-page wiki fetch is unaffected.
    const baseKeywords = uniqueKeywords(prompt);

    if (!opts.useLlm) {
      return {
        intent: prompt.trim().slice(0, 200),
        keywords: baseKeywords,
        activeSkillIds,
      };
    }

    try {
      const raw = await this.llm.generateTextWithMessages({
        tier: 'small',
        maxOutputTokens: 512,
        projectDir: project,
        messages: [
          {
            role: 'system',
            content:
              'You extract task framing. Reply ONLY with JSON: {"intent": "<one-line>", "keywords": ["<kw>", ...]} . Keywords are 3..10 informative words. No prose.',
          },
          { role: 'user', content: prompt },
        ],
      });
      const parsed = tryParseFramingJson(raw);
      if (parsed) {
        return {
          intent: parsed.intent || prompt.trim().slice(0, 200),
          keywords: parsed.keywords?.length ? parsed.keywords : baseKeywords,
          activeSkillIds,
        };
      }
      this.logger.warn(`Task-framing LLM produced unparseable output; falling back to deterministic keywords`);
    } catch (err: any) {
      this.logger.warn(`Task-framing LLM failed: ${err.message}; falling back to deterministic keywords`);
    }
    return {
      intent: prompt.trim().slice(0, 200),
      keywords: baseKeywords,
      activeSkillIds,
    };
  }
}

// --- helpers -------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'has', 'was',
  'were', 'will', 'into', 'about', 'what', 'when', 'where', 'which', 'who',
  'how', 'why', 'they', 'them', 'their', 'there', 'over', 'under',
]);

function uniqueKeywords(prompt: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of prompt.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length < 4) continue;
    if (STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= 12) break;
  }
  return out;
}

function tryParseFramingJson(raw: string): { intent?: string; keywords?: string[] } | null {
  // Strip code fences if present.
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
  const body = fenceMatch ? fenceMatch[1] : raw;
  try {
    const parsed = JSON.parse(body.trim());
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        intent: typeof parsed.intent === 'string' ? parsed.intent : undefined,
        keywords: Array.isArray(parsed.keywords)
          ? parsed.keywords.filter((k: unknown): k is string => typeof k === 'string')
          : undefined,
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}
