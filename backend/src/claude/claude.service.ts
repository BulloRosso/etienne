import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import chokidar from 'chokidar';
import { join } from 'path';
import { Observable } from 'rxjs';
import { posixProjectPath } from '../common/path.util';
import { Usage, MessageEvent, ClaudeEvent } from './types';
import { norm, safeRoot } from './utils/path.utils';
import { extractText, parseSession, parseUsage, createJsonLineParser } from './parsers/stream-parser';
import { buildClaudeScript } from './builders/script-builder';
import { ClaudeConfig } from './config/claude.config';

@Injectable()
export class ClaudeService {
  private readonly config = new ClaudeConfig();
  private queues = new Map<string, Promise<unknown>>();

  private async ensureProject(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    await fs.mkdir(join(root, 'data'), { recursive: true });
    await fs.mkdir(join(root, 'out'), { recursive: true });
    const cm = join(root, 'CLAUDE.md');
    try { await fs.access(cm); } catch { await fs.writeFile(cm, `# ${projectDir}\n`); }
    return root;
  }

  public async addFile(projectDir: string, fileName: string, content: string) {
    const root = await this.ensureProject(projectDir);
    const filePath = join(root, fileName);

    // Don't overwrite CLAUDE.md if it already exists
    if (fileName === 'CLAUDE.md') {
      try {
        await fs.access(filePath);
        return { ok: true, path: filePath, skipped: true };
      } catch {
        // File doesn't exist, create it
      }
    }

    await fs.mkdir(norm(join(filePath, '..')), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
    return { ok: true, path: filePath };
  }

  public async getFile(projectDir: string, fileName: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const filePath = join(root, fileName);
    const data = await fs.readFile(filePath, 'utf8');
    return { path: filePath, content: data };
  }

  public async listFiles(projectDir: string, subDir = '.') {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const dir = join(root, subDir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.map(e => ({ name: e.name, isDir: e.isDirectory() }));
  }

  public async listProjects() {
    try {
      const entries = await fs.readdir(this.config.hostRoot, { withFileTypes: true });
      const projects = entries
        .filter(e => e.isDirectory())
        .map(e => e.name);
      return { projects };
    } catch {
      return { projects: [] };
    }
  }

  public async getStrategy(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const claudeMdPath = join(root, 'CLAUDE.md');
    try {
      const content = await fs.readFile(claudeMdPath, 'utf8');
      return { content };
    } catch {
      return { content: `# ${projectDir}\n` };
    }
  }

  public async saveStrategy(projectDir: string, content: string) {
    const root = await this.ensureProject(projectDir);
    const claudeMdPath = join(root, 'CLAUDE.md');
    await fs.writeFile(claudeMdPath, content, 'utf8');
    return { success: true };
  }

  public async getPermissions(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const permissionsPath = join(root, 'data', 'permissions.json');

    try {
      const content = await fs.readFile(permissionsPath, 'utf8');
      const parsed = JSON.parse(content);
      return { allowedTools: parsed.allowedTools || this.config.defaultAllowedTools };
    } catch {
      return { allowedTools: this.config.defaultAllowedTools };
    }
  }

  public async savePermissions(projectDir: string, allowedTools: string[]) {
    const root = await this.ensureProject(projectDir);
    const dataDir = join(root, 'data');
    const permissionsPath = join(dataDir, 'permissions.json');

    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(permissionsPath, JSON.stringify({ allowedTools }, null, 2), 'utf8');
    return { success: true };
  }

  public async getFilesystem(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);

    const buildTree = async (dirPath: string, basePath: string): Promise<any[]> => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));

      const items = await Promise.all(
        sorted.map(async (entry) => {
          const fullPath = join(dirPath, entry.name);
          const relativePath = fullPath.slice(basePath.length + 1).replace(/\\/g, '/');

          if (entry.isDirectory()) {
            const children = await buildTree(fullPath, basePath);
            return {
              id: relativePath,
              label: entry.name,
              type: 'folder',
              children
            };
          } else {
            return {
              id: relativePath,
              label: entry.name,
              type: 'file'
            };
          }
        })
      );

      return items;
    };

    const tree = await buildTree(root, root);
    return { tree };
  }

  // SSE: emits events: session, stdout, usage, file_added, file_changed, completed, error
  streamPrompt(projectDir: string, prompt: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      const run = async () => {
        const projectRoot = await this.ensureProject(projectDir);
        const containerCwd = posixProjectPath(this.config.containerRoot, projectDir);
        const envHome = posixProjectPath(this.config.containerRoot, projectDir, 'data');

        if (!containerCwd.startsWith('/') || !envHome.startsWith('/')) {
          throw new Error(`invalid container paths: cwd=${containerCwd} home=${envHome}`);
        }

        const sessionPath = join(projectRoot, 'data', 'session.id');
        let sessionId = '';
        try { sessionId = (await fs.readFile(sessionPath, 'utf8')).trim(); } catch { /* first run */ }
        const resumeArg = sessionId ? `--resume "$SESSION_ID"` : '--continue';

        // Setup file watcher
        const watcher = chokidar.watch(join(projectRoot, 'out'), {
          ignoreInitial: true,
          depth: 8,
          awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
        });
        const rel = (abs: string) => abs.slice(projectRoot.length + 1).replace(/\\/g, '/');
        watcher.on('add', (abs) => observer.next({ type: 'file_added', data: { path: rel(abs) } }));
        watcher.on('change', (abs) => observer.next({ type: 'file_changed', data: { path: rel(abs) } }));

        // Load permissions
        const { allowedTools } = await this.getPermissions(projectDir);

        // Build script and docker args
        const script = buildClaudeScript({ containerCwd, envHome, resumeArg, allowedTools });
        const args = [
          'exec',
          '-w', containerCwd,
          '-e', `ANTHROPIC_API_KEY=${this.config.anthropicKey}`,
          '-e', `CLAUDE_PROMPT=${prompt}`,
          ...(sessionId ? ['-e', `SESSION_ID=${sessionId}`] : []),
          this.config.container,
          'bash', '-lc', script
        ];

        // Spawn docker process
        const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const killTimer = setTimeout(() => child.kill('SIGKILL'), this.config.timeoutMs);

        let usage: Usage = {};
        let announcedSession = false;

        // Announce existing session immediately if resuming
        if (sessionId) {
          observer.next({ type: 'session', data: { session_id: sessionId, model: undefined } });
          announcedSession = true;
        }

        const emitText = (s: string) => { if (s) observer.next({ type: 'stdout', data: { chunk: s } }); };

        const onJsonLine = (evt: ClaudeEvent) => {
          if (evt.type === 'system') {
            const model = evt.model ?? evt.meta?.model;
            if (model) usage.model = model;

            if (!announcedSession) {
              const { sessionId: sid, model: sModel } = parseSession(evt);
              if (sid) {
                announcedSession = true;
                sessionId = sid;
                observer.next({ type: 'session', data: { session_id: sessionId, model: sModel } });
                fs.mkdir(join(projectRoot, 'data'), { recursive: true })
                  .then(() => fs.writeFile(sessionPath, sessionId, 'utf8'))
                  .catch(() => void 0);
              }
            }
            return;
          }

          const parsedUsage = parseUsage(evt, usage);
          if (parsedUsage) {
            usage = parsedUsage;
            observer.next({ type: 'usage', data: usage });
          }

          const text = extractText(evt);
          if (text) emitText(text);
        };

        const flushLines = createJsonLineParser(emitText, onJsonLine);

        child.stdout.on('data', (b) => flushLines(b.toString('utf8')));
        child.stderr.on('data', (b) => emitText(b.toString('utf8')));

        child.on('close', async (code) => {
          clearTimeout(killTimer);
          await watcher.close().catch(() => void 0);
          observer.next({ type: 'completed', data: { exitCode: code ?? 0, usage } });
          observer.complete();
        });

        child.on('error', async (err) => {
          clearTimeout(killTimer);
          await watcher.close().catch(() => void 0);
          observer.next({ type: 'error', data: { message: String(err) } });
          observer.complete();
        });
      };

      const prev = this.queues.get(projectDir) ?? Promise.resolve();
      const cur = prev.then(run).finally(() => {
        if (this.queues.get(projectDir) === cur) this.queues.delete(projectDir);
      });
      this.queues.set(projectDir, cur);

      return () => void 0;
    });
  }
}
