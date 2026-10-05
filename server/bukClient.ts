/**
 * Cliente de la API de Buk Chile. SOLO servidor: el token jamas llega al navegador.
 *
 * Hechos verificados contra la API real (exteriliza.buk.cl):
 *  - Auth: header `auth_token`.
 *  - `date` DEBE ir en ISO AAAA-MM-DD. El formato DD/MM/AAAA NO falla: Buk lo
 *    ignora y devuelve el mes abierto (borrador), y 01/08/2026 lo lee como 8 de enero.
 *  - `page_size` se ignora; la pagina real es de 25. Se pagina por `pagination.next`.
 *  - Sin cabecera `Accept` / User-Agent reconocible algunos clientes reciben 406.
 */

import {
  buildPayrollBookFromBuk,
  parseBukPeriod,
  periodEndIso,
} from '../src/modules/remuneraciones/core/buk/bukAdapter';
import type {
  BukCompanyRecord,
  BukEmployee,
  BukPage,
  BukPayrollRecord,
} from '../src/modules/remuneraciones/core/buk/bukTypes';
import type { PayrollBook } from '../src/modules/remuneraciones/types/payroll';

export interface BukCompany {
  id: string;
  name: string;
  rut: string;
  /** Subdominio de la cuenta: "exteriliza" -> https://exteriliza.buk.cl */
  subdomain: string;
  token: string;
  /**
   * Id de la empresa DENTRO de la cuenta Buk. Obligatorio si la cuenta tiene mas
   * de una razon social: `payroll_detail` no informa a que empresa pertenece cada
   * liquidacion, y sin filtrar se contabilizaria gente de otra empresa.
   */
  bukCompanyId?: number;
}

export interface BukClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  /** Espera entre reintentos; inyectable para pruebas. */
  sleep?: (ms: number) => Promise<void>;
  maxPages?: number;
}

export class BukApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'BukApiError';
  }
}

const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function baseUrl(company: BukCompany): string {
  if (!SUBDOMAIN_RE.test(company.subdomain)) {
    throw new BukApiError(`Subdominio de Buk invalido para ${company.id}.`);
  }
  return `https://${company.subdomain}.buk.cl/api/v1/chile`;
}

async function request(
  company: BukCompany,
  url: string,
  opts: BukClientOptions,
): Promise<unknown> {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const retries = opts.maxRetries ?? 3;

  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
    try {
      const res = await doFetch(url, {
        headers: {
          auth_token: company.token,
          Accept: 'application/json',
          'User-Agent': 'sur-centralizacion-remuneraciones/1.0',
        },
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
      }
      if (!res.ok) {
        // Nunca se incluye el cuerpo ni la URL completa: pueden contener datos personales.
        throw new BukApiError(`Buk respondio HTTP ${res.status}.`, res.status);
      }
      return await res.json();
    } catch (e) {
      if (e instanceof BukApiError) throw e;
      if (attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new BukApiError('No fue posible comunicarse con Buk (red o tiempo de espera).');
    } finally {
      clearTimeout(timer);
    }
  }
}

async function fetchAllPages<T>(
  company: BukCompany,
  firstUrl: string,
  opts: BukClientOptions,
): Promise<T[]> {
  const host = `${company.subdomain}.buk.cl`;
  const out: T[] = [];
  let url: string | null = firstUrl;
  let pages = 0;
  while (url) {
    // El token solo se envia al host de la cuenta, aunque `next` diga otra cosa.
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== host) {
      throw new BukApiError('Buk devolvio un enlace de paginacion hacia otro host; se aborta.');
    }
    if (++pages > (opts.maxPages ?? 200)) {
      throw new BukApiError('Paginacion excede el maximo de paginas permitido.');
    }
    const page = (await request(company, url, opts)) as BukPage<T>;
    if (!page || !Array.isArray(page.data) || !page.pagination) {
      throw new BukApiError('Respuesta de Buk con formato inesperado.');
    }
    out.push(...page.data);
    url = page.pagination.next ?? null;
  }
  return out;
}

export async function fetchPayrollMonth(
  company: BukCompany,
  period: string,
  opts: BukClientOptions = {},
): Promise<BukPayrollRecord[]> {
  const { year, month } = parseBukPeriod(period);
  const date = periodEndIso(year, month); // ISO: unico formato que Buk respeta
  return fetchAllPages<BukPayrollRecord>(
    company,
    `${baseUrl(company)}/payroll_detail/month?date=${date}`,
    opts,
  );
}

/** Incluye activos e inactivos: un trabajador desvinculado en el mes igual tiene liquidacion. */
export function fetchEmployees(
  company: BukCompany,
  opts: BukClientOptions = {},
): Promise<BukEmployee[]> {
  return fetchAllPages<BukEmployee>(company, `${baseUrl(company)}/employees`, opts);
}

export function fetchBukCompanies(
  company: BukCompany,
  opts: BukClientOptions = {},
): Promise<BukCompanyRecord[]> {
  return fetchAllPages<BukCompanyRecord>(company, `${baseUrl(company)}/companies`, opts);
}

const plainRut = (r: string | null | undefined) => String(r ?? '').replace(/[^0-9kK]/g, '').toUpperCase();

export async function fetchPayrollBook(
  company: BukCompany,
  period: string,
  opts: BukClientOptions & { allowOpen?: boolean } = {},
): Promise<PayrollBook> {
  const [payroll, allEmployees, companies] = await Promise.all([
    fetchPayrollMonth(company, period, opts),
    fetchEmployees(company, opts),
    fetchBukCompanies(company, opts),
  ]);

  // --- Resolver a que empresa de la cuenta corresponde esta centralizacion ---
  let target: BukCompanyRecord | undefined;
  if (company.bukCompanyId !== undefined) {
    target = companies.find((c) => c.id === company.bukCompanyId);
    if (!target) throw new BukApiError(`La cuenta de Buk no tiene la empresa id ${company.bukCompanyId}.`);
  } else if (companies.length === 1) {
    target = companies[0];
  } else {
    throw new BukApiError(
      `La cuenta de Buk tiene ${companies.length} empresas; configure bukCompanyId para ${company.id}.`,
    );
  }

  // Salvaguarda: el RUT configurado debe ser el de la empresa de Buk.
  if (company.rut && target.rut && plainRut(company.rut) !== plainRut(target.rut)) {
    throw new BukApiError(
      `El RUT configurado (${company.rut}) no coincide con el de la empresa en Buk (${target.rut}).`,
    );
  }

  // Con varias empresas, solo cuentan los trabajadores cuya ficha pertenece a la elegida.
  let employees = allEmployees;
  let records = payroll;
  if (companies.length > 1) {
    employees = allEmployees.filter((e) => e.current_job?.company_id === target!.id);
    const ruts = new Set(employees.map((e) => plainRut(e.rut)));
    records = payroll.filter((p) => ruts.has(plainRut(p.rut)));
  }

  return buildPayrollBookFromBuk({
    payroll: records,
    employees,
    company: { name: company.name || target.name, rut: company.rut || target.rut },
    period,
    allowOpen: opts.allowOpen,
  });
}
