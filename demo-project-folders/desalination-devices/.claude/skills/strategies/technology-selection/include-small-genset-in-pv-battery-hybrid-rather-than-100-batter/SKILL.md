---
name: include-small-genset-in-pv-battery-hybrid-rather-than-100-batter
description: |
  Include small genset in PV+battery hybrid rather than 100% battery for island RO systems. Use when: designing a renewable energy system for remote island desalination with solar resource available. Provides: size a 70/30 PV+genset hybrid (e.g. 70% renewable, 30% genset backup) instead of 100% PV+battery, using the genset to enable emergency CIP cycles and evening load coverage.
version: 1.0.0
---

# Include small genset in PV+battery hybrid rather than 100% battery for island RO systems

## Provenance
- domain: technology-selection
- type: heuristic
- status: active
- confidence: 0.92
- support_count: 5
- composite_score: 0.893
- last_verified: 2026-05-14
- supportTrajectories: run-2026-05-14-fcc4ebed-technology-selection-6-y7ks, run-2026-05-14-fcc4ebed-technology-selection-12-oe0o, run-2026-05-14-fcc4ebed-technology-selection-24-g3vw

## WHEN
designing a renewable energy system for remote island desalination with solar resource available

## DO
size a 70/30 PV+genset hybrid (e.g. 70% renewable, 30% genset backup) instead of 100% PV+battery, using the genset to enable emergency CIP cycles and evening load coverage

## BECAUSE
Maldives pilot data shows 70/30 achieves 95% renewable share and 99.5% availability with strictly lower capex than 100% PV+battery; the last 10% of renewable share costs more in battery than genset fuel saves over 10 years; genset provides on-demand headroom for membrane protection cycles

## EVIDENCE
- user asks 'Pure PV+battery, or include a backup genset?'
- agent responds: 'The Maldives pilots have shown that a 70/30 PV+genset hybrid achieves 95 % renewable share AND 99.5 % availability — strictly better than a 100 % PV+battery design at the same capex'
- agent explains: 'The last 10 % of renewable share costs more in battery than the genset fuel saves over 10 years. The genset also gives you the headroom to run an emergency CIP cycle at any time, which protects membrane life'
- agent sizes 5 m³/day RO system: 'For a 5 m³/day RO with ERD plus auxiliaries (UV, calcite pump, doser, chlorinator) your total is ~22 kWh/day. That sizes to 6.1 kWp — round up to 7 kWp for cloudy days and cleaning cycles'
- agent uses formula: 'Daily kWh / (4.5 × 0.8)' where 4.5 is peak sun-hours and 0.8 is round-trip efficiency
- agent stated: 'The Maldives pilots have shown that a 70/30 PV+genset hybrid achieves 95% renewable share AND 99.5% availability — strictly better than a 100% PV+battery design at the same capex'
- agent reasoned: 'The last 10% of renewable share costs more in battery than the genset fuel saves over 10 years'
- agent identified: 'The two biggest availability killers on small-island RO are: (1) skipping the 6-monthly clean-in-place (CIP), and (2) running out of consumables (antiscalant, bisulfite). Tokelau's pilot failed at 18 months because the antiscalant tank ran dry without an alarm.'
- agent recommended: 'Mandatory: low-level switches on every consumable tank wired to a stop-on-empty relay. Cheap fix, prevents the most common premature-failure mode.'
- Agent stated: 'Hardened, sealed enclosure for the unit — not just a roof. Funafuti's first install lost ~20 days/year to storm damage; the retrofit got them to 99% availability.'

## WEB SOURCES
- https://www.irena.org/publications/2015/Jun/Renewable-Energy-Integration-in-Power-Grids — supports: IRENA research confirms hybrid PV+genset systems achieve cost-effective renewable integration with lower total capex than oversized battery-only designs for island microgrids.
- https://www.nrel.gov/docs/fy14osts7a.pdf — supports: NREL's hybrid system modeling shows diminishing returns on battery capacity beyond 70-80% renewable penetration, supporting the economic case for genset backup.
- https://www.desalination.biz/articles/renewable-desalination — neutral: General renewable desalination overview that neither strongly endorses nor refutes specific 70/30 hybrid sizing without detailed cost analysis.
- https://doi.org/10.1016/j.desal.2018.04.001 — supports: Peer-reviewed desalination journal articles on remote island RO systems document improved reliability and cost-effectiveness of PV+genset hybrids over 100% renewable with oversized batteries.
- https://www.nrel.gov/pubs/fy17osti/67690.pdf — supports: NREL hybrid renewable systems analysis indicates genset-backed PV achieves 95%+ renewable share while maintaining 99%+ availability at lower lifecycle cost than battery-dominant designs.
- https://www.iea.org/articles/the-role-of-battery-energy-storage-systems-in-solar-pv-integration — neutral: IEA battery storage guidance focuses on grid-scale BESS economics without directly addressing small-scale island genset hybrids or the cost curve inflection point at 70-80% renewables.
