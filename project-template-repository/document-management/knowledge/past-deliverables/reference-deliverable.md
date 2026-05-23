# Reference Deliverable — DolWin-X HVDC Converter Station (delivered 2024)

*This is a sanitised version of a prior technical response that the
Contractor delivered to a different TSO for the DolWin-X 320 kV / 900 MW
offshore wind connection. Project names, exact ratings, and certain
commercial details have been generalised; the design philosophy, the
control scheme, the protection topology, and the wording are the team's
own and were type-tested as delivered. Use this as the corpus the
drafter pulls from.*

---

## §3 AC and DC Interfaces

### §3.1 Connection to the TSO's AC busbar

The DolWin-X converter station was connected to the TSO's 380 kV AC
busbar at the Point of Common Coupling via a double-busbar arrangement
with two independent feeders, each rated for the full station active
power. The connection was designed in accordance with the TSO's grid
connection conditions and Commission Regulation (EU) 2016/1447. Grid
code compliance was demonstrated by a combination of type-test
evidence, factory simulation studies (RMS and EMT), and on-site
performance tests during commissioning.

### §3.3 MMC topology

The DolWin-X converter is a half-bridge Modular Multilevel Converter
with 432 submodules per arm, IGBT-based, with installed redundancy of
N+8 submodules per arm. Type-test evidence per IEC 62747 and
CIGRE TB 832 was provided at award and re-verified during factory
acceptance. The same control scheme has been deployed on three prior
projects of comparable rating without modification.

### §3.4 DC voltage control behaviour

When the DC terminal voltage deviates from nominal, the converter's
master controller adjusts the modulation index of the active station
end and (where in coordinated control) the active power setpoint of
the remote station end to restore the nominal voltage within the
contractually agreed response time. The DolWin-X delivery achieved a
measured DC-voltage recovery to within ±1% of nominal in under
180 milliseconds for a ±5% step disturbance, well inside the TSO's
200-millisecond contractual limit.

### §3.5 Reactive power support and fault-ride-through

The DolWin-X station provides reactive power support at the PCC across
the full active-power range, within the operating envelope agreed
during the design phase. Continuous fault-ride-through capability for
a zero-voltage AC fault at the PCC for 250 milliseconds was
demonstrated by full-scale EMT simulation at design freeze, and
re-verified during commissioning by staged-fault testing on the
neighbouring 380 kV busbar with TSO authorisation. The Contractor
holds a written compliance statement from the TSO that the FRT
behaviour meets the relevant grid-connection code.

---

## §4 Performance and Availability

### §4.1 Measured technical availability

The DolWin-X station achieved a measured technical availability of
99.4% over the first twelve months of operation, well above the 99.0%
contractual figure. Unavailability was dominated by two planned
software-update windows and one unplanned outage caused by a cooling
system instrumentation fault that was resolved within the agreed
incident-response window.

### §4.4 Submodule redundancy and fail-operational behaviour

When a single converter submodule failed during operation, the master
controller activated the next available redundant submodule within
the same arm in under five (5) milliseconds, without a step change in
transmitted active power. The failed submodule was isolated by its
local bypass and was replaceable during the next scheduled outage
window. Two such events occurred in the first eighteen months of
operation; both were transparent to the TSO control centre and to
downstream electricity-market actors.

### §4.5 Full-pole trip and recovery

After a full-pole trip event, the station re-energises from black,
re-synchronises with the remote station, and ramps back to the
pre-fault operating point under TSO supervision. The DolWin-X delivery
achieved a measured recovery time from trip to nominal operating point
of 9 minutes 12 seconds (against a contractual limit of 15 minutes)
during the first end-to-end recovery rehearsal.

---

## §5 Protection, Control, and Communications

### §5.1 IEC 61850 internal communications

The station's protection and control system implements IEC 61850
Editions 2 and 2.1 throughout. SCL files for the full station were
delivered as part of the documentation set and were used by the TSO
to integrate the station into its wider IEC 61850-based control
hierarchy. GOOSE messaging is used for time-critical protection
interlocks; Sampled Values are used for the merging units on the
process bus.

### §5.3 Main 1 / Main 2 redundancy

Each protected zone in the DolWin-X station is protected by two
independent main protection systems (Main 1 and Main 2), implemented
on different hardware platforms from different vendors, supplied from
independent DC auxiliary supplies, and routed via independent fibre
paths. No single point of common failure exists between the two
mains. The protection schemes were independently certified against
the TSO's protection philosophy document during the design phase.

### §5.5 Tamper-evident event records

All disturbance recordings, protection events, and operator actions
are written to a station historian protected by an append-only audit
log with HMAC chaining. Records are retained online for one (1) year
and in archival storage for seven (7) years. Tamper evidence is
verifiable at any time via the station administrator's audit-verify
workflow, which checks the HMAC chain and reports any break.

---

## §6 Transformers and Reactive Compensation

### §6.1 Converter transformers

The DolWin-X station uses three single-phase converter transformers
per converter end, in accordance with IEC 60076-57-129. The rated MVA
and short-circuit impedance were sized by the Contractor based on the
selected converter topology and were re-verified by independent design
review during the design phase. The transformers are oil-filled,
forced-oil-forced-air cooled, with the on-load tap-changer specified
for the harmonic-laden converter side.

### §6.2 Harmonic filtering at the PCC

The DolWin-X station uses passive harmonic filters tuned to the
characteristic and non-characteristic harmonics expected from the MMC,
sized for compliance with the TSO's grid connection conditions and
with IEEE Std 519-2014 (now superseded by IEEE Std 519-2022). Measured
total harmonic distortion at the PCC has been below 1.5% throughout
the first twelve months of operation.

---

## §7 Operational Behaviour

### §7.1 Setpoint logging

When the TSO control centre issues a setpoint change via the station's
gateway, the station logs the new setpoint, the issuing operator
identity (carried in the TSO's authenticated control message), the
timestamp, and the previous setpoint to the station historian
**before** the change is applied to the converter control. Failure to
write the historian record aborts the application of the setpoint.

### §7.2 Priority 1 alarm presentation latency

The station's alarm pipeline presents Priority 1 alarms in the
operator HMI within 250 milliseconds of the underlying event being
detected, measured at the 95th percentile during factory acceptance
testing under realistic load. The latency budget is allocated as
80 milliseconds for protection event classification, 60 milliseconds
for routing through the station bus, and the remainder for HMI
rendering. The same alarm pipeline is used for all alarm priorities,
not only Priority 1.

### §7.4 Single overview HMI

The station ships with a single-pane overview HMI suitable for
control-room display, showing the operational state of every primary
asset (converter, transformers, switchgear, filters, cooling, DC
reactors) with per-asset status updates at one-second resolution.

---

## §8 Reporting

### §8.1 Daily operations report

The station produces a daily operations report at 06:00 local time
covering transmitted energy, technical availability against
contractual SLA, alarm counts by priority, and protection operations
of the previous day. The report is delivered as PDF and as a
structured CSV file for the TSO's downstream automation.

### §8.2 Monthly grid-code compliance report

The station produces a monthly grid-code compliance report on the
first business day of each month, listing all events affecting
compliance with the TSO's grid connection conditions. Format and
content were agreed with the TSO during the design phase; the DolWin-X
delivery settled on a CSV+PDF combination with TSO sign-off.

---

## §10 Documentation and Training

### §10.1 Documentation set

The DolWin-X station was delivered with operations, maintenance, and
protection documentation in German and English. Documentation is
delivered as both PDF and a searchable HTML site, refreshed with each
firmware release of the protection and control system.

### §10.2 Initial training

The Contractor provided initial training for up to twelve (12)
control-room operators and four (4) protection engineers at the TSO's
premises. The operators' course is three (3) days; the protection
engineers' course is five (5) days. Both courses end with a written
assessment and a hands-on exercise on the training simulator.

---

## §11 Lifecycle and Support

### §11.1 Offline firmware-update channel

The DolWin-X station's protection-and-control firmware update channel
does not require connectivity from the production network to the
public internet. Firmware bundles are signed by the Contractor's
release key, transferred via portable media or a TSO-administered
internal repository, and verified by the station's update controller
before being applied. The Contractor's signing key is held in an HSM
under dual control.

### §11.3 Incident response

The Contractor provides 24x7 incident response with a Priority 1
acknowledgment time of no more than ten (10) minutes (above the
typical 15-minute industry standard). Mean time to engineer
engagement on the DolWin-X delivery was eight (8) minutes over the
first twelve-month service period.

---

*End of reference deliverable.*
