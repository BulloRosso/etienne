---
name: document-creation
description: Assemble a Word .docx by copying sections from one or more source PDF/Word documents in source/ into a target template in target/, applying per-section transformation instructions (translate, summarize, include/exclude images). Driven by source-target.sectionmappings.json. Trigger on "create the document", "build the target docx", "generate the document from the mappings", or when the user finishes the section-mapping dashboard.
---

# Document Creation

You help the user assemble a single Word `.docx` document by copying sections
from one or more **source** documents (PDF or Word, possibly in a different
language, possibly containing images) into a **target template** `.docx`,
applying per-section transformation instructions.

## When to use this skill

- The user says "create the document", "build the target docx", "generate the
  document from the mappings", or similar.
- The user has finished the section-mapping dashboard and clicked
  "Create document now".
- The user wants to maintain the mapping conversationally (Freestyle mode).

## Project layout (convention)

```
<project>/
├── source/                              # input PDFs / .docx to copy from
├── target/                              # the template .docx + the generated output
├── source-target.sectionmappings.json   # the mapping state (project root)
```

`target/` is expected to contain exactly one template `.docx`. The generated
document is written back into `target/`.

## The mapping file: source-target.sectionmappings.json

This file at the project root is the single source of truth. Schema:

```json
{
  "sourceDocuments": ["source/overview-en.pdf", "source/spec-de.docx"],
  "templateDocument": "target/proposal-template.docx",
  "targetLanguage": "en",
  "mode": "structured",
  "outputFile": "target/generated-document.docx",
  "mappings": [
    {
      "targetSection": { "number": "1", "title": "Executive Summary" },
      "source": {
        "document": "source/overview-en.pdf",
        "section": "2.1",
        "title": "Product Overview"
      },
      "transformation": "Summarize to one paragraph. Keep the key figures.",
      "sourceLanguage": "en",

      "status": "generated",
      "provenance": {
        "generatedAt": "2026-05-16T10:22:00Z",
        "sourceHash": "sha256:ab12cd34…",
        "outputSection": "1 Executive Summary",
        "note": "Summarized to one paragraph; copied from en (no translation)."
      }
    }
  ],
  "lastRun": {
    "at": "2026-05-16T10:22:05Z",
    "outputFile": "target/generated-document.docx",
    "filled": 5,
    "skipped": 1,
    "error": 0
  }
}
```

- `mode` is `freestyle`, `structured`, or `structured-requirements`.
- `transformation` is a free-text instruction. It is the user's intent — honor
  it literally. Common instructions and how to handle them are below.
- A mapping with no `source` (or an empty `source.section`) is **unmapped** —
  skip it and leave the template section untouched.

### Field ownership (important)

The mapping file is a **shared journal**. The dashboard owns the *user*
fields; you own the *tracking* fields:

- **User-owned (never modify):** `targetSection`, `source`, `transformation`,
  `sourceLanguage`, and the top-level `sourceDocuments`, `templateDocument`,
  `targetLanguage`, `mode`, `outputFile`.
- **Skill-owned (you write these in Step 7.5):** each mapping's `status` and
  `provenance`, and the top-level `lastRun`.

`status` is one of: `unmapped` (no source), `mapped` (source set, not yet
generated), `generated` (you wrote it into the docx), `skipped` (you
intentionally left it — unmapped or too ambiguous), `error` (you failed on
it), `reviewed` (the user confirmed it — **never set or clear `reviewed`
yourself; preserve it if present and the user did not change the row**).

## Workflow

### Step 1 — Read the mapping file

Read `source-target.sectionmappings.json` from the project root. If it does not
exist, tell the user to open the Document Creation dashboard (right-click the
`source/` folder) or describe the mapping in chat so you can build it.

### Step 2 — Resolve source section content

For each mapping with a `source`:

1. Parse the source document. Use the `extract_document_sections` MCP tool
   (group `document-analysis`) with `document_path` =
   `<project>/<source.document>`. It returns
   `{ source_language, sections: [{ number, title, level, page_start, text, image_count }] }`.
2. Find the section whose `number`/`title` matches `source.section` /
   `source.title`. Use its `text` as the raw content.
3. If you need richer parsing (tables, exact image positions), fall back to the
   `office-and-pdf-documents` skill / LiteParse directly.

### Step 3 — Apply the transformation instruction

The `transformation` field is the user's instruction. Interpret it:

- **"ignore images" / "no images" / "text only"** — copy the text, drop any
  image references.
- **"only take the images" / "images only"** — extract the images from the
  source section and embed only those (no body text). You decide the technical
  approach (e.g. `pdfjs`/`pdf-lib` for PDF, `mammoth` for `.docx`); write
  extracted images into `target/_assets/` and reference them from the
  generated markdown with `![](_assets/...)`.
- **"include images" / "keep images"** — keep both text and images.
- **"summarize" / "shorten to N..."** — produce a condensed version.
- **No instruction** — copy the section faithfully (text + inline image
  references).

If the instruction is ambiguous, ask the user before generating.

### Step 4 — Translate when languages differ

If the mapping's `sourceLanguage` differs from the file's `targetLanguage`,
translate the (possibly transformed) content into `targetLanguage`. Preserve
technical terms, acronyms, proper nouns, numbers, and units. Do this inline —
do not produce a separate bilingual artifact.

### Step 5 — Compose the target markdown

Build one markdown document. For every template section that received content,
emit a heading matching the template's numbering and title, followed by the
transformed/translated content, in template order. Leave unmapped template
sections out of the body (the template-based export preserves the template's
own structure).

### Step 6 — Generate the .docx

Call the export endpoint, preserving the template:

```
POST /api/workspace/<project>/files/export-docx-template/<outputFile>
Content-Type: application/json; charset=utf-8

{
  "content": "<the composed markdown>",
  "templatePath": "<templateDocument, relative to the project>",
  "selectedSections": [ { "number": "1", "title": "Executive Summary" }, ... ]
}
```

`selectedSections` is the list of template sections you actually filled.
Use `outputFile` from the mapping file (default `target/generated-document.docx`).

### Step 7.5 — Write back results (tracking)

This is what lets the dashboard show the user what was actually produced. Do
it **after** the docx is written, **before** confirming.

1. **Re-read** `source-target.sectionmappings.json` (it may have changed while
   you worked — always re-read; never reuse the copy from Step 1).
2. For **each** mapping, set:
   - `status`:
     - `generated` — you wrote this target section into the docx.
     - `skipped` — unmapped (no source) or you deliberately left it.
     - `error` — you attempted it but failed (say why in `note`).
     - If the existing `status` is `reviewed` **and** the user did not change
       this row's `source`/`transformation`, leave it `reviewed` (do not
       downgrade a user-confirmed row).
   - `provenance` (only for `generated`/`skipped`/`error`):
     - `generatedAt`: current time, ISO-8601 UTC (e.g. `2026-05-16T10:22:00Z`).
     - `sourceHash`: `sha256:` + the SHA-256 hex of the **exact source section
       `text`** you used (the `text` field returned by
       `extract_document_sections`). For `skipped`/unmapped rows with no
       source, use `sha256:` + the SHA-256 of an empty string. This lets the
       dashboard later detect when the source changed.
     - `outputSection`: the template heading you filled, e.g.
       `"1 Executive Summary"`.
     - `note`: one human-readable line — the transform + translation applied,
       or why it was skipped/errored.
3. Set the top-level `lastRun`:
   `{ "at": <ISO-8601 now>, "outputFile": <the outputFile you wrote>,
   "filled": <#generated>, "skipped": <#skipped>, "error": <#error> }`.
4. **Preserve every user-owned field unchanged** (`targetSection`, `source`,
   `transformation`, `sourceLanguage`, and all top-level user fields). Do not
   reorder the `mappings` array. Only add/replace `status`, `provenance`, and
   the top-level `lastRun`.
5. Persist the merged object:
   `PUT /api/workspace/<project>/files/save/source-target.sectionmappings.json`
   with `Content-Type: application/json; charset=utf-8` and body
   `{ "content": "<the full JSON, pretty-printed>" }`.

### Step 7 — Confirm

Tell the user the output path, which sections were filled, which were skipped
(unmapped), and any transformation/translation you applied. If any instruction
was ambiguous and you made a judgement call, say so. Mention that the section
mapping dashboard now reflects the per-section status.

## Freestyle mode

When the user describes mappings conversationally instead of using the
dashboard:

- Maintain `source-target.sectionmappings.json` incrementally: every time the
  user adds or changes a mapping, **re-read** the file, update only the
  affected mapping's user fields, and write it back
  (`PUT /api/workspace/<project>/files/save/source-target.sectionmappings.json`).
- Preserve skill-owned fields when editing: keep existing `provenance` and the
  top-level `lastRun`. When the user changes a mapping's `source` or
  `transformation`, set that mapping's `status` to `mapped` (it must be
  regenerated) and drop its now-stale `provenance`; leave other mappings'
  `status`/`provenance` untouched. A mapping with no source is `unmapped`.
- Keep `sourceDocuments`, `templateDocument`, `targetLanguage`, and `mode:
  "freestyle"` in sync.
- Only run Steps 2–7.5 when the user explicitly asks you to create/build the
  document.

## Requirements mode (mode = "structured-requirements")

When the mode is `structured-requirements`, additionally run the
`document_analysis_ears` MCP tool (group `document-analysis`) on each source
document to classify its content per the EARS standard. Use the EARS-normalized
text where it improves clarity, and note the EARS type for each mapped section
in your confirmation summary.

## Notes

- Never invent sections that are not in the template. Never restructure the
  template — only fill it.
- Never copy content the user did not map.
- Always use `charset=utf-8` for API calls so non-ASCII (German, etc.) is safe.
- Read-only inputs: never modify files under `source/` or the template itself.
