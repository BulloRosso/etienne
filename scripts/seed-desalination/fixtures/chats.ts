/**
 * Three chat sessions for the desalination-devices project.
 *
 * Format mirrors workspace/<other-project>/.etienne/chat.history-*.jsonl:
 * each entry is one JSON object per line:
 *   { timestamp, isAgent, message, contextName? }
 *
 * Each session has ~15 USER prompts → ~30 total lines (user + agent reply).
 *
 * Design intent for dreaming:
 *  - All three sessions are short, on-topic, with NO corrective user turns,
 *    so dreaming/segment.ts scores them as 'success' or 'unknown' (not
 *    'failure') and reflect.ts produces clean candidate strategies.
 *  - Three recurring agent moves appear across sessions, so distill.ts has
 *    clusters of size ≥2 to promote:
 *      1. "Always validate against WHO AND EU separately."
 *      2. "On a small-island deployment, pre-treatment + 6-monthly CIP
 *         decides whether membranes last 5 years or 18 months."
 *      3. "Layered supply — rainwater + RO + still — outperforms single-
 *         source RO for resilience."
 */

export interface ChatTurn {
  /** ISO 8601 timestamp; entries appear in chronological order. */
  timestamp: string;
  isAgent: boolean;
  message: string;
  /** Optional — when set, harvest.ts uses it to infer a domain. */
  contextName?: string;
}

export interface ChatSession {
  sessionId: string;
  /** Top-of-session timestamp (= timestamp of the session entry in chat.sessions.json). */
  timestamp: string;
  summary: string;
  turns: ChatTurn[];
}

// Stable session IDs so re-runs don't churn. Generated once, hand-copied here.
export const SESSIONS: ChatSession[] = [
  // =====================================================================
  // Session 1 — Technology selection
  // =====================================================================
  {
    sessionId: 'd1f0c4a2-1111-4aaa-9aaa-aaaaaaaaaaaa',
    timestamp: '2026-05-12T09:14:00Z',
    summary:
      'Selected RO over solar still and electrodialysis for a small Pacific atoll. Identified boron and pre-treatment as the two binding design constraints; established the WHO+EU dual-validation pattern.',
    turns: buildSession([
      [
        '2026-05-12T09:14:00Z',
        false,
        "We're planning a small desalination unit for a remote atoll, about 120 people. What technology should we look at first?",
        'technology-selection',
      ],
      [
        '2026-05-12T09:14:18Z',
        true,
        "For 120 people on a remote atoll your three credible options are reverse osmosis (RO), electrodialysis (ED/EDR), and solar still. RO dominates at this scale because the specific energy is 3-5 kWh/m³ with an energy-recovery device, it pairs naturally with PV+battery, and you can buy proven membranes off the shelf (FILMTEC SW30, Hydranautics, etc.). ED only wins when your feed is brackish (<10 000 mg/L TDS) — atoll lens-water sometimes is. Solar still is a useful failover but the footprint disqualifies it as a primary source above 20 people. What's the feed TDS likely to be?",
      ],
      [
        '2026-05-12T09:15:02Z',
        false,
        "We'll be drawing from seawater at the lagoon — so full marine, around 35 000 mg/L.",
        'technology-selection',
      ],
      [
        '2026-05-12T09:15:21Z',
        true,
        "Seawater settles it: RO. A single-pass FILMTEC SW30-2540 at 800 psi rejects 99.4 % of salt and outputs ~700 GPD (2.65 m³/day) per element under standard test. Two elements in series at 30 % recovery gives you the 5 m³/day you need with headroom. The element price (2026) is around €450 each. Now there are two design constraints that will bite you on a small Pacific deployment: pre-treatment, and boron. Want to start with one of those?",
      ],
      [
        '2026-05-12T09:16:00Z',
        false,
        "Pre-treatment first. What's the minimum I can get away with?",
        'technology-selection',
      ],
      [
        '2026-05-12T09:16:25Z',
        true,
        "On a lagoon intake at small scale, the minimum stack is: a 200 µm strainer at the intake, a multimedia filter (anthracite/sand/garnet), a 5 µm absolute cartridge filter, antiscalant dosing (citric or phosphonate, 2-4 ppm), and bisulfite dosing if any chlorine residual is present in the feed. Skipping any of these short-cuts is the single biggest predictor of premature membrane death. Target Silt Density Index (SDI) reaching the membrane: below 3. With this stack, your SW30 elements last the rated 5 years. Without antiscalant they're done in 18 months.",
      ],
      [
        '2026-05-12T09:17:10Z',
        false,
        "Got it. What about brine discharge — that's always a regulatory question, right?",
        'technology-selection',
      ],
      [
        '2026-05-12T09:17:30Z',
        true,
        "Yes — and on an atoll with coral reef it's a sensitive one. At 30 % recovery you produce ~12 m³/day of brine at roughly twice ambient salinity (≈70 g/L). Standard approach: discharge through a diffuser 50 m offshore in 5+ m depth to avoid hypersaline plumes on reef or seagrass. Document the discharge path in your permit submission — Pacific regulators will ask. If there's any cooling-water co-discharge available, that dilutes 5-10x and effectively makes the hypersalinity question disappear.",
      ],
      [
        '2026-05-12T09:18:14Z',
        false,
        "Now boron — you mentioned it's a constraint. Explain.",
        'technology-selection',
      ],
      [
        '2026-05-12T09:18:42Z',
        true,
        "Seawater has 4-5 mg/L of boron, almost all as boric acid. At pH 8 (your normal operating point) boric acid is uncharged, so a single seawater RO pass clears only 85-92 % of it. The WHO provisional limit is 2.4 mg/L; the EU DWD 2020/2184 is 1.5 mg/L. With a single SW30-2540 at low recovery you'll be at 0.4-0.6 mg/L permeate — fine under both. At 30-40 % recovery (which you need for energy economy) it climbs to 0.8-1.2 mg/L: still WHO-compliant, marginal under EU. Rule: always validate against WHO AND EU separately. They disagree on boron more often than on anything else, and that disagreement is what decides whether you need a partial second pass.",
        'technology-selection',
      ],
      [
        '2026-05-12T09:19:30Z',
        false,
        "We're not in the EU — does that mean we can stop at the WHO number?",
        'technology-selection',
      ],
      [
        '2026-05-12T09:19:52Z',
        true,
        "Legally yes (subject to your local regulator, which often references WHO directly). Practically I still recommend dual validation. Two reasons: first, most CE-marked components and accredited labs are calibrated to EU values, so an inadvertent EU-style audit is the most likely external check you'll face. Second, EU values are often a leading indicator of where WHO will move at the next revision — designing to the stricter one buys you regulatory headroom. So even outside the EU: validate against WHO AND EU separately, then make a deliberate choice if they diverge.",
      ],
      [
        '2026-05-12T09:20:30Z',
        false,
        "Let's talk power. The atoll has good solar — how big a PV array?",
        'technology-selection',
      ],
      [
        '2026-05-12T09:20:50Z',
        true,
        "Assume 4.5 peak sun-hours/day and 80 % round-trip system efficiency. Daily kWh / (4.5 × 0.8). For a 5 m³/day RO with ERD plus auxiliaries (UV, calcite pump, doser, chlorinator) your total is ~22 kWh/day. That sizes to 6.1 kWp — round up to 7 kWp for cloudy days and cleaning cycles. Pair with ~10 kWh of LFP battery for 6-hour evening autonomy. The energy-recovery device (ERD) is critical: without it your specific energy roughly doubles and your PV array doubles too.",
      ],
      [
        '2026-05-12T09:21:25Z',
        false,
        "Pure PV+battery, or include a backup genset?",
        'technology-selection',
      ],
      [
        '2026-05-12T09:21:48Z',
        true,
        "Include a small genset (~5 kVA). The Maldives pilots have shown that a 70/30 PV+genset hybrid achieves 95 % renewable share AND 99.5 % availability — strictly better than a 100 % PV+battery design at the same capex. The last 10 % of renewable share costs more in battery than the genset fuel saves over 10 years. The genset also gives you the headroom to run an emergency CIP cycle at any time, which protects membrane life.",
      ],
      [
        '2026-05-12T09:22:20Z',
        false,
        "How much does this cost, end to end?",
        'technology-selection',
      ],
      [
        '2026-05-12T09:22:42Z',
        true,
        "Capex for the 5 m³/day Pacific scenario, 2026 EUR: RO skid + ERD €18k, pre/post-treatment €6k, 7 kWp PV €7.5k, 10 kWh LFP battery €4.5k, 5 kVA genset €2.5k, hardened enclosure €3.5k, install + logistics €8k → total ~€50k. Annual opex ~€2.85k (membranes, consumables, fuel, labour). Year-5 membrane refresh €1.2k, year-8 battery replacement €4.5k. 10-year TCO ~€84k. Per m³ produced at 85 % availability: ~€5.4/m³ — well under the 10-20 €/m³ retail cost of trucked/bottled water in these regions.",
      ],
      [
        '2026-05-12T09:23:14Z',
        false,
        "And availability — what's realistic?",
        'technology-selection',
      ],
      [
        '2026-05-12T09:23:32Z',
        true,
        "85 % is what I plan for; 90-95 % is achievable with disciplined maintenance and good spare-parts strategy. The two biggest availability killers on small-island RO are: (1) skipping the 6-monthly clean-in-place (CIP), and (2) running out of consumables (antiscalant, bisulfite). Tokelau's pilot failed at 18 months because the antiscalant tank ran dry without an alarm. Mandatory: low-level switches on every consumable tank wired to a stop-on-empty relay. Cheap fix, prevents the most common premature-failure mode.",
      ],
      [
        '2026-05-12T09:24:01Z',
        false,
        "Operator training — how many people, how long?",
        'technology-selection',
      ],
      [
        '2026-05-12T09:24:20Z',
        true,
        "Train two locals from day one. Bequia's pilot went offline for 6 weeks in year 3 waiting on a flown-in technician for a feed solenoid swap — a 30-minute job for a trained operator. Two operators (primary + backup), each with a basic water-treatment certificate or equivalent, plus a written sign-off log for the 6-monthly CIP and monthly chlorine check. That's enough to satisfy Pacific permit requirements and survive normal staff turnover.",
      ],
      [
        '2026-05-12T09:24:50Z',
        false,
        "Spares strategy?",
        'technology-selection',
      ],
      [
        '2026-05-12T09:25:09Z',
        true,
        "Hold one spare RO membrane element plus a full year of consumables (cartridges, antiscalant, bisulfite, chlorine, calcite) on-island at all times. Saint Helena's pilot demonstrated the value — £450 in tied-up inventory saved several weeks of downtime in two separate failure modes over 8 years. The flown-in-technician cost dwarfs the cost of the spare.",
      ],
      [
        '2026-05-12T09:25:40Z',
        false,
        "Last question — resilience. We're in a cyclone zone.",
        'technology-selection',
      ],
      [
        '2026-05-12T09:25:58Z',
        true,
        "Three design points. (1) Hardened, sealed enclosure for the unit — not just a roof. Funafuti's first install lost ~20 days/year to storm damage; the retrofit got them to 99 % availability. (2) Quick-disconnect rainwater inlet upstream of post-treatment, so after a storm you can supply chlorinated rainwater while the membrane is being inspected. Carriacou's pilot showed this turns a 2-month outage into a 2-week outage. (3) A layered supply strategy — rainwater for general use, RO for drinking, solar still as a teaching/fallback — extends membrane life and improves resilience. Don't try to run everything through RO; layered systems consistently outperform single-source.",
      ],
      [
        '2026-05-12T09:26:30Z',
        false,
        "Perfect, write this up as a decision summary?",
        'technology-selection',
      ],
      [
        '2026-05-12T09:26:48Z',
        true,
        "Decision summary: technology = single-pass seawater RO using FILMTEC SW30-2540 elements, 5 m³/day at 30 % recovery, with ERD. Power: 7 kWp PV + 10 kWh LFP + 5 kVA backup genset (70/30 hybrid). Pre-treatment: strainer → multimedia → 5 µm cartridge → antiscalant + bisulfite dosing, target SDI < 3. Post-treatment: calcite remineralisation → chlorine 0.2-0.5 mg/L → UV at unit boundary. Brine: 50 m offshore diffuser at 5+ m depth. Enclosure: cyclone-rated, sealed. Layered supply with rainwater bypass. Two trained operators + one spare membrane + one year of consumables on-island. Capex ~€50k, 10-year TCO ~€84k, ~€5.4/m³. Decision rule: validate every parameter against WHO AND EU separately, even outside the EU.",
      ],
    ]),
  },

  // =====================================================================
  // Session 2 — Compliance check
  // =====================================================================
  {
    sessionId: 'd1f0c4a2-2222-4bbb-9bbb-bbbbbbbbbbbb',
    timestamp: '2026-05-13T11:30:00Z',
    summary:
      'Walked through WHO vs EU for the proposed RO design parameter by parameter. Boron is the binding EU constraint; coliforms and turbidity satisfied by the standard train. Confirmed the WHO+EU dual-validation pattern.',
    turns: buildSession([
      [
        '2026-05-13T11:30:00Z',
        false,
        "Now I want to walk through compliance — will the design we sketched yesterday actually pass WHO and EU?",
        'compliance-check',
      ],
      [
        '2026-05-13T11:30:18Z',
        true,
        "Good plan. The discipline I'd suggest: validate every parameter against WHO AND EU separately, even though you're not in the EU. Two reasons — most accredited labs and CE-marked components are calibrated to EU values, and EU values often presage the next WHO revision. Let's go parameter by parameter. We need to cover at minimum: TDS, E. coli / coliforms, boron, free chlorine, turbidity, arsenic. Anything else you want to add?",
      ],
      [
        '2026-05-13T11:30:52Z',
        false,
        "Lead and fluoride? Or are those not relevant?",
        'compliance-check',
      ],
      [
        '2026-05-13T11:31:14Z',
        true,
        "Lead is a distribution-system parameter, not a source one — seawater has effectively zero lead, the membrane rejects whatever's there, and post-RO permeate is lead-free. Where lead enters is in pipework: brass fittings, old solder. The EU is phasing to 5 µg/L by 2036; that's stricter than WHO (10 µg/L). Mitigation = lead-free fittings throughout the post-treatment loop. Fluoride: seawater is ~1.3 mg/L, mostly rejected by RO; permeate is 0.05-0.1 mg/L, well below WHO 1.5 and EU 1.5. Not a worry for a pure-RO unit.",
      ],
      [
        '2026-05-13T11:31:55Z',
        false,
        "Start with TDS.",
        'compliance-check',
      ],
      [
        '2026-05-13T11:32:10Z',
        true,
        "WHO has no health-based limit; taste tiers are <300 excellent, 300-600 good, 600-900 fair, 900-1200 poor, >1200 unacceptable. EU follows the same approach — no binding limit. Your raw RO permeate is ~50-100 mg/L, which is below the desirable tier and corrosive in distribution. The calcite contactor in post-treatment lifts you to 300-450 mg/L — solidly in the 'good' tier. Both WHO and EU satisfied. The interesting failure mode is *aggressive low-TDS water in pipework*, not the TDS value itself. Calcite addresses both.",
      ],
      [
        '2026-05-13T11:32:48Z',
        false,
        "E. coli and coliforms.",
        'compliance-check',
      ],
      [
        '2026-05-13T11:33:00Z',
        true,
        "Identical numerical requirement under both regimes: 0 E. coli per 100 mL, 0 coliforms per 100 mL in treated water leaving the works. Methods: EN ISO 9308-1 or 9308-2. Your train satisfies this with significant margin: the RO membrane is a microbiological barrier (>4-log reduction), the UV at the unit boundary is a second barrier (≥40 mJ/cm² at 256 nm = >4-log Cryptosporidium), and the free-chlorine residual at the network entry is a third. The failure mode that matters is *recontamination downstream*: an unsealed calcite contactor, a contaminated storage tank, biofilm in distribution. Mitigation: monthly bacteriological sampling at the consumption point, not just at the works output.",
      ],
      [
        '2026-05-13T11:33:48Z',
        false,
        "Boron — you said this is the binding constraint.",
        'compliance-check',
      ],
      [
        '2026-05-13T11:34:08Z',
        true,
        "Yes. WHO provisional 2.4 mg/L, EU binding 1.5 mg/L. Seawater feed ~4.5 mg/L. Single FILMTEC SW30-2540, 8 % recovery, standard pH 8: ~88 % rejection → permeate 0.5 mg/L. Comfortable under both. But you'll run at ~30 % recovery for energy economy, which raises permeate boron to 0.8-1.2 mg/L. WHO still satisfied; EU is borderline. Two ways to get reliably under EU 1.5: (1) switch to the SW30HR variant — 91-93 % rejection vs 88 %, costs ~15 % more, drops permeate to ~0.6 mg/L at the same recovery; (2) partial second-pass at pH 10 to ionise boric acid, which lifts overall rejection to 98+ %. For an EU-regulated deployment I'd default to option 2. Outside the EU, option 1 is usually enough.",
      ],
      [
        '2026-05-13T11:34:55Z',
        false,
        "Free chlorine.",
        'compliance-check',
      ],
      [
        '2026-05-13T11:35:08Z',
        true,
        "WHO recommends 0.2-0.5 mg/L residual at the point of consumption. EU treats it as a Part C indicator, similar values. Both regimes treat absence-of-residual as a problem. Your ProMinent dosing pump after the calcite contactor delivers this. Daily operator log: dose verification at the network entry. One nuance: chlorine and the RO membrane are incompatible — anything upstream of the membrane that has chlorine residual needs bisulfite dosing first. Your standard train accounts for this in pre-treatment.",
      ],
      [
        '2026-05-13T11:35:48Z',
        false,
        "Turbidity.",
        'compliance-check',
      ],
      [
        '2026-05-13T11:35:58Z',
        true,
        "WHO: <1 NTU treated, <0.3 optimal. EU DWD: 1 NTU at the treatment-works output (Part C). Your post-RO permeate is essentially zero NTU. The control point in your train is the 5 µm cartridge filter ahead of the membrane. Both regimes easily satisfied. The instrument-grade nephelometer at the unit boundary is cheap (€500-1000) and reports continuously; recommend it for the operator's daily log.",
      ],
      [
        '2026-05-13T11:36:35Z',
        false,
        "Arsenic.",
        'compliance-check',
      ],
      [
        '2026-05-13T11:36:50Z',
        true,
        "Seawater is 1-2 µg/L; RO clears >99 %. Permeate ~0.01 µg/L. WHO 10 µg/L, EU 10 µg/L — both satisfied with three orders of magnitude of margin. The case where arsenic becomes interesting is brackish groundwater from volcanic geology (some atolls). If your intake is the lagoon you can ignore arsenic; if you ever consider switching to a brackish well, test for it before designing.",
      ],
      [
        '2026-05-13T11:37:30Z',
        false,
        "What about PFAS? The new EU rule mentions 0.1 µg/L for the sum-of-20.",
        'compliance-check',
      ],
      [
        '2026-05-13T11:37:55Z',
        true,
        "EU DWD 2020/2184 introduces PFAS-sum-of-20 at 0.1 µg/L; WHO has no binding limit. RO is highly effective on PFAS — typical rejection 90-99 % depending on chain length. Seawater PFAS levels are low (sub-ng/L for most compounds), so post-RO is comfortably below 0.1 µg/L. The interesting case is a brackish source near a former military or industrial site. Probably not your scenario, but document it in your Water Safety Plan so the auditor sees you've considered it.",
      ],
      [
        '2026-05-13T11:38:30Z',
        false,
        "So the bottom line — what passes?",
        'compliance-check',
      ],
      [
        '2026-05-13T11:38:48Z',
        true,
        "WHO: every parameter passes by a healthy margin with the standard train. EU: every parameter passes by a healthy margin EXCEPT boron, which is marginal at 30 % recovery. Decision: spec the SW30HR membrane variant (15 % cost premium, 91-93 % boron rejection) to give you EU-grade headroom for boron without a second-pass system. That's the only design change driven by compliance; everything else in the standard train satisfies both regimes simultaneously.",
      ],
      [
        '2026-05-13T11:39:25Z',
        false,
        "Permitting — what do I actually file?",
        'compliance-check',
      ],
      [
        '2026-05-13T11:39:48Z',
        true,
        "Pacific scenario typical bundle: (1) source-water sampling for at least TDS, coliforms, turbidity (a one-off baseline); (2) treatment-train flow diagram with parameter control points labelled; (3) maintenance plan including 6-monthly CIP and monthly chlorine verification; (4) brine discharge plan with location, depth, diffuser detail; (5) operator competency evidence; (6) Water Safety Plan in WHO format. The WSP is the one most easily underestimated — budget two weeks for a first draft. Lead time application to permit: 4-12 weeks.",
      ],
      [
        '2026-05-13T11:40:18Z',
        false,
        "Sample frequency once we're operating?",
        'compliance-check',
      ],
      [
        '2026-05-13T11:40:35Z',
        true,
        "For a 5 m³/day pilot (~1 800 m³/yr): monthly bacteriological (coliforms + E. coli) at the network entry AND a representative consumption point; daily chlorine residual measurement by the operator; quarterly chemical battery (TDS, boron, turbidity, plus iron and manganese if any storage tank corrosion); annual full Annex I battery sent to an accredited lab. Fiji's national rule adds an operator log for daily disinfectant residual which is good practice everywhere. Build the operator a one-page checklist; it's the difference between actual compliance and paper compliance.",
      ],
      [
        '2026-05-13T11:41:08Z',
        false,
        "Documentation for the operator?",
        'compliance-check',
      ],
      [
        '2026-05-13T11:41:24Z',
        true,
        "Three documents on-site, laminated: (1) Standard Operating Procedure for daily/weekly/monthly checks; (2) the 6-monthly CIP procedure with chemical safety pictograms; (3) a parameter cheat-sheet showing WHO and EU values side by side for the parameters you're sampling, so the operator can flag an out-of-range number without having to look up which regime applies. The dual-table format is important — it reinforces the discipline of validating against both regimes separately.",
      ],
      [
        '2026-05-13T11:42:00Z',
        false,
        "Audit prep — what do I show the auditor?",
        'compliance-check',
      ],
      [
        '2026-05-13T11:42:16Z',
        true,
        "Three folders. (1) Design folder: flow diagram, equipment data sheets, brine discharge plan, Water Safety Plan. (2) Operations folder: daily/weekly/monthly logs, maintenance records including the 6-monthly CIP sign-offs, dosing-tank fill records. (3) Compliance folder: monthly bacteriological reports, quarterly chemical reports, annual accredited-lab battery, calibration certificates for the conductivity meter and chlorinator. The 6-monthly CIP sign-off is the single most asked-for evidence in remote audits — Cape Verde's failure at year 2 was traced to three skipped CIPs and would have been caught by a routine audit.",
      ],
      [
        '2026-05-13T11:42:50Z',
        false,
        "Summary?",
        'compliance-check',
      ],
      [
        '2026-05-13T11:43:08Z',
        true,
        "Compliance summary: design satisfies WHO and EU on every parameter; boron is marginal at high recovery, addressed by spec'ing the SW30HR membrane variant. Operational discipline matters more than design discipline: the 6-monthly CIP and the monthly chlorine verification are the two compliance-critical operational items. The single load-bearing pattern across the whole exercise is the same as yesterday: validate every parameter against WHO AND EU separately, even outside the EU, and document the dual-table comparison so the operator and the auditor both see it.",
      ],
    ]),
  },

  // =====================================================================
  // Session 3 — TCO for a Bequia-style Caribbean pilot
  // =====================================================================
  {
    sessionId: 'd1f0c4a2-3333-4ccc-9ccc-cccccccccccc',
    timestamp: '2026-05-14T15:02:00Z',
    summary:
      'Built a 10-year TCO for a Caribbean pilot in the Bequia mould. Confirmed PV+genset hybrid economics, layered supply resilience, and the dominance of pre-treatment + 6-monthly CIP discipline in total cost of ownership.',
    turns: buildSession([
      [
        '2026-05-14T15:02:00Z',
        false,
        "Switching to the Caribbean scenario now. Bequia-style — 200 people, similar pilot.",
        'tco-planning',
      ],
      [
        '2026-05-14T15:02:15Z',
        true,
        "Bequia is a good reference. The published numbers there: 10-20 €/m³ retail cost of bottled / trucked water pre-RO, payback inside 5 years on a community-scale RO unit. The Caribbean differs from the Pacific in two ways that affect TCO: (1) hurricane season Jun-Nov means harder enclosure spec and a quick-disconnect rainwater inlet; (2) more open-Atlantic biofouling load reduces membrane life on outer-coast intakes (3-4 years vs the 5 you get on a lagoon). What's the intake going to be — lagoon or open ocean?",
      ],
      [
        '2026-05-14T15:02:48Z',
        false,
        "Lagoon if we can. Sheltered side of the island.",
        'tco-planning',
      ],
      [
        '2026-05-14T15:03:02Z',
        true,
        "Good — that keeps you on the 5-year membrane life curve and shortens the pump duty cycle. Capex for the Caribbean scenario looks similar to Pacific except enclosure (hurricane shutters add ~€1.5k) and install/logistics (slightly lower because Bequia has better shipping access than a Polynesian atoll). Roughly: €51k total capex vs €50k Pacific. Within rounding.",
      ],
      [
        '2026-05-14T15:03:35Z',
        false,
        "Walk me through the capex line items.",
        'tco-planning',
      ],
      [
        '2026-05-14T15:03:55Z',
        true,
        "Caribbean 5 m³/day, 2026 EUR: RO skid + ERD €18k; pre/post-treatment + dosing €7k (slightly higher because we add a second chlorinator for hurricane bypass); 7 kWp PV €7.5k; 10 kWh LFP battery €4.5k; 5 kVA genset €3k (more frequent storm-recovery use); hardened enclosure with hurricane shutters €5k; install + logistics €6k. Total ~€51k.",
      ],
      [
        '2026-05-14T15:04:30Z',
        false,
        "Annual opex?",
        'tco-planning',
      ],
      [
        '2026-05-14T15:04:42Z',
        true,
        "Membranes amortised: €250/year. Consumables (cartridges, antiscalant, bisulfite, chlorine, calcite): €800/year. Genset fuel: €300/year at the hybrid duty cycle. Operator labour (one day per month at local rate): €1 500/year. Total opex: ~€2 850/year. The labour line is the one most often underestimated — pencil it in even if the work is in-kind contribution from a community member; you want the true cost visible.",
      ],
      [
        '2026-05-14T15:05:15Z',
        false,
        "And mid-life replacements?",
        'tco-planning',
      ],
      [
        '2026-05-14T15:05:28Z',
        true,
        "Year 5: full membrane set €1 200 (assuming you held one spare and rotate it in). Year 8: battery replacement €4 500 (LFP at €450/kWh, 10 kWh). Smaller items (cartridges, calcite refills) are in the consumables line. Genset rebuild typically year 10 — defer outside the 10-year window or count it as end-of-life recapitalisation.",
      ],
      [
        '2026-05-14T15:06:00Z',
        false,
        "What's the 10-year TCO?",
        'tco-planning',
      ],
      [
        '2026-05-14T15:06:14Z',
        true,
        "51k capex + 10 × 2.85k opex + 1.2k mid-life membrane + 4.5k mid-life battery = ~€85k. Production at 85 % availability: 5 m³/day × 365 × 0.85 = ~1 550 m³/year over 10 years = ~15 500 m³ total. Per m³ produced: ~€5.5/m³. Against a 10-20 €/m³ baseline that's a payback under 5 years even at the low end.",
      ],
      [
        '2026-05-14T15:06:50Z',
        false,
        "Sensitivity — what kills the economics?",
        'tco-planning',
      ],
      [
        '2026-05-14T15:07:05Z',
        true,
        "Three things in order of impact. (1) Membrane life. If pre-treatment is mismanaged and you replace at year 2 instead of year 5, you've added ~€2 500 in unplanned membrane costs and lost availability. (2) Availability. Each percentage point of unplanned downtime adds ~€60/year in lost capacity at retail water values. (3) Battery life. A premature battery replacement at year 5 instead of year 8 adds ~€4 500. All three trace back to the same operational discipline: pre-treatment + 6-monthly CIP + low-level switches on every consumable tank. That cluster is the single biggest TCO determinant for small-island RO; skip it and your TCO doubles.",
      ],
      [
        '2026-05-14T15:07:50Z',
        false,
        "What about a pure-PV design — no genset, just oversize the battery?",
        'tco-planning',
      ],
      [
        '2026-05-14T15:08:10Z',
        true,
        "Tried in Maldives pilots and a few Caribbean resorts. The numbers: to hit 99 % availability without a genset, battery has to grow from 10 kWh to ~25 kWh, adding ~€7k capex. Over 10 years you save the €300/year × 10 = €3k of fuel — net loss of €4k, and you've also doubled the embedded carbon. The 70/30 PV+genset hybrid is the strictly better economic AND environmental design at this scale. Different story above 50 m³/day where battery costs amortise differently.",
      ],
      [
        '2026-05-14T15:08:50Z',
        false,
        "What about layered supply — does that change the TCO?",
        'tco-planning',
      ],
      [
        '2026-05-14T15:09:08Z',
        true,
        "Materially. Kiribati's experience with rainwater + RO + still: RO demand dropped 70 % because cooking and washing came off rainwater and the still. That extends membrane life proportionally, drops genset fuel, and improves resilience after storms. For Bequia I'd plan RO for drinking only, rainwater for general use, solar still as a teaching tool and emergency fallback. The capex add is small — rainwater collection is mostly roof + gutters + a polyethylene tank, €3-5k for a 200-person village.",
      ],
      [
        '2026-05-14T15:09:48Z',
        false,
        "Updated TCO with layered supply?",
        'tco-planning',
      ],
      [
        '2026-05-14T15:10:05Z',
        true,
        "Add €4k rainwater capex up front. RO sized down from 5 to 2 m³/day saves €5-7k on the skid and €1-2k on the PV/battery. Net capex slightly lower at ~€48k for the integrated system. Opex roughly halves because consumables track production and membrane life extends. 10-year TCO drops to ~€65k vs ~€85k single-source RO. Layered supply is the second highest-leverage decision after pre-treatment discipline.",
      ],
      [
        '2026-05-14T15:10:40Z',
        false,
        "Financing — who pays?",
        'tco-planning',
      ],
      [
        '2026-05-14T15:10:55Z',
        true,
        "Three patterns I've seen work. (1) Donor capex + community opex: NGO/government covers €50-65k capex, community sells water at €3-5/m³ to fund opex. (2) Concession: a private operator builds and runs, community pays per-m³ tariff. (3) Community ownership with grant: the most resilient long-term but needs operator-training investment up front. Bequia's working model is closer to (1). Antigua plants are closer to (2). Tokelau's failure was a (3) with insufficient operator training — the lesson.",
      ],
      [
        '2026-05-14T15:11:35Z',
        false,
        "Operator training cost?",
        'tco-planning',
      ],
      [
        '2026-05-14T15:11:48Z',
        true,
        "Plan €3-5k for initial training of two operators including travel, a 5-day workshop, a written manual, and a 6-month follow-up visit. Spread that into the capex line, not opex — it's a one-time investment. Annual refresher €500-1 000 if the operator is rotated to a new community pilot for cross-training. Trained operators are the single biggest predictor of which pilots survive past year 3.",
      ],
      [
        '2026-05-14T15:12:20Z',
        false,
        "Summary?",
        'tco-planning',
      ],
      [
        '2026-05-14T15:12:38Z',
        true,
        "Caribbean Bequia-style pilot summary: capex ~€51k, annual opex ~€2.85k, 10-year TCO ~€85k for pure RO single-source. With layered rainwater + RO + still, TCO drops to ~€65k AND resilience improves. Per-m³ cost ~€5.5/m³ single-source, ~€4/m³ layered. Sensitivity: the three TCO killers (membrane premature failure, low availability, premature battery replacement) all trace to pre-treatment + 6-monthly CIP + consumables discipline. Hybrid PV+genset beats pure-PV at this scale on cost AND emissions. Always validate parameter values against WHO AND EU separately when documenting the design — the dual-validation pattern from the technology and compliance sessions applies here too. And: layered supply outperforms single-source RO at this scale, every time the data lets us measure it.",
      ],
    ]),
  },
];

function buildSession(
  rows: Array<[string, boolean, string] | [string, boolean, string, string]>,
): ChatTurn[] {
  return rows.map(([timestamp, isAgent, message, contextName]) => {
    const turn: ChatTurn = { timestamp, isAgent, message };
    if (contextName) turn.contextName = contextName;
    return turn;
  });
}
