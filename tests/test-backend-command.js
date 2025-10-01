#!/usr/bin/env node

/**
 * Test script to verify what command the backend is actually executing
 */

const { execSync } = require('child_process');

const CONTAINER_NAME = 'claude-code';
const PROJECT_DIR = 'ralphg';
const PROJECT_PATH = `/workspace/${PROJECT_DIR}`;

console.log('Testing backend command generation...\n');

// Simulate what the backend does
const containerCwd = PROJECT_PATH;
const envHome = `${PROJECT_PATH}/data`;

const script = `
set -euo pipefail
export PATH="/usr/local/share/npm-global/bin:/usr/local/bin:/usr/bin:\$PATH"

# resolve claude
if command -v claude >/dev/null 2>&1; then CLAUDE_BIN="\$(command -v claude)"; else CLAUDE_BIN="/usr/local/share/npm-global/bin/claude"; fi
[ -x "\$CLAUDE_BIN" ] || { echo "claude not found"; exit 127; }

# project-local session state
export HOME="${envHome}"
export XDG_CONFIG_HOME="${envHome}"
export XDG_DATA_HOME="${envHome}"
export XDG_STATE_HOME="${envHome}"
export CLAUDE_CONFIG_DIR="${envHome}"

mkdir -p "\$HOME" "${containerCwd}"
cd "${containerCwd}"

echo "DEBUG: Current directory: \$(pwd)"
echo "DEBUG: CLAUDE.md exists: \$(test -f CLAUDE.md && echo YES || echo NO)"
echo "DEBUG: CLAUDE.md first line: \$(head -n 1 CLAUDE.md 2>/dev/null || echo 'FILE NOT FOUND')"

"\$CLAUDE_BIN" \\
  --print "\$CLAUDE_PROMPT" \\
  --append-system-prompt "\$(cat CLAUDE.md 2>/dev/null || echo '')" \\
  --output-format json \\
  --permission-mode acceptEdits \\
  --continue
`;

console.log('Script to execute:');
console.log('='.repeat(80));
console.log(script);
console.log('='.repeat(80));
console.log();

// Build docker command
const dockerCmd = [
  'docker exec',
  `-w ${containerCwd}`,
  `-e ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY}`,
  `-e CLAUDE_PROMPT="Hello, can you confirm you read CLAUDE.md?"`,
  CONTAINER_NAME,
  'bash -lc',
  `'${script.replace(/'/g, "'\\''")}'`
].join(' ');

console.log('Full Docker Command:');
console.log('='.repeat(80));
console.log(dockerCmd);
console.log('='.repeat(80));
console.log();

// Execute the command
console.log('Executing command...\n');

try {
  const result = execSync(
    `docker exec -w ${containerCwd} -e CLAUDE_PROMPT="Hello, can you confirm you read CLAUDE.md?" ${CONTAINER_NAME} bash -lc ${JSON.stringify(script)}`,
    {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: 'pipe'
    }
  );

  console.log('Output:');
  console.log('='.repeat(80));
  console.log(result);
  console.log('='.repeat(80));

  // Check for the marker
  if (result.includes('🤖 Project ralphg')) {
    console.log('\n✅ SUCCESS: Claude read CLAUDE.md!');
  } else {
    console.log('\n⚠️  WARNING: Claude responded but did not read CLAUDE.md');
    console.log('Response did not contain expected marker "🤖 Project ralphg"');
  }
} catch (error) {
  console.error('❌ ERROR executing command:');
  console.error(error.message);
  if (error.stdout) {
    console.error('\nSTDOUT:', error.stdout.toString());
  }
  if (error.stderr) {
    console.error('\nSTDERR:', error.stderr.toString());
  }
}
