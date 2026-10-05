/**
 * ============================================================================
 *  TIPOS DEL CATALOGO MULTIEMPRESA
 * ----------------------------------------------------------------------------
 *  El modulo distingue dos fuentes de informacion sobre empresas:
 *
 *   1. CATALOGO MAESTRO  (`Company[]`)
 *      La cartera de clientes que administra el estudio. Lo entrega el
 *      aplicativo anfitrion via prop o via un servicio. Es la lista completa,
 *      incluidas las empresas que todavia no tienen parametrizacion.
 *
 *   2. CONFIGURACION GUARDADA  (`ConfigRepository`)
 *      Lo que ya se parametrizo para cada empresa (cuentas, clasificaciones).
 *
 *  `companyRegistry.ts` fusiona ambas para producir el estado que ve el usuario.
 * ============================================================================
 */

/** Una empresa del catalogo maestro. */
export interface Company {
  /**
   * Clave estable. Por convencion el RUT sin puntos (ej. "76562151-8").
   * Debe coincidir con `CentralizationConfig.companyKey` para que el modulo
   * reconozca la parametrizacion guardada.
   */
  key: string;
  /** Razon social. */
  name: string;
  /** RUT formateado (ej. "76.562.151-8"). Opcional. */
  rut?: string;
  /** Nombre corto o de fantasia, para listados compactos. */
  shortName?: string;
  /** Agrupador libre: holding, cartera, ejecutivo responsable, etc. */
  group?: string;
  /** Persona responsable dentro del estudio. */
  owner?: string;
  /** false para ocultarla del listado sin borrarla. */
  active?: boolean;
  /** Notas internas. */
  notes?: string;
}

/** Estado de parametrizacion de una empresa. */
export type CompanyStatus =
  | 'READY'        // verde   : parametrizada y sin pendientes
  | 'INCOMPLETE'   // amarillo: tiene configuracion pero con conceptos sin cuenta/clasificacion
  | 'UNCONFIGURED' // gris    : nunca se ha parametrizado
  | 'INACTIVE';    // gris    : marcada como inactiva

/** Fila que consume el panel de empresas. */
export interface CompanyRow {
  company: Company;
  status: CompanyStatus;
  /** true si existe configuracion guardada. */
  hasConfig: boolean;
  /** Total de conceptos parametrizados. */
  conceptCount: number;
  /** Conceptos incluidos que aun no tienen cuenta o clasificacion. */
  pendingCount: number;
  /** Conceptos incluidos y listos. */
  readyCount: number;
  /** Ultimo periodo centralizado (AAAAMM), o null. */
  lastPeriod: string | null;
  /** Fecha ISO de la ultima actualizacion de la configuracion. */
  updatedAt: string | null;
}

/** Resumen de la cartera completa. */
export interface PortfolioSummary {
  total: number;
  ready: number;
  incomplete: number;
  unconfigured: number;
  /** Empresas ya centralizadas en el periodo de referencia. */
  processedThisPeriod: number;
  /** Periodo de referencia usado para `processedThisPeriod` (AAAAMM). */
  referencePeriod: string | null;
}
