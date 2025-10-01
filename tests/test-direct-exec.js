#!/usr/bin/env node

/**
 * Direct test of Claude Code with CLAUDE.md
 */

const { execSync } = require('child_process');

const CONTAINER_NAME = 'claude-code';
const PROJECT_PATH = '/workspace/ralphg';
const TEST_PROMPT = 'Hello, can you confirm you read CLAUDE.md?';

console.log('Direct Claude Code Test\n');
console.log('='.repeat(80));

// Test 1: Verify CLAUDE.md exists and has content
console.log('\n1. Verifying CLAUDE.md in container...\n');
try {
  const result = execSync(`docker exec ${CONTAINER_NAME} cat ${PROJECT_PATH}/CLAUDE.md`, {
    encoding: 'utf8'
  });
  console.log('CLAUDE.md content:');
  console.log('-'.repeat(80));
  console.log(result);
  console.log('-'.repeat(80));

  if (result.includes('🤖 Project ralphg')) {
    console.log('✅ CLAUDE.md contains the expected marker instruction\n');
  } else {
    console.log('⚠️  CLAUDE.md does not contain expected marker\n');
  }
} catch (error) {
  console.error('❌ Failed to read CLAUDE.md:', error.message);
  process.exit(1);
}

// Test 2: Test without --append-system-prompt (baseline)
console.log('\n2. Test WITHOUT --append-system-prompt (should NOT have marker)...\n');
try {
  const cmd = `docker exec -w ${PROJECT_PATH} ${CONTAINER_NAME} claude -p "${TEST_PROMPT}" --output-format json`;
  console.log(`Command: ${cmd}\n`);

  const result = execSync(cmd, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  const parsed = JSON.parse(result);
  console.log('Response:', parsed.result);

  if (parsed.result && parsed.result.includes('🤖 Project ralphg')) {
    console.log('✅ Has marker (unexpected!)\n');
  } else {
    console.log('⚠️  No marker (expected - CLAUDE.md not loaded)\n');
  }
} catch (error) {
  console.error('❌ Test failed:', error.message);
}

// Test 3: Test WITH --append-system-prompt using cat
console.log('\n3. Test WITH --append-system-prompt using cat...\n');
try {
  const cmd = `docker exec -w ${PROJECT_PATH} ${CONTAINER_NAME} bash -c "claude -p '${TEST_PROMPT}' --append-system-prompt \\"\$(cat CLAUDE.md)\\" --output-format json"`;
  console.log(`Command: ${cmd}\n`);

  const result = execSync(cmd, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  const parsed = JSON.parse(result);
  console.log('Response:', parsed.result);

  if (parsed.result && parsed.result.includes('🤖 Project ralphg')) {
    console.log('\n✅✅✅ SUCCESS! Claude read CLAUDE.md!\n');
  } else {
    console.log('\n⚠️  No marker found in response\n');
  }
} catch (error) {
  console.error('❌ Test failed:', error.message);
  if (error.stdout) console.error('STDOUT:', error.stdout.toString().substring(0, 500));
  if (error.stderr) console.error('STDERR:', error.stderr.toString().substring(0, 500));
}

// Test 4: Verify the exact script command from backend
console.log('\n4. Test exact backend-style script...\n');
try {
  const script = `
cd ${PROJECT_PATH}
CLAUDE_CONTENT=\$(cat CLAUDE.md 2>/dev/null || echo '')
echo "CLAUDE.md content length: \${#CLAUDE_CONTENT}"
echo "First 100 chars: \${CLAUDE_CONTENT:0:100}"
claude -p "${TEST_PROMPT}" --append-system-prompt "\$CLAUDE_CONTENT" --output-format json
`;

  const result = execSync(`docker exec -w ${PROJECT_PATH} ${CONTAINER_NAME} bash -c ${JSON.stringify(script)}`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  console.log('Output:');
  console.log('-'.repeat(80));
  console.log(result.substring(0, 1500));
  console.log('-'.repeat(80));

  if (result.includes('🤖 Project ralphg')) {
    console.log('\n✅✅✅ SUCCESS with backend-style script!\n');
  } else {
    console.log('\n⚠️  No marker with backend-style script\n');
  }
} catch (error) {
  console.error('❌ Test failed:', error.message);
  if (error.stdout) console.error('STDOUT:', error.stdout.toString().substring(0, 1000));
}

console.log('='.repeat(80));
console.log('Tests complete\n');
