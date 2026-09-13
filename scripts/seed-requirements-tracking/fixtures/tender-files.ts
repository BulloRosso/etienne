/**
 * Synthetic tender documents (domain: Lagerlogistik / Kontraktlogistik).
 * Rendered to DOCX by lib/docx-writer.ts; `# ` lines become headings.
 *
 * Deliberate demo hooks:
 *  - "12.400 Palettenstellplätze" contradicts the workbook (12.000) → exactly one alert
 *  - "1,45 Mio. €" equals the workbook's 1.450.000 € → no false alert
 *  - "Retouren sind zeitnah zu bearbeiten" → vague term → customer clarification
 *  - Gefahrgut Klasse 3 → excluded in our catalog → PARTIAL / NON_COMPLIANT
 *  - "muss … buchen können" → exercises the one-obligation heuristic
 */

export interface TenderDocFixture {
  fileName: string;
  title: string;
  body: string;
}

export const LEISTUNGSBESCHREIBUNG: TenderDocFixture = {
  fileName: '01-leistungsbeschreibung-lagerlogistik.docx',
  title: 'Leistungsbeschreibung Betrieb Logistikzentrum Nord',
  body: `# 1 Gegenstand der Ausschreibung

Die Nordland Handels AG (Auftraggeber) schreibt den Betrieb ihres Logistikzentrums Nord in Bremen als Kontraktlogistik-Dienstleistung aus. Der Auftragnehmer übernimmt Wareneingang, Lagerung, Kommissionierung, Warenausgang und Retourenabwicklung für das Sortiment Haushaltswaren und Elektrokleingeräte.

Der Betrieb erfolgt im bestehenden Gebäude des Auftraggebers. Der Auftraggeber stellt Gebäude, Regaltechnik und Flurförderzeuge bereit.

# 2 Mengengerüst

Die Lagerfläche beträgt 18.500 m² Hallenfläche, davon 1.200 m² temperaturgeführte Kühlzone (2–8 °C). Im Hochregallager und im Blocklager sind insgesamt 12.400 Palettenstellplätze vorzuhalten.

Im Durchschnitt sind 2.300 Pickpositionen pro Tag zu kommissionieren; in Spitzenzeiten (November/Dezember) bis zu 3.800 Pickpositionen pro Tag. Das Sortiment umfasst rund 9.500 aktive Artikel.

# 3 Wareneingang

Der Auftragnehmer muss angelieferte Ware innerhalb von 4 Stunden nach Entladung im Lagerverwaltungssystem des Auftraggebers buchen.

Der Auftragnehmer muss jede Palette bei Vereinnahmung auf Transportschäden prüfen und Abweichungen mit Foto dokumentieren.

Ladungsträger (Europaletten, Gitterboxen) sind im Tauschverfahren zu verwalten.

# 4 Lagerung und Bestandsführung

Der Auftragnehmer muss eine Inventurgenauigkeit von mindestens 99,5 % gewährleisten; der Nachweis erfolgt durch permanente Inventur mit monatlichen Stichproben.

Die Bestände müssen jederzeit im Lagerverwaltungssystem des Auftraggebers in Echtzeit abrufbar sein; der Auftragnehmer muss Bestandsbewegungen innerhalb von 15 Minuten buchen können.

Gefahrgüter der Klasse 3 (entzündbare Flüssigkeiten, z. B. Reinigungsmittel) müssen in einem separaten Gefahrgutlager gemäß TRGS 510 gelagert werden.

Der Auftragnehmer darf Ware der Kühlzone nicht außerhalb des Temperaturbereichs von 2–8 °C lagern.

# 5 Kommissionierung und Warenausgang

Der Auftragnehmer muss Aufträge, die bis 14:00 Uhr im Lagerverwaltungssystem freigegeben werden, am selben Werktag kommissionieren, verpacken und an den Paketdienst übergeben.

Die Kommissionierfehlerquote darf 0,3 % der Auftragspositionen nicht überschreiten.

Der Auftragnehmer soll Mehrfachbestellungen eines Kunden zu einer Sendung konsolidieren.

Der Warenausgang muss elektronisch mit Sendungsnummer an den Auftraggeber gemeldet werden.

# 6 Retourenabwicklung

Retouren sind zeitnah zu bearbeiten und nach Prüfung wieder einzulagern oder zu verschrotten.

Der Auftragnehmer muss die Retourenquote monatlich je Artikelgruppe berichten.

# 7 IT-Anbindung

Der Auftragnehmer muss sein Lagerverwaltungssystem über eine Schnittstelle an das ERP-System des Auftraggebers (SAP S/4HANA) anbinden; alternativ kann das Lagerverwaltungssystem des Auftraggebers genutzt werden.

Alle Buchungen müssen revisionssicher protokolliert werden.

# 8 Service-Level und Berichtswesen

Der Auftragnehmer muss einen monatlichen Leistungsbericht mit den Kennzahlen Inventurgenauigkeit, Kommissionierfehlerquote, Termintreue und Retourenquote vorlegen.

Störungen des Lagerbetriebs müssen innerhalb von 2 Stunden dem Ansprechpartner des Auftraggebers gemeldet werden.

Der Auftragnehmer soll Vorschläge zur Prozessoptimierung quartalsweise einbringen.
`,
};

export const VERTRAGSBEDINGUNGEN: TenderDocFixture = {
  fileName: '02-vertragsbedingungen.docx',
  title: 'Vergabe- und Vertragsbedingungen',
  body: `# 1 Vertragslaufzeit

Der Vertrag beginnt am 01.04.2027 und hat eine feste Laufzeit von 48 Monaten. Der Auftraggeber kann den Vertrag zweimal um jeweils 12 Monate verlängern.

# 2 Vergütung

Das Jahresbudget für den Lagerbetrieb beträgt 1,45 Mio. € netto. Die Vergütung erfolgt nach Leistungsmengen (Preis je Palettenbewegung, je Pickposition und je Retoure) gemäß Preisblatt.

Der Auftragnehmer muss die Preise für die Vertragslaufzeit fest anbieten; eine Anpassung ist nur bei einer Änderung des Tariflohns um mehr als 3 % zulässig.

# 3 Bonus-Malus

Bei Unterschreitung der Inventurgenauigkeit von 99,5 % in zwei aufeinanderfolgenden Monaten muss der Auftragnehmer einen Malus von 2 % der Monatsvergütung leisten.

Bei Überschreitung einer Termintreue von 99 % über ein Quartal erhält der Auftragnehmer einen Bonus von 1 % der Quartalsvergütung.

# 4 Personal

Der Auftragnehmer muss die derzeit im Logistikzentrum Nord beschäftigten 62 Mitarbeitenden gemäß § 613a BGB übernehmen.

Der Auftragnehmer muss die Mitarbeitenden vor Betriebsstart in einer Schulung von 3 Tagen in die Prozesse und das Lagerverwaltungssystem einweisen.

# 5 Haftung und Versicherung

Der Auftragnehmer haftet für Bestandsdifferenzen oberhalb der vereinbarten Inventurgenauigkeit bis zu einer Höhe von 250.000 € je Vertragsjahr.

Der Auftragnehmer muss eine Lagerhaftpflichtversicherung mit einer Deckungssumme von mindestens 5 Mio. € nachweisen.

# 6 Angebotsabgabe

Angebote sind bis zum 15.11.2026, 12:00 Uhr elektronisch über die Vergabeplattform einzureichen. Bieterfragen sind bis zum 30.10.2026 zulässig.
`,
};

export const TENDER_DOCS: TenderDocFixture[] = [LEISTUNGSBESCHREIBUNG, VERTRAGSBEDINGUNGEN];

/** Figures that must appear verbatim in the DOCX text (dry-run integrity check). */
export const TENDER_FIGURES_IN_TEXT = [
  '18.500 m²',
  '1.200 m²',
  '12.400 Palettenstellplätze',
  '2.300 Pickpositionen',
  '3.800 Pickpositionen',
  '9.500 aktive Artikel',
  '4 Stunden',
  '99,5 %',
  '15 Minuten',
  '0,3 %',
  '48 Monaten',
  '1,45 Mio. €',
  '62 Mitarbeitenden',
  '3 Tagen',
  '250.000 €',
  '5 Mio. €',
  '2 Stunden',
];
