/**
 * Canonical Q2 2026 quarterly review packet — the demo artefact rendered
 * by the QuarterlyViewer (`.quarterly.json` viewer in the frontend).
 *
 * Schema matches QuarterlyViewer's expected data shape. See the viewer's
 * file header for the field-level contract.
 *
 * The seed writes this to:
 *   workspace/<project>/out/quarterly-packets/2026-Q2.quarterly.json
 *
 * and registers it in .etienne/user-interface.json previewDocuments so it
 * auto-opens in the preview pane alongside documentation.md.
 */

export interface QuarterlyPacket {
  packetId: string;
  title: string;
  fleet: string;
  date: string;
  mission: string;
  acceptanceCriterion: string;
  status: {
    state: 'open' | 'escalated' | 'acknowledged' | 'decisions-opened';
    actionedAt?: string;
    actionedBy?: string;
    note?: string;
  };
  expiredAssumptions: Array<{ id: string; label: string; cohort: string; vessel: string; what: string }>;
  ageingAssumptions: Array<{ id: string; label: string; cohort: string; vessel: string }>;
  freshAssumptions: Array<{ id: string; label: string; cohort: string; vessel: string }>;
  approachingGates: Array<{ vessel: string; kind: string; opensIso: string; monthsAway: number; deferredItems: string[] }>;
  breachedProjections: Array<{ vessel: string; label: string; status: string; detail: string }>;
  vessels: Array<{ name: string; alignment: number; status: string; note?: string }>;
  hypotheses: Array<{ id: string; statement: string; state: string }>;
  openQuestions: Array<{ id: string; label: string }>;
  callout: string;
}

export const QUARTERLY_PACKET_Q2_2026: QuarterlyPacket = {
  packetId: '2026-Q2',
  title: 'Q2 2026 Quarterly Review Packet',
  fleet: '5-vessel midsize crude tanker fleet',
  date: '2026-05-24',
  mission: 'Compliant and charter-ready through 2035',
  acceptanceCriterion: '<=1 vessel off-strategy at any time',
  status: { state: 'open' },

  expiredAssumptions: [
    {
      id: 'assumption-fuel-spread-narrows',
      label: 'Fuel spread narrows',
      cohort: '2018',
      vessel: 'Meridian',
      what: 'The high-/low-sulphur spread widened after IMO 2020, not narrowed. Underpins the 2018 no-scrubber decision.',
    },
    {
      id: 'assumption-low-sulphur-premium-small',
      label: 'Low-sulphur premium small',
      cohort: '2018',
      vessel: 'Meridian',
      what: 'Same cohort, same falsification.',
    },
    {
      id: 'assumption-rates-below-plan',
      label: 'Refi rates stay below plan',
      cohort: '2023',
      vessel: 'Meridian',
      what: 'Rates have sat above plan since Q3 2023. Underpins the 2023 refinancing.',
    },
    {
      id: 'assumption-eua-price-stable',
      label: 'EUA price stable at 2025 plan',
      cohort: '2025',
      vessel: 'Meridian',
      what: 'EUA Q1 2026 average ~€103/t vs €75/t plan band. Underpins the 2025 "comply via allowances" decision.',
    },
  ],

  ageingAssumptions: [
    { id: 'assumption-charter-rate-holds', label: 'Charter rate holds', cohort: '2021', vessel: 'Meridian' },
    { id: 'assumption-residual-value', label: 'Residual value glide holds', cohort: '2023', vessel: 'Meridian' },
    { id: 'assumption-no-retrofit-yet', label: 'No retrofit needed yet', cohort: '2025', vessel: 'Meridian' },
  ],

  freshAssumptions: [
    { id: 'assumption-counterparty-solid', label: 'Counterparty solid (AA-rated)', cohort: '2021', vessel: 'Meridian' },
  ],

  approachingGates: [
    {
      vessel: 'Meridian',
      kind: 'Special survey + dry-dock',
      opensIso: '2027-06-15',
      monthsAway: 14,
      deferredItems: ['Scrubber retrofit', 'Ballast-water treatment', 'Fuel-system prep'],
    },
  ],

  breachedProjections: [
    {
      vessel: 'Meridian',
      label: 'Lifetime earnings',
      status: 'Review requested',
      detail: 'Actuals left the original uncertainty cone in 2023 and have stayed below the lower band since. No re-baseline has been recorded.',
    },
    {
      vessel: 'Cape Pioneer',
      label: 'Lifetime earnings',
      status: 'On lower edge',
      detail: 'Actuals on the bottom of the cone. Not yet breached but on watch.',
    },
    {
      vessel: 'Aurora',
      label: 'Lifetime earnings',
      status: 'Within band',
      detail: 'No action.',
    },
    {
      vessel: 'Nordic Star',
      label: 'Lifetime earnings',
      status: 'Within band',
      detail: 'No action.',
    },
    {
      vessel: 'Orion',
      label: 'Lifetime earnings',
      status: 'Within band',
      detail: 'No action.',
    },
  ],

  vessels: [
    {
      name: 'Meridian',
      alignment: 38,
      status: 'Off-strategy',
      note: '4 expired assumptions, projection breached, 3 deferred items approaching gate, no scrubber, no fuel-system flexibility.',
    },
    {
      name: 'Cape Pioneer',
      alignment: 55,
      status: 'Watch',
      note: 'Allowance cost trending up; compliance envelope shrinking year-on-year under FuelEU intensity steps. Fuel-system prep conversation not yet opened.',
    },
    { name: 'Nordic Star', alignment: 72, status: 'Aligned', note: 'EU ETS cost absorbed within charter envelope — for now.' },
    { name: 'Aurora', alignment: 84, status: 'Aligned' },
    { name: 'Orion', alignment: 91, status: 'Aligned' },
  ],

  hypotheses: [
    { id: 'hypothesis-meridian-off-strategy', statement: 'The Meridian can be returned to >=70% alignment by the 2027 dry-dock decision', state: 'under_test' },
    { id: 'hypothesis-retrofit-payback-2027', statement: 'A scrubber retrofit at the 2027 dry-dock pays back within remaining hull life', state: 'under_test' },
    { id: 'hypothesis-eua-price-stable', statement: 'EUA prices stay within the 2025 plan band through the 2027 window', state: 'refuted' },
    { id: 'hypothesis-fuel-pathway-uncertain', statement: 'The IMO 2027 framework implementation lands within the 2025 plan envelope', state: 'under_test' },
    { id: 'hypothesis-charter-ready-2035', statement: 'Aurora, Nordic Star and Orion stay charter-ready through 2035 under current pathway', state: 'supported' },
    { id: 'hypothesis-cape-pioneer-early-fuel-prep', statement: "Bringing Cape Pioneer's fuel-system prep forward to 2028 is cheaper over total life", state: 'proposed' },
  ],

  openQuestions: [
    { id: 'openq-meridian-rebaseline', label: 'Meridian re-baseline — re-baseline lifetime-earnings projection now, or wait for the retrofit decision?' },
    { id: 'openq-meridian-retrofit', label: 'Meridian retrofit — retrofit / defer + plan / sell + scrap at the 2027 dry-dock. The red-team artefact is being built.' },
    { id: 'openq-cape-pioneer-fuel-system', label: "Cape Pioneer fuel-system prep — bring forward to 2028 or defer to 2033?" },
  ],

  callout:
    'The Meridian\'s four expired assumptions have been flagged quarterly for two years. Fourteen months remain until the cheap window. ' +
    'The packet is open; per the no-silent-default rule, it does not roll forward un-actioned — the affected commitments freeze at the next gate if no action is recorded. The floor is yours.',
};
