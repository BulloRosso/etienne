import { Injectable } from '@nestjs/common';
import { XlsxCellRecord } from '../ingestion/xlsx-markdown';
import { CanonicalUnit, NormalizedUnit, detectUnitInLabel, normalizeUnit } from './units';

/**
 * Deterministic figure index over the quantity workbook: every numeric cell
 * becomes a `Figure` with a canonical unit, a human label built from its
 * row/column headers and a stable id (`Sheet!B3`). The consistency check
 * matches tender quantities against this index; nothing here calls an LLM.
 */

export type FigureKind = 'amount' | 'area' | 'count' | 'duration' | 'percent' | 'year' | 'other';

export interface Figure {
  id: string; // "Budget!C4"
  sheet: string;
  cell: string;
  row: number;
  col: string;
  value: number; // canonical unit
  rawValue: number;
  unit: CanonicalUnit;
  unitSource: 'header' | 'adjacent' | 'numFmt' | 'rowLabel' | 'none';
  per?: CanonicalUnit;
  label: string; // "Budget › Reinigung › Jahresbudget (€)"
  rawText: string;
  kind: FigureKind;
}

const DURATION_UNITS = new Set<CanonicalUnit>(['hour', 'minute', 'second', 'day', 'month', 'year']);

function kindFor(unit: CanonicalUnit): FigureKind {
  if (unit === 'EUR') return 'amount';
  if (unit === 'm2') return 'area';
  if (unit === 'percent') return 'percent';
  if (unit === 'count' || unit === 'unknown') return 'count';
  if (DURATION_UNITS.has(unit)) return 'duration';
  return 'other';
}

export function buildFigureIndex(cells: XlsxCellRecord[]): Figure[] {
  const bySheetRow = new Map<string, XlsxCellRecord[]>();
  for (const cell of cells) {
    const key = `${cell.sheet}#${cell.row}`;
    const list = bySheetRow.get(key) ?? [];
    list.push(cell);
    bySheetRow.set(key, list);
  }

  const figures: Figure[] = [];
  for (const cell of cells) {
    if (cell.type === 'date' || cell.type === 'bool' || cell.type === 'empty') continue;
    if (typeof cell.value !== 'number') continue;
    const rawValue = cell.value;

    let unit: NormalizedUnit | null = null;
    let unitSource: Figure['unitSource'] = 'none';
    let value = rawValue;

    if (cell.numFmt && cell.numFmt.includes('%')) {
      unit = { unit: 'percent', factor: 1 };
      unitSource = 'numFmt';
      value = rawValue * 100;
    } else {
      const fromHeader = detectUnitInLabel(cell.colHeader);
      const neighbours = bySheetRow.get(`${cell.sheet}#${cell.row}`) ?? [];
      const right = neighbours.find(
        (candidate) => candidate.colIndex === cell.colIndex + 1 && candidate.type === 'string',
      );
      const adjacent = right ? normalizeUnit(right.text) : null;
      // an explicit unit cell ("Stück", "Positionen/Tag") beats a generic count header ("Anzahl")
      if (fromHeader && !(fromHeader.unit === 'count' && adjacent && adjacent.unit !== 'unknown')) {
        unit = fromHeader;
        unitSource = 'header';
      } else {
        if (adjacent && adjacent.unit !== 'unknown') {
          unit = adjacent;
          unitSource = 'adjacent';
        } else if (cell.numFmt && /€|EUR/i.test(cell.numFmt)) {
          unit = { unit: 'EUR', factor: 1 };
          unitSource = 'numFmt';
        } else {
          const fromRow = detectUnitInLabel(cell.rowHeader);
          if (fromRow) {
            unit = fromRow;
            unitSource = 'rowLabel';
          }
        }
      }
      if (unit) value = rawValue * unit.factor;
    }

    const labelParts = [cell.sheet, cell.rowHeader, cell.colHeader].filter(
      (part): part is string => typeof part === 'string' && part.trim().length > 0,
    );
    const labelText = `${cell.colHeader ?? ''} ${cell.rowHeader ?? ''}`;
    // a calendar year ("Jahr: 2027") is a label, not a quantity — never compared, never alerted
    const isYear =
      Number.isInteger(rawValue) &&
      rawValue >= 1900 &&
      rawValue <= 2100 &&
      (unit === null || unit.unit === 'unknown' || unit.unit === 'year') &&
      /jahr|year|datum|date|stand/i.test(labelText);
    const canonical = isYear ? 'unknown' : (unit?.unit ?? 'unknown');
    if (isYear) {
      value = rawValue;
      unitSource = 'none';
    }

    figures.push({
      id: `${cell.sheet}!${cell.address}`,
      sheet: cell.sheet,
      cell: cell.address,
      row: cell.row,
      col: cell.col,
      value,
      rawValue,
      unit: canonical,
      unitSource,
      per: unit?.per,
      label: labelParts.join(' › '),
      rawText: cell.text,
      kind: isYear ? 'year' : kindFor(canonical),
    });
  }
  return figures;
}

@Injectable()
export class ExcelFigureService {
  buildIndex(cells: XlsxCellRecord[]): Figure[] {
    return buildFigureIndex(cells);
  }
}
