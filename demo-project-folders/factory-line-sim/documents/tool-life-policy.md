# Tool Life Policy

## Family limits
| Tool family | Cycles | Material override |
|---|---|---|
| End mill, 3-flute carbide | 1000 | Al: 850 / Steel: 700 |
| Boring bar, precision | 600 | — |
| Face mill | 1500 | Steel: 1300 |
| Drill (twist, 6 mm) | 800 | — |

## Cycle counter
The CNC controller logs cycles per tool slot. `tool_change_overdue`
MQTT event fires at 100 % of the family limit.

For tight-tolerance (IT7) orders: swap at **90 %** of the limit, not
100 %. The last 10 % of life is where dimensional drift accelerates.

## Mid-run swap
If you swap mid-run because of an alarm or visible damage:
1. Note in the day's status JSON: `tool_changes` += 1, with note.
2. Inspect the parts produced since the *last* swap for damage signs;
   route any suspect parts to QA-INSP for 100 % inspection.
