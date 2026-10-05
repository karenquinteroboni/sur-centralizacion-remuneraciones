import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleBukRequest, loadBukCompanies } from '../server/bukProxy';
import { EMPLOYEES, cleanPayroll } from './fixtures/bukFixture';

const env = {
  BUK_COMPANIES: JSON.stringify([
    { id: 'acme', name: 'ACME SPA', rut: '76.123.456-7', subdomain: 'acme', tokenEnv: 'T_ACME' },
    { id: 'sin-token', name: 'OTRA', rut: '1-9', subdomain: 'otra', tokenEnv: 'T_NO_EXISTE' },
  ]),
  T_ACME: 'SECRETO-123',
};
const fetchImpl = vi.fn(async (url: string) => ({
  ok: true, status: 200,
  json: async () => ({ pagination: { next: null, previous: null, count: 0, total_pages: 1 },
    data: url.includes('/employees') ? EMPLOYEES
      : url.includes('/companies') ? [{ id: 2, name: 'ACME SPA', rut: '76.123.456-7' }]
      : cleanPayroll() }),
}));

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (!(await handleBukRequest(req, res, { env, fetchImpl: fetchImpl as any }))) { res.statusCode = 404; res.end(); }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe('loadBukCompanies', () => {
  it('omite empresas sin token y falla con JSON roto', () => {
    expect(loadBukCompanies(env).map((c) => c.id)).toEqual(['acme']);
    expect(loadBukCompanies({})).toEqual([]);
    expect(() => loadBukCompanies({ BUK_COMPANIES: '{no' })).toThrow(/JSON/);
  });
});

describe('proxy', () => {
  it('lista empresas sin exponer tokens', async () => {
    const text = await (await fetch(`${base}/api/buk/companies`)).text();
    expect(JSON.parse(text)).toEqual([{ id: 'acme', name: 'ACME SPA', rut: '76.123.456-7' }]);
    expect(text).not.toMatch(/SECRETO|token/i);
  });

  it('entrega el PayrollBook del periodo', async () => {
    const res = await fetch(`${base}/api/buk/payroll?company=acme&period=202608`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const book = await res.json();
    expect(book.meta.periodCode).toBe('202608');
    expect(book.workers).toHaveLength(3);
  });

  it('404 para empresa no configurada, 422 para periodo invalido, 405 para POST', async () => {
    expect((await fetch(`${base}/api/buk/payroll?company=nada&period=202608`)).status).toBe(404);
    const bad = await fetch(`${base}/api/buk/payroll?company=acme&period=31/08/2026`);
    expect(bad.status).toBe(422);
    expect((await fetch(`${base}/api/buk/payroll?company=acme&period=202608`, { method: 'POST' })).status).toBe(405);
  });

  it('no atiende rutas ajenas', async () => {
    expect((await fetch(`${base}/otra-cosa`)).status).toBe(404);
  });
});
