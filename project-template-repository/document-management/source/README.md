# `source/` — the customer's requirements document(s)

Drop the customer's requirements documents in this folder. PDF is the
canonical format (the platform's EARS extractor uses LiteParse with OCR,
so scanned PDFs work too). Word, Excel, and PowerPoint are also
supported.

If the requirements arrive as multiple files (a main document plus
annexes, plus a clarifications round), put all of them here. The
extractor processes each file independently.

## What's already here

- `sample-customer-requirements.pdf` — a synthetic ~40-requirement
  HVDC procurement document: a German TSO procuring the **525 kV /
  2 GW onshore converter station** of an offshore wind connection
  (NordLink-3). The document is in English, ~10 pages, with a real
  Definitions section, a References section listing the standards
  cited (EU 2016/1447, IEC 61850, IEC 62271, IEC 60076-57-129,
  IEC 62443-3-3, IEEE 519-2022), and an Annex C of clarifications
  that quietly modifies four clauses in the main body.
- `sample-customer-requirements.source.md` — the Markdown source the
  PDF was rendered from. Useful if you want to regenerate the PDF or
  see exactly what's inside without opening it. Convert back to PDF
  with `soffice --headless --convert-to pdf` from a shell where
  LibreOffice is on the path.

To use this project against a real customer document, delete those
files and drop your own in.
