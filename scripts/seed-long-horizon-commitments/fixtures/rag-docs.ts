/**
 * Synthetic source documents for the long-horizon-commitments RAG index.
 *
 * Written so the agent has something concrete to cite when ageing an
 * assumption. Categories:
 *   - charter:   charter party excerpts
 *   - reg:       regulatory summaries (EU ETS, FuelEU, IMO 2027, MARPOL)
 *   - retrofit:  scrubber retrofit quotes (2018 / 2023 / 2026)
 *   - survey:    special-survey reports
 *   - valuation: broker valuations (residual value drift)
 *   - analyst:   fuel-spread analyst notes
 *   - memo:      internal post-mortem memos
 *
 * Length 600-1500 chars so the chunker produces 1-2 chunks per doc.
 */

export interface RagDoc {
  filename: string;
  body: string;
}

const CHARTER: RagDoc[] = [
  {
    filename: 'charter-meridian-2021.md',
    body: `# Charter party excerpt — Meridian, 2021

Five-year time charter to a single AA-rated counterparty, commencing 1
October 2021. Headline rate USD 22,500/day, escalation clause indexed to
12-month Baltic Exchange average with a 2.5% floor / 3.5% cap per annum.

Bunker clause: charterer to supply fuel; vessel to remain fitted for very-
low-sulphur fuel oil (VLSFO) operation, in line with the owner's 2018
decision not to fit a scrubber.

EU ETS / FuelEU clause: not present in the original 2021 contract — the
regulations were drafted but not yet in force at signing. A 2024 side-letter
addresses EUA cost pass-through partially; FuelEU intensity costs remain
ambiguous and currently sit with the owner. This is one of the live
assumption-ageing items.`,
  },
  {
    filename: 'charter-aurora-2024.md',
    body: `# Charter party excerpt — Aurora, 2024

Two-year time charter + two-year option, commencing 1 March 2024. Rate USD
27,800/day base, scrubber premium USD 1,200/day (HSFO/VLSFO spread share
back to owner).

EU ETS clause: emissions allowances passed through to charterer in full
during the phase-in (60% in 2025, 100% from 2026). FuelEU intensity clause
references the FuelEU 2025 baseline; deviations rebilled at quarter end.

The optionality structure was a deliberate response to the lessons
documented in [memo-charter-review-2024](./memo-charter-review-2024.md): a
2+2 leaves room for a renegotiation around the 2027 IMO framework entry-
into-force.`,
  },
  {
    filename: 'charter-orion-2023.md',
    body: `# Charter party excerpt — Orion, 2023

Three-year time charter, commencing 1 July 2023. Rate USD 29,500/day. The
vessel is the youngest in the fleet (2020 build) and carries a hybrid
scrubber + FuelEU-ready engine room. Full ETS + FuelEU cost pass-through
to charterer. Counterparty AA.

The terms are not a useful benchmark for the older vessels in the fleet —
the technical specification, not the charter term, is doing the work.`,
  },
];

const REG: RagDoc[] = [
  {
    filename: 'reg-eu-ets-shipping.md',
    body: `# EU ETS — shipping coverage

Effective 1 January 2024 the EU Emissions Trading System extends to
maritime transport for vessels above 5,000 GT. Phase-in:

- 2024: surrender allowances for **40%** of reportable emissions.
- 2025: **70%**.
- **2026: 100%**.

Scope: 100% of intra-EEA voyages, 50% of voyages between an EEA port and a
non-EEA port, 100% of emissions at an EEA berth. Methane and nitrous oxide
included from 2026.

For a midsize crude tanker on a typical trading pattern, a back-of-envelope
estimate at EUA = €85/t and 30,000 t CO2e/yr yields roughly €1.3M/yr at
full coverage, before any pass-through. EUA price assumption is one of the
live items on the *Meridian*.`,
  },
  {
    filename: 'reg-fueleu-maritime.md',
    body: `# FuelEU Maritime — intensity steps

Effective 1 January 2025. Sets a declining cap on the greenhouse-gas
intensity (gCO2e/MJ) of energy used on board, against a 2020 baseline of
~91.16 gCO2e/MJ:

| Year | Reduction | Cap (gCO2e/MJ) |
|---|---|---|
| 2025 | -2% | 89.34 |
| 2030 | -6% | 85.69 |
| 2035 | -14.5% | 77.94 |
| 2040 | -31% | 62.90 |
| 2045 | -62% | 34.64 |
| 2050 | -80% | 18.23 |

Pooling between vessels and banking/borrowing across years are permitted
but commercially priced. A 2015-build VLSFO-burning tanker without fuel-
system flexibility hits the 2030 step squarely and the 2035 step hard —
which is why fuel-system preparation is parked at the *Meridian's* 2027
dry-dock window.`,
  },
  {
    filename: 'reg-imo-2027-framework.md',
    body: `# IMO 2027 net-zero framework

The IMO's 2023 strategy targets net-zero greenhouse-gas emissions *"by or
around"* 2050. A binding net-zero framework was approved in 2025 at MEPC
83 and enters force in 2027. The framework combines:

1. A **global fuel standard** — a declining cap on the greenhouse-gas
   intensity of marine energy used on or after 2028.
2. A **pricing mechanism** — payments on emissions above the benchmark,
   funds recycled into low-emission fuel deployment.

The framework's implementation-level details (exact intensity trajectory,
pricing benchmark, recycling formulae) are still settling at the time of
writing (Q2 2026). That **uncertainty itself** is the live assumption: the
2025 "comply via allowances" decision on the *Meridian* implicitly bet
that the IMO mechanism would land in a particular zone.`,
  },
  {
    filename: 'reg-marpol-annex-vi.md',
    body: `# MARPOL Annex VI — air pollution

Caps sulphur content in marine fuel at 0.50% m/m globally (since IMO 2020)
and 0.10% in designated Emission Control Areas (ECAs).

Compliance options:
1. Burn low-sulphur fuel (VLSFO 0.50%, MGO 0.10%).
2. Fit an exhaust-gas cleaning system (scrubber) and burn high-sulphur fuel
   (HSFO) — open-loop, closed-loop, or hybrid.

Scrubber economics depend on the HSFO/VLSFO spread. The 2018 decision on
the *Meridian* read the spread as narrow and likely to stay narrow; the
post-2020 evidence has run the other way (see
[analyst-fuel-spread-2024](./analyst-fuel-spread-2024.md) and
[memo-no-scrubber-2018-rationale](./memo-no-scrubber-2018-rationale.md)).`,
  },
];

const RETROFIT: RagDoc[] = [
  {
    filename: 'retrofit-quote-2018-open-loop.md',
    body: `# Scrubber retrofit quote — Meridian, 2018 (open-loop)

Indicative quote received April 2018 for an open-loop SOx scrubber on the
Meridian (113k dwt VLCC-class), dry-dock retrofit:

- Equipment + engineering: USD 2.8M
- Yard time premium: USD 0.4M
- Crew familiarisation + commissioning: USD 0.15M
- **Total indicative: USD 3.35M**

Payback model attached assumed an HSFO/VLSFO spread of USD 120/t falling to
USD 80/t over five years; combined with the vessel's 4,200 t/yr fuel
consumption that produced a six-year payback. The decision was *not to fit*
on the basis of the narrowing spread — see
[memo-no-scrubber-2018-rationale](./memo-no-scrubber-2018-rationale.md).`,
  },
  {
    filename: 'retrofit-quote-2023-hybrid.md',
    body: `# Scrubber retrofit quote — Meridian, 2023 (hybrid)

Refreshed quote from the same yard, August 2023, for a hybrid scrubber
(open-loop with closed-loop switching for restricted waters):

- Equipment + engineering: USD 4.2M
- Yard time premium: USD 0.7M (vessel out-of-cycle — special survey not
  due until 2027)
- Crew familiarisation: USD 0.2M
- **Total indicative: USD 5.1M**

Out-of-cycle premium is significant. The 2023 brief specifically asked for
a number to compare against an in-window retrofit at the 2027 dry-dock —
which came back at **USD 3.6M** (see
[retrofit-quote-2026-in-window](./retrofit-quote-2026-in-window.md)).
The 2023 conclusion was *defer to the 2027 window*.`,
  },
  {
    filename: 'retrofit-quote-2026-in-window.md',
    body: `# Scrubber retrofit quote — Meridian, 2026 (in-window for 2027 dry-dock)

Quote received February 2026 for a hybrid scrubber retrofit during the
already-scheduled 2027 special survey + dry-dock:

- Equipment + engineering: USD 3.2M
- Incremental yard time (vs survey-only): USD 0.25M
- Crew familiarisation: USD 0.15M
- **Total indicative: USD 3.6M**

Roughly **30% cheaper** than the 2023 out-of-cycle quote. This is the
window-cost differential the article references — the cheap window to act,
five-year gap to the next opportunity.

Payback model attached, three scenarios: spread sustained / spread mean-
reverts / spread narrows. Two of five earnings scenarios do not clear
within the remaining 8 years of hull life — the central rebuttal in the
[red-team workflow](./memo-charter-review-2024.md).`,
  },
];

const SURVEY: RagDoc[] = [
  {
    filename: 'survey-meridian-intermediate-2022.md',
    body: `# Special survey — Meridian, intermediate survey 2022

Intermediate survey conducted Singapore, March 2022. Findings:

- Hull condition: satisfactory, light coating breakdown amidships, recoated
  underway.
- Tank coatings: epoxy in good order, ~12% breakdown in 6 segregated
  ballast tanks — flagged for rework at the 2027 special survey.
- Main engine: no overhaul required; specific fuel consumption within 2%
  of trial figures.
- Ballast-water treatment: not yet installed — *deferred* with a
  compliance plan referencing the 2027 dry-dock window.

Surveyor's note: "Vessel in solid condition; remaining useful life
comfortably exceeds the 8-year horizon to the next special survey at
which all currently deferred items should be addressed."`,
  },
  {
    filename: 'survey-aurora-special-2024.md',
    body: `# Special survey — Aurora, 2024

Special survey + dry-dock conducted Qingdao, Q1 2024. Findings:

- Hull and machinery: excellent.
- Scrubber (open-loop): upgraded to hybrid during the dock — driven by
  expanding restricted-waters list (parts of the Med, Singapore, China
  river-mouths).
- Ballast-water treatment: in service, no remarks.
- EU ETS / FuelEU readiness: monitoring stack installed; data feed
  operational.

The Aurora is the example the fleet uses for "decided to act *inside* the
window" — same options the Meridian deferred, taken at marginal cost.`,
  },
];

const VALUATION: RagDoc[] = [
  {
    filename: 'valuation-meridian-2018.md',
    body: `# Broker valuation — Meridian, 2018

Three-broker average for the Meridian, late 2018:

- Charter-free market value: **USD 38.5M**
- 10-year residual value (2028 forward): USD 18.5M

This was the residual-value baseline that the 2018 no-scrubber and 2021
charter calls were built around.`,
  },
  {
    filename: 'valuation-meridian-2023.md',
    body: `# Broker valuation — Meridian, 2023

Three-broker average, Q2 2023:

- Charter-free market value: **USD 31.2M**
- 10-year residual value (2033 forward): USD 14.5M

Erosion vs the 2018 baseline tracks broadly with the wider sector but
notably faster than projected at the 2023 refinancing. This is the data
point that put **assumption-residual-value** on the *ageing* list — it has
not been falsified outright, but the glide path is below plan.`,
  },
  {
    filename: 'valuation-meridian-2026.md',
    body: `# Broker valuation — Meridian, 2026

Three-broker average, Q1 2026:

- Charter-free market value: **USD 26.8M**
- 10-year residual value (2036 forward): USD 11.0M
- Retrofit-fitted theoretical valuation (post-2027 scrubber): USD 30-32M
  (broker spread)

The retrofit-fitted theoretical line is the one the red-team cites as
"no resale uplift modelled in the case-for" — the upside is real but the
broker spread on it is wide.`,
  },
];

const ANALYST: RagDoc[] = [
  {
    filename: 'analyst-fuel-spread-2018-forecast.md',
    body: `# Fuel-spread analyst note — 2018 forecast

The original 2018 reference forecast used in the Meridian no-scrubber
decision:

- HSFO/VLSFO spread 2019 forecast: USD 120/t.
- 5-year glide-down to **USD 80/t** by 2024.
- Rationale: refinery capacity additions for marine VLSFO; demand
  destruction in HSFO post-IMO 2020.

This is the forecast the decision was built on. It looked credible at the
time. It did not survive contact with reality (see
[analyst-fuel-spread-2024](./analyst-fuel-spread-2024.md)).`,
  },
  {
    filename: 'analyst-fuel-spread-2024.md',
    body: `# Fuel-spread analyst note — 2024 actuals

Realised HSFO/VLSFO spread 2020-2024 vs the 2018 forecast:

| Year | Forecast (USD/t) | Actual avg (USD/t) |
|---|---|---|
| 2020 | 110 | 220 (IMO 2020 shock) |
| 2021 | 100 | 150 |
| 2022 | 95 | 270 (Russia-Ukraine) |
| 2023 | 90 | 190 |
| 2024 | 80 | 165 |

The spread widened, not narrowed, and stayed wide. **assumption-fuel-
spread-narrows** was first put on ageing in late 2020 and on expired in
2022. The 2018 no-scrubber decision is the load-bearing decision that this
expired assumption underpins.`,
  },
  {
    filename: 'analyst-eua-price-2026.md',
    body: `# Analyst note — EUA price 2025-2026 vs 2025 plan

The 2025 "comply via allowances" decision was built on a EUA reference
price of **€75/t**, with a sensitivity to €90/t.

Actuals:

- 2025 average: €82/t (within sensitivity).
- 2026 H1 average: **€103/t** (above sensitivity).
- Forward curve through 2028: €110-140/t band.

**assumption-eua-price-stable** moved to expired in Q4 2025. The decision
needs to be re-opened at the 2027 dry-dock window — the choice between
continued EUA purchase and a retrofit shifts non-trivially at €100+/t.`,
  },
];

const MEMO: RagDoc[] = [
  {
    filename: 'memo-no-scrubber-2018-rationale.md',
    body: `# Internal memo — Meridian no-scrubber rationale, May 2018

For the record: the recommendation not to fit a scrubber on the *Meridian*
at the 2018 special survey rests on three load-bearing claims:

1. **Spread narrows** — refinery capacity additions will collapse the
   HSFO/VLSFO spread within five years (USD 120 → USD 80/t).
2. **Low-sulphur premium small** — VLSFO availability will be widespread
   in our trading lanes; no shortage premium.
3. **Capex deployable elsewhere** — the USD 3.35M scrubber capex earns a
   better return refinancing the upcoming charter.

The decision is reversible at the next special survey (~2023 intermediate,
2027 special survey) at higher cost. The author flags that if the spread
*widens* materially within two years, the decision should be re-opened.

— [name redacted], commercial, May 2018.

(The agent now points at this memo, the [2024 analyst note](./analyst-fuel-spread-2024.md),
and the [2026 in-window quote](./retrofit-quote-2026-in-window.md) when
asked *"why did we skip the scrubber in 2018?"*.)`,
  },
  {
    filename: 'memo-charter-review-2024.md',
    body: `# Internal memo — Meridian charter review, October 2024

Review of the *Meridian's* 2021 five-year charter at the three-year mark.

Findings:
1. Realised charter income is **~11% below plan** cumulative through Q3
   2024. Primary driver: rate index has not held at the 2021 expectation.
   Counterparty performance has been exemplary.
2. The charter's bunker clause does not pass through EU ETS allowance
   costs adequately; a side-letter has been negotiated but only addresses
   60% of the exposure phase-in.
3. The charter is silent on FuelEU intensity costs. As FuelEU bites, this
   exposure stays with us.

Recommendations:
- Treat **assumption-charter-rate-holds** as ageing, not yet expired —
  the index has weakened but counterparty performance gives no signal to
  re-baseline the projection unilaterally.
- Bring the EU ETS / FuelEU pass-through gaps to the 2027 dry-dock review
  packet as a discussion item.

This memo is the agent's source for the *ageing* status on the 2021
charter cohort.`,
  },
];

export const RAG_DOCS: RagDoc[] = [
  ...CHARTER,
  ...REG,
  ...RETROFIT,
  ...SURVEY,
  ...VALUATION,
  ...ANALYST,
  ...MEMO,
];
