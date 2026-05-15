# QA-INSP — Vision System Calibration Procedure

## When to recalibrate
- Every 1000 inspection cycles (logged in QA-INSP daily counter).
- Whenever `camera_focus_drift` MQTT event fires.
- After any move of the inspection cell.

## Procedure (15 min)
1. Mount the calibration plate (KEYENCE master block, p/n MB-035) in the
   nominal part position.
2. Run program `CAL-9000`. The system captures 5 reference images and
   computes a focus score.
3. If focus score < 5.0, accept; > 5.0 indicates focus drift — physically
   adjust the lens per machine label, repeat.
4. If lighting non-uniformity > 8 %, run `CAL-9001` to re-balance the
   ring light.
5. Log calibration in the QA-INSP shift log; reset the cycle counter.

## Symptoms of overdue calibration
- Sudden spike in reject rate on QA-INSP **without any upstream signal**
  (no MQTT alarms, CNC-5AX status clean, coolant fine).
- Defects of *all the same type* with similar measurement jitter (this
  is the camera's noise, not the part's variation).

If you see this pattern, recalibrate before assuming an upstream root
cause.
