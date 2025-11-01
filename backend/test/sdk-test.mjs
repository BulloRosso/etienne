/**
 * SDK Migration Validation Script (ESM)
 *
 * Tests basic functionality of the Agent SDK integration
 * Run with: node test/sdk-test.mjs
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

async function validateMigration() {
  console.log('🔍 Starting Agent SDK Migration Validation\n');
  console.log('='.repeat(60));

  let sessionId;
  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Basic Query
  console.log('\n📝 Test 1: Basic query functionality');
  try {
    let foundResponse = false;
    for await (const msg of query({
      prompt: 'Say hello in one word',
      options: {
        model: 'claude-sonnet-4-5',
        maxTurns: 1
      }
    })) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        sessionId = msg.session_id;
        console.log(`   ✅ Session created: ${sessionId}`);
      }
      if (msg.type === 'result' && msg.subtype === 'success') {
        foundResponse = true;
        console.log(`   ✅ Query completed successfully`);
        console.log(`   📊 Tokens: ${msg.usage?.input_tokens} in, ${msg.usage?.output_tokens} out`);
      }
    }
    if (foundResponse) {
      testsPassed++;
      console.log('   ✅ Test 1 PASSED');
    } else {
      testsFailed++;
      console.log('   ❌ Test 1 FAILED: No response received');
    }
  } catch (error) {
    testsFailed++;
    console.log(`   ❌ Test 1 FAILED: ${error.message}`);
  }

  // Test 2: System Prompt Configuration
  console.log('\n📝 Test 2: System prompt configuration');
  try {
    let foundInit = false;
    for await (const msg of query({
      prompt: 'Respond in one word',
      options: {
        model: 'claude-sonnet-4-5',
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code'
        },
        maxTurns: 1
      }
    })) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        foundInit = true;
        console.log('   ✅ System prompt applied at initialization');
      }
      if (msg.type === 'result') {
        break;
      }
    }
    if (foundInit) {
      testsPassed++;
      console.log('   ✅ Test 2 PASSED');
    } else {
      testsFailed++;
      console.log('   ❌ Test 2 FAILED: System init not found');
    }
  } catch (error) {
    testsFailed++;
    console.log(`   ❌ Test 2 FAILED: ${error.message}`);
  }

  // Test 3: Session Resumption
  if (sessionId) {
    console.log('\n📝 Test 3: Session resumption');
    try {
      let resumed = false;
      for await (const msg of query({
        prompt: 'Continue conversation',
        options: {
          model: 'claude-sonnet-4-5',
          resume: sessionId,
          maxTurns: 1
        }
      })) {
        if (msg.type === 'result' && msg.subtype === 'success') {
          resumed = true;
          console.log('   ✅ Session resumed successfully');
        }
      }
      if (resumed) {
        testsPassed++;
        console.log('   ✅ Test 3 PASSED');
      } else {
        testsFailed++;
        console.log('   ❌ Test 3 FAILED: Session did not resume');
      }
    } catch (error) {
      testsFailed++;
      console.log(`   ❌ Test 3 FAILED: ${error.message}`);
    }
  } else {
    console.log('\n⏭️  Test 3: SKIPPED (no session ID from Test 1)');
  }

  // Test 4: Error Handling
  console.log('\n📝 Test 4: Error handling');
  try {
    let errorHandled = false;

    // Test with invalid model to trigger error
    for await (const msg of query({
      prompt: 'Test error',
      options: {
        model: 'invalid-model-name',  // Force API error
        maxTurns: 1
      }
    })) {
      console.log(`   🔍 Received: type="${msg.type}", subtype="${msg.subtype}"`);

      if (msg.type === 'result' && (msg.subtype === 'error' || msg.subtype?.startsWith('error_'))) {
        errorHandled = true;
        console.log('   ✅ Error correctly handled');
      }
    }

    if (errorHandled) {
      testsPassed++;
      console.log('   ✅ Test 4 PASSED');
    } else {
      testsFailed++;
      console.log('   ❌ Test 4 FAILED: Error not caught by SDK');
    }
  } catch (error) {
    // Catching exception is also a valid error handling test
    console.log(`   ✅ Error correctly caught: ${error.message}`);
    testsPassed++;
    console.log('   ✅ Test 4 PASSED');
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Validation Summary');
  console.log('='.repeat(60));
  console.log(`✅ Tests Passed: ${testsPassed}`);
  console.log(`❌ Tests Failed: ${testsFailed}`);
  console.log(`📈 Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);

  if (testsFailed === 0) {
    console.log('\n🎉 All validation checks passed!');
    console.log('✅ Migration is successful and SDK is working correctly.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some validation checks failed!');
    console.log('❌ Please review the errors above before deploying.');
    process.exit(1);
  }
}

// Run validation
console.log('🚀 Agent SDK Migration Validation Tool');
console.log('📦 Package: @anthropic-ai/claude-agent-sdk');
console.log('🎯 Testing core SDK functionality\n');

validateMigration().catch(error => {
  console.error('\n💥 Fatal error during validation:', error.message);
  console.error(error.stack);
  process.exit(1);
});
