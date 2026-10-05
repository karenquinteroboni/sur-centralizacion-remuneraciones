/**
 * Prueba end-to-end contra Buk por linea de comandos (sin UI).
 *   npx tsx scripts/runBukPayroll.ts <empresa-id> <AAAA-MM> [cuentas.json]
 * Requiere BUK_COMPANIES y el token de la empresa en variables de entorno
 * (ver .env.example). Imprime solo agregados: ningun nombre ni RUT de trabajador.
 */
import fs from 'node:fs';
import { fetchPayrollBook } from '../server/bukClient';
import { loadBukCompanies } from '../server/bukProxy';
import { analyzePayroll } from '../src/modules/remuneraciones/core/payrollAnalyzer';
import { buildWorkingConfig } from '../src/modules/remuneraciones/core/configStore';
import { generateAccountingEntries } from '../src/modules/remuneraciones/core/accountingEngine';
import { validateCentralization } from '../src/modules/remuneraciones/core/validationEngine';
import { formatCLP } from '../src/modules/remuneraciones/utils/numberUtils';

const [, , companyId, period, accountsPath] = process.argv;
if (!companyId || !period) {
  console.error('Uso: npx tsx scripts/runBukPayroll.ts <empresa-id> <AAAA-MM> [cuentas.json]');
  process.exit(1);
}
const company = loadBukCompanies(process.env).find((c) => c.id === companyId);
if (!company) {
  console.error(`Empresa "${companyId}" no configurada (BUK_COMPANIES / token).`);
  process.exit(1);
}

const book = await fetchPayrollBook(company, period);
console.log(`Periodo ${book.meta.periodLabel} (${book.meta.periodEndDate}) | trabajadores ${book.workers.length} | conceptos ${book.concepts.length}`);
book.warnings.forEach((w) => console.log(`AVISO: ${w}`));

const analyses = analyzePayroll(book);
const byCls: Record<string, number> = {};
for (const c of book.concepts) byCls[c.sourceClassification!] = (byCls[c.sourceClassification!] ?? 0) + c.total;
console.log('Totales por clasificacion:', Object.fromEntries(Object.entries(byCls).map(([k, v]) => [k, formatCLP(v)])));

const accountMap: Record<string, string> = accountsPath ? JSON.parse(fs.readFileSync(accountsPath, 'utf-8')) : {};
const { config } = buildWorkingConfig(book, analyses, null);
for (const c of book.concepts) {
  const cuenta = accountMap[c.id] ?? accountMap[c.label] ?? '0000000';
  const cfg = config.concepts[c.id];
  if (cfg.classification === 'APORTE_EMPLEADOR') {
    cfg.expenseAccount = cuenta;
    cfg.liabilityAccount = cuenta;
  } else {
    cfg.account = cuenta;
  }
}
const accounting = generateAccountingEntries(book, config);
console.log(`Asiento: DEBE ${formatCLP(accounting.totalDebit)} | HABER ${formatCLP(accounting.totalCredit)} | DIFERENCIA ${formatCLP(accounting.difference)} | ${accounting.balanced ? 'BALANCEADO' : 'NO BALANCEADO'}`);
const report = validateCentralization(book, config, analyses, accounting);
console.log(`Validaciones: ${report.errors.length} errores, ${report.warnings.length} advertencias`);
for (const i of [...report.errors, ...report.warnings].slice(0, 12)) console.log(`  [${i.severity}] ${i.code}: ${i.message.slice(0, 160)}`);
