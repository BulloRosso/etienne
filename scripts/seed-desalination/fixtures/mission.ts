/**
 * Mission brief and wiki/_meta/mission.md content for the
 * `desalination-devices` seed project.
 *
 * Used by:
 *   - POST /api/projects/create (missionBrief body field — short version)
 *   - wiki/_meta/mission.md (long form — every wiki write inherits relevance from this)
 */

export const PROJECT_NAME = 'desalination-devices';

export const MISSION_BRIEF =
  'Plan a pilot deployment of a small reverse-osmosis (RO) desalination unit ' +
  '(≤5 m³/day) on a remote Pacific or Caribbean island: select the technology, ' +
  'design the system around commercial components, ensure WHO/EU water-quality ' +
  'compliance, and estimate 10-year total cost of ownership.';

export const MISSION_MD = `# Mission — Desalination Devices

## Goal
Plan a **pilot deployment of a small reverse-osmosis desalination unit
(≤5 m³/day, serving 50-200 people)** on a remote tropical island. The pilot
must select an appropriate technology, design a buildable system from
commercially available components, demonstrate compliance with WHO and EU
drinking-water standards, and produce a defensible 10-year total-cost-of-
ownership estimate.

## Scope
Three angles, equal weight:

1. **Engineering** — choose between reverse osmosis (RO), multi-effect
   distillation (MED), electrodialysis (ED), and solar still. Specify
   membranes, pumps, energy-recovery devices, pre-treatment, post-treatment,
   and the renewable-energy + battery sizing.
2. **Compliance** — map every step to WHO *Guidelines for Drinking-water
   Quality* (4th ed.) and EU *Drinking Water Directive 2020/2184*. Cover at
   minimum: TDS, *E. coli* / coliform, boron, arsenic, free chlorine,
   turbidity. Where local rules exist (e.g. Fiji DWQS 2014), note divergences.
3. **Economics** — capex per m³/day, opex per m³ produced, membrane
   replacement cadence, energy assumptions, and a TCO model that surfaces
   the sensitivity to membrane life and PV vs. genset hybridisation.

## Target deployment scenarios
- **Pacific scenario**: an outer atoll in Polynesia (~120 people, brackish
  groundwater + seawater intake, year-round solar).
- **Caribbean scenario**: a small island in the Lesser Antilles (~200
  people, rainwater + seawater intake, hurricane resilience required).

## Out of scope
- Industrial-scale plants (≥100 m³/day).
- Cruise-ship and naval watermakers (different regulatory regime).
- Brine valorisation (interesting but not load-bearing for a 5 m³/day pilot).

## Provenance
Mission set 2026-05-14 by the project owner. Update only with an explicit
mission-change decision recorded in the changelog.
`;
