/**
 * ============================================================================
 *  API PUBLICA DEL MODULO
 * ----------------------------------------------------------------------------
 *  Todo lo que el aplicativo anfitrion necesita se exporta desde aqui.
 *  Importe SIEMPRE desde este archivo, nunca desde rutas internas: asi la
 *  estructura interna puede evolucionar sin romper la integracion.
 *
 *      import { RemuneracionesModule } from '@/modules/remuneraciones';
 *
 *  Si solo necesita el motor (por ejemplo, para procesar en un backend Node):
 *
 *      import {
 *        parsePayrollWorkbook,
 *        analyzePayroll,
 *        generateAccountingEntries,
 *        validateCentralization,
 *        generateKameCsv,
 *      } from '@/modules/remuneraciones';
 * ============================================================================
 */

/* --- Componente principal (UI) ------------------------------------------- */
export { RemuneracionesModule, default } from './RemuneracionesModule';
export type { RemuneracionesModuleProps } from './RemuneracionesModule';

/* --- Multiempresa --------------------------------------------------------- */
export { CompaniesPanel, CompanyStatusBadge, formatPeriod } from './components/CompaniesPanel';
export type { CompaniesFacet, CompaniesPanelProps } from './components/CompaniesPanel';
export {
  buildCompanyRow,
  buildCompanyRows,
  filterCompanyRows,
  groupCompanyRows,
  normalizeCatalog,
  normalizeCompany,
  previousPeriodCode,
  sortCompanyRows,
  summarizePortfolio,
} from './core/companyRegistry';
export type {
  Company,
  CompanyRow,
  CompanyStatus,
  PortfolioSummary,
} from './types/company';

/* --- Nucleo: lectura y analisis ------------------------------------------ */
export {
  parsePayrollWorkbook,
  parseWorkbookObject,
  parseGrid,
  detectHeaderRow,
  detectIdentityColumns,
  detectDataRange,
  extractMeta,
  parsePeriod,
  pickBestSheet,
} from './core/excelParser';
export type { ParseOptions } from './core/excelParser';

export {
  analyzePayroll,
  detectDoubleCounting,
  getDuplicatedConcepts,
  groupByLabel,
} from './core/payrollAnalyzer';
export type { AnalyzeOptions, DoubleCountFinding } from './core/payrollAnalyzer';

/* --- Nucleo: configuracion ------------------------------------------------ */
export {
  LocalStorageConfigRepository,
  InMemoryConfigRepository,
  buildCompanyKey,
  buildConceptRows,
  buildDefaultConceptConfig,
  buildDefaultVoucher,
  buildWorkingConfig,
  computeStatus,
  exportConfigToJson,
  importConfigFromJson,
} from './core/configStore';
export type { BuildConfigResult, ConfigRepository } from './core/configStore';

/* --- Nucleo: motor contable ----------------------------------------------- */
export {
  generateAccountingEntries,
  summarizeByAccount,
  sumConcept,
  NATURAL_NATURE,
} from './core/accountingEngine';
export type { AccountSummaryRow, GenerateOptions } from './core/accountingEngine';

/* --- Nucleo: validaciones -------------------------------------------------- */
export { validateCentralization, DEFAULT_ACCOUNT_PATTERN } from './core/validationEngine';
export type { ValidationOptions } from './core/validationEngine';

/* --- Nucleo: campos analiticos de la cuenta -------------------------------- */
export {
  activeKameFieldGroups,
  applyKameFieldsTo,
  buildDefaultKameFields,
  dueDateFromPeriod,
  mergeKameFieldGroups,
  resolveKameFieldValues,
  resolveKameFields,
  suggestCopyTargets,
  usesAnyKameField,
  KAME_FIELD_GROUPS,
} from './core/kameFields';
export type {
  ApplyKameFieldsResult,
  KameFieldGroup,
  ResolvedKameFields,
} from './core/kameFields';
export { CopyKameFieldsDialog } from './components/CopyKameFields';
export type { CopyKameFieldsProps } from './components/CopyKameFields';

/* --- Nucleo: exportacion Kame ---------------------------------------------- */
export {
  generateKameCsv,
  verifyKameStructure,
  buildKameFileName,
  defaultVoucherComment,
  formatKameDate,
  KAME_COLUMNS,
} from './core/kameExporter';
export type { KameExportOptions } from './core/kameExporter';

/* --- Utilidades ------------------------------------------------------------ */
export {
  cleanRut,
  computeDv,
  extractRut,
  formatRut,
  formatRutForKame,
  isValidRut,
} from './utils/rutValidator';

export {
  formatCLP,
  formatKameAmount,
  nearlyEqual,
  round,
  sum,
  toCLP,
  toNumber,
} from './utils/numberUtils';

export {
  buildConceptId,
  classifyByDictionary,
  isIdentityLabel,
  normalizeLabel,
  slugify,
  stripAccents,
  CLASSIFICATION_RULES,
  IDENTITY_PATTERNS,
} from './utils/conceptUtils';

export {
  buildCsv,
  createCsvBlob,
  downloadFile,
  encodeLatin1,
  sanitizeCsvValue,
  setFileSaver,
  slugForFileName,
  toLatin1Safe,
  CSV_EOL,
  CSV_SEPARATOR,
} from './utils/csvUtils';
export type { FileSaver } from './utils/csvUtils';

/* --- Tipos ----------------------------------------------------------------- */
export type {
  AccountingEntry,
  AccountingResult,
  CentralizationConfig,
  ConceptAnalysis,
  ConceptClassification,
  ConceptConfig,
  ConceptKameFields,
  ConceptRow,
  ConceptRules,
  ConceptStatus,
  EntryNature,
  FichaSource,
  FolioDocMode,
  KameExportResult,
  KameRow,
  PayrollBook,
  PayrollConcept,
  PayrollMeta,
  PayrollWorker,
  ThirdPartyMode,
  ValidationIssue,
  ValidationReport,
  ValidationSeverity,
  VencimientoMode,
  VoucherConfig,
  WizardStep,
} from './types/payroll';

export { CLASSIFICATIONS, CLASSIFICATION_LABELS } from './types/payroll';
