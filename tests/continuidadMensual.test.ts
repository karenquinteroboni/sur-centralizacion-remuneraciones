/**
 * PRUEBA 8 — CONTINUIDAD MES A MES
 * ============================================================================
 *  Simula el ciclo real del estudio: se cierra julio, se guarda la
 *  parametrizacion, y al mes siguiente se carga el libro de agosto.
 *
 *  Lo que se valida:
 *   A. Las CUENTAS contables quedan como predeterminadas y no hay que
 *      volver a escribirlas.
 *   B. El RUT, la razon social y el documento asociados tambien persisten.
 *   C. Lo UNICO que cambia solo es el folio y la fecha de vencimiento, que se
 *      recalculan desde el periodo del nuevo libro.
 *   D. Un concepto NUEVO llega SIN cuenta —aunque el diccionario sepa
 *      clasificarlo— y bloquea la exportacion hasta que se le defina una.
 * ============================================================================
 */

import { describe, expect, it } from 'vitest';
import { parsePayrollWorkbook } from '../src/modules/remuneraciones/core/excelParser';
import { analyzePayroll } from '../src/modules/remuneraciones/core/payrollAnalyzer';
import {
  InMemoryConfigRepository,
  buildWorkingConfig,
} from '../src/modules/remuneraciones/core/configStore';
import {
  detectPeriodInText,
  mentionsOtherPeriod,
  resolveKameFields,
} from '../src/modules/remuneraciones/core/kameFields';
import { generateAccountingEntries } from '../src/modules/remuneraciones/core/accountingEngine';
import { validateCentralization } from '../src/modules/remuneraciones/core/validationEngine';
import { generateKameCsv } from '../src/modules/remuneraciones/core/kameExporter';
import type {
  CentralizationConfig,
  PayrollBook,
} from '../src/modules/remuneraciones/types/payroll';
import {
  TEST_ACCOUNTS,
  TEST_EMPLOYER_ACCOUNTS,
  buildSyntheticWorkbookBuffer,
  fakeRut,
} from './fixtures/syntheticPayroll';

const RUT_AFP = fakeRut(76123456);
const RAZON_AFP = 'AFP DEMO S.A.';

/** Lee un libro sintetico de un periodo dado. */
function leerLibro(period: string, extra?: { label: string; amount: number }[]): PayrollBook {
  return parsePayrollWorkbook(
    buildSyntheticWorkbookBuffer({ period, extraColumns: extra }),
    { fileName: `libro-${period}.xlsx` },
  );
}

/** Parametriza el libro por completo, como lo haria el usuario en el primer mes. */
function parametrizarJulio(book: PayrollBook): CentralizationConfig {
  const analyses = analyzePayroll(book);
  const { config } = buildWorkingConfig(book, analyses, null);

  for (const [id, account] of Object.entries(TEST_ACCOUNTS)) {
    if (config.concepts[id]) config.concepts[id].account = account;
  }
  for (const [id, [gasto, obligacion]] of Object.entries(TEST_EMPLOYER_ACCOUNTS)) {
    if (!config.concepts[id]) continue;
    config.concepts[id].expenseAccount = gasto;
    config.concepts[id].liabilityAccount = obligacion;
  }
  if (config.concepts['DIAS_TRABAJADOS_01']) {
    config.concepts['DIAS_TRABAJADOS_01'].include = false;
  }

  // PREVIS: ficha fija + documento + folio por periodo + vencimiento dia 10.
  config.concepts['PREVIS_01'].kameFields = {
    ...resolveKameFields(config.concepts['PREVIS_01']),
    rut: true,
    razonSocial: true,
    fichaSource: 'FIJA',
    fichaRut: RUT_AFP,
    fichaRazonSocial: RAZON_AFP,
    documento: true,
    nombreDoc: 'PLANILLA',
    folio: true,
    folioDocMode: 'PERIODO',
    vencimiento: true,
    vencimientoMode: 'DIA_MES_SIGUIENTE',
    vencimientoDia: 10,
  };

  return config;
}

/** Fila del CSV correspondiente a una cuenta. */
function fila(csv: string, cuenta: string): string[] {
  const f = csv
    .split('\r\n')
    .filter(Boolean)
    .slice(1)
    .map((l) => l.split(';'))
    .find((c) => c[5] === cuenta);
  if (!f) throw new Error(`No hay linea para la cuenta ${cuenta}`);
  return f;
}

/* ========================================================================== */

describe('continuidad mes a mes — cierre de julio y carga de agosto', () => {
  /** Estado tras cerrar julio y guardar. */
  async function cerrarJulioYAbrirAgosto(extraAgosto?: { label: string; amount: number }[]) {
    const repo = new InMemoryConfigRepository();

    // --- Mes 1: julio ------------------------------------------------------
    const julio = leerLibro('Julio 2026');
    const configJulio = parametrizarJulio(julio);
    await repo.save(configJulio);

    const contJulio = generateAccountingEntries(julio, configJulio);
    const csvJulio = generateKameCsv(contJulio, configJulio, julio);

    // --- Mes 2: agosto -----------------------------------------------------
    const agosto = leerLibro('Agosto 2026', extraAgosto);
    const analisisAgosto = analyzePayroll(agosto);
    const guardada = await repo.load(configJulio.companyKey);
    expect(guardada).not.toBeNull();

    const built = buildWorkingConfig(agosto, analisisAgosto, guardada);
    const contAgosto = generateAccountingEntries(agosto, built.config);
    const reporteAgosto = validateCentralization(
      agosto,
      built.config,
      analisisAgosto,
      contAgosto,
    );
    const csvAgosto = generateKameCsv(contAgosto, built.config, agosto);

    return { julio, configJulio, csvJulio, agosto, built, contAgosto, reporteAgosto, csvAgosto };
  }

  /* --- A. Las cuentas quedan predeterminadas ---------------------------- */

  it('A · las cuentas contables se reutilizan sin volver a escribirlas', async () => {
    const { built } = await cerrarJulioYAbrirAgosto();

    expect(built.reusedExisting).toBe(true);
    for (const [id, account] of Object.entries(TEST_ACCOUNTS)) {
      expect(built.config.concepts[id].account).toBe(account);
    }
    for (const [id, [gasto, obligacion]] of Object.entries(TEST_EMPLOYER_ACCOUNTS)) {
      expect(built.config.concepts[id].expenseAccount).toBe(gasto);
      expect(built.config.concepts[id].liabilityAccount).toBe(obligacion);
    }
  });

  it('A · tambien se conservan clasificacion, modalidad de tercero y exclusiones', async () => {
    const { built } = await cerrarJulioYAbrirAgosto();

    expect(built.config.concepts['SUELDO_BASE_01'].classification).toBe('HABER');
    expect(built.config.concepts['PREVIS_01'].classification).toBe('DESCUENTO');
    expect(built.config.concepts['SUELDO_LIQUIDO_01'].thirdPartyMode).toBe('PER_WORKER');
    // El informativo que se excluyo a mano sigue excluido.
    expect(built.config.concepts['DIAS_TRABAJADOS_01'].include).toBe(false);
    // Y los totalizadores siguen fuera.
    expect(built.config.concepts['TOTAL_HABERES_01'].include).toBe(false);
  });

  it('A · en agosto NO queda ningun concepto sin parametrizar', async () => {
    const { built, reporteAgosto } = await cerrarJulioYAbrirAgosto();

    expect(built.newConceptIds).toHaveLength(0);
    expect(reporteAgosto.errors).toHaveLength(0);
    expect(reporteAgosto.canExport).toBe(true);
  });

  /* --- B. RUT, razon social y documento persisten ----------------------- */

  it('B · el RUT y la razon social de la ficha se conservan', async () => {
    const { built, csvAgosto } = await cerrarJulioYAbrirAgosto();

    const f = resolveKameFields(built.config.concepts['PREVIS_01']);
    expect(f.fichaSource).toBe('FIJA');
    expect(f.fichaRut).toBe(RUT_AFP);
    expect(f.fichaRazonSocial).toBe(RAZON_AFP);

    const linea = fila(csvAgosto.content, '2.01.03.01');
    expect(linea[9]).toBe(RUT_AFP.replace(/\./g, ''));  // Rut Ficha
    expect(linea[10]).toBe(RAZON_AFP);                  // Rzn Social Ficha
  });

  it('B · el documento asociado se conserva', async () => {
    const { built, csvAgosto } = await cerrarJulioYAbrirAgosto();

    expect(resolveKameFields(built.config.concepts['PREVIS_01']).nombreDoc).toBe('PLANILLA');
    expect(fila(csvAgosto.content, '2.01.03.01')[11]).toBe('PLANILLA');
  });

  /* --- C. Solo cambian folio y vencimiento ------------------------------ */

  it('C · el folio por periodo pasa de 202607 a 202608 sin tocar nada', async () => {
    const { csvJulio, csvAgosto } = await cerrarJulioYAbrirAgosto();

    expect(fila(csvJulio.content, '2.01.03.01')[12]).toBe('202607');
    expect(fila(csvAgosto.content, '2.01.03.01')[12]).toBe('202608');
  });

  it('C · el vencimiento se recalcula al mes siguiente del nuevo periodo', async () => {
    const { csvJulio, csvAgosto } = await cerrarJulioYAbrirAgosto();

    expect(fila(csvJulio.content, '2.01.03.01')[13]).toBe('10/08/2026');
    expect(fila(csvAgosto.content, '2.01.03.01')[13]).toBe('10/09/2026');
  });

  it('C · la cabecera del comprobante sigue al nuevo periodo', async () => {
    const { built, csvAgosto } = await cerrarJulioYAbrirAgosto();

    expect(built.config.voucher.numeroMovimiento).toBe('202608');
    expect(built.config.voucher.fecha).toBe('2026-08-31');

    const linea = fila(csvAgosto.content, '2.01.03.01');
    expect(linea[3]).toBe('31/08/2026');   // Fecha
    expect(linea[16]).toBe('202608');      // Numero Movimiento
  });

  it('C · lo unico que difiere entre julio y agosto son fecha, folio y vencimiento', async () => {
    const { csvJulio, csvAgosto } = await cerrarJulioYAbrirAgosto();

    const filasJulio = csvJulio.content.split('\r\n').filter(Boolean).slice(1);
    const filasAgosto = csvAgosto.content.split('\r\n').filter(Boolean).slice(1);
    expect(filasAgosto).toHaveLength(filasJulio.length);

    // Columnas que SI pueden cambiar de un mes a otro.
    const CAMBIANTES = new Set([3 /* Fecha */, 12 /* Folio Doc */, 13 /* Fecha Venc */,
                                16 /* Numero Movimiento */, 4 /* Comentario (lleva el periodo) */]);

    for (let i = 0; i < filasJulio.length; i++) {
      const a = filasJulio[i].split(';');
      const b = filasAgosto[i].split(';');
      for (let c = 0; c < a.length; c++) {
        if (CAMBIANTES.has(c)) continue;
        expect(
          b[c],
          `fila ${i + 1}, columna ${c}: cambio inesperado entre julio y agosto`,
        ).toBe(a[c]);
      }
    }
  });

  /* --- D. Los conceptos nuevos llegan SIN cuenta ------------------------ */

  it('D · un concepto nuevo llega sin cuenta y marcado como nuevo', async () => {
    const { built } = await cerrarJulioYAbrirAgosto([
      { label: 'BONO PRODUCTIVIDAD', amount: 25000 },
    ]);

    const nuevo = Object.values(built.config.concepts).find(
      (c) => c.label === 'BONO PRODUCTIVIDAD',
    );
    expect(nuevo).toBeDefined();
    expect(built.newConceptIds).toContain(nuevo!.conceptId);

    // La cuenta va VACIA aunque el diccionario sepa que es un haber.
    expect(nuevo!.account).toBe('');
    expect(nuevo!.expenseAccount ?? '').toBe('');
    expect(nuevo!.liabilityAccount ?? '').toBe('');
  });

  it('D · el diccionario puede sugerir la clasificacion, pero NUNCA la cuenta', async () => {
    const { agosto, built } = await cerrarJulioYAbrirAgosto([
      { label: 'BONO PRODUCTIVIDAD', amount: 25000 },
    ]);
    const analisis = analyzePayroll(agosto);
    const nuevo = Object.values(built.config.concepts).find(
      (c) => c.label === 'BONO PRODUCTIVIDAD',
    )!;

    // El analizador lo reconoce como haber...
    expect(analisis[nuevo.conceptId].suggestedClassification).toBe('HABER');
    expect(nuevo.classification).toBe('HABER');
    // ...y aun asi la cuenta queda vacia: el modulo no inventa cuentas.
    expect(nuevo.account).toBe('');
  });

  it('D · el concepto nuevo BLOQUEA la exportacion hasta definir su cuenta', async () => {
    const { reporteAgosto } = await cerrarJulioYAbrirAgosto([
      { label: 'BONO PRODUCTIVIDAD', amount: 25000 },
    ]);

    expect(reporteAgosto.canExport).toBe(false);
    const error = reporteAgosto.errors.find((e) => e.code === 'V1_SIN_CUENTA');
    expect(error).toBeDefined();
    expect(error!.message).toContain('BONO PRODUCTIVIDAD');
  });

  it('D · un concepto nuevo tampoco hereda ficha, documento ni vencimiento', async () => {
    const { built } = await cerrarJulioYAbrirAgosto([
      { label: 'BONO PRODUCTIVIDAD', amount: 25000 },
    ]);
    const nuevo = Object.values(built.config.concepts).find(
      (c) => c.label === 'BONO PRODUCTIVIDAD',
    )!;
    const f = resolveKameFields(nuevo);

    expect(f.rut).toBe(false);
    expect(f.razonSocial).toBe(false);
    expect(f.documento).toBe(false);
    expect(f.nombreDoc).toBe('');
    expect(f.vencimiento).toBe(false);
  });

  it('D · una vez definida la cuenta, agosto cierra igual que julio', async () => {
    const { agosto, built } = await cerrarJulioYAbrirAgosto([
      { label: 'BONO PRODUCTIVIDAD', amount: 25000 },
    ]);
    const analisis = analyzePayroll(agosto);
    const nuevo = Object.values(built.config.concepts).find(
      (c) => c.label === 'BONO PRODUCTIVIDAD',
    )!;

    const corregida: CentralizationConfig = {
      ...built.config,
      concepts: {
        ...built.config.concepts,
        [nuevo.conceptId]: { ...nuevo, account: '5.01.01.99' },
      },
    };

    const contabilidad = generateAccountingEntries(agosto, corregida);
    const reporte = validateCentralization(agosto, corregida, analisis, contabilidad);

    expect(reporte.errors.filter((e) => e.code === 'V1_SIN_CUENTA')).toHaveLength(0);
    // El bono desbalancea el asiento (no esta en el TOTAL HABERES del libro),
    // que es exactamente lo que debe pasar: el usuario tiene que decidir.
    expect(contabilidad.entries.some((e) => e.account === '5.01.01.99')).toBe(true);
  });

  /* --- Persistencia efectiva -------------------------------------------- */

  it('la configuracion guardada sobrevive un ciclo completo de guardar y leer', async () => {
    const repo = new InMemoryConfigRepository();
    const julio = leerLibro('Julio 2026');
    const config = parametrizarJulio(julio);
    await repo.save(config);

    // Se serializa y deserializa, como haria un backend real.
    const leida = JSON.parse(
      JSON.stringify(await repo.load(config.companyKey)),
    ) as CentralizationConfig;

    expect(leida.concepts['SUELDO_BASE_01'].account).toBe(TEST_ACCOUNTS['SUELDO_BASE_01']);
    expect(leida.concepts['PREVIS_01'].kameFields?.fichaRut).toBe(RUT_AFP);
    expect(leida.concepts['PREVIS_01'].kameFields?.nombreDoc).toBe('PLANILLA');
    expect(leida.schemaVersion).toBe(1);
  });

  it('el re-emparejamiento sobrevive un cambio en el orden de las columnas', async () => {
    const repo = new InMemoryConfigRepository();
    const julio = leerLibro('Julio 2026');
    await repo.save(parametrizarJulio(julio));

    // Agosto trae una columna nueva ANTES del final: los indices se corren.
    const agosto = leerLibro('Agosto 2026', [{ label: 'BONO PRODUCTIVIDAD', amount: 1000 }]);
    const built = buildWorkingConfig(
      agosto,
      analyzePayroll(agosto),
      await repo.load(julio.meta.companyRut.replace(/\./g, '')),
    );

    // Las cuentas siguen pegadas al concepto correcto, no a la posicion.
    expect(built.config.concepts['SALUD_01'].account).toBe(TEST_ACCOUNTS['SALUD_01']);
    expect(built.config.concepts['HORAS_EXTRAS_02'].account).toBe(
      TEST_ACCOUNTS['HORAS_EXTRAS_02'],
    );
  });
});

/* ========================================================================== */

describe('continuidad mes a mes — valores que NO se recalculan solos', () => {
  /**
   * El folio por periodo y el vencimiento por dia del mes siguiente se
   * actualizan solos. Los modos FIJO / FIJA no: son valores escritos a mano y
   * el modulo no los cambia por su cuenta. Como eso puede pasar inadvertido de
   * un mes a otro, se advierte.
   */
  async function agostoConValoresDeJulio() {
    const repo = new InMemoryConfigRepository();
    const julio = leerLibro('Julio 2026');
    const config = parametrizarJulio(julio);

    // El usuario escribio a mano el folio y la fecha en julio.
    config.concepts['PREVIS_01'].kameFields = {
      ...resolveKameFields(config.concepts['PREVIS_01']),
      folio: true,
      folioDocMode: 'FIJO',
      folioDoc: 'PLANILLA-JULIO',
      vencimiento: true,
      vencimientoMode: 'FIJA',
      vencimientoFecha: '2026-08-10',
    };
    await repo.save(config);

    const agosto = leerLibro('Agosto 2026');
    const analisis = analyzePayroll(agosto);
    const built = buildWorkingConfig(agosto, analisis, await repo.load(config.companyKey));
    const contabilidad = generateAccountingEntries(agosto, built.config);
    const reporte = validateCentralization(agosto, built.config, analisis, contabilidad);
    return { reporte, csv: generateKameCsv(contabilidad, built.config, agosto) };
  }

  it('advierte que el folio fijo menciona otro periodo', async () => {
    const { reporte } = await agostoConValoresDeJulio();
    const aviso = reporte.warnings.find((w) => w.code === 'V10_FOLIO_DE_OTRO_PERIODO');

    expect(aviso).toBeDefined();
    expect(aviso!.message).toContain('PLANILLA-JULIO');
  });

  it('advierte que la fecha de vencimiento quedo del periodo anterior', async () => {
    const { reporte } = await agostoConValoresDeJulio();
    const aviso = reporte.warnings.find((w) => w.code === 'V10_VENCIMIENTO_DE_OTRO_PERIODO');

    expect(aviso).toBeDefined();
    expect(aviso!.message).toContain('2026-08-10');
  });

  it('las advertencias NO bloquean: el usuario decide', async () => {
    const { reporte } = await agostoConValoresDeJulio();
    expect(reporte.errors.filter((e) => e.code.startsWith('V10_'))).toHaveLength(0);
    expect(reporte.canExport).toBe(true);
  });

  it('con folio por periodo y vencimiento calculado NO hay advertencias', async () => {
    // parametrizarJulio ya usa PERIODO + DIA_MES_SIGUIENTE.
    const repo = new InMemoryConfigRepository();
    const julio = leerLibro('Julio 2026');
    await repo.save(parametrizarJulio(julio));

    const agosto = leerLibro('Agosto 2026');
    const analisis = analyzePayroll(agosto);
    const built = buildWorkingConfig(agosto, analisis, await repo.load(
      julio.meta.companyRut.replace(/\./g, ''),
    ));
    const reporte = validateCentralization(
      agosto,
      built.config,
      analisis,
      generateAccountingEntries(agosto, built.config),
    );

    expect(reporte.warnings.filter((w) => w.code.startsWith('V10_'))).toHaveLength(0);
  });

  it('detecta el periodo mencionado tanto en digitos como en nombre de mes', () => {
    expect(detectPeriodInText('PLANILLA 202607')).toBe('202607');
    expect(detectPeriodInText('PLANILLA-JULIO')).toBe('????07');
    expect(detectPeriodInText('PLANILLA JULIO 2026')).toBe('202607');
    expect(detectPeriodInText('PLANILLA')).toBeNull();
    expect(detectPeriodInText('A-1234')).toBeNull();

    expect(mentionsOtherPeriod('PLANILLA-JULIO', '202608')).toBe(true);
    expect(mentionsOtherPeriod('PLANILLA-AGOSTO', '202608')).toBe(false);
    expect(mentionsOtherPeriod('202607', '202608')).toBe(true);
    expect(mentionsOtherPeriod('A-1234', '202608')).toBe(false);
  });
});
