/**
 * PRUEBA 3 — Motor contable: haberes, descuentos, aportes del empleador,
 *            terceros, exclusion de totalizadores y cuadratura.
 *
 * Todas las cifras esperadas se calculan en `EXPECTED` de forma independiente
 * al motor, de modo que la prueba verifica realmente el calculo.
 */

import { describe, expect, it } from 'vitest';
import { generateAccountingEntries } from '../src/modules/remuneraciones/core/accountingEngine';
import { EXPECTED, SYNTHETIC_WORKERS } from './fixtures/syntheticPayroll';
import { buildScenario } from './helpers';

const scenario = buildScenario();

function amountFor(conceptId: string, nature?: 'DEBE' | 'HABER'): number {
  return scenario.accounting.entries
    .filter((e) => e.conceptId === conceptId && (!nature || e.nature === nature))
    .reduce((acc, e) => acc + e.amount, 0);
}

describe('accountingEngine — naturaleza contable', () => {
  it('los HABERES generan movimientos al DEBE', () => {
    const sueldo = scenario.accounting.entries.filter((e) => e.conceptId === 'SUELDO_BASE_01');
    expect(sueldo).toHaveLength(1);
    expect(sueldo[0].nature).toBe('DEBE');
    expect(sueldo[0].debit).toBe(EXPECTED.sueldoBase);
    expect(sueldo[0].credit).toBe(0);
    expect(sueldo[0].account).toBe('5.01.01.01');
  });

  it('los DESCUENTOS generan movimientos al HABER', () => {
    const prevision = scenario.accounting.entries.filter((e) => e.conceptId === 'PREVIS_01');
    expect(prevision).toHaveLength(1);
    expect(prevision[0].nature).toBe('HABER');
    expect(prevision[0].credit).toBe(EXPECTED.prevision);
    expect(prevision[0].debit).toBe(0);
  });

  it('el NETO genera movimientos al HABER', () => {
    const liquido = scenario.accounting.entries.filter((e) => e.conceptId === 'SUELDO_LIQUIDO_01');
    expect(liquido.every((e) => e.nature === 'HABER')).toBe(true);
    expect(amountFor('SUELDO_LIQUIDO_01')).toBe(EXPECTED.liquido);
  });

  it('el APORTE EMPLEADOR genera DEBE en gasto y HABER en obligacion, por el mismo monto', () => {
    const sis = scenario.accounting.entries.filter((e) => e.conceptId === 'SIS_01');
    expect(sis).toHaveLength(2);

    const debe = sis.find((e) => e.nature === 'DEBE')!;
    const haber = sis.find((e) => e.nature === 'HABER')!;

    expect(debe.account).toBe('5.01.03.01');
    expect(haber.account).toBe('2.01.04.01');
    expect(debe.amount).toBe(EXPECTED.sis);
    expect(haber.amount).toBe(EXPECTED.sis);
  });
});

describe('accountingEngine — calculo de haberes y descuentos', () => {
  it('suma correctamente cada haber', () => {
    expect(amountFor('SUELDO_BASE_01')).toBe(EXPECTED.sueldoBase);
    expect(amountFor('GRATIFICACION_01')).toBe(EXPECTED.gratificacion);
    expect(amountFor('COLACION_01')).toBe(EXPECTED.colacion);
  });

  it('mantiene separadas las dos columnas HORAS EXTRAS duplicadas', () => {
    expect(amountFor('HORAS_EXTRAS_01')).toBe(EXPECTED.he1);
    expect(amountFor('HORAS_EXTRAS_02')).toBe(EXPECTED.he2);
    expect(EXPECTED.he1).not.toBe(EXPECTED.he2);

    // Y usan cuentas distintas, como se configuro.
    const cuentas = scenario.accounting.entries
      .filter((e) => e.conceptId.startsWith('HORAS_EXTRAS'))
      .map((e) => e.account);
    expect(new Set(cuentas).size).toBe(2);
  });

  it('suma correctamente cada descuento', () => {
    expect(amountFor('PREVIS_01')).toBe(EXPECTED.prevision);
    expect(amountFor('SALUD_01')).toBe(EXPECTED.salud);
    expect(amountFor('CESANTIA_01')).toBe(EXPECTED.cesantia);
  });
});

describe('accountingEngine — exclusion de totalizadores', () => {
  it('los totalizadores NO generan movimientos', () => {
    const ids = scenario.accounting.entries.map((e) => e.conceptId);
    expect(ids).not.toContain('TOTAL_HABERES_01');
    expect(ids).not.toContain('TOTAL_DESCUENTOS_01');
  });

  it('los informativos tampoco generan movimientos', () => {
    const ids = scenario.accounting.entries.map((e) => e.conceptId);
    expect(ids).not.toContain('DIAS_TRABAJADOS_01');
  });

  it('si el usuario los incluye a la fuerza, el asiento se descuadra', () => {
    const forced = buildScenario({ includeTotalizers: true });
    expect(forced.accounting.balanced).toBe(false);
    expect(forced.report.canExport).toBe(false);
    expect(forced.report.errors.some((e) => e.code === 'V9_NO_CUADRADO')).toBe(true);
  });
});

describe('accountingEngine — manejo de terceros', () => {
  it('modo CONSOLIDATED genera un unico movimiento sin RUT', () => {
    const consolidated = buildScenario({ liquidoMode: 'CONSOLIDATED' });
    const liquido = consolidated.accounting.entries.filter(
      (e) => e.conceptId === 'SUELDO_LIQUIDO_01',
    );
    expect(liquido).toHaveLength(1);
    expect(liquido[0].amount).toBe(EXPECTED.liquido);
    expect(liquido[0].thirdPartyRut).toBe('');
    expect(liquido[0].thirdPartyName).toBe('');
  });

  it('modo PER_WORKER genera un movimiento por trabajador con RUT y nombre del Excel', () => {
    const liquido = scenario.accounting.entries.filter(
      (e) => e.conceptId === 'SUELDO_LIQUIDO_01',
    );

    // Un trabajador tiene liquido 0 y se omite.
    expect(liquido).toHaveLength(EXPECTED.workersWithLiquido);
    expect(liquido.length).toBeLessThan(SYNTHETIC_WORKERS.length);

    // Todos llevan RUT (sin puntos, con guion) y nombre.
    for (const e of liquido) {
      expect(e.thirdPartyRut).toMatch(/^\d+-[0-9K]$/);
      expect(e.thirdPartyName.length).toBeGreaterThan(0);
      expect(e.comment).toContain(e.thirdPartyName);
    }

    // La suma por trabajador equivale al total consolidado.
    expect(liquido.reduce((a, e) => a + e.amount, 0)).toBe(EXPECTED.liquido);

    // Y el primer trabajador aparece con su RUT ficticio.
    const first = SYNTHETIC_WORKERS[0];
    const expectedRut = first.rut.replace(/\./g, '');
    expect(liquido.some((e) => e.thirdPartyRut === expectedRut)).toBe(true);
  });

  it('la modalidad se configura de forma independiente por concepto', () => {
    const liquido = scenario.accounting.entries.filter((e) => e.conceptId === 'SUELDO_LIQUIDO_01');
    const sueldo = scenario.accounting.entries.filter((e) => e.conceptId === 'SUELDO_BASE_01');
    expect(liquido[0].thirdPartyMode).toBe('PER_WORKER');
    expect(sueldo[0].thirdPartyMode).toBe('CONSOLIDATED');
  });
});

describe('accountingEngine — cuadratura', () => {
  it('el asiento queda balanceado: DEBE = HABER, diferencia 0', () => {
    expect(scenario.accounting.totalDebit).toBe(EXPECTED.totalDebit);
    expect(scenario.accounting.totalCredit).toBe(EXPECTED.totalCredit);
    expect(scenario.accounting.difference).toBe(0);
    expect(scenario.accounting.balanced).toBe(true);
  });

  it('la identidad contable se cumple: haberes + aportes = descuentos + liquido + obligaciones', () => {
    expect(EXPECTED.totalHaberes + EXPECTED.aportes).toBe(
      EXPECTED.totalDescuentos + EXPECTED.liquido + EXPECTED.aportes,
    );
    expect(scenario.accounting.totalDebit).toBe(scenario.accounting.totalCredit);
  });

  it('todas las lineas tienen importe positivo y una sola naturaleza', () => {
    for (const e of scenario.accounting.entries) {
      expect(e.amount).toBeGreaterThan(0);
      expect(e.debit === 0 || e.credit === 0).toBe(true);
      expect(e.debit + e.credit).toBe(e.amount);
    }
  });

  it('excluir un concepto lo saca del asiento y cambia los totales', () => {
    const { book, config } = scenario;
    const modified = {
      ...config,
      concepts: {
        ...config.concepts,
        COLACION_01: { ...config.concepts['COLACION_01'], include: false },
      },
    };
    const result = generateAccountingEntries(book, modified);
    expect(result.entries.some((e) => e.conceptId === 'COLACION_01')).toBe(false);
    expect(result.totalDebit).toBe(EXPECTED.totalDebit - EXPECTED.colacion);
    // Y como el liquido ya no cuadra con los haberes, el asiento se descuadra.
    expect(result.balanced).toBe(false);
  });
});

describe('accountingEngine — reglas especiales', () => {
  it('invertNature cambia la naturaleza del movimiento', () => {
    const { book, config } = scenario;
    const modified = {
      ...config,
      concepts: {
        ...config.concepts,
        SUELDO_BASE_01: {
          ...config.concepts['SUELDO_BASE_01'],
          rules: { invertNature: true },
        },
      },
    };
    const result = generateAccountingEntries(book, modified);
    const sueldo = result.entries.find((e) => e.conceptId === 'SUELDO_BASE_01')!;
    expect(sueldo.nature).toBe('HABER');
  });

  it('el factor multiplicador ajusta el monto', () => {
    const { book, config } = scenario;
    const modified = {
      ...config,
      concepts: {
        ...config.concepts,
        COLACION_01: { ...config.concepts['COLACION_01'], rules: { factor: 0.5 } },
      },
    };
    const result = generateAccountingEntries(book, modified);
    const colacion = result.entries.find((e) => e.conceptId === 'COLACION_01')!;
    expect(colacion.amount).toBe(Math.round(EXPECTED.colacion / 2));
  });
});
