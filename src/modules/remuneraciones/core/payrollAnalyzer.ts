/**
 * ============================================================================
 *  payrollAnalyzer.ts  —  ANALISIS AUTOMATICO DE CONCEPTOS
 * ----------------------------------------------------------------------------
 *  Toma un `PayrollBook` y produce, para cada concepto:
 *    - clasificacion sugerida (diccionario + comportamiento de los datos)
 *    - deteccion de totalizadores (por nombre Y por relacion matematica)
 *    - modalidad de tercero sugerida
 *
 *  IMPORTANTE: el analizador SUGIERE. Nunca decide cuentas contables y nunca
 *  bloquea al usuario: todo es editable desde la configuracion.
 * ============================================================================
 */

import type {
  ConceptAnalysis,
  ConceptClassification,
  PayrollBook,
  PayrollConcept,
} from '../types/payroll';
import { classifyByDictionary, normalizeLabel } from '../utils/conceptUtils';
import { nearlyEqual } from '../utils/numberUtils';

export interface AnalyzeOptions {
  /** Tolerancia en pesos al comparar sumas de columnas. */
  tolerance?: number;
  /** Porcentaje minimo de filas que deben cuadrar para declarar totalizador. */
  minRowMatchRatio?: number;
}

/** Analiza todos los conceptos del libro. */
export function analyzePayroll(
  book: PayrollBook,
  options: AnalyzeOptions = {},
): Record<string, ConceptAnalysis> {
  const tolerance = options.tolerance ?? 1;
  const minRatio = options.minRowMatchRatio ?? 0.9;

  const result: Record<string, ConceptAnalysis> = {};
  const numericConcepts = book.concepts.filter((c) => c.numeric);

  for (const concept of book.concepts) {
    const dict = classifyByDictionary(concept.label);

    // La fuente (ej. Buk) ya sabe que es cada linea: no se adivina por titulo
    // ni se busca relacion matematica (evita falsos totalizadores).
    if (concept.sourceClassification) {
      result[concept.id] = {
        conceptId: concept.id,
        suggestedClassification: concept.sourceClassification,
        suggestedThirdPartyMode: dict.thirdPartyMode,
        confidence: 0.95,
        looksLikeTotalizer: false,
        nameSaysTotalizer: false,
        mathSaysTotalizer: false,
        totalizerReason: null,
        componentConceptIds: [],
        rationale: 'Clasificacion informada por la fuente de datos (Buk).',
      };
      continue;
    }

    // --- Deteccion matematica de totalizador --------------------------------
    const math = detectTotalizerByMath(
      concept,
      numericConcepts,
      book,
      tolerance,
      minRatio,
    );

    const nameSaysTotal = dict.classification === 'TOTALIZADOR';
    const looksLikeTotalizer = nameSaysTotal || math.isTotalizer;

    let totalizerReason: string | null = null;
    if (nameSaysTotal && math.isTotalizer) {
      totalizerReason = `El titulo indica un total y ademas coincide con la suma de ${math.componentIds.length} columnas.`;
    } else if (nameSaysTotal) {
      totalizerReason = 'El titulo indica un total o subtotal.';
    } else if (math.isTotalizer) {
      totalizerReason = `Los valores coinciden con la suma de ${math.componentIds.length} columnas (${math.description}).`;
    }

    // --- Clasificacion final sugerida ---------------------------------------
    let suggested: ConceptClassification | null = dict.classification;
    let confidence = dict.confidence;
    let rationale = dict.reason;

    if (suggested === null && math.isTotalizer) {
      suggested = 'TOTALIZADOR';
      confidence = 0.7;
      rationale = totalizerReason ?? 'Detectado como totalizador por su comportamiento.';
    } else if (suggested !== null && suggested !== 'TOTALIZADOR' && math.isTotalizer) {
      // El nombre dice una cosa y la matematica otra: se avisa pero se respeta
      // el diccionario, salvo que el concepto sea NETO (caso legitimo: el
      // liquido tambien es "haberes - descuentos").
      if (suggested !== 'NETO') {
        rationale = `${dict.reason} ATENCION: sus valores tambien coinciden con la suma de otras columnas.`;
        confidence = Math.min(confidence, 0.6);
      }
    }

    // Una columna sin ningun valor distinto de cero rara vez debe contabilizarse.
    if (concept.nonZeroCount === 0 && suggested !== 'TOTALIZADOR') {
      rationale += ' La columna no tiene valores distintos de cero en este periodo.';
    }

    // Columna no numerica => informativa.
    if (!concept.numeric) {
      suggested = 'INFORMATIVO';
      confidence = 0.9;
      rationale = 'La columna no contiene valores numericos contabilizables.';
    }

    result[concept.id] = {
      conceptId: concept.id,
      suggestedClassification: suggested,
      suggestedThirdPartyMode: dict.thirdPartyMode,
      confidence,
      looksLikeTotalizer,
      nameSaysTotalizer: nameSaysTotal,
      mathSaysTotalizer: math.isTotalizer,
      totalizerReason,
      componentConceptIds: math.componentIds,
      rationale,
    };
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/*  DETECCION MATEMATICA DE TOTALIZADORES                                     */
/* -------------------------------------------------------------------------- */

interface MathDetection {
  isTotalizer: boolean;
  componentIds: string[];
  description: string;
}

/**
 * Busca una relacion `concepto = suma(otras columnas)` verificada FILA A FILA
 * (no solo sobre el total, que podria coincidir por casualidad).
 *
 * Estrategias, en orden:
 *   A) Bloque contiguo de columnas anteriores (patron clasico de los libros:
 *      TOTAL HABERES cierra el bloque de haberes, TOTAL DESCUENTOS el de
 *      descuentos).
 *   B) Diferencia entre dos totalizadores previos (patron del liquido:
 *      LIQUIDO = TOTAL HABERES - TOTAL DESCUENTOS).
 */
function detectTotalizerByMath(
  concept: PayrollConcept,
  numericConcepts: PayrollConcept[],
  book: PayrollBook,
  tolerance: number,
  minRatio: number,
): MathDetection {
  const empty: MathDetection = { isTotalizer: false, componentIds: [], description: '' };
  if (!concept.numeric) return empty;
  if (book.workers.length < 2) return empty;
  if (concept.total === 0) return empty;

  const previous = numericConcepts.filter((c) => c.columnIndex < concept.columnIndex);
  if (previous.length === 0) return empty;

  // --- A) Bloque contiguo hacia atras -------------------------------------
  // Se prueban ventanas que terminan justo antes de la columna analizada.
  for (let start = 0; start < previous.length; start++) {
    const window = previous.slice(start);
    if (window.length < 2) continue;
    // El total debe cuadrar antes de gastar tiempo comparando fila a fila.
    const windowTotal = window.reduce((acc, c) => acc + c.total, 0);
    if (!nearlyEqual(windowTotal, concept.total, tolerance * window.length)) continue;

    if (rowsMatchSum(book, concept, window.map((c) => c.id), tolerance, minRatio)) {
      return {
        isTotalizer: true,
        componentIds: window.map((c) => c.id),
        description: `bloque ${window[0].label} .. ${window[window.length - 1].label}`,
      };
    }
  }

  // --- B) Diferencia de dos columnas anteriores ---------------------------
  // Se exige que AMBAS columnas tengan movimiento: de lo contrario cualquier
  // columna vacia convierte "A - vacia = A" en un falso positivo.
  for (let i = 0; i < previous.length; i++) {
    for (let j = 0; j < previous.length; j++) {
      if (i === j) continue;
      const a = previous[i];
      const b = previous[j];
      if (a.nonZeroCount === 0 || b.nonZeroCount === 0) continue;
      if (a.total === 0 || b.total === 0) continue;
      if (!nearlyEqual(a.total - b.total, concept.total, tolerance * 2)) continue;
      if (rowsMatchDifference(book, concept, a.id, b.id, tolerance, minRatio)) {
        return {
          isTotalizer: true,
          componentIds: [a.id, b.id],
          description: `${a.label} - ${b.label}`,
        };
      }
    }
  }

  return empty;
}

/** true si, fila a fila, el concepto equivale a la suma de `componentIds`. */
function rowsMatchSum(
  book: PayrollBook,
  concept: PayrollConcept,
  componentIds: string[],
  tolerance: number,
  minRatio: number,
): boolean {
  let matches = 0;
  let evaluated = 0;
  for (const w of book.workers) {
    const target = w.amounts[concept.id] ?? 0;
    let s = 0;
    for (const id of componentIds) s += w.amounts[id] ?? 0;
    if (target === 0 && s === 0) continue; // fila neutra, no aporta evidencia
    evaluated++;
    if (nearlyEqual(s, target, tolerance * componentIds.length)) matches++;
  }
  if (evaluated < 2) return false;
  return matches / evaluated >= minRatio;
}

/** true si, fila a fila, el concepto equivale a `a - b`. */
function rowsMatchDifference(
  book: PayrollBook,
  concept: PayrollConcept,
  aId: string,
  bId: string,
  tolerance: number,
  minRatio: number,
): boolean {
  let matches = 0;
  let evaluated = 0;
  for (const w of book.workers) {
    const target = w.amounts[concept.id] ?? 0;
    const value = (w.amounts[aId] ?? 0) - (w.amounts[bId] ?? 0);
    if (target === 0 && value === 0) continue;
    evaluated++;
    if (nearlyEqual(value, target, tolerance * 2)) matches++;
  }
  if (evaluated < 2) return false;
  return matches / evaluated >= minRatio;
}

/* -------------------------------------------------------------------------- */
/*  DETECCION DE DOBLE CONTABILIZACION                                        */
/* -------------------------------------------------------------------------- */

export interface DoubleCountFinding {
  totalizerConceptId: string;
  totalizerLabel: string;
  includedComponentIds: string[];
  includedComponentLabels: string[];
  message: string;
}

/**
 * Detecta el caso descrito en el requerimiento: el usuario incluye un
 * totalizador (ej. TOTAL HABERES) Y ademas los conceptos que lo componen
 * (SUELDO BASE, GRATIFICACION, ...). No bloquea: advierte.
 */
export function detectDoubleCounting(
  book: PayrollBook,
  analyses: Record<string, ConceptAnalysis>,
  includedConceptIds: Set<string>,
): DoubleCountFinding[] {
  const byId = new Map(book.concepts.map((c) => [c.id, c]));
  const findings: DoubleCountFinding[] = [];

  for (const conceptId of includedConceptIds) {
    const analysis = analyses[conceptId];
    const concept = byId.get(conceptId);
    if (!analysis || !concept) continue;
    if (!analysis.looksLikeTotalizer) continue;
    if (analysis.componentConceptIds.length === 0) continue;

    const overlapping = analysis.componentConceptIds.filter((id) =>
      includedConceptIds.has(id),
    );
    if (overlapping.length === 0) continue;

    const labels = overlapping
      .map((id) => byId.get(id)?.label ?? id)
      .slice(0, 6);

    findings.push({
      totalizerConceptId: conceptId,
      totalizerLabel: concept.label,
      includedComponentIds: overlapping,
      includedComponentLabels: labels,
      message:
        `Este concepto parece corresponder a una suma de conceptos seleccionados. ` +
        `Su inclusion podria generar doble contabilizacion. ` +
        `Conceptos involucrados: ${labels.join(', ')}` +
        (overlapping.length > labels.length ? ` y ${overlapping.length - labels.length} mas.` : '.'),
    });
  }

  return findings;
}

/* -------------------------------------------------------------------------- */
/*  UTILIDADES DE CONSULTA                                                    */
/* -------------------------------------------------------------------------- */

/** Agrupa conceptos por titulo normalizado (para mostrar duplicados juntos). */
export function groupByLabel(concepts: PayrollConcept[]): Map<string, PayrollConcept[]> {
  const map = new Map<string, PayrollConcept[]>();
  for (const c of concepts) {
    const key = normalizeLabel(c.label);
    const list = map.get(key) ?? [];
    list.push(c);
    map.set(key, list);
  }
  return map;
}

/** Devuelve solo los conceptos con titulo repetido. */
export function getDuplicatedConcepts(concepts: PayrollConcept[]): PayrollConcept[] {
  return concepts.filter((c) => c.duplicateLabel);
}
