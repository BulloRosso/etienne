/**
 * A2A Connection Test
 *
 * Tests connectivity to the local A2A test server running on port 5600.
 * Run with: npx tsx src/a2a-client/tests/test-a2a-connection.ts
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const TEST_SERVER_URL = 'http://localhost:5600';

interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  skills?: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

interface MessageSendParams {
  message: {
    messageId: string;
    role: 'user';
    kind: 'message';
    parts: Array<{ kind: 'text'; text: string }>;
  };
  configuration?: {
    blocking?: boolean;
  };
}

async function testAgentCardFetch(): Promise<AgentCard> {
  console.log('\n📋 Testing Agent Card Fetch...');
  console.log(`   URL: ${TEST_SERVER_URL}/.well-known/agent-card.json`);

  const response = await axios.get<AgentCard>(
    `${TEST_SERVER_URL}/.well-known/agent-card.json`,
    { timeout: 5000 }
  );

  console.log('   ✅ Agent Card fetched successfully');
  console.log(`   Agent: ${response.data.name} (v${response.data.version})`);
  console.log(`   Description: ${response.data.description}`);

  if (response.data.skills && response.data.skills.length > 0) {
    console.log(`   Skills:`);
    for (const skill of response.data.skills) {
      console.log(`     - ${skill.name}: ${skill.description}`);
    }
  }

  return response.data;
}

async function testHealthCheck(): Promise<void> {
  console.log('\n🏥 Testing Health Check...');
  console.log(`   URL: ${TEST_SERVER_URL}/health`);

  const response = await axios.get(`${TEST_SERVER_URL}/health`, { timeout: 5000 });

  console.log('   ✅ Health check passed');
  console.log(`   Status: ${response.data.status}`);
}

async function testSendMessage(prompt: string): Promise<void> {
  console.log('\n📨 Testing Message Send...');
  console.log(`   URL: ${TEST_SERVER_URL}/a2a`);
  console.log(`   Prompt: "${prompt}"`);

  const params: MessageSendParams = {
    message: {
      messageId: uuidv4(),
      role: 'user',
      kind: 'message',
      parts: [{ kind: 'text', text: prompt }],
    },
    configuration: {
      blocking: true,
    },
  };

  const response = await axios.post(`${TEST_SERVER_URL}/a2a`, params, {
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if ('error' in response.data) {
    console.log('   ❌ Error response received');
    console.log(`   Error: ${JSON.stringify(response.data.error)}`);
    return;
  }

  console.log('   ✅ Message sent successfully');
  const result = response.data.result;

  if (result.kind === 'task') {
    console.log(`   Task ID: ${result.id}`);
    console.log(`   Status: ${result.status.state}`);

    // Extract text from status message or artifacts
    if (result.status.message) {
      const textParts = result.status.message.parts.filter(
        (p: any) => p.kind === 'text'
      );
      if (textParts.length > 0) {
        console.log(`   Response:`);
        console.log(`   ${textParts.map((p: any) => p.text).join('\n')}`);
      }
    }

    if (result.artifacts && result.artifacts.length > 0) {
      console.log(`   Artifacts: ${result.artifacts.length}`);
    }
  } else {
    console.log(`   Direct message response`);
    const textParts = result.parts.filter((p: any) => p.kind === 'text');
    if (textParts.length > 0) {
      console.log(`   Response: ${textParts.map((p: any) => p.text).join('\n')}`);
    }
  }
}

async function runAllTests(): Promise<void> {
  console.log('='.repeat(60));
  console.log('A2A Connection Test Suite');
  console.log(`Target Server: ${TEST_SERVER_URL}`);
  console.log('='.repeat(60));

  try {
    // Test 1: Health check
    await testHealthCheck();

    // Test 2: Fetch agent card
    const agentCard = await testAgentCardFetch();

    // Test 3: Send a greeting
    await testSendMessage('Hello! Can you introduce yourself?');

    // Test 4: Test analyze skill
    await testSendMessage('Please analyze this text: The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet.');

    // Test 5: Test summarize skill
    await testSendMessage('Summarize: The A2A protocol enables agents to communicate with each other in a standardized way, allowing for seamless integration and collaboration between different AI systems.');

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed successfully!');
    console.log('='.repeat(60));
  } catch (error: any) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ Test failed!');
    if (error.code === 'ECONNREFUSED') {
      console.log(`   The A2A test server is not running.`);
      console.log(`   Start it with: cd a2a-server && npm run dev`);
    } else {
      console.log(`   Error: ${error.message}`);
    }
    console.log('='.repeat(60));
    process.exit(1);
  }
}

// Run tests
runAllTests();
