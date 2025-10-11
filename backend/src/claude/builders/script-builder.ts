export interface ScriptOptions {
  containerCwd: string;
  envHome: string;
  resumeArg: string;
  allowedTools: string[];
  planningMode?: boolean;
  maxTurns?: number;
}

export function buildClaudeScript(options: ScriptOptions): string {
  const { containerCwd, envHome, resumeArg, allowedTools, planningMode, maxTurns } = options;

  const allowedToolsArgs = allowedTools
    .map(tool => `  --allowedTools "${tool}"`)
    .join(' \\\n');

  const permissionMode = planningMode ? 'plan' : 'acceptEdits';

  // Only add --max-turns if maxTurns is defined and > 0 (0 means unlimited)
  const maxTurnsArg = (maxTurns && maxTurns > 0) ? `--max-turns ${maxTurns}` : '';

  // Build the command with optional resume arg
  const commandParts = [
    '"$CLAUDE_BIN"',
    '  --print "$CLAUDE_PROMPT"',
    '  --output-format stream-json',
    '  --verbose',
    '  --include-partial-messages',
    `  --permission-mode ${permissionMode}`,
    allowedToolsArgs,
  ];

  if (maxTurnsArg) {
    commandParts.push(`  ${maxTurnsArg}`);
  }

  if (resumeArg) {
    commandParts.push(`  ${resumeArg}`);
  }

  const command = commandParts.join(' \\\n');

  return `set -euo pipefail
export PATH="/usr/local/share/npm-global/bin:/usr/local/bin:/usr/bin:$PATH"

# Set project paths
containerCwd="${containerCwd}"
envHome="${envHome}"

# resolve claude
if command -v claude >/dev/null 2>&1; then CLAUDE_BIN="$(command -v claude)"; else CLAUDE_BIN="/usr/local/share/npm-global/bin/claude"; fi
[ -x "$CLAUDE_BIN" ] || { echo "claude not found"; exit 127; }

# project-local session state
export HOME="$envHome"
export XDG_CONFIG_HOME="$envHome"
export XDG_DATA_HOME="$envHome"
export XDG_STATE_HOME="$envHome"
export CLAUDE_CONFIG_DIR="$envHome"

mkdir -p "$HOME" "$containerCwd"
cd "$containerCwd"

${command}
`;
}
