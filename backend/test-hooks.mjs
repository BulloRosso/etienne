import { query } from '@anthropic-ai/claude-agent-sdk';

console.log('Testing Agent SDK hooks...\n');

const hooks = {
  PreToolUse: [
    {
      matcher: () => true,
      callback: async (input) => {
        console.log(`✅ PreToolUse hook called: ${input.tool_name}`);
        return { continue: true };
      }
    }
  ],
  PostToolUse: [
    {
      matcher: () => true,
      callback: async (input) => {
        console.log(`✅ PostToolUse hook called: ${input.tool_name}`);
        return { continue: true };
      }
    }
  ]
};

const options = {
  model: 'claude-sonnet-4-5',
  apiKey: process.env.ANTHROPIC_API_KEY,
  cwd: 'C:\\Data\\GitHub\\claude-multitenant\\workspace\\pet-store',
  permissionMode: 'bypassPermissions',
  maxTurns: 2,
  hooks
};

console.log('Hooks configured:', !!hooks);
console.log('Options keys:', Object.keys(options).join(', '));
console.log('Hooks in options:', !!options.hooks);
console.log('\nStarting query...\n');

try {
  for await (const message of query({
    prompt: 'Create a simple test.txt file with the word "hello"',
    options
  })) {
    if (message.type === 'system' && message.subtype === 'init') {
      console.log('Session initialized');
    }
  }
  console.log('\nQuery completed');
} catch (error) {
  console.error('Error:', error.message);
}
