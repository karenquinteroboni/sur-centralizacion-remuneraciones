/**
 * PRUEBA 4 — Las nueve validaciones y la reutilizacion de configuracion.
 */

import { describe, expect, it } from 'vitest';
import { validateCentralization } from '../src/modules/remuneraciones/core/validationEngine';
import { generateAccountingEntries } from '../src/modules/remuneraciones/core/accountingEngine';
import {
  InMemoryConfigRepository,
  buildWorkingConfig,
} from '../src/modules/remuneraciones/core/configStore';
import { parseGrid } from '../src/modules/remuneraciones/core/excelParser';
import { analyzePayroll } from '../src/modules/remuneraciones/core/payrollAnalyzer';
import { buildSyntheticGrid } from './fixtures/syntheticPayroll';
import { buildScenario } from './helpers';

const ok = buildScenario();

describe('validationEngine — escenario correcto', () => {
  it('no arroja errores cuando todo esta parametrizado', () => {
    expect(ok.report.errors).toHaveLength(0);
    expect(ok.report.canExport).toBe(true);
    expect(ok.report.balanced).toBe(true);
    expect(ok.report.difference).toBe(0);
  });

  it('informa explicitamente que la centralizacion esta balanceada', () => {
    expect(ok.report.infos.some((i) => i.code === 'V9_CUADRADO')).toBe(true);
  });
});

describe('validationEngine — V1: cuentas obligatorias', () => {
  it('bloquea si un concepto incluido no tiene cuenta', () => {
    const s = buildScenario({ omitAccountFor: ['SUELDO_BASE_01'] });
    expect(s.report.canExport).toBe(false);
    const issue = s.report.errors.find((e) => e.code === 'V1_SIN_CUENTA');
    expect(issue).toBeDefined();
    expect(issue!.conceptId).toBe('SUELDO_BASE_01');
  });

  it('exige ambas cuentas en un aporte del empleador', () => {
    const s = buildScenario({ omitAccountFor: ['SIS_01'] });
    expect(s.report.errors.some((e) => e.code === 'V1_SIN_CUENTA_GASTO')).toBe(true);
    expect(s.report.errors.some((e) => e.code === 'V1_SIN_CUENTA_OBLIGACION')).toBe(true);
  });
});

describe('validationEngine — V2 / V4: clasificacion y ambiguedad', () => {
  it('bloquea si un concepto incluido no tiene clasificacion', () => {
    const { book, config, analyses } = ok;
    const broken = {
      ...config,
      concepts: {
        ...config.concepts,
        SUELDO_BASE_01: { ...config.concepts['SUELDO_BASE_01'], classification: null },
      },
    };
    const accounting = generateAccountingEntries(book, broken);
    const report = validateCentralization(book, broken, analyses, accounting);
    expect(report.errors.some((e) => e.code === 'V2_SIN_CLASIFICACION')).toBe(true);
    expect(report.canExport).toBe(false);
  });

  it('un concepto desconocido llega sin clasificar y bloquea la exportacion', () => {
    const s = buildScenario({ extraUnknownColumn: true });
    const unknown = s.book.concepts.find((c) => c.label === 'CONCEPTO RARO XZ')!;
    expect(s.config.concepts[unknown.id].classification).toBeNull();
    expect(s.config.concepts[unknown.id].account).toBe('');
    expect(s.report.errors.some((e) => e.conceptId === unknown.id)).toBe(true);
  });
});

describe('validationEngine — V3: formato de cuenta', () => {
  it('rechaza una cuenta con caracteres invalidos', () => {
    const { book, config, analyses } = ok;
    const broken = {
      ...config,
      concepts: {
        ...config.concepts,
        SUELDO_BASE_01: { ...config.concepts['SUELDO_BASE_01'], account: '5.01/**/01' },
      },
    };
    const accounting = generateAccountingEntries(book, broken);
    const report = validateCentralization(book, broken, analyses, accounting);
    expect(report.errors.some((e) => e.code === 'V3_FORMATO_CUENTA')).toBe(true);
  });

  it('rechaza una cuenta demasiado corta', () => {
    const { book, config, analyses } = ok;
    const broken = {
      ...config,
      concepts: {
        ...config.concepts,
        SUELDO_BASE_01: { ...config.concepts['SUELDO_BASE_01'], account: '5' },
      },
    };
    const accounting = generateAccountingEntries(book, broken);
    const report = validateCentralization(book, broken, analyses, accounting);
    expect(report.errors.some((e) => e.code === 'V3_CUENTA_CORTA')).toBe(true);
  });

  it('acepta el formato jerarquico de Kame', () => {
    expect(ok.report.errors.some((e) => e.code.startsWith('V3_'))).toBe(false);
  });
});

describe('validationEngine — V5: doble contabilizacion', () => {
  it('advierte al incluir el totalizador junto a sus componentes', () => {
    const s = buildScenario({ includeTotalizers: true });
    expect(s.report.warnings.some((w) => w.code === 'V5_DOBLE_CONTABILIZACION')).toBe(true);
  });

  it('la advertencia no bloquea por si sola (modo no estricto)', () => {
    const s = buildScenario({ includeTotalizers: true });
    const doubles = s.report.issues.filter((i) => i.code === 'V5_DOBLE_CONTABILIZACION');
    expect(doubles.every((i) => i.severity === 'WARNING')).toBe(true);
  });

  it('en modo estricto se convierte en error', () => {
    const s = buildScenario({ includeTotalizers: true });
    const report = validateCentralization(s.book, s.config, s.analyses, s.accounting, {
      strictDoubleCounting: true,
    });
    expect(report.errors.some((e) => e.code === 'V5_DOBLE_CONTABILIZACION')).toBe(true);
  });
});

describe('validationEngine — V6 / V7: terceros', () => {
  it('detecta un RUT invalido cuando el concepto es por trabajador', () => {
    const grid = buildSyntheticGrid();
    // Rompe el digito verificador de la primera fila de datos (indice 6).
    grid[6][0] = '11.111.111-9';
    const book = parseGrid(grid);
    const analyses = analyzePayroll(book);
    const { config } = buildWorkingConfig(book, analyses, ok.config);
    const accounting = generateAccountingEntries(book, config);
    const report = validateCentralization(book, config, analyses, accounting);

    expect(
      report.errors.some((e) => e.code === 'V6_RUT_INVALIDO' || e.code === 'V6_SIN_RUT'),
    ).toBe(true);
  });

  it('detecta un tercero sin nombre', () => {
    const grid = buildSyntheticGrid();
    grid[6][2] = '';
    grid[6][3] = '';
    grid[6][4] = '';
    const book = parseGrid(grid);
    const analyses = analyzePayroll(book);
    const { config } = buildWorkingConfig(book, analyses, ok.config);
    const accounting = generateAccountingEntries(book, config);
    const report = validateCentralization(book, config, analyses, accounting);

    expect(report.errors.some((e) => e.code === 'V7_SIN_NOMBRE')).toBe(true);
  });

  it('no exige RUT si ningun concepto es por trabajador', () => {
    const s = buildScenario({ liquidoMode: 'CONSOLIDATED' });
    expect(s.report.errors.some((e) => e.code.startsWith('V6_'))).toBe(false);
    expect(s.report.errors.some((e) => e.code.startsWith('V7_'))).toBe(false);
  });
});

describe('validationEngine — V8: totales del Excel', () => {
  it('confirma la identidad haberes - descuentos = liquido', () => {
    expect(ok.report.infos.some((i) => i.code === 'V8_IDENTIDAD_LIBRO')).toBe(true);
  });

  it('advierte si la fila de totales del Excel no coincide con la suma de filas', () => {
    const grid = buildSyntheticGrid();
    const totalsRow = grid[grid.length - 1];
    // Adultera el total de SUELDO BASE en la fila de totales (columna 8).
    totalsRow[8] = Number(totalsRow[8]) + 999;

    const book = parseGrid(grid);
    const analyses = analyzePayroll(book);
    const { config } = buildWorkingConfig(book, analyses, ok.config);
    const accounting = generateAccountingEntries(book, config);
    const report = validateCentralization(book, config, analyses, accounting);

    expect(report.warnings.some((w) => w.code === 'V8_TOTAL_COLUMNA')).toBe(true);
  });
});

describe('validationEngine — V9: cuadratura', () => {
  it('bloquea la exportacion si el asiento no cuadra', () => {
    const s = buildScenario({ includeTotalizers: true });
    expect(s.accounting.balanced).toBe(false);
    expect(s.report.errors.some((e) => e.code === 'V9_NO_CUADRADO')).toBe(true);
    expect(s.report.canExport).toBe(false);
  });

  it('con la opcion administrativa la diferencia pasa a ser advertencia', () => {
    const s = buildScenario({ includeTotalizers: true });
    const report = validateCentralization(s.book, s.config, s.analyses, s.accounting, {
      allowUnbalancedExport: true,
    });
    expect(report.warnings.some((w) => w.code === 'V9_NO_CUADRADO')).toBe(true);
    expect(report.errors.some((e) => e.code === 'V9_NO_CUADRADO')).toBe(false);
  });

  it('bloquea si no hay ningun movimiento', () => {
    const { book, config, analyses } = ok;
    const empty = {
      ...config,
      concepts: Object.fromEntries(
        Object.entries(config.concepts).map(([k, v]) => [k, { ...v, include: false }]),
      ),
    };
    const accounting = generateAccountingEntries(book, empty);
    const report = validateCentralization(book, empty, analyses, accounting);
    expect(report.errors.some((e) => e.code === 'V9_SIN_MOVIMIENTOS')).toBe(true);
  });
});

describe('configStore — configuracion reutilizable', () => {
  it('reutiliza la configuracion guardada de la misma empresa', async () => {
    const repo = new InMemoryConfigRepository();
    await repo.save(ok.config);

    const reloaded = await repo.load(ok.config.companyKey);
    expect(reloaded).not.toBeNull();

    const book = parseGrid(buildSyntheticGrid());
    const analyses = analyzePayroll(book);
    const built = buildWorkingConfig(book, analyses, reloaded);

    expect(built.reusedExisting).toBe(true);
    expect(built.newConceptIds).toHaveLength(0);
    expect(built.config.concepts['SUELDO_BASE_01'].account).toBe('5.01.01.01');
  });

  it('marca como NUEVO un concepto que no estaba en la configuracion guardada', () => {
    const book = parseGrid(buildSyntheticGrid({ extraUnknownColumn: true }));
    const analyses = analyzePayroll(book);
    const built = buildWorkingConfig(book, analyses, ok.config);

    const unknown = book.concepts.find((c) => c.label === 'CONCEPTO RARO XZ')!;
    expect(built.newConceptIds).toContain(unknown.id);
    // Y NO se le asume ninguna cuenta.
    expect(built.config.concepts[unknown.id].account).toBe('');
    expect(built.config.concepts[unknown.id].classification).toBeNull();
  });

  it('la clave de empresa se deriva del RUT del libro', () => {
    expect(ok.config.companyKey).toBe(ok.book.meta.companyRut.replace(/\./g, ''));
  });
});
