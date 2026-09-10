/**
 * Unit test for AZURE_AI_CONNECTION parsing / env projection.
 *
 * Validates:
 *   - unset / blank → null (existing env wiring untouched)
 *   - bare URL and bare resource-name shorthands
 *   - key=value grammar, case-insensitive keys, values containing '='
 *   - portal-paste tolerance (trailing /anthropic/v1, /messages, slashes)
 *   - managed-identity vs api-key credential projection
 *   - deployment-name overrides + tier aliasing
 *   - apply() never overwrites an explicitly-set env var
 *   - malformed input throws rather than silently falling back
 *
 * Run with: tsx test/azure-ai-connection.test.ts
 */

import { strict as assert } from 'node:assert';

import {
  applyAzureAiConnection,
  parseAzureAiConnection,
} from '../src/azure-ai/azure-ai-connection';

let checks = 0;
function check(label: string, fn: () => void): void {
  fn();
  checks++;
  console.log(`  ok ${label}`);
}

async function main(): Promise<void> {
  console.log('# parse');

  check('unset → null', () => {
    assert.equal(parseAzureAiConnection(undefined), null);
    assert.equal(parseAzureAiConnection(''), null);
    assert.equal(parseAzureAiConnection('   '), null);
  });

  check('bare URL shorthand', () => {
    const c = parseAzureAiConnection('https://etienne-ai.services.ai.azure.com')!;
    assert.equal(c.endpoint, 'https://etienne-ai.services.ai.azure.com');
    assert.equal(c.baseUrl, 'https://etienne-ai.services.ai.azure.com/anthropic/v1');
    assert.equal(c.credential, 'managedidentity');
    assert.equal(c.models.opus, 'claude-opus-5');
    assert.equal(c.models.sonnet, 'claude-sonnet-5');
    assert.equal(c.models.haiku, 'claude-haiku-4-5');
  });

  check('bare resource-name shorthand', () => {
    const c = parseAzureAiConnection('etienne-ai')!;
    assert.equal(c.baseUrl, 'https://etienne-ai.services.ai.azure.com/anthropic/v1');
  });

  check('portal-paste suffixes are stripped', () => {
    for (const raw of [
      'https://x.services.ai.azure.com/anthropic/v1',
      'https://x.services.ai.azure.com/anthropic/v1/messages',
      'https://x.services.ai.azure.com///',
    ]) {
      const c = parseAzureAiConnection(raw)!;
      assert.equal(c.baseUrl, 'https://x.services.ai.azure.com/anthropic/v1', raw);
    }
  });

  check('key=value grammar, case-insensitive keys', () => {
    const c = parseAzureAiConnection(
      'ENDPOINT=https://x.services.ai.azure.com; credential = ManagedIdentity ;ClientId=abc-123',
    )!;
    assert.equal(c.endpoint, 'https://x.services.ai.azure.com');
    assert.equal(c.credential, 'managedidentity');
    assert.equal(c.clientId, 'abc-123');
  });

  check('only the first = splits (secrets contain =)', () => {
    const c = parseAzureAiConnection(
      'Endpoint=https://x.services.ai.azure.com;Credential=ApiKey;ApiKey=aGVsbG8=world==',
    )!;
    assert.equal(c.credential, 'apikey');
    assert.equal(c.apiKey, 'aGVsbG8=world==');
  });

  check('deployment-name overrides', () => {
    const c = parseAzureAiConnection(
      'Endpoint=x;Opus=my-opus-dep;Sonnet=my-sonnet-dep;Haiku=my-haiku-dep',
    )!;
    assert.deepEqual(c.models, {
      opus: 'my-opus-dep',
      sonnet: 'my-sonnet-dep',
      haiku: 'my-haiku-dep',
    });
    // Tiers default to haiku (small) / sonnet (regular) and follow the overrides.
    assert.deepEqual(c.tiers, { small: 'my-haiku-dep', regular: 'my-sonnet-dep' });
  });

  check('tier aliasing by family name and by explicit deployment', () => {
    const byFamily = parseAzureAiConnection('Endpoint=x;Small=sonnet;Regular=opus')!;
    assert.deepEqual(byFamily.tiers, { small: 'claude-sonnet-5', regular: 'claude-opus-5' });

    const explicit = parseAzureAiConnection('Endpoint=x;RegularModel=some-custom-deployment')!;
    assert.equal(explicit.tiers.regular, 'some-custom-deployment');
    assert.equal(explicit.tiers.small, 'claude-haiku-4-5');
  });

  check('malformed input throws', () => {
    assert.throws(
      () => parseAzureAiConnection('Credential=ManagedIdentity;ClientId=abc'),
      /no Endpoint=/,
    );
    assert.throws(
      () => parseAzureAiConnection('Endpoint=https://x.services.ai.azure.com;Credential=ApiKey'),
      /no ApiKey=/,
    );
    assert.throws(() => parseAzureAiConnection('Endpoint=http://'), /not a valid URL/);
  });

  console.log('# apply');

  check('managed identity projection', () => {
    const env: NodeJS.ProcessEnv = {
      AZURE_AI_CONNECTION:
        'Endpoint=https://x.services.ai.azure.com;Credential=ManagedIdentity;ClientId=mi-1',
    };
    const result = applyAzureAiConnection(env)!;
    assert.equal(env.AZURE_AI_ENDPOINT, 'https://x.services.ai.azure.com/anthropic/v1');
    assert.equal(env.ANTHROPIC_FOUNDRY_RESOURCE, 'https://x.services.ai.azure.com/anthropic/v1');
    assert.equal(env.AZURE_FOUNDRY_AGENT_ID, 'azure-ai-connection');
    assert.equal(env.AZURE_CLIENT_ID, 'mi-1');
    assert.equal(env.ANTHROPIC_MODELS, 'claude-haiku-4-5,claude-sonnet-5');
    assert.equal(env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'claude-opus-5');
    assert.equal(env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'claude-sonnet-5');
    assert.equal(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'claude-haiku-4-5');
    assert.equal(env.CLAUDE_CODE_SUBAGENT_MODEL, 'claude-sonnet-5');
    assert.equal(env.AZURE_AI_SCOPE, 'https://cognitiveservices.azure.com/.default');
    // No static-key path when using managed identity.
    assert.equal(env.CLAUDE_CODE_USE_FOUNDRY, undefined);
    assert.equal(env.ANTHROPIC_FOUNDRY_API_KEY, undefined);
    // Summary must not leak a secret.
    assert.match(result.summary, /managed identity \(client mi-1\)/);
  });

  check('api-key projection', () => {
    const env: NodeJS.ProcessEnv = {
      AZURE_AI_CONNECTION: 'Endpoint=x;Credential=ApiKey;ApiKey=super-secret',
    };
    const result = applyAzureAiConnection(env)!;
    assert.equal(env.CLAUDE_CODE_USE_FOUNDRY, '1');
    assert.equal(env.ANTHROPIC_FOUNDRY_API_KEY, 'super-secret');
    assert.equal(env.AZURE_FOUNDRY_AGENT_ID, undefined);
    assert.ok(!result.summary.includes('super-secret'), 'summary leaked the api key');
  });

  check('explicit env vars win over the connection string', () => {
    const env: NodeJS.ProcessEnv = {
      AZURE_AI_CONNECTION: 'Endpoint=https://from-connection.services.ai.azure.com',
      AZURE_AI_ENDPOINT: 'https://operator-override/anthropic/v1',
      ANTHROPIC_MODELS: 'a,b',
    };
    applyAzureAiConnection(env);
    assert.equal(env.AZURE_AI_ENDPOINT, 'https://operator-override/anthropic/v1');
    assert.equal(env.ANTHROPIC_MODELS, 'a,b');
    // Untouched keys still get filled in.
    assert.equal(
      env.ANTHROPIC_FOUNDRY_RESOURCE,
      'https://from-connection.services.ai.azure.com/anthropic/v1',
    );
  });

  check('apply() is a no-op when the variable is unset', () => {
    const env: NodeJS.ProcessEnv = {};
    assert.equal(applyAzureAiConnection(env), null);
    assert.deepEqual(Object.keys(env), []);
  });

  console.log(`\n${checks} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
