/**
 * Helpers compartidos por las pruebas: arma un escenario completo
 * (libro + analisis + configuracion parametrizada) listo para usar.
 */

import { parsePayrollWorkbook } from '../src/modules/remuneraciones/core/excelParser';
import { analyzePayroll } from '../src/modules/remuneraciones/core/payrollAnalyzer';
import { buildWorkingConfig } from '../src/modules/remuneraciones/core/configStore';
import { generateAccountingEntries } from '../src/modules/remuneraciones/core/accountingEngine';
import { validateCentralization } from '../src/modules/remuneraciones/core/validationEngine';
import { generateKameCsv } from '../src/modules/remuneraciones/core/kameExporter';
import type {
  CentralizationConfig,
  ThirdPartyMode,
} from '../src/modules/remuneraciones/types/payroll';
import {
  TEST_ACCOUNTS,
  TEST_EMPLOYER_ACCOUNTS,
  buildSyntheticWorkbookBuffer,
  type FixtureOptions,
} from './fixtures/syntheticPayroll';

export interface ScenarioOptions extends FixtureOptions {
  /** Modalidad del concepto de liquido. Por defecto PER_WORKER. */
  liquidoMode?: ThirdPartyMode;
  /** Deja algun concepto sin cuenta, para probar la validacion V1. */
  omitAccountFor?: string[];
  /** Incluye los totalizadores como si fueran haberes (prueba V5). */
  includeTotalizers?: boolean;
  /** Configuracion previa a reutilizar. */
  existingConfig?: CentralizationConfig | null;
}

export function buildScenario(options: ScenarioOptions = {}) {
  const buffer = buildSyntheticWorkbookBuffer(options);
  const book = parsePayrollWorkbook(buffer, { fileName: 'demo.xlsx' });
  const analyses = analyzePayroll(book);
  const built = buildWorkingConfig(book, analyses, options.existingConfig ?? null);
  const config = built.config;

  // Aplica el plan de cuentas ficticio de pruebas.
  for (const [id, account] of Object.entries(TEST_ACCOUNTS)) {
    const cfg = config.concepts[id];
    if (!cfg) continue;
    if (options.omitAccountFor?.includes(id)) continue;
    cfg.account = account;
  }
  for (const [id, [expense, liability]] of Object.entries(TEST_EMPLOYER_ACCOUNTS)) {
    const cfg = config.concepts[id];
    if (!cfg) continue;
    if (options.omitAccountFor?.includes(id)) continue;
    cfg.expenseAccount = expense;
    cfg.liabilityAccount = liability;
  }

  const liquido = config.concepts['SUELDO_LIQUIDO_01'];
  if (liquido) liquido.thirdPartyMode = options.liquidoMode ?? 'PER_WORKER';

  // Columna informativa: se excluye.
  const dias = config.concepts['DIAS_TRABAJADOS_01'];
  if (dias) dias.include = false;

  if (options.includeTotalizers) {
    for (const id of ['TOTAL_HABERES_01', 'TOTAL_DESCUENTOS_01']) {
      const cfg = config.concepts[id];
      if (!cfg) continue;
      cfg.include = true;
      cfg.classification = id.includes('HABERES') ? 'HABER' : 'DESCUENTO';
      cfg.account = id.includes('HABERES') ? '5.99.99.99' : '2.99.99.99';
    }
  }

  const accounting = generateAccountingEntries(book, config);
  const report = validateCentralization(book, config, analyses, accounting);
  const csv = generateKameCsv(accounting, config, book);

  return { book, analyses, config, built, accounting, report, csv };
}
