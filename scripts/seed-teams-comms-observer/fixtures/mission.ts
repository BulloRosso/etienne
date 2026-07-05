/**
 * Mission fixture for the Teams Communication Observer seed.
 */

export const PROJECT_NAME = 'teams-comms-observer';

export const MISSION_BRIEF =
  'Silently observe the mirrored Microsoft Teams channels of team "Hive Alpha", ' +
  'diagnose Hyperactive-Hive-Mind communication patterns (Cal Newport), maintain ' +
  'evidence-based communication-style profiles per person, record observed patterns ' +
  'in the knowledge graph, and evolve a written team agreement (response-time norms, ' +
  'deep-work block, office hours, meeting-free day) that measurably reduces the ' +
  'patterns. Never post to Teams proactively; answer only when directly addressed.';

export const MISSION_MD = `# Mission — Hive Communication Observer

## Problem

Team **Hive Alpha** has no explicit workflow for collaboration. Coordination
happens through a constant, unstructured stream of Teams messages — everyone
reacts to everyone, permanently. Cal Newport calls this pattern the
**Hyperactive Hive Mind**: it produces collective *activity* but not collective
*intelligence*. Everybody is busy; nobody gets to focused work.

## Goal

1. **Observe** the mirrored channels under \`data/teams/<channel>/\`
   (transcripts are synced by the platform; this agent never writes there).
2. **Measure** — run the \`hive-analytics\` skill to compute reply-latency
   distributions, after-hours share, burst/fragmentation index, unanswered
   blockers, and interruption-cascade depth. Numbers come from the script,
   never from estimation.
3. **Diagnose** — classify occurrences against the hive-mind pattern taxonomy
   (\`wiki/topics/hive-mind-pattern-taxonomy.md\`) and record each as a
   \`PatternOccurrence\` in the knowledge graph with \`evidencedBy\` links to
   the actual Teams messages.
4. **Profile** — maintain a respectful, evidence-cited communication-style
   profile per person in \`wiki/topics/person-<slug>.md\`.
5. **Remedy** — maintain \`out/team-agreement-draft.md\`: proposed norms
   (24h e-mail / 4h messenger response in core time, morning deep-work block,
   office hours, meeting-free day), each backed by observed evidence and the
   research basis (Newport; MIT Sloan 2022 meeting-free-days study), revised
   as evidence accumulates.

## Non-negotiables

- **Silent observer.** Never post to Teams proactively. The only externally
  visible output is the in-thread answer when a team member @-mentions the bot.
- **Patterns, not character.** "The channel shows X" — never "person Y is bad
  at Z". Findings must be safe to read aloud in front of the whole team.
- **Every claim cites evidence** (message links / transcript dates / metrics).
`;
