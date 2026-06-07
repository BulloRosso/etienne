# EARS Analysis MCP Server

Tool group that analyses PDF / Office tender documents using the **EARS**
(Easy Approach to Requirements Syntax) framework. It parses a document, detects
its language, extracts requirements / context facts / commercial terms via an
LLM, runs a cross-reference quality pass, and renders a structured report —
translating to English when the source is not English.

Source: [document-analysis-tools.ts](document-analysis-tools.ts)
Editable prompts: [ears-analysis-prompts/](ears-analysis-prompts/)

## Endpoint

```
http://localhost:6060/mcp/document-analysis
```

> **Note on the name.** The group is internally referred to as *EARS analysis*
> (the prompts live in `ears-analysis-prompts/`), but it is **mounted under the
> `document-analysis` group**, so the live URL is `/mcp/document-analysis`, not
> `/mcp/ears-analysis`. The latter returns `404 Unknown tool group`.

It speaks the **MCP Streamable HTTP** transport (`StreamableHTTPServerTransport`),
so use an MCP client rather than calling the methods as plain REST.

### Required headers

| Header | Required | Purpose |
|--------|----------|---------|
| `Authorization` | yes | Bearer/auth token (`test123` in dev — see `McpAuthGuard`) |
| `X-Project-Name` | yes\* | Selects the workspace project; document paths resolve relative to `/<workspace>/<project>` |
| `mcp-session-id` | after init | Returned on the first (initialize) request; echo it on subsequent calls to reuse the session |

\* Project can alternatively be passed as a `?project=<name>` query parameter.
Without it, `document_path` resolves against the workspace root only.

## Methods (tools)

### 1. `document_analysis_ears`

Full EARS analysis pipeline over a document. Returns a Markdown report (with the
raw JSON appended) or pure JSON.

**Input**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `document_path` | string | yes | — | Path to the file, **relative to the workspace root**, e.g. `my-project/documents/tender.pdf`, `my-project/data/specs.docx`. |
| `skip_translation` | boolean | no | `false` | When `true`, non-English reports are **not** translated to English. |
| `output_format` | `"markdown"` \| `"json"` | no | `"markdown"` | `markdown` → human-readable report with the raw JSON appended in a fenced block. `json` → structured data only. |

**What it does (pipeline)**

1. Parse text via LiteParse (PDF / Word / PowerPoint / Excel, built-in OCR).
2. Detect the document language (sampled from start / middle / end).
3. Chunk pages (10 pages per chunk) and extract requirements per chunk via the LLM.
4. Merge & deduplicate requirements across chunks; renumber `REQ-/CTX-/COM-` IDs.
5. Cross-reference quality pass — duplicates, contradictions, coverage gaps, executive summary.
6. Render the Markdown report (statistics, EARS breakdown, priority & cluster
   distribution, document structure, requirements grouped by response cluster,
   ambiguity register, context facts, commercial terms, quality analysis).
7. Translate the report to English if the source is non-English and
   `skip_translation` is not set.

**Output (JSON shape)** — also embedded at the bottom of the Markdown report:

```jsonc
{
  "source_language": { "language_code": "de", "language_name": "German", "confidence": "high" },
  "requirements": [ {
    "id": "REQ-001",
    "original_text": "…",
    "ears_normalized": "When <trigger>, the <actor> shall <action> …",
    "ears_type": "event_driven",        // ubiquitous | event_driven | state_driven | unwanted_behavior | optional
    "trigger_condition": "…",
    "actor": "…", "action": "…", "constraint": "…",
    "priority": "mandatory",            // mandatory | scored | optional | informational
    "verification": "test",             // test | analysis | inspection | demonstration | review | not_specified
    "references_standard": "…",
    "has_penalty": false,
    "source_section": "4.2", "source_page": 12,
    "response_cluster": "…",
    "ambiguity_flag": false, "ambiguity_notes": ""
  } ],
  "context_facts": [ { "id": "CTX-001", "text": "…", "category": "site", "source_section": "…", "source_page": 3 } ],
  "commercial_terms": [ { "id": "COM-001", "text": "…", "category": "payment", "source_section": "…", "source_page": 8 } ],
  "document_sections": [ { "section_number": "4", "title": "…", "page_start": 10 } ],
  "quality_analysis": {
    "duplicates":    [ { "ids": ["REQ-003","REQ-017"], "reason": "…" } ],
    "contradictions":[ { "ids": ["REQ-005","REQ-022"], "reason": "…" } ],
    "gaps":          [ { "area": "…", "explanation": "…" } ],
    "executive_summary": "…"
  }
}
```

In `markdown` mode the same JSON is appended after the report under a
`## Raw JSON Data` heading.

---

### 2. `extract_document_sections`

Lightweight **structural** extraction — *no* EARS classification. An analyst LLM
identifies the real section structure from the parsed (often noisy / OCR'd) text,
which is far more robust than regex heading detection on scanned documents. Use
it to populate a source → target section mapping.

**Input**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `document_path` | string | yes | Path to the file, relative to the workspace root, e.g. `my-project/source/spec.pdf`. |

**Output**

```jsonc
{
  "source_language": { "language_code": "en", "language_name": "English", "confidence": "high" },
  "sections": [ {
    "number": "4.2",          // auto-assigned "S1", "S2"… when the doc is unnumbered
    "title": "…",
    "level": 1,               // nesting depth (1 = top level)
    "page_start": 12,         // best-effort page attribution (a hint, not load-bearing)
    "text": "…",              // section body text
    "image_count": 2          // best-effort count of figure/image references in the text
  } ],
  "low_text_quality": false   // true when the doc is mostly unreadable OCR — then
                              // a single "Full document" fallback section is returned
}
```

## Supported formats

PDF (native + scanned via OCR), Word (`.doc/.docx/.docm/.odt/.rtf`),
PowerPoint (`.ppt/.pptx/.pptm/.odp`), Excel/Sheets
(`.xls/.xlsx/.xlsm/.ods/.csv/.tsv`), and images (OCR).

Non-PDF formats are converted to PDF first, which requires **LibreOffice**
(`soffice`) on the host. PDF parsing works without LibreOffice.

## Progress reporting

Both tools stream MCP progress notifications during the long-running parse /
extract / translate steps (page-based for `document_analysis_ears`, chunk-based
for `extract_document_sections`), so an MCP client showing progress will see
live status messages.

## Example (initialize + call)

```bash
# 1. Initialize a session (note the returned mcp-session-id response header)
curl -i http://localhost:6060/mcp/document-analysis \
  -H "Authorization: test123" \
  -H "X-Project-Name: my-project" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",
       "params":{"protocolVersion":"2024-11-05","capabilities":{},
                 "clientInfo":{"name":"curl","version":"1.0"}}}'

# 2. Call the EARS analysis tool (reuse the session id from step 1)
curl http://localhost:6060/mcp/document-analysis \
  -H "Authorization: test123" \
  -H "X-Project-Name: my-project" \
  -H "mcp-session-id: <id-from-step-1>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"document_analysis_ears",
                 "arguments":{"document_path":"my-project/documents/tender.pdf",
                              "output_format":"json"}}}'
```
