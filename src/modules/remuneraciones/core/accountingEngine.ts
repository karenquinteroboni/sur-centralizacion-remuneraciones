/**
 * ============================================================================
 *  accountingEngine.ts  —  MOTOR CONTABLE
 * ----------------------------------------------------------------------------
 *  Funcion pura y central del modulo:
 *
 *      generateAccountingEntries(payrollData, conceptConfiguration)
 *
 *  Recibe el libro leido + la parametrizacion y devuelve movimientos contables
 *  normalizados. NO conoce React, NO conoce Kame, NO conoce el DOM.
 *  Es 100% testeable sin renderizar interfaz.
 *
 *  REGLAS DE NATURALEZA
 *  --------------------
 *    HABER (remuneracion)  -> DEBE   (gasto de la empresa)
 *    DESCUENTO             -> HABER  (pasivo con la institucion)
 *    NETO / liquido        -> HABER  (sueldos por pagar)
 *    APORTE_EMPLEADOR      -> DEBE en cuenta de gasto
 *                             HABER en cuenta de obligacion (mismo monto)
 *    TOTALIZADOR           -> no genera movimiento
 *    INFORMATIVO           -> no genera movimiento
 *
 *  Un monto negativo invierte la naturaleza natural del concepto, de modo que
 *  todas las lineas quedan con importes positivos (requisito de Kame).
 * ============================================================================
 */

import type {
  AccountingEntry,
  AccountingResult,
  CentralizationConfig,
  ConceptClassification,
  ConceptConfig,
  EntryNature,
  PayrollBook,
  PayrollConcept,
  PayrollWorker,
} from '../types/payroll';
import { toCLP } from '../utils/numberUtils';
import {
  resolveKameFieldValues,
  resolveKameFields,
  type ResolvedKameFields,
} from './kameFields';

export interface GenerateOptions {
  /** Unidad de negocio por defecto cuando el concepto no define una. */
  defaultBusinessUnit?: string;
  /**
   * Omite las lineas cuyo monto redondeado sea 0.
   * Por defecto true: Kame rechaza lineas en cero y ensucian el asiento.
   */
  skipZeroAmounts?: boolean;
  /** Ordena las lineas: primero los DEBE, luego los HABER. */
  sortEntries?: boolean;
}

/** Naturaleza contable "natural" de cada clasificacion. */
export const NATURAL_NATURE: Record<ConceptClassification, EntryNature | null> = {
  HABER: 'DEBE',
  DESCUENTO: 'HABER',
  APORTE_EMPLEADOR: 'DEBE', // ademas genera la contrapartida en HABER
  NETO: 'HABER',
  TOTALIZADOR: null,
  INFORMATIVO: null,
};

/* -------------------------------------------------------------------------- */
/*  FUNCION PRINCIPAL                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Genera el asiento contable normalizado.
 *
 * @param payrollData    Libro de remuneraciones leido y normalizado.
 * @param configuration  Configuracion de la empresa (cuentas, clasificaciones).
 */
export function generateAccountingEntries(
  payrollData: PayrollBook,
  configuration: CentralizationConfig,
  options: GenerateOptions = {},
): AccountingResult {
  const defaultBU = options.defaultBusinessUnit ?? configuration.voucher.unidadNegocio ?? '';
  const skipZero = options.skipZeroAmounts ?? true;

  const entries: AccountingEntry[] = [];
  const skipped: AccountingResult['skippedConcepts'] = [];
  const conceptsById = new Map(payrollData.concepts.map((c) => [c.id, c]));

  let sequence = 0;
  const nextId = () => `L${String(++sequence).padStart(4, '0')}`;

  // Se recorre en el orden de las columnas del Excel: el asiento resultante
  // sigue la misma logica de lectura que el libro original.
  const ordered = [...payrollData.concepts].sort((a, b) => a.columnIndex - b.columnIndex);

  for (const concept of ordered) {
    const config = configuration.concepts[concept.id];
    if (!config || !config.include) continue;

    const classification = config.classification;
    if (!classification) {
      skipped.push({
        conceptId: concept.id,
        label: concept.label,
        reason: 'Sin clasificacion contable definida.',
      });
      continue;
    }

    if (classification === 'TOTALIZADOR' || classification === 'INFORMATIVO') {
      skipped.push({
        conceptId: concept.id,
        label: concept.label,
        reason: `Clasificado como ${classification}: por definicion no genera movimiento.`,
      });
      continue;
    }

    const businessUnit = config.businessUnit?.trim() || defaultBU;
    const lines = buildLinesForConcept(
      concept,
      config,
      classification,
      payrollData,
      businessUnit,
      skipZero,
      nextId,
    );

    if (lines.length === 0) {
      skipped.push({
        conceptId: concept.id,
        label: concept.label,
        reason: 'El concepto no tiene montos distintos de cero en este periodo.',
      });
      continue;
    }

    entries.push(...lines);
  }

  if (options.sortEntries !== false) {
    entries.sort((a, b) => {
      if (a.nature !== b.nature) return a.nature === 'DEBE' ? -1 : 1;
      if (a.account !== b.account) return a.account.localeCompare(b.account);
      return a.id.localeCompare(b.id);
    });
  }

  return summarize(entries, skipped);
}

/* -------------------------------------------------------------------------- */
/*  CONSTRUCCION DE LINEAS POR CONCEPTO                                       */
/* -------------------------------------------------------------------------- */

function buildLinesForConcept(
  concept: PayrollConcept,
  config: ConceptConfig,
  classification: ConceptClassification,
  book: PayrollBook,
  businessUnit: string,
  skipZero: boolean,
  nextId: () => string,
): AccountingEntry[] {
  const out: AccountingEntry[] = [];
  const rules = config.rules ?? {};
  const factor = rules.factor ?? 1;
  const minAmount = rules.minAmount ?? 0;

  /** Aplica reglas especiales a un monto crudo. */
  const applyRules = (raw: number): number => {
    let amount = raw * factor;
    if (rules.ignoreNegative && amount < 0) amount = 0;
    if (Math.abs(amount) < minAmount) amount = 0;
    return toCLP(amount);
  };

  /** Resuelve la naturaleza final considerando el signo y `invertNature`. */
  const resolveNature = (base: EntryNature, amount: number): EntryNature => {
    let nature = base;
    if (rules.invertNature) nature = nature === 'DEBE' ? 'HABER' : 'DEBE';
    if (amount < 0) nature = nature === 'DEBE' ? 'HABER' : 'DEBE';
    return nature;
  };

  const baseComment = (config.lineComment?.trim() || concept.label).trim();

  // Campos analiticos que exige la cuenta en Kame. Se resuelven POR LINEA,
  // porque la ficha puede venir del trabajador de esa linea.
  const kameFields = resolveKameFields(config);
  const fieldsFor = (worker?: PayrollWorker | null) =>
    resolveKameFieldValues(kameFields, book.meta, worker);

  /* --- APORTE_EMPLEADOR: doble linea (gasto + obligacion) ----------------- */
  if (classification === 'APORTE_EMPLEADOR') {
    const expenseAccount = (config.expenseAccount?.trim() || config.account || '').trim();
    const liabilityAccount = (config.liabilityAccount?.trim() || '').trim();

    const push = (
      account: string,
      nature: EntryNature,
      amount: number,
      comment: string,
      worker: PayrollWorker | null,
    ) => {
      const abs = Math.abs(amount);
      if (skipZero && abs === 0) return;
      out.push(
        makeEntry(
          nextId(), concept, config, classification, account, nature,
          abs, comment, fieldsFor(worker), businessUnit,
        ),
      );
    };

    if (config.thirdPartyMode === 'PER_WORKER') {
      for (const w of book.workers) {
        const amount = applyRules(w.amounts[concept.id] ?? 0);
        if (amount === 0) continue;
        const nature = resolveNature('DEBE', amount);
        const counter: EntryNature = nature === 'DEBE' ? 'HABER' : 'DEBE';
        const comment = `${baseComment} - ${w.fullName}`.trim();
        push(expenseAccount, nature, amount, comment, w);
        push(liabilityAccount, counter, amount, comment, w);
      }
    } else {
      let total = 0;
      for (const w of book.workers) total += applyRules(w.amounts[concept.id] ?? 0);
      total = toCLP(total);
      if (total !== 0) {
        const nature = resolveNature('DEBE', total);
        const counter: EntryNature = nature === 'DEBE' ? 'HABER' : 'DEBE';
        push(expenseAccount, nature, total, baseComment, null);
        push(liabilityAccount, counter, total, baseComment, null);
      }
    }
    return out;
  }

  /* --- HABER / DESCUENTO / NETO: linea simple ----------------------------- */
  const baseNature = NATURAL_NATURE[classification];
  if (!baseNature) return out;
  const account = (config.account || '').trim();

  if (config.thirdPartyMode === 'PER_WORKER') {
    for (const w of book.workers) {
      const amount = applyRules(w.amounts[concept.id] ?? 0);
      if (skipZero && amount === 0) continue;
      const nature = resolveNature(baseNature, amount);
      const comment = `${baseComment} - ${w.fullName}`.trim();
      out.push(
        makeEntry(
          nextId(), concept, config, classification, account, nature,
          Math.abs(amount), comment, fieldsFor(w), businessUnit,
        ),
      );
    }
    return out;
  }

  // Consolidado. Ojo: se separan positivos y negativos para no compensar
  // silenciosamente movimientos de naturaleza distinta. Las reglas se aplican
  // POR TRABAJADOR (para que `minAmount` e `ignoreNegative` tengan sentido)
  // y recien despues se suman.
  let positiveTotal = 0;
  let negativeTotal = 0;
  for (const w of book.workers) {
    const amount = applyRules(w.amounts[concept.id] ?? 0);
    if (amount > 0) positiveTotal += amount;
    else if (amount < 0) negativeTotal += amount;
  }
  positiveTotal = toCLP(positiveTotal);
  negativeTotal = toCLP(negativeTotal);

  if (!(skipZero && positiveTotal === 0)) {
    const nature = resolveNature(baseNature, positiveTotal);
    out.push(
      makeEntry(
        nextId(), concept, config, classification, account, nature,
        Math.abs(positiveTotal), baseComment, fieldsFor(null), businessUnit,
      ),
    );
  }
  if (negativeTotal !== 0) {
    const nature = resolveNature(baseNature, negativeTotal);
    out.push(
      makeEntry(
        nextId(), concept, config, classification, account, nature,
        Math.abs(negativeTotal), `${baseComment} (ajuste negativo)`,
        fieldsFor(null), businessUnit,
      ),
    );
  }

  return out;
}

function makeEntry(
  id: string,
  concept: PayrollConcept,
  config: ConceptConfig,
  classification: ConceptClassification,
  account: string,
  nature: EntryNature,
  amount: number,
  comment: string,
  fields: ResolvedKameFields,
  businessUnit: string,
): AccountingEntry {
  return {
    id,
    conceptId: concept.id,
    conceptLabel: concept.label,
    account,
    nature,
    amount,
    debit: nature === 'DEBE' ? amount : 0,
    credit: nature === 'HABER' ? amount : 0,
    comment,
    thirdPartyRut: fields.rut,
    thirdPartyName: fields.razonSocial,
    documentName: fields.documento,
    documentFolio: fields.folio,
    dueDate: fields.vencimiento,
    businessUnit,
    classification,
    thirdPartyMode: config.thirdPartyMode,
  };
}

/** Suma la columna de un concepto sobre todos los trabajadores. */
export function sumConcept(workers: PayrollWorker[], conceptId: string): number {
  let total = 0;
  for (const w of workers) total += w.amounts[conceptId] ?? 0;
  return total;
}

/* -------------------------------------------------------------------------- */
/*  RESUMEN Y CUADRATURA                                                      */
/* -------------------------------------------------------------------------- */

function summarize(
  entries: AccountingEntry[],
  skipped: AccountingResult['skippedConcepts'],
): AccountingResult {
  const byClassification = {
    HABER: { debit: 0, credit: 0, count: 0 },
    DESCUENTO: { debit: 0, credit: 0, count: 0 },
    APORTE_EMPLEADOR: { debit: 0, credit: 0, count: 0 },
    NETO: { debit: 0, credit: 0, count: 0 },
    TOTALIZADOR: { debit: 0, credit: 0, count: 0 },
    INFORMATIVO: { debit: 0, credit: 0, count: 0 },
  } as AccountingResult['byClassification'];

  let totalDebit = 0;
  let totalCredit = 0;

  for (const e of entries) {
    totalDebit += e.debit;
    totalCredit += e.credit;
    const bucket = byClassification[e.classification];
    bucket.debit += e.debit;
    bucket.credit += e.credit;
    bucket.count += 1;
  }

  totalDebit = toCLP(totalDebit);
  totalCredit = toCLP(totalCredit);
  const difference = toCLP(totalDebit - totalCredit);

  return {
    entries,
    totalDebit,
    totalCredit,
    difference,
    balanced: difference === 0,
    byClassification,
    skippedConcepts: skipped,
  };
}

/* -------------------------------------------------------------------------- */
/*  AGRUPACIONES PARA LA PREVISUALIZACION                                     */
/* -------------------------------------------------------------------------- */

export interface AccountSummaryRow {
  account: string;
  debit: number;
  credit: number;
  entries: number;
}

/** Resume el asiento por cuenta contable (vista compacta). */
export function summarizeByAccount(entries: AccountingEntry[]): AccountSummaryRow[] {
  const map = new Map<string, AccountSummaryRow>();
  for (const e of entries) {
    const row = map.get(e.account) ?? { account: e.account, debit: 0, credit: 0, entries: 0 };
    row.debit += e.debit;
    row.credit += e.credit;
    row.entries += 1;
    map.set(e.account, row);
  }
  return [...map.values()].sort((a, b) => a.account.localeCompare(b.account));
}
