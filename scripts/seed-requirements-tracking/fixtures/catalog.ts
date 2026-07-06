/**
 * Service catalog for NovaSys GmbH: 5 entries (drafted + published v1 during
 * the bid phase), plus the compliance verdicts and mappings seeded on top.
 *
 * Service ids (SVC-xxx) are assigned by the backend at creation — the
 * orchestrator captures them into a map keyed by `key` and resolves the
 * verdict/mapping fixtures below at runtime.
 */

export interface ServiceFixture {
  key: string;
  title: string;
  kind: 'service' | 'reference' | 'certification' | 'text_block';
  tags: string[];
  scope: {
    included: string[];
    excluded: string[];
    prerequisites: string[];
    deliverables: string[];
  };
  bodyMarkdown: string;
}

export const SERVICES: ServiceFixture[] = [
  {
    key: 'kundenportal-modul',
    title: 'Kundenportal-Modul',
    kind: 'service',
    tags: ['portal', 'selfservice', 'energieversorger', 'web'],
    scope: {
      included: [
        'Benutzerkonto mit Registrierung, Double-Opt-In und Passwort-Selfservice',
        'Verbrauchsübersicht mit grafischer Darstellung',
        'Zählerstandserfassung mit Plausibilitätsprüfung',
        'Anbindung an ein führendes Abrechnungssystem über REST- oder Datei-Schnittstelle',
      ],
      excluded: ['XML-Export', 'Anbindung externer Cloud-Speicher'],
      prerequisites: [
        'Abrechnungssystem mit dokumentierter Schnittstelle',
        'Bereitstellung der Infrastruktur durch den Auftraggeber (On-Premises) oder NovaSys-Betrieb',
      ],
      deliverables: ['Installiertes Portal', 'Schnittstellenkonfiguration', 'Testprotokolle'],
    },
    bodyMarkdown: `# Kundenportal-Modul

Das NovaSys Kundenportal-Modul ist die Standardlösung für Selfservice-Portale kommunaler Energie- und Wasserversorger. Es bündelt die wiederkehrenden Fachfunktionen eines Kundenportals in einem konfigurierbaren Produktkern, der pro Projekt an das Corporate Design und die Prozesse des Versorgers angepasst wird.

## Leistungsumfang

Das Modul umfasst die Kontoverwaltung mit Registrierung über Vertragskontonummer und Postleitzahl, Double-Opt-In per E-Mail sowie Passwort-Selfservice über zeitlich befristete Links. Kundinnen und Kunden sehen ihre Vertragsdaten, Abschläge und Rechnungen ein und erfassen Zählerstände direkt im Portal. Jeder erfasste Zählerstand wird gegen den letzten bekannten Stand plausibilisiert; unplausible Werte erhalten einen sofortigen Korrekturhinweis, bevor sie an das Abrechnungssystem übergeben werden.

Die Verbrauchsübersicht stellt Strom-, Gas- und Wasserverbräuche über frei wählbare Zeiträume grafisch dar und bietet einen Vorjahresvergleich. Die Darstellung basiert ausschließlich auf den Daten des angebundenen Abrechnungssystems; das Portal führt keine eigene Verbrauchsdatenhaltung ein.

## Betriebsmodelle

Das Modul wird wahlweise im Rechenzentrum des Auftraggebers (On-Premises) oder im NovaSys-Betrieb bereitgestellt. Beim On-Premises-Betrieb verbleiben sämtliche Kundendaten auf Systemen des Auftraggebers; NovaSys greift ausschließlich über die vereinbarten Wartungszugänge zu.

## Abgrenzung

Nicht Bestandteil dieses Moduls sind der XML-Export von Berichten sowie die Anbindung externer Cloud-Speicher (siehe Scope-Ausschlüsse). Berichtsfunktionen liefert das ergänzende Reporting-Modul; erweiterte Exportformate werden projektspezifisch kalkuliert. Native Apps sind nicht Teil des Standardumfangs, die Oberfläche ist jedoch responsiv und auf gängigen mobilen Endgeräten nutzbar.

## Referenzen und Reifegrad

Das Modul ist seit 2021 bei acht Versorgern produktiv, darunter drei Stadtwerke vergleichbarer Größe. Releases erscheinen quartalsweise; Sicherheitsupdates werden außerhalb des Release-Zyklus bereitgestellt.`,
  },
  {
    key: 'betrieb-sla',
    title: 'Betrieb & SLA',
    kind: 'service',
    tags: ['betrieb', 'sla', 'wartung', 'support'],
    scope: {
      included: [
        'Störungsannahme und -behebung nach Prioritätsstufen',
        'Telefonische Hotline werktags 8–17 Uhr',
        'Tägliche Datensicherung mit 30 Tagen Vorhaltung',
        'Einspielen von Sicherheitsupdates',
        'Wartungsfenster außerhalb der Geschäftszeiten',
      ],
      excluded: ['24/7-Rufbereitschaft', 'Betrieb kundenfremder Drittsysteme'],
      prerequisites: ['Fernwartungszugang gemäß Sicherheitskonzept des Auftraggebers'],
      deliverables: ['SLA-Berichtswesen (monatlich)', 'Wartungsplan', 'Störungsstatistik'],
    },
    bodyMarkdown: `# Betrieb & SLA

Das Betriebs- und SLA-Paket der NovaSys GmbH sichert den laufenden Betrieb der von NovaSys gelieferten Fachanwendungen über die gesamte Vertragslaufzeit. Es kombiniert definierte Reaktions- und Behebungszeiten mit einem planbaren Wartungsregime und einem monatlichen Berichtswesen.

## Störungsmanagement

Störungen werden nach Prioritätsstufen klassifiziert. Störungen der Prioritätsstufe 1 (Betriebsausfall) werden innerhalb von vier Stunden behoben, Störungen der Prioritätsstufe 2 innerhalb eines Arbeitstages. Die Annahme erfolgt werktags von 8 bis 17 Uhr über eine deutschsprachige telefonische Hotline; außerhalb dieser Zeiten nimmt ein Ticketsystem Meldungen entgegen, die am folgenden Arbeitstag bearbeitet werden.

## Datensicherung und Updates

Zum Paket gehört eine tägliche Datensicherung mit 30 Tagen Vorhaltung, wahlweise auf Infrastruktur des Auftraggebers. Sicherheitsupdates der eingesetzten Komponenten werden regelmäßig bewertet und innerhalb von 14 Tagen nach Herstellerveröffentlichung eingespielt; kritische Lücken werden außerplanmäßig geschlossen.

## Wartungsfenster und Verfügbarkeit

Geplante Wartungsarbeiten finden außerhalb der Geschäftszeiten des Auftraggebers statt, in der Regel werktags zwischen 22:00 und 06:00 Uhr, und werden mindestens fünf Arbeitstage im Voraus angekündigt. Auf dieser Basis erreichen NovaSys-Betriebsprojekte im Mittel Verfügbarkeiten von 99,5 % und mehr im Jahresmittel; der konkrete Zielwert wird je Projekt im SLA vereinbart.

## Berichtswesen

Der Auftraggeber erhält monatlich einen SLA-Bericht mit Störungsstatistik, Verfügbarkeitsnachweis und Wartungsvorschau. Eskalationswege und Ansprechpartner werden im Betriebshandbuch dokumentiert und jährlich überprüft.`,
  },
  {
    key: 'schulungspaket',
    title: 'Schulungspaket',
    kind: 'service',
    tags: ['schulung', 'training', 'einführung'],
    scope: {
      included: [
        'Präsenzschulung beim Auftraggeber (bis zu drei Schulungstage)',
        'Administrations- und Anwenderschulung',
        'Schulungsunterlagen in deutscher Sprache mit internem Weiterverwendungsrecht',
      ],
      excluded: ['Zertifizierungsprüfungen', 'Dauerhafte Trainingsumgebung'],
      prerequisites: ['Schulungsraum mit Beamer und Testzugängen beim Auftraggeber'],
      deliverables: ['Schulungsunterlagen (PDF)', 'Teilnahmebescheinigungen'],
    },
    bodyMarkdown: `# Schulungspaket

Das NovaSys-Schulungspaket bereitet die Mitarbeitenden des Auftraggebers vor der Inbetriebnahme auf Administration und Tagesbetrieb der gelieferten Lösung vor. Die Schulungen finden als Präsenztermine in den Räumen des Auftraggebers statt und werden von den Beratern durchgeführt, die das Projekt eingeführt haben.

## Aufbau

Das Paket umfasst bis zu drei Schulungstage, die je nach Projekt auf Administrations- und Anwenderschulung aufgeteilt werden. Die Administrationsschulung behandelt Benutzer- und Rechteverwaltung, Konfiguration, Protokollauswertung und das Zusammenspiel mit dem Abrechnungssystem. Die Anwenderschulung folgt den realen Kundenvorgängen: Registrierung begleiten, Zählerstände prüfen, Berichte erzeugen, Störungsmeldungen qualifizieren.

## Unterlagen

Alle Teilnehmenden erhalten deutschsprachige Schulungsunterlagen, die auf die projektspezifische Konfiguration zugeschnitten sind. Die Unterlagen verbleiben beim Auftraggeber und dürfen für interne Folgeschulungen weiterverwendet und angepasst werden. Auf Wunsch stellt NovaSys eine editierbare Fassung bereit.

## Durchführung und Nachweis

Die Termine werden gemeinsam mit dem Projektleiter des Auftraggebers geplant, üblicherweise in den zwei Wochen vor der Abnahme. Jede Schulung schließt mit einer praktischen Übungseinheit an der Testumgebung; die Teilnahme wird mit Bescheinigungen dokumentiert. Ergänzende Auffrischungstermine nach Go-Live können als Dienstleistung abgerufen werden.`,
  },
  {
    key: 'reporting-modul',
    title: 'Reporting-Modul',
    kind: 'service',
    tags: ['reporting', 'berichte', 'export', 'pdf'],
    scope: {
      included: [
        'Verbrauchs- und Abrechnungsberichte für frei wählbare Zeiträume',
        'PDF-Export mit kundenspezifischem Layout',
        'CSV-Export (tabellarische Rohdaten)',
        'Zeitgesteuerte Berichtserzeugung',
      ],
      excluded: ['XML-Export', 'Übertragung an externe Ablagesysteme'],
      prerequisites: ['Kundenportal-Modul oder kompatible Datenquelle'],
      deliverables: ['Konfigurierte Berichtsvorlagen', 'Layout-Abnahmeprotokoll'],
    },
    bodyMarkdown: `# Reporting-Modul

Das Reporting-Modul erzeugt Verbrauchs- und Abrechnungsberichte aus den Daten des Kundenportal-Moduls oder einer kompatiblen Datenquelle. Berichte stehen Endkunden im Portal auf Abruf zur Verfügung und können zusätzlich zeitgesteuert erzeugt werden.

## Berichtsarten und Formate

Standardberichte sind der Verbrauchsbericht (frei wählbarer Zeitraum, Vorjahresvergleich), der Abrechnungsbericht und die Abschlagsübersicht. Alle Berichte werden als **PDF** mit kundenspezifischem Layout ausgegeben; das Layout wird im Projekt einmalig abgestimmt und versioniert. Für die Weiterverarbeitung in Tabellenkalkulationen steht ergänzend ein **CSV-Export** der tabellarischen Rohdaten zur Verfügung.

Ein XML-Export sowie die automatische Übertragung von Berichten an externe Ablagesysteme sind nicht Bestandteil des Standardumfangs und werden bei Bedarf projektspezifisch konzipiert und kalkuliert.

## Erzeugung und Ablage

Berichte werden auf Abruf im Portal erzeugt; zusätzlich können wiederkehrende Berichte zeitgesteuert erstellt und dem Kunden im Portal bereitgestellt werden. Die erzeugten Dateien liegen in der Dokumentenablage des Portals und unterliegen denselben Datenhaltungsregeln wie alle übrigen Kundendaten — beim On-Premises-Betrieb also vollständig im Rechenzentrum des Auftraggebers.

## Qualitätssicherung

Jede Berichtsvorlage durchläuft vor Freigabe einen Abgleich gegen die Werte des Abrechnungssystems. Abweichungen zwischen Portal-Darstellung und Berichtsinhalt werden im Rahmen der Layout-Abnahme protokolliert und behoben.`,
  },
  {
    key: 'referenz-stadtwerke',
    title: 'Referenzprojekt Stadtwerke Beispielstadt',
    kind: 'reference',
    tags: ['referenz', 'stadtwerke', 'portal'],
    scope: {
      included: [
        'Kundenportal für ca. 40.000 Vertragskonten (Strom, Gas, Wasser)',
        'On-Premises-Betrieb im Rechenzentrum des Versorgers',
        'Betrieb & SLA seit 2023',
      ],
      excluded: [],
      prerequisites: [],
      deliverables: ['Referenzschreiben (auf Anfrage)', 'Ansprechpartner nach Freigabe'],
    },
    bodyMarkdown: `# Referenzprojekt Stadtwerke Beispielstadt

Die Stadtwerke Beispielstadt GmbH (rund 40.000 Vertragskonten in den Sparten Strom, Gas und Wasser) betreiben seit 2023 ein von NovaSys eingeführtes Kundenselfservice-Portal auf Basis des Kundenportal-Moduls mit Reporting-Modul und Betriebs-/SLA-Paket.

## Projektinhalt

Eingeführt wurden Benutzerkonto mit Double-Opt-In-Registrierung, Verbrauchsübersicht mit Vorjahresvergleich, Zählerstandserfassung mit Plausibilitätsprüfung sowie PDF-Berichte für Verbrauch und Abrechnung. Das Portal ist an das vorhandene Abrechnungssystem des Versorgers angebunden; die gesamte Datenhaltung erfolgt On-Premises im Rechenzentrum der Stadtwerke.

## Verlauf und Kennzahlen

Die Einführung dauerte von Vertragsschluss bis Go-Live sieben Monate, inklusive zweier Schulungstage vor Inbetriebnahme. Im ersten Betriebsjahr registrierten sich rund 35 % der Vertragskonten; die Zahl telefonischer Zählerstandsmeldungen sank um mehr als die Hälfte. Die vertraglich vereinbarte Verfügbarkeit von 99,5 % im Jahresmittel wurde in beiden Betriebsjahren erreicht.

## Übertragbarkeit

Das Projekt ist in Zuschnitt und Systemlandschaft mit dem Vorhaben der Stadtwerke Musterstadt vergleichbar (kommunaler Mehrspartenversorger, On-Premises-Vorgabe, vorhandenes Abrechnungssystem). Ein Referenzschreiben liegt vor; ein Ansprechpartner der Stadtwerke Beispielstadt steht nach Freigabe für Rückfragen zur Verfügung.`,
  },
];

// ─── Compliance verdicts (seeded as kind:'compliance' proposals, approved) ──

export interface VerdictFixture {
  /** extraction fixtureKey of the requirement */
  requirementKey: string;
  verdict: 'FULL' | 'PARTIAL' | 'NON_COMPLIANT' | 'NEEDS_INPUT';
  justification: string;
  /** service fixture keys for evidence_refs (version 1) */
  evidenceServiceKeys: string[];
  deviation: string | null;
  risk_note: string | null;
  internal_question: string | null;
  confidence: number;
}

export const VERDICTS: VerdictFixture[] = [
  {
    requirementKey: 'training',
    verdict: 'FULL',
    justification:
      'Das Schulungspaket deckt die geforderten zwei Schulungstage vor Inbetriebnahme vollständig ab (Präsenz beim Auftraggeber, Administrations- und Anwenderschulung, deutschsprachige Unterlagen mit Weiterverwendungsrecht).',
    evidenceServiceKeys: ['schulungspaket'],
    deviation: null,
    risk_note: null,
    internal_question: null,
    confidence: 0.95,
  },
  {
    requirementKey: 'consumption-view',
    verdict: 'FULL',
    justification:
      'Verbrauchsübersicht mit grafischer Darstellung und Vorjahresvergleich ist Standardumfang des Kundenportal-Moduls; die Berichtsdarstellung liefert das Reporting-Modul.',
    evidenceServiceKeys: ['kundenportal-modul', 'reporting-modul'],
    deviation: null,
    risk_note: null,
    internal_question: null,
    confidence: 0.93,
  },
  {
    requirementKey: 'export-pdf',
    verdict: 'PARTIAL',
    justification:
      'PDF-Berichte sind Standardumfang des Reporting-Moduls (kundenspezifisches Layout, Abruf im Portal). Erweiterte Exportformate sind nicht Standardumfang.',
    evidenceServiceKeys: ['reporting-modul'],
    deviation:
      'XML-Export ist im Scope des Kundenportal-Moduls und des Reporting-Moduls explizit ausgeschlossen ("XML-Export" in scope.excluded) und wäre projektspezifisch zu kalkulieren.',
    risk_note:
      'Das Controlling der Stadtwerke fragt erfahrungsgemäß nach maschinenlesbaren Formaten — Formatumfang im Angebot eindeutig abgrenzen, sonst droht Scope-Drift in der Umsetzung.',
    internal_question: null,
    confidence: 0.88,
  },
  {
    requirementKey: 'availability',
    verdict: 'FULL',
    justification:
      'Das Betriebs- und SLA-Paket erreicht in vergleichbaren Projekten 99,5 % Verfügbarkeit im Jahresmittel; der Zielwert wird im SLA fest vereinbart.',
    evidenceServiceKeys: ['betrieb-sla'],
    deviation: null,
    risk_note: null,
    internal_question: null,
    confidence: 0.9,
  },
  {
    requirementKey: 'audit-log',
    verdict: 'NEEDS_INPUT',
    justification:
      'Revisionssichere Protokollierung administrativer Zugriffe ist teilweise im Kundenportal-Modul enthalten; ob der Manipulationsschutz die Anforderung "revisionssicher" im Sinne des Auftraggebers erfüllt, muss intern bewertet werden.',
    evidenceServiceKeys: ['kundenportal-modul'],
    deviation: null,
    risk_note: null,
    internal_question:
      'An den Security Officer: Erfüllt die Audit-Log-Implementierung (WORM-Ablage, Hash-Verkettung) die Anforderung "revisionssicher" nach Abschnitt 3 der Technischen Anlage — oder benötigen wir eine zusätzliche Archivierungskomponente?',
    confidence: 0.7,
  },
];

// ─── Mappings ────────────────────────────────────────────────────────────────

export interface MappingFixture {
  requirementKey: string;
  serviceKey: string;
  coverage: 'full' | 'partial' | 'related';
  /** 'proposal' → kind:'mapping' proposal decided approved; 'manual' → rt_create_mapping */
  via: 'proposal' | 'manual';
  rationale: string;
}

export const MAPPINGS: MappingFixture[] = [
  {
    requirementKey: 'training',
    serviceKey: 'schulungspaket',
    coverage: 'full',
    via: 'proposal',
    rationale:
      'Scope "Präsenzschulung beim Auftraggeber (bis zu drei Schulungstage)" deckt die geforderten zwei Schulungstage vor Inbetriebnahme ab.',
  },
  {
    requirementKey: 'consumption-view',
    serviceKey: 'kundenportal-modul',
    coverage: 'full',
    via: 'proposal',
    rationale:
      'Scope "Verbrauchsübersicht mit grafischer Darstellung" entspricht der geforderten 24-Monats-Grafik.',
  },
  {
    requirementKey: 'export-pdf',
    serviceKey: 'reporting-modul',
    coverage: 'partial',
    via: 'proposal',
    rationale:
      'PDF-Export ist Standardumfang; XML-Export ist im Scope explizit ausgeschlossen ("XML-Export" in excluded).',
  },
  {
    requirementKey: 'availability',
    serviceKey: 'betrieb-sla',
    coverage: 'full',
    via: 'proposal',
    rationale:
      'SLA-Paket mit Wartungsfenstern und Störungsklassen trägt den Verfügbarkeitszielwert von 99,5 % im Jahresmittel.',
  },
  {
    requirementKey: 'hotline',
    serviceKey: 'betrieb-sla',
    coverage: 'full',
    via: 'manual',
    rationale: 'Hotline werktags 8–17 Uhr ist Bestandteil des Betriebs- und SLA-Pakets.',
  },
];

export function serviceFixtureByKey(key: string): ServiceFixture {
  const service = SERVICES.find((s) => s.key === key);
  if (!service) throw new Error(`Unknown service fixture key: ${key}`);
  return service;
}
