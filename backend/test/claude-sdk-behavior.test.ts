/**
 * Isolated Test: Claude Agent SDK Message Structure Validation
 *
 * Purpose: Verify what the Claude Agent SDK actually returns in its messages,
 * particularly focusing on:
 * 1. Session init messages and model field
 * 2. Result messages and usage.model field
 * 3. Message structure throughout the conversation
 *
 * This test captures real SDK output to diagnose the "model: n/a" issue.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface CapturedMessage {
  type: string;
  subtype?: string;
  session_id?: string;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    model?: string;
  };
  timestamp: string;
  rawMessage: any;
}

class SdkMessageCapture {
  private messages: CapturedMessage[] = [];
  private testWorkspace: string;

  constructor() {
    // Create isolated test workspace
    this.testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-sdk-test-'));
  }

  async runTest() {
    console.log('🧪 Starting Claude Agent SDK Message Structure Test');
    console.log(`📁 Test workspace: ${this.testWorkspace}`);
    console.log('─'.repeat(80));

    try {
      // Test 1: Simple query to capture message flow using async iterator
      console.log('\n📝 Test 1: Running simple query to capture message structure...\n');

      const stream = query({
        prompt: 'What is 2 + 2? Just give a brief answer.',
        options: {
          cwd: this.testWorkspace,
          model: 'claude-sonnet-4-5',
          maxTurns: 1,
          includePartialMessages: true
        }
      });

      let finalResult: any = null;

      // Use async iterator pattern (same as backend implementation)
      for await (const message of stream) {
        // Capture every message for analysis
        this.captureMessage(message);

        // Track the final result
        if (message.type === 'result') {
          finalResult = message;
        }
      }

      console.log('─'.repeat(80));
      console.log('\n✅ Query completed successfully');
      console.log(`📄 Result: ${finalResult?.result?.substring(0, 100) ?? 'N/A'}...`);

      if (finalResult?.usage) {
        console.log(`\n📊 Final Result Usage Object:`);
        console.log(`   - input_tokens: ${finalResult.usage.input_tokens}`);
        console.log(`   - output_tokens: ${finalResult.usage.output_tokens}`);
        console.log(`   - model: ${finalResult.usage.model ?? '❌ NOT PROVIDED'}`);
      }

      if (finalResult?.total_cost_usd) {
        console.log(`\n💰 Total Cost: $${finalResult.total_cost_usd}`);
      }

      // Analyze captured messages
      this.analyzeMessages();

      // Save raw data for inspection
      this.saveRawData();

      return this.generateReport();

    } catch (error) {
      console.error('❌ Test failed:', error);
      throw error;
    } finally {
      this.cleanup();
    }
  }

  private captureMessage(message: any) {
    const captured: CapturedMessage = {
      type: message.type,
      subtype: message.subtype,
      session_id: message.session_id,
      model: message.model,
      usage: message.usage,
      timestamp: new Date().toISOString(),
      rawMessage: JSON.parse(JSON.stringify(message)) // Deep clone
    };

    this.messages.push(captured);

    // Real-time logging for key message types
    if (message.type === 'system' && message.subtype === 'init') {
      console.log(`\n🔵 SESSION INIT MESSAGE RECEIVED:`);
      console.log(`   - session_id: ${message.session_id}`);
      console.log(`   - model: ${message.model ?? '❌ NOT PROVIDED'}`);
    }

    if (message.type === 'result') {
      console.log(`\n🟢 RESULT MESSAGE RECEIVED:`);
      console.log(`   - subtype: ${message.subtype}`);
      if (message.usage) {
        console.log(`   - usage.input_tokens: ${message.usage.input_tokens}`);
        console.log(`   - usage.output_tokens: ${message.usage.output_tokens}`);
        console.log(`   - usage.model: ${message.usage.model ?? '❌ NOT PROVIDED'}`);
      } else {
        console.log(`   - usage: ❌ NOT PROVIDED`);
      }
    }

    if (message.type === 'assistant' && message.usage) {
      console.log(`\n🟡 ASSISTANT MESSAGE WITH USAGE:`);
      console.log(`   - message.id: ${message.id}`);
      console.log(`   - usage.input_tokens: ${message.usage.input_tokens}`);
      console.log(`   - usage.output_tokens: ${message.usage.output_tokens}`);
      console.log(`   - usage.model: ${message.usage.model ?? '❌ NOT PROVIDED'}`);
    }
  }

  private analyzeMessages() {
    console.log('\n' + '═'.repeat(80));
    console.log('📋 MESSAGE ANALYSIS REPORT');
    console.log('═'.repeat(80));

    // Count message types
    const typeCounts = new Map<string, number>();
    this.messages.forEach(msg => {
      const key = msg.subtype ? `${msg.type}:${msg.subtype}` : msg.type;
      typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
    });

    console.log('\n📊 Message Type Counts:');
    typeCounts.forEach((count, type) => {
      console.log(`   - ${type}: ${count}`);
    });

    // Find session init messages
    const sessionInits = this.messages.filter(m =>
      m.type === 'system' && m.subtype === 'init'
    );

    console.log(`\n🔍 Session Init Messages: ${sessionInits.length}`);
    sessionInits.forEach((msg, idx) => {
      console.log(`   ${idx + 1}. session_id: ${msg.session_id}`);
      console.log(`      model: ${msg.model ?? '❌ NOT PROVIDED'}`);
    });

    // Find result messages with usage
    const resultMessages = this.messages.filter(m =>
      m.type === 'result' && m.usage
    );

    console.log(`\n🔍 Result Messages with Usage: ${resultMessages.length}`);
    resultMessages.forEach((msg, idx) => {
      console.log(`   ${idx + 1}. subtype: ${msg.subtype}`);
      console.log(`      usage.model: ${msg.usage?.model ?? '❌ NOT PROVIDED'}`);
    });

    // Find assistant messages with usage
    const assistantMessages = this.messages.filter(m =>
      m.type === 'assistant' && m.usage
    );

    console.log(`\n🔍 Assistant Messages with Usage: ${assistantMessages.length}`);
    assistantMessages.forEach((msg, idx) => {
      console.log(`   ${idx + 1}. usage.model: ${msg.usage?.model ?? '❌ NOT PROVIDED'}`);
    });

    // Check for model field in ANY message
    const messagesWithModel = this.messages.filter(m => m.model);
    console.log(`\n🔍 Messages with 'model' field: ${messagesWithModel.length}`);

    const messagesWithUsageModel = this.messages.filter(m => m.usage?.model);
    console.log(`🔍 Messages with 'usage.model' field: ${messagesWithUsageModel.length}`);
  }

  private generateReport(): {
    hasSessionModel: boolean;
    hasUsageModel: boolean;
    sessionModel?: string;
    usageModel?: string;
    recommendation: string;
  } {
    const sessionInit = this.messages.find(m =>
      m.type === 'system' && m.subtype === 'init'
    );

    const resultWithUsage = this.messages.find(m =>
      m.type === 'result' && m.usage
    );

    const hasSessionModel = !!sessionInit?.model;
    const hasUsageModel = !!resultWithUsage?.usage?.model;

    let recommendation: string;

    if (hasSessionModel && hasUsageModel) {
      recommendation = 'BOTH_AVAILABLE: Use either session.model or usage.model';
    } else if (hasSessionModel && !hasUsageModel) {
      recommendation = 'SESSION_ONLY: Capture model from session init and inject into usage events';
    } else if (!hasSessionModel && hasUsageModel) {
      recommendation = 'USAGE_ONLY: Current extraction should work, check persistence layer';
    } else {
      recommendation = 'NONE_AVAILABLE: Remove model display feature from frontend';
    }

    console.log('\n' + '═'.repeat(80));
    console.log('🎯 DIAGNOSTIC CONCLUSION');
    console.log('═'.repeat(80));
    console.log(`\n✓ Session Init has 'model' field: ${hasSessionModel ? '✅ YES' : '❌ NO'}`);
    console.log(`✓ Result Usage has 'model' field: ${hasUsageModel ? '✅ YES' : '❌ NO'}`);
    console.log(`\n💡 Recommendation: ${recommendation}`);

    if (hasSessionModel) {
      console.log(`\n📌 Session Model Value: "${sessionInit?.model}"`);
    }
    if (hasUsageModel) {
      console.log(`📌 Usage Model Value: "${resultWithUsage?.usage?.model}"`);
    }

    return {
      hasSessionModel,
      hasUsageModel,
      sessionModel: sessionInit?.model,
      usageModel: resultWithUsage?.usage?.model,
      recommendation
    };
  }

  private saveRawData() {
    const outputPath = path.join(__dirname, 'sdk-messages-capture.json');
    fs.writeFileSync(
      outputPath,
      JSON.stringify(this.messages, null, 2),
      'utf-8'
    );
    console.log(`\n💾 Raw message data saved to: ${outputPath}`);
  }

  private cleanup() {
    try {
      if (fs.existsSync(this.testWorkspace)) {
        fs.rmSync(this.testWorkspace, { recursive: true, force: true });
        console.log(`\n🧹 Cleaned up test workspace`);
      }
    } catch (error) {
      console.warn('Warning: Failed to cleanup test workspace:', error);
    }
  }
}

// Run the test if executed directly
if (require.main === module) {
  const tester = new SdkMessageCapture();
  tester.runTest()
    .then((report) => {
      console.log('\n✅ Test completed successfully\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}

export { SdkMessageCapture };
