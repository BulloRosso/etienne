/**
 * The customer's quantity workbook ("Mengengerüst") — the raw figures that
 * also appear in the Word documents. Rendered by lib/xlsx-writer.ts.
 *
 * TWO deliberate contradictions, in different sheets and units so the demo
 * shows the check is not a one-trick match:
 *   - Mengen!B2  Palettenstellplätze  12.000 here vs. 12.400 in the text
 *   - KPIs!B4    Wareneingangsbuchung  6 Std. here vs. 4 Stunden in the text
 * Everything else matches — notably the budget, written as 1.450.000 € here
 * and "1,45 Mio. €" in the text: the check must NOT alert on that.
 */

export interface WorkbookSheetFixture {
  name: string;
  header: string[];
  rows: Array<Array<string | number | null>>;
  /** column letters that hold money (formatted with a € number format) */
  moneyColumns?: string[];
}

export const WORKBOOK_FILE_NAME = 'Mengengeruest.xlsx';

export const WORKBOOK_SHEETS: WorkbookSheetFixture[] = [
  {
    name: 'Flächen',
    header: ['Bereich', 'Fläche (m²)', 'Bemerkung'],
    rows: [
      ['Hallenfläche gesamt', 18500, 'Hochregal + Blocklager'],
      ['Kühlzone 2–8 °C', 1200, 'temperaturgeführt, Teil der Hallenfläche'],
      ['Bürofläche', 450, 'Verwaltung, nicht Teil der Leistung'],
    ],
  },
  {
    name: 'Mengen',
    header: ['Position', 'Anzahl', 'Einheit', 'Bemerkung'],
    rows: [
      ['Palettenstellplätze', 12000, 'Stück', 'Hochregal 9.200 + Blocklager 2.800'],
      ['Pickpositionen (Durchschnitt)', 2300, 'Positionen/Tag', ''],
      ['Pickpositionen (Spitze Nov/Dez)', 3800, 'Positionen/Tag', ''],
      ['Aktive Artikel', 9500, 'Stück', 'Stand 08/2026'],
      ['Mitarbeitende', 62, 'Personen', 'Übergang nach § 613a BGB'],
    ],
  },
  {
    name: 'Budget',
    header: ['Position', 'Jahresbudget (€)', 'Jahr'],
    rows: [
      ['Lagerbetrieb gesamt (netto)', 1450000, 2027],
      ['Haftungsobergrenze Bestandsdifferenzen', 250000, 2027],
      ['Deckungssumme Lagerhaftpflicht', 5000000, 2027],
    ],
    moneyColumns: ['B'],
  },
  {
    name: 'KPIs',
    header: ['Kennzahl', 'Zielwert', 'Einheit'],
    rows: [
      ['Inventurgenauigkeit (mindestens)', 99.5, '%'],
      ['Kommissionierfehlerquote (höchstens)', 0.3, '%'],
      ['Wareneingangsbuchung nach Entladung', 6, 'Std.'],
      ['Buchung Bestandsbewegung', 15, 'Min.'],
      ['Störungsmeldung an Auftraggeber', 2, 'Std.'],
      ['Vertragslaufzeit', 48, 'Monate'],
      ['Einweisung Personal', 3, 'Tage'],
    ],
  },
];

/** The expected contradictions (dry-run + integration test assert on these). */
export const EXPECTED_CONTRADICTIONS = [
  {
    sheet: 'Mengen',
    cell: 'B2',
    label: 'Palettenstellplätze',
    tenderValue: 12400,
    excelValue: 12000,
    unit: 'Stück',
  },
  {
    // header row is 1, so the third data row sits in B4 (verified by reading
    // the rendered workbook back, not by counting the fixture array)
    sheet: 'KPIs',
    cell: 'B4',
    label: 'Wareneingangsbuchung nach Entladung',
    tenderValue: 4,
    excelValue: 6,
    unit: 'Std.',
  },
] as const;

/** Back-compat alias for callers that only need the first one. */
export const EXPECTED_CONTRADICTION = EXPECTED_CONTRADICTIONS[0];
