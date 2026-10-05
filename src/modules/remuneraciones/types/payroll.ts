/**
 * ============================================================================
 *  TIPOS DEL MODULO DE CENTRALIZACION DE REMUNERACIONES
 * ----------------------------------------------------------------------------
 *  Este archivo es la unica fuente de verdad de los contratos de datos del
 *  modulo. No contiene logica, no importa React ni ninguna libreria: puede ser
 *  reutilizado desde cualquier framework (React, Vue, Angular, Node, Deno).
 * ============================================================================
 */

/* -------------------------------------------------------------------------- */
/*  1. CLASIFICACION CONTABLE DE CONCEPTOS                                    */
/* -------------------------------------------------------------------------- */

/**
 * Clasificacion contable de un concepto del libro de remuneraciones.
 *
 *  HABER              -> Remuneracion imponible/no imponible. Genera DEBE (gasto).
 *  DESCUENTO          -> Descuento al trabajador.            Genera HABER (pasivo).
 *  APORTE_EMPLEADOR   -> Costo de cargo de la empresa.       Genera DEBE (gasto) + HABER (obligacion).
 *  NETO               -> Liquido a pagar.                    Genera HABER (sueldos por pagar).
 *  TOTALIZADOR        -> Suma de otras columnas.             NO genera asiento.
 *  INFORMATIVO        -> Dato de referencia (dias, bases).   NO genera asiento.
 */
export type ConceptClassification =
  | 'HABER'
  | 'DESCUENTO'
  | 'APORTE_EMPLEADOR'
  | 'NETO'
  | 'TOTALIZADOR'
  | 'INFORMATIVO';

export const CLASSIFICATIONS: ConceptClassification[] = [
  'HABER',
  'DESCUENTO',
  'APORTE_EMPLEADOR',
  'NETO',
  'TOTALIZADOR',
  'INFORMATIVO',
];

/** Etiquetas legibles para la interfaz. */
export const CLASSIFICATION_LABELS: Record<ConceptClassification, string> = {
  HABER: 'Haber',
  DESCUENTO: 'Descuento',
  APORTE_EMPLEADOR: 'Aporte empleador',
  NETO: 'Neto / Liquido',
  TOTALIZADOR: 'Totalizador',
  INFORMATIVO: 'Informativo',
};

/** Naturaleza contable de un movimiento. */
export type EntryNature = 'DEBE' | 'HABER';

/** Modalidad de registro respecto de terceros. */
export type ThirdPartyMode = 'CONSOLIDATED' | 'PER_WORKER';

/** Estado de parametrizacion de un concepto (semaforo de la UI). */
export type ConceptStatus =
  | 'OK'            // verde  : listo para contabilizar
  | 'PENDING'       // amarillo: requiere cuenta / clasificacion
  | 'NEW'           // amarillo: concepto nuevo respecto de la configuracion guardada
  | 'EXCLUDED'      // gris   : el usuario lo excluyo o es totalizador/informativo
  | 'ERROR';        // rojo   : configuracion invalida

/* -------------------------------------------------------------------------- */
/*  2. LECTURA DEL LIBRO DE REMUNERACIONES                                    */
/* -------------------------------------------------------------------------- */

/** Metadatos de cabecera detectados en las primeras filas del Excel. */
export interface PayrollMeta {
  /** Razon social detectada (ej. "JOSE HERRERA SPA"). Vacio si no se detecta. */
  companyName: string;
  /** RUT de la empresa detectado en la cabecera, formateado. Vacio si no existe. */
  companyRut: string;
  /** Periodo tal como aparece en el archivo (ej. "Julio 2026"). */
  periodLabel: string;
  /** Periodo normalizado YYYYMM (ej. "202607"). Vacio si no se puede inferir. */
  periodCode: string;
  /** Ultimo dia del periodo en formato ISO (YYYY-MM-DD). Usado como fecha del asiento. */
  periodEndDate: string;
  /** Nombre de la hoja leida. */
  sheetName: string;
  /** Indice (base 0) de la fila de titulos detectada. */
  headerRowIndex: number;
  /** Indice (base 0) de la fila de totales detectada, o null. */
  totalsRowIndex: number | null;
  /** Nombre del archivo original. */
  sourceFileName: string;
}

/**
 * Una columna/concepto detectado en el libro.
 * `id` es el identificador interno UNICO e inequivoco: dos columnas con el
 * mismo titulo visual reciben ids distintos (HORAS_EXTRAS_01 / HORAS_EXTRAS_02).
 */
export interface PayrollConcept {
  /** Identificador interno unico y estable. */
  id: string;
  /** Titulo tal como aparece en el Excel. */
  label: string;
  /** Titulo normalizado (mayusculas, sin tildes, sin espacios dobles). */
  normalizedLabel: string;
  /** Indice de columna (base 0) dentro de la fila de titulos. */
  columnIndex: number;
  /** true si el titulo aparece mas de una vez en la hoja. */
  duplicateLabel: boolean;
  /** Ocurrencia del titulo (1, 2, 3...). */
  occurrence: number;
  /** true si la columna contiene valores numericos contabilizables. */
  numeric: boolean;
  /** Suma de la columna sobre las filas de trabajadores. */
  total: number;
  /** Cantidad de filas con valor distinto de cero. */
  nonZeroCount: number;
  /** Valor de la columna en la fila de totales del Excel (si existe). */
  excelTotal: number | null;
}

/** Datos de identificacion de un trabajador. */
export interface PayrollWorker {
  /** Indice (base 0) de la fila dentro de la hoja. */
  rowIndex: number;
  /** RUT normalizado con guion (ej. "12.345.678-9"). */
  rut: string;
  /** RUT sin puntos ni guion. */
  rutPlain: string;
  /** Nombre completo armado desde nombres + apellidos. */
  fullName: string;
  /** Codigo interno del trabajador si existe en el libro. */
  code: string;
  /** Cargo. */
  position: string;
  /** Centro de costo / area. */
  costCenter: string;
  /** Monto por concepto: { [conceptId]: monto }. */
  amounts: Record<string, number>;
}

/** Resultado completo de la lectura + analisis del libro. */
export interface PayrollBook {
  meta: PayrollMeta;
  concepts: PayrollConcept[];
  workers: PayrollWorker[];
  /** Columnas usadas como identificacion (no son conceptos contabilizables). */
  identityColumns: {
    rut: number | null;
    code: number | null;
    lastName: number | null;
    secondLastName: number | null;
    firstNames: number | null;
    fullName: number | null;
    position: number | null;
    costCenter: number | null;
  };
  /** Avisos no bloqueantes generados durante la lectura. */
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/*  3. ANALISIS AUTOMATICO (SUGERENCIAS)                                      */
/* -------------------------------------------------------------------------- */

/** Sugerencia automatica calculada por el analizador para un concepto. */
export interface ConceptAnalysis {
  conceptId: string;
  /** Clasificacion sugerida, o null si el analizador no puede decidir. */
  suggestedClassification: ConceptClassification | null;
  /** Modalidad de tercero sugerida. */
  suggestedThirdPartyMode: ThirdPartyMode;
  /** Confianza 0..1 de la clasificacion sugerida. */
  confidence: number;
  /** true si parece un totalizador (por nombre y/o por relacion matematica). */
  looksLikeTotalizer: boolean;
  /** true si el TITULO indica un total/subtotal. */
  nameSaysTotalizer: boolean;
  /** true si la RELACION MATEMATICA con otras columnas indica un total. */
  mathSaysTotalizer: boolean;
  /** Motivo textual de la deteccion de totalizador. */
  totalizerReason: string | null;
  /** Ids de los conceptos que, sumados, reproducen esta columna. */
  componentConceptIds: string[];
  /** Explicacion legible de por que se sugirio esa clasificacion. */
  rationale: string;
}

/* -------------------------------------------------------------------------- */
/*  4. CONFIGURACION (PARAMETRIZACION POR EMPRESA)                            */
/* -------------------------------------------------------------------------- */

/** Parametrizacion contable de un concepto. */
export interface ConceptConfig {
  /** Identificador interno del concepto (coincide con PayrollConcept.id). */
  conceptId: string;
  /** Titulo original, guardado para poder re-emparejar en cargas futuras. */
  label: string;
  /** Se contabiliza o no. */
  include: boolean;
  /** Clasificacion contable. null = pendiente de definir. */
  classification: ConceptClassification | null;
  /** Cuenta contable principal (DEBE para haberes, HABER para descuentos/neto). */
  account: string;
  /**
   * Solo para APORTE_EMPLEADOR: cuenta de gasto (DEBE).
   * Si esta vacia se usa `account`.
   */
  expenseAccount?: string;
  /** Solo para APORTE_EMPLEADOR: cuenta de obligacion / pasivo (HABER). */
  liabilityAccount?: string;
  /** Consolidado o por trabajador. */
  thirdPartyMode: ThirdPartyMode;
  /** Glosa personalizada de la linea. Si esta vacia se usa el titulo. */
  lineComment?: string;
  /** Centro de costo / unidad de negocio especifica para este concepto. */
  businessUnit?: string;
  /** Notas libres del usuario. */
  notes?: string;
  /** Reglas especiales opcionales. */
  rules?: ConceptRules;
  /**
   * Campos analiticos que exige la cuenta en Kame (ficha, documento,
   * vencimiento). Si es `undefined` se derivan valores por defecto a partir
   * de `thirdPartyMode`, de modo que las configuraciones guardadas con el
   * esquema anterior siguen funcionando sin cambios.
   */
  kameFields?: ConceptKameFields;
}

/* -------------------------------------------------------------------------- */
/*  4.1 CAMPOS ANALITICOS EXIGIDOS POR LA CUENTA EN KAME                      */
/* -------------------------------------------------------------------------- */

/** De donde sale la ficha (RUT + razon social) de la linea. */
export type FichaSource =
  | 'TRABAJADOR'  // del libro de remuneraciones, una linea por persona
  | 'FIJA'        // un tercero fijo escrito en la parametrizacion (AFP, Isapre...)
  | 'EMPRESA';    // la propia empresa del libro

/** Como se resuelve el folio del documento. */
export type FolioDocMode =
  | 'PERIODO'     // el periodo del libro, AAAAMM
  | 'FIJO';       // un texto escrito en la parametrizacion

/** Como se resuelve la fecha de vencimiento. */
export type VencimientoMode =
  | 'DIA_MES_SIGUIENTE'  // dia N del mes siguiente al periodo (cotizaciones)
  | 'FIJA';              // una fecha escrita en la parametrizacion

/**
 * Define que columnas analiticas del importador de Kame debe llevar la cuenta
 * de este concepto, y de donde sale cada valor.
 *
 * En Kame no todas las cuentas admiten los mismos campos: las cuentas con
 * ficha exigen RUT y razon social, y las de pasivo con seguimiento documental
 * exigen documento, folio y vencimiento. Por eso la eleccion es POR CONCEPTO
 * (es decir, por cuenta) y no global del comprobante.
 *
 * Un campo apagado se emite VACIO, que es lo que Kame espera cuando la cuenta
 * no lo maneja.
 */
export interface ConceptKameFields {
  /** Emitir "Rut Ficha". */
  rut: boolean;
  /** Emitir "Rzn Social Ficha". */
  razonSocial: boolean;
  /** Emitir "Nombre Doc". */
  documento: boolean;
  /** Emitir "Folio Doc". */
  folio: boolean;
  /** Emitir "Fecha Venc". */
  vencimiento: boolean;

  /** Origen de la ficha cuando `rut` o `razonSocial` estan activos. */
  fichaSource: FichaSource;
  /** RUT del tercero fijo (solo si `fichaSource === 'FIJA'`). */
  fichaRut: string;
  /** Razon social del tercero fijo (solo si `fichaSource === 'FIJA'`). */
  fichaRazonSocial: string;

  /** Texto de "Nombre Doc" (ej. "PLANILLA", "LIQUIDACION"). */
  nombreDoc: string;

  /** Como se resuelve "Folio Doc". */
  folioDocMode: FolioDocMode;
  /** Valor fijo de "Folio Doc" (solo si `folioDocMode === 'FIJO'`). */
  folioDoc: string;

  /** Como se resuelve "Fecha Venc". */
  vencimientoMode: VencimientoMode;
  /** Dia del mes siguiente (1-31), si `vencimientoMode === 'DIA_MES_SIGUIENTE'`. */
  vencimientoDia: number;
  /** Fecha ISO YYYY-MM-DD, si `vencimientoMode === 'FIJA'`. */
  vencimientoFecha: string;
}

/** Reglas especiales aplicables a un concepto. */
export interface ConceptRules {
  /** Invierte la naturaleza natural del concepto (DEBE <-> HABER). */
  invertNature?: boolean;
  /** Ignora montos negativos (los trata como 0). */
  ignoreNegative?: boolean;
  /** Factor multiplicador aplicado al monto (por defecto 1). */
  factor?: number;
  /** Solo genera linea si el monto absoluto supera este umbral. */
  minAmount?: number;
}

/** Cabecera del comprobante que se generara en Kame. */
export interface VoucherConfig {
  /** TipoComprobante Kame: TRASPASO, EGRESO, INGRESO... */
  tipoComprobante: string;
  /** FolioAuto: "S" (el ERP asigna) o "N". */
  folioAuto: string;
  /** Folio del comprobante. */
  folio: string;
  /** Fecha del asiento en ISO YYYY-MM-DD. */
  fecha: string;
  /** Glosa de cabecera del comprobante. */
  comentario: string;
  /** Unidad de negocio por defecto. */
  unidadNegocio: string;
  /** Numero de movimiento (por convencion el periodo YYYYMM). */
  numeroMovimiento: string;
  /** Valor de la columna "Tipo Movimiento" (opcional, vacio por defecto). */
  tipoMovimiento: string;
  /** Nombre del documento asociado (opcional). */
  nombreDoc: string;
  /** Folio del documento asociado (opcional). */
  folioDoc: string;
}

/** Configuracion completa y persistible de una empresa. */
export interface CentralizationConfig {
  /** Version del esquema de configuracion. */
  schemaVersion: 1;
  /** Clave de la empresa (RUT normalizado, o el nombre si no hay RUT). */
  companyKey: string;
  companyName: string;
  /** Fecha ISO de la ultima actualizacion. */
  updatedAt: string;
  voucher: VoucherConfig;
  concepts: Record<string, ConceptConfig>;
  /**
   * Mapa auxiliar titulo-normalizado -> conceptId, para re-emparejar
   * configuraciones cuando cambia el orden de las columnas.
   */
  labelIndex?: Record<string, string[]>;
}

/* -------------------------------------------------------------------------- */
/*  5. ASIENTO CONTABLE GENERADO                                              */
/* -------------------------------------------------------------------------- */

/** Un movimiento (linea) del asiento contable normalizado. */
export interface AccountingEntry {
  /** Id de linea, unico dentro del asiento. */
  id: string;
  /** Concepto de origen. */
  conceptId: string;
  conceptLabel: string;
  /** Cuenta contable. */
  account: string;
  nature: EntryNature;
  /** Monto siempre positivo. */
  amount: number;
  debit: number;
  credit: number;
  /** Glosa de la linea. */
  comment: string;
  /** RUT del tercero. Vacio si la cuenta no maneja ficha. */
  thirdPartyRut: string;
  /** Razon social / nombre del tercero. Vacio si la cuenta no maneja ficha. */
  thirdPartyName: string;
  /** "Nombre Doc". Vacio si la cuenta no maneja documento. */
  documentName: string;
  /** "Folio Doc". Vacio si la cuenta no maneja folio. */
  documentFolio: string;
  /** "Fecha Venc" en ISO YYYY-MM-DD. Vacio si la cuenta no maneja vencimiento. */
  dueDate: string;
  /** Unidad de negocio de la linea. */
  businessUnit: string;
  /** Clasificacion de origen (util para agrupar en la previsualizacion). */
  classification: ConceptClassification;
  /** Modalidad usada. */
  thirdPartyMode: ThirdPartyMode;
}

/** Resultado del motor contable. */
export interface AccountingResult {
  entries: AccountingEntry[];
  totalDebit: number;
  totalCredit: number;
  difference: number;
  balanced: boolean;
  /** Resumen por clasificacion. */
  byClassification: Record<
    ConceptClassification,
    { debit: number; credit: number; count: number }
  >;
  /** Conceptos incluidos que no generaron ninguna linea (monto 0). */
  skippedConcepts: { conceptId: string; label: string; reason: string }[];
}

/* -------------------------------------------------------------------------- */
/*  6. VALIDACIONES                                                           */
/* -------------------------------------------------------------------------- */

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationIssue {
  /** Codigo estable de la validacion (V1..V9 + sufijo). */
  code: string;
  severity: ValidationSeverity;
  /** Titulo corto. */
  title: string;
  /** Detalle legible. */
  message: string;
  /** Concepto afectado, si aplica. */
  conceptId?: string;
  /** Trabajador afectado, si aplica. */
  workerRut?: string;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
  /** true si no hay issues de severidad ERROR. */
  canExport: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  balanced: boolean;
}

/* -------------------------------------------------------------------------- */
/*  7. EXPORTACION KAME                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Fila del archivo de importacion contable de Kame.
 * El orden de las propiedades NO define el orden del CSV: ese orden esta
 * fijado en `KAME_COLUMNS` dentro de `core/kameExporter.ts`.
 */
export interface KameRow {
  TipoComprobante: string;
  FolioAuto: string;
  Folio: string;
  Fecha: string;
  Comentario: string;
  Cuenta: string;
  Debe: string;
  Haber: string;
  'Comentario Linea': string;
  'Rut Ficha': string;
  'Rzn Social Ficha': string;
  'Nombre Doc': string;
  'Folio Doc': string;
  'Fecha Venc': string;
  'Unidad Negocio': string;
  'Tipo Movimiento': string;
  'Numero Movimiento': string;
}

export interface KameExportResult {
  /** Contenido del CSV como texto (separador ";", saltos CRLF). */
  content: string;
  /** Nombre de archivo sugerido. */
  fileName: string;
  /** Filas generadas (sin contar la cabecera). */
  rowCount: number;
  /** Filas estructuradas, utiles para pruebas. */
  rows: KameRow[];
}

/* -------------------------------------------------------------------------- */
/*  8. ESTADO DE ALTO NIVEL DEL MODULO                                        */
/* -------------------------------------------------------------------------- */

export type WizardStep =
  | 'companies'   // paso previo, solo con catalogo multiempresa
  | 'upload'
  | 'concepts'
  | 'validation'
  | 'preview'
  | 'export';

/** Fila enriquecida que consume la tabla de conceptos de la UI. */
export interface ConceptRow {
  concept: PayrollConcept;
  analysis: ConceptAnalysis;
  config: ConceptConfig;
  status: ConceptStatus;
  /** true si el concepto no existia en la configuracion guardada. */
  isNew: boolean;
  /** Advertencia de posible doble contabilizacion. */
  doubleCountWarning: string | null;
}
