# Event Simulator — factory-line-sim

A standalone TypeScript service that emits MQTT-style telemetry events for
the factory line. **Does not need a real MQTT broker** — events are POSTed
to the backend's external-events HTTP API:

```
POST /api/external-events/factory-line-sim/messages/<topic>
```

The events show up immediately in the line-timeline dashboard's "latest
MQTT events" panel and are persisted by the backend.

## Setup

```bash
cd workspace/factory-line-sim/event-simulator
npm install
cp .env.example .env
# edit .env if your backend isn't on localhost:6060
```

## Run (continuous mode)

```bash
npm start
```

Emits routine events on an escalating cadence: immediately, then +10s,
+60s, +5min, +15min, +30min, +60min, and steady at 60min thereafter.
Mostly `spindle_load_warn` and `coolant_temp_high` (low values), with
the occasional `tool_change_overdue` or `ambient_temp_deviation`.

## Run an incident burst

```bash
# Bursts available: chip-jam, coolant-degradation, vision-recalibration
npm start -- --burst chip-jam
```

A burst emits a coordinated sequence of events over ~90 seconds — useful
for live demos. After the burst completes, the simulator returns to
routine mode (Ctrl+C to stop).

## Stop
Ctrl+C. The simulator's only side effect is HTTP POSTs to the backend.
