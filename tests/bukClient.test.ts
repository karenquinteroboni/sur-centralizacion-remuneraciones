import { describe, expect, it, vi } from 'vitest';
import { BukApiError, fetchPayrollBook, fetchPayrollMonth, type BukCompany } from '../server/bukClient';
import { EMPLOYEES, buildRecord, cleanPayroll } from './fixtures/bukFixture';

const company: BukCompany = {
  id: 'x', name: 'EMPRESA PRUEBA SPA', rut: '76.123.456-7', subdomain: 'acme', token: 'SECRETO-123',
};
const noSleep = async () => {};

const page = (data: unknown[], next: string | null) => ({
  ok: true, status: 200,
  json: async () => ({ pagination: { next, previous: null, count: data.length, total_pages: 2 }, data }),
});
const status = (code: number) => ({ ok: false, status: code, json: async () => ({ detail: 'DATOS PERSONALES' }) });

describe('fetchPayrollMonth', () => {
  it('pide la fecha en ISO, envia auth_token y recorre la paginacion', async () => {
    const urls: string[] = [];
    const headers: Record<string, string>[] = [];
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      urls.push(url);
      headers.push(init.headers);
      return urls.length === 1
        ? page([{ a: 1 }], 'https://acme.buk.cl/api/v1/chile/payroll_detail/month?date=2026-08-31&page=2')
        : page([{ a: 2 }], null);
    });
    const out = await fetchPayrollMonth(company, '202608', { fetchImpl: fetchImpl as any });
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
    expect(urls[0]).toBe('https://acme.buk.cl/api/v1/chile/payroll_detail/month?date=2026-08-31');
    expect(urls[0]).not.toContain('%2F');
    expect(headers[0]).toMatchObject({ auth_token: 'SECRETO-123', Accept: 'application/json' });
  });

  it('no envia el token a otro host si `next` apunta fuera', async () => {
    const fetchImpl = vi.fn(async () => page([{}], 'https://evil.example.com/steal'));
    await expect(fetchPayrollMonth(company, '202608', { fetchImpl: fetchImpl as any })).rejects.toThrow(/otro host/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rechaza http plano en la paginacion', async () => {
    const fetchImpl = vi.fn(async () => page([{}], 'http://acme.buk.cl/x'));
    await expect(fetchPayrollMonth(company, '202608', { fetchImpl: fetchImpl as any })).rejects.toThrow(/otro host/);
  });

  it('reintenta 5xx y se recupera', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (++n < 3 ? status(503) : page([{ ok: 1 }], null)));
    const out = await fetchPayrollMonth(company, '202608', { fetchImpl: fetchImpl as any, sleep: noSleep });
    expect(out).toEqual([{ ok: 1 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('no reintenta 4xx y no filtra el cuerpo ni el token en el error', async () => {
    const fetchImpl = vi.fn(async () => status(401));
    const err: BukApiError = await fetchPayrollMonth(company, '202608', { fetchImpl: fetchImpl as any, sleep: noSleep }).catch((e) => e);
    expect(err).toBeInstanceOf(BukApiError);
    expect(err.status).toBe(401);
    expect(err.message).not.toMatch(/SECRETO|PERSONALES/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falla con red caida tras agotar reintentos', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNRESET'); });
    await expect(fetchPayrollMonth(company, '202608', { fetchImpl: fetchImpl as any, sleep: noSleep, maxRetries: 1 })).rejects.toThrow(/No fue posible/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('valida el periodo y el subdominio antes de llamar', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchPayrollMonth(company, '31/08/2026', { fetchImpl: fetchImpl as any })).rejects.toThrow(/Periodo invalido/);
    await expect(fetchPayrollMonth({ ...company, subdomain: 'a.evil.com/x' }, '202608', { fetchImpl: fetchImpl as any })).rejects.toThrow(/Subdominio/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('fetchPayrollBook', () => {
  const COMPANY_A = { id: 2, name: 'EMPRESA PRUEBA SPA', rut: '76.123.456-7' };
  const COMPANY_B = { id: 3, name: 'OTRA SPA', rut: '77.000.000-0' };
  const withCompany = (cid: number) => EMPLOYEES.map((e) => ({ ...e, current_job: { ...(e.current_job ?? {}), company_id: cid } }));

  const route = (payroll: unknown[], companies = [COMPANY_A], employees: unknown[] = EMPLOYEES) =>
    vi.fn(async (url: string) =>
      url.includes('/employees') ? page(employees, null)
      : url.includes('/companies') ? page(companies, null)
      : page(payroll, null));

  it('integra liquidaciones + empleados + empresa en un PayrollBook', async () => {
    const book = await fetchPayrollBook({ ...company, name: '', rut: '' }, '2026-08', { fetchImpl: route(cleanPayroll()) as any });
    expect(book.workers).toHaveLength(3);
    expect(book.workers[0].fullName).toBe('Ana Prueba Uno');
    // Nombre y RUT salen de Buk /companies cuando no se configuran.
    expect(book.meta).toMatchObject({ companyName: 'EMPRESA PRUEBA SPA', companyRut: '76.123.456-7' });
  });

  it('rechaza si el RUT configurado no es el de la empresa en Buk', async () => {
    const bad = { ...company, rut: '99.999.999-9' };
    await expect(fetchPayrollBook(bad, '2026-08', { fetchImpl: route(cleanPayroll()) as any })).rejects.toThrow(/no coincide/);
  });

  it('cuenta con varias empresas sin bukCompanyId: aborta en vez de mezclar empresas', async () => {
    await expect(fetchPayrollBook(company, '2026-08', { fetchImpl: route(cleanPayroll(), [COMPANY_A, COMPANY_B]) as any }))
      .rejects.toThrow(/2 empresas; configure bukCompanyId/);
  });

  it('con varias empresas filtra solo a los trabajadores de la elegida', async () => {
    const emps = [
      ...withCompany(2).slice(0, 2),
      { ...withCompany(3)[2] }, // la tercera trabajadora es de OTRA empresa
    ];
    const book = await fetchPayrollBook(
      { ...company, rut: '', bukCompanyId: 2 }, '2026-08',
      { fetchImpl: route(cleanPayroll(), [COMPANY_A, COMPANY_B], emps) as any },
    );
    expect(book.workers.map((w) => w.fullName)).toEqual(['Ana Prueba Uno', 'Beto Prueba Dos']);
    expect(book.meta.companyName).toBe('EMPRESA PRUEBA SPA');
  });

  it('bukCompanyId inexistente en la cuenta falla', async () => {
    await expect(fetchPayrollBook({ ...company, bukCompanyId: 99 }, '2026-08', { fetchImpl: route(cleanPayroll(), [COMPANY_A, COMPANY_B]) as any }))
      .rejects.toThrow(/no tiene la empresa id 99/);
  });

  it('aborta si Buk devuelve el mes abierto en vez del pedido', async () => {
    const abierto = [buildRecord({ id: 1, rut: '11111111-1', base: 1, month: 10, closed: false })];
    await expect(fetchPayrollBook(company, '2026-08', { fetchImpl: route(abierto) as any })).rejects.toThrow(/periodo distinto/);
  });
});
