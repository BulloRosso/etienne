/**
 * 25 substantive wiki pages for the desalination-devices seed project:
 *   20 in topics/, 5 in sources/. (Two queries pages live separately.)
 *
 * Each entry maps onto the wiki skill's AddInput shape. Cross-links use
 * `[label](../topics/<slug>.md)` so wiki-add.ts auto-creates backlinks.
 * Auto-stubs may be created for outbound links that point to slugs not in
 * this fixture — that's expected and within the user's "about 25 pages"
 * tolerance.
 */

export interface WikiPageDraft {
  title: string;
  slug: string;
  bucket: 'topics' | 'sources' | 'queries';
  status: 'stable' | 'draft' | 'stub';
  confidence: 'high' | 'medium' | 'low';
  tags: string[];
  mission_relevance: number;
  body: string;
  classification?: 'public' | 'private' | 'secret';
}

const NOW = '2026-05-14T09:00:00Z';

function source(note: string) {
  return [{ kind: 'conversation' as const, turn: NOW, note }];
}

export const WIKI_PAGES: WikiPageDraft[] = [
  // -- Technologies (4) ---------------------------------------------------
  {
    title: 'Reverse osmosis (RO)',
    slug: 'reverse-osmosis',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['technology', 'membrane'],
    mission_relevance: 1.0,
    body:
`# Reverse osmosis

Membrane-based desalination. A high-pressure pump forces seawater across a
semi-permeable membrane; salt and most contaminants stay on the reject side
("brine"), permeate passes through as product water.

**Why we lean RO for the pilot**
- Lowest specific energy of mature small-scale options: 3-5 kWh/m³ at 5 m³/day
  with an [energy recovery device](../topics/energy-recovery-device.md).
- Commercial-off-the-shelf modules ([FILMTEC SW30](../sources/dow-filmtec-sw30.md),
  [Spectra Cape Horn](../sources/spectra-cape-horn.md)) tuned for the 700-1500 GPD
  range we need.
- Hurricane-resilient and well-suited to PV+battery operation.

**Pitfalls**
- Boron rejection is the weak spot: a single seawater pass typically clears
  85-92 % of boron — see [parameter-boron](../topics/parameter-boron.md).
- Membrane fouling demands [pre-treatment](../topics/pre-treatment.md);
  skipping it shortens membrane life from 5 years to 12-18 months.

**Rule we keep coming back to**: always validate the proposed RO design against
both [WHO GDWQ](../topics/who-gdwq-overview.md) AND [EU DWD 2020/2184](../topics/eu-2020-2184.md)
separately — they diverge on boron and turbidity.
`,
  },
  {
    title: 'Multi-effect distillation (MED)',
    slug: 'multi-effect-distillation',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['technology', 'thermal'],
    mission_relevance: 0.55,
    body:
`# Multi-effect distillation

Thermal process: seawater is boiled in successive low-pressure stages
("effects"), each driven by the vapour from the previous one.

**Why not MED for this pilot**
- Specific energy 8-15 kWh/m³ (thermal-equivalent) — too high for a PV-only
  island unit.
- Footprint and stainless-steel cost dwarf [reverse osmosis](../topics/reverse-osmosis.md)
  below 100 m³/day.
- Best suited to co-generation contexts (cruise ships, waste-heat plants).

We keep MED on file as a fallback if a reliable waste-heat source emerges
on-island.
`,
  },
  {
    title: 'Solar still',
    slug: 'solar-still',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['technology', 'passive', 'low-cost'],
    mission_relevance: 0.6,
    body:
`# Solar still

Passive thermal: glass-covered basin evaporates seawater by direct solar
heat; vapour condenses on the cooler glass and runs to a collector.

**Trade-off snapshot**
- Output: ~3-5 L/m² of stillage area per sunny day.
- Capex: ~50 €/m² of stillage area, no moving parts, ~20 year life.
- Energy: zero electrical, but enormous footprint — a 4-person household
  needs ~10 m² minimum, a 200-person settlement needs >500 m².

**Where solar still wins** — emergency / failover for [RO](../topics/reverse-osmosis.md)
maintenance windows, and as a teaching tool. **Where it loses** — primary
supply for >20 people on a land-constrained island.
`,
  },
  {
    title: 'Electrodialysis (ED / EDR)',
    slug: 'electrodialysis',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['technology', 'brackish'],
    mission_relevance: 0.7,
    body:
`# Electrodialysis (ED / EDR)

Ion-exchange membranes driven by a DC field. EDR (reversal) periodically
flips polarity to slough fouling layers.

**Sweet spot**: brackish water (1 000-10 000 mg/L TDS), which matches some
Pacific atoll lens-aquifers that are too salty to drink but cheaper to
treat than seawater. Specific energy 1.0-1.5 kWh/m³ at brackish TDS — half
the [RO](../topics/reverse-osmosis.md) figure for the same water — but the
unit is more capital-intensive at 5 m³/day scale.

Decision rule: pick ED only when feed TDS is below 10 000 mg/L AND we don't
need to remove neutral organics (ED doesn't).
`,
  },

  // -- Process stages (4) -------------------------------------------------
  {
    title: 'Pre-treatment',
    slug: 'pre-treatment',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['process', 'fouling'],
    mission_relevance: 0.9,
    body:
`# Pre-treatment

Everything between the seawater intake and the high-pressure pump. Pre-
treatment is the single biggest determinant of [RO membrane](../topics/ro-membrane-spiral-wound.md)
life: a clean feed at SDI<3 lets a [FILMTEC SW30](../sources/dow-filmtec-sw30.md)
last its rated 5 years; a dirty feed at SDI>5 kills it in 18 months.

**Standard stack for our pilot**
1. Coarse strainer (200 µm) at the intake — pebbles, fish, seaweed.
2. Multimedia filter (anthracite/sand/garnet) — removes turbidity.
3. Cartridge filter (5 µm absolute) — final polish.
4. Antiscalant dosing — citric or phosphonate, 2-4 ppm.
5. Sodium-bisulfite dosing if any chlorine residual is present (membranes hate it).

See [maintenance-schedule](../topics/maintenance-schedule.md) for the cleaning cadence.
`,
  },
  {
    title: 'Post-treatment',
    slug: 'post-treatment',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['process', 'compliance'],
    mission_relevance: 0.95,
    body:
`# Post-treatment

RO permeate is essentially distilled — TDS often below 100 mg/L. That's
*below* the desirable taste range (300-600 mg/L per WHO panels) AND
unstable: aggressive, low-buffered, picks up metals from distribution pipes.

**Standard stack after the membrane**
1. **Remineralisation** — calcite contactor adds 40-60 mg/L of Ca²⁺ and
   ~80 mg/L of HCO₃⁻. Targets [parameter-tds](../topics/parameter-tds.md)
   around 300 mg/L.
2. **pH adjustment** — to 7.5-8.0 (calcite output is typically pH 8 already).
3. **Disinfection** — free chlorine 0.2-0.5 mg/L at the network entry, or
   UV at the unit boundary if the distribution loop is short.
4. **Boron polishing** — only if a [boron](../topics/parameter-boron.md) lab
   test flags the first-pass permeate above 1.5 mg/L (WHO) / 1.0 mg/L (EU).

If we skip post-treatment we fail [WHO GDWQ](../topics/who-gdwq-overview.md)
on taste/corrosion grounds and [EU DWD 2020/2184](../topics/eu-2020-2184.md)
on free chlorine residual.
`,
  },
  {
    title: 'RO membrane (spiral-wound)',
    slug: 'ro-membrane-spiral-wound',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['component', 'membrane'],
    mission_relevance: 0.95,
    body:
`# RO membrane (spiral-wound)

The active element: a thin-film composite polyamide membrane rolled around
a permeate core with mesh feed-spacers. Standard sizes for our scale are
2.5" × 40" and 4" × 40".

**Specs we plan around**
- Salt rejection: 99.4 % stabilised ([FILMTEC SW30-2540](../sources/dow-filmtec-sw30.md)).
- Test conditions: 32 000 ppm NaCl + 5 ppm B, 800 psi (55 bar), 25 °C, 8 % recovery.
- Boron rejection: 85-92 % in a single pass — often the binding constraint
  ([parameter-boron](../topics/parameter-boron.md)).
- Field life: 5 years at SDI<3 and properly antiscaled feed; 12-18 months
  without [pre-treatment](../topics/pre-treatment.md).

**Replacement cost**: ~€450 per element (2.5 × 40, 2026 list).
`,
  },
  {
    title: 'High-pressure pump',
    slug: 'high-pressure-pump',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['component', 'mechanical'],
    mission_relevance: 0.85,
    body:
`# High-pressure pump

Lifts feed water to the 55-70 bar needed across a seawater RO membrane.
Positive-displacement plunger pumps dominate at our scale; centrifugals
take over above ~10 m³/h.

**Candidates**
- [Grundfos SQFlex](../sources/grundfos-sqflex.md) — solar-direct, no
  battery required for daytime operation, 1.5-7 m³/h depending on head.
- Cat Pump 5CP — workhorse, needs a separate VFD + battery bank.
- Danfoss APP — high-efficiency axial-piston, pairs well with [erd](../topics/energy-recovery-device.md).

Energy budget at 800 psi and 5 m³/day: ~30 kWh/day (≈6 kWh/m³) before
[ERD](../topics/energy-recovery-device.md); ~15-20 kWh/day with one.
`,
  },

  // -- Components (3) -----------------------------------------------------
  {
    title: 'Energy recovery device (ERD)',
    slug: 'energy-recovery-device',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['component', 'energy'],
    mission_relevance: 0.85,
    body:
`# Energy recovery device

Recovers ~96 % of the pressure energy in the brine reject stream by
transferring it directly to incoming feed. Cuts [high-pressure-pump](../topics/high-pressure-pump.md)
energy by ~50 % at our scale.

**Types**
- *Pressure exchanger* (rotary, Energy Recovery Inc. PX): mature, expensive
  below 5 m³/h. Eligible for our larger pilot variant.
- *Clark pump* (Spectra): hydraulic intensifier; tuned for 0.5-2 m³/h
  watermaker market. Default for the 4-person village scenario.

Without an ERD the pilot's PV array needs to roughly double.
`,
  },
  {
    title: 'PV array sizing',
    slug: 'pv-array-sizing',
    bucket: 'topics',
    status: 'stable',
    confidence: 'medium',
    tags: ['energy', 'design'],
    mission_relevance: 0.85,
    body:
`# PV array sizing

Rule of thumb for the Pacific/Caribbean: assume 4.5 peak sun-hours/day, 80 %
inverter+battery round-trip efficiency.

Required PV kWp = daily kWh / (4.5 × 0.8)

**Example — 5 m³/day RO with ERD**
- Energy at the pump shaft: ~3.5 kWh/m³ × 5 = 17.5 kWh/day.
- Including [pre-treatment](../topics/pre-treatment.md) and [post-treatment](../topics/post-treatment.md)
  loads (UV, calcite contactor pump, chlorine doser): ~22 kWh/day total.
- PV: 22 / 3.6 ≈ 6.1 kWp. We size to 7 kWp to cover cloudy spells and
  membrane-cleaning cycles.

Pair with [battery-storage](../topics/battery-storage.md) for evening top-up
and emergency runs. See [tco-model](../topics/tco-model.md) for capex/opex.
`,
  },
  {
    title: 'Battery storage',
    slug: 'battery-storage',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['energy', 'design'],
    mission_relevance: 0.75,
    body:
`# Battery storage

We size for ~6 hours of autonomy at half the daytime production rate — enough
to finish a [pre-treatment](../topics/pre-treatment.md) backwash after sunset
and to ride out a cloudy 24-hour window.

**Chemistry**: LFP (LiFePO₄) is the default for tropical island operation:
- Tolerates 45 °C ambient.
- 6 000-cycle life at 80 % DoD.
- ~€450/kWh installed (2026), 10-year warranty common.

**Lead-acid alternative**: AGM 3 000 cycles, half the price; sensible if
maintenance staff are unfamiliar with Li-ion and disposal is hard.

For the 5 m³/day pilot: 7 kWh usable is enough. We size to 10 kWh.
`,
  },

  // -- Regulation (3) -----------------------------------------------------
  {
    title: 'WHO GDWQ — overview',
    slug: 'who-gdwq-overview',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['regulation', 'compliance'],
    mission_relevance: 1.0,
    body:
`# WHO Guidelines for Drinking-water Quality (GDWQ)

The 4th edition (2011) plus 2017 + 2022 addenda is the global reference.
We anchor every compliance question to WHO GDWQ *first*, then check the
EU and any local rules for divergences.

**Headline values we use**
- TDS: no health-based limit; taste tiers — excellent <300, good 300-600,
  fair 600-900, poor 900-1200, unacceptable >1200 mg/L.
- *E. coli* / faecal coliform: must be undetectable in any 100 mL sample.
- Boron: 2.4 mg/L (provisional guideline, 4th ed.).
- Free chlorine: 0.2-0.5 mg/L residual at the point of consumption.
- Turbidity: <1 NTU for effective disinfection; <0.3 NTU optimal.

**Why WHO matters even in EU/national-regulated contexts**
- WHO frames Water Safety Plans, which the EU DWD now mandates.
- Pacific island nations often lack national regulations and adopt WHO
  GDWQ by reference.

Cross-references: [parameter-tds](../topics/parameter-tds.md), [parameter-coliform](../topics/parameter-coliform.md),
[parameter-boron](../topics/parameter-boron.md), and [source: WHO GDWQ §6](../sources/who-gdwq-section-6.md).
`,
  },
  {
    title: 'EU Drinking Water Directive 2020/2184',
    slug: 'eu-2020-2184',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['regulation', 'compliance', 'eu'],
    mission_relevance: 0.95,
    body:
`# EU Drinking Water Directive 2020/2184

The recast directive (binding 12 January 2023, member-state transposition
through 2026). Replaces 98/83/EC. Annex I sets parametric values in four parts:
A microbiological, B chemical, C indicator, D distribution-system risk.

**Headline values vs WHO GDWQ** (highlights):
- Arsenic: 10 µg/L (same as WHO).
- Boron: **1.5 mg/L** (stricter than WHO's 2.4).
- *E. coli*: 0 /100 mL (same as WHO).
- Coliforms (indicator): 0 /100 mL.
- Lead: 5 µg/L from 2036, 10 µg/L until then (much stricter than WHO 10).
- Turbidity: 1 NTU (treated water leaving works).

**Why we test against EU even outside the EU**
- Almost all CE-marked components and labs validate to EU values.
- It's the strictest mainstream regime for boron, which is the constraint
  that pushes us toward a second-pass [RO](../topics/reverse-osmosis.md)
  in seawater service.

Cross-references: [source: EU DWD Annex I](../sources/eu-dwd-annex-i.md),
[parameter-boron](../topics/parameter-boron.md).
`,
  },
  {
    title: 'Maintenance schedule',
    slug: 'maintenance-schedule',
    bucket: 'topics',
    status: 'stable',
    confidence: 'medium',
    tags: ['operations'],
    mission_relevance: 0.8,
    body:
`# Maintenance schedule

The discipline that turns a 5 m³/day pilot from a press release into a 10-year
asset.

| Cadence | Task | Why |
|---|---|---|
| Daily | Read inlet pressure, permeate conductivity, recovery | Catch fouling fast |
| Weekly | Cartridge filter inspection, antiscalant tank top-up | Cheap, high-leverage |
| Monthly | SDI test on raw feed; chlorine dose verification at network | Compliance evidence |
| 6-monthly | CIP (alkaline then acid) of [RO membrane](../topics/ro-membrane-spiral-wound.md) | Restores flux without replacement |
| Annually | Replace cartridge filters, recalibrate sensors, refill calcite | |
| 5-yearly | Replace [RO membrane](../topics/ro-membrane-spiral-wound.md) elements | Beyond this, salt rejection drops |
| 8-10 yearly | Replace [battery-storage](../topics/battery-storage.md), high-pressure-pump rebuild | |

Skipping the 6-monthly CIP is the single most common reason small RO units
fail at year 2-3 in tropical service.
`,
  },

  // -- Parameters (3) -----------------------------------------------------
  {
    title: 'Parameter: TDS (total dissolved solids)',
    slug: 'parameter-tds',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['parameter', 'compliance'],
    mission_relevance: 0.9,
    body:
`# Parameter: TDS

Bulk measure of dissolved minerals, salts, and small organics. Reported in
mg/L; for our brackish/seawater feed it's the headline number.

**WHO GDWQ taste tiers** ([who-gdwq-overview](../topics/who-gdwq-overview.md))
- <300: excellent.
- 300-600: good (our target after [post-treatment](../topics/post-treatment.md)).
- 600-900: fair.
- 900-1200: poor.
- >1200: unacceptable.

**Feed-side TDS** drives technology choice:
- <1 500 mg/L → consider [ED/EDR](../topics/electrodialysis.md) first.
- 1 500-10 000 mg/L → brackish-water RO, single pass.
- 10 000-45 000 mg/L → seawater RO, single pass with [ERD](../topics/energy-recovery-device.md).
- >45 000 mg/L → two-pass or alternative technology.
`,
  },
  {
    title: 'Parameter: coliforms / E. coli',
    slug: 'parameter-coliform',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['parameter', 'compliance', 'microbiology'],
    mission_relevance: 0.9,
    body:
`# Parameter: coliforms / *E. coli*

The microbiological backbone of every modern drinking-water regulation.

- **Required value (WHO + EU)**: 0 *E. coli* per 100 mL, 0 coliforms per 100
  mL in treated water leaving the works.
- **Method**: EN ISO 9308-1 (membrane filtration) or 9308-2 (MPN). Field-
  portable kits exist; we send confirmation samples to an accredited lab
  monthly.

**Failure mode we worry about**: post-treatment recontamination via the
calcite contactor or storage tank. Mitigation:
- Free chlorine residual 0.2-0.5 mg/L at the network entry.
- UV at the unit boundary (256 nm, ≥40 mJ/cm²) as belt-and-braces.

See [post-treatment](../topics/post-treatment.md) for the dosing layout.
`,
  },
  {
    title: 'Parameter: boron',
    slug: 'parameter-boron',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['parameter', 'compliance', 'membrane'],
    mission_relevance: 0.95,
    body:
`# Parameter: boron

Seawater contains ~4-5 mg/L of boron, almost entirely as boric acid. At the
membrane operating pH (8.0) the acid is uncharged, so a single-pass seawater
[RO](../topics/reverse-osmosis.md) clears only 85-92 % of it.

**Limits**
- WHO GDWQ: 2.4 mg/L (provisional).
- EU DWD 2020/2184: **1.5 mg/L** (binding).
- WHO desalinated-water guidance: extra caution because permeate is the
  *only* water source.

**Why this is the load-bearing rule**
- A standard SW30-2540 with 5 ppm B feed and 8 % recovery produces ~0.4-0.6
  mg/L B in permeate — safely under both limits at low recovery.
- At 30-40 % recovery (which we need for energy economy) permeate B climbs
  to 0.8-1.2 mg/L — still WHO-compliant, marginal under EU.
- For an EU-regulated deployment (or anywhere using EU values), we plan a
  partial second pass with pH raised to ~10 to ionise the boric acid
  before the membrane.

**Always test boron against WHO AND EU separately** — this is the parameter
where the two regimes most often disagree on a given design.
`,
  },

  // -- Deployment context (2) ---------------------------------------------
  {
    title: 'Pacific island pilots',
    slug: 'pacific-island-pilots',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['deployment', 'region:pacific'],
    mission_relevance: 0.7,
    body:
`# Pacific island pilots

Published deployments we draw lessons from.

- **Tuvalu (Funafuti)** — Japanese-government RO plant (multiple m³/day),
  emergency rainwater backup. Lesson: tropical-cyclone resilience needs the
  unit and its [battery-storage](../topics/battery-storage.md) in a hardened
  enclosure, not just under a roof.
- **Tokelau atolls** — solar + RO; first plant ran 18 months before a
  membrane failure traced to skipped antiscalant. Lesson: don't let the
  pre-treatment chemicals run out, ever.
- **Kiribati outer islands** — community-managed mix of solar still and
  small RO. Lesson: split the load — solar still as fail-safe for cooking
  water, RO for drinking, rainwater for everything else.

See also [caribbean-island-pilots](../topics/caribbean-island-pilots.md).
`,
  },
  {
    title: 'Caribbean island pilots',
    slug: 'caribbean-island-pilots',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['deployment', 'region:caribbean'],
    mission_relevance: 0.7,
    body:
`# Caribbean island pilots

Published deployments we draw lessons from.

- **Bequia (Saint Vincent & the Grenadines)** — small commercial RO units
  serving resorts, retail water ~10-20 €/m³ before solarisation. Lesson:
  the *avoided cost* of imported bottled water makes a community-scale RO
  pay back inside 5 years.
- **Carriacou (Grenada)** — post-hurricane resilience drove a UNICEF pilot.
  Lesson: hurricane shutters and a quick-disconnect rainwater inlet make
  the difference between a 2-week and a 2-month outage after a storm.
- **Antigua/Barbuda** — large municipal RO plants, but informative because
  membrane life on the open-Atlantic intake is shorter (3-4 years vs 5)
  due to biofouling. Lesson: lagoon intakes beat open-ocean for our scale.

See also [pacific-island-pilots](../topics/pacific-island-pilots.md).
`,
  },

  // -- Economics (1) ------------------------------------------------------
  {
    title: 'TCO model — 10-year horizon',
    slug: 'tco-model',
    bucket: 'topics',
    status: 'stable',
    confidence: 'medium',
    tags: ['economics'],
    mission_relevance: 0.9,
    body:
`# TCO model — 10-year horizon

A back-of-envelope for the 5 m³/day pilot, both scenarios.

**Capex** (one-off, EUR, 2026 reference)
| Item | Pacific atoll | Caribbean island |
|---|---:|---:|
| RO skid + ERD | 18 000 | 18 000 |
| Pre/post-treatment + dosing | 6 000 | 7 000 |
| 7 kWp PV + mounts | 7 500 | 7 500 |
| 10 kWh LFP battery | 4 500 | 4 500 |
| Diesel genset (5 kVA, backup) | 2 500 | 3 000 |
| Hardened enclosure | 3 500 | 5 000 |
| Install + logistics | 8 000 | 6 000 |
| **Total capex** | **50 000** | **51 000** |

**Opex** (annual, EUR)
- Membranes (1/5th of stack/year) ≈ 250
- Cartridges, antiscalant, chlorine ≈ 800
- Electricity (genset fuel only) ≈ 300
- Maintenance labour (1 day/month at local rate) ≈ 1 500
- **Annual opex ≈ 2 850**

**Major replacements**
- Year 5: full membrane set (~1 200).
- Year 8: battery replacement (~4 500).

**10-year TCO**: ~50 000 + 10 × 2 850 + 1 200 + 4 500 ≈ **84 200 EUR**.

**Per m³ produced** (5 m³/day × 365 × 0.85 availability = ~1 550 m³/year over 10 years):
**~5.4 EUR/m³** — well below the 10-20 EUR/m³ trucked-in / bottled baseline
for these regions.
`,
  },

  // -- Sources (5) --------------------------------------------------------
  {
    title: 'Source: DOW FILMTEC SW30-2540 data sheet',
    slug: 'dow-filmtec-sw30',
    bucket: 'sources',
    status: 'stable',
    confidence: 'high',
    tags: ['source:manufacturer', 'component'],
    mission_relevance: 0.85,
    body:
`# DOW FILMTEC SW30-2540

Public manufacturer data, paraphrased.

- Element: 2.5" × 40" spiral-wound TFC polyamide.
- Rated flow: 700 GPD (≈ 2.65 m³/day) at standard test conditions.
- Salt rejection (stabilised): 99.4 %.
- Test conditions: 32 000 ppm NaCl + 5 ppm B feed, 800 psi (55 bar), 25 °C,
  pH 8, 8 % recovery.
- Boron rejection: ~88 % under the same test conditions.
- Max operating pressure: 1 000 psi (69 bar).
- Max feed temperature: 45 °C.
- Free-chlorine tolerance: < 0.1 ppm (oxidative damage; the reason we dose
  bisulfite when any chlorine residual is present in feed).
- Recommended SDI feed: < 5; preferably < 3.

Drawn from [reverse-osmosis](../topics/reverse-osmosis.md) and
[ro-membrane-spiral-wound](../topics/ro-membrane-spiral-wound.md).
`,
  },
  {
    title: 'Source: Spectra Cape Horn watermaker (Extreme series)',
    slug: 'spectra-cape-horn',
    bucket: 'sources',
    status: 'stable',
    confidence: 'high',
    tags: ['source:manufacturer', 'product'],
    mission_relevance: 0.8,
    body:
`# Spectra Cape Horn Extreme

Marine/expedition-grade RO unit family. Public spec snapshot.

- Output: 280-680 L/h depending on variant (Cape Horn 1800-Extreme: 280 L/h
  ≈ 6.7 m³/day continuous).
- Energy: ~3.0 kWh/m³ thanks to integrated Clark pump
  ([energy-recovery-device](../topics/energy-recovery-device.md)).
- 12 V or 24 V DC input — natural fit for our PV+battery scenario.
- Built-in fresh-water flush after every stop.

Useful for the 4-person village scenario in the [Pacific island pilots](../topics/pacific-island-pilots.md);
oversized for a small resort. Pairs with [pre-treatment](../topics/pre-treatment.md)
stack as-is.
`,
  },
  {
    title: 'Source: Grundfos SQFlex solar-direct pump',
    slug: 'grundfos-sqflex',
    bucket: 'sources',
    status: 'stable',
    confidence: 'medium',
    tags: ['source:manufacturer', 'component'],
    mission_relevance: 0.75,
    body:
`# Grundfos SQFlex 5A-7

Public manufacturer data, paraphrased.

- Helical-rotor pump tuned for PV-direct (no inverter needed).
- Flow @ 8 m head: ~5 m³/h.
- Power: 30-1400 W (depends on solar irradiance).
- Built-in MPP tracker; runs off bare PV between 30-300 V DC.
- IP68 submersible; tropical-salt-air tolerant in surface-pump config.

In the [pilot](../topics/pacific-island-pilots.md) we'd use this NOT as the
high-pressure RO pump, but as the **feed booster** between the intake and
pre-treatment, leaving the [high-pressure-pump](../topics/high-pressure-pump.md)
for downstream.
`,
  },
  {
    title: 'Source: WHO GDWQ §6 (Drinking-water quality in specific circumstances)',
    slug: 'who-gdwq-section-6',
    bucket: 'sources',
    status: 'stable',
    confidence: 'high',
    tags: ['source:standard', 'regulation'],
    mission_relevance: 0.95,
    body:
`# WHO GDWQ §6 — overview

§6 of the WHO GDWQ covers specific circumstances including small supplies,
emergencies, and **desalination**.

Headline messages we use:

1. The general GDWQ values apply — desalinated water is not exempt.
2. Where membranes are involved (RO, [electrodialysis](../topics/electrodialysis.md)),
   boron and small neutral organics are the parameters at greatest risk of
   under-removal; explicit membrane-capability testing is recommended.
3. Desalinated water that has been remineralised should target the
   "good" TDS tier (300-600 mg/L) for taste and corrosion stability.
4. Small-scale desalination on ships, oilrigs, and remote settlements is
   acknowledged as an important application; the same parameter values apply.

Cross-references: [who-gdwq-overview](../topics/who-gdwq-overview.md),
[parameter-boron](../topics/parameter-boron.md).
`,
  },
  {
    title: 'Source: EU DWD 2020/2184 Annex I (parametric values)',
    slug: 'eu-dwd-annex-i',
    bucket: 'sources',
    status: 'stable',
    confidence: 'high',
    tags: ['source:standard', 'regulation', 'eu'],
    mission_relevance: 0.9,
    body:
`# EU DWD 2020/2184 — Annex I summary

Annex I lists parametric values in four parts. Our compliance check covers
Parts A and B.

**Part A — microbiological (selected)**
- *E. coli*: 0 /100 mL.
- Enterococci: 0 /100 mL.

**Part B — chemical (selected)**
- Arsenic: 10 µg/L.
- Boron: **1.5 mg/L** (stricter than WHO's 2.4).
- Cadmium: 5 µg/L.
- Chromium: 25 µg/L (stricter than WHO's 50, phasing in 2036).
- Cyanide: 50 µg/L.
- Fluoride: 1.5 mg/L.
- Lead: 5 µg/L from 2036, 10 until then.
- Nitrate: 50 mg/L.
- PFAS-sum-of-20: 0.1 µg/L (new in the recast).

**Part C — indicator (selected)**
- Coliforms: 0 /100 mL.
- Turbidity: 1 NTU at treatment-works output.

Cross-references: [eu-2020-2184](../topics/eu-2020-2184.md),
[parameter-boron](../topics/parameter-boron.md).
`,
  },
];
