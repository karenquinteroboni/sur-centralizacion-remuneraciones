/**
 * PRUEBA 2 — Clasificacion automatica, deteccion de totalizadores
 *            y advertencia de doble contabilizacion.
 */

import { describe, expect, it } from 'vitest';
import { parseGrid } from '../src/modules/remuneraciones/core/excelParser';
import {
  analyzePayroll,
  detectDoubleCounting,
} from '../src/modules/remuneraciones/core/payrollAnalyzer';
import { classifyByDictionary } from '../src/modules/remuneraciones/utils/conceptUtils';
import { buildSyntheticGrid } from './fixtures/syntheticPayroll';

const book = parseGrid(buildSyntheticGrid());
const analyses = analyzePayroll(book);

describe('payrollAnalyzer — clasificacion', () => {
  it('clasifica haberes, descuentos, neto y aportes del empleador', () => {
    expect(analyses['SUELDO_BASE_01'].suggestedClassification).toBe('HABER');
    expect(analyses['GRATIFICACION_01'].suggestedClassification).toBe('HABER');
    expect(analyses['HORAS_EXTRAS_01'].suggestedClassification).toBe('HABER');
    expect(analyses['HORAS_EXTRAS_02'].suggestedClassification).toBe('HABER');
    expect(analyses['COLACION_01'].suggestedClassification).toBe('HABER');

    expect(analyses['PREVIS_01'].suggestedClassification).toBe('DESCUENTO');
    expect(analyses['SALUD_01'].suggestedClassification).toBe('DESCUENTO');
    expect(analyses['CESANTIA_01'].suggestedClassification).toBe('DESCUENTO');

    expect(analyses['SUELDO_LIQUIDO_01'].suggestedClassification).toBe('NETO');

    expect(analyses['SIS_01'].suggestedClassification).toBe('APORTE_EMPLEADOR');
    expect(analyses['MUTUAL_01'].suggestedClassification).toBe('APORTE_EMPLEADOR');

    expect(analyses['DIAS_TRABAJADOS_01'].suggestedClassification).toBe('INFORMATIVO');
  });

  it('sugiere modalidad "por trabajador" para el liquido', () => {
    expect(analyses['SUELDO_LIQUIDO_01'].suggestedThirdPartyMode).toBe('PER_WORKER');
    expect(analyses['SUELDO_BASE_01'].suggestedThirdPartyMode).toBe('CONSOLIDATED');
  });

  it('deja como ambiguo (null) un concepto que no reconoce', () => {
    const withUnknown = parseGrid(buildSyntheticGrid({ extraUnknownColumn: true }));
    const a = analyzePayroll(withUnknown);
    const unknown = withUnknown.concepts.find((c) => c.label === 'CONCEPTO RARO XZ')!;
    expect(a[unknown.id].suggestedClassification).toBeNull();
    expect(a[unknown.id].rationale).toMatch(/manual/i);
  });

  it('el diccionario prioriza "empleador" sobre el concepto base', () => {
    expect(classifyByDictionary('CESANTÍA').classification).toBe('DESCUENTO');
    expect(classifyByDictionary('SEGURO CESANTÍA EMPLEADOR').classification).toBe('APORTE_EMPLEADOR');
    expect(classifyByDictionary('APV').classification).toBe('DESCUENTO');
    expect(classifyByDictionary('APVC EMPLEADOR').classification).toBe('APORTE_EMPLEADOR');
    expect(classifyByDictionary('SUELDO LÍQUIDO').classification).toBe('NETO');
    expect(classifyByDictionary('TOTAL HABERES').classification).toBe('TOTALIZADOR');
  });
});

describe('payrollAnalyzer — totalizadores', () => {
  it('detecta TOTAL HABERES por nombre y por relacion matematica', () => {
    const a = analyses['TOTAL_HABERES_01'];
    expect(a.looksLikeTotalizer).toBe(true);
    expect(a.nameSaysTotalizer).toBe(true);
    expect(a.mathSaysTotalizer).toBe(true);
    // Sus componentes son las columnas de haberes.
    expect(a.componentConceptIds).toContain('SUELDO_BASE_01');
    expect(a.componentConceptIds).toContain('GRATIFICACION_01');
    expect(a.componentConceptIds).toContain('COLACION_01');
  });

  it('detecta TOTAL DESCUENTOS', () => {
    const a = analyses['TOTAL_DESCUENTOS_01'];
    expect(a.looksLikeTotalizer).toBe(true);
    expect(a.componentConceptIds).toContain('PREVIS_01');
    expect(a.componentConceptIds).toContain('SALUD_01');
  });

  it('reconoce el liquido como diferencia haberes - descuentos, sin degradarlo a totalizador', () => {
    const a = analyses['SUELDO_LIQUIDO_01'];
    expect(a.mathSaysTotalizer).toBe(true);
    expect(a.nameSaysTotalizer).toBe(false);
    // Aun asi se mantiene como NETO: es lo contablemente correcto.
    expect(a.suggestedClassification).toBe('NETO');
  });

  it('NO marca como totalizador una columna de haber normal', () => {
    expect(analyses['SUELDO_BASE_01'].looksLikeTotalizer).toBe(false);
    expect(analyses['GRATIFICACION_01'].looksLikeTotalizer).toBe(false);
    expect(analyses['COLACION_01'].looksLikeTotalizer).toBe(false);
  });
});

describe('payrollAnalyzer — doble contabilizacion', () => {
  it('advierte cuando se incluye el totalizador junto a sus componentes', () => {
    const included = new Set([
      'TOTAL_HABERES_01',
      'SUELDO_BASE_01',
      'GRATIFICACION_01',
      'COLACION_01',
    ]);
    const findings = detectDoubleCounting(book, analyses, included);

    expect(findings).toHaveLength(1);
    expect(findings[0].totalizerConceptId).toBe('TOTAL_HABERES_01');
    expect(findings[0].message).toMatch(/doble contabilizacion/i);
    expect(findings[0].includedComponentIds).toContain('SUELDO_BASE_01');
  });

  it('NO advierte si el totalizador va solo, sin sus componentes', () => {
    const included = new Set(['TOTAL_HABERES_01']);
    expect(detectDoubleCounting(book, analyses, included)).toHaveLength(0);
  });

  it('NO advierte si solo se incluyen los componentes', () => {
    const included = new Set(['SUELDO_BASE_01', 'GRATIFICACION_01', 'COLACION_01']);
    expect(detectDoubleCounting(book, analyses, included)).toHaveLength(0);
  });
});
