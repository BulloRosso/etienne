/**
 * 24 extraction-proposal fixtures for tendertrace-stadtwerke, tied to the
 * document fixtures in ./tender-docs.ts.
 *
 * INVARIANTS
 * - `quote` is a VERBATIM substring of the referenced document's markdown
 *   (asserted by the seed's dry-run; validated server-side on submit).
 * - REQ ids are assigned sequentially AT APPROVAL — the orchestrator decides
 *   proposals in array order and captures result.effect.requirementId into a
 *   map keyed by `fixtureKey`. Nothing here hardcodes a REQ id.
 * - `sectionNo` is the 1-based section index produced by the backend's
 *   sectionizer (every #/##/### heading starts a section; the leading
 *   `# <title>` block is section 1).
 * - Modality distribution: 14 mandatory, 6 target, 4 optional.
 *   One fixture stays UNDECIDED ('sepa'), one is REJECTED ('netzwerk').
 * - 'failover-switch' and 'failover-notify' share ONE source quote →
 *   the backend auto-creates a derived_from_same_clause relation.
 */

export type FixtureDecision = 'approved' | 'rejected' | 'pending';

export interface EarsFields {
  system: string | null;
  trigger: string | null;
  state: string | null;
  condition: string | null;
  feature: string | null;
  response: string | null;
}

export interface ExtractionFixture {
  fixtureKey: string;
  docKey: 'leistungsbeschreibung' | 'sicherheit' | 'vertrag';
  sectionNo: number;
  sectionHeading: string;
  page: number;
  quote: string;
  earsPattern:
    | 'ubiquitous'
    | 'event_driven'
    | 'state_driven'
    | 'unwanted_behavior'
    | 'optional_feature'
    | 'complex';
  earsFields: EarsFields;
  earsText: string;
  category:
    | 'functional'
    | 'performance'
    | 'security'
    | 'interface'
    | 'data'
    | 'usability'
    | 'process'
    | 'commercial'
    | 'legal'
    | 'documentation';
  modality: 'mandatory' | 'target' | 'optional';
  quantities: Array<{ value: number; unit: string; kind: 'threshold' | 'target' | 'count' | 'deadline' }>;
  ambiguities: Array<{ type: string; note: string; clarification_question_draft: string }>;
  dependencies: string[];
  confidence: number;
  decision: FixtureDecision;
}

const noFields: EarsFields = {
  system: null,
  trigger: null,
  state: null,
  condition: null,
  feature: null,
  response: null,
};

export const EXTRACTION_FIXTURES: ExtractionFixture[] = [
  // ── Leistungsbeschreibung Kundenportal ────────────────────────────────────
  {
    fixtureKey: 'login',
    docKey: 'leistungsbeschreibung',
    sectionNo: 3,
    sectionHeading: '2. Benutzerkonto und Registrierung',
    page: 1,
    quote: 'Kunden müssen sich mit E-Mail-Adresse und Passwort am Portal anmelden können.',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      response: 'Kunden die Anmeldung mit E-Mail-Adresse und Passwort ermöglichen',
    },
    earsText:
      'Das Kundenportal muss Kunden die Anmeldung mit E-Mail-Adresse und Passwort ermöglichen.',
    category: 'functional',
    modality: 'mandatory',
    quantities: [],
    ambiguities: [],
    dependencies: [],
    confidence: 0.97,
    decision: 'approved',
  },
  {
    fixtureKey: 'doubleoptin',
    docKey: 'leistungsbeschreibung',
    sectionNo: 3,
    sectionHeading: '2. Benutzerkonto und Registrierung',
    page: 1,
    quote:
      'Die Registrierung soll über ein Double-Opt-In-Verfahren per E-Mail bestätigt werden.',
    earsPattern: 'event_driven',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      trigger: 'ein Kunde sich registriert',
      response: 'die Registrierung über ein Double-Opt-In-Verfahren per E-Mail bestätigen',
    },
    earsText:
      'Wenn ein Kunde sich registriert, soll das Kundenportal die Registrierung über ein Double-Opt-In-Verfahren per E-Mail bestätigen.',
    category: 'functional',
    modality: 'target',
    quantities: [],
    ambiguities: [],
    dependencies: [],
    confidence: 0.93,
    decision: 'approved',
  },
  {
    // The rejected card: a client duty misread as a contractor requirement.
    fixtureKey: 'netzwerk',
    docKey: 'leistungsbeschreibung',
    sectionNo: 2,
    sectionHeading: '1. Gegenstand der Leistung',
    page: 1,
    quote:
      'Der Auftraggeber stellt die erforderliche Netzwerkinfrastruktur in seinen Liegenschaften bereit.',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'der Auftraggeber',
      response: 'die erforderliche Netzwerkinfrastruktur in seinen Liegenschaften bereitstellen',
    },
    earsText:
      'Der Auftraggeber muss die erforderliche Netzwerkinfrastruktur in seinen Liegenschaften bereitstellen.',
    category: 'process',
    modality: 'mandatory',
    quantities: [],
    ambiguities: [
      {
        type: 'undefined_actor',
        note: 'Pflicht liegt beim Auftraggeber, nicht beim Auftragnehmer — vermutlich Mitwirkungsleistung, keine Anforderung.',
        clarification_question_draft:
          'Zu Abschnitt 1 der Leistungsbeschreibung: Ist die Bereitstellung der Netzwerkinfrastruktur ausschließlich Mitwirkungsleistung des Auftraggebers?',
      },
    ],
    dependencies: [],
    confidence: 0.55,
    decision: 'rejected',
  },
  {
    fixtureKey: 'consumption-view',
    docKey: 'leistungsbeschreibung',
    sectionNo: 4,
    sectionHeading: '3. Verbrauchsübersicht und Berichte',
    page: 1,
    quote:
      'Das Portal soll den Energie- und Wasserverbrauch der letzten 24 Monate grafisch darstellen',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      response: 'den Energie- und Wasserverbrauch der letzten 24 Monate grafisch darstellen',
    },
    earsText:
      'Das Kundenportal soll den Energie- und Wasserverbrauch der letzten 24 Monate grafisch darstellen.',
    category: 'functional',
    modality: 'target',
    quantities: [{ value: 24, unit: 'Monate', kind: 'count' }],
    ambiguities: [],
    dependencies: [],
    confidence: 0.92,
    decision: 'approved',
  },
  {
    // The requirement the KW23 change-order drift diff lands on.
    fixtureKey: 'export-pdf',
    docKey: 'leistungsbeschreibung',
    sectionNo: 4,
    sectionHeading: '3. Verbrauchsübersicht und Berichte',
    page: 1,
    quote: 'Berichte sind als PDF bereitzustellen.',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      response: 'Berichte als PDF bereitstellen',
    },
    earsText: 'Das Kundenportal muss Berichte als PDF bereitstellen.',
    category: 'data',
    modality: 'mandatory',
    quantities: [],
    ambiguities: [],
    dependencies: [],
    confidence: 0.95,
    decision: 'approved',
  },
  {
    fixtureKey: 'meter-reading',
    docKey: 'leistungsbeschreibung',
    sectionNo: 5,
    sectionHeading: '4. Zählerstandserfassung',
    page: 1,
    quote:
      'Wenn ein Kunde einen Zählerstand über das Portal meldet, muss das Portal den erfassten Wert auf Plausibilität gegen den letzten bekannten Zählerstand prüfen.',
    earsPattern: 'event_driven',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      trigger: 'ein Kunde einen Zählerstand über das Portal meldet',
      response: 'den erfassten Wert auf Plausibilität gegen den letzten bekannten Zählerstand prüfen',
    },
    earsText:
      'Wenn ein Kunde einen Zählerstand über das Portal meldet, muss das Kundenportal den erfassten Wert auf Plausibilität gegen den letzten bekannten Zählerstand prüfen.',
    category: 'functional',
    modality: 'mandatory',
    quantities: [],
    ambiguities: [],
    dependencies: [],
    confidence: 0.96,
    decision: 'approved',
  },
  {
    // Ambiguity card #1 — the KW23 in-scope drift diff later clarifies the load assumption.
    fixtureKey: 'response-time',
    docKey: 'leistungsbeschreibung',
    sectionNo: 6,
    sectionHeading: '5. Leistung, Verfügbarkeit und Ausfallsicherheit',
    page: 2,
    quote: 'Die Antwortzeit darf 2 Sekunden nicht überschreiten.',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      response: 'jede Nutzerinteraktion innerhalb von 2 Sekunden beantworten',
    },
    earsText: 'Das Kundenportal muss jede Nutzerinteraktion innerhalb von 2 Sekunden beantworten.',
    category: 'performance',
    modality: 'mandatory',
    quantities: [{ value: 2, unit: 'Sekunden', kind: 'threshold' }],
    ambiguities: [
      {
        type: 'missing_threshold',
        note: 'Keine Lastannahme (Anzahl gleichzeitiger Nutzer) für die Antwortzeitanforderung angegeben.',
        clarification_question_draft:
          'Zu Abschnitt 5 der Leistungsbeschreibung: Bei welcher Anzahl gleichzeitiger Nutzer muss die Antwortzeit von 2 Sekunden eingehalten werden?',
      },
    ],
    dependencies: [],
    confidence: 0.85,
    decision: 'approved',
  },
  {
    fixtureKey: 'availability',
    docKey: 'leistungsbeschreibung',
    sectionNo: 6,
    sectionHeading: '5. Leistung, Verfügbarkeit und Ausfallsicherheit',
    page: 2,
    quote: 'Das Portal soll eine Verfügbarkeit von 99,5 % im Jahresmittel erreichen.',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      response: 'eine Verfügbarkeit von 99,5 % im Jahresmittel erreichen',
    },
    earsText: 'Das Kundenportal soll eine Verfügbarkeit von 99,5 % im Jahresmittel erreichen.',
    category: 'performance',
    modality: 'target',
    quantities: [{ value: 99.5, unit: '%', kind: 'target' }],
    ambiguities: [],
    dependencies: [],
    confidence: 0.95,
    decision: 'approved',
  },
  {
    // Same-clause pair 1/2 (spec §5.1 worked example): two obligations, one quote.
    fixtureKey: 'failover-switch',
    docKey: 'leistungsbeschreibung',
    sectionNo: 6,
    sectionHeading: '5. Leistung, Verfügbarkeit und Ausfallsicherheit',
    page: 2,
    quote:
      'Bei Ausfall der Primärverbindung muss das System innerhalb von 30 Sekunden automatisch auf die Sekundärverbindung umschalten und den Administrator benachrichtigen.',
    earsPattern: 'unwanted_behavior',
    earsFields: {
      ...noFields,
      system: 'das System',
      condition: 'die Primärverbindung ausfällt',
      response: 'innerhalb von 30 Sekunden automatisch auf die Sekundärverbindung umschalten',
    },
    earsText:
      'Wenn die Primärverbindung ausfällt, muss das System innerhalb von 30 Sekunden automatisch auf die Sekundärverbindung umschalten.',
    category: 'performance',
    modality: 'mandatory',
    quantities: [{ value: 30, unit: 'Sekunden', kind: 'threshold' }],
    ambiguities: [],
    dependencies: [],
    confidence: 0.94,
    decision: 'approved',
  },
  {
    // Same-clause pair 2/2 — shares the quote above; ambiguity card #2.
    fixtureKey: 'failover-notify',
    docKey: 'leistungsbeschreibung',
    sectionNo: 6,
    sectionHeading: '5. Leistung, Verfügbarkeit und Ausfallsicherheit',
    page: 2,
    quote:
      'Bei Ausfall der Primärverbindung muss das System innerhalb von 30 Sekunden automatisch auf die Sekundärverbindung umschalten und den Administrator benachrichtigen.',
    earsPattern: 'unwanted_behavior',
    earsFields: {
      ...noFields,
      system: 'das System',
      condition: 'die Primärverbindung ausfällt',
      response: 'den Administrator benachrichtigen',
    },
    earsText: 'Wenn die Primärverbindung ausfällt, muss das System den Administrator benachrichtigen.',
    category: 'functional',
    modality: 'mandatory',
    quantities: [],
    ambiguities: [
      {
        type: 'missing_threshold',
        note: 'Keine Frist für die Benachrichtigung des Administrators genannt.',
        clarification_question_draft:
          'Zu Abschnitt 5 der Leistungsbeschreibung: Innerhalb welcher Frist muss die Benachrichtigung des Administrators nach einem Ausfall der Primärverbindung erfolgen?',
      },
    ],
    dependencies: [],
    confidence: 0.9,
    decision: 'approved',
  },
  {
    fixtureKey: 'sms',
    docKey: 'leistungsbeschreibung',
    sectionNo: 7,
    sectionHeading: '6. Benachrichtigungen und mobile Nutzung',
    page: 2,
    quote: 'Das Portal kann Kunden zusätzlich per SMS über neue Rechnungen informieren.',
    earsPattern: 'optional_feature',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      feature: 'die SMS-Benachrichtigung',
      response: 'Kunden per SMS über neue Rechnungen informieren',
    },
    earsText:
      'Wo die SMS-Benachrichtigung vorgesehen ist, kann das Kundenportal Kunden per SMS über neue Rechnungen informieren.',
    category: 'functional',
    modality: 'optional',
    quantities: [],
    ambiguities: [],
    dependencies: [],
    confidence: 0.88,
    decision: 'approved',
  },
  {
    // Ambiguity card #3 (vague_term).
    fixtureKey: 'mobile',
    docKey: 'leistungsbeschreibung',
    sectionNo: 7,
    sectionHeading: '6. Benachrichtigungen und mobile Nutzung',
    page: 2,
    quote: 'Das Portal soll auf mobilen Endgeräten vollständig nutzbar sein.',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      response: 'auf mobilen Endgeräten vollständig nutzbar sein',
    },
    earsText: 'Das Kundenportal soll auf mobilen Endgeräten vollständig nutzbar sein.',
    category: 'usability',
    modality: 'target',
    quantities: [],
    ambiguities: [
      {
        type: 'vague_term',
        note: '"vollständig nutzbar" ist nicht quantifiziert; unterstützte Endgeräte und Browser sind nicht benannt.',
        clarification_question_draft:
          'Zu Abschnitt 6 der Leistungsbeschreibung: Welche mobilen Endgeräte und Browser-Versionen sind für die vollständige Nutzbarkeit maßgeblich?',
      },
    ],
    dependencies: [],
    confidence: 0.68,
    decision: 'approved',
  },
  {
    fixtureKey: 'english-ui',
    docKey: 'leistungsbeschreibung',
    sectionNo: 7,
    sectionHeading: '6. Benachrichtigungen und mobile Nutzung',
    page: 2,
    quote: 'Das Portal kann zusätzlich eine englischsprachige Oberfläche anbieten.',
    earsPattern: 'optional_feature',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      feature: 'die englischsprachige Oberfläche',
      response: 'eine englischsprachige Oberfläche anbieten',
    },
    earsText:
      'Wo die englischsprachige Oberfläche vorgesehen ist, kann das Kundenportal die Bedienung in englischer Sprache anbieten.',
    category: 'usability',
    modality: 'optional',
    quantities: [],
    ambiguities: [],
    dependencies: [],
    confidence: 0.86,
    decision: 'approved',
  },

  // ── Technische Anlage Sicherheit & Betrieb ────────────────────────────────
  {
    // The baseline security requirement the Cloud email CONFLICTS with.
    fixtureKey: 'onprem',
    docKey: 'sicherheit',
    sectionNo: 2,
    sectionHeading: '1. Datenhaltung und Datenschutz',
    page: 1,
    quote:
      'Alle Kundendaten verbleiben auf Systemen im Rechenzentrum des Auftraggebers (On-Premises).',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      response:
        'alle Kundendaten ausschließlich auf Systemen im Rechenzentrum des Auftraggebers (On-Premises) speichern',
    },
    earsText:
      'Das Kundenportal muss alle Kundendaten ausschließlich auf Systemen im Rechenzentrum des Auftraggebers (On-Premises) speichern.',
    category: 'security',
    modality: 'mandatory',
    quantities: [],
    ambiguities: [],
    dependencies: [],
    confidence: 0.93,
    decision: 'approved',
  },
  {
    fixtureKey: '2fa',
    docKey: 'sicherheit',
    sectionNo: 3,
    sectionHeading: '2. Authentifizierung und Verschlüsselung',
    page: 1,
    quote:
      'Der Zugang für Mitarbeitende der Stadtwerke zum Administrationsbereich muss durch eine Zwei-Faktor-Authentifizierung geschützt werden.',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      response:
        'den Zugang zum Administrationsbereich durch eine Zwei-Faktor-Authentifizierung schützen',
    },
    earsText:
      'Das Kundenportal muss den Zugang zum Administrationsbereich durch eine Zwei-Faktor-Authentifizierung schützen.',
    category: 'security',
    modality: 'mandatory',
    quantities: [],
    ambiguities: [],
    dependencies: [],
    confidence: 0.97,
    decision: 'approved',
  },
  {
    fixtureKey: 'tls',
    docKey: 'sicherheit',
    sectionNo: 3,
    sectionHeading: '2. Authentifizierung und Verschlüsselung',
    page: 1,
    quote:
      'Sämtliche Datenübertragungen zwischen Endgerät, Portal und Abrechnungssystem müssen mit TLS 1.2 oder höher verschlüsselt werden.',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      response:
        'sämtliche Datenübertragungen zwischen Endgerät, Portal und Abrechnungssystem mit TLS 1.2 oder höher verschlüsseln',
    },
    earsText:
      'Das Kundenportal muss sämtliche Datenübertragungen zwischen Endgerät, Portal und Abrechnungssystem mit TLS 1.2 oder höher verschlüsseln.',
    category: 'security',
    modality: 'mandatory',
    quantities: [{ value: 1.2, unit: 'TLS-Version', kind: 'threshold' }],
    ambiguities: [],
    dependencies: [],
    confidence: 0.97,
    decision: 'approved',
  },
  {
    // Gets the NEEDS_INPUT compliance verdict (Security Officer).
    fixtureKey: 'audit-log',
    docKey: 'sicherheit',
    sectionNo: 4,
    sectionHeading: '3. Protokollierung und Audit',
    page: 1,
    quote: 'Alle administrativen Zugriffe auf das Portal müssen revisionssicher protokolliert werden.',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      response: 'alle administrativen Zugriffe revisionssicher protokollieren',
    },
    earsText: 'Das Kundenportal muss alle administrativen Zugriffe revisionssicher protokollieren.',
    category: 'security',
    modality: 'mandatory',
    quantities: [],
    ambiguities: [],
    dependencies: [],
    confidence: 0.95,
    decision: 'approved',
  },
  {
    fixtureKey: 'patch',
    docKey: 'sicherheit',
    sectionNo: 5,
    sectionHeading: '4. Betrieb, SLA und Datensicherung',
    page: 2,
    quote:
      'Sicherheitsupdates sollen innerhalb von 14 Tagen nach Veröffentlichung durch den Hersteller eingespielt werden.',
    earsPattern: 'event_driven',
    earsFields: {
      ...noFields,
      system: 'der Auftragnehmer',
      trigger: 'der Hersteller ein Sicherheitsupdate veröffentlicht',
      response: 'das Sicherheitsupdate innerhalb von 14 Tagen einspielen',
    },
    earsText:
      'Wenn der Hersteller ein Sicherheitsupdate veröffentlicht, soll der Auftragnehmer das Update innerhalb von 14 Tagen einspielen.',
    category: 'process',
    modality: 'target',
    quantities: [{ value: 14, unit: 'Tage', kind: 'deadline' }],
    ambiguities: [],
    dependencies: [],
    confidence: 0.92,
    decision: 'approved',
  },
  {
    fixtureKey: 'maintenance-window',
    docKey: 'sicherheit',
    sectionNo: 6,
    sectionHeading: '5. Wartungsfenster',
    page: 2,
    quote:
      'Geplante Wartungsarbeiten können außerhalb der Geschäftszeiten des Auftraggebers, in der Regel werktags zwischen 22:00 und 06:00 Uhr, durchgeführt werden.',
    earsPattern: 'state_driven',
    earsFields: {
      ...noFields,
      system: 'der Auftragnehmer',
      state: 'außerhalb der Geschäftszeiten des Auftraggebers',
      response: 'geplante Wartungsarbeiten durchführen',
    },
    earsText:
      'Außerhalb der Geschäftszeiten des Auftraggebers kann der Auftragnehmer geplante Wartungsarbeiten durchführen.',
    category: 'process',
    modality: 'optional',
    quantities: [],
    ambiguities: [],
    dependencies: [],
    confidence: 0.87,
    decision: 'approved',
  },

  // ── Vertragsbedingungen ───────────────────────────────────────────────────
  {
    fixtureKey: 'training',
    docKey: 'vertrag',
    sectionNo: 2,
    sectionHeading: '1. Schulung',
    page: 1,
    quote:
      'Der Auftragnehmer muss vor Inbetriebnahme zwei Schulungstage für die Mitarbeitenden der Stadtwerke Musterstadt durchführen.',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'der Auftragnehmer',
      response:
        'vor Inbetriebnahme zwei Schulungstage für die Mitarbeitenden der Stadtwerke Musterstadt durchführen',
    },
    earsText:
      'Der Auftragnehmer muss vor Inbetriebnahme zwei Schulungstage für die Mitarbeitenden der Stadtwerke Musterstadt durchführen.',
    category: 'process',
    modality: 'mandatory',
    quantities: [{ value: 2, unit: 'Schulungstage', kind: 'count' }],
    ambiguities: [],
    dependencies: [],
    confidence: 0.96,
    decision: 'approved',
  },
  {
    fixtureKey: 'documentation',
    docKey: 'vertrag',
    sectionNo: 3,
    sectionHeading: '2. Dokumentation',
    page: 1,
    quote:
      'Der Auftragnehmer hat eine vollständige Anwender- und Betriebsdokumentation in deutscher Sprache zu liefern.',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'der Auftragnehmer',
      response:
        'eine vollständige Anwender- und Betriebsdokumentation in deutscher Sprache liefern',
    },
    earsText:
      'Der Auftragnehmer muss eine vollständige Anwender- und Betriebsdokumentation in deutscher Sprache liefern.',
    category: 'documentation',
    modality: 'mandatory',
    quantities: [],
    ambiguities: [],
    dependencies: [],
    confidence: 0.95,
    decision: 'approved',
  },
  {
    fixtureKey: 'hotline',
    docKey: 'vertrag',
    sectionNo: 4,
    sectionHeading: '3. Hotline und Support',
    page: 1,
    quote:
      'Der Auftragnehmer muss werktags von 8 bis 17 Uhr eine telefonische Hotline für Störungsmeldungen bereitstellen.',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'der Auftragnehmer',
      response:
        'werktags von 8 bis 17 Uhr eine telefonische Hotline für Störungsmeldungen bereitstellen',
    },
    earsText:
      'Der Auftragnehmer muss werktags von 8 bis 17 Uhr eine telefonische Hotline für Störungsmeldungen bereitstellen.',
    category: 'process',
    modality: 'mandatory',
    quantities: [],
    ambiguities: [],
    dependencies: [],
    confidence: 0.96,
    decision: 'approved',
  },
  {
    fixtureKey: 'warranty',
    docKey: 'vertrag',
    sectionNo: 5,
    sectionHeading: '4. Gewährleistung',
    page: 1,
    quote: 'Der Auftragnehmer soll eine Gewährleistung von 24 Monaten ab Abnahme anbieten.',
    earsPattern: 'ubiquitous',
    earsFields: {
      ...noFields,
      system: 'der Auftragnehmer',
      response: 'eine Gewährleistung von 24 Monaten ab Abnahme anbieten',
    },
    earsText: 'Der Auftragnehmer soll eine Gewährleistung von 24 Monaten ab Abnahme anbieten.',
    category: 'commercial',
    modality: 'target',
    quantities: [{ value: 24, unit: 'Monate', kind: 'count' }],
    ambiguities: [],
    dependencies: [],
    confidence: 0.91,
    decision: 'approved',
  },
  {
    // The pending review-queue card — still undecided today (2026-07-06).
    fixtureKey: 'sepa',
    docKey: 'vertrag',
    sectionNo: 6,
    sectionHeading: '5. Vergütung und Zahlungsweise',
    page: 1,
    quote: 'Rechnungen kann der Kunde künftig per SEPA-Lastschrift über das Portal begleichen.',
    earsPattern: 'optional_feature',
    earsFields: {
      ...noFields,
      system: 'das Kundenportal',
      feature: 'die SEPA-Lastschrift',
      response: 'die Begleichung von Rechnungen per SEPA-Lastschrift ermöglichen',
    },
    earsText:
      'Wo die SEPA-Lastschrift vorgesehen ist, kann das Kundenportal die Begleichung von Rechnungen per SEPA-Lastschrift ermöglichen.',
    category: 'commercial',
    modality: 'optional',
    quantities: [],
    ambiguities: [],
    dependencies: [],
    confidence: 0.72,
    decision: 'pending',
  },
];

/** Manual requirement↔requirement relations created after approval (spec §3.6). */
export const MANUAL_RELATIONS: Array<{
  kind: 'depends_on' | 'refines' | 'derived_from_same_clause' | 'conflicts_with' | 'merged_into';
  fromKey: string;
  toKey: string;
}> = [
  // Berichte setzen die Verbrauchsdaten der Übersicht voraus.
  { kind: 'depends_on', fromKey: 'export-pdf', toKey: 'consumption-view' },
  // Transportverschlüsselung konkretisiert die Datenhaltungs-Vorgabe.
  { kind: 'refines', fromKey: 'tls', toKey: 'onprem' },
];

export function extractionFixtureByKey(key: string): ExtractionFixture {
  const fixture = EXTRACTION_FIXTURES.find((f) => f.fixtureKey === key);
  if (!fixture) throw new Error(`Unknown extraction fixture key: ${key}`);
  return fixture;
}

/** Build the spec-§5.1 extraction payload for submit_proposal. */
export function buildExtractionPayload(
  fixture: ExtractionFixture,
  docId: string,
  docTitle: string,
  index: number,
): Record<string, unknown> {
  return {
    temp_id: `R-${String(index + 1).padStart(3, '0')}`,
    ears_pattern: fixture.earsPattern,
    ears_fields: fixture.earsFields,
    ears_text: fixture.earsText,
    category: fixture.category,
    modality: fixture.modality,
    quantities: fixture.quantities,
    source: {
      document: docTitle,
      documentId: docId,
      sectionId: String(fixture.sectionNo),
      section: fixture.sectionHeading,
      page: fixture.page,
      quote: fixture.quote,
    },
    ambiguities: fixture.ambiguities,
    dependencies: fixture.dependencies,
    confidence: fixture.confidence,
    language: 'de',
  };
}
