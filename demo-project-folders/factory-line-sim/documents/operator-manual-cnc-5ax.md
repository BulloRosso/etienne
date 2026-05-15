# Operator Manual — CNC-5AX

## Daily startup
1. Power on, wait 30 minutes for thermal equilibrium before any IT7 part.
2. Verify coolant temperature is below 50 °C and sump level is full.
3. Verify chip bin is empty (or at most 25 % full).
4. Run the daily warm-up cycle (program 9001) — 8 minutes of no-load
   spindle and axis travel.
5. Mount fixture, apply hydraulic clamp, verify clamp pressure is between
   5.5 and 6.5 bar.

## Daily shutdown
1. Park spindle, retract all axes to home.
2. Inspect tools in the magazine for visible wear or chip damage.
3. Empty chip bin if more than 50 % full.
4. Wipe down sump and check coolant temperature, pH (target 8.7–9.0).

## Coolant management
- Change cycle: every 120 operating hours (about every 2 weeks at our
  current load).
- Top up between changes: keep sump within 90 % of full.
- If `coolant_temp_high` MQTT event fires, do not continue an IT7 run.
  Pause, let the system cool, and confirm pH is in band before resuming.

## Chip evacuation
- Bin capacity: 60 L.
- The auger conveyor torque sensor will trip at ~85 % of rated load and
  emit `conveyor_jam_detected`. Stop, clear chips back into the bin,
  reset.
- A `bin_full` event halts new tool engagements; you must empty the bin
  to resume.

## Tool changes
- Follow [tool-life-policy](../wiki/sources/tool-life-policy.md).
- After any chip-jam event during the day, inspect every tool used since
  the jam for visible chip damage; swap any tool that shows it.
