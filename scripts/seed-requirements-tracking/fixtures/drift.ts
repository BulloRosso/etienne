/**
 * Drift timeline for the implementation phase (May/June 2026).
 *
 * Four cards:
 *  (a) MODIFICATION on 'export-pdf'  → decided change_order by Sara (2026-06-03)
 *      — approving it auto-stales PORTAL-231's link and drafts the notice,
 *      so the orchestrator MUST create the tracker links first.
 *  (b) MODIFICATION on 'response-time' → decided in_scope by Sara (2026-06-03)
 *  (c) NEW_REQUIREMENT from the Cloud email, classified CONFLICT against the
 *      captured 'onprem' requirement — left UNDECIDED (the blocking card).
 *  (d) CONFIRMATION on 'meter-reading' → decided 'noted' (2026-06-03)
 *
 * Evidence quotes are VERBATIM substrings of the artifact fixtures in
 * ./tender-docs.ts (kw23 minutes, cloud-email).
 */

import { extractionFixtureByKey } from './requirements';

export interface DriftFixture {
  fixtureKey: string;
  /** artifact fixture key in ./tender-docs.ts the evidence quote comes from */
  artifactKey: 'kw23' | 'cloud-email';
  classification: 'MODIFICATION' | 'NEW_REQUIREMENT' | 'CONFLICT' | 'CONFIRMATION';
  /** extraction fixtureKeys → resolved to captured REQ ids by the orchestrator */
  affectedKeys: string[];
  decisionStatus: 'requested' | 'decided' | null;
  scopeAssessment: 'likely_in_scope' | 'likely_change' | 'unclear' | null;
  scopeRationale: string | null;
  evidence: {
    quote: string;
    location: string;
    speaker_or_author: string;
    date: string;
  };
  confidence: number;
  /** null → left undecided (pending drift-inbox card) */
  decision: 'in_scope' | 'change_order' | 'noted' | null;
  decidedAt?: string;
  decidedBy?: string;
  /** builds the drift payload once fixture keys are resolved to REQ ids */
  buildPayload: (reqIdOf: (fixtureKey: string) => string) => Record<string, unknown>;
}

const exportFixture = extractionFixtureByKey('export-pdf');
const responseTimeFixture = extractionFixtureByKey('response-time');

export const EXPORT_AFTER_EARS_TEXT =
  'Das Kundenportal muss Berichte als PDF, CSV oder XML bereitstellen.';
export const RESPONSE_TIME_AFTER_EARS_TEXT =
  'Das Kundenportal muss jede Nutzerinteraktion bei bis zu 500 gleichzeitigen Nutzern innerhalb von 2 Sekunden beantworten.';

export const DRIFT_FIXTURES: DriftFixture[] = [
  // (a) the change-order card — Sara accepts it as a claimable change.
  {
    fixtureKey: 'drift-export-formats',
    artifactKey: 'kw23',
    classification: 'MODIFICATION',
    affectedKeys: ['export-pdf'],
    decisionStatus: 'requested',
    scopeAssessment: 'likely_change',
    scopeRationale:
      'Die Leistungsbeschreibung (Abschnitt 3) nennt die Ausgabeformate abschließend: "Berichte sind als PDF bereitzustellen." CSV und XML erweitern die vereinbarten Formate und sind damit voraussichtlich eine kostenpflichtige Änderung.',
    evidence: {
      quote:
        'Herr Weber (Stadtwerke) wünscht zusätzlich einen Export nach CSV und XML, nicht nur PDF.',
      location: 'Jour-Fixe-Protokoll KW23, TOP 3 — Berichtsexport',
      speaker_or_author: 'Herr Weber (Stadtwerke Musterstadt)',
      date: '2026-06-02',
    },
    confidence: 0.9,
    decision: 'change_order',
    decidedAt: '2026-06-03T09:15:00Z',
    decidedBy: 'sara',
    buildPayload: () => ({
      diff: {
        before_ears_text: exportFixture.earsText,
        after_ears_text: EXPORT_AFTER_EARS_TEXT,
        changed_fields: [
          {
            field: 'response',
            before: 'Berichte als PDF bereitstellen',
            after: 'Berichte als PDF, CSV oder XML bereitstellen',
          },
        ],
        modality_change: null,
      },
      new_requirement: null,
      conflict: null,
      conflict_checks: [],
      clarification_question_draft: null,
    }),
  },

  // (b) the in-scope clarification of the load assumption.
  {
    fixtureKey: 'drift-response-time-load',
    artifactKey: 'kw23',
    classification: 'MODIFICATION',
    affectedKeys: ['response-time'],
    decisionStatus: 'decided',
    scopeAssessment: 'likely_in_scope',
    scopeRationale:
      'Die Lastannahme war in der Baseline offen (Ambiguität "missing_threshold"). Das Protokoll dokumentiert eine übereinstimmende Auslegung, keine neue Leistung — voraussichtlich in-scope.',
    evidence: {
      quote:
        'Die Antwortzeitanforderung von 2 Sekunden gilt nach übereinstimmender Auffassung bei bis zu 500 gleichzeitigen Nutzern.',
      location: 'Jour-Fixe-Protokoll KW23, TOP 2 — Lastverhalten und Antwortzeiten',
      speaker_or_author: 'Jour Fixe (Stadtwerke Musterstadt / NovaSys GmbH)',
      date: '2026-06-02',
    },
    confidence: 0.88,
    decision: 'in_scope',
    decidedAt: '2026-06-03T09:20:00Z',
    decidedBy: 'sara',
    buildPayload: () => ({
      diff: {
        before_ears_text: responseTimeFixture.earsText,
        after_ears_text: RESPONSE_TIME_AFTER_EARS_TEXT,
        changed_fields: [
          {
            field: 'response',
            before: 'jede Nutzerinteraktion innerhalb von 2 Sekunden beantworten',
            after:
              'jede Nutzerinteraktion bei bis zu 500 gleichzeitigen Nutzern innerhalb von 2 Sekunden beantworten',
          },
        ],
        modality_change: null,
      },
      new_requirement: null,
      conflict: null,
      conflict_checks: [],
      clarification_question_draft: null,
    }),
  },

  // (c) the blocking CONFLICT card — pending today (2026-07-06).
  {
    fixtureKey: 'drift-cloud-storage',
    artifactKey: 'cloud-email',
    classification: 'CONFLICT',
    affectedKeys: ['onprem'],
    decisionStatus: 'requested',
    scopeAssessment: 'unclear',
    scopeRationale:
      'Die gewünschte Ablage bei einem externen Cloud-Anbieter widerspricht der Baseline-Vorgabe, dass alle Kundendaten On-Premises im Rechenzentrum des Auftraggebers verbleiben. Vor einer Scope-Bewertung muss der Widerspruch aufgelöst werden.',
    evidence: {
      quote:
        'Wir möchten die Berichte künftig zusätzlich in unserer Cloud-Ablage bei einem externen Anbieter speichern.',
      location: 'E-Mail Cloud-Anbindung, 18.06.2026',
      speaker_or_author: 'Fr. Kern (Stadtwerke Musterstadt)',
      date: '2026-06-18',
    },
    confidence: 0.82,
    decision: null,
    buildPayload: (reqIdOf) => ({
      diff: null,
      new_requirement: {
        temp_id: 'R-D01',
        ears_pattern: 'event_driven',
        ears_fields: {
          system: 'das Kundenportal',
          trigger: 'ein Bericht erstellt wurde',
          state: null,
          condition: null,
          feature: null,
          response: 'den Bericht zusätzlich in der Cloud-Ablage des Auftraggebers bei einem externen Anbieter speichern',
        },
        ears_text:
          'Wenn ein Bericht erstellt wurde, muss das Kundenportal den Bericht zusätzlich in der Cloud-Ablage des Auftraggebers bei einem externen Anbieter speichern.',
        category: 'data',
        modality: 'mandatory',
        quantities: [],
        source: {
          document: 'E-Mail Cloud-Anbindung',
          section: 'E-Mail vom 18.06.2026',
          page: 1,
          quote:
            'Wir möchten die Berichte künftig zusätzlich in unserer Cloud-Ablage bei einem externen Anbieter speichern.',
        },
        ambiguities: [],
        dependencies: [],
        confidence: 0.82,
      },
      conflict: {
        statement_summary:
          'Berichte sollen zusätzlich bei einem externen Cloud-Anbieter gespeichert werden.',
        conflicting_requirement_id: reqIdOf('onprem'),
        nature:
          'Externe Cloud-Speicherung von Berichten mit Kundendaten widerspricht der On-Premises-Vorgabe der Technischen Anlage (Abschnitt 1).',
      },
      conflict_checks: [],
      clarification_question_draft: null,
    }),
  },

  // (d) a confirmation — recorded on the thread, nothing changes.
  {
    fixtureKey: 'drift-meter-confirmation',
    artifactKey: 'kw23',
    classification: 'CONFIRMATION',
    affectedKeys: ['meter-reading'],
    decisionStatus: 'decided',
    scopeAssessment: 'likely_in_scope',
    scopeRationale: 'Bestätigung der planmäßigen Umsetzung; keine inhaltliche Änderung.',
    evidence: {
      quote:
        'Frau Kern bestätigt, dass die Zählerstandserfassung wie in der Leistungsbeschreibung Abschnitt 4 beschrieben umgesetzt wird.',
      location: 'Jour-Fixe-Protokoll KW23, TOP 1 — Projektstand',
      speaker_or_author: 'Fr. Kern (Stadtwerke Musterstadt)',
      date: '2026-06-02',
    },
    confidence: 0.93,
    decision: 'noted',
    decidedAt: '2026-06-03T09:25:00Z',
    decidedBy: 'sara',
    buildPayload: () => ({
      diff: null,
      new_requirement: null,
      conflict: null,
      conflict_checks: [],
      clarification_question_draft: null,
    }),
  },
];
