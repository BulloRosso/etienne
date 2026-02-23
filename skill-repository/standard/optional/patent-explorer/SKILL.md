---
name: patent-explorer
description: >
  Build an interactive patent & technology landscape dashboard from uploaded documents.
  Use this skill whenever the user wants to explore, cluster, or analyze patent portfolios,
  technology landscapes, prior art, or IP datasets. Triggers include: mentions of "patents",
  "patent analysis", "technology clusters", "IP landscape", "prior art exploration",
  "patent dashboard", "technology mapping", uploading collections of patent PDFs or CSVs
  alongside journal articles or company profiles, requests to find outliers in patent data,
  or connecting patents to publications. Also trigger when users mention "e-discovery" for
  patent data, keyword extraction from patent text, or building a drill-down explorer for
  technical documents. Even if they just say "analyze these patents" or "cluster my IP data",
  use this skill.
---

# Patent Explorer Dashboard

Build an interactive patent & technology landscape dashboard from a collection of uploaded
documents (patents, journal articles, company profiles). The skill runs a Python-based
analysis pipeline, then generates a self-contained React (MUI) dashboard as a single HTML file.

## Overview

The workflow has two phases:

1. **Analysis phase** — Python scripts extract text, cluster technologies, extract keywords,
   link patents to articles, and identify outliers.
2. **Dashboard phase** — A static single-file React app (MUI Material Design, standard theme)
   renders three tabs: Overview, Explore, and Notably Different Items.

## Step 1 — Understand the Input

The user uploads files to `/mnt/user-data/uploads/`. Expect a mix of:

- **Patent documents** — PDFs, CSVs, or text files. Each patent should have at minimum:
  a patent ID, title, abstract or description, and optionally an assignee/company name.
- **Journal articles** — PDFs, CSVs, or text. Should have title, abstract, authors,
  and optionally a journal name and associated company or patent references.
- **Company profiles** — CSVs or text. Company name and any metadata.

Before doing anything, inspect the uploads directory and identify what files are present.
Parse a sample of each file type to understand the schema. Ask the user to clarify column
mappings only if truly ambiguous; otherwise infer from column names.

## Step 2 — Run the Analysis Pipeline

Run the analysis script at `scripts/analyze.py`. The script requires these Python packages
(install with `pip install --break-system-packages` if missing):

- `pandas`, `scikit-learn`, `nltk`

The script performs:

### 2a. Text Extraction & Normalization
- Read all documents into a unified DataFrame with columns:
  `[id, type, title, text, company, source_file]`
  where `type` is one of `patent`, `article`, `person`, or `company`.
- Normalize text: lowercase, strip punctuation, tokenize.
- Apply suffix-based stemming and stopword removal for keyword extraction.

### 2b. Technology Clustering (3–5 clusters)
- Build a TF-IDF matrix from the combined `title + text` of all items.
- Run KMeans with k chosen from {3, 4, 5} by silhouette score.
- For each cluster, extract the top-10 TF-IDF terms as the cluster description.
- Assign a human-readable cluster label derived from those top terms.

### 2c. Keyword Extraction
- From the full TF-IDF matrix, extract the top-80 terms globally.
- Stem and deduplicate (keep the most common surface form for each stem).
- Record term frequency for word-cloud weighting.

### 2d. Cross-Linking
- Link patents ↔ articles by matching on `company` name OR by patent ID appearing
  in the article text.
- Build a links table: `[patent_id, article_id, link_type]`.

### 2e. Outlier Detection
- Within each cluster, compute the cosine distance of every item to the cluster centroid.
- The top-3 most distant items across all clusters are flagged as outliers.
- For each outlier, identify the TF-IDF terms that differ most from the cluster centroid
  to explain *why* it is different.

### Output
The script writes a single JSON file `analysis_results.json` to the working directory with:

```json
{
  "clusters": [
    {
      "id": 0,
      "label": "Human-readable label",
      "description": "Top terms: ...",
      "item_count": 42,
      "items": ["id1", "id2", ...]
    }
  ],
  "keywords": [
    {"term": "sensor", "stem": "sensor", "frequency": 87},
    ...
  ],
  "items": [
    {
      "id": "US12345678",
      "type": "patent",
      "title": "...",
      "company": "Acme Corp",
      "cluster_id": 0,
      "snippet": "First 200 chars of text..."
    }
  ],
  "links": [
    {"patent_id": "US12345678", "article_id": "art_003", "link_type": "company"}
  ],
  "outliers": [
    {
      "id": "US99999999",
      "cluster_id": 1,
      "distance": 0.87,
      "reason": "Unusually focused on quantum computing while cluster centers on classical optimization",
      "distinctive_terms": ["quantum", "qubit", "entanglement"]
    }
  ]
}
```

## Step 3 — Generate the Dashboard

Run `scripts/build_dashboard.py` which reads `analysis_results.json` and produces a
**single self-contained HTML file** with an inline React app using MUI from CDN.

### Dashboard Specification

The dashboard uses the **MUI default theme** (blue primary #1976d2, standard typography).
Import React, ReactDOM, MUI, and emotion from CDN (unpkg/esm.sh).

#### Tab 1 — Overview

Layout (top to bottom):

1. **Page title**: "Patent Technology Landscape"
2. **Cluster cards** (MUI `Card` components) in a responsive grid, sorted descending by
   item count. Each card shows:
   - Cluster label (bold)
   - Item count chip
   - Top-5 descriptive terms as MUI `Chip` components
   - A mini bar showing the proportion of patents vs. articles in the cluster
3. **Word Cloud** — rendered with a simple custom canvas/SVG implementation (no external
   word-cloud library). Words are sized proportionally to frequency. All words must be
   stemmed and deduplicated (the analysis script already handles this). Use the MUI
   primary/secondary palette for coloring.

#### Tab 2 — Explore

A **three-column drill-down** layout using MUI `List`, `ListItemButton`, `Checkbox`, and
`Select` components:

| Column 1: Technologies | Column 2: Companies | Column 3: Detail Items |
|---|---|---|
| List of cluster labels with checkboxes. Multi-select. | Shown only after ≥1 technology selected. Filtered list of companies that appear in selected clusters. Multi-select with checkboxes. | Shown only after ≥1 company selected. A `Select` dropdown at top with options: "Patents", "Journal Articles", "Persons". Below: a list of matching items. Each item shows title, ID, and a snippet. |

Columns appear progressively: Column 2 is hidden until a technology is selected, Column 3
is hidden until a company is selected. Use MUI `Divider` between columns and `Paper`
elevation for each column.

#### Tab 3 — Notably Different Items

A list of the top-3 outlier items displayed as MUI `Card` components. Each card shows:

- Item title and ID
- Which cluster it belongs to (as a colored chip matching the cluster)
- The **distance score** displayed as a small gauge or progress bar
- The **reason** text explaining what makes it different
- The **distinctive terms** as highlighted chips

### Important implementation notes

- The HTML file must be completely self-contained. All JS and CSS are inline except for
  CDN imports of React, MUI, and emotion.
- Use `importmap` in the HTML `<head>` to map bare specifiers to CDN URLs.
- The analysis JSON data is embedded as a `<script>` block: `const DATA = { ... };`
- The app must work when opened as a local file (file:// protocol), so no fetch calls
  for local data.
- Use functional React components with hooks (`useState`, `useMemo`).
- The word cloud should be implemented as an SVG with `<text>` elements positioned in a
  spiral layout. Keep it simple but visually effective.

## Step 4 — Deliver

1. Copy the final HTML dashboard to `/mnt/user-data/outputs/patent_dashboard.html`.
2. Also copy `analysis_results.json` to `/mnt/user-data/outputs/` so the user can
   inspect the raw data.
3. Present both files to the user.
4. Provide a brief summary of findings: how many clusters were found, the top keywords,
   and what makes the outliers notable.

## Error Handling

- If no patent files are found, tell the user what file formats are supported and ask
  them to upload documents.
- If there are too few documents for meaningful clustering (< 5), warn the user but
  proceed with k=2 or k=3.
- If text extraction fails for a PDF, skip it and note it in the output.
- If no cross-links are found, populate the links array as empty and note this in the
  dashboard.

## Dependencies

Install before running scripts:
```bash
pip install pandas scikit-learn --break-system-packages
```

The scripts use sklearn's built-in English stopword list and a lightweight suffix
stemmer — no NLTK download is required.
