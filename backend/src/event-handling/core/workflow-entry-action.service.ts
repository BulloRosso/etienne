import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { StatefulWorkflowsService, WorkflowTransitionInfo } from '../../stateful-workflows/stateful-workflows.service';
import { SSEPublisherService } from '../publishers/sse-publisher.service';
import * as path from 'path';
import * as fs from 'fs-extra';
import axios from 'axios';
import { spawn, execSync } from 'child_process';

// Python 3.12 standard library modules (subset of the most common ones)
const PYTHON_STDLIB = new Set([
  '__future__', 'abc', 'aifc', 'argparse', 'array', 'ast', 'asynchat', 'asyncio',
  'asyncore', 'atexit', 'base64', 'bdb', 'binascii', 'binhex', 'bisect', 'builtins',
  'bz2', 'calendar', 'cgi', 'cgitb', 'chunk', 'cmath', 'cmd', 'code', 'codecs',
  'codeop', 'collections', 'colorsys', 'compileall', 'concurrent', 'configparser',
  'contextlib', 'contextvars', 'copy', 'copyreg', 'cProfile', 'crypt', 'csv',
  'ctypes', 'curses', 'dataclasses', 'datetime', 'dbm', 'decimal', 'difflib',
  'dis', 'distutils', 'doctest', 'email', 'encodings', 'enum', 'errno',
  'faulthandler', 'fcntl', 'filecmp', 'fileinput', 'fnmatch', 'fractions',
  'ftplib', 'functools', 'gc', 'getopt', 'getpass', 'gettext', 'glob', 'grp',
  'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http', 'idlelib', 'imaplib',
  'imghdr', 'imp', 'importlib', 'inspect', 'io', 'ipaddress', 'itertools',
  'json', 'keyword', 'lib2to3', 'linecache', 'locale', 'logging', 'lzma',
  'mailbox', 'mailcap', 'marshal', 'math', 'mimetypes', 'mmap', 'modulefinder',
  'multiprocessing', 'netrc', 'nis', 'nntplib', 'numbers', 'operator', 'optparse',
  'os', 'ossaudiodev', 'pathlib', 'pdb', 'pickle', 'pickletools', 'pipes',
  'pkgutil', 'platform', 'plistlib', 'poplib', 'posix', 'posixpath', 'pprint',
  'profile', 'pstats', 'pty', 'pwd', 'py_compile', 'pyclbr', 'pydoc',
  'queue', 'quopri', 'random', 're', 'readline', 'reprlib', 'resource',
  'rlcompleter', 'runpy', 'sched', 'secrets', 'select', 'selectors', 'shelve',
  'shlex', 'shutil', 'signal', 'site', 'smtpd', 'smtplib', 'sndhdr', 'socket',
  'socketserver', 'spwd', 'sqlite3', 'sre_compile', 'sre_constants', 'sre_parse',
  'ssl', 'stat', 'statistics', 'string', 'stringprep', 'struct', 'subprocess',
  'sunau', 'symtable', 'sys', 'sysconfig', 'syslog', 'tabnanny', 'tarfile',
  'telnetlib', 'tempfile', 'termios', 'test', 'textwrap', 'threading', 'time',
  'timeit', 'tkinter', 'token', 'tokenize', 'tomllib', 'trace', 'traceback',
  'tracemalloc', 'tty', 'turtle', 'turtledemo', 'types', 'typing', 'unicodedata',
  'unittest', 'urllib', 'uu', 'uuid', 'venv', 'warnings', 'wave', 'weakref',
  'webbrowser', 'winreg', 'winsound', 'wsgiref', 'xdrlib', 'xml', 'xmlrpc',
  'zipapp', 'zipfile', 'zipimport', 'zlib', '_thread',
]);

@Injectable()
export class WorkflowEntryActionService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowEntryActionService.name);
  private readonly workspaceDir = path.resolve(process.cwd(), process.env.WORKSPACE_ROOT || '../workspace');
  private readonly backendUrl: string;
  private readonly activeEntryActions = new Set<string>();
  private pythonCommand: string | null = null;
  private pythonChecked = false;

  constructor(
    private readonly workflowsService: StatefulWorkflowsService,
    @Inject(forwardRef(() => SSEPublisherService))
    private readonly ssePublisher: SSEPublisherService,
  ) {
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:6060';
  }

  onModuleInit(): void {
    this.workflowsService.onTransition((info) => this.handleTransition(info));
    this.logger.log('Registered workflow transition callback for entry actions');
  }

  // ---- Transition handler ----

  private async handleTransition(info: WorkflowTransitionInfo): Promise<void> {
    const { newStateMeta } = info;
    if (!newStateMeta.onEntry?.promptFile && !newStateMeta.onEntry?.scriptFile) return;

    const dedupKey = `${info.project}:${info.workflowId}:${info.newState}`;
    if (this.activeEntryActions.has(dedupKey)) {
      this.logger.warn(`Entry action already running for ${dedupKey}, skipping`);
      return;
    }

    // Route to prompt or script execution
    const executor = newStateMeta.onEntry?.scriptFile
      ? this.executeScriptAction(info, dedupKey)
      : this.executePromptAction(info, dedupKey);

    // Fire-and-forget — don't block the transition
    executor.catch((err) => {
      this.logger.error(`Entry action failed for ${dedupKey}: ${err.message}`);
    });
  }

  // ---- Prompt execution (existing) ----

  private async executePromptAction(info: WorkflowTransitionInfo, dedupKey: string): Promise<void> {
    this.activeEntryActions.add(dedupKey);

    try {
      const promptFile = info.newStateMeta.onEntry!.promptFile!;
      const maxTurns = info.newStateMeta.onEntry!.maxTurns || 20;
      const promptPath = path.join(this.workspaceDir, info.project, 'workflows', promptFile);

      if (!await fs.pathExists(promptPath)) {
        throw new Error(`Prompt file not found: workflows/${promptFile}`);
      }

      const promptContent = await fs.readFile(promptPath, 'utf-8');
      const finalPrompt = this.buildContextPrompt(info, promptContent);

      this.logger.log(
        `Executing entry action for workflow "${info.workflowName}" state "${info.newState}" (prompt: ${promptFile})`,
      );

      this.ssePublisher.publishPromptExecution(info.project, {
        status: 'started',
        ruleId: `entry:${info.workflowId}:${info.newState}`,
        ruleName: `Workflow Entry: ${info.workflowName} → ${info.newState}`,
        promptTitle: promptFile,
        eventId: `transition:${info.event}`,
        timestamp: new Date().toISOString(),
      });

      const url = `${this.backendUrl}/api/claude/unattended/${encodeURIComponent(info.project)}`;
      const response = await axios.post(
        url,
        {
          prompt: finalPrompt,
          maxTurns,
          source: `Workflow Entry: ${info.workflowName} → ${info.newState}`,
          sessionName: 'Workflow Actions',
        },
        { timeout: 300000 },
      );

      const result = response.data?.response || 'Prompt executed successfully';

      this.ssePublisher.publishPromptExecution(info.project, {
        status: 'completed',
        ruleId: `entry:${info.workflowId}:${info.newState}`,
        ruleName: `Workflow Entry: ${info.workflowName} → ${info.newState}`,
        promptTitle: promptFile,
        eventId: `transition:${info.event}`,
        response: result.substring(0, 500),
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Entry action completed for ${dedupKey}`);
    } catch (error: any) {
      this.logger.error(`Entry action error for ${dedupKey}: ${error.message}`);

      this.ssePublisher.publishPromptExecution(info.project, {
        status: 'error',
        ruleId: `entry:${info.workflowId}:${info.newState}`,
        ruleName: `Workflow Entry: ${info.workflowName} → ${info.newState}`,
        eventId: `transition:${info.event}`,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    } finally {
      this.activeEntryActions.delete(dedupKey);
    }
  }

  // ---- Script execution (new) ----

  private async executeScriptAction(info: WorkflowTransitionInfo, dedupKey: string): Promise<void> {
    this.activeEntryActions.add(dedupKey);
    const startTime = Date.now();
    const scriptFile = info.newStateMeta.onEntry!.scriptFile!;
    const timeoutSec = info.newStateMeta.onEntry!.timeout || 300;

    const scriptsDir = path.join(this.workspaceDir, info.project, 'workflows', 'scripts');
    const scriptPath = path.join(scriptsDir, scriptFile);
    const logsDir = path.join(scriptsDir, 'logs');

    try {
      // Ensure logs dir
      await fs.ensureDir(logsDir);

      // Validate script exists
      if (!await fs.pathExists(scriptPath)) {
        throw new Error(`Script file not found: workflows/scripts/${scriptFile}`);
      }

      // Detect Python
      const python = this.detectPython();
      if (!python) {
        throw new Error('Python not found. Install Python 3.12+ and ensure "python" or "python3" is on PATH.');
      }

      this.logger.log(
        `Executing script for workflow "${info.workflowName}" state "${info.newState}" (script: ${scriptFile})`,
      );

      // Log "called"
      await this.writeScriptLog(logsDir, {
        level: 'info',
        script: scriptFile,
        workflow_id: info.workflowId,
        state: info.newState,
        event: 'called',
        message: 'Script execution started',
      });

      // SSE started
      this.ssePublisher.publishScriptExecution(info.project, {
        status: 'started',
        workflowId: info.workflowId,
        scriptFile,
        state: info.newState,
        timestamp: new Date().toISOString(),
      });

      // Install dependencies
      const scriptContent = await fs.readFile(scriptPath, 'utf-8');
      await this.installDependencies(python, scriptContent, scriptsDir);

      // Build context for stdin
      const context = {
        workflow_id: info.workflowId,
        workflow_name: info.workflowName,
        previous_state: info.previousState || '',
        new_state: info.newState,
        event: info.event,
        data: info.data || null,
        project: info.project,
        workspace_dir: path.join(this.workspaceDir, info.project),
      };

      // Execute script
      const result = await this.spawnScript(python, scriptPath, context, timeoutSec, scriptsDir);
      const durationMs = Date.now() - startTime;

      // Log "succeeded"
      await this.writeScriptLog(logsDir, {
        level: 'info',
        script: scriptFile,
        workflow_id: info.workflowId,
        state: info.newState,
        event: 'succeeded',
        message: 'Script completed',
        exit_code: 0,
        stdout: result.stdout.substring(0, 2000),
        duration_ms: durationMs,
      });

      // SSE completed
      this.ssePublisher.publishScriptExecution(info.project, {
        status: 'completed',
        workflowId: info.workflowId,
        scriptFile,
        state: info.newState,
        stdout: result.stdout.substring(0, 500),
        exitCode: 0,
        durationMs,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Script action completed for ${dedupKey} (${durationMs}ms)`);

      // Auto-advance workflow on success
      const onSuccess = info.newStateMeta.onEntry?.onSuccess;
      if (onSuccess) {
        try {
          await this.workflowsService.sendEvent(info.project, info.workflowId, onSuccess, {
            scriptFile,
            stdout: result.stdout.substring(0, 2000),
            source: 'script_auto_advance',
          });
          this.logger.log(`Auto-advanced workflow "${info.workflowId}" with event "${onSuccess}"`);
        } catch (advanceErr: any) {
          this.logger.error(`Failed to auto-advance workflow "${info.workflowId}" with "${onSuccess}": ${advanceErr.message}`);
        }
      }
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      this.logger.error(`Script action error for ${dedupKey}: ${error.message}`);

      // Log "error"
      await this.writeScriptLog(logsDir, {
        level: 'error',
        script: scriptFile,
        workflow_id: info.workflowId,
        state: info.newState,
        event: 'error',
        message: error.message,
        exit_code: error.exitCode ?? 1,
        stderr: (error.stderr || '').substring(0, 2000),
        duration_ms: durationMs,
      }).catch(() => {}); // Don't let log write failure mask original error

      // SSE error
      this.ssePublisher.publishScriptExecution(info.project, {
        status: 'error',
        workflowId: info.workflowId,
        scriptFile,
        state: info.newState,
        stderr: (error.stderr || error.message).substring(0, 500),
        exitCode: error.exitCode ?? 1,
        durationMs,
        timestamp: new Date().toISOString(),
      });

      // Auto-advance workflow on error
      const onError = info.newStateMeta.onEntry?.onError;
      if (onError) {
        try {
          await this.workflowsService.sendEvent(info.project, info.workflowId, onError, {
            scriptFile,
            error: error.message,
            stderr: (error.stderr || '').substring(0, 2000),
            exitCode: error.exitCode ?? 1,
            source: 'script_auto_advance',
          });
          this.logger.log(`Auto-advanced workflow "${info.workflowId}" with error event "${onError}"`);
        } catch (advanceErr: any) {
          this.logger.error(`Failed to auto-advance workflow "${info.workflowId}" with "${onError}": ${advanceErr.message}`);
        }
      }
    } finally {
      this.activeEntryActions.delete(dedupKey);
    }
  }

  // ---- Python helpers ----

  private detectPython(): string | null {
    if (this.pythonChecked) return this.pythonCommand;
    this.pythonChecked = true;

    for (const cmd of ['python', 'python3']) {
      try {
        const version = execSync(`${cmd} --version`, { encoding: 'utf-8', timeout: 5000 }).trim();
        this.logger.log(`Detected Python: ${cmd} → ${version}`);
        this.pythonCommand = cmd;
        return cmd;
      } catch {
        // Try next
      }
    }

    this.logger.warn('Python not found on PATH');
    return null;
  }

  private async installDependencies(python: string, scriptContent: string, cwd: string): Promise<void> {
    const packages = this.extractDependencies(scriptContent);
    if (packages.length === 0) return;

    const pkgList = packages.join(' ');
    this.logger.log(`Installing dependencies: ${pkgList}`);

    try {
      execSync(`${python} -m pip install --quiet ${pkgList}`, {
        encoding: 'utf-8',
        timeout: 120000,
        cwd,
      });
    } catch (err: any) {
      this.logger.warn(`pip install warning: ${err.message}`);
      // Non-fatal — script may still work if packages are already installed
    }
  }

  private extractDependencies(scriptContent: string): string[] {
    const lines = scriptContent.split('\n');

    // Check for explicit requirements comment header
    for (const line of lines) {
      const match = line.match(/^#\s*requirements:\s*(.+)/i);
      if (match) {
        return match[1].split(',').map(p => p.trim()).filter(Boolean);
      }
    }

    // Fallback: parse import statements
    const imports = new Set<string>();
    for (const line of lines) {
      // Skip comments and strings
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue;

      // Match "import X" or "from X import ..."
      const importMatch = trimmed.match(/^import\s+(\w+)/);
      if (importMatch) {
        imports.add(importMatch[1]);
        continue;
      }

      const fromMatch = trimmed.match(/^from\s+(\w+)/);
      if (fromMatch) {
        imports.add(fromMatch[1]);
      }
    }

    // Filter out standard library modules
    return Array.from(imports).filter(pkg => !PYTHON_STDLIB.has(pkg));
  }

  private spawnScript(
    python: string,
    scriptPath: string,
    context: any,
    timeoutSec: number,
    cwd: string,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(python, [scriptPath], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      // Write context to stdin and close
      child.stdin.write(JSON.stringify(context));
      child.stdin.end();

      // Timeout handling
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        // Give it a moment to clean up, then force kill
        setTimeout(() => {
          try { child.kill('SIGKILL'); } catch {}
        }, 3000);
        const err: any = new Error(`Script timed out after ${timeoutSec}s`);
        err.exitCode = -1;
        err.stderr = stderr;
        reject(err);
      }, timeoutSec * 1000);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          const err: any = new Error(`Script exited with code ${code}${stderr ? ': ' + stderr.substring(0, 200) : ''}`);
          err.exitCode = code;
          err.stderr = stderr;
          reject(err);
        }
      });

      child.on('error', (err: any) => {
        clearTimeout(timer);
        err.stderr = stderr;
        reject(err);
      });
    });
  }

  // ---- JSONL logging ----

  private async writeScriptLog(logsDir: string, entry: Record<string, any>): Promise<void> {
    try {
      const date = new Date().toISOString().split('T')[0];
      const logFile = path.join(logsDir, `${date}.jsonl`);
      const logEntry = { timestamp: new Date().toISOString(), ...entry };
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (err: any) {
      this.logger.error(`Failed to write script log: ${err.message}`);
    }
  }

  // ---- Prompt context builder ----

  private buildContextPrompt(info: WorkflowTransitionInfo, promptContent: string): string {
    const dataSection = info.data
      ? `\nEvent Data:\n\`\`\`json\n${JSON.stringify(info.data, null, 2)}\n\`\`\`\n`
      : '';

    return `[WORKFLOW STATE ENTRY]
Workflow: ${info.workflowName} (${info.workflowId})
Previous State: ${info.previousState || '(initial)'}
Current State: ${info.newState}
Triggering Event: ${info.event}
${dataSection}
---

${promptContent}`.trim();
  }
}
