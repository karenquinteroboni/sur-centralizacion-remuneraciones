/**
 * ============================================================================
 *  scripts/runRealPayroll.ts  —  PRUEBA END-TO-END POR LINEA DE COMANDOS
 * ----------------------------------------------------------------------------
 *  Ejecuta TODO el nucleo del modulo (parser -> analizador -> motor contable ->
 *  validaciones -> exportador Kame) sin renderizar la interfaz.
 *
 *  Uso:
 *    npx tsx scripts/runRealPayroll.ts <libro.xlsx> [plan-de-cuentas.json] [salida.csv]
 *
 *  El plan de cuentas es un JSON { "<conceptId o titulo>": "<cuenta>" } o el
 *  formato completo de `exampleConfiguration.json`. Si no se entrega, se usan
 *  placeholders y el script informara que faltan cuentas.
 *
 *  Este script demuestra el requisito 18: el motor contable es probable sin UI.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

import { parsePayrollWorkbook } from '../src/modules/remuneraciones/core/excelParser';
import { analyzePayroll } from '../src/modules/remuneraciones/core/payrollAnalyzer';
import { buildWorkingConfig } from '../src/modules/remuneraciones/core/configStore';
import { generateAccountingEntries } from '../src/modules/remuneraciones/core/accountingEngine';
import { validateCentralization } from '../src/modules/remuneraciones/core/validationEngine';
import { generateKameCsv, verifyKameStructure } from '../src/modules/remuneraciones/core/kameExporter';
import { encodeLatin1 } from '../src/modules/remuneraciones/utils/csvUtils';
import { formatCLP } from '../src/modules/remuneraciones/utils/numberUtils';
import type { CentralizationConfig } from '../src/modules/remuneraciones/types/payroll';

const [, , xlsxPath, accountsPath, outPath] = process.argv;

if (!xlsxPath) {
  console.error('Uso: npx tsx scripts/runRealPayroll.ts <libro.xlsx> [cuentas.json] [salida.csv]');
  process.exit(1);
}

/* --- 1. Lectura -------------------------------------------------------- */
const buffer = fs.readFileSync(xlsxPath);
const book = parsePayrollWorkbook(buffer, { fileName: path.basename(xlsxPath) });

console.log('='.repeat(78));
console.log('1. LECTURA DEL LIBRO');
console.log('='.repeat(78));
console.log(`   Empresa .............. ${book.meta.companyName} (${book.meta.companyRut || 's/RUT'})`);
console.log(`   Periodo .............. ${book.meta.periodLabel} -> ${book.meta.periodCode}`);
console.log(`   Fila de titulos ...... ${book.meta.headerRowIndex + 1} (detectada automaticamente)`);
console.log(`   Fila de totales ...... ${book.meta.totalsRowIndex !== null ? book.meta.totalsRowIndex + 1 : 'no detectada'}`);
console.log(`   Trabajadores ......... ${book.workers.length}`);
console.log(`   Conceptos ............ ${book.concepts.length}`);
book.warnings.forEach((w) => console.log(`   AVISO: ${w}`));

/* --- 2. Analisis ------------------------------------------------------- */
const analyses = analyzePayroll(book);

console.log('');
console.log('='.repeat(78));
console.log('2. CONCEPTOS DETECTADOS');
console.log('='.repeat(78));
console.log(
  '   ' +
    'ID INTERNO'.padEnd(34) +
    'CLASIFICACION'.padEnd(18) +
    'TOTAL'.padStart(14) +
    '  OBSERVACION',
);
for (const c of book.concepts) {
  const a = analyses[c.id];
  const flags: string[] = [];
  if (c.duplicateLabel) flags.push('DUPLICADO');
  if (a.looksLikeTotalizer) flags.push('TOTALIZADOR?');
  if (a.suggestedClassification === null) flags.push('REQUIERE PARAMETRIZACION');
  console.log(
    '   ' +
      c.id.padEnd(34) +
      String(a.suggestedClassification ?? '(ambiguo)').padEnd(18) +
      formatCLP(c.total).padStart(14) +
      '  ' +
      flags.join(' | '),
  );
}

/* --- 3. Configuracion --------------------------------------------------- */
let existing: CentralizationConfig | null = null;
const accountMap: Record<string, string> = {};

if (accountsPath && fs.existsSync(accountsPath)) {
  const raw = JSON.parse(fs.readFileSync(accountsPath, 'utf-8'));
  if (raw?.schemaVersion === 1) {
    existing = raw as CentralizationConfig;
  } else {
    Object.assign(accountMap, raw);
  }
}

const built = buildWorkingConfig(book, analyses, existing);
const config = built.config;

// Aplica el mapa simple titulo/id -> cuenta, si se entrego uno.
for (const concept of book.concepts) {
  const cuenta = accountMap[concept.id] ?? accountMap[concept.label];
  if (!cuenta) continue;
  const cfg = config.concepts[concept.id];
  if (cfg.classification === 'APORTE_EMPLEADOR') {
    const [gasto, obligacion] = String(cuenta).split('|');
    cfg.expenseAccount = gasto?.trim() ?? '';
    cfg.liabilityAccount = obligacion?.trim() ?? '';
  } else {
    cfg.account = String(cuenta).trim();
  }
}

if (built.newConceptIds.length > 0) {
  console.log('');
  console.log(`   Conceptos NUEVOS respecto de la configuracion guardada: ${built.newConceptIds.join(', ')}`);
}

/* --- 4. Motor contable -------------------------------------------------- */
const accounting = generateAccountingEntries(book, config);

console.log('');
console.log('='.repeat(78));
console.log('3. ASIENTO CONTABLE');
console.log('='.repeat(78));
console.log(`   Movimientos .......... ${accounting.entries.length}`);
console.log(`   TOTAL DEBE ........... ${formatCLP(accounting.totalDebit)}`);
console.log(`   TOTAL HABER .......... ${formatCLP(accounting.totalCredit)}`);
console.log(`   DIFERENCIA ........... ${formatCLP(accounting.difference)}`);
console.log(
  `   ESTADO ............... ${accounting.balanced ? 'CENTRALIZACION BALANCEADA' : 'CENTRALIZACION NO BALANCEADA'}`,
);

/* --- 5. Validaciones ---------------------------------------------------- */
const report = validateCentralization(book, config, analyses, accounting);

console.log('');
console.log('='.repeat(78));
console.log('4. VALIDACIONES');
console.log('='.repeat(78));
console.log(`   Errores: ${report.errors.length} | Advertencias: ${report.warnings.length} | Informativos: ${report.infos.length}`);
for (const i of [...report.errors, ...report.warnings]) {
  console.log(`   [${i.severity}] ${i.code}: ${i.message}`);
}
console.log(`   EXPORTACION ${report.canExport ? 'HABILITADA' : 'BLOQUEADA'}`);

/* --- 6. Exportacion ----------------------------------------------------- */
if (report.canExport || process.env.FORCE_EXPORT === '1') {
  const csv = generateKameCsv(accounting, config, book);
  const check = verifyKameStructure(csv.content);

  console.log('');
  console.log('='.repeat(78));
  console.log('5. ARCHIVO KAME');
  console.log('='.repeat(78));
  console.log(`   Nombre ............... ${csv.fileName}`);
  console.log(`   Filas ................ ${csv.rowCount}`);
  console.log(`   Columnas ............. ${check.columnCount}`);
  console.log(`   Estructura valida .... ${check.ok ? 'SI' : 'NO'}`);
  check.problems.slice(0, 10).forEach((p) => console.log(`   PROBLEMA: ${p}`));

  const target = outPath ?? csv.fileName;
  fs.writeFileSync(target, Buffer.from(encodeLatin1(csv.content)));
  console.log(`   Guardado en .......... ${target}  (ISO-8859-1, CRLF, separador ";")`);
} else {
  console.log('');
  console.log('   No se genera el CSV porque hay errores bloqueantes.');
  console.log('   (FORCE_EXPORT=1 fuerza la generacion para inspeccion.)');
}
