export const groundPrompt = `You are verifying a candidate strategy against authoritative public knowledge.
For 3 to 8 well-known sources (official docs, RFCs, established blogs, papers), classify each as supports/contradicts/neutral with a one-sentence note.

Output MUST be a single JSON object:
{
  "sources": [
    { "url": "<plausible source URL>", "verdict": "supports" | "contradicts" | "neutral", "note": "<one sentence>" }
  ]
}

Use the URLs you remember from training; do not fabricate domain names. If you genuinely cannot judge a strategy, return an empty array.
No prose, no markdown, no fences. Just the JSON.`;
