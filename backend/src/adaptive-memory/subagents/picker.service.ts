import { Inject, Injectable, Logger } from '@nestjs/common';
import { strictestCeiling } from '../../memory/classification';
import type {
  CandidateContext,
  Classification,
  Skill,
  TaskFraming,
} from '../../memory/types';
import {
  KG_ADAPTER,
  PREFERENCES_ADAPTER,
  RAG_ADAPTER,
  SOR_ADAPTER,
  WIKI_ADAPTER,
} from '../adaptive-memory.tokens';
import type {
  KGAdapter,
  PreferencesAdapter,
  RAGAdapter,
  SORAdapter,
  WikiAdapter,
} from '../adapters/adapter.types';
import { SkillsStore } from '../stores/skills.store';

/**
 * Picker (PRD §5.1).
 *
 * Pulls a CandidateContext from every source the active skills declare.
 * Runs once per task; the Packer trims the overshoot.
 *
 * FIREWALL POINT 4 (PRD §9): The Picker MUST NOT depend on PersonalityStore.
 * This is enforced *structurally* — the constructor parameter list does not
 * include it, the DI module does not wire it, and a structural test
 * (`test/adaptive-memory-picker.test.ts`) introspects this class to fail loudly
 * if a Personality dependency ever sneaks in.
 *
 * Personality only influences Skills (via the Ponderer's self-edit cycle).
 * Personality never enters the context package directly.
 */
@Injectable()
export class Picker {
  private readonly logger = new Logger(Picker.name);

  constructor(
    @Inject(WIKI_ADAPTER) private readonly wiki: WikiAdapter,
    @Inject(KG_ADAPTER) private readonly kg: KGAdapter,
    @Inject(RAG_ADAPTER) private readonly rag: RAGAdapter,
    @Inject(SOR_ADAPTER) private readonly sor: SORAdapter,
    @Inject(PREFERENCES_ADAPTER) private readonly preferences: PreferencesAdapter,
    private readonly skills: SkillsStore,
  ) {
    // Structural assertion: if a refactor ever wires a personality dependency,
    // the parameter property would show up on `this` — fail at construction.
    const personalityDep = Object.keys(this).find((k) =>
      k.toLowerCase().includes('personality'),
    );
    if (personalityDep) {
      throw new Error(
        `Picker constructor must not depend on PersonalityStore (firewall point 4); found: ${personalityDep}`,
      );
    }
  }

  /**
   * Build a CandidateContext for the given framing. Parallelises the five
   * source pulls; overshoots intentionally so the Packer can prune.
   *
   * Classification filter for RAG: the strictest skill ceiling decides which
   * classifications can possibly survive packing, so we filter at the source
   * to avoid wasting tokens on entries we'd drop anyway.
   */
  async assemble(framing: TaskFraming, projectId: string): Promise<CandidateContext> {
    const activeSkills = await this.skills.byIds(projectId, framing.activeSkillIds);
    const ceiling = strictestCeiling(activeSkills);
    const allowedClassifications = belowOrEqual(ceiling);

    const [wikiPages, kgSubgraph, ragFragments, preferences, sorRecords] = await Promise.all([
      this.pullWikiPages(projectId, framing),
      this.pullKGSubgraph(projectId, framing),
      this.rag.query(projectId, framing.intent, {
        topK: 20,
        classificationFilter: allowedClassifications,
      }),
      this.preferences.matching(projectId, framing.intent),
      this.pullSOR(projectId, framing, activeSkills),
    ]);

    this.logger.debug(
      `assembled candidate for ${projectId}: ` +
        `${wikiPages.length} wiki, ${kgSubgraph.entities.length} kg entities, ` +
        `${ragFragments.length} rag, ${preferences.length} preferences, ${sorRecords.length} sor`,
    );

    return {
      wikiPages,
      kgSubgraph,
      ragFragments,
      preferences,
      sorRecords,
      activeSkills,
    };
  }

  // --- source pulls -------------------------------------------------------

  /**
   * Whole-page rule (PRD §5.2 step 4): never split a Wiki page mid-body.
   * We search by keyword, then fetch each hit's whole page.
   */
  private async pullWikiPages(projectId: string, framing: TaskFraming) {
    const hits = await this.wiki.search(projectId, framing.keywords, { limit: 12 });
    const pages = await Promise.all(
      hits.map((h) => this.wiki.getPage(projectId, h.slug)),
    );
    return pages.filter((p): p is NonNullable<typeof p> => p !== null);
  }

  /**
   * Depth-1 subgraph rooted at the first entity that matches a keyword. With
   * no anchor we return an empty subgraph — the KG is opt-in via keyword
   * grounding, not a default firehose.
   */
  private async pullKGSubgraph(projectId: string, framing: TaskFraming) {
    if (framing.keywords.length === 0) return { entities: [], edges: [] };
    // The real KG adapter walks SPARQL; for now we try each keyword in turn
    // until one yields a non-empty subgraph.
    for (const kw of framing.keywords) {
      const sub = await this.kg.subgraph(projectId, kw, 1);
      if (sub.entities.length > 0) return sub;
    }
    return { entities: [], edges: [] };
  }

  /**
   * SOR pull is gated on what active skills declare. A skill that does NOT
   * declare a particular SOR connector in `sourcePriorities` cannot pull
   * from it — this is the SOR's read-only contract honoured per-skill.
   */
  private async pullSOR(
    projectId: string,
    framing: TaskFraming,
    activeSkills: Skill[],
  ) {
    const declared = new Set<string>();
    for (const skill of activeSkills) {
      for (const sp of skill.frontmatter.sourcePriorities ?? []) {
        if (sp.store === 'sor') declared.add(skill.name);
      }
    }
    if (declared.size === 0) return [];
    const available = await this.sor.listAvailable(projectId);
    const out: Array<{ source: string; payload: unknown }> = [];
    for (const c of available) {
      // Per-skill gating: only invoke connectors whose names are referenced
      // in at least one active skill. For now skills don't name specific
      // connectors so we read all available; the Ponderer can later refine
      // this via the per-skill `mcpConnectors` field on the config.
      try {
        const r = await this.sor.read(projectId, c.name, { intent: framing.intent });
        out.push(r);
      } catch (err: any) {
        this.logger.warn(`SOR ${c.name} read failed: ${err.message}`);
      }
    }
    return out;
  }
}

/** Returns the classification levels at or below `ceiling`. */
function belowOrEqual(ceiling: Classification): Classification[] {
  switch (ceiling) {
    case 'public':
      return ['public'];
    case 'private':
      return ['public', 'private'];
    case 'secret':
      return ['public', 'private', 'secret'];
  }
}
