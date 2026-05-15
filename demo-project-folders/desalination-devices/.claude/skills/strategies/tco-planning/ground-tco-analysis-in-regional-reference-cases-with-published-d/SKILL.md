---
name: ground-tco-analysis-in-regional-reference-cases-with-published-d
description: |
  Ground TCO analysis in regional reference cases with published data. Use when: analyzing water treatment costs for a new geographic scenario. Provides: immediately cite a nearby successful deployment (e.g., Bequia for Caribbean) with published capex, opex, and payback metrics; use it as an anchor to identify region-specific cost drivers.
version: 1.0.0
---

# Ground TCO analysis in regional reference cases with published data

## Provenance
- domain: tco-planning
- type: heuristic
- status: active
- confidence: 0.92
- support_count: 16
- composite_score: 0.934
- last_verified: 2026-05-14
- supportTrajectories: run-2026-05-14-fcc4ebed-tco-planning-0-ag3c, run-2026-05-14-fcc4ebed-tco-planning-6-n50i, run-2026-05-14-fcc4ebed-tco-planning-12-75zb, run-2026-05-14-fcc4ebed-tco-planning-18-f4bn

## WHEN
analyzing water treatment costs for a new geographic scenario

## DO
immediately cite a nearby successful deployment (e.g., Bequia for Caribbean) with published capex, opex, and payback metrics; use it as an anchor to identify region-specific cost drivers

## BECAUSE
reference cases provide concrete numbers and credibility, and they highlight which cost lines vary by geography (hurricane enclosure, biofouling, shipping, labor rates) rather than guessing

## EVIDENCE
- Agent opens with 'Bequia is a good reference. The published numbers there: 10-20 €/m³...' establishing baseline before new scenario
- Agent then isolates two geographic deltas for Caribbean: hurricane season enclosure spec and biofouling-driven membrane life (3-4 years vs 5 years)
- Agent states: 'The labour line is the one most often underestimated — pencil it in even if the work is in-kind contribution from a community member; you want the true cost visible.'
- Agent walks through capex line-by-line (RO skid, treatment, PV, battery, genset, enclosure, install)
- Then opex components (membranes amortized, consumables, fuel, labor)
- Then mid-life replacements with year and cost (Year 5 €1.2k membranes, Year 8 €4.5k battery)
- Final TCO roll-up: 51k + (10 × 2.85k) + 1.2k + 4.5k = ~85k, then normalized to €5.5/m³
- Agent says 'Capex for the Caribbean scenario looks similar to Pacific except enclosure (hurricane shutters add ~€1.5k) and install/logistics (slightly lower because Bequia has better shipping access)... Roughly: €51k total capex vs €50k Pacific. Within rounding.'
- Later: 'Against a 10-20 €/m³ baseline that's a payback under 5 years even at the low end.'
- Agent: 'The labour line is the one most often underestimated — pencil it in even if the work is in-kind contribution from a community member; you want the true cost visible.'
- User acceptance and follow-up suggests this framing was persuasive
- Agent: 'All three trace back to the same operational discipline: pre-treatment + 6-monthly CIP + low-level switches on every consumable tank. That cluster is the single biggest TCO determinant for small-island RO; skip it and your TCO doubles.'
- Three separate sensitivity drivers (membrane life, availability, battery life) were unified under one operational discipline narrative
- Agent: 'The 70/30 PV+genset hybrid is the strictly better economic AND environmental design at this scale. Different story above 50 m³/day where battery costs amortise differently.'
- Explicit analysis of PV-only: €7k capex addition vs €3k fuel savings = net loss of €4k over 10 years
- Agent: 'RO demand dropped 70% because cooking and washing came off rainwater and the still. That extends membrane life proportionally, drops genset fuel, and improves resilience after storms.'
- Kiribati case cited; capex add (€3-5k rainwater tank) is small relative to TCO reductions from lower RO throughput
- All three sensitivity drivers trace back to the same operational discipline: pre-treatment + 6-monthly CIP + low-level switches on every consumable tank. That cluster is the single biggest TCO determinant
- Skip it and your TCO doubles
- To hit 99% availability without a genset, battery has to grow from 10 kWh to ~25 kWh, adding ~€7k capex. Over 10 years you save the €300/year × 10 = €3k of fuel — net loss of €4k, and you've also doubled the embedded carbon.
- Different story above 50 m³/day where battery costs amortise differently
- Kiribati's experience with rainwater + RO + still: RO demand dropped 70% because cooking and washing came off rainwater and the still. That extends membrane life proportionally, drops genset fuel, and improves resilience after storms.
- Opex roughly halves because consumables track production and membrane life extends. 10-year TCO drops to ~€65k vs ~€85k single-source RO. Layered supply is the second highest-leverage decision after pre-treatment discipline.
- Trained operators are the single biggest predictor of which pilots survive past year 3.
- Tokelau's failure was a (3) with insufficient operator training — the lesson.
- Plan €3-5k for initial training of two operators including travel, a 5-day workshop, a written manual, and a 6-month follow-up visit. Spread that into the capex line, not opex — it's a one-time investment.
- (3) Community ownership with grant: the most resilient long-term but needs operator-training investment up front. Bequia's working model is closer to (1). Antigua plants are closer to (2). Tokelau's failure was a (3) with insufficient operator training — the lesson.
- RO sized down from 5 to 2 m³/day saves €5-7k on skid and €1-2k on PV/battery
- opex roughly halves because consumables track production and membrane life extends
- 10-year TCO drops to ~€65k vs ~€85k single-source RO
- layered supply outperforms single-source RO at this scale, every time the data lets us measure it
- trained operators are the single biggest predictor of which pilots survive past year 3
- Tokelau's failure was a community ownership model with insufficient operator training
- sensitivity analysis shows three TCO killers all trace to pre-treatment + 6-monthly CIP + consumables discipline
- operator training investment is one-time, not recurring opex
- always validate parameter values against WHO AND EU separately when documenting the design
- the dual-validation pattern from the technology and compliance sessions applies here too

## WEB SOURCES
- https://www.worldbank.org/en/topic/water/brief/water-and-development — supports: World Bank documentation emphasizes region-specific cost analysis and reference case studies for water infrastructure projects in developing economies.
- https://www.awwa.org/Portals/0/AWWA/ETS/Files/Water%20Industry%20Reports.pdf — supports: American Water Works Association publishes benchmarking data on regional treatment capex/opex variations that validate geographic cost driver analysis.
- https://www.usaid.gov/what-we-do/water-and-sanitation — neutral: USAID water program guidance acknowledges importance of local context but does not specifically prescribe reference case anchoring methodology.
- https://www.unwater.org/publications-reports/ — supports: UN-Water publishes case studies on water treatment deployments in small island states (including Caribbean) with documented cost metrics.
- https://www.ircwash.org/ — supports: IRC Water and Sanitation Centre aggregates regional reference deployments and cost data that directly enable the anchor-and-adjust TCO methodology.
- https://www.iwmi.cgiar.org/ — supports: International Water Management Institute research explicitly demonstrates how regional cost drivers (labor, climate resilience, logistics) vary systematically across geographies.
