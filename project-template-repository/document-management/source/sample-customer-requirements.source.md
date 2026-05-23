# CUSTOMER REQUIREMENTS DOCUMENT

**Document number:** TSO-HVDC-2026-0142
**Revision:** B (issued 2026-03-14, supersedes Revision A of 2026-02-01)
**Project:** 525 kV / 2 GW HVDC Converter Station — Onshore Terminal,
NordLink-3 Offshore Wind Connection

This document defines the requirements the Contractor shall meet for the
onshore HVDC converter station of the NordLink-3 connection package. The
Contractor is required to respond to every requirement individually, with a
statement of comply, partial-comply, deviation, or clarification.

---

## 1. Definitions

| Term | Meaning |
|------|---------|
| **Contractor** | The legal entity awarded the contract under this procurement. |
| **TSO** | The transmission system operator issuing this document. |
| **Station** | The full onshore converter station supplied under this contract, including the converter, transformers, switchgear, control and protection, auxiliaries, cooling, and civil works. |
| **PCC** | Point of Common Coupling — the connection point to the 380 kV AC grid. |
| **HVDC link** | The full bipolar 525 kV DC link from offshore platform to onshore PCC. |
| **Mandatory** | A requirement marked "shall". Failure to comply is a non-compliance. |
| **Recommended** | A requirement marked "should". Non-compliance must be justified in the response. |

---

## 2. Scope

§2.1 The Station shall be designed, manufactured, type-tested, delivered,
erected, commissioned, and put into operation as a complete 525 kV / 2 GW
HVDC converter station, suitable for the onshore end of the NordLink-3
offshore wind connection.

§2.2 The Station shall be supplied with all hardware, software, primary and
secondary equipment, civil works, documentation, type-test evidence, and
integration services required to satisfy the requirements of this document.

§2.3 The Contractor shall maintain the Station under a service agreement of
no less than five (5) years from Provisional Acceptance.

---

## 3. AC and DC Interfaces

§3.1 The Station shall connect to the TSO's 380 kV AC busbar at the Point of
Common Coupling, in compliance with the TSO's grid connection conditions
and with Commission Regulation (EU) 2016/1447 (Network Code on Requirements
for Generators and HVDC Systems).

§3.2 The DC side of the Station shall operate at a rated symmetrical
monopolar voltage of ±525 kV with a continuous transmission capacity of
2 GW per pole.

§3.3 The Station shall operate as a Modular Multilevel Converter (MMC) of
half-bridge or full-bridge topology, at the Contractor's choice, subject to
type-test evidence for the chosen topology being available at the design
phase.

§3.4 When the DC voltage at the converter terminals deviates from nominal
by more than ±5%, the Station's control shall regulate the converter to
restore nominal voltage within the response times defined in the TSO's
grid connection conditions.

§3.5 The Station shall provide reactive power support at the PCC within
the operating envelope of −0.95 to +0.95 cos φ at rated active power.

---

## 4. Performance and Availability

§4.1 The Station shall achieve a measured technical availability of at
least 99.0% over any rolling twelve-month period, excluding scheduled
outage windows agreed in writing with the TSO.

§4.2 The Station's converter shall achieve an energy efficiency at rated
active power of no less than 98.7% per converter end (AC-to-DC or DC-to-AC,
as applicable), measured at the connection terminals.

§4.3 While a planned outage window is in effect, the Station may operate at
reduced active power provided that DC voltage stability and AC-side
reactive support remain compliant with §3.4 and §3.5.

§4.4 If a single converter submodule fails, the Station shall continue
operation by activating its installed redundancy, without operator
intervention and without a step change in transmitted active power.

§4.5 The Station shall recover from a single full-pole trip and resume
power transmission to the agreed operating point within the times defined
in the TSO's grid connection conditions.

---

## 5. Protection, Control, and Communications

§5.1 The Station's protection and control system shall be implemented in
accordance with IEC 61850 for all internal substation communications.

§5.2 The Station's AC switchgear shall comply with IEC 62271-1 and the
applicable part-standards (IEC 62271-100 for circuit breakers, IEC 62271-102
for disconnectors and earthing switches, IEC 62271-203 for gas-insulated
metal-enclosed switchgear).

§5.3 The Station shall provide independent main protection (Main 1 and
Main 2) for each protected zone, with no single point of common failure
between the two main systems.

§5.4 The Station's protection and control system shall comply with
IEC 62443-3-3 controls SR 1.1 through SR 1.5, SR 2.1, SR 3.1, SR 3.4, and
SR 7.6, applied at the system-integrator level of the Contractor's
delivery organisation.

§5.5 All disturbance and event records shall be tamper-evident and retained
for no less than seven (7) years.

---

## 6. Transformers and Reactive Compensation

§6.1 The Station shall include converter transformers conforming to
IEC 60076-57-129 (Power transformers — Part 57-129: Transformers for
HVDC applications). The rated MVA and short-circuit impedance shall be
proposed by the Contractor based on the converter design.

§6.2 The Station shall provide harmonic filtering and reactive compensation
such that the harmonic distortion at the PCC remains within the limits
defined in the TSO's grid connection conditions and IEEE Std 519-2022.
Filter design shall be of either passive or active type at the
Contractor's choice.

§6.3 The Station shall protect personal data in accordance with applicable
data-protection regulations. The Contractor shall name the regulations in
the response.

§6.4 On TSO request the Station shall delete personal data within thirty
(30) days. Where retention is required by law, the Station shall retain
only the minimum necessary data and shall record the legal basis.

---

## 7. Operational Behaviour

§7.1 When the TSO control centre issues a setpoint change via the
station's gateway, the Station shall log the setpoint, the issuing
operator identity, the timestamp, and the previous setpoint before
applying the change to the converter control.

§7.2 When a Priority 1 alarm is raised, the Station shall present the
alarm in the operator HMI within 500 milliseconds of the underlying event
being detected.

§7.3 If two operators issue conflicting setpoints to the same converter
pole within one (1) second, the Station shall reject both commands and
raise an alarm.

§7.4 The Station shall present the operational state of every primary
asset on a single overview screen suitable for control-room display.

---

## 8. Reporting

§8.1 The Station shall produce a daily operations report summarising
transmitted energy, availability metrics, alarm counts by priority, and
any protection operations.

§8.2 The Station shall produce a monthly grid-code compliance report
listing all relevant events affecting compliance with the TSO's grid
connection conditions. The report format shall be agreed during design.

§8.3 Where requested by the TSO, the Station shall produce ad-hoc
disturbance reports covering up to ninety (90) days of records within
sixty (60) minutes of request.

---

## 9. Continuity and Recovery

§9.1 The Contractor shall provide adequate reactive-power support for
the Station.

§9.2 The Station shall be capable of black start support to the local
auxiliary network in the event of a wide-area blackout, with a documented
energisation sequence proposed by the Contractor.

§9.3 The Station shall not lose accepted setpoint history in the event of
a single-cubicle protection-and-control failure.

---

## 10. Documentation and Training

§10.1 The Contractor shall provide operations, maintenance, and protection
documentation in German and English at handover.

§10.2 The Contractor shall provide initial training for up to twelve (12)
control-room operators and four (4) protection engineers at the TSO's
premises.

§10.3 The Contractor shall provide refresher training annually for the
duration of the service agreement defined in §2.3.

---

## 11. Lifecycle and Support

§11.1 The Contractor shall provide a firmware-update channel for the
Station's protection and control system that does not require connectivity
from the production network to the public internet.

§11.2 Where a third-party component is no longer supported by its vendor,
the Contractor shall propose a replacement at least twelve (12) months
before end-of-support.

§11.3 The Contractor shall provide 24x7 incident response with a Priority 1
acknowledgment time of no more than fifteen (15) minutes.

---

## 12. Commercial

§12.1 The Contractor shall provide a fixed price for the Station at
handover, broken down by primary equipment, secondary equipment, civil
works, integration, and services.

§12.2 The Contractor shall provide unit prices for additional bay capacity
(per AC switchgear bay and per DC reactor unit).

---

## 13. References

The following documents are referenced and, where cited, form part of these
requirements:

- Commission Regulation (EU) 2016/1447 — Network Code on Requirements for
  Generators and HVDC Systems
- IEC 61850 series — Communication networks and systems for power utility
  automation
- IEC 62271-1, -100, -102, -203 — High-voltage switchgear and controlgear
- IEC 60076-57-129 — Power transformers for HVDC applications
- IEC 62443-3-3 — Industrial automation and control systems security —
  System security requirements and security levels
- IEEE Std 519-2022 — Recommended Practice and Requirements for Harmonic
  Control in Electric Power Systems

---

## Annex C — Clarifications (Revision B)

This annex was issued with Revision B on 2026-03-14 in response to
questions raised during the bidders' clarification meeting on 2026-02-22.
Where this annex modifies a clause in §1–§12, this annex prevails.

**C.1** §7.2 is modified. The 500-millisecond limit for Priority 1 alarm
presentation is reduced to 250 milliseconds. This applies to all alarm
priorities, not only Priority 1.

**C.2** §3.2 is clarified. The Station shall additionally be capable of
transmitting up to 2.2 GW per pole continuously for periods of no more
than thirty (30) minutes, for use in TSO redispatch operations.

**C.3** §11.3 is clarified. The 15-minute acknowledgment time applies
during the TSO's operating hours (06:00–22:00 local time on TSO business
days). Outside those hours, the acknowledgment time shall be no more than
thirty (30) minutes.

**C.4** §3.5 is modified. The Contractor shall demonstrate continuous
fault-ride-through capability for an AC fault that depresses the voltage
at the PCC to zero for up to 250 milliseconds, followed by a stepped
recovery profile in accordance with the TSO's grid connection conditions.
Failure to ride through shall result in a non-compliance and Liquidated
Damages per the contract schedule.

---

*End of document.*
