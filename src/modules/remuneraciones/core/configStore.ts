/**
 * ============================================================================
 *  configStore.ts  —  CONFIGURACION REUTILIZABLE POR EMPRESA
 * ----------------------------------------------------------------------------
 *  Responsabilidades:
 *    1. Construir la configuracion inicial de un libro recien cargado,
 *       fusionando lo que ya estaba guardado para esa empresa.
 *    2. Detectar conceptos NUEVOS (los que requieren parametrizacion).
 *    3. Persistir / recuperar / importar / exportar la configuracion.
 *
 *  La persistencia esta detras de la interfaz `ConfigRepository`. La
 *  implementacion por defecto usa localStorage (procesamiento 100% local),
 *  pero el aplicativo anfitrion puede inyectar la suya (API REST, IndexedDB,
 *  base de datos) sin tocar el resto del modulo.
 * ============================================================================
 */

import type {
  CentralizationConfig,
  ConceptAnalysis,
  ConceptConfig,
  ConceptKameFields,
  ConceptRow,
  ConceptStatus,
  PayrollBook,
  ThirdPartyMode,
  VoucherConfig,
} from '../types/payroll';
import { detectDoubleCounting } from './payrollAnalyzer';
import { defaultVoucherComment } from './kameExporter';
import { buildDefaultKameFields, resolveKameFields } from './kameFields';

// Se re-exportan para que el anfitrion las alcance desde el mismo lugar
// donde vive el resto de la configuracion.
export { buildDefaultKameFields, resolveKameFields };

/* -------------------------------------------------------------------------- */
/*  REPOSITORIO                                                               */
/* -------------------------------------------------------------------------- */

export interface ConfigRepository {
  load(companyKey: string): Promise<CentralizationConfig | null>;
  save(config: CentralizationConfig): Promise<void>;
  remove(companyKey: string): Promise<void>;
  list(): Promise<{ companyKey: string; companyName: string; updatedAt: string }[]>;
}

const STORAGE_PREFIX = 'centralizacion-remuneraciones:config:';

/** Persistencia local en el navegador. No sale ningun dato del equipo. */
export class LocalStorageConfigRepository implements ConfigRepository {
  constructor(private readonly prefix: string = STORAGE_PREFIX) {}

  private available(): boolean {
    try {
      return typeof localStorage !== 'undefined';
    } catch {
      return false;
    }
  }

  async load(companyKey: string): Promise<CentralizationConfig | null> {
    if (!this.available()) return null;
    try {
      const raw = localStorage.getItem(this.prefix + companyKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CentralizationConfig;
      return parsed.schemaVersion === 1 ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(config: CentralizationConfig): Promise<void> {
    if (!this.available()) return;
    try {
      localStorage.setItem(this.prefix + config.companyKey, JSON.stringify(config));
    } catch {
      /* cuota agotada o almacenamiento bloqueado: se ignora silenciosamente */
    }
  }

  async remove(companyKey: string): Promise<void> {
    if (!this.available()) return;
    try {
      localStorage.removeItem(this.prefix + companyKey);
    } catch {
      /* noop */
    }
  }

  async list(): Promise<{ companyKey: string; companyName: string; updatedAt: string }[]> {
    if (!this.available()) return [];
    const out: { companyKey: string; companyName: string; updatedAt: string }[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(this.prefix)) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as CentralizationConfig;
        out.push({
          companyKey: parsed.companyKey,
          companyName: parsed.companyName,
          updatedAt: parsed.updatedAt,
        });
      }
    } catch {
      /* noop */
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

/** Repositorio en memoria: util para pruebas y para entornos sin navegador. */
export class InMemoryConfigRepository implements ConfigRepository {
  private readonly store = new Map<string, CentralizationConfig>();

  async load(companyKey: string) {
    return this.store.get(companyKey) ?? null;
  }
  async save(config: CentralizationConfig) {
    this.store.set(config.companyKey, JSON.parse(JSON.stringify(config)));
  }
  async remove(companyKey: string) {
    this.store.delete(companyKey);
  }
  async list() {
    return [...this.store.values()].map((c) => ({
      companyKey: c.companyKey,
      companyName: c.companyName,
      updatedAt: c.updatedAt,
    }));
  }
}

/* -------------------------------------------------------------------------- */
/*  CLAVE DE EMPRESA                                                          */
/* -------------------------------------------------------------------------- */

/** Clave estable de la empresa: RUT si existe, si no el nombre normalizado. */
export function buildCompanyKey(book: PayrollBook): string {
  if (book.meta.companyRut) return book.meta.companyRut.replace(/\./g, '');
  const name = book.meta.companyName || book.meta.sheetName || 'SIN_EMPRESA';
  return name.toUpperCase().replace(/\s+/g, '_').slice(0, 60);
}

/* -------------------------------------------------------------------------- */
/*  CABECERA DEL COMPROBANTE                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Valores por defecto del comprobante.
 *
 * DECISION: se usa TRASPASO porque una centralizacion de remuneraciones es un
 * asiento de traspaso, no un egreso de caja. Es editable desde la interfaz;
 * el archivo de referencia usaba EGRESO por tratarse de pagos individuales.
 */
export function buildDefaultVoucher(book: PayrollBook): VoucherConfig {
  return {
    tipoComprobante: 'TRASPASO',
    folioAuto: 'S',
    folio: '1',
    fecha: book.meta.periodEndDate,
    comentario: defaultVoucherComment(book),
    unidadNegocio: 'Casa Matriz',
    numeroMovimiento: book.meta.periodCode,
    tipoMovimiento: '',
    nombreDoc: '',
    folioDoc: '',
  };
}

/* -------------------------------------------------------------------------- */
/*  CONSTRUCCION / FUSION DE CONFIGURACION                                    */
/* -------------------------------------------------------------------------- */

export interface BuildConfigResult {
  config: CentralizationConfig;
  /** Conceptos que no existian en la configuracion guardada. */
  newConceptIds: string[];
  /** Conceptos guardados que ya no aparecen en el libro actual. */
  missingConceptIds: string[];
  /** true si se reutilizo una configuracion existente. */
  reusedExisting: boolean;
}

/**
 * Construye la configuracion de trabajo para un libro recien cargado.
 *
 * - Reutiliza lo guardado para la empresa (por identificador interno y, como
 *   respaldo, por titulo + ocurrencia).
 * - NUNCA asume una cuenta para un concepto nuevo: queda vacia y marcada.
 */
export function buildWorkingConfig(
  book: PayrollBook,
  analyses: Record<string, ConceptAnalysis>,
  existing: CentralizationConfig | null,
): BuildConfigResult {
  const companyKey = buildCompanyKey(book);
  const concepts: Record<string, ConceptConfig> = {};
  const newConceptIds: string[] = [];

  // Indice de respaldo: titulo normalizado -> lista de configuraciones guardadas
  // en orden de ocurrencia. Permite re-emparejar si cambia el orden de columnas.
  const byLabel = new Map<string, ConceptConfig[]>();
  if (existing) {
    for (const cfg of Object.values(existing.concepts)) {
      const key = cfg.label.trim().toUpperCase();
      const list = byLabel.get(key) ?? [];
      list.push(cfg);
      byLabel.set(key, list);
    }
  }
  const labelCursor = new Map<string, number>();

  for (const concept of book.concepts) {
    const analysis = analyses[concept.id];

    let saved = existing?.concepts[concept.id];
    if (!saved && existing) {
      const key = concept.label.trim().toUpperCase();
      const list = byLabel.get(key);
      if (list) {
        const cursor = labelCursor.get(key) ?? 0;
        if (cursor < list.length) {
          saved = list[cursor];
          labelCursor.set(key, cursor + 1);
        }
      }
    }

    if (saved) {
      concepts[concept.id] = {
        ...saved,
        conceptId: concept.id,
        label: concept.label,
      };
    } else {
      if (existing) newConceptIds.push(concept.id);
      concepts[concept.id] = buildDefaultConceptConfig(concept.id, concept.label, analysis);
    }
  }

  const missingConceptIds = existing
    ? Object.keys(existing.concepts).filter((id) => !concepts[id])
    : [];

  const config: CentralizationConfig = {
    schemaVersion: 1,
    companyKey,
    companyName: book.meta.companyName || existing?.companyName || '',
    updatedAt: new Date().toISOString(),
    voucher: existing
      ? {
          ...existing.voucher,
          // La fecha y el numero de movimiento SIEMPRE siguen al periodo cargado.
          fecha: book.meta.periodEndDate || existing.voucher.fecha,
          numeroMovimiento: book.meta.periodCode || existing.voucher.numeroMovimiento,
          comentario: defaultVoucherComment(book),
        }
      : buildDefaultVoucher(book),
    concepts,
  };

  return {
    config,
    newConceptIds,
    missingConceptIds,
    reusedExisting: Boolean(existing),
  };
}

/**
 * Configuracion por defecto de un concepto nuevo.
 * La cuenta queda SIEMPRE vacia: el sistema no inventa cuentas contables.
 */
export function buildDefaultConceptConfig(
  conceptId: string,
  label: string,
  analysis?: ConceptAnalysis,
): ConceptConfig {
  const classification = analysis?.suggestedClassification ?? null;
  const noEntry = classification === 'TOTALIZADOR' || classification === 'INFORMATIVO';
  const thirdPartyMode = analysis?.suggestedThirdPartyMode ?? 'CONSOLIDATED';

  return {
    conceptId,
    label,
    // Los totalizadores e informativos se excluyen por defecto: es el
    // comportamiento seguro frente a la doble contabilizacion.
    include: !noEntry,
    classification,
    account: '',
    expenseAccount: classification === 'APORTE_EMPLEADOR' ? '' : undefined,
    liabilityAccount: classification === 'APORTE_EMPLEADOR' ? '' : undefined,
    thirdPartyMode,
    lineComment: '',
    businessUnit: '',
    notes: '',
    kameFields: buildDefaultKameFields(thirdPartyMode),
  };
}

/* -------------------------------------------------------------------------- */
/*  FILAS ENRIQUECIDAS PARA LA TABLA DE CONCEPTOS                             */
/* -------------------------------------------------------------------------- */

/**
 * Combina concepto + analisis + configuracion y calcula el semaforo de estado
 * y la advertencia de doble contabilizacion. Es lo que consume la UI.
 */
export function buildConceptRows(
  book: PayrollBook,
  analyses: Record<string, ConceptAnalysis>,
  config: CentralizationConfig,
  newConceptIds: Set<string>,
): ConceptRow[] {
  const includedForEntries = new Set(
    Object.values(config.concepts)
      .filter(
        (c) =>
          c.include &&
          c.classification &&
          c.classification !== 'TOTALIZADOR' &&
          c.classification !== 'INFORMATIVO',
      )
      .map((c) => c.conceptId),
  );

  const findings = detectDoubleCounting(book, analyses, includedForEntries);
  const warningByConcept = new Map(findings.map((f) => [f.totalizerConceptId, f.message]));

  return book.concepts.map((concept) => {
    const analysis = analyses[concept.id];
    const cfg = config.concepts[concept.id] ?? buildDefaultConceptConfig(concept.id, concept.label, analysis);
    const isNew = newConceptIds.has(concept.id);

    return {
      concept,
      analysis,
      config: cfg,
      status: computeStatus(cfg, isNew),
      isNew,
      doubleCountWarning: warningByConcept.get(concept.id) ?? null,
    };
  });
}

/** Semaforo del concepto. */
export function computeStatus(cfg: ConceptConfig, isNew: boolean): ConceptStatus {
  if (!cfg.include) return 'EXCLUDED';
  if (!cfg.classification) return isNew ? 'NEW' : 'PENDING';
  if (cfg.classification === 'TOTALIZADOR' || cfg.classification === 'INFORMATIVO') {
    return 'EXCLUDED';
  }
  if (cfg.classification === 'APORTE_EMPLEADOR') {
    const expense = cfg.expenseAccount?.trim() || cfg.account?.trim();
    const liability = cfg.liabilityAccount?.trim();
    if (!expense || !liability) return isNew ? 'NEW' : 'PENDING';
    return 'OK';
  }
  if (!cfg.account?.trim()) return isNew ? 'NEW' : 'PENDING';
  return 'OK';
}

/* -------------------------------------------------------------------------- */
/*  IMPORTAR / EXPORTAR JSON                                                  */
/* -------------------------------------------------------------------------- */

/** Serializa la configuracion a JSON legible. */
export function exportConfigToJson(config: CentralizationConfig): string {
  return JSON.stringify(config, null, 2);
}

/** Lee una configuracion desde JSON, validando lo minimo indispensable. */
export function importConfigFromJson(json: string): CentralizationConfig {
  const parsed = JSON.parse(json) as CentralizationConfig;
  if (parsed?.schemaVersion !== 1) {
    throw new Error('El archivo no corresponde a una configuracion valida (schemaVersion !== 1).');
  }
  if (!parsed.concepts || typeof parsed.concepts !== 'object') {
    throw new Error('La configuracion no contiene la seccion "concepts".');
  }
  for (const [id, cfg] of Object.entries(parsed.concepts)) {
    cfg.conceptId = id;
    cfg.include = Boolean(cfg.include);
    cfg.account = cfg.account ?? '';
    cfg.thirdPartyMode = cfg.thirdPartyMode === 'PER_WORKER' ? 'PER_WORKER' : 'CONSOLIDATED';
  }
  return parsed;
}
