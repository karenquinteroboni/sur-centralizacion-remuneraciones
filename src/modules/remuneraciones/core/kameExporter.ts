/**
 * ============================================================================
 *  kameExporter.ts  —  GENERACION DEL CSV DE IMPORTACION CONTABLE KAME
 * ----------------------------------------------------------------------------
 *  La estructura de este archivo esta tomada TAL CUAL del archivo de referencia
 *  "Ejemplo_importador_Contable (21).csv":
 *
 *    - 17 columnas, en el orden definido en `KAME_COLUMNS`
 *    - separador ";"
 *    - saltos de linea CRLF
 *    - codificacion ISO-8859-1
 *    - fecha con formato d/MM/yyyy (ej. 2/07/2026)
 *    - importes enteros sin separador de miles; la columna sin monto va en "0"
 *    - sin comillas de encapsulado
 *
 *  ============================  NO MODIFICAR  ==============================
 *  `KAME_COLUMNS`, `CSV_SEPARATOR`, `CSV_EOL` y `formatKameDate` definen el
 *  contrato con el ERP. Cambiarlos rompe la importacion.
 *  ==========================================================================
 */

import type {
  AccountingEntry,
  AccountingResult,
  CentralizationConfig,
  KameExportResult,
  KameRow,
  PayrollBook,
} from '../types/payroll';
import { CSV_EOL, CSV_SEPARATOR, buildCsv, slugForFileName } from '../utils/csvUtils';
import { formatKameAmount } from '../utils/numberUtils';

/* ==========================================================================
 *  CONTRATO CON KAME — NO MODIFICAR
 * ========================================================================== */

/**
 * Cabecera exacta del archivo de referencia.
 * OJO: la ultima columna lleva tilde ("Número Movimiento") en el archivo
 * original, codificada en Latin-1. Se conserva de forma literal.
 */
export const KAME_COLUMNS = [
  'TipoComprobante',
  'FolioAuto',
  'Folio',
  'Fecha',
  'Comentario',
  'Cuenta',
  'Debe',
  'Haber',
  'Comentario Linea',
  'Rut Ficha',
  'Rzn Social Ficha',
  'Nombre Doc',
  'Folio Doc',
  'Fecha Venc',
  'Unidad Negocio',
  'Tipo Movimiento',
  'Número Movimiento',
] as const;

/** Formatea una fecha ISO (YYYY-MM-DD) al formato Kame d/MM/yyyy. */
export function formatKameDate(iso: string): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, year, month, day] = m;
  return `${Number(day)}/${month}/${year}`;
}

/* ==========================================================================
 *  GENERACION
 * ========================================================================== */

export interface KameExportOptions {
  /** Sobrescribe el nombre de archivo generado automaticamente. */
  fileName?: string;
  /** Incluye la fila de cabecera. Por defecto true (como el archivo real). */
  includeHeader?: boolean;
  /** Agrega salto de linea final. Por defecto true. */
  trailingEol?: boolean;
}

/**
 * Convierte el asiento contable en el archivo de importacion de Kame.
 * Funcion pura: no toca el DOM ni descarga nada.
 */
export function generateKameCsv(
  accounting: AccountingResult,
  config: CentralizationConfig,
  book: PayrollBook,
  options: KameExportOptions = {},
): KameExportResult {
  const v = config.voucher;
  const fecha = formatKameDate(v.fecha || book.meta.periodEndDate);
  const numeroMovimiento = v.numeroMovimiento || book.meta.periodCode || '';
  const comentario = v.comentario || defaultVoucherComment(book);

  const rows: KameRow[] = accounting.entries.map((entry) =>
    buildRow(entry, {
      tipoComprobante: v.tipoComprobante,
      folioAuto: v.folioAuto,
      folio: v.folio,
      fecha,
      comentario,
      unidadNegocio: v.unidadNegocio,
      numeroMovimiento,
      tipoMovimiento: v.tipoMovimiento,
      nombreDoc: v.nombreDoc,
      folioDoc: v.folioDoc,
    }),
  );

  const content = buildCsv(
    KAME_COLUMNS as unknown as string[],
    rows.map((r) => bridgeAccentedKey({ ...r })),
    {
      separator: CSV_SEPARATOR,
      eol: CSV_EOL,
      trailingEol: options.trailingEol !== false,
    },
  );

  return {
    content,
    fileName: options.fileName ?? buildKameFileName(book, config),
    rowCount: rows.length,
    rows,
  };
}

interface VoucherContext {
  tipoComprobante: string;
  folioAuto: string;
  folio: string;
  fecha: string;
  comentario: string;
  unidadNegocio: string;
  numeroMovimiento: string;
  tipoMovimiento: string;
  nombreDoc: string;
  folioDoc: string;
}

function buildRow(entry: AccountingEntry, ctx: VoucherContext): KameRow {
  return {
    TipoComprobante: ctx.tipoComprobante,
    FolioAuto: ctx.folioAuto,
    Folio: ctx.folio,
    Fecha: ctx.fecha,
    Comentario: ctx.comentario,
    Cuenta: entry.account,
    Debe: formatKameAmount(entry.debit),
    Haber: formatKameAmount(entry.credit),
    'Comentario Linea': entry.comment,
    'Rut Ficha': entry.thirdPartyRut,
    'Rzn Social Ficha': entry.thirdPartyName,
    // Los campos analiticos los define la CUENTA (parametrizacion del
    // concepto). Lo que trae la cabecera del comprobante actua solo como
    // respaldo para las cuentas que no los parametrizan.
    'Nombre Doc': entry.documentName || ctx.nombreDoc,
    'Folio Doc': entry.documentFolio || ctx.folioDoc,
    'Fecha Venc': entry.dueDate ? formatKameDate(entry.dueDate) : '',
    'Unidad Negocio': entry.businessUnit || ctx.unidadNegocio,
    'Tipo Movimiento': ctx.tipoMovimiento,
    'Numero Movimiento': ctx.numeroMovimiento,
  };
}

/**
 * `buildCsv` lee cada fila por el nombre EXACTO de la columna. Como la clave
 * del tipo `KameRow` usa "Numero Movimiento" (sin tilde, para que el codigo sea
 * portable) y la cabecera del archivo lleva tilde, se hace el puente aqui.
 */
function bridgeAccentedKey(row: KameRow): Record<string, string> {
  const out = row as unknown as Record<string, string>;
  out['Número Movimiento'] = row['Numero Movimiento'];
  return out;
}

/** Glosa por defecto del comprobante. */
export function defaultVoucherComment(book: PayrollBook): string {
  const period = book.meta.periodLabel || book.meta.periodCode;
  return `CENTRALIZACION REMUNERACIONES ${period}`.toUpperCase().trim();
}

/**
 * Nombre del archivo exigido por el requerimiento:
 *   Centralizacion_Remuneraciones_[EMPRESA]_[PERIODO].csv
 * Ejemplo: Centralizacion_Remuneraciones_Jose_Herrera_Julio_2026.csv
 */
export function buildKameFileName(
  book: PayrollBook,
  config?: CentralizationConfig,
): string {
  const company = slugForFileName(
    config?.companyName || book.meta.companyName || 'EMPRESA',
  );
  const period = slugForFileName(
    book.meta.periodLabel || book.meta.periodCode || 'PERIODO',
  );
  return `Centralizacion_Remuneraciones_${company}_${period}.csv`;
}

/* ==========================================================================
 *  UTILIDAD DE VERIFICACION
 * ========================================================================== */

/**
 * Comprueba que un CSV generado respeta la estructura de Kame.
 * Se usa en las pruebas y puede usarse como "self check" antes de descargar.
 */
export function verifyKameStructure(content: string): {
  ok: boolean;
  problems: string[];
  columnCount: number;
  rowCount: number;
} {
  const problems: string[] = [];
  const lines = content.split(CSV_EOL).filter((l) => l !== '');

  if (lines.length === 0) {
    return { ok: false, problems: ['El archivo esta vacio.'], columnCount: 0, rowCount: 0 };
  }

  const header = lines[0].split(CSV_SEPARATOR);
  if (header.length !== KAME_COLUMNS.length) {
    problems.push(
      `La cabecera tiene ${header.length} columnas y deben ser ${KAME_COLUMNS.length}.`,
    );
  }
  KAME_COLUMNS.forEach((expected, i) => {
    if (header[i] !== expected) {
      problems.push(`Columna ${i + 1}: se esperaba "${expected}" y se encontro "${header[i]}".`);
    }
  });

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(CSV_SEPARATOR);
    if (cells.length !== KAME_COLUMNS.length) {
      problems.push(`Fila ${i + 1}: tiene ${cells.length} campos y deben ser ${KAME_COLUMNS.length}.`);
    }
    const debe = cells[6];
    const haber = cells[7];
    if (!/^-?\d+$/.test(debe ?? '')) problems.push(`Fila ${i + 1}: "Debe" no es un entero ("${debe}").`);
    if (!/^-?\d+$/.test(haber ?? '')) problems.push(`Fila ${i + 1}: "Haber" no es un entero ("${haber}").`);
    if (debe !== '0' && haber !== '0') {
      problems.push(`Fila ${i + 1}: tiene monto en Debe y en Haber simultaneamente.`);
    }
    if (!/^\d{1,2}\/\d{2}\/\d{4}$/.test(cells[3] ?? '')) {
      problems.push(`Fila ${i + 1}: fecha "${cells[3]}" no cumple el formato d/MM/yyyy.`);
    }
    // "Fecha Venc" es opcional, pero si viene debe usar el mismo formato.
    const venc = cells[13] ?? '';
    if (venc !== '' && !/^\d{1,2}\/\d{2}\/\d{4}$/.test(venc)) {
      problems.push(
        `Fila ${i + 1}: fecha de vencimiento "${venc}" no cumple el formato d/MM/yyyy.`,
      );
    }
    if (!(cells[5] ?? '').trim()) {
      problems.push(`Fila ${i + 1}: la columna "Cuenta" esta vacia.`);
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    columnCount: header.length,
    rowCount: lines.length - 1,
  };
}
