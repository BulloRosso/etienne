/**
 * OUR service catalog (Hansa Logistik GmbH) in OUR vocabulary — deliberately
 * different from the customer's wording ("Order Fulfillment" vs.
 * "Kommissionierung", "WMS" vs. "Lagerverwaltungssystem", "Inbound-Handling"
 * vs. "Wareneingang"), plus the user glossary that maps the two.
 *
 * Scope exclusions are the load-bearing demo content: Gefahrgutlagerung is
 * "Nicht Bestandteil", so the tender's Gefahrgut requirement cannot be FULL.
 */

export const CATALOG_FILE_NAME = 'leistungskatalog.md';
export const GLOSSARY_FILE_NAME = 'glossary.md';

export const CATALOG_MD = `# Leistungskatalog Kontraktlogistik — Hansa Logistik GmbH

Stand 2026-09. Jede Leistung ist ein eigenständig anbietbares Modul; Leistungsgrenzen und Voraussetzungen sind je Modul ausgewiesen.

## Inbound-Handling

Entladung, Vereinnahmung und Qualitätsprüfung eingehender Ware. Buchung im WMS innerhalb von 2 Stunden nach Entladung. Schadensdokumentation mit Foto-Protokoll je Ladungsträger. Ladungsträgertausch (EPAL, Gitterbox) inklusive Kontoführung.

Enthalten: Entladung, Wareneingangsprüfung, WMS-Buchung, Ladungsträgerkonto, Foto-Schadensprotokoll
Liefergegenstand: Wareneingangsprotokoll je Anlieferung

## Bestandsführung & permanente Inventur

Bestandsführung im WMS in Echtzeit; Buchung jeder Bestandsbewegung innerhalb von 10 Minuten. Permanente Inventur mit täglichen Zählungen, garantierte Inventurgenauigkeit 99,7 %. Stichtagsinventur auf Wunsch mit Wirtschaftsprüfer-Testat.

Enthalten: permanente Inventur, Bestandsberichte, Stichtagsinventur, Differenzklärung
Nicht Bestandteil: Lagerung von Gefahrgut der Klassen 1–3
Voraussetzung: kundenseitige ERP-Schnittstelle (IDoc oder REST) oder Nutzung unseres WMS

## Temperaturgeführte Lagerung 2–8 °C

Betrieb von Kühlzonen mit lückenloser Temperaturaufzeichnung, Alarmkette bei Abweichungen und jährlicher Kalibrierung der Sensoren.

Enthalten: Temperaturmonitoring, Alarmkette, Kalibrierung
Voraussetzung: Kühltechnik wird vom Auftraggeber gestellt

## Order Fulfillment (Picking & Packing)

Auftragskommissionierung mit Pick-by-Scan, Verpackung und Etikettierung. Same-Day-Versand für Aufträge, die bis 15:00 Uhr freigegeben sind. Kommissionierfehlerquote unter 0,2 % der Auftragspositionen.

Enthalten: Picking, Packing, Versandetiketten, Auftragskonsolidierung
Nicht Bestandteil: Zollabwicklung

## Outbound-Handling & Versandkonsolidierung

Bereitstellung und Übergabe an KEP-Dienstleister und Spediteure; elektronische Versandmeldung mit Sendungsnummer an das ERP des Auftraggebers; Konsolidierung von Mehrfachbestellungen zu einer Sendung.

Enthalten: Versandbereitstellung, Sendungsmeldung, Konsolidierung

## Returns Management

Annahme, Prüfung, Wiedereinlagerung oder Entsorgung von Retouren innerhalb von 48 Stunden nach Eingang. Monatliches Retouren-Reporting je Warengruppe.

Enthalten: Retourenannahme, Qualitätsprüfung, Wiedereinlagerung, Entsorgung, Retouren-Reporting

## WMS-Integration (SAP EWM, API)

Unser WMS bietet Standardschnittstellen zu SAP S/4HANA (IDoc), SAP EWM und REST-APIs. Revisionssichere Protokollierung aller Buchungen mit zehnjähriger Aufbewahrung. Alternativ arbeiten unsere Teams im WMS des Auftraggebers.

Enthalten: Schnittstellenbetrieb, Monitoring, revisionssichere Protokollierung

## Value Added Services (Co-Packing)

Displaybau, Umverpackung, Set-Bildung, Preisauszeichnung.

Enthalten: Co-Packing, Displaybau, Preisauszeichnung

## Betriebsübernahme & Personal

Übernahme bestehender Belegschaften nach § 613a BGB, Einarbeitung neuer Mitarbeitender in 5 Tagen, Schichtplanung und Peak-Personal über Partnerpool.

Enthalten: Betriebsübergang, Einarbeitung, Schichtplanung
Voraussetzung: Personalunterlagen liegen 8 Wochen vor Betriebsstart vor

## Reporting & Service-Level

Monatlicher KPI-Bericht (Inventurgenauigkeit, Fehlerquote, Termintreue, Retourenquote), Störungsmeldung an den Auftraggeber innerhalb von 1 Stunde, quartalsweise Prozessreviews mit Optimierungsvorschlägen.

Enthalten: KPI-Bericht, Störungsmeldung, Prozessreview
Liefergegenstand: monatlicher Leistungsbericht als PDF
`;

export const GLOSSARY_MD = `# Glossar — Kundenbegriffe → unsere Begriffe

| Kundenbegriff | Unser Begriff | Hinweis |
|---|---|---|
| Kommissionierung | Order Fulfillment (Picking & Packing) | inkl. Verpackung und Etikettierung |
| Lagerverwaltungssystem | WMS | Warehouse Management System |
| LVS | WMS | |
| Retourenabwicklung | Returns Management | |
| Wareneingang | Inbound-Handling | Entladung + Vereinnahmung + Prüfung |
| Warenausgang | Outbound-Handling & Versandkonsolidierung | |
| Stichtagsinventur | Bestandsführung & permanente Inventur | Stichtagsinventur ist Teil des Moduls |
| Kühlzone | Temperaturgeführte Lagerung 2–8 °C | |
`;
