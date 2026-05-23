# `target/` — the outline and the final deliverable

This folder holds two things:

- `deliverable-template.docx` — the **active outline** of the final
  deliverable. The platform's *Create Document from Sections* dialog
  reads this file (`.docx` only) and lists its Word headings as the
  template's slots. The exporter follows the same outline.
- `deliverable-template.md` — a plain-text companion of the same
  outline. Edit this when you want to rework the structure, then
  regenerate the `.docx` from it (see below). The platform does not
  read the `.md` directly.
- the **exported deliverable**, written here once you click **Export
  deliverable** in the sidebar. The filename is derived from the H1
  heading of the template.

## How the outline drives the export

Each customer requirement, once you've marked it Done, gets its drafted
response slotted into the matching template heading. The exporter looks
at each draft's compliance position and pulled-from citation and keeps
them visible in the final file.

Headings with no drafts mapped to them are left in place, with a small
note that no requirements were mapped. That's deliberate — silence in
the deliverable is what a Buyer's reviewer sees as a gap.

## Editing the outline

The `.docx` is what the platform reads, but writing Word XML by hand is
no fun. The recommended workflow is:

1. Edit `deliverable-template.md` — change headings, reorder, add new
   ones.
2. Regenerate the `.docx` from it. With LibreOffice available on the
   path:

   ```
   soffice --headless --convert-to docx --outdir target target/deliverable-template.md
   ```

   That produces a `.docx` where every `#` becomes a Heading 1, every
   `##` becomes a Heading 2, and so on — which is exactly what the
   platform's heading extractor reads back.

You can also edit `deliverable-template.docx` directly in Word /
LibreOffice if you prefer.

## What's already here

- `deliverable-template.docx` — the active outline for the worked
  example (13 top-level headings: Executive Summary, Scope of Supply,
  Interface Contracts, …, Clarifications and Deviations).
- `deliverable-template.md` — the same outline as plain text.
