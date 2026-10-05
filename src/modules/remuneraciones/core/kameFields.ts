/**
 * ============================================================================
 *  kameFields.ts  —  CAMPOS ANALITICOS QUE EXIGE LA CUENTA EN KAME
 * ----------------------------------------------------------------------------
 *  En Kame no todas las cuentas admiten los mismos campos: las cuentas con
 *  ficha exigen RUT y razon social, y las de pasivo con seguimiento documental
 *  exigen documento, folio y fecha de vencimiento. La eleccion es POR CUENTA,
 *  no global del comprobante.
 *
 *  Este archivo resuelve, para una linea concreta, que valor va en cada una de
 *  esas cinco columnas. Es logica pura: sin React, sin DOM y sin dependencias
 *  de los demas modulos del nucleo, de modo que tanto el motor contable como
 *  la configuracion y las validaciones puedan usarlo sin ciclos de importacion.
 * ============================================================================
 */

import type {
  ConceptConfig,
  ConceptKameFields,
  PayrollMeta,
  PayrollWorker,
  ThirdPartyMode,
} from '../types/payroll';
import { formatRutForKame } from '../utils/rutValidator';

/* -------------------------------------------------------------------------- */
/*  VALORES POR DEFECTO Y COMPATIBILIDAD                                      */
/* -------------------------------------------------------------------------- */

/**
 * Campos por defecto de una cuenta.
 *
 * Criterio: solo se activa lo que el modulo puede llenar SIN inventar nada.
 * En modo "por trabajador" el libro ya trae RUT y nombre, asi que la ficha se
 * enciende; documento, folio y vencimiento quedan apagados porque dependen de
 * como cada empresa tenga configurado su plan de cuentas en Kame.
 */
export function buildDefaultKameFields(mode: ThirdPartyMode): ConceptKameFields {
  const perWorker = mode === 'PER_WORKER';
  return {
    rut: perWorker,
    razonSocial: perWorker,
    documento: false,
    folio: false,
    vencimiento: false,

    fichaSource: perWorker ? 'TRABAJADOR' : 'FIJA',
    fichaRut: '',
    fichaRazonSocial: '',

    nombreDoc: '',

    folioDocMode: 'PERIODO',
    folioDoc: '',

    vencimientoMode: 'DIA_MES_SIGUIENTE',
    vencimientoDia: 10,
    vencimientoFecha: '',
  };
}

/**
 * Devuelve los campos de un concepto, completando los que falten.
 *
 * Las configuraciones guardadas antes de esta funcionalidad no traen
 * `kameFields`: se derivan de `thirdPartyMode`, con lo que el archivo generado
 * queda identico al que producian antes. Compatibilidad sin migracion.
 */
export function resolveKameFields(config: ConceptConfig): ConceptKameFields {
  const defaults = buildDefaultKameFields(config.thirdPartyMode);
  if (!config.kameFields) return defaults;
  return { ...defaults, ...config.kameFields };
}

/** true si la cuenta exige al menos un campo analitico. */
export function usesAnyKameField(fields: ConceptKameFields): boolean {
  return (
    fields.rut || fields.razonSocial || fields.documento || fields.folio || fields.vencimiento
  );
}

/* -------------------------------------------------------------------------- */
/*  RESOLUCION DE VALORES                                                     */
/* -------------------------------------------------------------------------- */

/** Los cinco valores ya resueltos para una linea del asiento. */
export interface ResolvedKameFields {
  rut: string;
  razonSocial: string;
  documento: string;
  folio: string;
  /** Fecha ISO YYYY-MM-DD, o vacio. */
  vencimiento: string;
}

/**
 * Resuelve los cinco campos para una linea.
 *
 * @param fields  Configuracion de la cuenta.
 * @param meta    Metadatos del libro (empresa y periodo).
 * @param worker  Trabajador de la linea, cuando la ficha sale del libro.
 */
export function resolveKameFieldValues(
  fields: ConceptKameFields,
  meta: PayrollMeta,
  worker?: PayrollWorker | null,
): ResolvedKameFields {
  /* --- Ficha: RUT y razon social ---------------------------------------- */
  let rutRaw = '';
  let razonRaw = '';

  switch (fields.fichaSource) {
    case 'TRABAJADOR':
      rutRaw = worker?.rut ?? '';
      razonRaw = worker?.fullName ?? '';
      break;
    case 'EMPRESA':
      rutRaw = meta.companyRut;
      razonRaw = meta.companyName;
      break;
    case 'FIJA':
    default:
      rutRaw = fields.fichaRut;
      razonRaw = fields.fichaRazonSocial;
      break;
  }

  /* --- Folio del documento ----------------------------------------------- */
  const folio =
    fields.folioDocMode === 'PERIODO' ? meta.periodCode : fields.folioDoc.trim();

  /* --- Fecha de vencimiento ---------------------------------------------- */
  const vencimiento =
    fields.vencimientoMode === 'FIJA'
      ? fields.vencimientoFecha.trim()
      : dueDateFromPeriod(meta.periodCode, fields.vencimientoDia);

  // Un campo apagado se emite VACIO: es lo que Kame espera cuando la cuenta
  // no maneja esa columna.
  return {
    rut: fields.rut ? formatRutForKame(rutRaw) : '',
    razonSocial: fields.razonSocial ? razonRaw.trim() : '',
    documento: fields.documento ? fields.nombreDoc.trim() : '',
    folio: fields.folio ? folio : '',
    vencimiento: fields.vencimiento ? vencimiento : '',
  };
}

/**
 * Dia `day` del mes SIGUIENTE al periodo AAAAMM.
 * Ej. periodo 202607 y dia 10 -> "2026-08-10".
 *
 * Si el mes siguiente no tiene ese dia (ej. dia 31 en febrero) se usa el
 * ultimo dia real de ese mes.
 */
export function dueDateFromPeriod(periodCode: string, day: number): string {
  const m = periodCode.match(/^(\d{4})(\d{2})$/);
  if (!m) return '';

  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12 del periodo
  // El mes siguiente en base 1; si el periodo es diciembre pasa a enero.
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const safeDay = Math.min(Math.max(Math.trunc(day) || 1, 1), lastDay);

  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/*  COPIA DE CAMPOS ENTRE CONCEPTOS                                           */
/* -------------------------------------------------------------------------- */

/**
 * Grupos en que se puede copiar la parametrizacion de una cuenta a otras.
 *
 * Se copian por GRUPO y no campo a campo porque los valores de un mismo grupo
 * carecen de sentido por separado: el origen de la ficha sin el RUT del tercero,
 * o el modo de vencimiento sin el dia, dejarian la cuenta destino incoherente.
 */
export type KameFieldGroup = 'ficha' | 'documento' | 'folio' | 'vencimiento';

export const KAME_FIELD_GROUPS: {
  id: KameFieldGroup;
  label: string;
  /** Columnas del archivo Kame que abarca el grupo. */
  columns: string;
  /** Claves de `ConceptKameFields` que viajan juntas. */
  keys: (keyof ConceptKameFields)[];
}[] = [
  {
    id: 'ficha',
    label: 'Ficha (RUT y razon social)',
    columns: 'Rut Ficha · Rzn Social Ficha',
    keys: ['rut', 'razonSocial', 'fichaSource', 'fichaRut', 'fichaRazonSocial'],
  },
  {
    id: 'documento',
    label: 'Documento',
    columns: 'Nombre Doc',
    keys: ['documento', 'nombreDoc'],
  },
  {
    id: 'folio',
    label: 'Folio',
    columns: 'Folio Doc',
    keys: ['folio', 'folioDocMode', 'folioDoc'],
  },
  {
    id: 'vencimiento',
    label: 'Vencimiento',
    columns: 'Fecha Venc',
    keys: ['vencimiento', 'vencimientoMode', 'vencimientoDia', 'vencimientoFecha'],
  },
];

/** Grupos que el concepto tiene efectivamente encendidos. */
export function activeKameFieldGroups(fields: ConceptKameFields): KameFieldGroup[] {
  const out: KameFieldGroup[] = [];
  if (fields.rut || fields.razonSocial) out.push('ficha');
  if (fields.documento) out.push('documento');
  if (fields.folio) out.push('folio');
  if (fields.vencimiento) out.push('vencimiento');
  return out;
}

/**
 * Devuelve `target` con los grupos indicados reemplazados por los de `source`.
 * Los grupos no seleccionados quedan intactos: copiar el documento no toca la
 * ficha que el usuario ya habia parametrizado en la cuenta destino.
 */
export function mergeKameFieldGroups(
  target: ConceptKameFields,
  source: ConceptKameFields,
  groups: KameFieldGroup[],
): ConceptKameFields {
  const merged: ConceptKameFields = { ...target };
  for (const group of KAME_FIELD_GROUPS) {
    if (!groups.includes(group.id)) continue;
    for (const key of group.keys) {
      // El cast es necesario porque las claves tienen tipos distintos entre si;
      // la correspondencia clave-a-clave la garantiza `KAME_FIELD_GROUPS`.
      (merged as unknown as Record<string, unknown>)[key] = source[key];
    }
  }
  return merged;
}

export interface ApplyKameFieldsResult {
  /** Copia del mapa de conceptos con los destinos ya actualizados. */
  concepts: Record<string, ConceptConfig>;
  /** Conceptos efectivamente modificados. */
  appliedTo: string[];
  /** Destinos que se ignoraron, con el motivo. */
  skipped: { conceptId: string; reason: string }[];
}

/**
 * Copia los grupos indicados desde `sourceConceptId` hacia `targetIds`.
 *
 * Funcion PURA: no muta el mapa recibido. Se omiten el propio concepto origen,
 * los identificadores inexistentes y los conceptos que no generan movimiento
 * (totalizadores e informativos), que no tienen columnas analiticas que llenar.
 */
export function applyKameFieldsTo(
  concepts: Record<string, ConceptConfig>,
  sourceConceptId: string,
  targetIds: string[],
  groups: KameFieldGroup[],
): ApplyKameFieldsResult {
  const source = concepts[sourceConceptId];
  if (!source) {
    return {
      concepts,
      appliedTo: [],
      skipped: targetIds.map((id) => ({
        conceptId: id,
        reason: 'El concepto de origen no existe.',
      })),
    };
  }
  if (groups.length === 0) {
    return {
      concepts,
      appliedTo: [],
      skipped: targetIds.map((id) => ({
        conceptId: id,
        reason: 'No se selecciono ningun grupo de campos.',
      })),
    };
  }

  const sourceFields = resolveKameFields(source);
  const next = { ...concepts };
  const appliedTo: string[] = [];
  const skipped: { conceptId: string; reason: string }[] = [];

  for (const id of targetIds) {
    if (id === sourceConceptId) {
      skipped.push({ conceptId: id, reason: 'Es el concepto de origen.' });
      continue;
    }
    const target = concepts[id];
    if (!target) {
      skipped.push({ conceptId: id, reason: 'El concepto no existe en el libro.' });
      continue;
    }
    if (
      target.classification === 'TOTALIZADOR' ||
      target.classification === 'INFORMATIVO'
    ) {
      skipped.push({
        conceptId: id,
        reason: `Clasificado como ${target.classification}: no genera movimiento.`,
      });
      continue;
    }

    next[id] = {
      ...target,
      kameFields: mergeKameFieldGroups(resolveKameFields(target), sourceFields, groups),
    };
    appliedTo.push(id);
  }

  return { concepts: next, appliedTo, skipped };
}

/**
 * Sugiere destinos razonables para la copia: los conceptos contabilizables de
 * la MISMA clasificacion que el origen. Es la agrupacion que en la practica
 * comparte tratamiento analitico (todos los descuentos previsionales van a la
 * misma planilla, todos los aportes del empleador al mismo vencimiento).
 */
export function suggestCopyTargets(
  concepts: Record<string, ConceptConfig>,
  sourceConceptId: string,
): string[] {
  const source = concepts[sourceConceptId];
  if (!source?.classification) return [];
  return Object.values(concepts)
    .filter(
      (c) =>
        c.conceptId !== sourceConceptId &&
        c.include &&
        c.classification === source.classification &&
        c.classification !== 'TOTALIZADOR' &&
        c.classification !== 'INFORMATIVO',
    )
    .map((c) => c.conceptId);
}

/* -------------------------------------------------------------------------- */
/*  DETECCION DE VALORES QUE QUEDARON DEL PERIODO ANTERIOR                    */
/* -------------------------------------------------------------------------- */

const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

/**
 * Detecta si un folio FIJO menciona un periodo distinto del que se esta
 * centralizando: se reconoce tanto "202607" como "JULIO".
 *
 * Existe porque un folio fijo NO se recalcula solo: si el usuario escribio
 * "PLANILLA-JULIO" en julio, en agosto seguiria emitiendo lo mismo.
 * Devuelve el periodo que menciona el folio, o null si no menciona ninguno.
 */
export function detectPeriodInText(text: string): string | null {
  const t = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const numeric = t.match(/\b(20\d{2})(0[1-9]|1[0-2])\b/);
  if (numeric) return `${numeric[1]}${numeric[2]}`;

  const idx = MESES.findIndex((m) => new RegExp(`\\b${m}\\b`).test(t));
  if (idx >= 0) {
    // Si ademas trae un anio de cuatro digitos se usa; si no, solo el mes.
    const year = t.match(/\b(20\d{2})\b/);
    return year ? `${year[1]}${String(idx + 1).padStart(2, '0')}` : `????${String(idx + 1).padStart(2, '0')}`;
  }
  return null;
}

/** true si el periodo detectado en un texto NO corresponde al periodo actual. */
export function mentionsOtherPeriod(text: string, periodCode: string): boolean {
  const found = detectPeriodInText(text);
  if (!found || !periodCode) return false;
  // Cuando el texto solo trae el mes se comparan los dos ultimos digitos.
  if (found.startsWith('????')) return found.slice(-2) !== periodCode.slice(-2);
  return found !== periodCode;
}
