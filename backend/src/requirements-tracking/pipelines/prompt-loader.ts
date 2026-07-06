import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Prompts are versioned repo files (spec §7): backend/src/requirements-tracking/prompts/
 * p-<pipeline>.v<N>.md, extracted verbatim from spec §5. The shared output-discipline
 * block (§5.10) is appended to every prompt at load time.
 */

const PROMPTS_DIR = path.join(__dirname, '..', 'prompts');

export interface LoadedPrompt {
  name: string; // p-extract.v1
  version: string; // v1
  text: string;
  hash: string;
}

const cache = new Map<string, LoadedPrompt>();

function readPromptFile(fileName: string): string {
  const candidates = [
    path.join(PROMPTS_DIR, fileName),
    // dist layout (compiled to dist/src/… while prompts stay under src/)
    path.join(process.cwd(), 'src', 'requirements-tracking', 'prompts', fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf-8');
  }
  throw new Error(`Prompt file not found: ${fileName}`);
}

export function loadPrompt(name: string): LoadedPrompt {
  const cached = cache.get(name);
  if (cached) return cached;

  const base = readPromptFile(`${name}.md`);
  const discipline = readPromptFile('shared-output-discipline.md');
  const text = `${base.trimEnd()}\n\n${discipline.trimEnd()}\n`;
  const loaded: LoadedPrompt = {
    name,
    version: /\.v(\d+)$/.exec(name)?.[0]?.slice(1) ?? 'v1',
    text,
    hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12),
  };
  cache.set(name, loaded);
  return loaded;
}

/** Replace {{placeholders}}; unknown placeholders are left intact (visible in evals). */
export function renderPrompt(prompt: LoadedPrompt, vars: Record<string, string | number>): string {
  return prompt.text.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  );
}
