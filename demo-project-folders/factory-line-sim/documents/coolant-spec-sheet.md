# Coolant — Castrol Hysol XF Specification

## Composition
Synthetic emulsion. 5 % vol in deionised water.

## Operational thresholds
- Working temperature: 40–60 °C
- Action threshold: **65 °C** (MQTT `coolant_temp_high`)
- Critical: 75 °C — full stop required
- pH: 8.5–9.2 (drift below 8.0 indicates bacterial contamination)
- Service life: 120 operating hours between sump drains

## Failure modes and signatures
- **Bacterial degradation**: pH drops, "rotten" smell, surface-staining
  defects on aluminium parts.
- **Thermal degradation**: oil droplets on sump surface, "smeary"
  surface finish on machined parts (Ra above 1.6 µm), reduced
  lubricity.
- **Concentration drift**: 5 % concentration drops to 3 % over time as
  carry-off accumulates; corrosion appears on steel parts.

## Change procedure
1. Drain sump completely (gravity, then suction).
2. Wash sump with 1 % cleaner solution, drain.
3. Refill with fresh 5 % emulsion, agitate via spindle for 5 min.
4. Test pH and concentration before resuming production.
5. Log `coolant_changed: true` in the day's status JSON.
