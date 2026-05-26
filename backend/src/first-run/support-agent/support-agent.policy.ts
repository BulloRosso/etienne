import { Logger } from '@nestjs/common';
import * as path from 'path';
import { CanUseTool, PermissionResult } from '../../claude/sdk/sdk-permission.types';
import { SdkPermissionService } from '../../claude/sdk/sdk-permission.service';

const logger = new Logger('SupportAgentPolicy');

const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob']);
const MUTATING_FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

const ALLOWED_BASH_READ_PREFIXES = [
  'node -v',
  'node --version',
  'npm -v',
  'npm --version',
  'git --version',
  'soffice --version',
  'curl -I',
  'curl --head',
  'netstat',
  'df ',
  'printenv',
  'echo $',
];

const ALLOWED_BASH_INSTALL_PREFIXES = [
  'npm install',
  'npm ci',
  'apt-get install',
  'apt install',
  'brew install',
  'choco install',
];

const DESTRUCTIVE_BASH_PATTERNS = [
  /\brm\s+-rf/,
  /\bgit\s+reset\s+--hard/,
  /\bgit\s+push\s+--force/,
  /\bdd\s+if=/,
  /\bmkfs/,
  /\bshred\b/,
  />\s*\/dev\//,
  /\bsudo\b/,
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
      // Route through HITL — user must approve env edits
      return hitlGated(toolName, input, options);
    }

    // 3. Bash — categorize by prefix
    if (toolName === 'Bash') {
      const cmd: string = (input?.command ?? '').toString();
      if (!cmd.trim()) {
        return deny('Bash called with empty command.');
      }
      if (DESTRUCTIVE_BASH_PATTERNS.some((re) => re.test(cmd))) {
        return deny(`Bash command rejected by policy (destructive pattern): ${cmd.substring(0, 100)}`);
      }
      if (ALLOWED_BASH_READ_PREFIXES.some((p) => cmd.trim().startsWith(p))) {
        return allow(input);
      }
      if (ALLOWED_BASH_INSTALL_PREFIXES.some((p) => cmd.trim().startsWith(p))) {
        // Install commands always go through HITL
        return hitlGated(toolName, input, options);
      }
      return deny(`Bash command not on support-agent whitelist: ${cmd.substring(0, 100)}`);
    }

    // 4. AskUserQuestion / ExitPlanMode — delegate to existing HITL flow
    if (toolName === 'AskUserQuestion' || toolName === 'ExitPlanMode') {
      return hitlGated(toolName, input, options);
    }

    // 5. Anything else — explicit deny
    return deny(`Tool ${toolName} is not allowed for the first-run support agent.`);
  };
}
