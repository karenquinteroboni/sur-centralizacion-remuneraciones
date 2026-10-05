/**
 * Normalizacion de titulos, generacion de identificadores internos unicos
 * y diccionarios de clasificacion para libros de remuneraciones chilenos.
 *
 * IMPORTANTE: aqui NO hay cuentas contables. Las cuentas son 100%
 * responsabilidad de la configuracion de cada empresa.
 */

import type { ConceptClassification, ThirdPartyMode } from '../types/payroll';

/** Quita tildes/diacriticos. */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza un titulo para comparaciones: mayusculas, sin tildes,
 * sin puntuacion redundante y con espacios colapsados.
 */
export function normalizeLabel(label: unknown): string {
  if (label === null || label === undefined) return '';
  return stripAccents(String(label))
    .toUpperCase()
    .replace(/[._]+/g, ' ')
    .replace(/[^A-Z0-9%/+\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Convierte un titulo en un slug apto para identificador interno. */
export function slugify(label: string): string {
  const n = normalizeLabel(label).replace(/[^A-Z0-9 ]+/g, ' ');
  const slug = n.replace(/\s+/g, '_').replace(/^_+|_+$/g, '');
  return slug || 'CONCEPTO';
}

/**
 * Genera el identificador interno UNICO de una columna.
 * Dos columnas con el mismo titulo producen ids distintos gracias al sufijo
 * de ocurrencia: HORAS_EXTRAS_01, HORAS_EXTRAS_02, ...
 */
export function buildConceptId(label: string, occurrence: number): string {
  const suffix = String(occurrence).padStart(2, '0');
  return `${slugify(label)}_${suffix}`;
}

/* -------------------------------------------------------------------------- */
/*  DICCIONARIOS DE CLASIFICACION                                             */
/* -------------------------------------------------------------------------- */

interface Rule {
  /** Patron aplicado sobre el titulo normalizado. */
  pattern: RegExp;
  classification: ConceptClassification;
  confidence: number;
  thirdPartyMode?: ThirdPartyMode;
  reason: string;
}

/**
 * Las reglas se evaluan EN ORDEN: la primera que coincide gana.
 * Por eso los patrones mas especificos (aportes del empleador, totalizadores,
 * netos) van antes que los genericos.
 */
export const CLASSIFICATION_RULES: Rule[] = [
  /* --- 1. Aportes de cargo del empleador (deben ir primero) -------------- */
  {
    pattern: /\bEMPLEADOR\b|\bPATRONAL\b|\bCARGO EMPRESA\b/,
    classification: 'APORTE_EMPLEADOR',
    confidence: 0.95,
    reason: 'El titulo menciona explicitamente al empleador.',
  },
  {
    pattern: /^SIS\b|\bSEGURO (DE )?INVALIDEZ|SOBREVIVENCIA/,
    classification: 'APORTE_EMPLEADOR',
    confidence: 0.9,
    reason: 'SIS (invalidez y sobrevivencia) es un aporte de cargo del empleador.',
  },
  {
    pattern: /\bMUTUAL\b|\bACHS\b|\bIST\b|\bLEY 16744\b|\bACCIDENTES DEL TRABAJO\b/,
    classification: 'APORTE_EMPLEADOR',
    confidence: 0.9,
    reason: 'Seguro de accidentes del trabajo: aporte del empleador.',
  },
  {
    pattern: /EXPECTATIVA DE VIDA/,
    classification: 'APORTE_EMPLEADOR',
    confidence: 0.85,
    reason: 'Cotizacion por expectativa de vida: aporte del empleador.',
  },
  {
    pattern: /^APVC\b|AHORRO PREVISIONAL VOLUNTARIO COLECTIVO/,
    classification: 'APORTE_EMPLEADOR',
    confidence: 0.8,
    reason: 'APVC: aporte colectivo del empleador.',
  },

  /* --- 2. Totalizadores --------------------------------------------------- */
  {
    pattern: /^TOTAL(ES)?\b|\bTOTAL(ES)?$|^SUB ?TOTAL|\bSUMA\b/,
    classification: 'TOTALIZADOR',
    confidence: 0.9,
    reason: 'El titulo corresponde a un total o subtotal.',
  },

  /* --- 3. Neto / liquido -------------------------------------------------- */
  {
    pattern: /LIQUIDO|ALCANCE LIQUIDO|LIQUIDO A PAGAR|NETO A PAGAR/,
    classification: 'NETO',
    confidence: 0.95,
    thirdPartyMode: 'PER_WORKER',
    reason: 'Corresponde al liquido a pagar al trabajador.',
  },

  /* --- 4. Informativos ---------------------------------------------------- */
  {
    pattern:
      /^DIAS\b|\bDIAS (TRABAJADOS|AUSENTE|LICENCIA|VACACIONES)\b|^HORAS (SEMANALES|NO TRABAJADAS|PACTADAS|CONTRATO)\b|^BASE IMP|IMPONIBLE (PREVISION|CESANTIA|SALUD)$|^RENTA IMPONIBLE|^TOPE\b|^UF\b|^UTM\b/,
    classification: 'INFORMATIVO',
    confidence: 0.9,
    reason: 'Columna de referencia o base de calculo: no genera asiento.',
  },

  /* --- 5. Descuentos al trabajador --------------------------------------- */
  {
    pattern:
      /^PREVIS|^AFP\b|\bCOTIZACION OBLIGATORIA\b|^SALUD|^ISAPRE|^FONASA|^APV\b|^CESANTIA|^SEGURO CESANTIA|^IMPUESTO|IMPUESTO UNICO|^RETENCION|^ANTICIPO|^PRESTAMO|^CAJA (DE )?COMPENSACION|^CCAF|^SINDICATO|CUOTA SINDICAL|^AHORRO\b|\bDESCUENTOS?\b|\bFINIQUITO\b|^SEGURO COMPLEMENTARIO|^APORTE VOLUNTARIO|^SALUD VOLUNTARIA|^ADICIONAL SALUD|^JUDICIAL|PENSION ALIMENTICIA/,
    classification: 'DESCUENTO',
    confidence: 0.85,
    reason: 'Coincide con el diccionario de descuentos al trabajador.',
  },

  /* --- 6. Haberes --------------------------------------------------------- */
  {
    pattern:
      /^SUELDO|^SUELDO BASE|^GRATIFICACION|^HORAS EXTRAS|^HORA EXTRA|^SOBRETIEMPO|^BONO|^BONIFICACION|^COMISION|^COLACION|^MOVILIZACION|^ASIGNACION|^AGUINALDO|^VIATICO|^SEMANA CORRIDA|^FERIADO|^VACACIONES|^INDEMNIZACION|^REEMBOLSO|^INCENTIVO|^PARTICIPACION|^PREMIO|^APORTE ASISTENCIA|^TRATO|^SOBREGIRO|^HABERES?$|^REGALIA|^DESAHUCIO|^AVISO PREVIO/,
    classification: 'HABER',
    confidence: 0.85,
    reason: 'Coincide con el diccionario de haberes.',
  },
];

/** Resultado de la clasificacion por diccionario. */
export interface DictionaryMatch {
  classification: ConceptClassification | null;
  confidence: number;
  thirdPartyMode: ThirdPartyMode;
  reason: string;
}

/**
 * Clasifica un titulo usando unicamente el diccionario (sin mirar los datos).
 * Devuelve `classification: null` cuando no hay coincidencia: en ese caso el
 * concepto queda como AMBIGUO y la UI exige parametrizacion manual.
 */
export function classifyByDictionary(label: string): DictionaryMatch {
  const n = normalizeLabel(label);
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.pattern.test(n)) {
      return {
        classification: rule.classification,
        confidence: rule.confidence,
        thirdPartyMode:
          rule.thirdPartyMode ??
          (rule.classification === 'NETO' ? 'PER_WORKER' : 'CONSOLIDATED'),
        reason: rule.reason,
      };
    }
  }
  return {
    classification: null,
    confidence: 0,
    thirdPartyMode: 'CONSOLIDATED',
    reason:
      'No se encontro coincidencia en el diccionario: requiere clasificacion manual.',
  };
}

/** Patrones de titulos de columnas de identificacion (no contabilizables). */
export const IDENTITY_PATTERNS = {
  rut: /^RUT\b|^R U T$|^RUT TRABAJADOR|^N? ?DOCUMENTO|^CEDULA/,
  code: /^CODIGO|^COD\b|^FICHA\b|^N FICHA|^ID\b/,
  lastName: /^AP(ELLIDO)? ?PATERNO|^PATERNO$|^APELLIDO 1/,
  secondLastName: /^AP(ELLIDO)? ?MATERNO|^MATERNO$|^APELLIDO 2/,
  firstNames: /^NOMBRES?$|^NOMBRE TRABAJADOR|^PRIMER NOMBRE/,
  fullName: /^NOMBRE COMPLETO|^TRABAJADOR$|^EMPLEADO$|^APELLIDOS Y NOMBRES/,
  position: /^CARGO|^PUESTO|^FUNCION/,
  costCenter: /^CENTRO ?(DE )?COSTO|^CECO$|^AREA$|^SUCURSAL|^DEPARTAMENTO|^UNIDAD/,
} as const;

/** true si el titulo corresponde a una columna de identificacion. */
export function isIdentityLabel(label: string): boolean {
  const n = normalizeLabel(label);
  return Object.values(IDENTITY_PATTERNS).some((p) => p.test(n));
}

/** Palabras que delatan una fila de totales. */
export const TOTALS_ROW_PATTERN = /^TOTAL(ES)?:?$|^TOTAL(ES)? GENERAL|^SUMAS?:?$/;
