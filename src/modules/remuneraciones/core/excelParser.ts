/**
 * ============================================================================
 *  excelParser.ts  —  LECTURA DEL LIBRO DE REMUNERACIONES
 * ----------------------------------------------------------------------------
 *  Convierte un archivo Excel (ArrayBuffer) en un `PayrollBook` normalizado.
 *
 *  Este archivo NO asume que los titulos estan en una fila fija: puntua las
 *  primeras filas de la hoja y elige la que mejor se comporta como cabecera.
 *
 *  Todo el procesamiento ocurre en memoria (navegador o Node). No se envia
 *  nada a ningun servidor y no se escriben logs con datos personales.
 * ============================================================================
 */

import * as XLSX from 'xlsx';
import type {
  PayrollBook,
  PayrollConcept,
  PayrollMeta,
  PayrollWorker,
} from '../types/payroll';
import {
  IDENTITY_PATTERNS,
  TOTALS_ROW_PATTERN,
  buildConceptId,
  isIdentityLabel,
  normalizeLabel,
} from '../utils/conceptUtils';
import { toNumber } from '../utils/numberUtils';
import { extractRut, formatRut } from '../utils/rutValidator';

/** Matriz cruda de la hoja: filas de celdas. */
type Grid = unknown[][];

export interface ParseOptions {
  /** Nombre de la hoja a leer. Por defecto la primera con datos. */
  sheetName?: string;
  /** Forzar la fila de titulos (base 0), saltandose la deteccion automatica. */
  headerRowIndex?: number;
  /** Cuantas filas iniciales se inspeccionan buscando la cabecera. */
  headerSearchDepth?: number;
  /** Nombre del archivo, usado solo como metadato. */
  fileName?: string;
}

/* -------------------------------------------------------------------------- */
/*  1. ENTRADA PRINCIPAL                                                      */
/* -------------------------------------------------------------------------- */

/** Lee un ArrayBuffer de Excel y devuelve el libro normalizado. */
export function parsePayrollWorkbook(
  data: ArrayBuffer | Uint8Array,
  options: ParseOptions = {},
): PayrollBook {
  const wb = XLSX.read(data, { type: 'array', cellDates: false, cellNF: false });
  return parseWorkbookObject(wb, options);
}

/** Variante que recibe un workbook de SheetJS ya abierto (util en pruebas). */
export function parseWorkbookObject(
  wb: XLSX.WorkBook,
  options: ParseOptions = {},
): PayrollBook {
  const sheetName = options.sheetName ?? pickBestSheet(wb);
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`La hoja "${sheetName}" no existe en el archivo.`);

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  }) as Grid;

  return parseGrid(grid, { ...options, sheetName });
}

/**
 * Nucleo puro: transforma una matriz de celdas en un PayrollBook.
 * Se expone por separado para poder probarlo sin depender de SheetJS.
 */
export function parseGrid(grid: Grid, options: ParseOptions = {}): PayrollBook {
  const warnings: string[] = [];
  const depth = options.headerSearchDepth ?? 30;

  const headerRowIndex =
    options.headerRowIndex !== undefined
      ? options.headerRowIndex
      : detectHeaderRow(grid, depth);

  if (headerRowIndex < 0) {
    throw new Error(
      'No fue posible identificar la fila de titulos del libro de remuneraciones.',
    );
  }

  const headerRow = grid[headerRowIndex] ?? [];
  const meta = extractMeta(grid, headerRowIndex, options);
  meta.sheetName = options.sheetName ?? '';

  const identityColumns = detectIdentityColumns(headerRow);
  if (identityColumns.rut === null) {
    warnings.push(
      'No se detecto una columna de RUT. Los conceptos "por trabajador" no podran identificar terceros.',
    );
  }

  const dataRange = detectDataRange(grid, headerRowIndex, identityColumns);
  meta.totalsRowIndex = dataRange.totalsRowIndex;

  const concepts = buildConcepts(grid, headerRow, headerRowIndex, dataRange, identityColumns);
  const workers = buildWorkers(grid, dataRange, identityColumns, concepts);

  if (workers.length === 0) {
    warnings.push('No se detectaron filas de trabajadores bajo la fila de titulos.');
  }
  if (dataRange.totalsRowIndex === null) {
    warnings.push(
      'No se detecto fila de totales en el Excel: la validacion de cuadratura contra el libro se omitira.',
    );
  }

  const duplicated = concepts.filter((c) => c.duplicateLabel);
  if (duplicated.length > 0) {
    const labels = Array.from(new Set(duplicated.map((c) => c.label)));
    warnings.push(
      `Titulos repetidos detectados (${labels.join(', ')}). Se asigno un identificador interno unico a cada columna.`,
    );
  }

  return { meta, concepts, workers, identityColumns, warnings };
}

/* -------------------------------------------------------------------------- */
/*  2. SELECCION DE HOJA                                                      */
/* -------------------------------------------------------------------------- */

/** Elige la hoja con mayor cantidad de celdas con contenido. */
export function pickBestSheet(wb: XLSX.WorkBook): string {
  let best = wb.SheetNames[0];
  let bestScore = -1;
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet || !sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const score = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/*  3. DETECCION DE LA FILA DE TITULOS                                        */
/* -------------------------------------------------------------------------- */

/**
 * Puntua cada fila candidata y devuelve el indice de la mejor.
 *
 * Criterios:
 *  +3 por cada patron de identificacion reconocido (RUT, NOMBRES, ...)
 *  +1 por cada celda de texto no numerico distinta
 *  +N por cuantas filas siguientes contienen mayoria de numeros
 *  -X si la propia fila contiene muchos numeros (una fila de datos no es cabecera)
 */
export function detectHeaderRow(grid: Grid, depth = 30): number {
  const limit = Math.min(depth, grid.length);
  let bestIndex = -1;
  let bestScore = 0;

  for (let r = 0; r < limit; r++) {
    const row = grid[r];
    if (!row) continue;

    const cells = row.map((c) => (c === null || c === undefined ? '' : String(c).trim()));
    const nonEmpty = cells.filter((c) => c !== '');
    if (nonEmpty.length < 3) continue;

    let score = 0;

    // Textos distintos que parecen titulos.
    const textCells = nonEmpty.filter((c) => !isNumericLike(c));
    const distinct = new Set(textCells.map((c) => normalizeLabel(c)));
    score += distinct.size;

    // Numeros dentro de la propia fila: penaliza.
    const numericCells = nonEmpty.filter((c) => isNumericLike(c));
    score -= numericCells.length * 1.5;

    // Patrones de identificacion tipicos de un libro de remuneraciones.
    const normalized = cells.map((c) => normalizeLabel(c));
    for (const pattern of Object.values(IDENTITY_PATTERNS)) {
      if (normalized.some((n) => n && pattern.test(n))) score += 3;
    }

    // Las filas siguientes deben verse como datos (mayoria numerica).
    let dataRows = 0;
    for (let k = r + 1; k < Math.min(r + 6, grid.length); k++) {
      const next = grid[k];
      if (!next) continue;
      const vals = next
        .map((c) => (c === null || c === undefined ? '' : String(c).trim()))
        .filter((c) => c !== '');
      if (vals.length === 0) continue;
      const numeric = vals.filter((v) => isNumericLike(v)).length;
      if (numeric / vals.length >= 0.4) dataRows++;
    }
    score += dataRows * 2;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = r;
    }
  }

  return bestIndex;
}

function isNumericLike(value: string): boolean {
  if (value === '') return false;
  return /^-?\$?\s?[\d.,]+%?$/.test(value.trim()) && /\d/.test(value);
}

/* -------------------------------------------------------------------------- */
/*  4. METADATOS (EMPRESA / PERIODO)                                          */
/* -------------------------------------------------------------------------- */

const MONTHS: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10,
  NOVIEMBRE: 11, DICIEMBRE: 12,
};

/** Lee las filas previas a la cabecera buscando empresa, RUT y periodo. */
export function extractMeta(
  grid: Grid,
  headerRowIndex: number,
  options: ParseOptions,
): PayrollMeta {
  const lines: string[] = [];
  for (let r = 0; r < headerRowIndex; r++) {
    const row = grid[r];
    if (!row) continue;
    const text = row
      .map((c) => (c === null || c === undefined ? '' : String(c).trim()))
      .filter((c) => c !== '')
      .join(' ');
    if (text) lines.push(text);
  }
  const blob = lines.join(' | ');

  // --- Empresa ---
  let companyName = '';
  const companyMatch = blob.match(/EMPRESA\s*:?\s*([^|(]+)/i);
  if (companyMatch) companyName = companyMatch[1].trim();
  if (!companyName && lines.length > 0) {
    // Alternativa: primera linea que no sea "Libro:" ni "Periodo:".
    const candidate = lines.find(
      (l) => !/^(libro|periodo|per[ií]odo|fecha)\b/i.test(l),
    );
    if (candidate) companyName = candidate.replace(/\(.*?\)/g, '').trim();
  }
  companyName = companyName.replace(/\s+/g, ' ').replace(/[|,;]+$/, '').trim();

  // --- RUT de la empresa ---
  const companyRut = extractRut(blob);
  if (companyRut) {
    // Quita el RUT del nombre si quedo pegado.
    companyName = companyName
      .replace(/\(?\s*\d{1,3}(?:\.\d{3})*\s*-\s*[0-9kK]\s*\)?/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // --- Periodo ---
  let periodLabel = '';
  const periodMatch = blob.match(/PER[IÍ]ODO\s*:?\s*([^|]+)/i);
  if (periodMatch) periodLabel = periodMatch[1].trim();

  let periodCode = '';
  let periodEndDate = '';
  const parsed = parsePeriod(periodLabel || blob);
  if (parsed) {
    periodCode = `${parsed.year}${String(parsed.month).padStart(2, '0')}`;
    const lastDay = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
    periodEndDate = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    if (!periodLabel) periodLabel = parsed.label;
  }

  return {
    companyName,
    companyRut: companyRut ? formatRut(companyRut) : '',
    periodLabel,
    periodCode,
    periodEndDate,
    sheetName: options.sheetName ?? '',
    headerRowIndex,
    totalsRowIndex: null,
    sourceFileName: options.fileName ?? '',
  };
}

/** Interpreta "Julio 2026", "07/2026", "2026-07" o "Julio '26". */
export function parsePeriod(
  text: string,
): { year: number; month: number; label: string } | null {
  if (!text) return null;
  const upper = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  // Mes en palabra + anio de 4 o 2 digitos.
  for (const [name, month] of Object.entries(MONTHS)) {
    const re = new RegExp(`${name}\\s*(?:DE\\s*)?'?\\s*(\\d{2,4})`);
    const m = upper.match(re);
    if (m) {
      let year = Number(m[1]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      return { year, month, label: `${capitalize(name)} ${year}` };
    }
  }

  // MM/YYYY o MM-YYYY
  let m = upper.match(/\b(0?[1-9]|1[0-2])\s*[/-]\s*(20\d{2})\b/);
  if (m) return { year: Number(m[2]), month: Number(m[1]), label: `${m[1]}/${m[2]}` };

  // YYYY-MM o YYYYMM
  m = upper.match(/\b(20\d{2})\s*[-/]?\s*(0[1-9]|1[0-2])\b/);
  if (m) return { year: Number(m[1]), month: Number(m[2]), label: `${m[2]}/${m[1]}` };

  return null;
}

function capitalize(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/* -------------------------------------------------------------------------- */
/*  5. COLUMNAS DE IDENTIFICACION                                             */
/* -------------------------------------------------------------------------- */

export function detectIdentityColumns(headerRow: unknown[]): PayrollBook['identityColumns'] {
  const result: PayrollBook['identityColumns'] = {
    rut: null, code: null, lastName: null, secondLastName: null,
    firstNames: null, fullName: null, position: null, costCenter: null,
  };
  const normalized = headerRow.map((c) => normalizeLabel(c));

  for (const [key, pattern] of Object.entries(IDENTITY_PATTERNS)) {
    const idx = normalized.findIndex((n) => n !== '' && pattern.test(n));
    if (idx >= 0) (result as Record<string, number | null>)[key] = idx;
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/*  6. RANGO DE DATOS Y FILA DE TOTALES                                       */
/* -------------------------------------------------------------------------- */

interface DataRange {
  firstRow: number;
  lastRow: number; // inclusive; excluye la fila de totales
  totalsRowIndex: number | null;
}

export function detectDataRange(
  grid: Grid,
  headerRowIndex: number,
  identity: PayrollBook['identityColumns'],
): DataRange {
  const firstRow = headerRowIndex + 1;
  let lastRow = firstRow - 1;
  let totalsRowIndex: number | null = null;

  for (let r = firstRow; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const cells = row.map((c) => (c === null || c === undefined ? '' : String(c).trim()));
    if (cells.every((c) => c === '')) continue;

    const first = normalizeLabel(cells.find((c) => c !== '') ?? '');
    const isTotals =
      TOTALS_ROW_PATTERN.test(first) ||
      (identity.rut !== null &&
        cells[identity.rut] !== undefined &&
        /^TOTAL/i.test(String(cells[identity.rut] ?? '')));

    if (isTotals) {
      totalsRowIndex = r;
      break; // todo lo que viene despues es pie de pagina
    }

    // Fila valida de trabajador: tiene RUT o al menos un nombre + algun numero.
    const hasRut =
      identity.rut !== null && String(cells[identity.rut] ?? '').trim() !== '';
    const hasNumbers = cells.some((c) => c !== '' && isNumericLike(c));
    if (hasRut || hasNumbers) lastRow = r;
  }

  return { firstRow, lastRow, totalsRowIndex };
}

/* -------------------------------------------------------------------------- */
/*  7. CONSTRUCCION DE CONCEPTOS                                              */
/* -------------------------------------------------------------------------- */

function buildConcepts(
  grid: Grid,
  headerRow: unknown[],
  headerRowIndex: number,
  range: DataRange,
  identity: PayrollBook['identityColumns'],
): PayrollConcept[] {
  const identityIndexes = new Set(
    Object.values(identity).filter((v): v is number => v !== null),
  );

  // Cuenta ocurrencias por titulo normalizado para detectar duplicados.
  const occurrenceCount = new Map<string, number>();
  const totalOccurrences = new Map<string, number>();
  for (let c = 0; c < headerRow.length; c++) {
    const label = String(headerRow[c] ?? '').trim();
    if (!label) continue;
    const key = normalizeLabel(label);
    totalOccurrences.set(key, (totalOccurrences.get(key) ?? 0) + 1);
  }

  const concepts: PayrollConcept[] = [];
  const usedIds = new Set<string>();

  for (let c = 0; c < headerRow.length; c++) {
    const rawLabel = String(headerRow[c] ?? '').trim();
    if (!rawLabel) continue;
    if (identityIndexes.has(c)) continue;
    if (isIdentityLabel(rawLabel)) continue;

    const key = normalizeLabel(rawLabel);
    const occurrence = (occurrenceCount.get(key) ?? 0) + 1;
    occurrenceCount.set(key, occurrence);

    let id = buildConceptId(rawLabel, occurrence);
    // Blindaje adicional: si por cualquier motivo el id colisiona, agrega la columna.
    if (usedIds.has(id)) id = `${id}_C${c}`;
    usedIds.add(id);

    let total = 0;
    let nonZeroCount = 0;
    let numericCells = 0;
    let filledCells = 0;

    for (let r = range.firstRow; r <= range.lastRow; r++) {
      const raw = grid[r]?.[c];
      if (raw === null || raw === undefined || String(raw).trim() === '') continue;
      filledCells++;
      const n = toNumber(raw);
      if (typeof raw === 'number' || isNumericLike(String(raw).trim())) {
        numericCells++;
        total += n;
        if (n !== 0) nonZeroCount++;
      }
    }

    const excelTotal =
      range.totalsRowIndex !== null
        ? toNumber(grid[range.totalsRowIndex]?.[c] ?? null)
        : null;

    concepts.push({
      id,
      label: rawLabel,
      normalizedLabel: key,
      columnIndex: c,
      duplicateLabel: (totalOccurrences.get(key) ?? 0) > 1,
      occurrence,
      numeric: filledCells === 0 ? false : numericCells / filledCells >= 0.6,
      total,
      nonZeroCount,
      excelTotal,
    });
  }

  return concepts;
}

/* -------------------------------------------------------------------------- */
/*  8. CONSTRUCCION DE TRABAJADORES                                           */
/* -------------------------------------------------------------------------- */

function buildWorkers(
  grid: Grid,
  range: DataRange,
  identity: PayrollBook['identityColumns'],
  concepts: PayrollConcept[],
): PayrollWorker[] {
  const workers: PayrollWorker[] = [];

  for (let r = range.firstRow; r <= range.lastRow; r++) {
    const row = grid[r];
    if (!row) continue;
    const cells = row.map((c) => (c === null || c === undefined ? '' : c));
    if (cells.every((c) => String(c).trim() === '')) continue;

    const rawRut =
      identity.rut !== null ? String(cells[identity.rut] ?? '').trim() : '';
    const formattedRut = rawRut ? formatRut(rawRut) : '';

    const fullName = buildFullName(cells, identity);

    // Descarta filas sin ninguna identificacion util.
    if (!formattedRut && !fullName) continue;

    const amounts: Record<string, number> = {};
    for (const concept of concepts) {
      amounts[concept.id] = toNumber(cells[concept.columnIndex] ?? null);
    }

    workers.push({
      rowIndex: r,
      rut: formattedRut,
      rutPlain: formattedRut.replace(/[.]/g, ''),
      fullName,
      code: identity.code !== null ? String(cells[identity.code] ?? '').trim() : '',
      position:
        identity.position !== null ? String(cells[identity.position] ?? '').trim() : '',
      costCenter:
        identity.costCenter !== null
          ? String(cells[identity.costCenter] ?? '').trim()
          : '',
      amounts,
    });
  }

  return workers;
}

function buildFullName(
  cells: unknown[],
  identity: PayrollBook['identityColumns'],
): string {
  if (identity.fullName !== null) {
    const v = String(cells[identity.fullName] ?? '').trim();
    if (v) return cleanName(v);
  }
  const parts: string[] = [];
  if (identity.firstNames !== null) parts.push(String(cells[identity.firstNames] ?? '').trim());
  if (identity.lastName !== null) parts.push(String(cells[identity.lastName] ?? '').trim());
  if (identity.secondLastName !== null)
    parts.push(String(cells[identity.secondLastName] ?? '').trim());
  return cleanName(parts.filter(Boolean).join(' '));
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}
