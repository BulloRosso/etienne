---
name: validate-parameters-against-both-who-and-eu-standards-even-when-
description: |
  Validate parameters against both WHO and EU standards even when targeting one jurisdiction. Use when: evaluating compliance for a water treatment design. Provides: check every critical parameter against both WHO and EU limits separately, even if deployment is outside the EU.
version: 1.0.0
---

# Validate parameters against both WHO and EU standards even when targeting one jurisdiction

## Provenance
- domain: compliance-check
- type: heuristic
- status: active
- confidence: 0.92
- support_count: 15
- composite_score: 0.893
- last_verified: 2026-05-14
- supportTrajectories: run-2026-05-14-fcc4ebed-compliance-check-0-8v6x, run-2026-05-14-fcc4ebed-compliance-check-6-3clp, run-2026-05-14-fcc4ebed-compliance-check-12-4jyc, run-2026-05-14-fcc4ebed-compliance-check-18-ilzv, run-2026-05-14-fcc4ebed-compliance-check-24-d4nm

## WHEN
evaluating compliance for a water treatment design

## DO
check every critical parameter against both WHO and EU limits separately, even if deployment is outside the EU

## BECAUSE
EU limits often presage future WHO revisions, and most accredited labs and CE-marked components are calibrated to EU values, reducing future rework

## EVIDENCE
- Agent rationale in [1]: 'most accredited labs and CE-marked components are calibrated to EU values, and EU values often presage the next WHO revision'
- Agent applies dual validation throughout: TDS [5], E. coli [7], boron [9], free chlorine [11]
- TDS [5]: agent shifts from 'value is compliant' to 'aggressive low-TDS water in pipework' as the actual failure mode and prescribes calcite contacting
- E. coli [7]: agent identifies recontamination downstream (unsealed tanks, biofilm) as the binding constraint and prescribes monthly sampling at consumption point
- Free chlorine [11]: agent flags incompatibility with upstream RO membrane and prescribes bisulfite dosing in pre-treatment
- Boron [9]: at 30% recovery, standard membrane yields 0.8–1.2 mg/L (WHO OK, EU borderline). Agent prescribes either higher-rejection membrane variant (SW30HR) or pH-10 second-pass, noting 'for an EU-regulated deployment I'd default to option 2'
- Agent identified boron as binding constraint before other parameters were discussed
- Two mitigation paths presented (SW30HR vs second-pass pH 10) with explicit cost and performance figures
- Agent noted jurisdiction-dependent choice: 'For an EU-regulated deployment I'd default to option 2. Outside the EU, option 1 is usually enough.'
- E. coli/coliforms: agent noted 'Your train satisfies this with significant margin' but then immediately identified 'The failure mode that matters is recontamination downstream' and recommended 'monthly bacteriological sampling at the consumption point, not just at the works output'
- Multiple barriers noted (RO, UV, chlorine residual) but mitigation focused on downstream risk
- Arsenic: agent noted seawater is 1–2 µg/L so permeate is 0.01 µg/L, but added 'The case where arsenic becomes interesting is brackish groundwater from volcanic geology' and recommended testing if 'you ever consider switching to a brackish well'
- PFAS: agent noted seawater levels are low but flagged 'brackish source near a former military or industrial site' and recommended documenting it in the Water Safety Plan
- [7] Agent identifies boron as 'marginal at 30% recovery' for EU despite passing WHO, then recommends specific membrane variant (SW30HR, 91-93% rejection) rather than accepting the marginal pass
- [7] Agent frames the decision as 'the only design change driven by compliance' after clearing all other parameters, showing that targeted upgrades are preferable to across-the-board changes
- [3] Agent distinguishes seawater arsenic (1–2 µg/L, easily cleared) from brackish groundwater risk ('some atolls'), signalling when the source assumption changes
- [5] Agent notes seawater PFAS is sub-ng/L comfortably below threshold, but flags industrial/military contamination as the 'interesting case'
- [1] Agent identifies the 5 µm cartridge filter as 'the control point in your train' rather than generic turbidity advice
- [9] Agent identifies the Water Safety Plan as 'the one most easily underestimated' and budgets two weeks, signalling that this is a frequent failure mode
- [9] Agent provides the full permitting bundle in order, anchoring each item to its regulatory purpose
- [11] Agent specifies 'monthly bacteriological' and 'daily chlorine residual by the operator' for a 5 m³/day system, and ends with 'Build the operator a one-page checklist; it's the difference between actual compliance and paper compliance'
- agent states in [7]: 'The dual-table format is important — it reinforces the discipline of validating against both regimes separately'
- agent emphasizes in [11]: 'The single load-bearing pattern across the whole exercise is the same as yesterday: validate every parameter against WHO AND EU separately, even outside the EU, and document the dual-table comparison so the operator and the auditor both see it'
- agent notes in [5]: 'Build the operator a one-page checklist; it's the difference between actual compliance and paper compliance'
- agent states in [9]: 'The 6-monthly CIP sign-off is the single most asked-for evidence in remote audits — Cape Verde's failure at year 2 was traced to three skipped CIPs and would have been caught by a routine audit'
- agent emphasizes in [11]: 'the 6-monthly CIP and the monthly chlorine verification are the two compliance-critical operational items'
- agent recommends in [1]: 'spec the SW30HR membrane variant (15 % cost premium, 91-93 % boron rejection) to give you EU-grade headroom for boron without a second-pass system. That's the only design change driven by compliance'
- agent response [1]: 'a parameter cheat-sheet showing WHO and EU values side by side for the parameters you're sampling, so the operator can flag an out-of-range number without having to look up which regime applies. The dual-table format is important — it reinforces the discipline of validating against both regimes separately'
- agent response [5]: 'the single load-bearing pattern across the whole exercise is the same as yesterday: validate every parameter against WHO AND EU separately, even outside the EU, and document the dual-table comparison so the operator and the auditor both see it'
- agent response [3]: 'The 6-monthly CIP sign-off is the single most asked-for evidence in remote audits — Cape Verde's failure at year 2 was traced to three skipped CIPs and would have been caught by a routine audit'
- agent response [5]: 'the 6-monthly CIP and the monthly chlorine verification are the two compliance-critical operational items'
- agent response [3]: 'Three folders. (1) Design folder: flow diagram, equipment data sheets, brine discharge plan, Water Safety Plan. (2) Operations folder: daily/weekly/monthly logs, maintenance records including the 6-monthly CIP sign-offs, dosing-tank fill records. (3) Compliance folder: monthly bacteriological reports, quarterly chemical reports, annual accredited-lab battery, calibration certificates'

## WEB SOURCES
- https://www.who.int/publications/i/item/9789241549950 — supports: WHO Guidelines for Drinking-water Quality explicitly state that national standards should be based on WHO guidance and may be more stringent, supporting the practice of checking against multiple reference standards.
- https://ec.europa.eu/health/ph_risk/documents/ev20030717_en.pdf — supports: EU Drinking Water Directive (98/83/EC) documents show EU limits were developed from WHO science with additional safety margins, making dual-checking a prudent validation approach.
- https://www.iso.org/standard/43387.html — neutral: ISO 10500 on natural mineral waters addresses standardization but does not directly endorse or refute the strategy of dual WHO/EU validation.
- https://www.epa.gov/ground-water-rule — neutral: EPA standards (US-focused) are independent of both WHO and EU frameworks, making it neither supporting nor contradicting evidence for WHO/EU dual validation.
- https://www.who.int/teams/environment-climate-change-and-health/water-sanitation-and-health/water-safety-and-quality — supports: WHO water safety guidance emphasizes that national authorities should establish standards informed by international benchmarks, supporting the dual-check methodology.
- https://eur-lex.europa.eu/eli/dir/2020/2184/oj — supports: The revised EU Drinking Water Directive (2020/2184) includes risk assessment and monitoring provisions that align with WHO frameworks, supporting the value of comparing both standards.
