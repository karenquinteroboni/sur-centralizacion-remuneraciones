/**
 * Proxy HTTP minimo entre el navegador y Buk.
 *
 *   GET /api/buk/companies                       -> [{ id, name, rut }]   (sin tokens)
 *   GET /api/buk/payroll?company=ID&period=AAAAMM -> PayrollBook (JSON)
 *
 * Configuracion por variables de entorno (nunca en el repo ni en el navegador):
 *   BUK_COMPANIES = JSON: [{"id":"exteriliza","name":"EXTERILIZA SPA","rut":"76.282.756-5",
 *                           "subdomain":"exteriliza","tokenEnv":"BUK_TOKEN_EXTERILIZA"}]
 *     `name` y `rut` son opcionales (se toman de Buk /companies); si se informan, el
 *     RUT se verifica contra Buk. Si la cuenta tiene varias empresas, `bukCompanyId`
 *     (id de la empresa en Buk) es obligatorio.
 *   BUK_TOKEN_EXTERILIZA = token de solo lectura limitado a esa empresa.
 *
 * Si se publica fuera de localhost, ponga este proxy detras de autenticacion:
 * cada llamada devuelve remuneraciones de personas.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { BukApiError, fetchPayrollBook, type BukClientOptions, type BukCompany } from './bukClient';

interface CompanyEntry {
  id: string;
  name: string;
  rut: string;
  subdomain: string;
  tokenEnv: string;
  bukCompanyId?: number;
}

export function loadBukCompanies(env: Record<string, string | undefined>): BukCompany[] {
  const raw = env.BUK_COMPANIES;
  if (!raw) return [];
  let entries: CompanyEntry[];
  try {
    entries = JSON.parse(raw);
  } catch {
    throw new Error('BUK_COMPANIES no es un JSON valido.');
  }
  return entries
    .map((e) => ({
      id: e.id,
      name: e.name,
      rut: e.rut,
      subdomain: e.subdomain,
      token: env[e.tokenEnv] ?? '',
      bukCompanyId: e.bukCompanyId,
    }))
    .filter((c) => c.token !== '');
}

export interface BukProxyOptions extends BukClientOptions {
  env?: Record<string, string | undefined>;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Devuelve true si atendio la peticion. */
export async function handleBukRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: BukProxyOptions = {},
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/buk/')) return false;
  if (req.method !== 'GET') {
    send(res, 405, { error: 'Metodo no permitido.' });
    return true;
  }

  const companies = loadBukCompanies(options.env ?? process.env);

  if (url.pathname === '/api/buk/companies') {
    send(res, 200, companies.map(({ id, name, rut }) => ({ id, name, rut })));
    return true;
  }

  if (url.pathname === '/api/buk/payroll') {
    const company = companies.find((c) => c.id === url.searchParams.get('company'));
    const period = url.searchParams.get('period') ?? '';
    if (!company) {
      send(res, 404, { error: 'Empresa no configurada para Buk.' });
      return true;
    }
    try {
      const book = await fetchPayrollBook(company, period, options);
      send(res, 200, book);
    } catch (e) {
      const status = e instanceof BukApiError ? 502 : 422;
      send(res, status, { error: e instanceof Error ? e.message : 'Error inesperado.' });
    }
    return true;
  }

  send(res, 404, { error: 'Ruta desconocida.' });
  return true;
}
