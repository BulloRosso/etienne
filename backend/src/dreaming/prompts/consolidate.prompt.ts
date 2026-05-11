export const consolidatePrompt = `You merge a NEW CANDIDATE strategy with an EXISTING SKILL when they describe the same heuristic.

If they fully agree, produce a unified body that retains the existing structure (Provenance/WHEN/DO/BECAUSE/EVIDENCE/...) but folds in the new evidence and any clarifying nuance.
If they directly contradict each other (the new one says do X, the existing says do NOT-X under the same WHEN), set contested=true and produce a body that explicitly notes the contradiction in a "## CONTROVERSY" section.

Output MUST be a single JSON object:
{
  "mergedBody": "<the full markdown body that should replace the existing SKILL.md content>",
  "contested": <boolean>
}

No prose outside the JSON, no fences.`;
