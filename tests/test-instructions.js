#!/usr/bin/env node

/**
 * Test script to determine the correct way to configure Claude Code
 * to recognize CLAUDE.md in project directories when running via docker exec
 *
 * This script tests various methods of invoking Claude Code from the command line
 * to find which approach successfully loads CLAUDE.md project instructions.
 *
 * IMPORTANT NOTES:
 * - Claude Code requires authentication (ANTHROPIC_API_KEY environment variable)
 * - The -p or --print flag is used for non-interactive mode
 * - CLAUDE.md should be in the working directory when Claude starts
 * - Use docker exec -w flag to set the working directory
 *
 * Run with: node tests/test-instructions.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const CONTAINER_NAME = 'claude-code'; // Adjust if needed
const TEST_PROJECT = 'demo1';
const PROJECT_PATH = `/workspace/${TEST_PROJECT}`;
const TEST_PROMPT = 'Hello, please confirm you read the instructions';

// Test instructions to write to CLAUDE.md
const TEST_INSTRUCTIONS = `# Project Instructions

## Important Instructions
Always start your responses with '🤖 Project ${TEST_PROJECT} -' to confirm you're reading CLAUDE.md.`;

console.log('='.repeat(80));
console.log('Claude Code CLAUDE.md Configuration Test');
console.log('='.repeat(80));
console.log();

/**
 * Execute a command and return the output
 */
function exec(command, options = {}) {
  try {
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      ...options
    });
    return { success: true, output: result, error: '' };
  } catch (error) {
    return {
      success: false,
      output: error.stdout ? error.stdout.toString() : '',
      error: error.stderr ? error.stderr.toString() : error.message
    };
  }
}

/**
 * Create test project structure in the container
 */
function setupTestProject() {
  console.log('📁 Setting up test project...');

  // Create directory
  let result = exec(`docker exec ${CONTAINER_NAME} mkdir -p ${PROJECT_PATH}`);
  if (!result.success) {
    console.error(`❌ Failed to create directory: ${result.error}`);
    return false;
  }

  // Create CLAUDE.md using base64 encoding to safely pass content
  const base64Content = Buffer.from(TEST_INSTRUCTIONS).toString('base64');
  result = exec(`docker exec ${CONTAINER_NAME} sh -c "echo '${base64Content}' | base64 -d > ${PROJECT_PATH}/CLAUDE.md"`);
  if (!result.success) {
    console.error(`❌ Failed to create CLAUDE.md: ${result.error}`);
    return false;
  }

  // Create test.txt
  result = exec(`docker exec ${CONTAINER_NAME} sh -c "echo 'This is a test file.' > ${PROJECT_PATH}/test.txt"`);
  if (!result.success) {
    console.error(`❌ Failed to create test.txt: ${result.error}`);
    return false;
  }

  // Verify CLAUDE.md was created with correct content
  const verify = exec(`docker exec ${CONTAINER_NAME} cat ${PROJECT_PATH}/CLAUDE.md`);
  if (verify.success && verify.output.includes('🤖')) {
    console.log('✅ Test project created');
    console.log('\nCLAUDE.md contents:');
    console.log('-'.repeat(80));
    console.log(verify.output);
    console.log('-'.repeat(80));
  } else {
    console.error('❌ Failed to verify CLAUDE.md content');
    console.error('Content:', verify.output);
    return false;
  }

  console.log();
  return true;
}

/**
 * Test different Claude Code invocation methods
 */
function runTests() {
  const tests = [
    {
      name: 'Test 1: Direct docker exec with -w flag and -p for non-interactive',
      description: 'Run claude from project directory using -w flag with -p prompt',
      command: `docker exec -w ${PROJECT_PATH} ${CONTAINER_NAME} claude -p "${TEST_PROMPT}"`,
      expectedMarker: '🤖 Project demo1 -'
    },
    {
      name: 'Test 2: Change directory before running claude with -p',
      description: 'Use cd && claude -p pattern',
      command: `docker exec ${CONTAINER_NAME} sh -c "cd ${PROJECT_PATH} && claude -p '${TEST_PROMPT}'"`,
      expectedMarker: '🤖 Project demo1 -'
    },
    {
      name: 'Test 3: Using --print flag (alternative to -p)',
      description: 'Use --print instead of -p',
      command: `docker exec -w ${PROJECT_PATH} ${CONTAINER_NAME} claude --print "${TEST_PROMPT}"`,
      expectedMarker: '🤖 Project demo1 -'
    },
    {
      name: 'Test 4: With explicit model and permission mode',
      description: 'Add --model and --permission-mode flags',
      command: `docker exec -w ${PROJECT_PATH} ${CONTAINER_NAME} claude -p "${TEST_PROMPT}" --model sonnet --permission-mode acceptAll`,
      expectedMarker: '🤖 Project demo1 -'
    },
    {
      name: 'Test 5: With output format json',
      description: 'Request JSON output format',
      command: `docker exec -w ${PROJECT_PATH} ${CONTAINER_NAME} claude -p "${TEST_PROMPT}" --output-format json`,
      expectedMarker: '🤖 Project demo1 -'
    },
    {
      name: 'Test 6: Check if claude is available',
      description: 'Verify claude command exists',
      command: `docker exec ${CONTAINER_NAME} which claude`,
      expectedMarker: 'claude'
    },
    {
      name: 'Test 7: Check claude version',
      description: 'Get Claude Code version',
      command: `docker exec ${CONTAINER_NAME} claude --version`,
      expectedMarker: ''
    },
    {
      name: 'Test 8: Check API key configuration',
      description: 'Verify if ANTHROPIC_API_KEY is set',
      command: `docker exec ${CONTAINER_NAME} sh -c "if [ -n \\"\\$ANTHROPIC_API_KEY\\" ]; then echo 'API key is set'; else echo 'API key NOT set'; fi"`,
      expectedMarker: 'API key'
    },
    {
      name: 'Test 9: Check Claude config directory',
      description: 'Check if ~/.claude directory exists',
      command: `docker exec ${CONTAINER_NAME} ls -la /home/node/.claude`,
      expectedMarker: ''
    },
    {
      name: 'Test 10: Test with environment variable for API key',
      description: 'Pass ANTHROPIC_API_KEY via environment if not set',
      command: `docker exec -w ${PROJECT_PATH} -e ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY:-test-key} ${CONTAINER_NAME} claude -p "${TEST_PROMPT}"`,
      expectedMarker: '🤖 Project demo1 -'
    }
  ];

  const results = [];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${test.name}`);
    console.log(`${test.description}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Command: ${test.command}`);
    console.log();
    console.log('Running test...');

    const result = exec(test.command, { timeout: 60000 });

    const testResult = {
      testName: test.name,
      command: test.command,
      success: result.success,
      foundMarker: false,
      output: result.output || '',
      error: result.error || ''
    };

    if (result.success) {
      testResult.foundMarker = result.output.includes(test.expectedMarker);

      if (testResult.foundMarker) {
        console.log('✅ SUCCESS: Found expected marker in response!');
        console.log(`\nResponse preview (first 800 chars):`);
        console.log('-'.repeat(80));
        console.log(result.output.substring(0, 800));
        if (result.output.length > 800) console.log('...');
        console.log('-'.repeat(80));
      } else {
        console.log('⚠️  PARTIAL: Command succeeded but marker not found');
        console.log(`\nFull output (first 1000 chars):`);
        console.log('-'.repeat(80));
        console.log(result.output.substring(0, 1000));
        if (result.output.length > 1000) console.log('...');
        console.log('-'.repeat(80));
      }
    } else {
      console.log('❌ FAILED: Command execution failed');
      console.log(`\nSTDOUT (first 500 chars):`);
      console.log('-'.repeat(80));
      console.log(result.output.substring(0, 500) || '(empty)');
      console.log('-'.repeat(80));
      console.log(`\nSTDERR (first 500 chars):`);
      console.log('-'.repeat(80));
      console.log(result.error.substring(0, 500) || '(empty)');
      console.log('-'.repeat(80));
    }

    results.push(testResult);
  }

  return results;
}

/**
 * Display summary of all test results
 */
function displaySummary(results) {
  console.log('\n\n');
  console.log('='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log();

  results.forEach((result, index) => {
    const status = result.foundMarker ? '✅ PASS' :
                   result.success ? '⚠️  PARTIAL' : '❌ FAIL';
    console.log(`${status} - ${result.testName}`);
  });

  console.log();
  console.log('='.repeat(80));

  const passedTests = results.filter(r => r.foundMarker);
  if (passedTests.length > 0) {
    console.log('\n✅ RECOMMENDED CONFIGURATION:');
    console.log('\nCommand that successfully loaded CLAUDE.md:');
    console.log('-'.repeat(80));
    console.log(passedTests[0].command);
    console.log('-'.repeat(80));
    console.log('\nThis configuration successfully loaded CLAUDE.md from the project directory.');
  } else {
    console.log('\n⚠️  No test successfully loaded CLAUDE.md');
    console.log('\nPossible issues to investigate:');
    console.log('1. Claude Code may require API authentication (ANTHROPIC_API_KEY)');
    console.log('2. CLAUDE.md might not be read in non-interactive mode');
    console.log('3. Different command-line flags may be needed');
    console.log('4. Claude Code version may not support this feature');
    console.log('\nCheck the test output above for specific error messages.');

    // Show diagnostic results
    const diagnosticTests = results.filter(r =>
      r.testName.includes('Check') || r.testName.includes('version')
    );
    if (diagnosticTests.length > 0) {
      console.log('\n📊 DIAGNOSTIC INFO:');
      diagnosticTests.forEach(test => {
        if (test.success && test.output) {
          console.log(`\n${test.testName}:`);
          console.log(test.output.trim().substring(0, 200));
        }
      });
    }
  }
  console.log();
}

/**
 * Cleanup test project
 */
function cleanup() {
  console.log('\n🧹 Cleaning up test project...');
  const result = exec(`docker exec ${CONTAINER_NAME} rm -rf ${PROJECT_PATH}`);
  if (result.success) {
    console.log('✅ Cleanup complete');
  } else {
    console.log('⚠️  Cleanup may have failed');
  }
}

/**
 * Main execution
 */
function main() {
  console.log(`Container: ${CONTAINER_NAME}`);
  console.log(`Project: ${TEST_PROJECT}`);
  console.log(`Path: ${PROJECT_PATH}`);
  console.log();

  // Check if container is running
  const containerCheck = exec(`docker ps --filter name=${CONTAINER_NAME} --format "{{.Names}}"`);
  if (!containerCheck.success || !containerCheck.output.includes(CONTAINER_NAME)) {
    console.error('❌ Container not running or not found');
    console.error(`Please ensure container "${CONTAINER_NAME}" is running`);
    process.exit(1);
  }

  // Setup test project
  if (!setupTestProject()) {
    console.error('❌ Failed to setup test project');
    process.exit(1);
  }

  // Run tests
  const results = runTests();

  // Display summary
  displaySummary(results);

  // Cleanup
  cleanup();
}

// Run the script
main();
