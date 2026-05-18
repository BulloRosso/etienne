#!/usr/bin/env node
/**
 * Ordered runner for the Engineering Design Support System integration suite.
 *
 * The repo has no CI and no test framework; this is the "run everything in
 * order" substitute the test README describes. Each test auto-SKIPs when its
 * services are down, so this is safe to run in any loop. Exit code is
 * non-zero if any test FAILs (a SKIP is not a failure).
 *
 *   cd backend && node test/run-ds-integration.mjs
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Order matters: dependency-edge tests first, then the keystone, then
// report/critic, then the seed smoke (which depends on a seeded project).
const TESTS = [
  'integration-ds-relevance-propagation.test.ts',
  'integration-ds-focus-budget.test.ts',
  'integration-ds-scrapbook-mirror.test.ts',
  'integration-ds-hypothesis-lifecycle.test.ts',
  'integration-ds-cascade-on-refutation.test.ts',
  'integration-ds-mission-derivation.test.ts',
  'integration-ds-report-snapshot.test.ts',
  'integration-ds-critic-push.test.ts',
  'integration-ds-seed-smoke.test.ts',
];

let pass = 0;
let skip = 0;
let fail = 0;
const failed = [];

for (const t of TESTS) {
  console.log(`\n\x1b[1m=== ${t} ===\x1b[0m`);
  const r = spawnSync('npx', ['tsx', join(here, t)], {
    stdio: 'pipe',
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out);
  if (r.status !== 0) {
    fail += 1;
    failed.push(t);
  } else if (/^SKIP /m.test(out) && !/ PASS /.test(out)) {
    skip += 1;
  } else {
    pass += 1;
  }
}

console.log(
  `\n\x1b[1m── design-support integration summary ──\x1b[0m\n` +
    `  \x1b[32mPASS ${pass}\x1b[0m   \x1b[33mSKIP ${skip}\x1b[0m   \x1b[31mFAIL ${fail}\x1b[0m`,
);
if (failed.length) {
  console.log(`  failed: ${failed.join(', ')}`);
  process.exit(1);
}
process.exit(0);
