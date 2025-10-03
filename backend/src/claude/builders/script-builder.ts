export interface ScriptOptions {
  containerCwd: string;
  envHome: string;
  resumeArg: string;
  allowedTools: string[];
  planningMode?: boolean;
}

export function buildClaudeScript(options: ScriptOptions): string {
  const { containerCwd, envHome, resumeArg, allowedTools, planningMode } = options;

  const allowedToolsArgs = allowedTools
    .map(tool => `  --allowedTools "${tool}"`)
    .join(' \\\n');

  const planningArg = planningMode ? '--permission-mode plan\\' : '';

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

"$CLAUDE_BIN" \\
  --print "$CLAUDE_PROMPT" \\
  --output-format stream-json \\
  --verbose \\
  --include-partial-messages \\
  --permission-mode acceptEdits \\
${allowedToolsArgs} \\
  ${planningArg}
  ${resumeArg}
`;
}
