/**
 * Integration test for the Document Creation flow.
 *
 * Covers the three real integration points wired up for the
 * "Create document from sections" feature:
 *
 *   1. The `extract_document_sections` MCP tool (group `document-analysis`),
 *      exercised over the live StreamableHTTP endpoint against the seeded
 *      document-creation-demo source documents (PDF + DOCX).
 *   2. `SkillsService.provisionTemplateSkill` — copies the shipped
 *      backend/src/skills-templates/document-creation skill into a project
 *      and is idempotent on a second call.
 *   3. The source-target.sectionmappings.json → instructions contract:
 *      the JSON shape the modal writes is the shape the skill reads, and
 *      the seeded demo file conforms to it.
 *
 * The MCP portion auto-SKIPS when the backend on :6060 is not reachable, so
 * this file is safe to run in a loop whether or not the dev server is up.
 * The SkillsService and contract portions always run (pure filesystem/logic).
 *
 * Run with:  cd backend && tsx test/integration-document-creation.test.ts
 */

import { strict as assert } from 'node:assert';
import {
  existsSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

const MCP_BASE = process.env.MCP_BASE_URL || 'http://localhost:6060';
const MCP_GROUP_URL = `${MCP_BASE}/mcp/document-analysis`;

const DEMO_PROJECT = 'document-creation-demo';
const DEMO_PDF = `${DEMO_PROJECT}/source/product-overview-en.pdf`;
const DEMO_DOCX = `${DEMO_PROJECT}/source/technical-spec-de.docx`;

let passed = 0;
let skipped = 0;

function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}
function skip(msg: string) {
  skipped += 1;
  console.log(`  SKIP  ${msg}`);
}

// Walk up from cwd to find the repo root (the dir containing `workspace/`).
function repoRoot(): string {
  let here = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (existsSync(join(here, 'workspace')) && existsSync(join(here, 'backend'))) {
      return here;
    }
    here = join(here, '..');
  }
  return join(process.cwd(), '..');
}

// ---------------------------------------------------------------------------
// Minimal StreamableHTTP MCP client (initialize → tools/call), no SDK dep.
// The backend allows unauthenticated localhost requests.
// ---------------------------------------------------------------------------

async function rpc(
  sessionId: string | null,
  body: unknown,
): Promise<{ sessionId: string | null; json: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const res = await fetch(MCP_GROUP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const newSession = res.headers.get('mcp-session-id') || sessionId;
  const text = await res.text();

  // The endpoint replies either as application/json or as an SSE stream
  // ("event: message\ndata: {...}\n\n"). Handle both.
  let json: any = null;
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    json = JSON.parse(trimmed);
  } else {
    for (const line of trimmed.split('\n')) {
      const l = line.trim();
      if (l.startsWith('data:')) {
        const payload = l.slice(5).trim();
        if (payload && payload !== '[DONE]') {
          try { json = JSON.parse(payload); } catch { /* keep scanning */ }
        }
      }
    }
  }
  return { sessionId: newSession, json };
}

async function backendReachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(MCP_BASE, { signal: ctrl.signal }).catch(() => null);
    clearTimeout(timer);
    return !!res;
  } catch {
    return false;
  }
}

async function callExtractSections(documentPath: string): Promise<any> {
  // 1. initialize
  const init = await rpc(null, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'doc-creation-int-test', version: '1.0.0' },
    },
  });
  const sessionId = init.sessionId;
  assert.ok(init.json?.result, 'initialize should return a result');

  // 2. notifications/initialized (best-effort; some servers require it)
  await rpc(sessionId, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  }).catch(() => undefined);

  // 3. tools/call
  const call = await rpc(sessionId, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'extract_document_sections',
      arguments: { document_path: documentPath },
    },
  });

  assert.ok(call.json, 'tools/call should return a JSON-RPC envelope');
  assert.ok(!call.json.error, `tools/call error: ${JSON.stringify(call.json.error)}`);

  const result = call.json.result;
  const content = result?.content;
  assert.ok(Array.isArray(content), 'tool result should carry a content array');
  const textPart = content.find((c: any) => c.type === 'text');
  assert.ok(textPart, 'tool result should include a text content part');

  let parsed: any = textPart.text;
  try { parsed = JSON.parse(parsed); } catch { /* may already be object-ish */ }

  // The MCP factory surfaces a thrown tool exception as a normal result with
  // isError:true and a JSON `{ error:true, message }` text part (it does NOT
  // use a JSON-RPC error envelope). Detect that and signal it to the caller.
  const isToolError =
    result?.isError === true ||
    (parsed && typeof parsed === 'object' && parsed.error === true);

  return { ok: !isToolError, parsed };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testMcpExtractSections(): Promise<void> {
  if (!(await backendReachable())) {
    skip(`backend not reachable at ${MCP_BASE} — MCP extract_document_sections tests skipped`);
    return;
  }

  const root = repoRoot();
  if (!existsSync(join(root, 'workspace', DEMO_PROJECT, 'source', 'product-overview-en.pdf'))) {
    skip(`seeded demo project missing at workspace/${DEMO_PROJECT} — MCP tests skipped`);
    return;
  }

  // --- English PDF ---
  const pdfRes = await callExtractSections(DEMO_PDF);
  assert.equal(pdfRes.ok, true, 'PDF extraction should not be a tool error');
  const pdf = pdfRes.parsed;
  assert.ok(pdf && typeof pdf === 'object', 'PDF extraction returns an object');
  assert.ok(pdf.source_language, 'PDF result has source_language');
  assert.equal(
    String(pdf.source_language.language_code || '').toLowerCase().startsWith('en'),
    true,
    `PDF source language should be English, got ${JSON.stringify(pdf.source_language)}`,
  );
  pass('extract_document_sections detects English for the seeded PDF');

  assert.ok(Array.isArray(pdf.sections) && pdf.sections.length > 0, 'PDF yields sections');
  for (const s of pdf.sections) {
    for (const key of ['number', 'title', 'level', 'page_start', 'text', 'image_count']) {
      assert.ok(key in s, `section is missing field "${key}"`);
    }
    assert.equal(typeof s.image_count, 'number', 'image_count is numeric');
    assert.equal(typeof s.level, 'number', 'level is numeric');
  }
  pass(`PDF produced ${pdf.sections.length} sections with the expected shape`);

  const titles = pdf.sections.map((s: any) => String(s.title).toLowerCase());
  assert.ok(
    titles.some((t: string) => t.includes('product') || t.includes('overview')),
    `expected a "Product Overview"-like section, got titles: ${titles.join(' | ')}`,
  );
  pass('PDF sections include the seeded "Product Overview" heading');

  const totalImages = pdf.sections.reduce(
    (n: number, s: any) => n + (s.image_count || 0),
    0,
  );
  assert.ok(
    totalImages >= 1,
    'the seeded PDF contains figures — image_count should detect at least one',
  );
  pass(`image-reference detection found ${totalImages} figure reference(s) in the PDF`);

  // --- German DOCX (multilingual path) ---
  const docxRes = await callExtractSections(DEMO_DOCX);
  assert.equal(docxRes.ok, true, 'DOCX extraction should not be a tool error');
  const docx = docxRes.parsed;
  assert.ok(docx?.source_language, 'DOCX result has source_language');
  assert.equal(
    String(docx.source_language.language_code || '').toLowerCase().startsWith('de'),
    true,
    `DOCX source language should be German, got ${JSON.stringify(docx.source_language)}`,
  );
  assert.ok(Array.isArray(docx.sections) && docx.sections.length > 0, 'DOCX yields sections');
  pass('extract_document_sections detects German for the seeded DOCX (multilingual path)');

  // Unknown document → the tool surfaces a clean error result
  // (isError:true / { error:true, message }), not a crash or empty success.
  const missing = await callExtractSections(`${DEMO_PROJECT}/source/does-not-exist.pdf`);
  assert.equal(missing.ok, false, 'a missing document should surface as a tool error');
  assert.ok(
    missing.parsed &&
      typeof missing.parsed === 'object' &&
      /not found/i.test(String(missing.parsed.message || '')),
    `error message should mention the missing file, got: ${JSON.stringify(missing.parsed)}`,
  );
  pass('extract_document_sections fails cleanly for a missing document');
}

async function testSkillProvisioning(): Promise<void> {
  const root = repoRoot();
  const template = join(
    root,
    'backend',
    'src',
    'skills-templates',
    'document-creation',
    'SKILL.md',
  );
  assert.ok(existsSync(template), 'shipped document-creation SKILL.md template exists');
  pass('document-creation skill template is shipped in backend/src/skills-templates');

  // Instantiate the service directly (repo convention: test services, not HTTP).
  process.env.CODING_AGENT = process.env.CODING_AGENT || 'anthropic';
  const { SkillsService } = await import('../src/skills/skills.service');
  const {
    CodingAgentConfigurationService,
  } = await import('../src/coding-agent-configuration/coding-agent-configuration.service');

  const svc = new SkillsService(new CodingAgentConfigurationService());

  // workspaceDir is process.cwd()/../workspace — provision into a throwaway
  // project name and clean it up afterwards.
  const tempProject = `__doc-creation-int-${Date.now()}`;
  const projectSkillDir = join(
    root,
    'workspace',
    tempProject,
    '.claude',
    'skills',
    'document-creation',
  );

  try {
    const first = await svc.provisionTemplateSkill(tempProject, 'document-creation');
    assert.equal(first.success, true, `first provision should succeed: ${first.error || ''}`);
    assert.ok(
      existsSync(join(projectSkillDir, 'SKILL.md')),
      'SKILL.md should be copied into the project',
    );
    const provisioned = readFileSync(join(projectSkillDir, 'SKILL.md'), 'utf8');
    assert.ok(
      provisioned.includes('name: document-creation') &&
        provisioned.includes('source-target.sectionmappings.json'),
      'provisioned SKILL.md should be the document-creation skill body',
    );
    pass('provisionTemplateSkill copies the skill into a fresh project');

    // Idempotency: second call must not throw and must not overwrite/duplicate.
    const second = await svc.provisionTemplateSkill(tempProject, 'document-creation');
    assert.equal(
      second.success,
      false,
      'second provision should report already-exists (idempotent, non-fatal)',
    );
    assert.ok(
      existsSync(join(projectSkillDir, 'SKILL.md')),
      'SKILL.md still present after the idempotent second call',
    );
    pass('provisionTemplateSkill is idempotent on a second call');
  } finally {
    rmSync(join(root, 'workspace', tempProject), { recursive: true, force: true });
  }
}

function testMappingContract(): void {
  const root = repoRoot();
  const mappingFile = join(
    root,
    'workspace',
    DEMO_PROJECT,
    'source-target.sectionmappings.json',
  );

  if (!existsSync(mappingFile)) {
    skip(`seeded ${DEMO_PROJECT}/source-target.sectionmappings.json missing — contract test skipped`);
    return;
  }

  const data = JSON.parse(readFileSync(mappingFile, 'utf8'));

  // Top-level shape the modal writes and the skill reads.
  for (const key of [
    'sourceDocuments',
    'templateDocument',
    'targetLanguage',
    'mode',
    'outputFile',
    'mappings',
  ]) {
    assert.ok(key in data, `mapping file is missing top-level "${key}"`);
  }
  assert.ok(Array.isArray(data.sourceDocuments), 'sourceDocuments is an array');
  assert.ok(Array.isArray(data.mappings) && data.mappings.length > 0, 'mappings is a non-empty array');
  assert.ok(
    ['freestyle', 'structured', 'structured-requirements'].includes(data.mode),
    `mode must be a known value, got "${data.mode}"`,
  );
  pass('seeded sectionmappings.json has the expected top-level shape');

  let mappedWithSource = 0;
  let translatingMappings = 0;
  let imageInstructionMappings = 0;

  for (const m of data.mappings) {
    assert.ok(m.targetSection, 'each mapping has a targetSection');
    assert.ok(
      typeof m.targetSection.number === 'string' &&
        typeof m.targetSection.title === 'string',
      'targetSection has string number + title',
    );
    assert.ok('transformation' in m, 'each mapping carries a transformation field');

    if (m.source) {
      mappedWithSource += 1;
      assert.ok(
        typeof m.source.document === 'string' && typeof m.source.section === 'string',
        'a mapped source has document + section strings',
      );
      assert.ok(
        data.sourceDocuments.includes(m.source.document),
        `source.document "${m.source.document}" must be listed in sourceDocuments`,
      );
    }
    if (m.sourceLanguage && m.sourceLanguage !== data.targetLanguage) {
      translatingMappings += 1;
    }
    if (/image/i.test(m.transformation || '')) {
      imageInstructionMappings += 1;
    }
  }

  assert.ok(mappedWithSource >= 1, 'at least one mapping is wired to a source section');
  pass(`${mappedWithSource} mapping(s) reference a valid source document`);

  assert.ok(
    translatingMappings >= 1,
    'the seeded demo should exercise the multilingual (translate) path',
  );
  pass(`${translatingMappings} mapping(s) exercise the cross-language translate path`);

  assert.ok(
    imageInstructionMappings >= 1,
    'the seeded demo should exercise an image-handling transformation note',
  );
  pass(`${imageInstructionMappings} mapping(s) carry an explicit image instruction`);
}

async function main(): Promise<void> {
  console.log('# Document Creation integration tests\n');

  console.log('## MCP: extract_document_sections');
  await testMcpExtractSections();

  console.log('\n## SkillsService: provisionTemplateSkill');
  await testSkillProvisioning();

  console.log('\n## Contract: source-target.sectionmappings.json');
  testMappingContract();

  console.log(`\nDone. ${passed} passed, ${skipped} skipped.`);
  if (passed === 0) {
    console.error('No assertions ran — treating as failure.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
