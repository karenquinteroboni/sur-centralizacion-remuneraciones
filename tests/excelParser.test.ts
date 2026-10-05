/**
 * PRUEBA 1 — Lectura del Excel y deteccion de conceptos / duplicados.
 */

import { describe, expect, it } from 'vitest';
import {
  detectHeaderRow,
  parseGrid,
  parsePayrollWorkbook,
  parsePeriod,
} from '../src/modules/remuneraciones/core/excelParser';
import { toNumber } from '../src/modules/remuneraciones/utils/numberUtils';
import {
  computeDv,
  formatRut,
  isValidRut,
} from '../src/modules/remuneraciones/utils/rutValidator';
import {
  EXPECTED,
  SYNTHETIC_WORKERS,
  buildSyntheticGrid,
  buildSyntheticWorkbookBuffer,
  fakeRut,
} from './fixtures/syntheticPayroll';

describe('excelParser — lectura del libro', () => {
  it('lee un archivo XLSX real generado en memoria', () => {
    const book = parsePayrollWorkbook(buildSyntheticWorkbookBuffer(), {
      fileName: 'demo.xlsx',
    });
    expect(book.workers).toHaveLength(SYNTHETIC_WORKERS.length);
    expect(book.concepts.length).toBeGreaterThan(10);
    expect(book.meta.sourceFileName).toBe('demo.xlsx');
  });

  it('detecta la fila de titulos aunque no este en una posicion fija', () => {
    // El fixture pone la cabecera en la fila 6 (indice 5).
    const grid = buildSyntheticGrid();
    expect(detectHeaderRow(grid)).toBe(5);

    // Ahora se agregan tres filas de preambulo adicionales: debe seguirla.
    const shifted = [[], ['Reporte interno'], [], ...grid];
    expect(detectHeaderRow(shifted)).toBe(8);
  });

  it('extrae empresa, RUT y periodo de la cabecera', () => {
    const book = parseGrid(buildSyntheticGrid());
    expect(book.meta.companyName).toBe('EMPRESA DEMO SPA');
    expect(book.meta.companyRut).toBe(fakeRut(76111111));
    expect(book.meta.periodLabel).toBe('Julio 2026');
    expect(book.meta.periodCode).toBe('202607');
    expect(book.meta.periodEndDate).toBe('2026-07-31');
  });

  it('interpreta distintos formatos de periodo', () => {
    expect(parsePeriod('Julio 2026')).toMatchObject({ year: 2026, month: 7 });
    expect(parsePeriod("Julio '26")).toMatchObject({ year: 2026, month: 7 });
    expect(parsePeriod('Periodo: 07/2026')).toMatchObject({ year: 2026, month: 7 });
    expect(parsePeriod('2026-07')).toMatchObject({ year: 2026, month: 7 });
    expect(parsePeriod('sin fecha')).toBeNull();
  });

  it('identifica las columnas de identificacion y arma el nombre completo', () => {
    const book = parseGrid(buildSyntheticGrid());
    expect(book.identityColumns.rut).toBe(0);
    expect(book.identityColumns.firstNames).toBe(4);

    const first = book.workers[0];
    expect(first.rut).toBe(SYNTHETIC_WORKERS[0].rut);
    expect(first.fullName).toBe('Ana Maria Alfa Uno');
    expect(first.position).toBe('VENDEDORA');
  });

  it('excluye la fila de totales de las filas de trabajadores', () => {
    const book = parseGrid(buildSyntheticGrid());
    expect(book.meta.totalsRowIndex).not.toBeNull();
    expect(book.workers).toHaveLength(SYNTHETIC_WORKERS.length);
    // Ningun "trabajador" debe llamarse Totales.
    expect(book.workers.some((w) => /total/i.test(w.fullName))).toBe(false);
  });

  it('funciona tambien sin fila de totales', () => {
    const book = parseGrid(buildSyntheticGrid({ includeTotals: false }));
    expect(book.meta.totalsRowIndex).toBeNull();
    expect(book.workers).toHaveLength(SYNTHETIC_WORKERS.length);
    expect(book.warnings.some((w) => w.includes('fila de totales'))).toBe(true);
  });
});

describe('excelParser — deteccion de conceptos', () => {
  it('suma correctamente cada columna y coincide con la fila de totales', () => {
    const book = parseGrid(buildSyntheticGrid());
    const byId = new Map(book.concepts.map((c) => [c.id, c]));

    expect(byId.get('SUELDO_BASE_01')!.total).toBe(EXPECTED.sueldoBase);
    expect(byId.get('GRATIFICACION_01')!.total).toBe(EXPECTED.gratificacion);
    expect(byId.get('TOTAL_HABERES_01')!.total).toBe(EXPECTED.totalHaberes);
    expect(byId.get('SUELDO_LIQUIDO_01')!.total).toBe(EXPECTED.liquido);

    // La suma calculada debe coincidir con lo que dice el Excel.
    for (const c of book.concepts) {
      if (c.excelTotal === null) continue;
      expect(c.total).toBeCloseTo(c.excelTotal, 0);
    }
  });

  it('genera identificadores internos UNICOS para titulos duplicados', () => {
    const book = parseGrid(buildSyntheticGrid());
    const horasExtras = book.concepts.filter((c) => c.label === 'HORAS EXTRAS');

    expect(horasExtras).toHaveLength(2);
    expect(horasExtras[0].id).toBe('HORAS_EXTRAS_01');
    expect(horasExtras[1].id).toBe('HORAS_EXTRAS_02');
    expect(horasExtras[0].id).not.toBe(horasExtras[1].id);
    expect(horasExtras.every((c) => c.duplicateLabel)).toBe(true);

    // Y cada uno conserva SU propio total (columnas distintas).
    expect(horasExtras[0].total).toBe(EXPECTED.he1);
    expect(horasExtras[1].total).toBe(EXPECTED.he2);

    // Todos los ids del libro son unicos.
    const ids = book.concepts.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Y el aviso llega al usuario.
    expect(book.warnings.some((w) => w.includes('HORAS EXTRAS'))).toBe(true);
  });

  it('no trata las columnas de identificacion como conceptos', () => {
    const book = parseGrid(buildSyntheticGrid());
    const labels = book.concepts.map((c) => c.label);
    expect(labels).not.toContain('RUT');
    expect(labels).not.toContain('NOMBRES');
    expect(labels).not.toContain('CARGO');
    expect(labels).not.toContain('CENTRO COSTO');
  });
});

describe('utilidades de apoyo', () => {
  it('convierte numeros en formato chileno y anglosajon', () => {
    expect(toNumber('1.234.567')).toBe(1234567);
    expect(toNumber('1.234,56')).toBeCloseTo(1234.56);
    expect(toNumber('1,234,567.89')).toBeCloseTo(1234567.89);
    expect(toNumber('$ 45.000')).toBe(45000);
    expect(toNumber('(1.000)')).toBe(-1000);
    expect(toNumber('')).toBe(0);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(4200)).toBe(4200);
  });

  it('valida RUT chilenos con modulo 11', () => {
    const valid = fakeRut(11111111);
    expect(isValidRut(valid)).toBe(true);
    expect(isValidRut('11.111.111-0')).toBe(computeDv('11111111') === '0');
    expect(isValidRut('1-9')).toBe(computeDv('1') === '9');
    expect(isValidRut('')).toBe(false);
    expect(isValidRut('abc')).toBe(false);
    expect(formatRut('121268363')).toBe('12.126.836-3');
  });
});
