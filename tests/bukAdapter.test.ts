import { describe, expect, it } from 'vitest';
import {
  buildPayrollBookFromBuk,
  parseBukPeriod,
  periodEndIso,
} from '../src/modules/remuneraciones/core/buk/bukAdapter';
import { analyzePayroll } from '../src/modules/remuneraciones/core/payrollAnalyzer';
import { buildWorkingConfig } from '../src/modules/remuneraciones/core/configStore';
import { generateAccountingEntries } from '../src/modules/remuneraciones/core/accountingEngine';
import { validateCentralization } from '../src/modules/remuneraciones/core/validationEngine';
import { EMPLOYEES, buildRecord, cleanPayroll } from './fixtures/bukFixture';

const company = { name: 'EMPRESA PRUEBA SPA', rut: '76.123.456-7' };
const base = (over: object = {}) => ({
  payroll: cleanPayroll(), employees: EMPLOYEES, company, period: '2026-08', ...over,
});

describe('periodos', () => {
  it('acepta AAAAMM y AAAA-MM', () => {
    expect(parseBukPeriod('202608')).toEqual({ year: 2026, month: 8 });
    expect(parseBukPeriod('2026-08')).toEqual({ year: 2026, month: 8 });
  });
  it('rechaza formatos invalidos (incluido DD/MM/AAAA)', () => {
    for (const p of ['31/08/2026', '2026-13', '2026', '']) expect(() => parseBukPeriod(p)).toThrow();
  });
  it('ultimo dia del mes en ISO, incluido febrero bisiesto', () => {
    expect(periodEndIso(2026, 8)).toBe('2026-08-31');
    expect(periodEndIso(2026, 9)).toBe('2026-09-30');
    expect(periodEndIso(2028, 2)).toBe('2028-02-29');
  });
});

describe('buildPayrollBookFromBuk', () => {
  it('arma metadatos de periodo y empresa', () => {
    const b = buildPayrollBookFromBuk(base());
    expect(b.meta).toMatchObject({
      companyName: 'EMPRESA PRUEBA SPA', companyRut: '76.123.456-7',
      periodCode: '202608', periodLabel: 'Agosto 2026', periodEndDate: '2026-08-31',
      totalsRowIndex: null,
    });
  });

  it('clasifica por el tipo de Buk y omite lineas informativas', () => {
    const b = buildPayrollBookFromBuk(base());
    const byLabel = Object.fromEntries(b.concepts.map((c) => [c.label, c.sourceClassification]));
    expect(byLabel['Sueldo Base']).toBe('HABER');
    expect(byLabel['Cotiz. Previ. Obligatoria']).toBe('DESCUENTO');
    expect(byLabel['Mutual Empleador']).toBe('APORTE_EMPLEADOR');
    expect(byLabel['Liquido a Pagar']).toBe('NETO');
    expect(byLabel['Saldo Provision Vacaciones']).toBeUndefined();
    const withInfo = buildPayrollBookFromBuk(base({ includeInformative: true }));
    expect(withInfo.concepts.find((c) => c.label === 'Saldo Provision Vacaciones')?.sourceClassification).toBe('INFORMATIVO');
  });

  it('suma lineas repetidas del mismo concepto por trabajador', () => {
    const b = buildPayrollBookFromBuk(base());
    const credito = b.concepts.find((c) => c.label === 'Credito Personal Caja')!;
    expect(b.workers[0].amounts[credito.id]).toBe(70_000);
    expect(b.concepts.filter((c) => c.label === 'Credito Personal Caja')).toHaveLength(1);
    expect(credito.total).toBe(70_000);
    expect(credito.nonZeroCount).toBe(1);
  });

  it('une con /employees por RUT ignorando puntos y mayuscula de la k', () => {
    const b = buildPayrollBookFromBuk(base());
    expect(b.workers[0]).toMatchObject({ rut: '11.111.111-1', fullName: 'Ana Prueba Uno', costCenter: 'CC-100', position: 'Analista', code: 'A1' });
    expect(b.workers[1]).toMatchObject({ rut: '22.222.222-K', fullName: 'Beto Prueba Dos' });
    expect(b.workers[2]).toMatchObject({ fullName: 'Carla Prueba Tres', costCenter: '', position: '' });
  });

  it('avisa (sin nombres) de trabajadores sin ficha', () => {
    const b = buildPayrollBookFromBuk(base({ employees: EMPLOYEES.slice(0, 1) }));
    expect(b.warnings.join(' ')).toMatch(/2 trabajador\(es\) sin ficha/);
    expect(b.warnings.join(' ')).not.toMatch(/Prueba/);
  });

  it('un libro limpio cuadra: haberes + aportes = descuentos + aportes + liquido', () => {
    const b = buildPayrollBookFromBuk(base());
    const sum = (cls: string) =>
      b.concepts.filter((c) => c.sourceClassification === cls).reduce((a, c) => a + c.total, 0);
    expect(sum('HABER')).toBe(sum('DESCUENTO') + sum('NETO'));
    expect(b.warnings.join(' ')).not.toMatch(/no es igual al liquido/);
  });

  it('sobregiro: la linea `sobregiro` cierra la cuenta y se registra como DEBE', () => {
    const payroll = [
      ...cleanPayroll(),
      buildRecord({ id: 4, rut: '44.444.444-4', base: 100_000, extra: [['Cuota Sindical', 150_000]], overdraftNet: 0 }),
    ];
    const b = buildPayrollBookFromBuk(base({ payroll, employees: [] }));
    const sob = b.concepts.find((c) => c.label === 'Sobregiro (sobregiro del mes)')!;
    expect(sob.sourceClassification).toBe('HABER');
    expect(sob.total).toBeGreaterThan(0);
    expect(b.warnings.join(' ')).toMatch(/1 liquidacion\(es\) con sobregiro por \$/);
    expect(b.warnings.join(' ')).not.toMatch(/no es igual al liquido/);
    // La identidad contable se mantiene: haberes (+sobregiro) = descuentos + liquido.
    const sum = (cls: string) =>
      b.concepts.filter((c) => c.sourceClassification === cls).reduce((a, c) => a + c.total, 0);
    expect(sum('HABER')).toBe(sum('DESCUENTO') + sum('NETO'));
  });

  it('no confunde la linea `sobregiro` con el descuento homonimo de meses previos', () => {
    const payroll = [
      ...cleanPayroll(),
      buildRecord({ id: 4, rut: '44.444.444-4', base: 100_000, extra: [['Sobregiro', 30_000]], overdraftNet: 0 }),
    ];
    const b = buildPayrollBookFromBuk(base({ payroll, employees: [] }));
    const labels = b.concepts.filter((c) => c.label.startsWith('Sobregiro')).map((c) => [c.label, c.sourceClassification]);
    expect(labels).toEqual(expect.arrayContaining([
      ['Sobregiro (sobregiro del mes)', 'HABER'],
      ['Sobregiro', 'DESCUENTO'],
    ]));
    expect(new Set(b.concepts.map((c) => c.id)).size).toBe(b.concepts.length);
  });

  it('avisa si el liquido de Buk no cierra aun contando el sobregiro', () => {
    const payroll = [...cleanPayroll(), buildRecord({ id: 4, rut: '44.444.444-4', base: 100_000, netOverride: 1 })];
    const b = buildPayrollBookFromBuk(base({ payroll, employees: [] }));
    expect(b.warnings.join(' ')).toMatch(/1 liquidacion\(es\) donde haberes - descuentos \(\+ sobregiro\) no es igual/);
  });

  it('nunca descarta una linea de tipo desconocido: la deja sin clasificar y avisa', () => {
    const extraLine = { type: 'tipo_nuevo', name: 'Concepto Nuevo', amount: 5_000, code: 'x', item_code: null };
    const payroll = [...cleanPayroll(), buildRecord({ id: 4, rut: '44.444.444-4', base: 100_000, extraLine })];
    const b = buildPayrollBookFromBuk(base({ payroll, employees: [] }));
    const c = b.concepts.find((x) => x.label === 'Concepto Nuevo')!;
    expect(c.sourceClassification).toBeUndefined();
    expect(c.total).toBe(5_000);
    expect(b.warnings.join(' ')).toMatch(/tipo_nuevo/);
  });

  it('rechaza liquidaciones no cerradas salvo allowOpen', () => {
    const payroll = [buildRecord({ id: 1, rut: '11111111-1', base: 1, closed: false })];
    expect(() => buildPayrollBookFromBuk(base({ payroll }))).toThrow(/no estan cerradas/);
    const b = buildPayrollBookFromBuk(base({ payroll, allowOpen: true }));
    expect(b.warnings.join(' ')).toMatch(/NO estan cerradas/);
  });

  it('rechaza un periodo distinto al pedido (fallback silencioso de Buk)', () => {
    const payroll = [buildRecord({ id: 1, rut: '11111111-1', base: 1, month: 10 })];
    expect(() => buildPayrollBookFromBuk(base({ payroll }))).toThrow(/periodo distinto/);
  });

  it('rechaza respuestas vacias y liquidaciones duplicadas', () => {
    expect(() => buildPayrollBookFromBuk(base({ payroll: [] }))).toThrow(/no devolvio/);
    const p = cleanPayroll();
    expect(() => buildPayrollBookFromBuk(base({ payroll: [p[0], p[0]] }))).toThrow(/duplicadas/);
  });

  it('el analizador usa la clasificacion de la fuente y no inventa totalizadores', () => {
    const b = buildPayrollBookFromBuk(base());
    const a = analyzePayroll(b);
    for (const c of b.concepts) {
      expect(a[c.id].suggestedClassification).toBe(c.sourceClassification);
      expect(a[c.id].looksLikeTotalizer).toBe(false);
    }
  });

  it('de punta a punta: con sobregiro el asiento cuadra y no exige columna de RUT', () => {
    const payroll = [
      ...cleanPayroll(),
      buildRecord({ id: 4, rut: '44.444.444-4', base: 100_000, extra: [['Cuota Sindical', 150_000]], overdraftNet: 0 }),
    ];
    const book = buildPayrollBookFromBuk(base({ payroll }));
    const analyses = analyzePayroll(book);
    const { config } = buildWorkingConfig(book, analyses, null);
    for (const c of book.concepts) {
      const cfg = config.concepts[c.id];
      if (cfg.classification === 'APORTE_EMPLEADOR') { cfg.expenseAccount = '5101001'; cfg.liabilityAccount = '2101009'; }
      else cfg.account = `2${String(c.columnIndex).padStart(6, '0')}`;
    }
    const acc = generateAccountingEntries(book, config);
    expect(acc.balanced).toBe(true);
    const report = validateCentralization(book, config, analyses, acc);
    expect(report.errors.map((e) => e.code)).not.toContain('V6_SIN_COLUMNA_RUT');
    expect(report.errors.map((e) => e.code)).not.toContain('V9_NO_CUADRADO');
  });
});
