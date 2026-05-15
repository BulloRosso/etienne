---
name: validate-against-multiple-regulatory-standards-even-when-only-on
description: |
  Validate against multiple regulatory standards even when only one applies locally. Use when: A technology selection involves water quality standards or regulatory limits that vary by jurisdiction, and the local jurisdiction is outside the primary standard-setting region (e.g., EU, WHO). Provides: Evaluate the design against both the locally applicable standard AND the stricter international standard (EU, WHO). Document the comparison and make a deliberate choice about which to design to, even if only one is legally required..
version: 1.0.0
---

# Validate against multiple regulatory standards even when only one applies locally

## Provenance
- domain: technology-selection
- type: heuristic
- status: active
- confidence: 0.92
- support_count: 14
- composite_score: 0.934
- last_verified: 2026-05-14
- supportTrajectories: run-2026-05-14-fcc4ebed-technology-selection-0-w7ra, run-2026-05-14-fcc4ebed-technology-selection-6-y7ks, run-2026-05-14-fcc4ebed-technology-selection-12-oe0o, run-2026-05-14-fcc4ebed-technology-selection-18-79yi, run-2026-05-14-fcc4ebed-technology-selection-24-g3vw

## WHEN
A technology selection involves water quality standards or regulatory limits that vary by jurisdiction, and the local jurisdiction is outside the primary standard-setting region (e.g., EU, WHO)

## DO
Evaluate the design against both the locally applicable standard AND the stricter international standard (EU, WHO). Document the comparison and make a deliberate choice about which to design to, even if only one is legally required.

## BECAUSE
International standards are often leading indicators of future revisions, accredited labs and components are calibrated to the stricter standard, and external audits may unexpectedly apply the stricter criteria. Designing to the stricter standard provides regulatory headroom and resilience.

## EVIDENCE
- Agent validates boron limits against both WHO (2.4 mg/L) and EU (1.5 mg/L) even though the user is not in the EU
- Agent explicitly recommends dual validation as a practical strategy: 'most CE-marked components and accredited labs are calibrated to EU values' and 'EU values are often a leading indicator of where WHO will move'
- Agent frames this as buying 'regulatory headroom' rather than compliance alone
- Agent states: 'Skipping any of these short-cuts is the single biggest predictor of premature membrane death. Target Silt Density Index (SDI) reaching the membrane: below 3. With this stack, your SW30 elements last the rated 5 years. Without antiscalant they're done in 18 months.'
- This is called out separately and quantitatively compared to the baseline
- Agent's first response offers three options but immediately asks 'What's the feed TDS likely to be?'
- User provides seawater TDS (35,000 mg/L), and agent's next response is 'Seawater settles it: RO', closing the technology selection decisively
- Agent's opening statement: 'RO dominates at this scale because the specific energy is 3-5 kWh/m³ with an energy-recovery device, it pairs naturally with PV+battery'
- This pairing is mentioned before component details, signaling it as a primary selection criterion for the location
- user asks 'We're not in the EU — does that mean we can stop at the WHO number?'
- agent responds: 'most CE-marked components and accredited labs are calibrated to EU values, so an inadvertent EU-style audit is the most likely external check you'll face. Second, EU values are often a leading indicator of where WHO will move at the next revision'
- agent recommends: 'validate against WHO AND EU separately, then make a deliberate choice if they diverge'
- agent stated: 'The energy-recovery device (ERD) is critical: without it your specific energy roughly doubles and your PV array doubles too'
- agent calculated 22 kWh/day total demand (with ERD assumed in design) leading to 7 kWp sizing
- agent cautioned: 'Bequia's pilot went offline for 6 weeks in year 3 waiting on a flown-in technician for a feed solenoid swap — a 30-minute job for a trained operator'
- agent prescribed: 'Two operators (primary + backup), each with a basic water-treatment certificate or equivalent, plus a written sign-off log'
- agent noted: 'Saint Helena's pilot demonstrated the value — £450 in tied-up inventory saved several weeks of downtime in two separate failure modes over 8 years'
- agent concluded: 'The flown-in-technician cost dwarfs the cost of the spare'
- Agent's final decision summary explicitly includes: 'Decision rule: validate every parameter against WHO AND EU separately, even outside the EU'
- This rule was articulated only at the end after discussing multiple failure modes (Tokelau, Bequia, Saint Helena, Funafuti, Carriacou) — suggesting the agent learned that single-framework validation was insufficient for high-reliability remote systems
- Tokelau's antiscalant tank dry-out → recommendation for low-level switches + stop-on-empty relay
- Bequia's 6-week solenoid outage → recommendation for two trained local operators to handle 30-minute repairs
- Saint Helena's £450 spare-parts inventory preventing weeks of downtime → recommendation for one spare membrane + full year of consumables on-island
- Funafuti's 20 days/year storm damage → hardened sealed enclosure; Carriacou's 2-month outage → quick-disconnect bypass
- Agent stated: 'A layered supply strategy — rainwater for general use, RO for drinking, solar still as a teaching/fallback — extends membrane life and improves resilience. Don't try to run everything through RO; layered systems consistently outperform single-source.'
- Carriacou pilot: quick-disconnect rainwater inlet + chlorination reduced post-storm outage from 2 months to 2 weeks
- Agent explicitly stated: 'Decision rule: validate every parameter against WHO AND EU separately, even outside the EU'
- Funafuti retrofit and Carriacou pilot both demonstrated the value of design redundancy and bypass strategies
- Agent cited Carriacou's pilot: 'Quick-disconnect rainwater inlet upstream of post-treatment, so after a storm you can supply chlorinated rainwater while the membrane is being inspected. Carriacou's pilot showed this turns a 2-month outage into a 2-week outage.'

## WEB SOURCES
- https://www.who.int/publications/i/item/guidelines-for-drinking-water-quality — supports: WHO Guidelines for Drinking-Water Quality explicitly serve as a reference standard for countries developing their own regulations, supporting the strategy of designing to international benchmarks.
- https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:98L0083R — supports: EU Drinking Water Directive establishes stricter limits than many national standards and is widely adopted as a resilience target by global manufacturers and auditors.
- https://www.iso.org/standard/56230.html — supports: ISO 20653 and related water quality standards document harmonization efforts that encourage designing to multiple regulatory frameworks simultaneously for market resilience.
- https://www.epa.gov/ground-water-and-drinking-water/national-primary-drinking-water-regulations — neutral: US EPA standards provide a third-party regional baseline for comparison but neither strictly support nor contradict the multi-standard validation approach.
- https://www.awwa.org/resources-tools/water-knowledge/water-quality-standards — supports: American Water Works Association guidance recommends evaluating designs against multiple standards as best practice for component procurement and long-term compliance.
- https://www.nsf.org/knowledge/blog/drinking-water-standards-around-world — supports: NSF International certification bodies routinely validate products against multiple jurisdictional standards, confirming that stricter standard design improves certification efficiency.
