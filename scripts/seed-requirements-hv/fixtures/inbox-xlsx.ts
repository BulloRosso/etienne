/**
 * Pre-qualification questionnaire (XLSX) fixture — the second RFP for the
 * requirements-hv project. A separate deliverable from the main HVDC
 * tender: NSÜN's procurement team sends this five-sheet workbook to every
 * bidder up-front to screen company eligibility before they read the
 * technical bid.
 *
 * The seed turns this object into an actual `.xlsx` under
 * `inbox/PQQ-2026.xlsx` via `xlsx-writer.ts`, and turns the same rows
 * into a coverage matrix under `out/coverage/questionnaire.coverage.json`
 * via `questionnaire-coverage.ts`. Both paths share this single source
 * of truth so the cell addressed by `sourceRef` on each coverage row
 * matches the cell the seed writes.
 *
 * Column layout (same on every sheet):
 *   A: ID            (e.g. "PQQ-COMP-01")
 *   B: Question      (the question text the bidder answers)
 *   C: Mandatory     ("yes" / "no")
 *   D: Reference     (optional — points at the source clause / regulation)
 *   E: Response      (the column the fill-back writes the answer into)
 */

export interface QuestionnaireQuestion {
  id: string;
  question: string;
  mandatory: boolean;
  reference?: string;
  /**
   * Coverage seed: when present, the seeded coverage row uses this
   * `plannedResponseSlug` so the questionnaire row reuses an existing
   * tender wiki page (demonstrating cross-RFP planned-response reuse).
   * When absent, the seed creates a fresh stub under
   * `wiki/topics/planned-response/questionnaire-<id>.md`.
   */
  reusePlannedResponseSlug?: string;
  /** Optional seed-time committed answer body — populates the wiki stub. */
  seededAnswerBody?: string;
}

export interface QuestionnaireSheet {
  name: string;
  questions: QuestionnaireQuestion[];
}

export const QUESTIONNAIRE_FILENAME = 'PQQ-2026.xlsx';
export const QUESTIONNAIRE_INBOX_REL = `inbox/${QUESTIONNAIRE_FILENAME}`;
export const QUESTIONNAIRE_TITLE = 'Pre-qualification questionnaire 2026';

export const QUESTIONNAIRE_SHEETS: QuestionnaireSheet[] = [
  {
    name: 'Company & Organisation',
    questions: [
      {
        id: 'PQQ-COMP-01',
        question: 'State the bidder\'s full legal name, address of registered office, and commercial register number.',
        mandatory: true,
      },
      {
        id: 'PQQ-COMP-02',
        question: 'Provide the legal form of the bidder and the date of incorporation.',
        mandatory: true,
      },
      {
        id: 'PQQ-COMP-03',
        question: 'State the bidder\'s total headcount and the number of full-time engineering staff.',
        mandatory: true,
      },
      {
        id: 'PQQ-COMP-04',
        question: 'List all ISO certifications currently held by the bidder (ISO 9001, 14001, 45001, 27001) including certificate numbers and issuing body.',
        mandatory: true,
        reference: 'ISO 9001:2015, ISO 14001:2015, ISO 45001:2018',
      },
      {
        id: 'PQQ-COMP-05',
        question: 'Disclose the bidder\'s ownership structure: name every shareholder holding ≥ 10 % of voting rights.',
        mandatory: true,
      },
      {
        id: 'PQQ-COMP-06',
        question: 'Identify the parent company and any controlling entities under the meaning of § 17 AktG.',
        mandatory: true,
        reference: '§ 17 AktG',
      },
      {
        id: 'PQQ-COMP-07',
        question: 'List subsidiaries and joint ventures relevant to the scope of this tender.',
        mandatory: false,
      },
      {
        id: 'PQQ-COMP-08',
        question: 'Confirm that no insolvency proceedings have been opened or applied for against the bidder in the last 5 years.',
        mandatory: true,
      },
      {
        id: 'PQQ-COMP-09',
        question: 'Provide the contact details (name, role, email, phone) of the single point of contact for this bid.',
        mandatory: true,
      },
      {
        id: 'PQQ-COMP-10',
        question: 'State the working languages the bidder can support for technical correspondence on this project.',
        mandatory: false,
      },
    ],
  },
  {
    name: 'Financial Standing',
    questions: [
      {
        id: 'PQQ-FIN-01',
        question: 'State the bidder\'s consolidated annual turnover for each of the last three completed financial years (in EUR).',
        mandatory: true,
      },
      {
        id: 'PQQ-FIN-02',
        question: 'State the bidder\'s equity ratio at the end of the last completed financial year.',
        mandatory: true,
      },
      {
        id: 'PQQ-FIN-03',
        question: 'State the bidder\'s EBITDA margin for each of the last three financial years.',
        mandatory: true,
      },
      {
        id: 'PQQ-FIN-04',
        question: 'Provide a bank reference (name, address, contact) confirming a credit line of at least EUR 50 million.',
        mandatory: true,
      },
      {
        id: 'PQQ-FIN-05',
        question: 'Disclose any pending or threatened litigation with a contract value exceeding EUR 5 million.',
        mandatory: true,
      },
      {
        id: 'PQQ-FIN-06',
        question: 'Provide proof of professional indemnity insurance with a minimum coverage of EUR 25 million per occurrence.',
        mandatory: true,
      },
      {
        id: 'PQQ-FIN-07',
        question: 'Confirm the bidder is up to date on all tax and social-security obligations and attach proof from the competent authorities.',
        mandatory: true,
      },
      {
        id: 'PQQ-FIN-08',
        question: 'Disclose any contractual penalties incurred under public-sector contracts in the last 3 years.',
        mandatory: true,
      },
    ],
  },
  {
    name: 'Technical Capability',
    questions: [
      {
        id: 'PQQ-TECH-01',
        question: 'List at least three HVDC converter-station references in the last 10 years for which the bidder acted as main contractor. State customer, voltage class, power rating, and commissioning date for each.',
        mandatory: true,
        reusePlannedResponseSlug: 'planned-response/req-101',
        seededAnswerBody:
          'We refer to our Northshore-2022 (525 kV, 2 GW, commissioned 2024-Q3) and Capeline-2023 (320 kV, 1.4 GW, commissioned 2025-Q1) reference projects. Full project descriptions are appended in Annex A.',
      },
      {
        id: 'PQQ-TECH-02',
        question: 'State the number of in-house engineering full-time-equivalent staff dedicated to HVDC engineering.',
        mandatory: true,
      },
      {
        id: 'PQQ-TECH-03',
        question: 'List the simulation, design, and PLM software stack the bidder uses for HVDC projects (vendor + version).',
        mandatory: true,
      },
      {
        id: 'PQQ-TECH-04',
        question: 'State whether the bidder operates an in-house type-test laboratory for HV equipment. If yes, name the lab and list accreditations. If no, name the contracted test laboratory.',
        mandatory: true,
        reference: 'IEC 62271-1, IEC 60060-1',
      },
      {
        id: 'PQQ-TECH-05',
        question: 'List the protection-and-control platforms the bidder is certified to integrate (vendor + product family).',
        mandatory: true,
        reusePlannedResponseSlug: 'planned-response/req-247',
      },
      {
        id: 'PQQ-TECH-06',
        question: 'Confirm the bidder\'s experience with MMC topologies and list at least one reference project per topology variant.',
        mandatory: true,
        reusePlannedResponseSlug: 'planned-response/req-102',
      },
      {
        id: 'PQQ-TECH-07',
        question: 'State the bidder\'s in-house capability for harmonic-filter design and provide one reference project.',
        mandatory: true,
        reusePlannedResponseSlug: 'planned-response/req-303',
      },
      {
        id: 'PQQ-TECH-08',
        question: 'Describe the bidder\'s approach to FRT (fault ride-through) compliance demonstration and provide reference type-test reports.',
        mandatory: true,
        reusePlannedResponseSlug: 'planned-response/req-184',
        reference: 'NSÜN Grid Code §6',
      },
      {
        id: 'PQQ-TECH-09',
        question: 'List the manufacturing sites the bidder will use for this project and state which scope is produced at each.',
        mandatory: true,
      },
      {
        id: 'PQQ-TECH-10',
        question: 'State the bidder\'s standard warranty period for HVDC converter equipment.',
        mandatory: false,
      },
    ],
  },
  {
    name: 'HSE & Compliance',
    questions: [
      {
        id: 'PQQ-HSE-01',
        question: 'Provide the bidder\'s LTIFR (lost-time injury frequency rate) for each of the last 3 calendar years.',
        mandatory: true,
      },
      {
        id: 'PQQ-HSE-02',
        question: 'Confirm the bidder operates an ISO 14001-certified environmental management system at every site involved in the project.',
        mandatory: true,
        reference: 'ISO 14001:2015',
      },
      {
        id: 'PQQ-HSE-03',
        question: 'Confirm the bidder operates an ISO 45001-certified occupational health and safety management system.',
        mandatory: true,
        reference: 'ISO 45001:2018',
      },
      {
        id: 'PQQ-HSE-04',
        question: 'Disclose every reportable environmental incident in the last 5 years and the corrective actions taken.',
        mandatory: true,
      },
      {
        id: 'PQQ-HSE-05',
        question: 'Confirm the bidder\'s supplier code of conduct enforces the principles of the UN Global Compact on labour, environment and anti-corruption.',
        mandatory: true,
      },
      {
        id: 'PQQ-HSE-06',
        question: 'Confirm the bidder is not subject to any current EU, UN, US, or UK sanctions and attach an up-to-date screening certificate.',
        mandatory: true,
      },
      {
        id: 'PQQ-HSE-07',
        question: 'State the bidder\'s Scope 1 + Scope 2 greenhouse-gas emissions for the last reported year (in tCO2e) and the reduction target for 2030.',
        mandatory: false,
      },
      {
        id: 'PQQ-HSE-08',
        question: 'Confirm conformity with the German Supply Chain Due Diligence Act (LkSG) for the entire tier-1 supplier base of this project.',
        mandatory: true,
        reference: 'LkSG (BGBl. 2021 I S. 2959)',
      },
    ],
  },
  {
    name: 'Project Execution',
    questions: [
      {
        id: 'PQQ-EXEC-01',
        question: 'Name the proposed project manager and attach a CV demonstrating at least 10 years of HVDC project experience.',
        mandatory: true,
      },
      {
        id: 'PQQ-EXEC-02',
        question: 'Provide the proposed end-to-end delivery timeline from contract award to commercial operation (in months).',
        mandatory: true,
      },
      {
        id: 'PQQ-EXEC-03',
        question: 'State the proposed Q1 / Q2 / Q3 / Q4 site-acceptance test milestones relative to contract effective date.',
        mandatory: true,
      },
      {
        id: 'PQQ-EXEC-04',
        question: 'Describe the bidder\'s standard escalation matrix and the maximum response time guaranteed for Severity-1 issues during commissioning.',
        mandatory: true,
      },
      {
        id: 'PQQ-EXEC-05',
        question: 'Identify every sub-contractor the bidder intends to use for ≥ 10 % of the contract value, including their scope and qualifications.',
        mandatory: true,
      },
      {
        id: 'PQQ-EXEC-06',
        question: 'State the bidder\'s policy on key-personnel substitution after contract award.',
        mandatory: true,
      },
      {
        id: 'PQQ-EXEC-07',
        question: 'Provide the bidder\'s in-house commissioning team headcount and average years of HVDC commissioning experience.',
        mandatory: true,
      },
      {
        id: 'PQQ-EXEC-08',
        question: 'Confirm the bidder can supply on-site German-speaking commissioning leads and field engineers for the entire SAT phase.',
        mandatory: true,
      },
      {
        id: 'PQQ-EXEC-09',
        question: 'Describe the bidder\'s spare-parts strategy and guaranteed on-shore availability of critical spares (in working days).',
        mandatory: true,
      },
      {
        id: 'PQQ-EXEC-10',
        question: 'Describe the bidder\'s long-term service offer and the longest service contract term available.',
        mandatory: false,
      },
    ],
  },
];

// Column layout — single source of truth. The XLSX writer renders these
// as the header row; the coverage seed encodes them into sourceRef so
// the fill-back finds the right cells.
export const QUESTIONNAIRE_COLUMNS = {
  id: { letter: 'A', header: 'ID', width: 14 },
  question: { letter: 'B', header: 'Question', width: 70 },
  mandatory: { letter: 'C', header: 'Mandatory', width: 12 },
  reference: { letter: 'D', header: 'Reference', width: 28 },
  response: { letter: 'E', header: 'Response', width: 60 },
} as const;
