import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OPENBAO_ADDR = process.env.OPENBAO_ADDR || 'http://127.0.0.1:8200';
const DEV_ROOT_TOKEN = process.env.OPENBAO_DEV_ROOT_TOKEN || 'dev-root-token';

// Keys to migrate from .env to the secrets vault
const SENSITIVE_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'JWT_SECRET',
  'GITEA_PASSWORD',
  'SMTP_CONNECTION',
  'IMAP_CONNECTION',
  'DIFFBOT_TOKEN',
  'VAPI_TOKEN',
];

function parseEnvFile(content: string): Record<string, string> {
  const config: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      config[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
    }
  }
  return config;
}

async function seedSecret(key: string, value: string): Promise<boolean> {
  try {
    const response = await fetch(`${OPENBAO_ADDR}/v1/secret/data/${key}`, {
      method: 'POST',
      headers: {
        'X-Vault-Token': DEV_ROOT_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { value } }),
    });

    if (response.ok) {
      console.log(`  [OK] ${key}`);
      return true;
    } else {
      const body = await response.text();
      console.error(`  [FAIL] ${key}: ${response.status} ${body}`);
      return false;
    }
  } catch (err) {
    console.error(`  [ERROR] ${key}:`, err);
    return false;
  }
}

async function main() {
  // Read backend/.env
  const envPath = join(__dirname, '..', '..', 'backend', '.env');
  let envContent: string;
  try {
    envContent = readFileSync(envPath, 'utf8');
  } catch {
    console.error(`Could not read ${envPath}`);
    console.error('Make sure the backend/.env file exists.');
    process.exit(1);
  }

  const config = parseEnvFile(envContent);

  // Check OpenBao is accessible
  try {
    const health = await fetch(`${OPENBAO_ADDR}/v1/sys/health`);
    if (!health.ok && health.status !== 501) {
      console.error(`OpenBao at ${OPENBAO_ADDR} is not healthy (status ${health.status})`);
      process.exit(1);
    }
  } catch {
    console.error(`Cannot reach OpenBao at ${OPENBAO_ADDR}. Is the secrets-manager service running?`);
    process.exit(1);
  }

  console.log('Seeding secrets from backend/.env to OpenBao...\n');

  let seeded = 0;
  let skipped = 0;

  for (const key of SENSITIVE_KEYS) {
    const value = config[key];
    if (!value) {
      console.log(`  [SKIP] ${key} (not found in .env)`);
      skipped++;
      continue;
    }

    const ok = await seedSecret(key, value);
    if (ok) seeded++;
  }

  console.log(`\nDone. Seeded: ${seeded}, Skipped: ${skipped}`);
}

main();
