import { existsSync } from 'fs';
import { mkdir, writeFile, chmod } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const OPENBAO_VERSION = '2.1.0';
const DEV_ROOT_TOKEN = process.env.OPENBAO_DEV_ROOT_TOKEN || 'dev-root-token';
const LISTEN_ADDRESS = process.env.OPENBAO_LISTEN_ADDRESS || '0.0.0.0:8200';

function getPlatformInfo(): { os: string; arch: string; ext: string } {
  const platform = process.platform;
  const arch = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : 'amd64';

  if (platform === 'win32') return { os: 'windows', arch, ext: '.exe' };
  if (platform === 'darwin') return { os: 'darwin', arch, ext: '' };
  return { os: 'linux', arch, ext: '' };
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;

    const request = (reqUrl: string) => {
      protocol.get(reqUrl, (response) => {
        // Follow redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            request(redirectUrl);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        require('fs').unlinkSync(dest);
        reject(err);
      });
    };

    request(url);
  });
}

async function ensureBinary(): Promise<string> {
  const { os, arch, ext } = getPlatformInfo();
  const binDir = join(ROOT, 'bin');
  const binaryPath = join(binDir, `openbao${ext}`);

  if (existsSync(binaryPath)) {
    console.log(`OpenBao binary found at ${binaryPath}`);
    return binaryPath;
  }

  console.log(`OpenBao binary not found. Downloading v${OPENBAO_VERSION} for ${os}/${arch}...`);

  if (!existsSync(binDir)) {
    await mkdir(binDir, { recursive: true });
  }

  // OpenBao releases are zip files; download the binary directly from GitHub releases
  const downloadUrl = `https://github.com/openbao/openbao/releases/download/v${OPENBAO_VERSION}/bao_${OPENBAO_VERSION}_${os}_${arch}${ext}`;

  console.log(`Downloading from: ${downloadUrl}`);
  await downloadFile(downloadUrl, binaryPath);

  // Make executable on Unix
  if (os !== 'windows') {
    await chmod(binaryPath, 0o755);
  }

  console.log(`OpenBao binary downloaded to ${binaryPath}`);
  return binaryPath;
}

async function waitForReady(maxAttempts = 30): Promise<boolean> {
  const port = LISTEN_ADDRESS.split(':')[1] || '8200';
  const healthUrl = `http://127.0.0.1:${port}/v1/sys/health`;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok || response.status === 200 || response.status === 501) {
        // 501 = not initialized (dev mode auto-initializes, but briefly returns 501)
        return true;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function enableKvEngine(port: string): Promise<void> {
  // In dev mode, the KV v2 engine is mounted at secret/ by default
  // Verify it's available
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/sys/mounts`, {
      headers: { 'X-Vault-Token': DEV_ROOT_TOKEN },
    });
    if (response.ok) {
      const data = await response.json() as Record<string, unknown>;
      if (data['secret/']) {
        console.log('KV v2 secrets engine already mounted at secret/');
      } else {
        console.log('Mounting KV v2 secrets engine at secret/...');
        await fetch(`http://127.0.0.1:${port}/v1/sys/mounts/secret`, {
          method: 'POST',
          headers: {
            'X-Vault-Token': DEV_ROOT_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ type: 'kv', options: { version: '2' } }),
        });
      }
    }
  } catch (err) {
    console.warn('Could not verify KV engine mount:', err);
  }
}

async function main() {
  let binaryPath: string;

  try {
    binaryPath = await ensureBinary();
  } catch (err) {
    console.error('Failed to download OpenBao binary:', err);
    console.error('Please download it manually from https://github.com/openbao/openbao/releases');
    console.error(`Place the binary at: ${join(ROOT, 'bin', 'openbao')}`);
    process.exit(1);
  }

  const port = LISTEN_ADDRESS.split(':')[1] || '8200';

  console.log(`Starting OpenBao in dev mode on ${LISTEN_ADDRESS}...`);
  console.log(`Dev root token: ${DEV_ROOT_TOKEN}`);

  const args = [
    'server',
    '-dev',
    `-dev-root-token-id=${DEV_ROOT_TOKEN}`,
    `-dev-listen-address=${LISTEN_ADDRESS}`,
  ];

  const child: ChildProcess = spawn(binaryPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  child.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(`[openbao] ${data.toString()}`);
  });

  child.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[openbao] ${data.toString()}`);
  });

  child.on('error', (err) => {
    console.error('Failed to start OpenBao:', err);
    process.exit(1);
  });

  child.on('exit', (code) => {
    console.log(`OpenBao exited with code ${code}`);
    process.exit(code ?? 1);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down OpenBao...');
    child.kill('SIGTERM');
    setTimeout(() => {
      child.kill('SIGKILL');
      process.exit(0);
    }, 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Wait for OpenBao to be ready
  console.log('Waiting for OpenBao to become ready...');
  const ready = await waitForReady();

  if (ready) {
    console.log(`OpenBao is ready at http://127.0.0.1:${port}`);
    await enableKvEngine(port);
    console.log('Secrets Manager is running. Press Ctrl+C to stop.');
  } else {
    console.error('OpenBao failed to start within timeout period.');
    child.kill('SIGTERM');
    process.exit(1);
  }
}

main();
