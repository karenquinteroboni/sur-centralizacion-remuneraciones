/**
 * ============================================================================
 *  validationEngine.ts  —  VALIDACIONES PREVIAS A LA EXPORTACION
 * ----------------------------------------------------------------------------
 *  Implementa las 9 validaciones exigidas por el requerimiento:
 *
 *   V1  Todos los conceptos incluidos deben tener cuenta.
 *   V2  Todos los conceptos incluidos deben tener clasificacion.
 *   V3  Las cuentas deben ser validas en cuanto a formato.
 *   V4  No se permiten conceptos ambiguos sin resolucion.
 *   V5  Deteccion de posibles dobles contabilizaciones.
 *   V6  Los terceros requeridos deben tener RUT (valido, modulo 11).
 *   V7  Debe existir nombre cuando se requiere tercero.
 *   V8  Comparacion de los totales del Excel con las sumas contabilizadas.
 *   V9  El asiento debe estar completamente cuadrado.
 *
 *  Severidades: ERROR bloquea la exportacion; WARNING e INFO no.
 * ============================================================================
 */

import type {
  AccountingResult,
  CentralizationConfig,
  ConceptAnalysis,
  PayrollBook,
  ValidationIssue,
  ValidationReport,
} from '../types/payroll';
import { detectDoubleCounting } from './payrollAnalyzer';
import { mentionsOtherPeriod, resolveKameFields } from './kameFields';
import { formatCLP, nearlyEqual } from '../utils/numberUtils';
import { isValidRut } from '../utils/rutValidator';

export interface ValidationOptions {
  /**
   * Expresion regular que deben cumplir las cuentas contables.
   * Por defecto acepta el formato jerarquico de Kame (1.01.01.06) y tambien
   * cuentas planas numericas o alfanumericas de 3 a 30 caracteres.
   */
  accountPattern?: RegExp;
  /** Tolerancia en pesos para la comparacion de totales. */
  tolerance?: number;
  /**
   * Permite exportar con diferencia distinta de cero.
   * Pensado exclusivamente para una futura opcion administrativa.
   * Por defecto false.
   */
  allowUnbalancedExport?: boolean;
  /** Convierte en ERROR la advertencia de doble contabilizacion. */
  strictDoubleCounting?: boolean;
}

/** Formato por defecto de cuenta contable aceptado. */
export const DEFAULT_ACCOUNT_PATTERN = /^[0-9A-Za-z]+([.\-][0-9A-Za-z]+)*$/;

/** Longitud minima razonable de una cuenta contable. */
const MIN_ACCOUNT_LENGTH = 3;

export function validateCentralization(
  book: PayrollBook,
  config: CentralizationConfig,
  analyses: Record<string, ConceptAnalysis>,
  accounting: AccountingResult,
  options: ValidationOptions = {},
): ValidationReport {
  const pattern = options.accountPattern ?? DEFAULT_ACCOUNT_PATTERN;
  const tolerance = options.tolerance ?? 1;
  const issues: ValidationIssue[] = [];

  const conceptsById = new Map(book.concepts.map((c) => [c.id, c]));
  const includedIds = new Set(
    Object.values(config.concepts)
      .filter((c) => c.include)
      .map((c) => c.conceptId),
  );

  /* ---------------------------------------------------------------------- */
  /*  V1 / V2 / V3 / V4  — parametrizacion de conceptos                     */
  /* ---------------------------------------------------------------------- */

  for (const conceptId of includedIds) {
    const cfg = config.concepts[conceptId];
    const concept = conceptsById.get(conceptId);
    if (!cfg || !concept) continue;

    const label = concept.label;

    // --- V2: clasificacion ---
    if (!cfg.classification) {
      issues.push({
        code: 'V2_SIN_CLASIFICACION',
        severity: 'ERROR',
        title: 'Concepto sin clasificacion',
        message: `"${label}" esta incluido pero no tiene clasificacion contable asignada.`,
        conceptId,
      });
      continue; // sin clasificacion no tiene sentido revisar cuentas
    }

    const noEntryClass =
      cfg.classification === 'TOTALIZADOR' || cfg.classification === 'INFORMATIVO';

    // --- V1 + V3: cuentas ---
    if (cfg.classification === 'APORTE_EMPLEADOR') {
      const expense = (cfg.expenseAccount?.trim() || cfg.account || '').trim();
      const liability = (cfg.liabilityAccount ?? '').trim();

      if (!expense) {
        issues.push({
          code: 'V1_SIN_CUENTA_GASTO',
          severity: 'ERROR',
          title: 'Falta cuenta de gasto',
          message: `"${label}" es un aporte del empleador y requiere una cuenta de gasto (DEBE).`,
          conceptId,
        });
      } else {
        checkAccountFormat(expense, label, 'cuenta de gasto', conceptId, pattern, issues);
      }

      if (!liability) {
        issues.push({
          code: 'V1_SIN_CUENTA_OBLIGACION',
          severity: 'ERROR',
          title: 'Falta cuenta de obligacion',
          message: `"${label}" es un aporte del empleador y requiere una cuenta de obligacion (HABER).`,
          conceptId,
        });
      } else {
        checkAccountFormat(liability, label, 'cuenta de obligacion', conceptId, pattern, issues);
      }

      if (expense && liability && expense === liability) {
        issues.push({
          code: 'V3_CUENTAS_IGUALES',
          severity: 'WARNING',
          title: 'Cuentas de aporte identicas',
          message: `"${label}" usa la misma cuenta para gasto y obligacion: el movimiento se anulara a si mismo.`,
          conceptId,
        });
      }
    } else if (!noEntryClass) {
      const account = (cfg.account ?? '').trim();
      if (!account) {
        issues.push({
          code: 'V1_SIN_CUENTA',
          severity: 'ERROR',
          title: 'Concepto sin cuenta contable',
          message: `"${label}" esta incluido pero no tiene cuenta contable asignada.`,
          conceptId,
        });
      } else {
        checkAccountFormat(account, label, 'cuenta', conceptId, pattern, issues);
      }
    }

    // --- V4: conceptos ambiguos sin resolver ---
    const analysis = analyses[conceptId];
    if (analysis && analysis.suggestedClassification === null && !cfg.classification) {
      issues.push({
        code: 'V4_AMBIGUO',
        severity: 'ERROR',
        title: 'Concepto ambiguo sin resolucion',
        message: `"${label}" no pudo clasificarse automaticamente y sigue sin resolucion manual.`,
        conceptId,
      });
    }
    if (
      analysis &&
      analysis.suggestedClassification !== null &&
      cfg.classification !== analysis.suggestedClassification &&
      !noEntryClass
    ) {
      issues.push({
        code: 'V4_CLASIFICACION_MANUAL',
        severity: 'INFO',
        title: 'Clasificacion modificada manualmente',
        message: `"${label}" se contabilizara como ${cfg.classification} (la sugerencia automatica era ${analysis.suggestedClassification}).`,
        conceptId,
      });
    }

    // --- Aviso: totalizador incluido ---
    // El liquido a pagar SIEMPRE equivale a "haberes - descuentos": que la
    // matematica lo detecte es esperable y no merece advertencia. Solo se
    // advierte si el propio titulo dice "total".
    const netoEsperado =
      cfg.classification === 'NETO' &&
      analysis?.mathSaysTotalizer === true &&
      analysis?.nameSaysTotalizer === false;

    if (analysis?.looksLikeTotalizer && !noEntryClass && !netoEsperado) {
      issues.push({
        code: 'V5_TOTALIZADOR_INCLUIDO',
        severity: 'WARNING',
        title: 'Totalizador contabilizado',
        message: `"${label}" fue detectado como posible totalizador (${analysis.totalizerReason ?? 'sin detalle'}) y sin embargo se esta contabilizando como ${cfg.classification}.`,
        conceptId,
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  V5 — doble contabilizacion                                            */
  /* ---------------------------------------------------------------------- */

  const contabilizableIds = new Set(
    [...includedIds].filter((id) => {
      const c = config.concepts[id];
      return (
        c &&
        c.classification &&
        c.classification !== 'TOTALIZADOR' &&
        c.classification !== 'INFORMATIVO'
      );
    }),
  );

  const doubleCount = detectDoubleCounting(book, analyses, contabilizableIds);
  for (const finding of doubleCount) {
    issues.push({
      code: 'V5_DOBLE_CONTABILIZACION',
      severity: options.strictDoubleCounting ? 'ERROR' : 'WARNING',
      title: 'Posible doble contabilizacion',
      message: finding.message,
      conceptId: finding.totalizerConceptId,
    });
  }

  /* ---------------------------------------------------------------------- */
  /*  V6 / V7 — ficha del tercero (RUT y razon social)                       */
  /*  V10     — documento, folio y vencimiento exigidos por la cuenta        */
  /* ---------------------------------------------------------------------- */

  // Conceptos cuya ficha sale del LIBRO: son los que obligan a que cada
  // trabajador tenga RUT valido y nombre.
  const workerFichaConcepts = [...contabilizableIds].filter((id) => {
    const cfg = config.concepts[id];
    if (!cfg) return false;
    const f = resolveKameFields(cfg);
    return f.fichaSource === 'TRABAJADOR' && (f.rut || f.razonSocial);
  });

  if (workerFichaConcepts.length > 0) {
    if (book.identityColumns.rut === null) {
      issues.push({
        code: 'V6_SIN_COLUMNA_RUT',
        severity: 'ERROR',
        title: 'No hay columna de RUT',
        message:
          'Hay cuentas que exigen ficha del trabajador, pero el libro no tiene una columna de RUT identificable.',
      });
    }

    // Solo se exigen datos a los trabajadores que efectivamente generan linea.
    const relevantWorkers = book.workers.filter((w) =>
      workerFichaConcepts.some((id) => Math.round(w.amounts[id] ?? 0) !== 0),
    );

    for (const w of relevantWorkers) {
      if (!w.rut) {
        issues.push({
          code: 'V6_SIN_RUT',
          severity: 'ERROR',
          title: 'Trabajador sin RUT',
          message: `El trabajador de la fila ${w.rowIndex + 1} genera movimientos con ficha pero no tiene RUT.`,
          workerRut: '',
        });
      } else if (!isValidRut(w.rut)) {
        issues.push({
          code: 'V6_RUT_INVALIDO',
          severity: 'ERROR',
          title: 'RUT invalido',
          message: `El RUT ${w.rut} no supera la validacion de digito verificador (modulo 11).`,
          workerRut: w.rut,
        });
      }

      if (!w.fullName.trim()) {
        issues.push({
          code: 'V7_SIN_NOMBRE',
          severity: 'ERROR',
          title: 'Tercero sin nombre',
          message: `El trabajador ${w.rut || `de la fila ${w.rowIndex + 1}`} genera movimientos con ficha pero no tiene nombre.`,
          workerRut: w.rut,
        });
      }
    }

    // RUT duplicado: dos filas para la misma persona suelen indicar finiquito
    // + recontratacion, o un error de carga.
    const seen = new Map<string, number>();
    for (const w of book.workers) {
      if (!w.rut) continue;
      seen.set(w.rut, (seen.get(w.rut) ?? 0) + 1);
    }
    for (const [rut, count] of seen) {
      if (count > 1) {
        issues.push({
          code: 'V6_RUT_DUPLICADO',
          severity: 'WARNING',
          title: 'RUT repetido en el libro',
          message: `El RUT ${rut} aparece en ${count} filas. Se generara una linea por cada fila.`,
          workerRut: rut,
        });
      }
    }
  }

  // Campos analiticos parametrizados por cuenta. Un campo encendido cuyo valor
  // no se puede resolver produciria una columna vacia y Kame rechazaria la
  // linea, asi que bloquea la exportacion.
  for (const conceptId of contabilizableIds) {
    const cfg = config.concepts[conceptId];
    const concept = conceptsById.get(conceptId);
    if (!cfg || !concept) continue;

    const f = resolveKameFields(cfg);
    const label = concept.label;

    /* --- Ficha fija ------------------------------------------------------ */
    if (f.fichaSource === 'FIJA') {
      if (f.rut && !f.fichaRut.trim()) {
        issues.push({
          code: 'V6_FICHA_SIN_RUT',
          severity: 'ERROR',
          title: 'Falta el RUT de la ficha',
          message: `"${label}": la cuenta emite "Rut Ficha" con tercero fijo, pero no se indico el RUT.`,
          conceptId,
        });
      } else if (f.rut && !isValidRut(f.fichaRut)) {
        issues.push({
          code: 'V6_FICHA_RUT_INVALIDO',
          severity: 'ERROR',
          title: 'RUT de la ficha invalido',
          message: `"${label}": el RUT "${f.fichaRut}" no supera la validacion de digito verificador.`,
          conceptId,
        });
      }
      if (f.razonSocial && !f.fichaRazonSocial.trim()) {
        issues.push({
          code: 'V7_FICHA_SIN_RAZON',
          severity: 'ERROR',
          title: 'Falta la razon social de la ficha',
          message: `"${label}": la cuenta emite "Rzn Social Ficha" con tercero fijo, pero no se indico la razon social.`,
          conceptId,
        });
      }
    }

    /* --- Ficha de la empresa --------------------------------------------- */
    if (f.fichaSource === 'EMPRESA') {
      if (f.rut && !book.meta.companyRut) {
        issues.push({
          code: 'V6_FICHA_EMPRESA_SIN_RUT',
          severity: 'ERROR',
          title: 'La empresa no tiene RUT en el libro',
          message: `"${label}": la ficha usa el RUT de la empresa, pero no se detecto en la cabecera del Excel.`,
          conceptId,
        });
      }
      if (f.razonSocial && !book.meta.companyName) {
        issues.push({
          code: 'V7_FICHA_EMPRESA_SIN_NOMBRE',
          severity: 'ERROR',
          title: 'La empresa no tiene razon social en el libro',
          message: `"${label}": la ficha usa la razon social de la empresa, pero no se detecto en la cabecera del Excel.`,
          conceptId,
        });
      }
    }

    /* --- Documento -------------------------------------------------------- */
    if (f.documento && !f.nombreDoc.trim()) {
      issues.push({
        code: 'V10_SIN_DOCUMENTO',
        severity: 'ERROR',
        title: 'Falta el nombre del documento',
        message: `"${label}": la cuenta emite "Nombre Doc", pero no se indico que documento es.`,
        conceptId,
      });
    }

    /* --- Folio del documento --------------------------------------------- */
    if (f.folio) {
      if (f.folioDocMode === 'FIJO' && !f.folioDoc.trim()) {
        issues.push({
          code: 'V10_SIN_FOLIO',
          severity: 'ERROR',
          title: 'Falta el folio del documento',
          message: `"${label}": la cuenta emite "Folio Doc" con valor fijo, pero no se indico el folio.`,
          conceptId,
        });
      }
      if (f.folioDocMode === 'PERIODO' && !book.meta.periodCode) {
        issues.push({
          code: 'V10_FOLIO_SIN_PERIODO',
          severity: 'ERROR',
          title: 'No se pudo determinar el periodo',
          message: `"${label}": el folio usa el periodo del libro, pero no se detecto en la cabecera del Excel.`,
          conceptId,
        });
      }
    }

    /* --- Folio fijo que quedo del periodo anterior ------------------------ */
    // Un folio fijo NO se recalcula solo. Si menciona otro periodo, casi
    // siempre es el del mes pasado y se importaria mal en Kame.
    if (f.folio && f.folioDocMode === 'FIJO' && f.folioDoc.trim()) {
      if (mentionsOtherPeriod(f.folioDoc, book.meta.periodCode)) {
        issues.push({
          code: 'V10_FOLIO_DE_OTRO_PERIODO',
          severity: 'WARNING',
          title: 'El folio fijo menciona otro periodo',
          message: `"${label}": el folio fijo "${f.folioDoc}" no corresponde al periodo que se esta centralizando (${book.meta.periodLabel || book.meta.periodCode}). Un folio fijo no se actualiza solo: revíselo o cambie el origen a "el periodo del libro".`,
          conceptId,
        });
      }
    }

    /* --- Fecha de vencimiento --------------------------------------------- */
    if (f.vencimiento) {
      if (f.vencimientoMode === 'FIJA') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.vencimientoFecha.trim())) {
          issues.push({
            code: 'V10_VENCIMIENTO_INVALIDO',
            severity: 'ERROR',
            title: 'Fecha de vencimiento invalida',
            message: `"${label}": la cuenta emite "Fecha Venc" con fecha fija, pero "${f.vencimientoFecha}" no es una fecha valida.`,
            conceptId,
          });
        } else if (
          book.meta.periodEndDate &&
          f.vencimientoFecha.trim() < book.meta.periodEndDate
        ) {
          // Una fecha fija anterior al cierre del periodo delata que quedo del
          // mes pasado: la fecha fija tampoco se recalcula sola.
          issues.push({
            code: 'V10_VENCIMIENTO_DE_OTRO_PERIODO',
            severity: 'WARNING',
            title: 'La fecha de vencimiento quedo del periodo anterior',
            message: `"${label}": el vencimiento fijo (${f.vencimientoFecha}) es anterior al cierre del periodo que se esta centralizando (${book.meta.periodEndDate}). Actualicelo, o use "dia fijo del mes siguiente", que se recalcula solo en cada periodo.`,
            conceptId,
          });
        }
      } else {
        if (!book.meta.periodCode) {
          issues.push({
            code: 'V10_VENCIMIENTO_SIN_PERIODO',
            severity: 'ERROR',
            title: 'No se pudo determinar el periodo',
            message: `"${label}": el vencimiento se calcula desde el periodo del libro, pero no se detecto en la cabecera del Excel.`,
            conceptId,
          });
        }
        if (!Number.isInteger(f.vencimientoDia) || f.vencimientoDia < 1 || f.vencimientoDia > 31) {
          issues.push({
            code: 'V10_VENCIMIENTO_DIA_INVALIDO',
            severity: 'ERROR',
            title: 'Dia de vencimiento invalido',
            message: `"${label}": el dia de vencimiento debe estar entre 1 y 31 (se indico ${f.vencimientoDia}).`,
            conceptId,
          });
        }
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  V8 — totales del Excel vs. totales contabilizados                     */
  /* ---------------------------------------------------------------------- */

  for (const conceptId of contabilizableIds) {
    const concept = conceptsById.get(conceptId);
    if (!concept || concept.excelTotal === null) continue;
    if (!nearlyEqual(concept.total, concept.excelTotal, tolerance)) {
      issues.push({
        code: 'V8_TOTAL_COLUMNA',
        severity: 'WARNING',
        title: 'Total de columna no coincide',
        message: `"${concept.label}": la suma de las filas (${formatCLP(concept.total)}) no coincide con la fila de totales del Excel (${formatCLP(concept.excelTotal)}).`,
        conceptId,
      });
    }
  }

  // Cuadratura global del libro: HABERES = DESCUENTOS + LIQUIDO.
  const bookCheck = checkBookIdentity(book, analyses, tolerance);
  if (bookCheck) issues.push(bookCheck);

  // El monto contabilizado por concepto debe reflejar la columna del Excel.
  const accountedByConcept = new Map<string, number>();
  for (const e of accounting.entries) {
    if (e.classification === 'APORTE_EMPLEADOR' && e.nature === 'HABER') continue; // contrapartida
    accountedByConcept.set(
      e.conceptId,
      (accountedByConcept.get(e.conceptId) ?? 0) + e.amount,
    );
  }
  for (const [conceptId, accounted] of accountedByConcept) {
    const concept = conceptsById.get(conceptId);
    if (!concept) continue;
    const reference = Math.abs(concept.excelTotal ?? concept.total);
    const cfg = config.concepts[conceptId];
    const hasFactor = (cfg?.rules?.factor ?? 1) !== 1;
    if (hasFactor) continue; // el factor altera el monto de forma deliberada
    if (!nearlyEqual(accounted, reference, tolerance * 2)) {
      issues.push({
        code: 'V8_MONTO_CONTABILIZADO',
        severity: 'WARNING',
        title: 'Monto contabilizado distinto al libro',
        message: `"${concept.label}": se contabilizaron ${formatCLP(accounted)} y el libro indica ${formatCLP(reference)}.`,
        conceptId,
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  V9 — cuadratura del asiento                                           */
  /* ---------------------------------------------------------------------- */

  if (accounting.entries.length === 0) {
    issues.push({
      code: 'V9_SIN_MOVIMIENTOS',
      severity: 'ERROR',
      title: 'El asiento no tiene movimientos',
      message:
        'La configuracion actual no genera ninguna linea contable. Incluya al menos un concepto con monto.',
    });
  } else if (!accounting.balanced) {
    issues.push({
      code: 'V9_NO_CUADRADO',
      severity: options.allowUnbalancedExport ? 'WARNING' : 'ERROR',
      title: 'Centralizacion no balanceada',
      message: `Total Debe ${formatCLP(accounting.totalDebit)} vs Total Haber ${formatCLP(accounting.totalCredit)}. Diferencia: ${formatCLP(accounting.difference)}.`,
    });
  } else {
    issues.push({
      code: 'V9_CUADRADO',
      severity: 'INFO',
      title: 'Centralizacion balanceada',
      message: `Total Debe = Total Haber = ${formatCLP(accounting.totalDebit)}. Diferencia: 0.`,
    });
  }

  // Lineas sin cuenta que igualmente llegaron al asiento (defensa en profundidad).
  const emptyAccountLines = accounting.entries.filter((e) => !e.account.trim());
  if (emptyAccountLines.length > 0) {
    issues.push({
      code: 'V1_LINEA_SIN_CUENTA',
      severity: 'ERROR',
      title: 'Movimientos sin cuenta',
      message: `${emptyAccountLines.length} movimiento(s) quedaron sin cuenta contable.`,
    });
  }

  // Conceptos incluidos que no generaron ninguna linea.
  for (const skipped of accounting.skippedConcepts) {
    if (skipped.reason.includes('TOTALIZADOR') || skipped.reason.includes('INFORMATIVO')) continue;
    issues.push({
      code: 'V8_CONCEPTO_SIN_MOVIMIENTO',
      severity: 'INFO',
      title: 'Concepto sin movimiento',
      message: `"${skipped.label}": ${skipped.reason}`,
      conceptId: skipped.conceptId,
    });
  }

  const errors = issues.filter((i) => i.severity === 'ERROR');
  const warnings = issues.filter((i) => i.severity === 'WARNING');
  const infos = issues.filter((i) => i.severity === 'INFO');

  return {
    issues,
    errors,
    warnings,
    infos,
    canExport: errors.length === 0,
    totalDebit: accounting.totalDebit,
    totalCredit: accounting.totalCredit,
    difference: accounting.difference,
    balanced: accounting.balanced,
  };
}

/* -------------------------------------------------------------------------- */
/*  AUXILIARES                                                                */
/* -------------------------------------------------------------------------- */

function checkAccountFormat(
  account: string,
  label: string,
  role: string,
  conceptId: string,
  pattern: RegExp,
  issues: ValidationIssue[],
): void {
  if (account.length < MIN_ACCOUNT_LENGTH) {
    issues.push({
      code: 'V3_CUENTA_CORTA',
      severity: 'ERROR',
      title: 'Cuenta contable demasiado corta',
      message: `"${label}": la ${role} "${account}" tiene menos de ${MIN_ACCOUNT_LENGTH} caracteres.`,
      conceptId,
    });
    return;
  }
  if (!pattern.test(account)) {
    issues.push({
      code: 'V3_FORMATO_CUENTA',
      severity: 'ERROR',
      title: 'Formato de cuenta invalido',
      message: `"${label}": la ${role} "${account}" no cumple el formato esperado (ej. 5.01.02.01).`,
      conceptId,
    });
  }
}

/**
 * Verifica la identidad basica del libro:
 *   TOTAL HABERES = TOTAL DESCUENTOS + LIQUIDO
 * usando los totalizadores detectados. Si no se identifican, no valida nada.
 */
function checkBookIdentity(
  book: PayrollBook,
  analyses: Record<string, ConceptAnalysis>,
  tolerance: number,
): ValidationIssue | null {
  const find = (re: RegExp) =>
    book.concepts.find((c) => re.test(c.normalizedLabel) && c.numeric);

  const haberes = find(/^TOTAL HABERES?$|^TOTAL(ES)? IMPONIBLES?$/);
  const descuentos = find(/^TOTAL DESCUENTOS?$/);
  const liquido = book.concepts.find(
    (c) => /LIQUIDO/.test(c.normalizedLabel) && c.numeric,
  );

  if (!haberes || !descuentos || !liquido) return null;

  const expected = haberes.total - descuentos.total;
  if (nearlyEqual(expected, liquido.total, tolerance * 2)) {
    return {
      code: 'V8_IDENTIDAD_LIBRO',
      severity: 'INFO',
      title: 'Cuadratura del libro verificada',
      message: `${haberes.label} (${formatCLP(haberes.total)}) - ${descuentos.label} (${formatCLP(descuentos.total)}) = ${liquido.label} (${formatCLP(liquido.total)}).`,
    };
  }

  return {
    code: 'V8_IDENTIDAD_LIBRO_ERROR',
    severity: 'WARNING',
    title: 'El libro no cuadra internamente',
    message: `${haberes.label} - ${descuentos.label} = ${formatCLP(expected)}, pero ${liquido.label} indica ${formatCLP(liquido.total)}.`,
  };
}
