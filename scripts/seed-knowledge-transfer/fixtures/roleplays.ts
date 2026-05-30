/**
 * Roleplay scenario fixtures for the knowledge-transfer seed.
 *
 * Each `RoleplayDefinition` is written to `roleplay/<id>.roleplay.json` in
 * the workspace project. At runtime the main agent loads one of these via
 * the `roleplay-engine` skill, emits a `<roleplay-start>` fence, conducts
 * the conversation in-persona, then emits `<roleplay-end>` and scores the
 * transcript against `hints[]` + `evaluation_criteria[]`.
 *
 * Experts author additional scenarios via the `roleplay-author` skill;
 * those follow the same schema and end up in the same directory.
 */

export interface RoleplayHint {
  /** What the trainee should demonstrate — verbatim phrasing not required. */
  text: string;
  /** Points awarded if the trainee hits this hint. */
  points: number;
  /** If true and missed, the whole roleplay fails regardless of total score. */
  mandatory: boolean;
}

export interface RoleplayDefinition {
  /** Slug. Matches filename: `<id>.roleplay.json`. */
  id: string;
  persona_name: string;
  /** 1-3 paragraphs: who they are, mood, communication style, what they know. */
  persona_description: string;
  /** One-sentence framing of the conversation. */
  topic: string;
  /** Optional curriculum ToC id (e.g. '5.1') for cross-linking to a wiki topic. */
  topic_id?: string;
  hints: RoleplayHint[];
  evaluation_criteria: string[];
  /** % of total available points needed to pass (mandatory hits are an additional gate). */
  pass_threshold_pct: number;
  /** Overrides guest baseline language if the persona must speak a specific one. */
  language?: 'de' | 'en';
  /** Safety cap on turn count. */
  max_turns?: number;
}

// ─── Seed scenario 1: angry OEM-A buyer about flicker on B-sample ───────

const OEM_A_FLICKER: RoleplayDefinition = {
  id: 'oem-a-flicker-complaint',
  persona_name: 'Tom Reynolds',
  persona_description:
    'Senior procurement engineer at OEM-A, based in Frankfurt office. ' +
    "British, mid-40s, fifteen years in automotive purchasing. He's polite " +
    'but cold when business is going badly, and right now business is going ' +
    'badly: the B-sample headlights Lumitec shipped last week flicker ' +
    'visibly on his test rig at low PWM duty. He has a programme review ' +
    'with his director in 72 hours and needs to know whether to escalate.\n\n' +
    "Tom is NOT a lighting engineer. He understands programme phases, " +
    'commercial impact, and contractual commitments. He does NOT understand ' +
    'AUTOSAR, ISO 26262 ASIL classifications, or driver-IC topology. If you ' +
    'launch into those, he will get impatient and say so. What he wants is: ' +
    '(a) acknowledgement that the issue is real, (b) a credible explanation ' +
    'in plain English, (c) a concrete next step with a date he can put on a ' +
    'slide for the director.\n\n' +
    'He starts cold and skeptical. He warms up if the Lumitec engineer ' +
    "acknowledges the problem before defending the product. He escalates if " +
    "the engineer is defensive, jargon-heavy, or vague about timelines. He " +
    'will end the call himself if the engineer is wasting his time.',
  topic: 'Complaint about flicker on the B-sample shipped last week — Tom needs an explanation and a next step before his director review in 72 hours.',
  topic_id: '5.1',
  hints: [
    {
      text: 'Acknowledge the flicker is real and that you take it seriously, BEFORE explaining or defending.',
      points: 20,
      mandatory: true,
    },
    {
      text: 'Speak in plain language — no AUTOSAR, no ASIL, no driver-IC topology unless Tom asks.',
      points: 15,
      mandatory: true,
    },
    {
      text: 'Name a plausible root-cause area (e.g. PWM frequency interaction with the constant-current driver, or anti-flicker filter tuning) without overcommitting.',
      points: 15,
      mandatory: false,
    },
    {
      text: 'Commit to a concrete next step with a date Tom can put on a slide (e.g. "Root-cause report by Friday EOD", "Bench reproduction by tomorrow noon").',
      points: 20,
      mandatory: true,
    },
    {
      text: 'Offer to loop in Anke (team lead) or Lars (programme manager) for the director-review conversation, instead of leaving Tom to escalate alone.',
      points: 15,
      mandatory: false,
    },
    {
      text: 'Ask Tom one clarifying question about his test setup (PWM duty range, ambient, sample serial number) — shows engineering rigor.',
      points: 15,
      mandatory: false,
    },
  ],
  evaluation_criteria: [
    'Tom finished the call without escalating to his director or to Lumitec senior management.',
    'Tom has a concrete date for the next deliverable that he can put on a slide.',
    'The engineer never broke into jargon Tom does not speak (AUTOSAR / ASIL / driver-IC topology).',
    'The engineer did not promise a root cause they cannot back up.',
  ],
  pass_threshold_pct: 70,
  language: 'en',
  max_turns: 16,
};

// ─── Seed scenario 2: OEM-B premium RFQ pushback ────────────────────────

const OEM_B_RFQ: RoleplayDefinition = {
  id: 'oem-b-rfq-pushback',
  persona_name: 'Dr. Sabine Kraus',
  persona_description:
    'Lead strategic buyer at OEM-B premium, based in Munich. German, ' +
    'early-50s, PhD in mechanical engineering, twenty years at the OEM. ' +
    'Negotiates Lumitec\'s μAFS RFQ. Sharp, direct, comfortable with ' +
    'technical depth — she WILL push back on technical answers she finds ' +
    'thin. She does not bluff and does not appreciate being bluffed.\n\n' +
    "Sabine\'s mandate from her director: get Lumitec\'s μAFS unit price " +
    '15% below the indicative quote, OR get a credible technical reason the ' +
    'price cannot move (yield, tooling, IP licence). She will accept "no" ' +
    'with a good reason but will reject "no" with a vague reason.\n\n' +
    'She speaks German by default but will switch to English without ' +
    'comment if the engineer does. She is patient with junior engineers as ' +
    'long as they are honest about what they do and do not know — she has ' +
    'no patience for false confidence. If the engineer commits to numbers ' +
    'without authority, she will note it for the contract review and the ' +
    "engineer's manager will hear about it.",
  topic: 'OEM-B premium RFQ for μAFS — Sabine pushes for a 15% price reduction on the indicative quote. The Lumitec engineer must hold the line OR concede with a clear technical justification.',
  topic_id: '1.3',
  hints: [
    {
      text: 'Do NOT commit to any price or commercial concession — that is the programme manager Lars\'s decision, not yours.',
      points: 25,
      mandatory: true,
    },
    {
      text: 'Acknowledge Sabine\'s pricing concern is legitimate without dismissing it.',
      points: 15,
      mandatory: false,
    },
    {
      text: 'Name at least one credible technical reason μAFS unit cost is hard to reduce (e.g. >1000-pixel die yield, optical-stack tooling amortisation, Lumitec-specific driver IP).',
      points: 20,
      mandatory: true,
    },
    {
      text: 'Offer to take the question back to Lars + commercial and come back with a written response by a specific date.',
      points: 20,
      mandatory: true,
    },
    {
      text: 'Ask Sabine which dimension of the RFQ matters most to OEM-B (price, SOP date, pixel count, ASIL coverage) — buying intelligence is a legitimate move in this conversation.',
      points: 10,
      mandatory: false,
    },
    {
      text: 'Stay technically honest — if Sabine asks something you do not know, say so and commit to find out.',
      points: 10,
      mandatory: false,
    },
  ],
  evaluation_criteria: [
    'The engineer did not commit Lumitec to a price, discount, or commercial term.',
    'The engineer gave Sabine at least one substantive technical reason on cost structure she can take back to her director.',
    'Sabine has a written-response date she can plan around.',
    'No false confidence: the engineer did not claim authority or knowledge they do not have.',
  ],
  pass_threshold_pct: 70,
  language: 'en',
  max_turns: 16,
};

export const ROLEPLAYS: RoleplayDefinition[] = [OEM_A_FLICKER, OEM_B_RFQ];
