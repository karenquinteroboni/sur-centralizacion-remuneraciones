/**
 * ============================================================================
 *  bukAdapter.ts  —  LIQUIDACIONES DE BUK  ->  PayrollBook
 * ----------------------------------------------------------------------------
 *  Convierte la respuesta de `payroll_detail/month` (+ `employees`) en el mismo
 *  `PayrollBook` que produce el lector de Excel, de modo que el resto del
 *  modulo (analisis, configuracion, asiento, validacion, CSV Kame) no cambia.
 *
 *  Decisiones:
 *   - Un concepto = (tipo, nombre). Lineas repetidas del mismo concepto en un
 *     trabajador (ej. dos "Credito Personal Caja Los Andes") se SUMAN.
 *   - Las lineas `informativo` (provisiones de vacaciones) no se contabilizan
 *     y se omiten por defecto.
 *   - El liquido se toma de `income_net` y se agrega como concepto NETO.
 *   - Lineas de tipo `sobregiro` (verificado en datos reales): son la parte de
 *     los descuentos que Buk NO alcanzo a retener porque superaba el sueldo.
 *     Se cumple haberes - descuentos + sobregiro = liquido. Se clasifican como
 *     HABER (generan DEBE: el trabajador queda debiendo) y su cuenta contable
 *     debe ser confirmada por el usuario. Se distinguen por etiqueta de la
 *     linea `descuento` homonima (recuperacion de un sobregiro de meses previos).
 *   - Un tipo de linea desconocido NUNCA se descarta: pasa como concepto sin
 *     clasificar (queda pendiente de parametrizar) y se avisa.
 *   - Una liquidacion con `closed=false` es borrador: se rechaza.
 *   - Sin PII en mensajes de aviso (solo conteos y montos agregados).
 *   - La API no entrega fila de totales: `excelTotal` queda en null y la
 *     validacion contra el libro se omite.
 * ============================================================================
 */

import type {
  ConceptClassification,
  PayrollBook,
  PayrollConcept,
  PayrollWorker,
} from '../../types/payroll';
import { buildConceptId, normalizeLabel } from '../../utils/conceptUtils';
import { formatRut } from '../../utils/rutValidator';
import type { BukEmployee, BukPayrollRecord } from './bukTypes';

export interface BukAdapterInput {
  payroll: BukPayrollRecord[];
  employees: BukEmployee[];
  company: { name: string; rut: string };
  /** AAAAMM o AAAA-MM. */
  period: string;
  /** Acepta liquidaciones no cerradas (borrador). Por defecto false. */
  allowOpen?: boolean;
  /** Incluye lineas `informativo`. Por defecto false. */
  includeInformative?: boolean;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const TYPE_TO_CLASSIFICATION: Record<string, ConceptClassification> = {
  haber: 'HABER',
  descuento: 'DESCUENTO',
  aporte: 'APORTE_EMPLEADOR',
  informativo: 'INFORMATIVO',
  sobregiro: 'HABER',
};
const TYPE_ORDER = ['haber', 'sobregiro', 'descuento', 'aporte', 'informativo'];
const SOBREGIRO_SUFFIX = ' (sobregiro del mes)';

const NET_LABEL = 'Liquido a Pagar';

/** Normaliza "2026-08" / "202608" a { year, month }. Lanza si es invalido. */
export function parseBukPeriod(period: string): { year: number; month: number } {
  const m = /^(\d{4})-?(0[1-9]|1[0-2])$/.exec(period.trim());
  if (!m) throw new Error(`Periodo invalido "${period}". Use AAAAMM o AAAA-MM.`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** Ultimo dia del mes en ISO (AAAA-MM-DD): el unico formato de fecha que Buk respeta. */
export function periodEndIso(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export function buildPayrollBookFromBuk(input: BukAdapterInput): PayrollBook {
  const { year, month } = parseBukPeriod(input.period);
  const warnings: string[] = [];
  const includeInfo = input.includeInformative ?? false;

  if (input.payroll.length === 0) {
    throw new Error('Buk no devolvio liquidaciones para el periodo solicitado.');
  }

  // --- Salvaguardas de periodo y estado ------------------------------------
  const wrongPeriod = input.payroll.filter((p) => p.year !== year || p.month !== month);
  if (wrongPeriod.length > 0) {
    throw new Error(
      `Buk devolvio ${wrongPeriod.length} liquidacion(es) de un periodo distinto al solicitado ` +
        `(${month}/${year}). No se centraliza para evitar contabilizar el mes equivocado.`,
    );
  }
  const open = input.payroll.filter((p) => !p.closed);
  if (open.length > 0 && !input.allowOpen) {
    throw new Error(
      `${open.length} de ${input.payroll.length} liquidaciones del periodo no estan cerradas en Buk ` +
        `(borrador). Cierre el mes en Buk antes de centralizar.`,
    );
  }
  if (open.length > 0) {
    warnings.push(`${open.length} liquidacion(es) NO estan cerradas en Buk: los montos pueden cambiar.`);
  }
  const ids = new Set(input.payroll.map((p) => p.liquidacion_id));
  if (ids.size !== input.payroll.length) {
    throw new Error('Buk devolvio liquidaciones duplicadas (paginacion inconsistente). Reintente.');
  }

  // --- Conceptos -----------------------------------------------------------
  interface Acc { type: string; label: string; first: number }
  const registry = new Map<string, Acc>();
  let seq = 0;
  const unknownTypes = new Set<string>();
  for (const rec of input.payroll) {
    for (const line of rec.lines_settlement) {
      if (line.type === 'informativo' && !includeInfo) continue;
      if (!(line.type in TYPE_TO_CLASSIFICATION)) unknownTypes.add(line.type);
      const key = `${line.type}|${normalizeLabel(line.name)}`;
      if (!registry.has(key)) {
        const base = line.name.trim();
        registry.set(key, {
          type: line.type,
          label: line.type === 'sobregiro' ? base + SOBREGIRO_SUFFIX : base,
          first: seq++,
        });
      }
    }
  }
  const rank = (t: string) => {
    const i = TYPE_ORDER.indexOf(t);
    return i < 0 ? TYPE_ORDER.length : i;
  };
  const ordered = [...registry.entries()].sort(
    (a, b) => rank(a[1].type) - rank(b[1].type) || a[1].first - b[1].first,
  );
  if (unknownTypes.size > 0) {
    warnings.push(
      `Buk informo tipos de linea no reconocidos (${[...unknownTypes].join(', ')}). ` +
        `Se incluyen como conceptos SIN clasificar: parametricelos antes de exportar.`,
    );
  }

  const concepts: PayrollConcept[] = [];
  const idByKey = new Map<string, string>();
  const occurrences = new Map<string, number>();
  const pushConcept = (key: string, label: string, cls: ConceptClassification | undefined) => {
    const norm = normalizeLabel(label);
    const occ = (occurrences.get(norm) ?? 0) + 1;
    occurrences.set(norm, occ);
    const id = buildConceptId(label, occ);
    idByKey.set(key, id);
    concepts.push({
      id,
      label,
      normalizedLabel: norm,
      columnIndex: concepts.length,
      duplicateLabel: false,
      occurrence: occ,
      numeric: true,
      total: 0,
      nonZeroCount: 0,
      excelTotal: null,
      ...(cls ? { sourceClassification: cls } : {}),
    });
  };
  for (const [key, acc] of ordered) pushConcept(key, acc.label, TYPE_TO_CLASSIFICATION[acc.type]);  // undefined si el tipo es desconocido
  const NET_KEY = '__net__';
  pushConcept(NET_KEY, NET_LABEL, 'NETO');
  for (const c of concepts) c.duplicateLabel = (occurrences.get(c.normalizedLabel) ?? 0) > 1;
  const conceptById = new Map(concepts.map((c) => [c.id, c]));

  // --- Fichas de empleados ---------------------------------------------------
  const empByRut = new Map<string, BukEmployee>();
  for (const e of input.employees) empByRut.set(plain(e.rut), e);

  // --- Trabajadores ----------------------------------------------------------
  const workers: PayrollWorker[] = [];
  let missingEmployee = 0;
  let grossMismatch = 0;
  let netMismatch = 0;
  let netGap = 0;
  let sobregiroCount = 0;
  let sobregiroTotal = 0;

  input.payroll.forEach((rec, idx) => {
    const amounts: Record<string, number> = {};
    for (const c of concepts) amounts[c.id] = 0;
    const sums: Record<string, number> = {};

    for (const line of rec.lines_settlement) {
      sums[line.type] = (sums[line.type] ?? 0) + line.amount;
      if (line.type === 'informativo' && !includeInfo) continue;
      const id = idByKey.get(`${line.type}|${normalizeLabel(line.name)}`);
      if (id) amounts[id] += line.amount;
    }
    amounts[idByKey.get(NET_KEY)!] = rec.income_net;

    if (Math.abs((sums.haber ?? 0) - rec.income_gross) > 1) grossMismatch++;
    if ((sums.sobregiro ?? 0) !== 0) {
      sobregiroCount++;
      sobregiroTotal += sums.sobregiro;
    }
    const diff =
      (sums.haber ?? 0) - (sums.descuento ?? 0) + (sums.sobregiro ?? 0) - rec.income_net;
    if (Math.abs(diff) > 1) {
      netMismatch++;
      netGap += diff;
    }

    const emp = empByRut.get(plain(rec.rut));
    if (!emp) missingEmployee++;
    const rut = formatRut(rec.rut);
    workers.push({
      rowIndex: idx,
      rut,
      rutPlain: rut.replace(/[.]/g, ''),
      fullName: (emp?.full_name ?? '').replace(/\s+/g, ' ').trim(),
      code: emp?.code_sheet ? String(emp.code_sheet).trim() : '',
      position: emp?.current_job?.role?.name?.trim() ?? '',
      costCenter: emp?.current_job?.cost_center?.trim() ?? '',
      amounts,
    });

    for (const [cid, v] of Object.entries(amounts)) {
      const c = conceptById.get(cid)!;
      c.total += v;
      if (v !== 0) c.nonZeroCount++;
    }
  });

  if (missingEmployee > 0) {
    warnings.push(
      `${missingEmployee} trabajador(es) sin ficha en Buk /employees: quedan sin nombre, cargo ni centro de costo.`,
    );
  }
  if (grossMismatch > 0) {
    warnings.push(`${grossMismatch} liquidacion(es) donde la suma de haberes no coincide con el bruto informado por Buk.`);
  }
  if (sobregiroCount > 0) {
    warnings.push(
      `${sobregiroCount} liquidacion(es) con sobregiro por $${Math.round(sobregiroTotal).toLocaleString('es-CL')}: ` +
        `los descuentos superaron el sueldo y Buk no alcanzo a retenerlos. Se registra como DEBE ` +
        `(trabajador queda debiendo); confirme la cuenta contable de "sobregiro del mes".`,
    );
  }
  if (netMismatch > 0) {
    warnings.push(
      `${netMismatch} liquidacion(es) donde haberes - descuentos (+ sobregiro) no es igual al liquido de Buk ` +
        `(diferencia total $${Math.round(netGap).toLocaleString('es-CL')}). Revise esas liquidaciones en Buk: ` +
        `el asiento quedara descuadrado por ese monto.`,
    );
  }
  warnings.push(
    'Fuente Buk: la API no entrega fila de totales; se omite la validacion de cuadratura contra el libro.',
  );

  return {
    meta: {
      companyName: input.company.name,
      companyRut: input.company.rut ? formatRut(input.company.rut) : '',
      periodLabel: `${MONTH_NAMES[month - 1]} ${year}`,
      periodCode: `${year}${String(month).padStart(2, '0')}`,
      periodEndDate: periodEndIso(year, month),
      sheetName: 'Buk API',
      headerRowIndex: 0,
      totalsRowIndex: null,
      sourceFileName: `buk:${year}${String(month).padStart(2, '0')}`,
    },
    concepts,
    workers,
    identityColumns: {
      rut: null, code: null, lastName: null, secondLastName: null,
      firstNames: null, fullName: null, position: null, costCenter: null,
    },
    warnings,
  };
}

function plain(rut: string | null | undefined): string {
  return String(rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
}
