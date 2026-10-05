/**
 * Lado navegador de la fuente Buk: habla SOLO con el proxy propio (`/api/buk`),
 * nunca con Buk directamente. El token vive unicamente en el servidor.
 */
import type { PayrollBook } from '../../types/payroll';

export interface BukCompanyOption {
  id: string;
  name: string;
  rut: string;
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Empresas con Buk configurado. Devuelve [] si el proxy no existe (la UI oculta la opcion). */
export async function listBukCompanies(endpoint = '/api/buk'): Promise<BukCompanyOption[]> {
  try {
    const res = await fetch(`${endpoint}/companies`);
    if (!res.ok) return [];
    const data = await readJson(res);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchBukBook(
  companyId: string,
  period: string,
  endpoint = '/api/buk',
): Promise<PayrollBook> {
  const q = new URLSearchParams({ company: companyId, period });
  const res = await fetch(`${endpoint}/payroll?${q}`);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error ?? `El servidor respondio HTTP ${res.status}.`);
  return data as PayrollBook;
}
