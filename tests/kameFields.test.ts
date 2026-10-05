/**
 * PRUEBA 7 — Campos analiticos que exige la cuenta en Kame.
 *
 * Cubre: RUT, razon social, documento, folio y fecha de vencimiento, con sus
 * tres origenes de ficha y los dos modos de folio y de vencimiento.
 */

import { describe, expect, it } from 'vitest';
import {
  activeKameFieldGroups,
  applyKameFieldsTo,
  buildDefaultKameFields,
  dueDateFromPeriod,
  mergeKameFieldGroups,
  resolveKameFieldValues,
  resolveKameFields,
  suggestCopyTargets,
} from '../src/modules/remuneraciones/core/kameFields';
import { generateAccountingEntries } from '../src/modules/remuneraciones/core/accountingEngine';
import { validateCentralization } from '../src/modules/remuneraciones/core/validationEngine';
import { generateKameCsv, verifyKameStructure } from '../src/modules/remuneraciones/core/kameExporter';
import type {
  CentralizationConfig,
  ConceptKameFields,
} from '../src/modules/remuneraciones/types/payroll';
import { fakeRut } from './fixtures/syntheticPayroll';
import { buildScenario } from './helpers';

const base = buildScenario();

/** Aplica campos Kame a un concepto y regenera todo el flujo. */
function withFields(conceptId: string, fields: Partial<ConceptKameFields>) {
  const config: CentralizationConfig = {
    ...base.config,
    concepts: {
      ...base.config.concepts,
      [conceptId]: {
        ...base.config.concepts[conceptId],
        kameFields: {
          ...resolveKameFields(base.config.concepts[conceptId]),
          ...fields,
        },
      },
    },
  };
  const accounting = generateAccountingEntries(base.book, config);
  const report = validateCentralization(base.book, config, base.analyses, accounting);
  const csv = generateKameCsv(accounting, config, base.book);
  return { config, accounting, report, csv };
}

function lineFor(csvContent: string, account: string): string[] {
  const rows = csvContent.split('\r\n').filter(Boolean).slice(1).map((l) => l.split(';'));
  const row = rows.find((c) => c[5] === account);
  if (!row) throw new Error(`No hay linea para la cuenta ${account}`);
  return row;
}

/* -------------------------------------------------------------------------- */

describe('kameFields — valores por defecto y compatibilidad', () => {
  it('consolidado no emite ningun campo analitico', () => {
    const f = buildDefaultKameFields('CONSOLIDATED');
    expect(f.rut).toBe(false);
    expect(f.razonSocial).toBe(false);
    expect(f.documento).toBe(false);
    expect(f.folio).toBe(false);
    expect(f.vencimiento).toBe(false);
  });

  it('por trabajador enciende la ficha del libro', () => {
    const f = buildDefaultKameFields('PER_WORKER');
    expect(f.rut).toBe(true);
    expect(f.razonSocial).toBe(true);
    expect(f.fichaSource).toBe('TRABAJADOR');
  });

  it('una configuracion guardada SIN kameFields sigue funcionando', () => {
    // Simula el esquema anterior: se elimina la seccion por completo.
    const legacy = { ...base.config.concepts['SUELDO_LIQUIDO_01'] };
    delete (legacy as { kameFields?: unknown }).kameFields;

    const f = resolveKameFields(legacy);
    expect(f.rut).toBe(true);          // derivado de thirdPartyMode
    expect(f.fichaSource).toBe('TRABAJADOR');
  });

  it('el archivo generado desde una configuracion antigua es identico', () => {
    const legacyConcepts = Object.fromEntries(
      Object.entries(base.config.concepts).map(([k, v]) => {
        const copy = { ...v };
        delete (copy as { kameFields?: unknown }).kameFields;
        return [k, copy];
      }),
    );
    const legacy: CentralizationConfig = { ...base.config, concepts: legacyConcepts };
    const csv = generateKameCsv(generateAccountingEntries(base.book, legacy), legacy, base.book);
    expect(csv.content).toBe(base.csv.content);
  });
});

/* -------------------------------------------------------------------------- */

describe('kameFields — ficha (RUT y razon social)', () => {
  it('ficha FIJA emite el tercero parametrizado en un concepto consolidado', () => {
    const rutAfp = fakeRut(76123456);
    const { csv, report } = withFields('PREVIS_01', {
      rut: true,
      razonSocial: true,
      fichaSource: 'FIJA',
      fichaRut: rutAfp,
      fichaRazonSocial: 'AFP DEMO S.A.',
    });

    const row = lineFor(csv.content, '2.01.03.01');
    expect(row[9]).toBe(rutAfp.replace(/\./g, ''));   // Rut Ficha
    expect(row[10]).toBe('AFP DEMO S.A.');            // Rzn Social Ficha
    expect(report.errors).toHaveLength(0);
  });

  it('ficha EMPRESA usa el RUT y la razon social del libro', () => {
    const { csv } = withFields('PREVIS_01', {
      rut: true,
      razonSocial: true,
      fichaSource: 'EMPRESA',
    });

    const row = lineFor(csv.content, '2.01.03.01');
    expect(row[9]).toBe(base.book.meta.companyRut.replace(/\./g, ''));
    expect(row[10]).toBe(base.book.meta.companyName);
  });

  it('se puede emitir solo el RUT, sin razon social', () => {
    const { csv } = withFields('PREVIS_01', {
      rut: true,
      razonSocial: false,
      fichaSource: 'FIJA',
      fichaRut: fakeRut(76123456),
      fichaRazonSocial: 'NO DEBE APARECER',
    });

    const row = lineFor(csv.content, '2.01.03.01');
    expect(row[9]).not.toBe('');
    expect(row[10]).toBe('');
  });

  it('apagar la ficha en un concepto por trabajador vacia las columnas', () => {
    const { csv } = withFields('SUELDO_LIQUIDO_01', { rut: false, razonSocial: false });
    const rows = csv.content.split('\r\n').filter(Boolean).slice(1).map((l) => l.split(';'));
    const liquido = rows.filter((c) => c[5] === '2.01.01.01');
    expect(liquido.length).toBeGreaterThan(1);          // sigue siendo por trabajador
    expect(liquido.every((c) => c[9] === '' && c[10] === '')).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe('kameFields — documento, folio y vencimiento', () => {
  it('emite Nombre Doc con el texto parametrizado', () => {
    const { csv } = withFields('PREVIS_01', { documento: true, nombreDoc: 'PLANILLA' });
    expect(lineFor(csv.content, '2.01.03.01')[11]).toBe('PLANILLA');
  });

  it('el folio por PERIODO usa el AAAAMM del libro', () => {
    const { csv } = withFields('PREVIS_01', { folio: true, folioDocMode: 'PERIODO' });
    expect(lineFor(csv.content, '2.01.03.01')[12]).toBe('202607');
  });

  it('el folio FIJO usa el valor escrito', () => {
    const { csv } = withFields('PREVIS_01', {
      folio: true,
      folioDocMode: 'FIJO',
      folioDoc: 'A-1234',
    });
    expect(lineFor(csv.content, '2.01.03.01')[12]).toBe('A-1234');
  });

  it('el vencimiento por dia del mes siguiente se calcula desde el periodo', () => {
    const { csv } = withFields('PREVIS_01', {
      vencimiento: true,
      vencimientoMode: 'DIA_MES_SIGUIENTE',
      vencimientoDia: 10,
    });
    // Periodo julio 2026 -> vence el 10 de agosto de 2026, en formato Kame.
    expect(lineFor(csv.content, '2.01.03.01')[13]).toBe('10/08/2026');
  });

  it('el vencimiento FIJO usa la fecha escrita', () => {
    const { csv } = withFields('PREVIS_01', {
      vencimiento: true,
      vencimientoMode: 'FIJA',
      vencimientoFecha: '2026-09-05',
    });
    expect(lineFor(csv.content, '2.01.03.01')[13]).toBe('5/09/2026');
  });

  it('sin vencimiento la columna queda vacia', () => {
    expect(lineFor(base.csv.content, '2.01.03.01')[13]).toBe('');
  });

  it('la estructura del archivo sigue siendo valida con todos los campos activos', () => {
    const { csv } = withFields('PREVIS_01', {
      rut: true,
      razonSocial: true,
      fichaSource: 'FIJA',
      fichaRut: fakeRut(76123456),
      fichaRazonSocial: 'AFP DEMO S.A.',
      documento: true,
      nombreDoc: 'PLANILLA',
      folio: true,
      vencimiento: true,
    });
    const check = verifyKameStructure(csv.content);
    expect(check.problems).toEqual([]);
    expect(check.ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe('kameFields — calculo de la fecha de vencimiento', () => {
  it('avanza al mes siguiente', () => {
    expect(dueDateFromPeriod('202607', 10)).toBe('2026-08-10');
    expect(dueDateFromPeriod('202601', 20)).toBe('2026-02-20');
  });

  it('diciembre pasa a enero del año siguiente', () => {
    expect(dueDateFromPeriod('202612', 10)).toBe('2027-01-10');
  });

  it('si el mes no tiene ese dia usa el ultimo dia real', () => {
    // Enero + dia 31 -> febrero solo tiene 28 en 2026.
    expect(dueDateFromPeriod('202601', 31)).toBe('2026-02-28');
    // 2028 es bisiesto.
    expect(dueDateFromPeriod('202801', 31)).toBe('2028-02-29');
  });

  it('con un periodo invalido devuelve vacio', () => {
    expect(dueDateFromPeriod('', 10)).toBe('');
    expect(dueDateFromPeriod('abc', 10)).toBe('');
  });
});

/* -------------------------------------------------------------------------- */

describe('kameFields — validaciones (V6 / V7 / V10)', () => {
  it('bloquea si la ficha fija no tiene RUT', () => {
    const { report } = withFields('PREVIS_01', {
      rut: true,
      fichaSource: 'FIJA',
      fichaRut: '',
    });
    expect(report.errors.some((e) => e.code === 'V6_FICHA_SIN_RUT')).toBe(true);
    expect(report.canExport).toBe(false);
  });

  it('bloquea si el RUT de la ficha fija es invalido', () => {
    const { report } = withFields('PREVIS_01', {
      rut: true,
      fichaSource: 'FIJA',
      fichaRut: '11.111.111-9', // digito verificador incorrecto
    });
    expect(report.errors.some((e) => e.code === 'V6_FICHA_RUT_INVALIDO')).toBe(true);
  });

  it('bloquea si falta la razon social de la ficha fija', () => {
    const { report } = withFields('PREVIS_01', {
      razonSocial: true,
      fichaSource: 'FIJA',
      fichaRazonSocial: '',
    });
    expect(report.errors.some((e) => e.code === 'V7_FICHA_SIN_RAZON')).toBe(true);
  });

  it('bloquea si se pide documento sin indicar cual', () => {
    const { report } = withFields('PREVIS_01', { documento: true, nombreDoc: '' });
    expect(report.errors.some((e) => e.code === 'V10_SIN_DOCUMENTO')).toBe(true);
  });

  it('bloquea si se pide folio fijo sin valor', () => {
    const { report } = withFields('PREVIS_01', {
      folio: true,
      folioDocMode: 'FIJO',
      folioDoc: '',
    });
    expect(report.errors.some((e) => e.code === 'V10_SIN_FOLIO')).toBe(true);
  });

  it('bloquea si el vencimiento fijo no es una fecha valida', () => {
    const { report } = withFields('PREVIS_01', {
      vencimiento: true,
      vencimientoMode: 'FIJA',
      vencimientoFecha: 'mañana',
    });
    expect(report.errors.some((e) => e.code === 'V10_VENCIMIENTO_INVALIDO')).toBe(true);
  });

  it('bloquea si el dia de vencimiento esta fuera de rango', () => {
    const { report } = withFields('PREVIS_01', {
      vencimiento: true,
      vencimientoMode: 'DIA_MES_SIGUIENTE',
      vencimientoDia: 45,
    });
    expect(report.errors.some((e) => e.code === 'V10_VENCIMIENTO_DIA_INVALIDO')).toBe(true);
  });

  it('una parametrizacion completa no arroja errores', () => {
    const { report } = withFields('PREVIS_01', {
      rut: true,
      razonSocial: true,
      fichaSource: 'FIJA',
      fichaRut: fakeRut(76123456),
      fichaRazonSocial: 'AFP DEMO S.A.',
      documento: true,
      nombreDoc: 'PLANILLA',
      folio: true,
      folioDocMode: 'PERIODO',
      vencimiento: true,
      vencimientoMode: 'DIA_MES_SIGUIENTE',
      vencimientoDia: 10,
    });
    expect(report.errors).toHaveLength(0);
    expect(report.canExport).toBe(true);
  });

  it('los campos analiticos no alteran el cuadre del asiento', () => {
    const { accounting } = withFields('PREVIS_01', {
      rut: true,
      razonSocial: true,
      fichaSource: 'EMPRESA',
      documento: true,
      nombreDoc: 'PLANILLA',
      folio: true,
      vencimiento: true,
    });
    expect(accounting.totalDebit).toBe(base.accounting.totalDebit);
    expect(accounting.totalCredit).toBe(base.accounting.totalCredit);
    expect(accounting.balanced).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe('kameFields — resolucion directa de valores', () => {
  it('un campo apagado se emite vacio aunque tenga valor configurado', () => {
    const fields = {
      ...buildDefaultKameFields('CONSOLIDATED'),
      rut: false,
      fichaSource: 'FIJA' as const,
      fichaRut: fakeRut(76123456),
      documento: false,
      nombreDoc: 'PLANILLA',
    };
    const resolved = resolveKameFieldValues(fields, base.book.meta, null);
    expect(resolved.rut).toBe('');
    expect(resolved.documento).toBe('');
  });

  it('ficha del trabajador sin trabajador queda vacia', () => {
    const fields = {
      ...buildDefaultKameFields('PER_WORKER'),
    };
    const resolved = resolveKameFieldValues(fields, base.book.meta, null);
    expect(resolved.rut).toBe('');
    expect(resolved.razonSocial).toBe('');
  });
});

/* -------------------------------------------------------------------------- */

describe('kameFields — copiar la parametrizacion a otros conceptos', () => {
  /** Origen: PREVIS con ficha fija, documento, folio y vencimiento. */
  const sourceFields: ConceptKameFields = {
    ...buildDefaultKameFields('CONSOLIDATED'),
    rut: true,
    razonSocial: true,
    fichaSource: 'FIJA',
    fichaRut: fakeRut(76123456),
    fichaRazonSocial: 'AFP DEMO S.A.',
    documento: true,
    nombreDoc: 'PLANILLA',
    folio: true,
    folioDocMode: 'PERIODO',
    vencimiento: true,
    vencimientoMode: 'DIA_MES_SIGUIENTE',
    vencimientoDia: 10,
  };

  const conceptsWithSource = {
    ...base.config.concepts,
    PREVIS_01: { ...base.config.concepts['PREVIS_01'], kameFields: sourceFields },
  };

  it('copia todos los grupos a los destinos indicados', () => {
    const r = applyKameFieldsTo(
      conceptsWithSource,
      'PREVIS_01',
      ['SALUD_01', 'CESANTIA_01'],
      ['ficha', 'documento', 'folio', 'vencimiento'],
    );

    expect(r.appliedTo).toEqual(['SALUD_01', 'CESANTIA_01']);
    for (const id of ['SALUD_01', 'CESANTIA_01']) {
      const f = resolveKameFields(r.concepts[id]);
      expect(f.fichaRut).toBe(sourceFields.fichaRut);
      expect(f.fichaRazonSocial).toBe('AFP DEMO S.A.');
      expect(f.nombreDoc).toBe('PLANILLA');
      expect(f.vencimientoDia).toBe(10);
    }
  });

  it('copiar solo un grupo NO toca los demas del destino', () => {
    // El destino ya tiene su propia ficha parametrizada.
    const conceptos = {
      ...conceptsWithSource,
      SALUD_01: {
        ...base.config.concepts['SALUD_01'],
        kameFields: {
          ...buildDefaultKameFields('CONSOLIDATED'),
          rut: true,
          fichaSource: 'FIJA' as const,
          fichaRut: fakeRut(77111111),
          fichaRazonSocial: 'ISAPRE DEMO',
        },
      },
    };

    const r = applyKameFieldsTo(conceptos, 'PREVIS_01', ['SALUD_01'], ['documento']);
    const f = resolveKameFields(r.concepts['SALUD_01']);

    expect(f.nombreDoc).toBe('PLANILLA');            // se copio
    expect(f.documento).toBe(true);
    expect(f.fichaRazonSocial).toBe('ISAPRE DEMO');  // se respeto
    expect(f.fichaRut).toBe(fakeRut(77111111));
    expect(f.vencimiento).toBe(false);               // no se toco
  });

  it('no muta el mapa original', () => {
    const antes = JSON.stringify(conceptsWithSource);
    applyKameFieldsTo(conceptsWithSource, 'PREVIS_01', ['SALUD_01'], ['ficha']);
    expect(JSON.stringify(conceptsWithSource)).toBe(antes);
  });

  it('omite el propio origen, los inexistentes y los que no generan movimiento', () => {
    const r = applyKameFieldsTo(
      conceptsWithSource,
      'PREVIS_01',
      ['PREVIS_01', 'NO_EXISTE_01', 'TOTAL_HABERES_01', 'SALUD_01'],
      ['documento'],
    );

    expect(r.appliedTo).toEqual(['SALUD_01']);
    expect(r.skipped.map((s) => s.conceptId).sort()).toEqual(
      ['NO_EXISTE_01', 'PREVIS_01', 'TOTAL_HABERES_01'].sort(),
    );
  });

  it('sin grupos seleccionados no aplica nada', () => {
    const r = applyKameFieldsTo(conceptsWithSource, 'PREVIS_01', ['SALUD_01'], []);
    expect(r.appliedTo).toHaveLength(0);
    expect(r.concepts).toBe(conceptsWithSource);
  });

  it('el archivo generado refleja la copia', () => {
    const r = applyKameFieldsTo(
      conceptsWithSource,
      'PREVIS_01',
      ['SALUD_01'],
      ['documento', 'folio', 'vencimiento'],
    );
    const config: CentralizationConfig = { ...base.config, concepts: r.concepts };
    const csv = generateKameCsv(generateAccountingEntries(base.book, config), config, base.book);

    const salud = csv.content.split('\r\n').filter(Boolean).slice(1)
      .map((l) => l.split(';')).find((c) => c[5] === '2.01.03.02')!;

    expect(salud[11]).toBe('PLANILLA');    // Nombre Doc
    expect(salud[12]).toBe('202607');      // Folio Doc
    expect(salud[13]).toBe('10/08/2026');  // Fecha Venc
  });

  it('activeKameFieldGroups informa que grupos estan encendidos', () => {
    expect(activeKameFieldGroups(sourceFields).sort()).toEqual(
      ['documento', 'ficha', 'folio', 'vencimiento'],
    );
    expect(activeKameFieldGroups(buildDefaultKameFields('CONSOLIDATED'))).toEqual([]);
    expect(activeKameFieldGroups(buildDefaultKameFields('PER_WORKER'))).toEqual(['ficha']);
  });

  it('sugiere como destinos los conceptos de la misma clasificacion', () => {
    const sugeridos = suggestCopyTargets(base.config.concepts, 'PREVIS_01');
    // PREVIS es DESCUENTO: deben aparecer los otros descuentos, no los haberes.
    expect(sugeridos).toContain('SALUD_01');
    expect(sugeridos).toContain('CESANTIA_01');
    expect(sugeridos).not.toContain('SUELDO_BASE_01');
    expect(sugeridos).not.toContain('PREVIS_01');
  });

  it('mergeKameFieldGroups reemplaza el grupo completo, no campo a campo', () => {
    const target = buildDefaultKameFields('CONSOLIDATED');
    const merged = mergeKameFieldGroups(target, sourceFields, ['vencimiento']);
    // Las cuatro claves del grupo viajan juntas.
    expect(merged.vencimiento).toBe(true);
    expect(merged.vencimientoMode).toBe('DIA_MES_SIGUIENTE');
    expect(merged.vencimientoDia).toBe(10);
    expect(merged.vencimientoFecha).toBe('');
    // Y nada mas cambia.
    expect(merged.documento).toBe(false);
    expect(merged.rut).toBe(false);
  });
});
