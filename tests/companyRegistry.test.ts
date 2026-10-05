/**
 * PRUEBA 6 — Catalogo multiempresa.
 *
 * Las empresas usadas aqui son ficticias. Lo que se verifica es la mecanica:
 * normalizacion, fusion con la configuracion guardada y resumen de cartera.
 */

import { describe, expect, it } from 'vitest';
import {
  buildCompanyRow,
  buildCompanyRows,
  filterCompanyRows,
  normalizeCatalog,
  normalizeCompany,
  previousPeriodCode,
  sortCompanyRows,
  summarizePortfolio,
} from '../src/modules/remuneraciones/core/companyRegistry';
import { InMemoryConfigRepository } from '../src/modules/remuneraciones/core/configStore';
import type { Company } from '../src/modules/remuneraciones/types/company';
import { buildScenario } from './helpers';

const DEMO: Company[] = [
  { key: '76111111-1', name: 'EMPRESA UNO SPA', rut: '76.111.111-1', group: 'GRUPO A' },
  { key: '77222222-2', name: 'EMPRESA DOS SPA', rut: '77.222.222-2', group: 'GRUPO A' },
  { key: '78333333-3', name: 'EMPRESA TRES LTDA', rut: '78.333.333-3' },
];

describe('companyRegistry — normalizacion del catalogo', () => {
  it('acepta un string con RUT y nombre', () => {
    const c = normalizeCompany('76.111.111-1 EMPRESA UNO SPA');
    expect(c.name).toBe('EMPRESA UNO SPA');
    expect(c.rut).toBe('76.111.111-1');
    expect(c.key).toBe('76111111-1');
  });

  it('acepta un string con solo el nombre', () => {
    const c = normalizeCompany('EMPRESA SIN RUT');
    expect(c.name).toBe('EMPRESA SIN RUT');
    expect(c.key).toBe('EMPRESA_SIN_RUT');
    expect(c.rut).toBeUndefined();
  });

  it('acepta claves en español (nombre, grupo, responsable)', () => {
    const c = normalizeCompany({ nombre: 'EMPRESA CUATRO', rut: '791234567', grupo: 'GRUPO B' });
    expect(c.name).toBe('EMPRESA CUATRO');
    expect(c.group).toBe('GRUPO B');
    expect(c.rut).toBe('79.123.456-7');
  });

  it('deriva la clave del RUT sin puntos', () => {
    expect(normalizeCompany({ name: 'X', rut: '76.111.111-1' }).key).toBe('76111111-1');
  });

  it('PRESERVA los campos propios del anfitrion', () => {
    const c = normalizeCompany({
      name: 'EMPRESA CINCO',
      rut: '76.111.111-1',
      adp: 'Carlos',
      complejidad: 'CAC',
      servicios: ['CP', 'ADP'],
    }) as unknown as Record<string, unknown>;
    // Sin esto, `renderCompanyExtra` y las facetas del anfitrion no funcionan.
    expect(c.adp).toBe('Carlos');
    expect(c.complejidad).toBe('CAC');
    expect(c.servicios).toEqual(['CP', 'ADP']);
  });

  it('descarta duplicados por clave', () => {
    const list = normalizeCatalog([
      { name: 'A', rut: '76.111.111-1' },
      { name: 'A duplicada', rut: '76.111.111-1' },
      { name: 'B', rut: '77.222.222-2' },
    ]);
    expect(list).toHaveLength(2);
  });
});

describe('companyRegistry — estado por empresa', () => {
  it('sin configuracion guardada queda SIN CONFIGURAR y no inventa avance', () => {
    const row = buildCompanyRow(DEMO[0], null);
    expect(row.status).toBe('UNCONFIGURED');
    expect(row.hasConfig).toBe(false);
    expect(row.readyCount).toBe(0);
    expect(row.pendingCount).toBe(0);
    expect(row.lastPeriod).toBeNull();
  });

  it('con configuracion completa queda LISTA', () => {
    const { config } = buildScenario();
    const row = buildCompanyRow(DEMO[0], config);
    expect(row.status).toBe('READY');
    expect(row.pendingCount).toBe(0);
    expect(row.readyCount).toBeGreaterThan(0);
    expect(row.lastPeriod).toBe('202607');
  });

  it('si falta una cuenta queda INCOMPLETA', () => {
    const { config } = buildScenario({ omitAccountFor: ['SUELDO_BASE_01'] });
    const row = buildCompanyRow(DEMO[0], config);
    expect(row.status).toBe('INCOMPLETE');
    expect(row.pendingCount).toBeGreaterThan(0);
  });

  it('una empresa inactiva se marca como tal', () => {
    const row = buildCompanyRow({ ...DEMO[0], active: false }, null);
    expect(row.status).toBe('INACTIVE');
  });

  it('lee el estado real desde el repositorio', async () => {
    const repo = new InMemoryConfigRepository();
    const { config } = buildScenario();
    await repo.save({ ...config, companyKey: '76111111-1' });

    const rows = await buildCompanyRows(DEMO, repo);
    expect(rows).toHaveLength(3);
    expect(rows[0].status).toBe('READY');
    expect(rows[1].status).toBe('UNCONFIGURED');
    expect(rows[2].status).toBe('UNCONFIGURED');
  });
});

describe('companyRegistry — resumen de cartera', () => {
  it('cuenta listas, incompletas y sin configurar', () => {
    const { config } = buildScenario();
    const incompleta = buildScenario({ omitAccountFor: ['SUELDO_BASE_01'] }).config;
    const rows = [
      buildCompanyRow(DEMO[0], config),
      buildCompanyRow(DEMO[1], incompleta),
      buildCompanyRow(DEMO[2], null),
    ];
    const s = summarizePortfolio(rows, '202607');

    expect(s.total).toBe(3);
    expect(s.ready).toBe(1);
    expect(s.incomplete).toBe(1);
    expect(s.unconfigured).toBe(1);
    // Solo las dos con configuracion tienen periodo 202607.
    expect(s.processedThisPeriod).toBe(2);
  });

  it('sin periodo de referencia no cuenta centralizadas', () => {
    const { config } = buildScenario();
    const s = summarizePortfolio([buildCompanyRow(DEMO[0], config)], null);
    expect(s.processedThisPeriod).toBe(0);
  });

  it('calcula el periodo anterior en formato AAAAMM', () => {
    expect(previousPeriodCode(new Date(Date.UTC(2026, 7, 25)))).toBe('202607'); // agosto -> julio
    expect(previousPeriodCode(new Date(Date.UTC(2026, 0, 5)))).toBe('202512');  // enero -> diciembre
    expect(previousPeriodCode(new Date(Date.UTC(2026, 11, 31)))).toBe('202611'); // diciembre -> noviembre
  });
});

describe('companyRegistry — busqueda y orden', () => {
  const rows = DEMO.map((c) => buildCompanyRow(c, null));

  it('busca por nombre, RUT y grupo', () => {
    expect(filterCompanyRows(rows, 'DOS')).toHaveLength(1);
    expect(filterCompanyRows(rows, '78.333')).toHaveLength(1);
    expect(filterCompanyRows(rows, 'GRUPO A')).toHaveLength(2);
    expect(filterCompanyRows(rows, '')).toHaveLength(3);
    expect(filterCompanyRows(rows, 'zzz')).toHaveLength(0);
  });

  it('el orden "por atencion" pone primero lo incompleto', () => {
    const { config } = buildScenario();
    const incompleta = buildScenario({ omitAccountFor: ['SUELDO_BASE_01'] }).config;
    const mixed = [
      buildCompanyRow(DEMO[0], config),      // READY
      buildCompanyRow(DEMO[1], incompleta),  // INCOMPLETE
      buildCompanyRow(DEMO[2], null),        // UNCONFIGURED
    ];
    const sorted = sortCompanyRows(mixed, 'attention');
    expect(sorted.map((r) => r.status)).toEqual(['INCOMPLETE', 'UNCONFIGURED', 'READY']);
  });

  it('el orden alfabetico respeta el nombre', () => {
    const sorted = sortCompanyRows(rows, 'name');
    expect(sorted[0].company.name).toBe('EMPRESA DOS SPA');
    expect(sorted[2].company.name).toBe('EMPRESA UNO SPA');
  });
});
