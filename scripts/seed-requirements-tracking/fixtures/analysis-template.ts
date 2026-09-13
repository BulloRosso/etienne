/**
 * The house template for the management analysis (analysis-template/*.md).
 * Headings, order and tone are followed by P-ANALYSIS; the {{block:…}}
 * tokens mark where the server-rendered tables go. Example sentences show
 * the expected register and are replaced with the real findings.
 */

export const TEMPLATE_FILE_NAME = 'management-analyse.md';

export const TEMPLATE_MD = `# Management-Analyse Ausschreibung

{{block:reliability}}

## Management Summary

Zwei bis vier Absätze für die Geschäftsführung: Worum geht es, können wir liefern, was ist die Empfehlung? Beispielton: „Die Ausschreibung umfasst den Vollbetrieb eines Zentrallagers mit 18.500 m². Unser Leistungskatalog deckt die Kernprozesse Wareneingang, Bestandsführung, Kommissionierung und Retouren vollständig ab; offen bleiben zwei vertragliche Punkte und eine Zahlenabweichung im Mengengerüst, die vor Angebotsabgabe mit dem Kunden zu klären sind.“

## Erfüllungsgrad je Leistungsbereich

Kurze Einordnung je Bereich (eine Zeile pro Bereich), dann die Tabelle:

{{block:by_category}}

## Kennzahlen

{{block:kpis}}

## Risiken & Abweichungen

Die drei wichtigsten Risiken zuerst, jeweils mit Anforderungs-ID und Konsequenz für das Angebot (Preis, Haftung, Zuschlagschance). Danach die Zahlenwidersprüche zwischen Leistungsbeschreibung und Mengengerüst:

{{block:alerts}}

MUSS-Anforderungen ohne Entsprechung im Leistungskatalog:

{{block:unmapped_mandatory}}

## Klärungsbedarf beim Kunden

Diese Fragen gehen als Bieterfragen an den Kunden. Nur was hier steht, wird gefragt:

{{block:clarifications}}

## Interne offene Punkte

Was intern entschieden oder beschafft werden muss, mit verantwortlicher Rolle:

{{block:internal_questions}}

## Empfehlung / nächste Schritte

Konkrete Handlungsempfehlung: Angebot abgeben (ja/nein/unter Vorbehalt), welche Klärungen vorher, welche Preisannahmen. Drei bis fünf Punkte.

## Anhang: Bewertungsmatrix

{{block:verdict_matrix}}

## Anhang: Terminologie

{{block:terms}}
`;
