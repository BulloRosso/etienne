import { Logger } from '@nestjs/common';
import * as path from 'path';
import { CanUseTool, PermissionResult } from '../../claude/sdk/sdk-permission.types';
import { SdkPermissionService } from '../../claude/sdk/sdk-permission.service';

const logger = new Logger('SupportAgentPolicy');

const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob']);
const MUTATING_FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// Commands that are clearly read-only diagnostics — auto-approve.
// NOTE: matched case-insensitively (Windows / PowerShell convention).
const ALLOWED_BASH_READ_PREFIXES = [
  // Node / npm / git
  'node -v',
  'node --version',
  'npm -v',
  'npm --version',
  'npx --version',
  'git --version',
  'git status',
  'git log',
  'git branch',
  'git remote',
  // Languages / tooling
  'soffice --version',
  'python --version',
  'python3 --version',
  'py --version',
  'uv --version',
  'uv python list',
  'uv python find',
  'pip --version',
  'pip3 --version',
  // Network probes
  'curl -I',
  'curl --head',
  'curl -s',                 // silent fetch; output captured, not executed
  'wget --spider',
  // POSIX diagnostic shell
  'netstat',
  'ss ',
  'df ',
  'du ',
  'printenv',
  'env ',
  'echo $',
  'echo "',
  "echo '",
  'which ',
  'whoami',
  'pwd',
  'ls ',
  'cat ',                    // policy still rejects WORKSPACE_ROOT reads via the path checks
  'hostname',
  'uname',
  'node -e',                 // small probing scripts
  // Windows cmd-style
  'where ',
  'dir ',
  'type ',
  // PowerShell cmdlets (read-only). Case-insensitive matching is applied.
  'get-command ',
  'get-childitem ',
  'gci ',                    // alias
  'get-content ',
  'gc ',                     // alias
  'test-path ',
  'resolve-path ',
  'get-item ',
  'get-itemproperty ',
  'get-process ',
  'get-service ',
  'get-location ',
  'get-host ',
  'get-help ',
  'measure-object ',
  'select-string ',
  'select-object ',
  'where-object ',
  'foreach-object ',
  '$psversiontable',
  '$env:',                   // reading any env var via $env:NAME
];

// Install / setup commands that change system state.
// Auto-approved so the agent can actually perform the fix end-to-end.
// Destructive patterns below still hard-reject. Matched case-insensitively.
const ALLOWED_BASH_INSTALL_PREFIXES = [
  // Node / npm
  'npm install',
  'npm ci',
  'npm uninstall',
  'npx ',
  // POSIX package managers
  'apt-get install',
  'apt install',
  'brew install',
  'brew reinstall',
  'pipx install',
  // Windows package managers
  'choco install',
  'choco upgrade',
  'winget install',
  'winget upgrade',
  'scoop install',
  // Python tooling
  'pip install',
  'pip3 install',
  'uv pip install',
  'uv sync',
  'uv python install',
  'uv python pin',
  'uv python uninstall',
  'uv tool install',
  'uv run',
  'uv lock',
  'uv add',
  'uv remove',
  'uv venv',
  // Installer download patterns
  'curl -lssf',              // standard for piping uv / rustup installers (lowercased)
  // PowerShell shell invocations
  'powershell ',
  'powershell.exe ',
  'pwsh ',
  'pwsh.exe ',
  // PowerShell network installers / cmdlets
  'iwr ',                    // Invoke-WebRequest alias
  'irm ',                    // Invoke-RestMethod alias
  'invoke-webrequest ',
  'invoke-restmethod ',
  'invoke-expression ',
  'iex ',                    // Invoke-Expression alias
  // PowerShell write cmdlets (kept here so they're auto-approved; path policy still applies separately)
  'set-content ',
  'add-content ',
  'out-file ',
  'new-item ',
];

const DESTRUCTIVE_BASH_PATTERNS = [
  /\brm\s+-rf?\s+\//,           // rm -rf on a root-level path
  /\brm\s+-rf?\s+~/,            // rm -rf $HOME
  /\brmdir\s+\/s/i,             // Windows recursive rmdir
  /\bgit\s+reset\s+--hard/,
  /\bgit\s+push\s+--force/,
  /\bgit\s+clean\s+-[fdx]/,
  /\bdd\s+if=/,
  /\bmkfs/,
  /\bshred\b/,
  />\s*\/dev\//,
  /\bsudo\b/,
  /\bdoas\b/,
  /\bchmod\s+777/,
  /\b:\(\)\s*\{/,               // fork bomb
  /\bformat\s+[a-z]:/i,         // Windows format C:
  /\bdiskpart\b/i,
  /\bnet\s+user\b/i,
];

function isUnderDir(filePath: string, dir: string): boolean {
  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  const rel = path.relative(resolvedDir, resolvedFile);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function deny(message: string): PermissionResult {
  logger.warn(`Policy denied: ${message}`);
  return { behavior: 'deny', message };
}

function allow(updatedInput?: any): PermissionResult {
  return { behavior: 'allow', updatedInput };
}

export interface SupportAgentPolicyOptions {
  workspaceRoot: string;
  repoRoot: string;
  /** Absolute paths the agent is allowed to write to. */
  allowedWritePaths: string[];
  sdkPermissionService: SdkPermissionService;
  projectName: string;
  sessionId?: string;
}

export function createSupportAgentCanUseTool(opts: SupportAgentPolicyOptions): CanUseTool {
  const { workspaceRoot, allowedWritePaths, sdkPermissionService, projectName, sessionId } = opts;

  // The underlying HITL-gated callback we delegate to for prompts.
  const hitlGated = sdkPermissionService.createCanUseToolCallback(projectName, sessionId, true);

  return async (toolName, input, options) => {
    // 1. Read-only tools — always allow, but block reads inside WORKSPACE_ROOT
    if (READ_ONLY_TOOLS.has(toolName)) {
      const targetPath: string | undefined = input?.file_path || input?.path || input?.pattern;
      if (targetPath && typeof targetPath === 'string' && path.isAbsolute(targetPath)) {
        if (isUnderDir(targetPath, workspaceRoot)) {
          return deny(`Read access denied: ${targetPath} is inside WORKSPACE_ROOT. Support agent must not access user project data.`);
        }
      }
      return allow(input);
    }

    // 2. Mutating file tools — must target an explicitly allowed write path
    if (MUTATING_FILE_TOOLS.has(toolName)) {
      const target: string | undefined = input?.file_path || input?.notebook_path;
      if (!target || typeof target !== 'string') {
        return deny(`Tool ${toolName} called without a file_path.`);
      }
      const resolved = path.resolve(target);
      if (isUnderDir(resolved, workspaceRoot)) {
        return deny(`Write denied: ${target} is inside WORKSPACE_ROOT. User data must not be modified by the support agent.`);
      }
      const allowed = allowedWritePaths.some((p) => {
        const rp = path.resolve(p);
        return resolved === rp || isUnderDir(resolved, rp);
      });
      if (!allowed) {
        return deny(
          `Write denied: ${target} is outside the support-agent allow-list (${allowedWritePaths.join(', ')}).`,
        );
      }
      // Auto-approve — file is on the allow-list (backend/.env or oauth-server/.env).
      // The whole point of the "Fix it now" flow is to apply the fix end-to-end.
      logger.log(`Auto-approving ${toolName} on allow-listed config file: ${resolved}`);
      return allow(input);
    }

    // 3. Bash — categorize by prefix
    if (toolName === 'Bash') {
      const cmd: string = (input?.command ?? '').toString();
      const trimmed = cmd.trim();
      if (!trimmed) {
        return deny('Bash called with empty command.');
      }
      // Hard reject — these patterns are dangerous regardless of context.
      // Destructive regex already runs case-insensitive where needed (via /i flag).
      if (DESTRUCTIVE_BASH_PATTERNS.some((re) => re.test(cmd))) {
        return deny(`Bash command rejected by policy (destructive pattern): ${cmd.substring(0, 100)}`);
      }
      // Case-insensitive prefix matching — PowerShell cmdlets and Windows commands
      // are commonly written in mixed case (Invoke-RestMethod vs irm, Get-Command, etc.).
      const lowerTrimmed = trimmed.toLowerCase();
      // Auto-approve diagnostic reads.
      if (ALLOWED_BASH_READ_PREFIXES.some((p) => lowerTrimmed.startsWith(p.toLowerCase()))) {
        return allow(input);
      }
      // Auto-approve install/setup commands so the agent can complete the fix
      // without per-command prompts. Destructive patterns above still apply.
      if (ALLOWED_BASH_INSTALL_PREFIXES.some((p) => lowerTrimmed.startsWith(p.toLowerCase()))) {
        logger.log(`Auto-approving install command: ${trimmed.substring(0, 120)}`);
        return allow(input);
      }
      // Anything else — surface to the user via HITL so they can approve novel commands
      // (e.g. a less common installer the agent picks). The user sees the exact command.
      logger.log(`Routing unknown Bash command through HITL: ${trimmed.substring(0, 120)}`);
      return hitlGated(toolName, input, options);
    }

    // 4. AskUserQuestion / ExitPlanMode — explicitly deny. The first-run UI has no
    //    chat input, so the user cannot answer. The agent must act, not ask.
    if (toolName === 'AskUserQuestion') {
      return deny(
        'AskUserQuestion is disabled in this session. The user clicked "Fix it now" and expects you to apply the fix directly. ' +
          'Pick the safest reasonable default and execute it. Do not ask follow-up questions.',
      );
    }
    if (toolName === 'ExitPlanMode') {
      return deny(
        'ExitPlanMode is disabled in this session — there is no planning phase. Execute the fix directly using your other tools.',
      );
    }

    // 5. Anything else — explicit deny
    return deny(`Tool ${toolName} is not allowed for the first-run support agent.`);
  };
}
