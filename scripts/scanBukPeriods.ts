/**
 * Recorre varios meses de una empresa en Buk y dice, por mes, si se puede centralizar.
 *   npx tsx scripts/scanBukPeriods.ts <empresa-id> <AAAA-MM desde> <AAAA-MM hasta>
 * Solo imprime agregados (sin nombres ni RUT). Las cuentas del asiento son de prueba:
 * lo que se valida aqui es que los datos lleguen, cierren y cuadren, no el plan de cuentas.
 */
import {
  fetchBukCompanies,
  fetchEmployees,
  fetchPayrollMonth,
} from '../server/bukClient';
import { loadBukCompanies } from '../server/bukProxy';
import { buildPayrollBookFromBuk } from '../src/modules/remuneraciones/core/buk/bukAdapter';
import { analyzePayroll } from '../src/modules/remuneraciones/core/payrollAnalyzer';
import { buildWorkingConfig } from '../src/modules/remuneraciones/core/configStore';
import { generateAccountingEntries } from '../src/modules/remuneraciones/core/accountingEngine';
import { formatCLP } from '../src/modules/remuneraciones/utils/numberUtils';

const [, , companyId, from, to] = process.argv;
if (!companyId || !from || !to) {
  console.error('Uso: npx tsx scripts/scanBukPeriods.ts <empresa-id> <AAAA-MM desde> <AAAA-MM hasta>');
  process.exit(1);
}
const company = loadBukCompanies(process.env).find((c) => c.id === companyId);
if (!company) {
  console.error(`Empresa "${companyId}" no configurada (BUK_COMPANIES / token).`);
  process.exit(1);
}

const companies = await fetchBukCompanies(company);
if (companies.length !== 1) {
  console.error(`La cuenta tiene ${companies.length} empresas: este script solo cubre cuentas de una empresa.`);
  process.exit(1);
}
const employees = await fetchEmployees(company);

const periods: string[] = [];
for (let [y, m] = from.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= to; m === 12 ? (y++, (m = 1)) : m++) {
  periods.push(`${y}-${String(m).padStart(2, '0')}`);
}

console.log(`${company.id}: ${periods.length} periodos`);
console.log('PERIODO   LIQ  ESTADO');
for (const period of periods) {
  try {
    const payroll = await fetchPayrollMonth(company, period);
    const book = buildPayrollBookFromBuk({
      payroll,
      employees,
      company: { name: companies[0].name, rut: companies[0].rut },
      period,
    });
    const analyses = analyzePayroll(book);
    const { config } = buildWorkingConfig(book, analyses, null);
    book.concepts.forEach((c, i) => {
      const g = config.concepts[c.id];
      if (g.classification === 'APORTE_EMPLEADOR') {
        g.expenseAccount = `${i}G`;
        g.liabilityAccount = `${i}O`;
      } else g.account = String(i);
    });
    const acc = generateAccountingEntries(book, config);
    const sob = book.warnings.some((w) => /con sobregiro/.test(w)) ? ' | con sobregiro' : '';
    const other = book.warnings.filter((w) => !/con sobregiro|API no entrega fila/.test(w)).length;
    console.log(
      `${period}  ${String(book.workers.length).padStart(3)}  ` +
        `${acc.balanced ? 'OK, asiento cuadra' : `DESCUADRADO ${formatCLP(acc.difference)}`}` +
        `${sob}${other ? ` | ${other} aviso(s)` : ''}`,
    );
  } catch (e) {
    console.log(`${period}    -  NO CENTRALIZABLE: ${e instanceof Error ? e.message : e}`);
  }
}
