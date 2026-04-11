---
name: deep-scientific-research
description: >
  Deep scientific research pipeline with subagent orchestration, parallel
  web search, and citation management. Use this skill whenever the user
  asks for a literature review, scientific research summary, evidence
  synthesis, systematic review, or any deep research task that requires
  searching multiple sources and producing a cited report. Also triggers
  on phrases like "research this topic", "find papers on", "what does the
  evidence say about", "literature review on", or "deep dive into".
---

# Deep Scientific Research Skill

A multi-agent pipeline for conducting rigorous scientific research using
the Claude Agent SDK. The system breaks a research question into focused
subtopics, spawns parallel researcher subagents to search the web, then
synthesizes everything into a unified report with a numbered citation list.

## Architecture

```
User Question
     |
     v
+-------------------+
|   Orchestrator    |  Plans subtopics, coordinates agents
|   (Lead Agent)    |
+---------+---------+
          | spawns 3-6 in parallel
    +-----+-----+-----+
    v     v     v     v
+------+------+------+
|Rsrch1||Rsrch2||Rsrch3|  Each searches web, returns
|      ||      ||      |  structured findings + URLs
+--+---++--+---++--+---+
   |       |       |
   +-------+-------+
           v
   +---------------+
   |  Synthesizer  |  Merges, deduplicates, renumbers
   |   Subagent    |  citations, writes final report
   +-------+-------+
           v
     Final Report
   (Markdown + References)
```

## Subagent Definitions

This skill relies on two subagents that should be available in the project:

### researcher

- **Tools**: `WebSearch`, `WebFetch`
- **Model**: `sonnet` (fast, cost-effective for search tasks)
- **Purpose**: Searches the web for a specific subtopic. Returns
  structured findings with source URLs.
- **Output format**: Markdown with `## Subtopic`, `### Findings`,
  `### Sources` sections.

### synthesizer

- **Tools**: None (pure text synthesis)
- **Model**: `sonnet`
- **Purpose**: Takes all researcher outputs and produces a unified,
  well-structured report with globally renumbered citations.
- **Output format**: Full research report with Executive Summary,
  numbered sections, Open Questions, and References list.

## Workflow

When the user asks a research question:

1. **PLAN** - Break the research question into 3-6 focused subtopics.
   Each subtopic should be a specific, searchable angle of the question.

2. **DELEGATE** - For every subtopic, invoke the "researcher" subagent with a
   clear, precise prompt. Include the subtopic title and 2-3 specific
   search queries the researcher should try. Spawn researchers in PARALLEL
   whenever possible to save time.

3. **SYNTHESIZE** - Once all researchers report back, combine findings into a
   single, coherent research report using the "synthesizer" subagent.
   Pass ALL researcher outputs to the synthesizer verbatim.

4. **DELIVER** - Present the synthesizer's final report to the user.
   Save the report to `out/report_<timestamp>.md`.

## Important Rules

- Always use the researcher subagent for gathering information. Never
  search yourself.
- Always use the synthesizer subagent for the final report. Never write
  the report yourself.
- When calling a subagent, pass all necessary context in the prompt
  string - subagents cannot see this conversation.
- If a researcher returns thin results, you may spawn a follow-up
  researcher with refined queries.
- Your final message to the user should be the synthesized report,
  presented verbatim without modification.

## Customization

### Domain-specific research

The researcher subagent can be tuned to prioritize domain-specific databases:

- **Biomedical**: PubMed, ClinicalTrials.gov, bioRxiv
- **Physics/Math**: arXiv, APS journals
- **Computer Science**: Semantic Scholar, ACM DL, DBLP
- **Legal**: case law databases, government registers
- **Economics**: NBER, SSRN, Fed publications

### Cost Expectations

A typical research query spawns 3-6 researcher subagents, each making
3-5 web searches. Expect roughly:
- **Simple topic**: ~$0.50-1.00 (3 researchers, ~15 searches)
- **Complex topic**: ~$2.00-5.00 (6 researchers + follow-ups, ~30 searches)
