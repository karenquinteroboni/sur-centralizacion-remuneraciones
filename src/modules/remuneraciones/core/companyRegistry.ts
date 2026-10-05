/**
 * ============================================================================
 *  companyRegistry.ts  —  FUSION DEL CATALOGO MAESTRO CON LO PARAMETRIZADO
 * ----------------------------------------------------------------------------
 *  Funciones puras: reciben el catalogo de empresas y las configuraciones
 *  guardadas, y devuelven el estado que muestra el panel multiempresa.
 *  Sin React, sin DOM: testeable en Node.
 * ============================================================================
 */

import type {
  Company,
  CompanyRow,
  CompanyStatus,
  PortfolioSummary,
} from '../types/company';
import type { CentralizationConfig } from '../types/payroll';
import type { ConfigRepository } from './configStore';
import { computeStatus } from './configStore';
import { formatRut } from '../utils/rutValidator';

/* -------------------------------------------------------------------------- */
/*  NORMALIZACION DEL CATALOGO                                                */
/* -------------------------------------------------------------------------- */

/**
 * Normaliza una entrada del catalogo. Acepta formatos laxos para que el
 * aplicativo anfitrion pueda entregar su listado tal como lo tenga:
 * un string, {nombre, rut}, {name, rut}, etc.
 */
export function normalizeCompany(input: Company | string | Record<string, unknown>): Company {
  if (typeof input === 'string') {
    // "76.562.151-8 JOSE HERRERA SPA" o simplemente "JOSE HERRERA SPA"
    const m = input.match(/^\s*(\d{1,3}(?:\.\d{3})*-[0-9kK])\s*[-–|,]?\s*(.+)$/);
    if (m) {
      const rut = formatRut(m[1]);
      return { key: rut.replace(/\./g, ''), name: m[2].trim(), rut, active: true };
    }
    const name = input.trim();
    return { key: slugKey(name), name, active: true };
  }

  const raw = input as Record<string, unknown>;
  const name = String(raw.name ?? raw.nombre ?? raw.razonSocial ?? raw.company ?? '').trim();
  const rutRaw = String(raw.rut ?? raw.RUT ?? raw.taxId ?? '').trim();
  const rut = rutRaw ? formatRut(rutRaw) : undefined;
  const key = String(raw.key ?? raw.companyKey ?? raw.id ?? '').trim()
    || (rut ? rut.replace(/\./g, '') : slugKey(name));

  // Se PRESERVAN los campos propios del anfitrion (responsables, complejidad,
  // servicios, lo que sea): el modulo solo normaliza los que conoce y deja
  // pasar el resto para que `renderCompanyExtra` y las facetas puedan usarlos.
  return {
    ...(raw as object),
    key,
    name: name || key,
    rut,
    shortName: raw.shortName ? String(raw.shortName) : undefined,
    group: raw.group ? String(raw.group) : raw.grupo ? String(raw.grupo) : undefined,
    owner: raw.owner ? String(raw.owner) : raw.responsable ? String(raw.responsable) : undefined,
    active: raw.active === undefined ? true : Boolean(raw.active),
    notes: raw.notes ? String(raw.notes) : undefined,
  } as Company;
}

function slugKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .slice(0, 60) || 'SIN_EMPRESA';
}

/** Normaliza un catalogo completo y descarta duplicados por clave. */
export function normalizeCatalog(
  input: (Company | string | Record<string, unknown>)[],
): Company[] {
  const seen = new Set<string>();
  const out: Company[] = [];
  for (const item of input) {
    const c = normalizeCompany(item);
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    out.push(c);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  ESTADO POR EMPRESA                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Calcula el estado de una empresa a partir de su configuracion guardada.
 * Si no hay configuracion, la empresa queda como UNCONFIGURED (nunca se
 * asume nada: es el mismo principio que rige las cuentas contables).
 */
export function buildCompanyRow(
  company: Company,
  config: CentralizationConfig | null,
): CompanyRow {
  if (company.active === false) {
    return {
      company,
      status: 'INACTIVE',
      hasConfig: Boolean(config),
      conceptCount: config ? Object.keys(config.concepts).length : 0,
      pendingCount: 0,
      readyCount: 0,
      lastPeriod: config?.voucher.numeroMovimiento || null,
      updatedAt: config?.updatedAt ?? null,
    };
  }

  if (!config) {
    return {
      company,
      status: 'UNCONFIGURED',
      hasConfig: false,
      conceptCount: 0,
      pendingCount: 0,
      readyCount: 0,
      lastPeriod: null,
      updatedAt: null,
    };
  }

  let pending = 0;
  let ready = 0;
  for (const cfg of Object.values(config.concepts)) {
    if (!cfg.include) continue;
    const status = computeStatus(cfg, false);
    if (status === 'OK') ready++;
    else if (status === 'PENDING' || status === 'NEW' || status === 'ERROR') pending++;
  }

  return {
    company,
    status: pending > 0 ? 'INCOMPLETE' : 'READY',
    hasConfig: true,
    conceptCount: Object.keys(config.concepts).length,
    pendingCount: pending,
    readyCount: ready,
    lastPeriod: config.voucher.numeroMovimiento || null,
    updatedAt: config.updatedAt ?? null,
  };
}

/** Construye todas las filas leyendo el repositorio de configuraciones. */
export async function buildCompanyRows(
  catalog: Company[],
  repository: ConfigRepository,
): Promise<CompanyRow[]> {
  const rows: CompanyRow[] = [];
  for (const company of catalog) {
    let config: CentralizationConfig | null = null;
    try {
      config = await repository.load(company.key);
    } catch {
      config = null;
    }
    rows.push(buildCompanyRow(company, config));
  }
  return rows;
}

/* -------------------------------------------------------------------------- */
/*  RESUMEN DE CARTERA                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Resume la cartera. `referencePeriod` (AAAAMM) permite contar cuantas
 * empresas ya fueron centralizadas en el periodo en curso.
 */
export function summarizePortfolio(
  rows: CompanyRow[],
  referencePeriod: string | null = null,
): PortfolioSummary {
  const summary: PortfolioSummary = {
    total: rows.length,
    ready: 0,
    incomplete: 0,
    unconfigured: 0,
    processedThisPeriod: 0,
    referencePeriod,
  };

  for (const row of rows) {
    if (row.status === 'READY') summary.ready++;
    else if (row.status === 'INCOMPLETE') summary.incomplete++;
    else if (row.status === 'UNCONFIGURED') summary.unconfigured++;

    if (referencePeriod && row.lastPeriod === referencePeriod) {
      summary.processedThisPeriod++;
    }
  }

  return summary;
}

/** Periodo AAAAMM anterior al actual (el que normalmente se esta cerrando). */
export function previousPeriodCode(reference: Date = new Date()): string {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth(); // 0-11; el mes anterior en base 1 es exactamente `m`
  if (m === 0) return `${y - 1}12`;
  return `${y}${String(m).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/*  BUSQUEDA Y ORDEN                                                          */
/* -------------------------------------------------------------------------- */

/** Filtra por texto libre sobre nombre, RUT, grupo y responsable. */
export function filterCompanyRows(rows: CompanyRow[], term: string): CompanyRow[] {
  const t = term.trim().toUpperCase();
  if (!t) return rows;
  return rows.filter((row) => {
    const c = row.company;
    return (
      c.name.toUpperCase().includes(t) ||
      (c.shortName ?? '').toUpperCase().includes(t) ||
      (c.rut ?? '').toUpperCase().includes(t) ||
      (c.group ?? '').toUpperCase().includes(t) ||
      (c.owner ?? '').toUpperCase().includes(t) ||
      c.key.toUpperCase().includes(t)
    );
  });
}

const STATUS_ORDER: Record<CompanyStatus, number> = {
  INCOMPLETE: 0,
  UNCONFIGURED: 1,
  READY: 2,
  INACTIVE: 3,
};

/** Ordena poniendo primero lo que requiere atencion. */
export function sortCompanyRows(
  rows: CompanyRow[],
  by: 'attention' | 'name' | 'status' = 'attention',
): CompanyRow[] {
  const copy = [...rows];
  if (by === 'name') {
    return copy.sort((a, b) => a.company.name.localeCompare(b.company.name, 'es'));
  }
  return copy.sort((a, b) => {
    const d = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (d !== 0) return d;
    return a.company.name.localeCompare(b.company.name, 'es');
  });
}

/** Agrupa por el campo `group` del catalogo (holding, cartera, ejecutivo...). */
export function groupCompanyRows(rows: CompanyRow[]): Map<string, CompanyRow[]> {
  const map = new Map<string, CompanyRow[]>();
  for (const row of rows) {
    const key = row.company.group ?? 'Sin agrupar';
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}
