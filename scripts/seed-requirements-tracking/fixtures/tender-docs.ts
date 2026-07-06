/**
 * Tender documents + implementation artifacts for tendertrace-stadtwerke.
 *
 * Every evidence quote used by fixtures/requirements.ts and fixtures/drift.ts
 * is a VERBATIM substring of these markdown bodies (the backend's
 * submit_proposal validates that server-side). Keep load-bearing sentences on
 * a single line — the quote check is an exact substring match first.
 *
 * Section numbering (see IngestionService.sectionize): every #/##/###/####
 * heading line starts a new section; sections are numbered 1..n in order of
 * appearance, so the leading `# <title>` block is section 1 and each
 * `## …` heading advances the counter by one.
 */

export interface TenderDocFixture {
  /** stable key the orchestrator uses to look up captured docIds */
  key: string;
  title: string;
  kind: 'tender' | 'artifact';
  artifactType?: 'email' | 'minutes' | 'change_request' | 'spec' | 'paste';
  artifactDate?: string;
  artifactParties?: string;
  markdown: string;
}

// ─── Tender documents (registered 2026-04-01) ────────────────────────────────

export const TENDER_DOCS: TenderDocFixture[] = [
  {
    key: 'leistungsbeschreibung',
    title: 'Leistungsbeschreibung Kundenportal',
    kind: 'tender',
    markdown: `# Leistungsbeschreibung Kundenselfservice-Portal

Vergabeverfahren T-2026-014 der Stadtwerke Musterstadt GmbH. Gegenstand der Ausschreibung ist die Lieferung, Einführung und Anpassung eines webbasierten Kundenselfservice-Portals für die Sparten Strom, Gas und Wasser. Diese Leistungsbeschreibung definiert die fachlichen Anforderungen; die technischen und betrieblichen Anforderungen sind in der Technischen Anlage Sicherheit & Betrieb geregelt, die vertraglichen Pflichten in den Vertragsbedingungen.

## 1. Gegenstand der Leistung

Der Auftragnehmer liefert ein Kundenselfservice-Portal, über das Kundinnen und Kunden der Stadtwerke Musterstadt ihre Vertrags- und Verbrauchsdaten einsehen und Standardvorgänge ohne Kontakt zum Kundencenter abwickeln können. Das Portal ist an das vorhandene Abrechnungssystem des Auftraggebers anzubinden. Der Auftraggeber stellt die erforderliche Netzwerkinfrastruktur in seinen Liegenschaften bereit. Der Betrieb erfolgt im Rechenzentrum des Auftraggebers.

## 2. Benutzerkonto und Registrierung

Kunden müssen sich mit E-Mail-Adresse und Passwort am Portal anmelden können. Die Registrierung soll über ein Double-Opt-In-Verfahren per E-Mail bestätigt werden. Für die Erstregistrierung dient die Vertragskontonummer in Verbindung mit der Postleitzahl der Verbrauchsstelle als Identifikationsmerkmal. Vergessene Passwörter setzen Kunden eigenständig über einen zeitlich befristeten Link zurück.

## 3. Verbrauchsübersicht und Berichte

Das Portal soll den Energie- und Wasserverbrauch der letzten 24 Monate grafisch darstellen und einen Vergleich mit dem Vorjahreszeitraum anbieten. Kunden erhalten auf Abruf Verbrauchs- und Abrechnungsberichte für frei wählbare Zeiträume. Berichte sind als PDF bereitzustellen. Die dargestellten Werte müssen mit den Daten des Abrechnungssystems übereinstimmen.

## 4. Zählerstandserfassung

Wenn ein Kunde einen Zählerstand über das Portal meldet, muss das Portal den erfassten Wert auf Plausibilität gegen den letzten bekannten Zählerstand prüfen. Unplausible Werte werden dem Kunden unmittelbar mit einem Korrekturhinweis angezeigt. Erfasste Zählerstände sind an das Abrechnungssystem zu übergeben.

## 5. Leistung, Verfügbarkeit und Ausfallsicherheit

Das Portal muss auch bei hoher Last flüssig bedienbar bleiben. Die Antwortzeit darf 2 Sekunden nicht überschreiten. Das Portal soll eine Verfügbarkeit von 99,5 % im Jahresmittel erreichen. Für die Anbindung an das Abrechnungssystem sind eine Primär- und eine Sekundärverbindung vorzusehen. Bei Ausfall der Primärverbindung muss das System innerhalb von 30 Sekunden automatisch auf die Sekundärverbindung umschalten und den Administrator benachrichtigen.

## 6. Benachrichtigungen und mobile Nutzung

Über neue Rechnungen und Abschlagsänderungen werden Kunden per E-Mail informiert. Das Portal kann Kunden zusätzlich per SMS über neue Rechnungen informieren. Das Portal soll auf mobilen Endgeräten vollständig nutzbar sein. Das Portal kann zusätzlich eine englischsprachige Oberfläche anbieten. Eine native App ist nicht Gegenstand dieser Ausschreibung.
`,
  },
  {
    key: 'sicherheit',
    title: 'Technische Anlage Sicherheit & Betrieb',
    kind: 'tender',
    markdown: `# Technische Anlage Sicherheit & Betrieb

Diese Anlage zum Vergabeverfahren T-2026-014 regelt die Anforderungen an Datenhaltung, Informationssicherheit und Betrieb des Kundenselfservice-Portals. Sie gilt ergänzend zur Leistungsbeschreibung; bei Widersprüchen geht die jeweils strengere Anforderung vor.

## 1. Datenhaltung und Datenschutz

Das Portal verarbeitet personenbezogene Daten im Sinne der DSGVO. Alle Kundendaten verbleiben auf Systemen im Rechenzentrum des Auftraggebers (On-Premises). Eine Übermittlung personenbezogener Daten an Dritte oder in Drittländer findet nicht statt. Der Auftragnehmer schließt mit dem Auftraggeber einen Auftragsverarbeitungsvertrag nach Art. 28 DSGVO. Löschfristen richten sich nach dem Löschkonzept des Auftraggebers.

## 2. Authentifizierung und Verschlüsselung

Der Zugang für Mitarbeitende der Stadtwerke zum Administrationsbereich muss durch eine Zwei-Faktor-Authentifizierung geschützt werden. Sämtliche Datenübertragungen zwischen Endgerät, Portal und Abrechnungssystem müssen mit TLS 1.2 oder höher verschlüsselt werden. Passwörter werden ausschließlich als salted Hash gespeichert; die Passwortrichtlinie des Auftraggebers ist umzusetzen.

## 3. Protokollierung und Audit

Alle administrativen Zugriffe auf das Portal müssen revisionssicher protokolliert werden. Die Protokolle umfassen mindestens Zeitpunkt, Benutzerkennung und ausgeführte Aktion und sind vor nachträglicher Veränderung zu schützen. Der Auftraggeber behält sich jährliche Sicherheitsaudits durch einen externen Prüfer vor; der Auftragnehmer wirkt hieran mit.

## 4. Betrieb, SLA und Datensicherung

Der Auftragnehmer übernimmt die Pflege des Portals für die Vertragslaufzeit. Störungen der Prioritätsstufe 1 sind innerhalb von vier Stunden zu beheben, Störungen der Prioritätsstufe 2 innerhalb eines Arbeitstages. Es ist täglich eine Datensicherung durchzuführen; Sicherungen sind 30 Tage vorzuhalten. Sicherheitsupdates sollen innerhalb von 14 Tagen nach Veröffentlichung durch den Hersteller eingespielt werden.

## 5. Wartungsfenster

Geplante Wartungsarbeiten können außerhalb der Geschäftszeiten des Auftraggebers, in der Regel werktags zwischen 22:00 und 06:00 Uhr, durchgeführt werden. Wartungsarbeiten mit Betriebsunterbrechung sind dem Auftraggeber mindestens fünf Arbeitstage im Voraus anzukündigen.
`,
  },
  {
    key: 'vertrag',
    title: 'Vertragsbedingungen',
    kind: 'tender',
    markdown: `# Vertragsbedingungen

Besondere Vertragsbedingungen zum Vergabeverfahren T-2026-014 "Kundenselfservice-Portal" der Stadtwerke Musterstadt GmbH. Diese Bedingungen regeln die prozessualen und kaufmännischen Pflichten des Auftragnehmers; sie ergänzen die Leistungsbeschreibung und die Technische Anlage Sicherheit & Betrieb.

## 1. Schulung

Der Auftragnehmer muss vor Inbetriebnahme zwei Schulungstage für die Mitarbeitenden der Stadtwerke Musterstadt durchführen. Die Schulung umfasst die Administration des Portals sowie die Bearbeitung von Kundenvorgängen und findet in den Räumen des Auftraggebers statt. Schulungsunterlagen verbleiben beim Auftraggeber und dürfen intern weiterverwendet werden.

## 2. Dokumentation

Der Auftragnehmer hat eine vollständige Anwender- und Betriebsdokumentation in deutscher Sprache zu liefern. Die Dokumentation ist bei jeder wesentlichen Änderung des Portals fortzuschreiben und dem Auftraggeber in elektronischer Form zu übergeben. Sie umfasst mindestens Installationsanleitung, Administrationshandbuch und Benutzerleitfaden.

## 3. Hotline und Support

Der Auftragnehmer muss werktags von 8 bis 17 Uhr eine telefonische Hotline für Störungsmeldungen bereitstellen. Störungsmeldungen außerhalb dieser Zeiten werden über ein Ticketsystem entgegengenommen und am folgenden Arbeitstag bearbeitet. Die Hotline wird in deutscher Sprache betrieben.

## 4. Gewährleistung

Der Auftragnehmer soll eine Gewährleistung von 24 Monaten ab Abnahme anbieten. Innerhalb der Gewährleistungsfrist behebt der Auftragnehmer Mängel unentgeltlich; die Fristen der Technischen Anlage gelten entsprechend. Die Verjährung richtet sich im Übrigen nach den gesetzlichen Vorschriften.

## 5. Vergütung und Zahlungsweise

Die Vergütung erfolgt nach Zahlungsplan: 30 % bei Vertragsschluss, 50 % bei Bereitstellung zur Abnahme, 20 % nach erfolgreicher Abnahme. Rechnungen kann der Kunde künftig per SEPA-Lastschrift über das Portal begleichen. Alle Preise verstehen sich zuzüglich der gesetzlichen Umsatzsteuer.
`,
  },
];

// ─── Implementation artifacts (registered in the implementation phase) ──────

export const ARTIFACTS: TenderDocFixture[] = [
  {
    key: 'kw23',
    title: 'Jour-Fixe-Protokoll KW23',
    kind: 'artifact',
    artifactType: 'minutes',
    artifactDate: '2026-06-02',
    artifactParties: 'Stadtwerke Musterstadt (Hr. Weber, Fr. Kern), NovaSys GmbH (Sara, T. Brandt)',
    markdown: `# Jour-Fixe-Protokoll KW23

Projekt Kundenselfservice-Portal, Jour Fixe vom 02.06.2026, 10:00–11:00 Uhr.
Teilnehmende: Herr Weber und Frau Kern (Stadtwerke Musterstadt), Sara und Tobias Brandt (NovaSys GmbH).

## TOP 1 — Projektstand

Die Module Benutzerkonto, Verbrauchsübersicht und Zählerstandserfassung sind in der Testumgebung verfügbar. Frau Kern bestätigt, dass die Zählerstandserfassung wie in der Leistungsbeschreibung Abschnitt 4 beschrieben umgesetzt wird. Der Testbetrieb mit ausgewählten Pilotkunden beginnt planmäßig in KW25.

## TOP 2 — Lastverhalten und Antwortzeiten

Die Lasttests der vergangenen Woche wurden besprochen. Die Antwortzeitanforderung von 2 Sekunden gilt nach übereinstimmender Auffassung bei bis zu 500 gleichzeitigen Nutzern. NovaSys passt die Testszenarien entsprechend an; eine Vertragsänderung ist damit nicht verbunden.

## TOP 3 — Berichtsexport

Herr Weber (Stadtwerke) wünscht zusätzlich einen Export nach CSV und XML, nicht nur PDF. Hintergrund ist die Weiterverarbeitung der Berichte im Controlling der Stadtwerke. Sara weist darauf hin, dass die Leistungsbeschreibung ausschließlich PDF nennt und die Anforderung daher als Änderungswunsch zu bewerten ist. Klärung über das Änderungsverfahren.

## TOP 4 — Sonstiges

Nächster Jour Fixe am 16.06.2026. Das Protokoll gilt als genehmigt, sofern nicht binnen einer Woche widersprochen wird.
`,
  },
  {
    key: 'cloud-email',
    title: 'E-Mail Cloud-Anbindung',
    kind: 'artifact',
    artifactType: 'email',
    artifactDate: '2026-06-18',
    artifactParties: 'Fr. Kern (Stadtwerke Musterstadt) an Sara (NovaSys GmbH)',
    markdown: `# E-Mail Cloud-Anbindung

Von: Kern, Miriam (Stadtwerke Musterstadt)
An: Sara (NovaSys GmbH)
Datum: 18.06.2026 14:32
Betreff: Berichte — Ablage in der Cloud

Hallo Sara,

kurze Rückmeldung aus unserer internen Abstimmung zum Berichtswesen. Wir möchten die Berichte künftig zusätzlich in unserer Cloud-Ablage bei einem externen Anbieter speichern. Unser Controlling arbeitet zunehmend mit diesem Ablagesystem und würde die Portal-Berichte gern direkt dort ablegen, statt sie manuell herunterzuladen.

Können Sie prüfen, was dafür notwendig wäre? Aus unserer Sicht wäre eine automatische Übergabe nach der Berichtserstellung ideal.

Viele Grüße
Miriam Kern
Stadtwerke Musterstadt GmbH
`,
  },
];

export const ALL_DOC_FIXTURES: TenderDocFixture[] = [...TENDER_DOCS, ...ARTIFACTS];

export function docByKey(key: string): TenderDocFixture {
  const doc = ALL_DOC_FIXTURES.find((d) => d.key === key);
  if (!doc) throw new Error(`Unknown document fixture key: ${key}`);
  return doc;
}
