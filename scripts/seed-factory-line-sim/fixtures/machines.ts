/**
 * The 3 machines on the line. Single source of truth — referenced by:
 *   - status JSONs (machine_id field)
 *   - production order routings
 *   - dashboard machines.json
 *   - quality reports (machine_id column)
 *   - MQTT event payloads
 *   - wiki machine pages
 *
 * Region/cell labels feed the dashboard's existing region/plant drilldown
 * (the schema field names are reused — we just relabel UI strings).
 */

export interface MachineDef {
  /** Wire ID, used in all data files. */
  id: string;
  /** Display name. */
  name: string;
  /** Display location (Cell A/B/C — plays the "country" slot in the dashboard). */
  cell: string;
  /** Region (always "Plant 2" — single value, but the dashboard supports the dimension). */
  region: string;
  /** Sequence in the line (1-based). */
  sequence: number;
  /** Process steps this machine performs (the dashboard's "operation" / IPC slot). */
  steps: string[];
  /** One-line description, used in wiki + dashboard tooltips. */
  description: string;
  /** Image filename under linedashboard/images/. */
  image: string;
}

export const MACHINES: MachineDef[] = [
  {
    id: 'CNC-5AX',
    name: '5-Axis CNC Mill',
    cell: 'Cell A',
    region: 'Plant 2',
    sequence: 1,
    steps: ['MILL-5AX', 'BORE-PREC'],
    description:
      '5-axis machining centre. Roughs and finishes the part from raw bar stock. ' +
      'Coolant-cooled; chips evacuated via auger to a 60 L bin behind the conveyor.',
    image: 'cnc-5ax.png',
  },
  {
    id: 'DEBURR-HAND',
    name: 'Manual Deburring Station',
    cell: 'Cell B',
    region: 'Plant 2',
    sequence: 2,
    steps: ['DEBURR-MAN'],
    description:
      'Operator-paced deburring with rotary tools and hand files. ' +
      'Removes sharp edges left by 5-axis milling; throughput depends on operator skill.',
    image: 'deburr-hand.png',
  },
  {
    id: 'QA-INSP',
    name: '3D Vision Inspection',
    cell: 'Cell C',
    region: 'Plant 2',
    sequence: 3,
    steps: ['INSP-3D', 'INSP-SURF'],
    description:
      'Automated 3D vision inspection. Measures critical dimensions and surface ' +
      'finish; emits pass/fail with defect codes. Calibration drifts after ~1000 cycles.',
    image: 'qa-insp.png',
  },
];

export const MACHINE_BY_ID = new Map(MACHINES.map((m) => [m.id, m]));
