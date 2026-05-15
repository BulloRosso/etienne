/**
 * 40 short markdown documents for the RAG index.
 *
 * Categories (10 each):
 *   - fact: component / process fact sheets
 *   - reg:  regulation excerpts (WHO, EU, national)
 *   - mfr:  manufacturer briefs
 *   - pilot: lessons from real island deployments
 *
 * Each is written to workspace/desalination-devices/documents/<filename>
 * and then indexed via POST /api/workspace/desalination-devices/rag/index-document.
 *
 * Length kept at 600-1500 chars so the chunker produces 1-2 chunks per doc
 * and the index stays compact.
 */

export interface RagDoc {
  filename: string;
  body: string;
}

const FACT: RagDoc[] = [
  {
    filename: 'fact-ro-overview.md',
    body: `# Reverse osmosis — one-page overview

Reverse osmosis (RO) pushes seawater across a thin-film composite polyamide membrane at 55-70 bar. Salt and contaminants stay on the reject ("brine") side; permeate passes through.

Typical figures for a 5 m³/day pilot:
- Specific energy: 3.0-5.0 kWh/m³ with an energy-recovery device.
- Salt rejection (single pass): 99.0-99.7 % for seawater membranes.
- Recovery: 8-15 % per stage at the SW30 reference; 30-40 % overall in production.

RO is by far the dominant technology for small-scale potable desalination today. Its main weak point is boron — see the dedicated boron fact sheet.`,
  },
  {
    filename: 'fact-pretreatment.md',
    body: `# Pre-treatment fact sheet

Pre-treatment determines how long the RO membrane lives. The standard stack for our pilot, in order of flow:

1. Strainer at the intake (200 µm) — pebbles, fish.
2. Multimedia filter (anthracite/sand/garnet) — turbidity.
3. Cartridge filter (5 µm absolute) — final polish.
4. Antiscalant dosing (citric or phosphonate, 2-4 ppm).
5. Bisulfite dosing if any chlorine residual is present in the feed.

Target Silt Density Index (SDI): below 3 reaching the membrane. Above 5 the membrane fouls in months. Run SDI monthly with a standard 0.45 µm filter pad and the 15-minute calculation; cheap and high-leverage.`,
  },
  {
    filename: 'fact-posttreatment.md',
    body: `# Post-treatment fact sheet

RO permeate is essentially distilled. Three things must happen before it leaves the unit:

1. Remineralisation — pass through a calcite contactor to add 40-60 mg/L Ca²⁺ and ~80 mg/L HCO₃⁻. This stabilises pH near 8.0 and brings TDS into the WHO "good" range (300-600 mg/L).
2. Disinfection — free chlorine 0.2-0.5 mg/L at the network entry, or UV at the unit boundary if the loop is short.
3. Boron polishing only if the first-pass permeate boron is above 1.5 mg/L (EU) or 2.4 mg/L (WHO).

Skipping post-treatment fails WHO on corrosion/taste and EU on chlorine residual.`,
  },
  {
    filename: 'fact-erd.md',
    body: `# Energy recovery device — fact sheet

An ERD transfers pressure from the brine reject stream back into the feed, cutting pump energy roughly in half.

Two flavours for our scale:
- Rotary pressure exchanger (e.g. ERI PX): 96 % efficient, expensive below 5 m³/h.
- Hydraulic intensifier ("Clark pump"): integrated into many small marine watermakers including the Spectra Cape Horn.

Without an ERD, a 5 m³/day pilot needs ~6 kWh/m³ at the high-pressure pump. With one, 3.0-3.5 kWh/m³. PV array shrinks by roughly half.`,
  },
  {
    filename: 'fact-pv-sizing.md',
    body: `# PV sizing fact sheet

Tropical Pacific / Caribbean assumptions: 4.5 peak sun-hours/day, 80 % round-trip system efficiency (inverter + battery).

Formula: PV kWp = daily kWh / (4.5 × 0.8).

For our 5 m³/day pilot:
- Membrane stack including ERD: ~17.5 kWh/day.
- Auxiliaries (pre-treatment pump, UV, calcite pump, dosing, chlorinator): ~4.5 kWh/day.
- Total: 22 kWh/day → 6.1 kWp. Size to 7 kWp for headroom and cleaning cycles.

Hurricane-prone sites add cyclone-rated mounting (~30 % capex increase on the array).`,
  },
  {
    filename: 'fact-battery.md',
    body: `# Battery sizing fact sheet

We size battery autonomy for finishing a backwash cycle after sunset and riding out a single cloudy day.

LFP (LiFePO₄) is the default for tropical operation: 6 000-cycle life at 80 % DoD, 45 °C tolerance, ~€450/kWh installed in 2026, 10-year warranty common.

For the 5 m³/day pilot:
- Daily demand: 22 kWh.
- 6-hour evening autonomy at half-rate: 6.6 kWh.
- 24-hour single-cloud day at one-third rate: 7.3 kWh.
- Pick 10 kWh usable (≈12 kWh nameplate at 80 % DoD).

Lead-acid AGM is half the price but 3 000 cycles — sensible only if Li-ion service is unavailable on-island.`,
  },
  {
    filename: 'fact-membrane-life.md',
    body: `# Membrane life fact sheet

Field life of a seawater RO element under our conditions:

- SDI<3, antiscaled feed, 6-monthly CIP: 5 years (manufacturer rated).
- SDI 3-5, no antiscalant: 18-24 months.
- SDI>5 or chlorine breakthrough: 3-9 months (membrane oxidised).

The 6-monthly clean-in-place (CIP) is the highest-leverage maintenance step. Alkaline (pH 11-12) then acid (pH 2-3) cycles, 1-2 hours each at 30-35 °C, restore flux without replacement. Skipping it is the most common reason small RO units fail at year 2-3 in tropical service.`,
  },
  {
    filename: 'fact-brine-discharge.md',
    body: `# Brine discharge fact sheet

For a 5 m³/day permeate target at 30 % recovery, brine output is ~12 m³/day at roughly twice ambient salinity (≈70 g/L vs 35 g/L seawater).

For an island pilot the discharge constraint is:
- Distance from shore: discharge through a diffuser 50 m offshore in 5+ m depth to avoid hypersaline plumes on coral reefs.
- Co-mingling with cooling water if any: dilutes the brine 5-10x.
- Avoid seagrass beds and nesting beaches.

This is not a parameter-list item but every regulator and pilot operator will ask the brine question. Documenting the discharge path is part of the permit submission.`,
  },
  {
    filename: 'fact-tco-snapshot.md',
    body: `# TCO snapshot

Five-m³/day pilot, 10-year horizon, 2026 EUR prices, Pacific atoll scenario:

- Capex total: ~50 000 EUR (RO skid + ERD: 18k, pre/post: 6k, PV 7 kWp: 7.5k, battery 10 kWh: 4.5k, backup genset: 2.5k, enclosure: 3.5k, install/logistics: 8k).
- Annual opex: ~2 850 EUR (membranes 250, consumables 800, fuel 300, labour 1 500).
- Major mid-life: 1 200 EUR membrane set at year 5, 4 500 EUR battery at year 8.
- 10-year TCO: ~84 000 EUR.
- Per m³ produced (85 % availability): ~5.4 EUR/m³.

Baseline alternative (trucked bottled water on remote islands): 10-20 EUR/m³ retail. Payback typically inside 5 years.`,
  },
  {
    filename: 'fact-maintenance.md',
    body: `# Maintenance cadence fact sheet

| Cadence | Task |
|---|---|
| Daily | Read inlet pressure, permeate conductivity, recovery |
| Weekly | Cartridge filter inspection, antiscalant top-up |
| Monthly | SDI test on raw feed, chlorine dose verification |
| 6-monthly | CIP of RO membrane (alkaline then acid) |
| Annually | Replace cartridge filters, recalibrate sensors, refill calcite |
| 5-yearly | Replace RO membrane elements |
| 8-10 yearly | Replace battery bank, rebuild HP pump |

The 6-monthly CIP and the monthly chlorine-dose check are the two compliance-critical items.`,
  },
];

const REG: RagDoc[] = [
  {
    filename: 'reg-who-tds.md',
    body: `# WHO GDWQ — TDS

The WHO Guidelines for Drinking-water Quality do not set a health-based limit for TDS but publish taste tiers panellists found acceptable:
- Excellent: < 300 mg/L
- Good: 300-600 mg/L
- Fair: 600-900 mg/L
- Poor: 900-1200 mg/L
- Unacceptable: > 1200 mg/L

For desalinated water specifically (§6 of the guidelines), WHO recommends remineralisation so that the delivered TDS falls in the "good" range, both for taste and for distribution-network corrosion stability.`,
  },
  {
    filename: 'reg-who-coliform.md',
    body: `# WHO GDWQ — coliforms / E. coli

WHO requires zero E. coli per 100 mL and zero thermotolerant (faecal) coliforms per 100 mL in treated water leaving the works and at the point of consumption.

Test methods: EN ISO 9308-1 (membrane filtration) and 9308-2 (most-probable-number). Field-portable kits are acceptable for routine monitoring; accredited-lab confirmation is recommended at least monthly for community supplies.

WHO also requires a residual disinfectant (typically free chlorine 0.2-0.5 mg/L) at the network entry where chlorination is used.`,
  },
  {
    filename: 'reg-who-boron.md',
    body: `# WHO GDWQ — boron

WHO sets a provisional guideline of 2.4 mg/L for boron. The "provisional" tag reflects difficulty achieving the value in some treatment trains; it is health-based and applies to all drinking water.

For desalinated water specifically, WHO notes that boron is the parameter most often under-removed by RO single-pass systems. Membrane capability testing is recommended before deployment. A second pass with elevated pH (~10) ionises boric acid and lifts overall rejection from 85-92 % to 98+ %.`,
  },
  {
    filename: 'reg-who-turbidity.md',
    body: `# WHO GDWQ — turbidity

WHO recommends < 1 NTU in treated water leaving the works, with < 0.3 NTU optimal for effective downstream disinfection. Higher turbidity shelters microorganisms from chlorination and biases UV transmissivity.

For an RO unit the post-membrane permeate is essentially zero NTU. The control point for turbidity in our train is the pre-treatment cartridge filter (5 µm absolute), upstream of the membrane.`,
  },
  {
    filename: 'reg-eu-overview.md',
    body: `# EU Drinking Water Directive 2020/2184

The recast directive entered into force 12 January 2021; member states had to transpose it by 12 January 2023, with full operational compliance phasing through 2026.

Structure: Annex I in four parts.
- Part A: microbiological parameters (E. coli, enterococci).
- Part B: chemical parameters (arsenic, boron, lead, ...).
- Part C: indicator parameters (coliforms, turbidity, ...).
- Part D: distribution-system risk parameters (Legionella, lead in domestic plumbing).

The directive also makes Water Safety Plans mandatory and introduces a new PFAS-sum-of-20 parameter at 0.1 µg/L.`,
  },
  {
    filename: 'reg-eu-boron.md',
    body: `# EU DWD — boron limit

Annex I Part B sets boron at 1.5 mg/L — stricter than WHO's 2.4 mg/L provisional value.

For a seawater RO pilot this is often the binding constraint. A single FILMTEC SW30-2540 with 5 ppm B feed and 8 % recovery clears 88 % of boron, producing 0.4-0.6 mg/L permeate — comfortably under both limits. At higher recoveries (30-40 %, needed for energy economy), boron permeate climbs to 0.8-1.2 mg/L: still WHO-compliant, marginal under EU.

A partial second-pass at pH 10 brings boron under 0.5 mg/L reliably.`,
  },
  {
    filename: 'reg-eu-arsenic.md',
    body: `# EU DWD — arsenic limit

Annex I Part B sets arsenic at 10 µg/L (same as WHO GDWQ). For seawater RO this is rarely a binding parameter — arsenic in seawater is typically 1-2 µg/L and >99 % rejected by the membrane.

Brackish groundwater sources in some Pacific atolls do contain elevated arsenic from volcanic geology; in that scenario arsenic moves from "not a worry" to "test every batch". An iron-coagulation pre-treatment or a dedicated arsenic-removal media bed may be needed before RO.`,
  },
  {
    filename: 'reg-eu-coliform.md',
    body: `# EU DWD — coliforms / E. coli

Part A: E. coli 0 /100 mL, enterococci 0 /100 mL.
Part C (indicator): coliforms 0 /100 mL.

Sample frequency depends on water-supply volume. For a 5 m³/day pilot (~1 800 m³/yr) the EU minimum is roughly monthly for indicator + 4× per year for the full chemical battery. Local regulators may require more.`,
  },
  {
    filename: 'reg-fiji-summary.md',
    body: `# Fiji Drinking Water Quality Standards 2014

Fiji's national drinking-water standards adopt WHO GDWQ by reference, with a handful of national-specific operational requirements:
- Monthly bacteriological monitoring for community supplies > 50 connections.
- Quarterly chemical battery for all treatment works.
- Daily operator log of disinfectant residual.

A pilot deploying in Fiji therefore tests against WHO GDWQ for parameter values and against the Fiji rule for monitoring cadence.`,
  },
  {
    filename: 'reg-permitting-pacific.md',
    body: `# Permitting checklist — Pacific small RO pilot

Documents typically required by Pacific island regulators (varies by country):
- Source-water sampling for at least 3 parameters: TDS, coliform, turbidity.
- Treatment-train flow diagram with parameter control points labelled.
- Maintenance plan including 6-monthly CIP and monthly chlorine verification.
- Brine discharge plan (location, depth, diffuser if any).
- Operator competency evidence (basic water-treatment certificate or equivalent).
- Water Safety Plan in WHO format.

Lead time from permit application to operation: 4-12 weeks for a community pilot.`,
  },
];

const MFR: RagDoc[] = [
  {
    filename: 'mfr-filmtec-sw30-2540.md',
    body: `# DOW FILMTEC SW30-2540 — manufacturer brief

Element type: 2.5" × 40" spiral-wound TFC polyamide.
- Rated flow: 700 GPD (≈ 2.65 m³/day) at standard test conditions.
- Stabilised salt rejection: 99.4 %.
- Test conditions: 32 000 ppm NaCl + 5 ppm B feed, 800 psi (55 bar), 25 °C, pH 8, 8 % recovery.
- Boron rejection: ~88 %.
- Max operating pressure: 1 000 psi (69 bar).
- Max feed temperature: 45 °C.
- Free-chlorine tolerance: < 0.1 ppm.
- Recommended SDI feed: < 5, preferably < 3.
- Element price (2026 list): ~€450 per element.

Two elements in series typically deliver 5-6 m³/day at 30 % recovery, which is the sweet spot for our pilot.`,
  },
  {
    filename: 'mfr-filmtec-sw30hr.md',
    body: `# DOW FILMTEC SW30HR — manufacturer brief (high-rejection variant)

The HR (high rejection) variant trades a few percent of flow for tighter salt and boron rejection. Useful for the EU-regulated boron constraint.

- Salt rejection: 99.7 %.
- Boron rejection: 91-93 % at standard conditions.
- Output: 90 % of the standard SW30 at the same operating pressure.

Cost premium: ~15 % over the standard SW30. Worth it when a second-pass system would otherwise be needed for boron alone.`,
  },
  {
    filename: 'mfr-grundfos-sqflex.md',
    body: `# Grundfos SQFlex 5A-7 — manufacturer brief

Helical-rotor pump tuned for direct-PV operation. No inverter needed; built-in MPP tracker accepts 30-300 V DC.

- Flow @ 8 m total dynamic head: ~5 m³/h.
- Power: 30 to 1 400 W tracking irradiance.
- IP68 submersible. Tropical-salt-air tolerant in surface-pump configuration with a stainless cabinet.

In our pilot the SQFlex is the *feed booster* (intake → pre-treatment), not the high-pressure RO pump. Pairing reduces battery draw during daytime feed-flow operations.`,
  },
  {
    filename: 'mfr-spectra-cape-horn.md',
    body: `# Spectra Cape Horn Extreme — manufacturer brief

Marine/expedition watermaker family with an integrated Clark pump (energy recovery built into the cylinder).

- Output: 280-680 L/h depending on variant.
- Specific energy: ~3.0 kWh/m³ — among the best at small scale.
- 12 V or 24 V DC input. Natural fit for PV+battery installations.
- Built-in fresh-water flush after each stop reduces fouling between runs.

Recommended for the 4-person village scenario in the Pacific atoll deployment. Oversized for a single-resort use.`,
  },
  {
    filename: 'mfr-danfoss-app.md',
    body: `# Danfoss APP axial-piston pump — manufacturer brief

High-efficiency axial-piston pump, dry-running tolerant, designed for variable-flow operation. Pairs well with a rotary pressure exchanger to give the lowest specific energy at our scale.

- Flow range: 1-5 m³/h.
- Pressure: up to 80 bar.
- Efficiency: 92 % at design point.

Capex premium over a plunger pump is ~30 %, recovered in energy over 3-4 years for daytime-heavy duty cycles. A reasonable choice for the Caribbean scenario where year-round demand justifies the higher capex.`,
  },
  {
    filename: 'mfr-eri-px-pressure-exchanger.md',
    body: `# Energy Recovery Inc. PX — manufacturer brief

Rotary pressure exchanger; the gold standard for ERD on seawater RO.

- Recovery efficiency: ~96 %.
- Flow ranges: from 1 m³/h (PX-Q model family) upward.
- No moving electrical parts; ceramic rotor in a ceramic sleeve.

Below 1 m³/h the cost-per-unit drops out of proportion compared to a Clark pump. At our 5 m³/day pilot the integrated Clark pump in a Spectra-style unit is the better economic fit.`,
  },
  {
    filename: 'mfr-aquatec-cdp.md',
    body: `# Aquatec CDP booster pump — manufacturer brief

Diaphragm booster used widely in light-commercial RO systems.

- 12-24 V DC; 70 psi max.
- Flow: 1-2 L/min depending on back-pressure.
- Self-priming, dry-run tolerant.

Use case in our pilot: post-membrane delivery pump pushing permeate through the calcite contactor and into the storage tank. Cheap, replaceable on-island.`,
  },
  {
    filename: 'mfr-sun-mar-uv.md',
    body: `# Sun-Mar UV-256 sterilizer — manufacturer brief

12 V DC UV sterilizer rated 4 L/min, 256 nm dose ≥40 mJ/cm² at design flow — exceeds WHO and EU 4-log Cryptosporidium target.

- Lamp life: 9 000 hours.
- Replacement: lamp + quartz sleeve, on-island serviceable.
- Power: 22 W.

Sits at the unit boundary as the final microbiological control, redundant with the free-chlorine residual. Belt-and-braces, low-cost.`,
  },
  {
    filename: 'mfr-prominent-dosing.md',
    body: `# ProMinent Sigma dosing pump — manufacturer brief

Solenoid metering pump for antiscalant and chlorine dosing.

- Flow: 0.6 L/h at 10 bar.
- Stroke-rate adjustable; readable display.
- Built-in air-bleed valve eliminates the most common dosing failure mode (air-locked diaphragm).

Used twice in our train: once for antiscalant ahead of the membrane, once for free-chlorine after the calcite contactor.`,
  },
  {
    filename: 'mfr-dosatron.md',
    body: `# Dosatron D25 water-powered doser — manufacturer brief

Non-electric proportional doser for the chlorination step at remote sites without reliable power.

- Dose ratio: 0.2 to 2 % adjustable.
- Flow: 10-2 500 L/h.
- No moving electrical parts; runs on the water-pressure energy itself.

Backup-mode dosing if electrical dosing fails. Mandatory in our Pacific scenario where night-time auxiliary power is rationed.`,
  },
];

const PILOT: RagDoc[] = [
  {
    filename: 'pilot-tuvalu-funafuti.md',
    body: `# Pilot lesson — Tuvalu Funafuti

A Japanese-government-funded RO plant on Funafuti runs successfully but only after a hardened cyclone-resistant enclosure was retrofitted. The first deployment lost ~20 days of operation per year to storm damage and salt-spray ingress; with the upgrade, ~99 % availability.

Key takeaway: on Pacific atolls the unit must be built into a sealed, hurricane-resistant box, not merely under a roof. Add this to the capex line item.`,
  },
  {
    filename: 'pilot-bequia.md',
    body: `# Pilot lesson — Bequia

A small commercial RO unit on Bequia (Saint Vincent & the Grenadines) demonstrated that the avoided cost of imported bottled water (10-20 EUR/m³ retail) makes a community-scale RO pay back inside 5 years even at modest utilisation.

Operator-level lesson: train two locals from day one. The original Bequia unit went offline for 6 weeks in year 3 waiting for a flown-in technician to replace a feed solenoid — a part the local operator could have swapped in 30 minutes with the right spare on shelf.`,
  },
  {
    filename: 'pilot-tokelau.md',
    body: `# Pilot lesson — Tokelau

Tokelau's solar + RO units ran for 18 months before a membrane failure traced to antiscalant tank running dry. The local operator had not been alerted (no low-level switch) and continued running with raw seawater scale deposition.

Takeaway: every consumable tank must have a low-level switch wired to a "stop on empty" relay. Cheap, prevents the most common premature-failure mode.`,
  },
  {
    filename: 'pilot-kiribati-split-load.md',
    body: `# Pilot lesson — Kiribati outer islands

Some Kiribati communities split the load: rainwater for general use, solar still as fail-safe for cooking, small RO for drinking only. This dropped RO demand by 70 %, extending membrane life to the manufacturer-rated 5 years.

Takeaway: don't try to run everything through RO. A layered strategy with rainwater + RO + still is cheaper and more resilient than a single-source RO design.`,
  },
  {
    filename: 'pilot-antigua-biofouling.md',
    body: `# Pilot lesson — Antigua biofouling

Larger Antiguan municipal plants on open-Atlantic intakes report membrane life of 3-4 years vs 5 on more sheltered lagoon intakes — driven by biofouling load.

Takeaway for small pilots: prefer a lagoon or back-reef intake over open-ocean. The extra pipe run pays for itself in membrane savings, even before you count the calmer pump duty.`,
  },
  {
    filename: 'pilot-grenada-hurricane.md',
    body: `# Pilot lesson — Grenada / Carriacou hurricane prep

A UNICEF pilot on Carriacou demonstrated that hurricane shutters and a quick-disconnect rainwater inlet make the difference between a 2-week and a 2-month outage after a major storm.

Takeaway: design the rainwater bypass as a permanent feature, not an emergency mod. After a storm the rainwater system supplies post-treatment + storage while the RO membrane is being inspected and recommissioned.`,
  },
  {
    filename: 'pilot-cape-verde-cip.md',
    body: `# Pilot lesson — Cape Verde CIP cadence

A small community RO unit on Boavista (Cape Verde) failed at year 2 due to biofouling — root-caused to the operator skipping the 6-monthly clean-in-place (CIP) for three consecutive cycles.

Takeaway: the 6-monthly CIP is non-optional. Build it into the operator's calendar with a hard reminder and a written sign-off; budget 1 day of downtime per cycle.`,
  },
  {
    filename: 'pilot-saint-helena-spares.md',
    body: `# Pilot lesson — Saint Helena spares strategy

Saint Helena's remote RO unit kept a full set of consumables (cartridges, antiscalant, bisulfite) PLUS a single backup membrane element on island. The £450 in tied-up inventory saved several weeks of downtime in two separate failure modes over an 8-year lifespan.

Takeaway: hold one spare membrane element plus a full year of consumables on-island at all times. The cost of the spare is dwarfed by the cost of a flown-in technician.`,
  },
  {
    filename: 'pilot-faroe-cold.md',
    body: `# Pilot lesson — Faroe cold-water exception

A Faroe Islands RO pilot demonstrated the inverse problem to tropical ones: low feed temperature (4-8 °C) reduces flux 30-40 % vs the 25 °C reference.

Not directly relevant to our tropical scenarios but documented because a tropical-trained operator deploying to a cold-water posting needs to know to oversize the membrane stack.`,
  },
  {
    filename: 'pilot-maldives-genset-hybrid.md',
    body: `# Pilot lesson — Maldives PV+genset hybrid

A resort pilot in the Maldives demonstrated that a 70/30 PV+genset hybrid achieved 95 % renewable share AND 99.5 % availability — strictly better than a 100 % PV+battery design at the same capex.

Takeaway: the last 10 % of renewable share costs more in battery than the equivalent genset fuel over a 10-year horizon. Plan a hybrid with a small genset (~20 % of peak load) for cloudy spells, not pure-PV.`,
  },
];

export const RAG_DOCS: RagDoc[] = [...FACT, ...REG, ...MFR, ...PILOT];
