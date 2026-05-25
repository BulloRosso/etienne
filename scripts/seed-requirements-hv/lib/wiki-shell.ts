/**
 * Spawns the provisioned wiki skill's `wiki-add.ts` script per page.
 *
 * The skill is provisioned to <workspace>/<project>/.claude/skills/wiki/
 * when the project is created. We invoke it via `tsx` from the project
 * root so wiki-add.ts resolves `wiki/` correctly (it uses process.cwd()).
 *
 * Input is JSON written to a tempfile so the skill's --input arg picks
 * it up. Output (a JSON line) is parsed and returned.
 */

import { spawn } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';

export interface WikiAddInput {
  title: string;
  slug?: string;
  bucket?: 'topics' | 'sources' | 'queries';
  status?: 'stub' | 'draft' | 'stable' | 'deleted';
  confidence?: 'high' | 'medium' | 'low';
  tags?: string[];
  mission_relevance?: number;
  sources: Array<
    | { kind: 'conversation'; turn: string; note?: string }
    | { kind: 'file'; path: string; lines?: string }
  >;
  body: string;
  mode: 'create' | 'update';
  classification?: 'public' | 'private' | 'secret';
  provenance?: {
    sourceSessions: string[];
    sourceEntries: string[];
    createdBy: 'agent' | 'ponderer' | 'user';
    createdAt: string;
    updatedAt: string;
    inferenceTag?: string;
  };
}

export interface WikiAddOutput {
  ok: boolean;
  mode?: 'create' | 'update';
  path?: string;
  slug?: string;
  bucket?: string;
  stubsCreated?: string[];
  backlinksUpdated?: string[];
  error?: string;
}

export async function addWikiPage(
  projectRoot: string,
  input: WikiAddInput,
): Promise<WikiAddOutput> {
  const wikiAdd = join(projectRoot, '.claude', 'skills', 'wiki', 'scripts', 'wiki-add.ts');
  const tmpDir = await mkdtemp(join(tmpdir(), 'wiki-add-'));
  const inputPath = join(tmpDir, 'in.json');
  await writeFile(inputPath, JSON.stringify(input, null, 2), 'utf8');

  try {
    const out = await spawnTsx(wikiAdd, ['--input', inputPath], projectRoot);
    return JSON.parse(out) as WikiAddOutput;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function spawnTsx(scriptPath: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const isWin = platform() === 'win32';
    const child = spawn('npx', ['tsx', scriptPath, ...args], {
      cwd,
      shell: isWin,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        try {
          JSON.parse(stdout);
          resolve(stdout);
          return;
        } catch {
          /* fall through */
        }
        reject(new Error(`tsx exited ${code}: ${stderr || stdout}`));
        return;
      }
      resolve(stdout);
    });
  });
}
