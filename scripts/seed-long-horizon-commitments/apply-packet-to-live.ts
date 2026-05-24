/**
 * One-shot helper: write the Q2 2026 quarterly packet and update
 * previewDocuments on an already-seeded project, without re-running the
 * full seed. Used after adding the QuarterlyViewer to retrofit the live
 * `tanker-long-horizon` project. Safe to delete after that's verified.
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { QUARTERLY_PACKET_Q2_2026 } from './fixtures/quarterly-packet';

const PROJECT = process.argv[2] || 'tanker-long-horizon';
const root = join(
  process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace',
  PROJECT,
);
const packetRel = 'out/quarterly-packets/2026-Q2.quarterly.json';

async function main() {
  await mkdir(join(root, 'out', 'quarterly-packets'), { recursive: true });
  await writeFile(
    join(root, packetRel),
    JSON.stringify(QUARTERLY_PACKET_Q2_2026, null, 2),
    'utf8',
  );
  console.log(`packet written: ${packetRel}`);

  const uiPath = join(root, '.etienne', 'user-interface.json');
  const ui = JSON.parse(await readFile(uiPath, 'utf8'));
  const previews = Array.isArray(ui.previewDocuments)
    ? ui.previewDocuments.filter((p: string) => p !== packetRel && p !== 'documentation.md')
    : [];
  ui.previewDocuments = [packetRel, 'documentation.md', ...previews];
  await writeFile(uiPath, JSON.stringify(ui, null, 2), 'utf8');
  console.log('previewDocuments updated:', ui.previewDocuments);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
