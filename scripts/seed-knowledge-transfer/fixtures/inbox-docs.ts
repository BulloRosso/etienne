/**
 * Three stylised Word documents written into inbox/ at seed time.
 *
 * These are the expert's most-recent incoming materials — the kind of
 * thing the agent's "Curate today's additions to the wiki" expert
 * action triggers on. They are intentionally NOT RAG-indexed at seed
 * time; the rag-auto-index-on-upload event rule kicks in only when the
 * expert moves a file into documents/.
 *
 * Rendered by ../../seed-requirements-hv/fixtures/docx-writer.ts
 * (same harness as the HV seed; no new dependency).
 *
 * The bodies are plain English / German paragraphs without tables or
 * complex formatting — enough to demonstrate the inbox + curation flow.
 */

export interface InboxDoc {
  filename: string;
  title: string;
  body: string;
}

export const INBOX_DOCS: InboxDoc[] = [
  {
    filename: 'oem-a-ecr-frt-clarification.docx',
    title: 'OEM-A — ECR: FRT clarification (250 ms scope refinement)',
    body: [
      'Engineering Change Request — OEM-A Headlight Program',
      '',
      'ECR ID: OEM-A-ECR-2026-118',
      'Date: 2026-05-23',
      'Originator: OEM-A Light Engineering Team (Munich)',
      'Affected Lumitec contract document: OEM-A-FNC-SPEC-rev04, clause §4.2.7',
      '',
      'Background:',
      'The functional response time (FRT) commitment in our contract is currently worded as "Functional response time shall not exceed 250 ms (end-to-end)." Recent internal review at OEM-A has flagged ambiguity in what constitutes "end-to-end". Specifically: does the 250 ms budget include the camera detection latency or start at the moment the headlight ECU receives the command frame on the CAN-FD bus?',
      '',
      'Clarification requested:',
      'OEM-A would like the contract clause amended to read: "Functional response time shall not exceed 250 ms, measured from the time the Headlight ECU receives a valid matrix segment setpoint frame on the CAN-FD bus until the corresponding LED segment is fully activated or deactivated." This excludes the camera pipeline (which is on the OEM-A domain controller side, not the Lumitec headlight) and the bus arbitration latency.',
      '',
      'Lumitec response window:',
      'Please confirm acceptance of this clarification by 2026-06-15. If accepted, the existing verification evidence (HiL test reports HRX-HW-FRT-001 through 003) remains valid and no re-verification is required. If rejected or counter-proposed, please indicate alternative wording.',
      '',
      'Stakeholders to be notified:',
      'OEM-A program manager (Lars Petersen at Lumitec); OEM-A safety team (Frau Dr. Holzer); Lumitec functional safety manager (Dr. Erik Wahlroos).',
      '',
      'This ECR has no commercial impact and does not trigger price-adjustment terms.',
    ].join('\n\n'),
  },
  {
    filename: 'fmea-excerpt-matrix-segment-leakage.docx',
    title: 'FMEA-Auszug — Matrix-Segment Leakage-Mode (intern)',
    body: [
      'Fehlermöglichkeits- und Einflussanalyse — Auszug',
      '',
      'Dokument: FMEA-Lumitec-MatrixLED-Q2-2026, Auszug zu Leakage-Modes',
      'Stand: 2026-05-15',
      'Autor: Janet Voss (AUTOSAR-Lead, in Vertretung des FMEDA-Owners)',
      'Geltungsbereich: alle drei aktiven OEM-Programme',
      '',
      'Fehler-Modus: Matrix-Segment Leakage',
      'Beschreibung: Ein Matrix-Segment leuchtet schwach (1-3 % der Nennhelligkeit), wenn es per Software-Kommando deaktiviert ist. Ursache typischerweise in der Linear-Treiber-Stufe: Restspannung über dem Shunt-FET im Sperrzustand.',
      '',
      'Auswirkung auf Funktion:',
      'Im ADB-Modus wirkt das Leakage als sichtbare Restlicht-Spur in deaktivierten Segmenten. Aus Sicht eines entgegenkommenden Fahrers: nicht-blendend (Helligkeit unter Glare-Schwelle), aber gegen die ADB-Spezifikation. Aus Sicht des Fahrers im eigenen Fahrzeug: visuell nicht wahrnehmbar.',
      '',
      'Auswirkung auf Funktionale Sicherheit:',
      'Sicherheitsziel "deaktiviertes Segment darf keine Blendung verursachen" ist eingehalten (Helligkeit < 50 % des Glare-Grenzwerts B50L). Klassifikation des Fehlermodus: QM (nicht-sicherheitsrelevant). FMEDA-Eintragung als Diagnostik-Hinweis, nicht als Single-Point-Fault.',
      '',
      'Diagnose-Coverage:',
      'Open-LED-Detektion in der Treiber-IC-Bibliothek deckt den umgekehrten Fall (Segment aus, sollte an sein) ab. Für Leakage in Gegenrichtung wäre eine Strommessung im Sperrzustand nötig — bei der aktuellen Treiber-Topologie nicht implementiert. Vorschlag für Gen-5: Strom-Sense-Pin pro Segment-Bank.',
      '',
      'Empfehlung:',
      'Aktuelle Programme: keine Hardware-Änderung, FMEA-Eintrag dokumentiert. Gen-5-Vorentwicklung: Anforderung "Leakage-Diagnostik" als optionales Feature aufnehmen.',
      '',
      'Reviewer-Anmerkung von Erik (Functional Safety Manager):',
      'Klassifikation QM bestätigt. Bei Aufnahme in OEM-B premium μAFS-RFQ-Antwort als "known characteristic" deklarieren, damit OEM-B premium-Engineering keine Überraschung im A-Muster erlebt.',
    ].join('\n\n'),
  },
  {
    filename: 'lessons-learned-thermal-field-issue-2025.docx',
    title: 'Lessons Learned — Thermisches Feld-Problem 2025 (OEM-C-Vorgänger)',
    body: [
      'Lessons Learned Report — Lumitec QM',
      '',
      'Vorfall: Thermisches Feld-Problem OEM-C-Vorgängerprogramm, Q3/2025',
      'Bericht erstellt: 2026-01-12',
      'Autor: Mira Kaspar (Supplier-Quality-Engineer)',
      '',
      'Symptom:',
      'In einer Charge von ~2.400 Scheinwerfern des OEM-C-Vorgängerprogramms (CV-25-Plattform, asiatischer Markt) trat während der ersten Hochsommerwelle 2025 in Südchina eine erhöhte Felddefekt-Rate auf: Matrix-LED-Segmente fielen nach 15-30 Minuten Vollast-Betrieb bei Außentemperaturen über 38 °C einzeln aus, kamen aber nach Abkühlung wieder zurück.',
      '',
      'Ursachen-Analyse (8D-Bericht extern, Auszug):',
      'D1-D4: Team gebildet, Fehler quantifiziert (Felddefektrate 3,4 %, 4-faches Lumitec-Ziel), Sofortmaßnahmen (Reduktion der Vollast-Dauer auf 12 Minuten per OTA-Update an OEM-C übermittelt).',
      'D5: Ursache identifiziert. Im Heatsink-Layout der CV-25-Plattform wurde eine Material-Spezifikation gegenüber dem Vorgänger-Heatsink heruntergesetzt: AlSi9 statt AlSi12, geringere Wärmeleitfähigkeit. Bei der Sample-Phase wurde die Differenz nicht aufgefangen, weil die Tests bei 23 °C Umgebung durchgeführt wurden — die thermische Grenze liegt bei 36-40 °C Umgebung.',
      'D6: Hardware-Änderung (Rückkehr auf AlSi12) für nächste Produktionscharge. Bestehende Charge im Feld läuft mit der reduzierten Vollast-Begrenzung weiter (akzeptiert von OEM-C).',
      'D7: Test-Prozedur-Update für künftige Scheinwerfer-Heatsinks: Pflicht-Test bei +40 °C Umgebung mit 100 % Last für 60 Minuten.',
      'D8: Lessons Learned (dieses Dokument).',
      '',
      'Was wir daraus lernen:',
      '1. Heatsink-Material-Änderungen sind NIE eine reine Beschaffungs-Entscheidung. Auch ein Wechsel innerhalb der "Aluminium-Familie" kann die thermische Auslegung an die Grenze bringen.',
      '2. Test-Bedingungen müssen die Ziel-Markt-Umweltbedingungen abbilden. Für ein chinesisch-südostasiatisches Volumenprogramm ist 23 °C Umgebungstest unzureichend.',
      '3. Die Strafe für unzureichenden Test ist nicht ein Re-Design, sondern ein Feld-Recall — der war hier knapp vermieden, weil die Software-Begrenzung als Workaround akzeptabel war.',
      '',
      'Anwendung auf aktuelle Programme:',
      'OEM-A B-Muster: Heatsink-Material AlSi12, +40 °C-Test in der C-Muster-Phase eingeplant. Keine Maßnahme aktuell nötig.',
      'OEM-C aktuell: Heatsink unverändert seit Vorgänger-Programm (AlSi12), gleicher Test-Profil. Keine Maßnahme.',
      'OEM-B premium μAFS: noch RFQ — Anforderung "+40 °C-Test mit 80 % Last über 60 Minuten" als Test-Akzeptanzkriterium in die Quote-Antwort aufnehmen.',
      '',
      'Reviewer:',
      'Sven Klatt (Thermo-Engineer, Hauptverantwortlicher der Re-Design-Welle)',
      'Anke Brenner (Team-Lead, Freigabe Lessons-Learned-Dokumentation)',
    ].join('\n\n'),
  },
];
