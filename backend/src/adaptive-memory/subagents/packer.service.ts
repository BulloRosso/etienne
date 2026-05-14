import { Injectable } from '@nestjs/common';
import {
  applyClassificationCeiling,
  strictestCeiling,
} from '../../memory/classification';
import type {
  CandidateContext,
  ContextPackage,
  Skill,
  StoreName,
} from '../../memory/types';

/**
 * Packer (PRD §5.2).
 *
 * Trims an overshooting CandidateContext into a ContextPackage that fits the
 * token budget. Four levers, applied in this exact order:
 *
 *   1. Classification ceiling (FIREWALL POINT 2 — non-negotiable)
 *      Drop entries whose classification exceeds the strictest active-skill
 *      ceiling. Done first so the firewall always fires, even on tiny budgets.
 *
 *   2. Source priority
 *      Skills declare priority per store; lower numbers win. Survivors from
 *      step 1 are grouped by store and ordered by their merged priority.
 *
 *   3. Recency within store
 *      For each store, keep newest-first. Older entries are first to be
 *      dropped when the budget is tight. (Compression of older entries is a
 *      future enhancement; today we drop, not summarise.)
 *
 *   4. Whole-page protection
 *      Wiki pages flow through whole or are dropped entirely — never split
 *      mid-body. (Step 1 already preserves this; we don't slice pages anywhere.)
 *
 * The token estimate is a 4-chars-per-token approximation. Real tokenisation
 * would require pulling in a tokenizer; for now this is deliberately coarse —
 * the Packer's job is to make a *defensible* trim, not to hit token budgets
 * to the byte.
 */
@Injectable()
export class Packer {
  pack(
    candidate: CandidateContext,
    userPrompt: string,
    opts: { tokenBudget: number },
  ): ContextPackage {
    // Step 1 — classification ceiling.
    const ceiling = strictestCeiling(candidate.activeSkills);
    const { filtered, dropped: droppedForClassification } = applyClassificationCeiling(
      candidate,
      ceiling,
    );

    // Step 2 — source priority. mergePriorities returns a Map<store, lowest-priority-number>.
    const priorities = mergePriorities(candidate.activeSkills);

    // Step 3 — recency-aware ordering within each store.
    const orderedFragments = [...filtered.ragFragments].sort(byRecencyDesc);
    const orderedWiki = [...filtered.wikiPages].sort(byRecencyDesc);
    const orderedPrefs = [...filtered.preferences].sort(byRecencyDesc);
    const orderedKgEntities = [...filtered.kgSubgraph.entities].sort(byRecencyDesc);
    const orderedKgEdges = [...filtered.kgSubgraph.edges].sort(byRecencyDesc);

    // Step 4 — assemble in priority order, dropping the lowest-priority sections
    // until the budget fits. Whole-page protection is implicit: we either include
    // a Wiki page or we don't.
    const sections: Array<{ store: StoreName; text: string; tokens: number }> = [];

    // Map StoreName → its lowest-priority value across active skills (lower = better).
    // Stores not referenced by any skill default to a high number so they sink to
    // the bottom of the cut order.
    const storePri = (s: StoreName): number => priorities.get(s) ?? 999;

    for (const page of orderedWiki) {
      const text = renderWikiPage(page);
      sections.push({ store: 'wiki', text, tokens: estimateTokens(text) });
    }
    for (const frag of orderedFragments) {
      const text = renderRAGFragment(frag);
      sections.push({ store: 'rag', text, tokens: estimateTokens(text) });
    }
    if (orderedKgEntities.length || orderedKgEdges.length) {
      const text = renderKG(orderedKgEntities, orderedKgEdges);
      sections.push({ store: 'kg', text, tokens: estimateTokens(text) });
    }
    for (const p of orderedPrefs) {
      const text = renderPreference(p);
      sections.push({ store: 'preferences', text, tokens: estimateTokens(text) });
    }
    for (const r of filtered.sorRecords) {
      const text = renderSOR(r);
      sections.push({ store: 'sor', text, tokens: estimateTokens(text) });
    }

    // Sort by store priority, then by original position (stable for ties).
    sections.sort((a, b) => storePri(a.store) - storePri(b.store));

    // Budget the system prompt up front; remainder goes to knowledge.
    const systemPrompt = assembleSystemPrompt(candidate.activeSkills);
    const systemTokens = estimateTokens(systemPrompt);
    const userTokens = estimateTokens(userPrompt);
    const fixedTokens = systemTokens + userTokens;
    const remainingBudget = Math.max(0, opts.tokenBudget - fixedTokens);

    // Drop from the *end* (lowest priority) until we fit.
    const kept: typeof sections = [];
    let used = 0;
    for (const section of sections) {
      if (used + section.tokens > remainingBudget) {
        // Whole-page protection: never include half of a section.
        continue;
      }
      kept.push(section);
      used += section.tokens;
    }

    const knowledge = kept.map((s) => s.text).join('\n\n---\n\n');
    const sourceSummary = countByStore(kept);

    return {
      systemPrompt,
      knowledge,
      userPrompt,
      meta: {
        totalTokens: fixedTokens + used,
        sourceSummary,
        droppedForClassification,
      },
    };
  }
}

// --- helpers -------------------------------------------------------------

function mergePriorities(skills: Skill[]): Map<StoreName, number> {
  const out = new Map<StoreName, number>();
  for (const skill of skills) {
    for (const sp of skill.frontmatter.sourcePriorities ?? []) {
      const existing = out.get(sp.store);
      if (existing === undefined || sp.priority < existing) {
        out.set(sp.store, sp.priority);
      }
    }
  }
  return out;
}

function byRecencyDesc<T extends { provenance: { updatedAt: string } }>(a: T, b: T): number {
  return (b.provenance.updatedAt ?? '').localeCompare(a.provenance.updatedAt ?? '');
}

/** Coarse 4-chars-per-token estimator. Good enough for budget triage. */
function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function assembleSystemPrompt(skills: Skill[]): string {
  if (skills.length === 0) return '';
  const blocks = skills.map(
    (s) =>
      `## Skill: ${s.name}\n\n${s.frontmatter.description}\n\n${s.body.trim()}`,
  );
  return blocks.join('\n\n');
}

function renderWikiPage(p: import('../../memory/types').WikiPage): string {
  return `### Wiki — ${p.title}\n\n${p.body.trim()}`;
}

function renderRAGFragment(f: import('../../memory/types').RAGFragment): string {
  return `### RAG fragment [${f.tags.join(', ') || 'no tags'}]\n\n${f.text}`;
}

function renderPreference(p: import('../../memory/types').Preference): string {
  return `### Preference (${p.scope}${p.subject ? `:${p.subject}` : ''}, confidence ${p.confidence.toFixed(2)})\n\n${p.statement}`;
}

function renderSOR(r: { source: string; payload: unknown }): string {
  return `### SOR — ${r.source}\n\n${typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload, null, 2)}`;
}

function renderKG(
  entities: import('../../memory/types').KGEntity[],
  edges: import('../../memory/types').KGEdge[],
): string {
  const eLines = entities.map((e) => `- ${e.id} (${e.type}): ${e.label}`).join('\n');
  const edLines = edges.map((e) => `- ${e.subject} —${e.predicate}→ ${e.object}`).join('\n');
  return `### Knowledge graph subgraph\n\n#### Entities\n${eLines || '_(none)_'}\n\n#### Edges\n${edLines || '_(none)_'}`;
}

function countByStore(
  sections: Array<{ store: StoreName }>,
): Record<StoreName, number> {
  const out: Record<StoreName, number> = {
    wiki: 0,
    kg: 0,
    rag: 0,
    preferences: 0,
    sor: 0,
    personality: 0,
  };
  for (const s of sections) out[s.store] += 1;
  return out;
}
