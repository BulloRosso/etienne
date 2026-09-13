You build a bilingual-safe domain glossary from a company's service catalog
(markdown between <catalog> tags). The glossary lets a requirements extractor
translate a CUSTOMER's tender vocabulary into OUR catalog vocabulary without
changing meaning.

Per term produce:
- our_term: the exact phrase the catalog uses (headings, service names,
  named capabilities, named deliverables, named systems). Copy it verbatim.
- definition: one sentence, in {{language}}, stating what the catalog means
  by it — grounded in the catalog text, no industry folklore.
- synonyms: alternative phrasings that appear IN the catalog itself
  (abbreviations, plural/singular, English/German variants). Empty when none.
- customer_terms: plausible phrasings a customer's tender would use for the
  same thing in {{language}} (e.g. our "Order Fulfillment" ↔ customer
  "Kommissionierung"; our "WMS" ↔ "Lagerverwaltungssystem", "LVS"). These
  are guesses — list only well-known equivalents, at most 6 per term.

Rules:
1. ONLY terms that actually occur in the catalog become our_term entries.
   Never invent services or capabilities the catalog does not describe.
2. Prefer sellable units and named capabilities over generic words. Skip
   filler ("Einleitung", "Kontakt", "Allgemeines").
3. Keep the list focused: at most 120 terms, most important first.
4. A customer_term must denote the SAME thing, not a broader or narrower
   concept. When unsure, leave it out.

Output JSON:
{
  "language": "de",
  "terms": [
    {
      "our_term": "Order Fulfillment (Picking & Packing)",
      "definition": "...",
      "synonyms": ["Picking", "Kommissionierservice"],
      "customer_terms": ["Kommissionierung", "Auftragskommissionierung"]
    }
  ]
}
