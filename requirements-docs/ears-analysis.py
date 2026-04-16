"""
PDF Requirements
==============================
Reads a PDF classifies requirements
using the EARS (Easy Approach to Requirements Syntax) framework, and
outputs a structured Markdown report.

Usage:
    python tender_requirements_extractor.py <path_to_tender.pdf> [--output report.md] [--model claude-sonnet-4-20250514]

Requires:
    - ANTHROPIC_API_KEY environment variable
    - pip install anthropic pdfplumber
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import textwrap
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path

import pdfplumber
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 8192

# How many PDF pages to send per LLM call.  Keeps each request well within
# context limits even for the densest legal text (~800 tokens/page).
PAGES_PER_CHUNK = 15

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("tender_extractor")


# ---------------------------------------------------------------------------
# Domain model
# ---------------------------------------------------------------------------

class EARSType(str, Enum):
    """EARS requirement pattern classification."""
    UBIQUITOUS = "ubiquitous"          # "The system shall …"
    EVENT_DRIVEN = "event_driven"      # "When <event>, the system shall …"
    STATE_DRIVEN = "state_driven"      # "While <state>, the system shall …"
    UNWANTED = "unwanted_behavior"     # "If <unwanted condition>, the system shall …"
    OPTIONAL = "optional"              # "Where <feature>, the system shall …"
    NOT_A_REQUIREMENT = "not_a_requirement"  # Context, info, commercial term


class RequirementPriority(str, Enum):
    MANDATORY = "mandatory"            # Must comply — pass/fail gate
    SCORED = "scored"                  # Evaluated / weighted in scoring
    OPTIONAL = "optional"              # Nice-to-have, differentiation opportunity
    INFORMATIONAL = "informational"    # Context only


class VerificationMethod(str, Enum):
    TEST = "test"
    ANALYSIS = "analysis"
    INSPECTION = "inspection"
    DEMONSTRATION = "demonstration"
    REVIEW = "review"
    NOT_SPECIFIED = "not_specified"


@dataclass
class Requirement:
    id: str
    original_text: str
    ears_normalized: str
    ears_type: EARSType
    trigger_condition: str             # The When/While/If clause, empty for ubiquitous
    actor: str
    action: str
    constraint: str                    # Measurable acceptance criterion
    priority: RequirementPriority
    verification: VerificationMethod
    references_standard: str           # e.g. "IEC 61850", "EN 50549"
    has_penalty: bool
    source_section: str                # Section number / heading from tender
    source_page: int
    response_cluster: str              # Our offer-oriented grouping
    ambiguity_flag: bool
    ambiguity_notes: str


@dataclass
class ContextFact:
    """Non-requirement facts (site data, grid params, dates)."""
    id: str
    text: str
    category: str                      # site, grid, timeline, commercial, legal
    source_section: str
    source_page: int


@dataclass
class CommercialTerm:
    """Payment, warranty, LD, insurance terms — parallel track."""
    id: str
    text: str
    category: str                      # payment, warranty, penalty, insurance, liability
    source_section: str
    source_page: int


@dataclass
class ExtractionResult:
    requirements: list[Requirement] = field(default_factory=list)
    context_facts: list[ContextFact] = field(default_factory=list)
    commercial_terms: list[CommercialTerm] = field(default_factory=list)
    document_sections: list[dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# PDF reading
# ---------------------------------------------------------------------------

def extract_pdf_text(pdf_path: Path) -> list[dict]:
    """Return a list of {page_number, text} dicts."""
    pages: list[dict] = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            pages.append({"page_number": i, "text": text})
    log.info("Extracted %d pages from %s", len(pages), pdf_path.name)
    return pages


def chunk_pages(pages: list[dict], chunk_size: int = PAGES_PER_CHUNK) -> list[list[dict]]:
    """Split page list into chunks for sequential LLM calls."""
    return [pages[i : i + chunk_size] for i in range(0, len(pages), chunk_size)]


# ---------------------------------------------------------------------------
# LLM interaction
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = textwrap.dedent("""\
You are an expert requirements engineer specialising in energy-market
tenders.  You will receive pages from a tender document.  Your job is to
extract every requirement, context fact, and commercial term.

For REQUIREMENTS, classify each one using the EARS (Easy Approach to
Requirements Syntax) framework:

  • ubiquitous        — "The system shall …" (always applies)
  • event_driven      — "When <event>, the system shall …"
  • state_driven      — "While <state>, the system shall …"
  • unwanted_behavior — "If <unwanted condition>, the system shall …"
  • optional          — "Where <feature is included>, the system shall …"

If a statement is NOT a behavioural requirement (site data, dates, grid
parameters, payment terms, etc.) classify it as a context_fact or
commercial_term instead.

For each requirement provide:
  - id: sequential e.g. "REQ-001"
  - original_text: verbatim from the tender
  - ears_normalized: rewritten in clean EARS syntax
  - ears_type: one of the five types above
  - trigger_condition: the When/While/If clause (empty string for ubiquitous)
  - actor: who/what must act
  - action: what must be done
  - constraint: measurable acceptance criterion
  - priority: mandatory | scored | optional | informational
  - verification: test | analysis | inspection | demonstration | review | not_specified
  - references_standard: any standard mentioned (e.g. "IEC 61850") or empty
  - has_penalty: true/false — whether a penalty clause is linked
  - source_section: the section number or heading this came from
  - source_page: page number
  - response_cluster: categorise into one of:
      technical_compliance, commercial_terms, project_execution,
      qualification_criteria, hse_environment, grid_connection,
      documentation_reporting, warranty_maintenance, other
  - ambiguity_flag: true if the requirement is ambiguous or incomplete
  - ambiguity_notes: explain what is ambiguous (empty if not flagged)

For CONTEXT FACTS (non-requirement info):
  - id: "CTX-001" etc.
  - text, category (site | grid | timeline | commercial | legal),
    source_section, source_page

For COMMERCIAL TERMS:
  - id: "COM-001" etc.
  - text, category (payment | warranty | penalty | insurance | liability),
    source_section, source_page

Also return a document_sections list capturing the document's own
structure: [{section_number, title, page_start}].

Respond with ONLY valid JSON (no markdown fences) using this schema:
{
  "requirements": [<Requirement objects>],
  "context_facts": [<ContextFact objects>],
  "commercial_terms": [<CommercialTerm objects>],
  "document_sections": [{"section_number": "...", "title": "...", "page_start": N}]
}
""")


def build_chunk_message(chunk: list[dict], chunk_index: int, total_chunks: int) -> str:
    header = (
        f"--- Tender document chunk {chunk_index + 1} of {total_chunks} ---\n"
        f"Pages {chunk[0]['page_number']}–{chunk[-1]['page_number']}\n\n"
    )
    body = "\n\n".join(
        f"[PAGE {p['page_number']}]\n{p['text']}" for p in chunk
    )
    footer = (
        "\n\nContinue the ID sequences from previous chunks if applicable.  "
        "Return ONLY the JSON for items found in THESE pages."
    )
    return header + body + footer


def call_llm(client: Anthropic, messages: list[dict], model: str) -> str:
    """Send a messages request and return the text content."""
    response = client.messages.create(
        model=model,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=messages,
    )
    # Extract text blocks from the response
    text_parts = [
        block.text for block in response.content if block.type == "text"
    ]
    return "\n".join(text_parts)


def parse_llm_response(raw: str) -> dict:
    """Parse JSON from the LLM response, stripping markdown fences if present."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        # Remove ```json ... ``` wrapper
        lines = cleaned.split("\n")
        lines = lines[1:]  # drop opening fence
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines)
    return json.loads(cleaned)


def extract_chunk(
    client: Anthropic,
    chunk: list[dict],
    chunk_index: int,
    total_chunks: int,
    model: str,
    id_offsets: dict[str, int],
) -> dict:
    """Run extraction on a single chunk of pages."""
    user_msg = build_chunk_message(chunk, chunk_index, total_chunks)

    # Provide ID continuation hints
    continuation = (
        f"Start requirement IDs from REQ-{id_offsets['req']:03d}, "
        f"context fact IDs from CTX-{id_offsets['ctx']:03d}, "
        f"commercial term IDs from COM-{id_offsets['com']:03d}."
    )
    user_msg = continuation + "\n\n" + user_msg

    log.info(
        "Processing chunk %d/%d (pages %d–%d) …",
        chunk_index + 1,
        total_chunks,
        chunk[0]["page_number"],
        chunk[-1]["page_number"],
    )

    raw = call_llm(client, [{"role": "user", "content": user_msg}], model)
    try:
        data = parse_llm_response(raw)
    except json.JSONDecodeError as exc:
        log.error("Failed to parse LLM JSON for chunk %d: %s", chunk_index + 1, exc)
        log.debug("Raw response:\n%s", raw[:2000])
        data = {
            "requirements": [],
            "context_facts": [],
            "commercial_terms": [],
            "document_sections": [],
        }
    return data


# ---------------------------------------------------------------------------
# Merging & deduplication
# ---------------------------------------------------------------------------

def merge_results(chunk_results: list[dict]) -> ExtractionResult:
    """Merge extraction results from all chunks into a single ExtractionResult."""
    result = ExtractionResult()
    seen_req_texts: set[str] = set()

    for cr in chunk_results:
        for r in cr.get("requirements", []):
            key = r.get("original_text", "").strip().lower()
            if key and key not in seen_req_texts:
                seen_req_texts.add(key)
                result.requirements.append(_build_requirement(r))

        for cf in cr.get("context_facts", []):
            result.context_facts.append(_build_context_fact(cf))

        for ct in cr.get("commercial_terms", []):
            result.commercial_terms.append(_build_commercial_term(ct))

        for ds in cr.get("document_sections", []):
            result.document_sections.append(ds)

    # Re-number IDs sequentially after merge
    for i, req in enumerate(result.requirements, start=1):
        req.id = f"REQ-{i:03d}"
    for i, cf in enumerate(result.context_facts, start=1):
        cf.id = f"CTX-{i:03d}"
    for i, ct in enumerate(result.commercial_terms, start=1):
        ct.id = f"COM-{i:03d}"

    log.info(
        "Merged totals — Requirements: %d | Context facts: %d | Commercial terms: %d | Sections: %d",
        len(result.requirements),
        len(result.context_facts),
        len(result.commercial_terms),
        len(result.document_sections),
    )
    return result


def _safe(val, default=""):
    """Return val if truthy, else default."""
    return val if val else default


def _build_requirement(r: dict) -> Requirement:
    return Requirement(
        id=r.get("id", ""),
        original_text=_safe(r.get("original_text")),
        ears_normalized=_safe(r.get("ears_normalized")),
        ears_type=EARSType(r.get("ears_type", "ubiquitous")),
        trigger_condition=_safe(r.get("trigger_condition")),
        actor=_safe(r.get("actor")),
        action=_safe(r.get("action")),
        constraint=_safe(r.get("constraint")),
        priority=RequirementPriority(r.get("priority", "mandatory")),
        verification=VerificationMethod(r.get("verification", "not_specified")),
        references_standard=_safe(r.get("references_standard")),
        has_penalty=bool(r.get("has_penalty", False)),
        source_section=_safe(r.get("source_section")),
        source_page=int(r.get("source_page", 0)),
        response_cluster=_safe(r.get("response_cluster", "other")),
        ambiguity_flag=bool(r.get("ambiguity_flag", False)),
        ambiguity_notes=_safe(r.get("ambiguity_notes")),
    )


def _build_context_fact(cf: dict) -> ContextFact:
    return ContextFact(
        id=cf.get("id", ""),
        text=_safe(cf.get("text")),
        category=_safe(cf.get("category", "site")),
        source_section=_safe(cf.get("source_section")),
        source_page=int(cf.get("source_page", 0)),
    )


def _build_commercial_term(ct: dict) -> CommercialTerm:
    return CommercialTerm(
        id=ct.get("id", ""),
        text=_safe(ct.get("text")),
        category=_safe(ct.get("category", "payment")),
        source_section=_safe(ct.get("source_section")),
        source_page=int(ct.get("source_page", 0)),
    )


# ---------------------------------------------------------------------------
# Cross-referencing pass (optional second LLM call)
# ---------------------------------------------------------------------------

XREF_SYSTEM = textwrap.dedent("""\
You are a requirements quality reviewer.  You will receive a JSON list of
extracted requirements from an energy tender.  Your tasks:

1. Flag any DUPLICATE or OVERLAPPING requirements (same obligation stated
   in different words).  Return their IDs as pairs.
2. Flag CONTRADICTIONS — requirements that conflict with each other.
3. Flag GAPS — important areas that are typically covered in energy tenders
   but appear to be MISSING from this extraction (e.g. no commissioning
   requirements, no cybersecurity, no decommissioning clause, etc.).
4. Provide a short EXECUTIVE SUMMARY of the tender's key demands.

Respond with ONLY valid JSON:
{
  "duplicates": [{"ids": ["REQ-X", "REQ-Y"], "reason": "..."}],
  "contradictions": [{"ids": ["REQ-X", "REQ-Y"], "reason": "..."}],
  "gaps": [{"area": "...", "explanation": "..."}],
  "executive_summary": "..."
}
""")


def cross_reference(
    client: Anthropic, result: ExtractionResult, model: str
) -> dict:
    """Run a quality / cross-reference pass over all extracted requirements."""
    # Build a compact representation to fit in context
    compact = [
        {
            "id": r.id,
            "ears_normalized": r.ears_normalized,
            "ears_type": r.ears_type.value,
            "priority": r.priority.value,
            "response_cluster": r.response_cluster,
            "constraint": r.constraint,
            "ambiguity_flag": r.ambiguity_flag,
        }
        for r in result.requirements
    ]
    user_msg = json.dumps(compact, indent=1)

    log.info("Running cross-reference quality pass over %d requirements …", len(compact))
    response = client.messages.create(
        model=model,
        max_tokens=MAX_TOKENS,
        system=XREF_SYSTEM,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = "\n".join(b.text for b in response.content if b.type == "text")
    try:
        return parse_llm_response(raw)
    except json.JSONDecodeError:
        log.warning("Cross-reference pass returned unparseable JSON.")
        return {"duplicates": [], "contradictions": [], "gaps": [], "executive_summary": ""}


# ---------------------------------------------------------------------------
# Language detection & translation
# ---------------------------------------------------------------------------

DETECT_SYSTEM = textwrap.dedent("""\
You are a language identification expert.  You will receive a text sample
from a PDF document.  Identify the primary language of the CONTENT (ignore
any English boilerplate like headers, URLs, or standard abbreviations).

Respond with ONLY valid JSON — no markdown fences:
{
  "language_code": "<ISO 639-1 code, e.g. de, fr, es, en>",
  "language_name": "<English name, e.g. German, French, Spanish, English>",
  "confidence": "<high | medium | low>"
}
""")


def detect_language(client: Anthropic, pages: list[dict], model: str) -> dict:
    """Detect the primary language of the tender using a sample of pages."""
    # Sample from start, middle, and end to handle mixed-language docs
    sample_indices = [0]
    if len(pages) > 4:
        sample_indices.append(len(pages) // 2)
    if len(pages) > 1:
        sample_indices.append(len(pages) - 1)

    sample_text = "\n\n---\n\n".join(
        f"[PAGE {pages[i]['page_number']}]\n{pages[i]['text'][:1500]}"
        for i in sample_indices
        if pages[i]["text"].strip()
    )

    response = client.messages.create(
        model=model,
        max_tokens=256,
        system=DETECT_SYSTEM,
        messages=[{"role": "user", "content": sample_text}],
    )
    raw = "\n".join(b.text for b in response.content if b.type == "text")
    try:
        result = parse_llm_response(raw)
        log.info(
            "Detected language: %s (%s) — confidence: %s",
            result.get("language_name", "?"),
            result.get("language_code", "?"),
            result.get("confidence", "?"),
        )
        return result
    except json.JSONDecodeError:
        log.warning("Language detection returned unparseable JSON, assuming English.")
        return {"language_code": "en", "language_name": "English", "confidence": "low"}


# Maximum characters per translation chunk.  Markdown is less dense than
# raw prose so we can afford ~12k chars which maps to roughly 3-4k tokens.
TRANSLATE_CHUNK_SIZE = 12_000

TRANSLATE_SYSTEM = textwrap.dedent("""\
You are an expert technical translator specialising in energy-sector
engineering documents.  Translate the following Markdown content into
English.  Preserve ALL Markdown formatting exactly — headings, tables,
bold, links, emoji markers, blockquotes, code fences, etc.

Rules:
- Translate ALL non-English text, including requirement descriptions,
  ambiguity notes, context facts, and commercial terms.
- Keep technical identifiers unchanged: requirement IDs (REQ-001),
  context IDs (CTX-001), commercial IDs (COM-001), section references
  (§3.2.1), standard names (IEC 61850, EN 50549), units (MW, kV, Hz).
- Keep EARS type labels in English (ubiquitous, event_driven, etc.)
  as they are already in English in the source.
- Keep the Markdown structural keywords in English (e.g. table headers
  like "EARS Type", "Count", "Priority", "Cluster").
- Produce a natural, professional English translation — not word-for-word.
- Do NOT add any commentary, notes, or explanations. Return ONLY the
  translated Markdown.
""")


def translate_markdown(
    client: Anthropic, markdown: str, source_language: str, model: str
) -> str:
    """Translate a Markdown report into English, processing in chunks."""
    # Split on double newlines to avoid breaking mid-table or mid-section
    sections = markdown.split("\n\n")
    chunks: list[str] = []
    current_chunk: list[str] = []
    current_len = 0

    for section in sections:
        section_len = len(section)
        if current_len + section_len > TRANSLATE_CHUNK_SIZE and current_chunk:
            chunks.append("\n\n".join(current_chunk))
            current_chunk = [section]
            current_len = section_len
        else:
            current_chunk.append(section)
            current_len += section_len

    if current_chunk:
        chunks.append("\n\n".join(current_chunk))

    log.info(
        "Translating report from %s to English in %d chunk(s) …",
        source_language, len(chunks),
    )

    translated_parts: list[str] = []
    for i, chunk in enumerate(chunks):
        log.info("Translating chunk %d/%d …", i + 1, len(chunks))
        user_msg = (
            f"Source language: {source_language}\n\n"
            f"--- BEGIN MARKDOWN ---\n{chunk}\n--- END MARKDOWN ---"
        )
        response = client.messages.create(
            model=model,
            max_tokens=MAX_TOKENS,
            system=TRANSLATE_SYSTEM,
            messages=[{"role": "user", "content": user_msg}],
        )
        translated = "\n".join(
            b.text for b in response.content if b.type == "text"
        )
        translated_parts.append(translated.strip())

    return "\n\n".join(translated_parts)


# ---------------------------------------------------------------------------
# Markdown report generation
# ---------------------------------------------------------------------------

def generate_markdown(
    result: ExtractionResult,
    xref: dict,
    pdf_name: str,
) -> str:
    lines: list[str] = []
    w = lines.append  # shorthand

    w(f"# Tender Requirements Analysis: {pdf_name}\n")

    # Executive summary
    if xref.get("executive_summary"):
        w("## Executive Summary\n")
        w(xref["executive_summary"] + "\n")

    # Stats
    w("## Extraction Statistics\n")
    ears_counts = {}
    priority_counts = {}
    cluster_counts = {}
    ambiguous_count = 0
    penalty_count = 0
    for r in result.requirements:
        ears_counts[r.ears_type.value] = ears_counts.get(r.ears_type.value, 0) + 1
        priority_counts[r.priority.value] = priority_counts.get(r.priority.value, 0) + 1
        cluster_counts[r.response_cluster] = cluster_counts.get(r.response_cluster, 0) + 1
        if r.ambiguity_flag:
            ambiguous_count += 1
        if r.has_penalty:
            penalty_count += 1

    w(f"| Metric | Count |")
    w(f"|--------|-------|")
    w(f"| Total requirements | {len(result.requirements)} |")
    w(f"| Context facts | {len(result.context_facts)} |")
    w(f"| Commercial terms | {len(result.commercial_terms)} |")
    w(f"| Ambiguous (needs review) | {ambiguous_count} |")
    w(f"| Penalty-linked | {penalty_count} |")
    w("")

    w("### EARS Classification Breakdown\n")
    w("| EARS Type | Count |")
    w("|-----------|-------|")
    for etype, cnt in sorted(ears_counts.items()):
        w(f"| {etype} | {cnt} |")
    w("")

    w("### Priority Distribution\n")
    w("| Priority | Count |")
    w("|----------|-------|")
    for prio, cnt in sorted(priority_counts.items()):
        w(f"| {prio} | {cnt} |")
    w("")

    w("### Response Cluster Distribution\n")
    w("| Cluster | Count |")
    w("|---------|-------|")
    for cluster, cnt in sorted(cluster_counts.items()):
        w(f"| {cluster} | {cnt} |")
    w("")

    # Document structure
    if result.document_sections:
        w("## Document Structure\n")
        w("| Section | Title | Page |")
        w("|---------|-------|------|")
        for ds in result.document_sections:
            w(f"| {ds.get('section_number', '')} | {ds.get('title', '')} | {ds.get('page_start', '')} |")
        w("")

    # Requirements grouped by response cluster
    w("## Requirements by Response Cluster\n")
    clusters: dict[str, list[Requirement]] = {}
    for r in result.requirements:
        clusters.setdefault(r.response_cluster, []).append(r)

    for cluster_name in sorted(clusters):
        reqs = clusters[cluster_name]
        w(f"### {cluster_name.replace('_', ' ').title()} ({len(reqs)} requirements)\n")
        for r in reqs:
            penalty_tag = " ⚠️ PENALTY" if r.has_penalty else ""
            ambiguity_tag = " 🔍 AMBIGUOUS" if r.ambiguity_flag else ""
            w(f"#### {r.id} [{r.ears_type.value}] [{r.priority.value}]{penalty_tag}{ambiguity_tag}\n")
            w(f"**Original text:** {r.original_text}\n")
            w(f"**EARS normalized:** {r.ears_normalized}\n")
            if r.trigger_condition:
                w(f"**Trigger:** {r.trigger_condition}\n")
            w(f"**Actor:** {r.actor} | **Action:** {r.action}\n")
            if r.constraint:
                w(f"**Constraint:** {r.constraint}\n")
            w(f"**Verification:** {r.verification.value}")
            if r.references_standard:
                w(f" | **Standard:** {r.references_standard}")
            w(f" | **Source:** §{r.source_section} (p.{r.source_page})\n")
            if r.ambiguity_flag and r.ambiguity_notes:
                w(f"> ⚠️ **Ambiguity:** {r.ambiguity_notes}\n")
            w("")

    # Ambiguity register (collected view)
    ambiguous_reqs = [r for r in result.requirements if r.ambiguity_flag]
    if ambiguous_reqs:
        w("## Ambiguity Register — Items Requiring Clarification\n")
        w("| ID | EARS Type | Issue | Source |")
        w("|----|-----------|-------|--------|")
        for r in ambiguous_reqs:
            w(f"| {r.id} | {r.ears_type.value} | {r.ambiguity_notes} | §{r.source_section} p.{r.source_page} |")
        w("")

    # Context facts
    if result.context_facts:
        w("## Context Facts & Constraints\n")
        cats: dict[str, list[ContextFact]] = {}
        for cf in result.context_facts:
            cats.setdefault(cf.category, []).append(cf)
        for cat in sorted(cats):
            w(f"### {cat.title()}\n")
            for cf in cats[cat]:
                w(f"- **{cf.id}** (§{cf.source_section}, p.{cf.source_page}): {cf.text}")
            w("")

    # Commercial terms
    if result.commercial_terms:
        w("## Commercial Terms\n")
        ccat: dict[str, list[CommercialTerm]] = {}
        for ct in result.commercial_terms:
            ccat.setdefault(ct.category, []).append(ct)
        for cat in sorted(ccat):
            w(f"### {cat.title()}\n")
            for ct in ccat[cat]:
                w(f"- **{ct.id}** (§{ct.source_section}, p.{ct.source_page}): {ct.text}")
            w("")

    # Quality analysis
    w("## Quality Analysis\n")

    dupes = xref.get("duplicates", [])
    if dupes:
        w("### Potential Duplicates\n")
        for d in dupes:
            w(f"- {', '.join(d['ids'])}: {d['reason']}")
        w("")

    contras = xref.get("contradictions", [])
    if contras:
        w("### Contradictions\n")
        for c in contras:
            w(f"- {', '.join(c['ids'])}: {c['reason']}")
        w("")

    gaps = xref.get("gaps", [])
    if gaps:
        w("### Coverage Gaps\n")
        for g in gaps:
            w(f"- **{g['area']}**: {g['explanation']}")
        w("")

    if not dupes and not contras and not gaps:
        w("No duplicates, contradictions, or coverage gaps detected.\n")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run_pipeline(pdf_path: Path, output_path: Path, model: str, skip_translation: bool = False) -> None:
    client = Anthropic()  # Uses ANTHROPIC_API_KEY env var

    # 1. Extract text from PDF
    pages = extract_pdf_text(pdf_path)
    if not pages:
        log.error("No pages extracted from %s", pdf_path)
        sys.exit(1)

    # 2. Detect document language
    lang_info = detect_language(client, pages, model)
    is_english = lang_info.get("language_code", "en").startswith("en")

    # 3. Chunk pages for processing
    chunks = chunk_pages(pages)
    log.info("Split into %d chunks of up to %d pages each.", len(chunks), PAGES_PER_CHUNK)

    # 4. Process each chunk through the LLM
    chunk_results: list[dict] = []
    id_offsets = {"req": 1, "ctx": 1, "com": 1}

    for i, chunk in enumerate(chunks):
        data = extract_chunk(client, chunk, i, len(chunks), model, id_offsets)
        chunk_results.append(data)
        # Update offsets for next chunk
        id_offsets["req"] += len(data.get("requirements", []))
        id_offsets["ctx"] += len(data.get("context_facts", []))
        id_offsets["com"] += len(data.get("commercial_terms", []))

    # 5. Merge and deduplicate
    result = merge_results(chunk_results)

    # 6. Cross-reference quality pass
    xref = cross_reference(client, result, model)

    # 7. Generate Markdown report
    md = generate_markdown(result, xref, pdf_path.name)

    # 8. Translate to English if source language is not English
    if not is_english and not skip_translation:
        source_lang = lang_info.get("language_name", "Unknown")
        log.info("Source language is %s — translating report to English …", source_lang)

        # Save the original-language report alongside the English version
        orig_path = output_path.with_stem(output_path.stem + f"_{lang_info.get('language_code', 'orig')}")
        orig_path.write_text(md, encoding="utf-8")
        log.info("Original-language report written to %s", orig_path)

        md = translate_markdown(client, md, source_lang, model)
        log.info("Translation complete.")
    elif is_english:
        log.info("Document is in English — skipping translation.")

    output_path.write_text(md, encoding="utf-8")
    log.info("Report written to %s", output_path)

    # 9. Also dump raw JSON for downstream pipeline consumption
    json_path = output_path.with_suffix(".json")
    raw_data = {
        "source_language": lang_info,
        "requirements": [asdict(r) for r in result.requirements],
        "context_facts": [asdict(cf) for cf in result.context_facts],
        "commercial_terms": [asdict(ct) for ct in result.commercial_terms],
        "document_sections": result.document_sections,
        "quality_analysis": xref,
    }
    json_path.write_text(json.dumps(raw_data, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("Raw JSON written to %s", json_path)


def main():
    parser = argparse.ArgumentParser(
        description="Extract and classify requirements from energy-market tender PDFs.",
    )
    parser.add_argument("pdf", type=Path, help="Path to the tender PDF")
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=None,
        help="Output Markdown file path (default: <pdf_name>_requirements.md)",
    )
    parser.add_argument(
        "--model", "-m",
        type=str,
        default=DEFAULT_MODEL,
        help=f"Anthropic model to use (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--no-translate",
        action="store_true",
        default=False,
        help="Skip automatic translation to English for non-English tenders",
    )
    args = parser.parse_args()

    if not args.pdf.exists():
        log.error("File not found: %s", args.pdf)
        sys.exit(1)

    output = args.output or args.pdf.with_name(args.pdf.stem + "_requirements.md")
    run_pipeline(args.pdf, output, args.model, skip_translation=args.no_translate)


if __name__ == "__main__":
    main()
