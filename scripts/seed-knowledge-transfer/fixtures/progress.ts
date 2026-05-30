/**
 * Two progress fixtures for the knowledge-transfer seed:
 *
 *   1. PROGRESS_TEMPLATE — the empty curriculum every guest starts from.
 *      Written to progress/_template.progress.json. On a guest's first
 *      contact, the agent copies this to progress/<username>.progress.json
 *      and runs the baseline interview.
 *
 *   2. PROGRESS_MARKUS — the pre-seeded partial state for the worked-
 *      example guest "markus". Demonstrates the UI with real Q/A entries,
 *      a streak, badges, and one completed quiz result. Written to
 *      progress/markus.progress.json.
 *
 * ToC IDs match the wiki page slugs (1, 1.1, 1.2, …) so the agent's
 * progress ↔ wiki joins are trivial. Weights bias the progress-bar
 * percentage; default weight 1 if omitted.
 */

export interface QAEntry {
  q: string;
  a_md: string;
  files?: string[];
  asked_at: string;
  kind?: 'qa' | 'check' | 'recall';
  confidence?: 'confirmed' | 'unconfirmed';
}

export interface RoleplayResult {
  /** Slug of the roleplay scenario (matches RoleplayDefinition.id). */
  scenario_id: string;
  persona_name: string;
  /** Optional curriculum ToC id copied from the scenario for cross-linking. */
  topic_id?: string;
  /** Sum of hint points the guest hit. */
  score: number;
  /** Sum of all available hint points. */
  of: number;
  mandatory_hits: number;
  mandatory_total: number;
  /** True iff score% >= pass_threshold AND mandatory_hits == mandatory_total. */
  passed: boolean;
  /** Number of in-character turns the roleplay ran. */
  turns: number;
  taken_at: string;
}

export interface ProgressNode {
  id: string;
  title: string;
  weight?: number;
  state?: 'not-started' | 'in-progress' | 'done';
  qa?: QAEntry[];
  children?: ProgressNode[];
}

export interface ProgressFile {
  user: string;
  role: 'guest' | 'user' | 'admin';
  display_name?: string;
  baseline?: {
    language: 'de' | 'en';
    prior_knowledge: string;
    learning_style: 'hands-on' | 'read-first' | 'visual' | 'mixed';
  };
  started?: string;
  toc: ProgressNode[];
  streak_days?: number;
  badges?: string[];
  quiz_results?: Array<{
    topic_id: string;
    score: number;
    of: number;
    taken_at: string;
  }>;
  roleplay_results?: RoleplayResult[];
}

const TOC_TEMPLATE: ProgressNode[] = [
  {
    id: '1',
    title: 'Deine Rolle bei Lumitec',
    weight: 1.0,
    children: [
      { id: '1.1', title: 'Deine Verantwortung' },
      { id: '1.2', title: 'Deine Kolleg:innen' },
      { id: '1.3', title: 'Deine Kundenprogramme' },
      { id: '1.4', title: 'Wo Dinge liegen' },
    ],
  },
  {
    id: '2',
    title: 'Was Lumitec macht',
    weight: 1.0,
    children: [
      { id: '2.1', title: 'Produkte' },
      { id: '2.2', title: 'Der Scheinwerfer als System' },
      { id: '2.3', title: 'Markt und Regulatorik' },
      { id: '2.4', title: 'Fertigungsablauf' },
    ],
  },
  {
    id: '3',
    title: 'Standards und Prozesse',
    weight: 1.5,
    children: [
      { id: '3.1', title: 'ISO 26262 (ASIL B Baseline)' },
      { id: '3.2', title: 'AUTOSAR Classic' },
      { id: '3.3', title: 'Automotive SPICE Level 2' },
      { id: '3.4', title: 'PPAP / IATF 16949' },
      { id: '3.5', title: 'Photometrie-Normen' },
    ],
  },
  {
    id: '4',
    title: 'Werkzeuge',
    weight: 1.0,
    children: [
      { id: '4.1', title: 'CANalyzer / CANoe' },
      { id: '4.2', title: 'DaVinci Configurator' },
      { id: '4.3', title: 'LucidShape / Speos' },
      { id: '4.4', title: 'Saber / PLECS' },
      { id: '4.5', title: 'HiL-Rig' },
      { id: '4.6', title: 'JIRA + Polarion' },
    ],
  },
  {
    id: '5',
    title: 'Day-in-the-life-Szenarien',
    weight: 0.8,
    children: [
      { id: '5.1', title: 'Flicker auf einem B-Muster (OEM-A)' },
      { id: '5.2', title: 'GB-4599-Glare-Failure (OEM-C)' },
      { id: '5.3', title: 'Später ECR von OEM-B premium' },
    ],
  },
];

function cloneToc(): ProgressNode[] {
  return JSON.parse(JSON.stringify(TOC_TEMPLATE));
}

export const PROGRESS_TEMPLATE: ProgressFile = {
  user: '_template',
  role: 'guest',
  toc: cloneToc(),
};

// ─── Markus's pre-seeded partial state ──────────────────────────────────

const userToc: ProgressNode[] = cloneToc();

function setNode(toc: ProgressNode[], id: string, patch: Partial<ProgressNode>) {
  for (const node of toc) {
    if (node.id === id) {
      Object.assign(node, patch);
      return;
    }
    if (node.children) setNode(node.children, id, patch);
  }
}

// Section 1 — fully done (with recorded Q/A).
setNode(userToc, '1.1', {
  state: 'done',
  qa: [
    {
      q: 'Welche Module gehören in den ersten 90 Tagen *nicht* in meine Verantwortung?',
      a_md:
        'In den ersten 90 Tagen verantwortest du:\n\n' +
        '- **Modul-Entwicklung** für ein Sub-System des Matrix-LED-Scheinwerfers\n' +
        '- **Anforderungs-Tracing** in Polarion\n' +
        '- **Test-Spezifikation** für dein Modul\n' +
        '- **Defect-Triage** in JIRA\n\n' +
        'Du verantwortest **nicht**: OEM-Kommunikation (läuft über Lars als PM), ' +
        'ASIL-Klassifikation (Functional Safety Manager) und Lieferantenauswahl ' +
        '(Strategic Sourcing).\n\n' +
        'Quelle: `wiki/topics/1-1-deine-verantwortung.md`.',
      files: ['wiki/topics/1-1-deine-verantwortung.md'],
      asked_at: '2026-05-26T09:14:00Z',
      kind: 'qa',
      confidence: 'confirmed',
    },
    {
      q: 'Was ist die Default-Antwortzeit für ein JIRA-Ticket während der B-Muster-Phase?',
      a_md: '1 Werktag. Quelle: `wiki/topics/1-1-deine-verantwortung.md` §"Innerhalb des Teams".',
      asked_at: '2026-05-26T09:23:00Z',
      kind: 'check',
      confidence: 'confirmed',
    },
  ],
});

setNode(userToc, '1.2', {
  state: 'done',
  qa: [
    {
      q: 'Wer entscheidet bei einem Anforderungs-Konflikt OEM-A vs. interne ASIL-Klassifikation?',
      a_md:
        'Eskalation an **Anke Brenner** (Team-Lead) + **Dr. Erik Wahlroos** ' +
        '(Functional Safety Manager, zentrale Funktion).\n\n' +
        'Anke koordiniert die Antwort an OEM-A über den Projektleiter Lars; ' +
        'Erik trifft die ASIL-technische Entscheidung. **Du selbst** entscheidest ' +
        'das nicht — auch wenn du die technische Bewertung beisteuerst.',
      files: ['wiki/topics/1-2-deine-kollegen.md', 'documents/iso-26262-asilb-our-baseline.md'],
      asked_at: '2026-05-27T10:02:00Z',
      kind: 'qa',
      confidence: 'confirmed',
    },
  ],
});

setNode(userToc, '1.3', {
  state: 'done',
  qa: [
    {
      q: 'Why is OEM-C the most productive program for me to learn troubleshooting on?',
      a_md:
        '_(Switching to English at your request — your baseline preference is English.)_\n\n' +
        "OEM-C is the only post-SOP program in Lumitec's current portfolio (SOP +90 days). " +
        'That means real field defect data flows in continuously, the lifecycle is mature, ' +
        'and there is little design freedom left — so the focus is **investigate / document / verify** ' +
        'rather than "what should we design".\n\n' +
        'Add the two regulatory regimes (GB 4599 + ECE R149) and you build the "which norm?" reflex faster ' +
        'on OEM-C than on any single-market program.',
      files: ['documents/oem-c-commercial-van-platform-overview.md'],
      asked_at: '2026-05-28T11:30:00Z',
      kind: 'qa',
      confidence: 'confirmed',
    },
  ],
});

setNode(userToc, '1.4', { state: 'done' });

// Section 2 — partial (2.1 done, 2.2 in-progress with several Q/As, 2.3/2.4 untouched).
setNode(userToc, '2.1', {
  state: 'done',
  qa: [
    {
      q: 'Was sind die fünf Produktlinien, und welche brauche ich in den ersten 90 Tagen?',
      a_md:
        'Lumitec liefert fünf Produktlinien:\n\n' +
        '- **Matrix-LED** (84 Segmente, Lumitec-spezifische Treiber-Topologie)\n' +
        '- **ADB** — Adaptive Driving Beam (Funktion *auf* Matrix-LED)\n' +
        '- **DRL** — Tagfahrlicht mit homogener Signaturfläche\n' +
        '- **Dynamische Blinker** — Sequenzer als IP-Block\n' +
        '- **μAFS** — höchste Auflösungsstufe (>1.000 Pixel), aktuell in Vorentwicklung für OEM-B premium\n\n' +
        'In deinen ersten 90 Tagen brauchst du **nur Matrix-LED und ADB**. Die anderen tauchen am Rand auf.\n\n' +
        'Quelle: `wiki/topics/2-1-produkte.md`.',
      files: ['wiki/topics/2-1-produkte.md'],
      asked_at: '2026-05-29T08:45:00Z',
      kind: 'qa',
      confidence: 'confirmed',
    },
  ],
});

setNode(userToc, '2.2', {
  state: 'in-progress',
  qa: [
    {
      q: 'In welche sieben Sub-Systeme zerfällt der Scheinwerfer?',
      a_md:
        '1. **LED-Arrays** (Lichtquelle, 84 Segmente Matrix)\n' +
        '2. **Optik** (Linsen + Reflektoren)\n' +
        '3. **Treiber-ICs** (Konstantstromquellen + Schutzlogik)\n' +
        '4. **μC + AUTOSAR-Stack** (der Headlight-ECU)\n' +
        '5. **Thermomanagement** (Heatsink + optional aktiver Lüfter)\n' +
        '6. **Gehäuse** (Streuscheibe, Trägergehäuse, Dichtungen)\n' +
        '7. **Steckverbinder + Bordnetz** (12-V oder 24-V)\n\n' +
        'Quelle: `wiki/topics/2-2-der-scheinwerfer-als-system.md`.',
      files: ['wiki/topics/2-2-der-scheinwerfer-als-system.md'],
      asked_at: '2026-05-29T09:10:00Z',
      kind: 'qa',
      confidence: 'confirmed',
    },
    {
      q: 'Welche Sub-Systeme betrifft die FRT-250-ms-Anforderung wirklich?',
      a_md:
        'Direkt betroffen sind nur **Treiber-ICs (Schaltflanke + Anti-Flicker-Filter)** ' +
        'und **μC + AUTOSAR (Task-Schedule + CAN-Empfangs-Latenz)**. ' +
        'LED-Arrays sind schnell genug, alle übrigen Sub-Systeme sind nicht im FRT-Pfad.',
      asked_at: '2026-05-29T09:25:00Z',
      kind: 'qa',
      confidence: 'confirmed',
    },
    {
      q: 'How does the FRT 250 ms relate to the FuSa Safety Goal?',
      a_md:
        'FRT 250 ms is the **functional response time** committed in the OEM-A contract — ' +
        'segment must turn off (or on) within 250 ms end-to-end.\n\n' +
        'The corresponding **Safety Goal** under our ISO 26262 ASIL B baseline is: ' +
        '*"A spuriously activated matrix segment must be deactivated within 250 ms."* ' +
        'Same number, different framing: FRT is the *performance* commitment; ' +
        'the Safety Goal is the *safety* commitment. Both are tracked in Polarion.',
      files: ['documents/iso-26262-asilb-our-baseline.md', 'documents/oem-a-program-glossary.md'],
      asked_at: '2026-05-29T09:40:00Z',
      kind: 'qa',
      confidence: 'confirmed',
    },
    {
      q: 'Welche Sub-Systeme dürfte ich nicht ohne Sven anfassen?',
      a_md:
        'Sven verantwortet das **Thermomanagement** (Sub-System 5) und ist die ' +
        'Eskalationsadresse für Treiber-IC-thermisch-relevante Fragen. Direkt zu Sven, ' +
        'wenn Junction-Temperaturen oder Derating-Modelle ins Spiel kommen.',
      asked_at: '2026-05-29T09:55:00Z',
      kind: 'check',
      confidence: 'confirmed',
    },
  ],
});

setNode(userToc, '3.1', {
  state: 'in-progress',
  qa: [
    {
      q: 'Why does Lumitec use ASIL B as the baseline instead of ASIL C?',
      a_md:
        '_(This is your most-asked topic — let me consolidate.)_\n\n' +
        'The hazard classification per ISO 26262-3 gives:\n' +
        '- **Severity (S):** S2 — possible non-fatal night-driving injury (glare to oncoming traffic).\n' +
        '- **Exposure (E):** E4 — frequent (every night drive on country roads).\n' +
        '- **Controllability (C):** C2 — possible to mitigate but difficult.\n\n' +
        'The classification table maps (S2, E4, C2) → **ASIL B**. ASIL C would require C3 ' +
        '(very-difficult controllability). For matrix-LED *without* a camera in our scope, ' +
        "we don't claim C3 — the driver still controls direction and speed.\n\n" +
        "When the camera pipeline is in our scope (it isn't for OEM-A), the controllability " +
        'argument changes and ASIL C becomes the right call. Lumitec keeps the baseline at ASIL B ' +
        'and escalates per-program.',
      files: ['documents/iso-26262-asilb-our-baseline.md'],
      asked_at: '2026-05-29T10:30:00Z',
      kind: 'qa',
      confidence: 'confirmed',
    },
  ],
});

export const PROGRESS_GUEST: ProgressFile = {
  user: 'guest',
  role: 'guest',
  display_name: 'Guest',
  baseline: {
    language: 'en',
    prior_knowledge:
      'EE master, 2 years at a semiconductor company on LED driver ICs. New to AUTOSAR, ISO 26262 in automotive context, and the OEM program lifecycle. German conversational, English fluent — prefers English for deep dives, accepts German for surface explanations.',
    learning_style: 'hands-on',
  },
  started: '2026-05-26T08:00:00Z',
  toc: userToc,
  streak_days: 4,
  badges: ['first-question', 'first-quiz', 'polyglot', 'roleplay-oem-a-flicker-complaint'],
  quiz_results: [
    { topic_id: '1', score: 7, of: 9, taken_at: '2026-05-28T15:42:00Z' },
  ],
  roleplay_results: [
    {
      scenario_id: 'oem-a-flicker-complaint',
      persona_name: 'Tom Reynolds',
      topic_id: '5.1',
      score: 85,
      of: 100,
      mandatory_hits: 3,
      mandatory_total: 3,
      passed: true,
      turns: 11,
      taken_at: '2026-05-29T14:05:00Z',
    },
  ],
};
