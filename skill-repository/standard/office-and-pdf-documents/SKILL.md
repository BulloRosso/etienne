---
name: office-and-pdf-documents
description: "Parse and extract text from Office documents and PDFs. Trigger on phrases like 'parse this PDF', 'extract text from Word file', 'read this spreadsheet', 'convert document to text', 'parse this .docx', 'extract content from PowerPoint'. Uses LiteParse for local, spatial text extraction with OCR support."
---

# Office & PDF Document Parsing

This skill lets you parse Office documents (Word, PowerPoint, Excel) and PDFs to extract their text content. It uses the **liteparse** library (`@llamaindex/liteparse`) for fast, local document parsing with spatial text preservation and built-in OCR.

## Dependencies

### System Dependency: LibreOffice

This skill requires **LibreOffice** to be installed on the system. LibreOffice is used by liteparse to convert Office documents (Word, PowerPoint, Excel) to PDF before parsing. PDF-only workflows do not require LibreOffice.

**Before using this skill**, run the following check:

```bash
soffice --version
```

- If the command succeeds, LibreOffice is available and the skill is ready.
- If the command fails, **inform the user**:

> LibreOffice is required for parsing Office documents but is not installed on this system. LibreOffice is a binary dependency that must be installed manually:
>
> - **Linux (Debian/Ubuntu):** `sudo apt-get install -y libreoffice`
> - **Linux (RHEL/Fedora):** `sudo dnf install libreoffice`
> - **macOS:** `brew install --cask libreoffice`
> - **Windows:** Download from https://www.libreoffice.org/download/
> - **Docker:** Add `RUN apt-get update && apt-get install -y libreoffice` to your Dockerfile
>
> After installation, restart the terminal and try again.

**Important:** Always run the `soffice --version` check at the start of every parsing session. Do not skip this check.

### npm Dependency: @llamaindex/liteparse

The npm package `@llamaindex/liteparse` must be available. If it is not installed, install it:

```bash
npm install @llamaindex/liteparse
```

Or install it globally for CLI usage:

```bash
npm install -g @llamaindex/liteparse
```

## When to Use This Skill

Activate this skill when the user wants to:

- Parse or extract text from a PDF file
- Extract content from Word documents (.doc, .docx, .docm, .odt, .rtf)
- Extract content from PowerPoint presentations (.ppt, .pptx, .pptm, .odp)
- Extract content from Excel spreadsheets (.xls, .xlsx, .xlsm, .ods, .csv, .tsv)
- Extract text from images with OCR (.jpg, .jpeg, .png, .gif, .bmp, .tiff, .webp, .svg)
- Convert a document to plain text or structured data for further processing
- Take page screenshots of a document for multimodal analysis

Trigger phrases include: "parse this PDF", "extract text from this document", "read this Word file", "what does this spreadsheet say", "convert this to text", "parse this .docx", "extract content from this PowerPoint", "OCR this image".

## Supported File Formats

| Category | Extensions |
|----------|-----------|
| PDF | `.pdf` |
| Word | `.doc`, `.docx`, `.docm`, `.odt`, `.rtf` |
| PowerPoint | `.ppt`, `.pptx`, `.pptm`, `.odp` |
| Excel/Sheets | `.xls`, `.xlsx`, `.xlsm`, `.ods`, `.csv`, `.tsv` |
| Images (OCR) | `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.tiff`, `.webp`, `.svg` |

**Note:** Non-PDF formats are automatically converted to PDF via LibreOffice before parsing. PDF files do not require LibreOffice.

## What You Can Do

When the user asks about document parsing capabilities, explain clearly in plain language:

**Text extraction with layout preservation:**
- Extracts text while preserving the document's original spatial layout through precise indentation and whitespace
- Returns bounding boxes, font metadata, and confidence scores for each text element

**Built-in OCR:**
- Scanned PDFs and images are automatically processed with Tesseract.js OCR
- No external OCR setup required — it works out of the box
- Supports multiple OCR languages

**Page screenshots:**
- Generate PNG/JPG screenshots of individual pages for multimodal AI analysis

**All processing is local:**
- Zero cloud dependencies, zero API keys needed for parsing
- Documents never leave the machine

## Limitations

Be upfront with the user about these limitations:

- **LibreOffice required for Office formats** — Without LibreOffice installed, only PDF files can be parsed. Office document conversion will fail.
- **Complex layouts** — Highly complex layouts (multi-column, nested tables, overlapping elements) may not be perfectly preserved.
- **Encrypted/password-protected files** — Password-protected PDFs are supported (pass the password as a config option), but encrypted Office documents must be decrypted first.
- **Very large documents** — Documents with hundreds of pages may take significant time. Use the `maxPages` option to limit processing.
- **Scanned quality** — OCR accuracy depends on scan quality. Low-resolution or skewed scans may produce poor results.

## File & Folder Conventions

### Output directory
All parsed document output goes into `documents/` at the project root. Create it if it does not exist.

### File naming
Name output files after the source document, with `.md` or `.json` extension:

- `documents/quarterly-report.md` (from `quarterly-report.pdf`)
- `documents/meeting-notes.md` (from `meeting-notes.docx`)
- `documents/sales-data.json` (from `sales-data.xlsx`, structured output)

### Index file
Maintain `documents/parse-log.md` as a log of all parsed documents:

```markdown
# Document Parse Log

_Last updated: <date>_

| Source File | Output File | Pages | Format | Parsed |
|-------------|-------------|-------|--------|--------|
| quarterly-report.pdf | [quarterly-report.md](documents/quarterly-report.md) | 12 | text | 2026-03-29 |
| meeting-notes.docx | [meeting-notes.md](documents/meeting-notes.md) | 3 | text | 2026-03-29 |
```

Update this log after every parse operation.

## Workflow

### 1. Check LibreOffice availability

Before anything else, run the dependency check:

```bash
soffice --version
```

- If it succeeds, proceed.
- If it fails and the user wants to parse a **non-PDF** file, stop and report the LibreOffice dependency requirement (see Dependencies section above).
- If it fails but the user only wants to parse a **PDF**, proceed — LibreOffice is not needed for PDFs.

### 2. Check liteparse availability

Verify that the `@llamaindex/liteparse` package is available:

```bash
npx liteparse --help
```

If not available, install it:

```bash
npm install @llamaindex/liteparse
```

### 3. Understand the request

Clarify with the user if needed:
- Which file(s) to parse?
- Do they want plain text (default), structured JSON, or page screenshots?
- Should OCR be enabled? (default: yes)
- Any specific pages? (useful for large documents)

### 4. Parse the document

Use the liteparse CLI to parse the document:

**Basic text extraction:**
```bash
npx liteparse parse "<file-path>" --format text
```

**JSON output with bounding boxes and metadata:**
```bash
npx liteparse parse "<file-path>" --format json
```

**Specific pages only:**
```bash
npx liteparse parse "<file-path>" --format text --target-pages 1,2,3
```

**Limit max pages for large documents:**
```bash
npx liteparse parse "<file-path>" --format text --max-pages 20
```

**Disable OCR (faster, for digital-native PDFs):**
```bash
npx liteparse parse "<file-path>" --format text --no-ocr
```

**Generate page screenshots:**
```bash
npx liteparse screenshot "<file-path>" --output-dir documents/screenshots/ --format png
```

**Batch processing multiple files:**
```bash
npx liteparse batch-parse "<input-dir>" "<output-dir>" --format text --recursive
```

### 5. Save the results

1. Create the `documents/` directory if it does not exist
2. Write the extracted content to the appropriate file
3. Update `documents/parse-log.md`

### 6. Present results

After saving:
- Confirm what was parsed and where the output was saved
- Show a brief preview of the extracted content (first ~20 lines)
- Report the number of pages processed
- If OCR was used, mention it and note any low-confidence sections

## Example Interactions

### Example 1: Parse a PDF

**User**: "Parse the quarterly report PDF at data/Q4-report.pdf"

**Agent**:
1. Runs `soffice --version` — succeeds (or notes it's not needed for PDF)
2. Runs `npx liteparse parse "data/Q4-report.pdf" --format text`
3. Saves output to `documents/Q4-report.md`
4. Updates parse log

"I've extracted the text from your Q4 report (12 pages). Output saved to `documents/Q4-report.md`. Here's a preview:

> # Quarterly Report Q4 2025
> Revenue increased 15% year-over-year, driven by strong growth in the enterprise segment..."

### Example 2: Parse a Word document

**User**: "Extract the content from meeting-notes.docx"

**Agent**:
1. Runs `soffice --version` — checks LibreOffice is available
2. Runs `npx liteparse parse "meeting-notes.docx" --format text`
3. Saves output to `documents/meeting-notes.md`
4. Updates parse log

"Done! I've extracted the meeting notes (3 pages) and saved them to `documents/meeting-notes.md`."

### Example 3: LibreOffice not installed

**User**: "Parse this spreadsheet sales-data.xlsx"

**Agent**:
1. Runs `soffice --version` — command fails
2. Informs the user:

"I can't parse Excel files right now because **LibreOffice** is not installed on this system. LibreOffice is a binary dependency required by the document parser to convert Office formats to PDF before extraction.

To install it:
- **Linux (Debian/Ubuntu):** `sudo apt-get install -y libreoffice`
- **macOS:** `brew install --cask libreoffice`
- **Windows:** Download from https://www.libreoffice.org/download/

After installation, restart the terminal and I'll be able to parse your spreadsheet."

### Example 4: Parse with screenshots for multimodal analysis

**User**: "I need screenshots of each page of this presentation for analysis"

**Agent**:
1. Runs `soffice --version` — succeeds
2. Runs `npx liteparse screenshot "presentation.pptx" --output-dir documents/screenshots/ --format png`
3. Reports the generated screenshots

"I've generated PNG screenshots for all 15 slides. They're saved in `documents/screenshots/`. You can now use these for visual analysis."

## Error Handling

- **LibreOffice not installed**: Report the dependency requirement with installation instructions (see Dependencies section). Do not attempt to parse Office documents without it.
- **liteparse not installed**: Install it with `npm install @llamaindex/liteparse` and retry.
- **File not found**: Ask the user to verify the file path.
- **Corrupted file**: Inform the user the file may be corrupted or in an unsupported format.
- **OCR low confidence**: Note which sections had low OCR confidence and suggest the user verify those sections manually.
- **Timeout on large documents**: Suggest using `--max-pages` or `--target-pages` to limit processing scope.

## Notes

- Always default to text format unless the user specifically asks for JSON or screenshots.
- For spreadsheets, JSON output may be more useful as it preserves cell structure — suggest this to the user.
- OCR is enabled by default. For digital-native PDFs (not scanned), suggest disabling OCR with `--no-ocr` for faster processing.
- When parsing multiple documents, use the `batch-parse` command for efficiency.
- All processing happens locally — reassure users that sensitive documents never leave the machine.
