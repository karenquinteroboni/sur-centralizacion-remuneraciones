/**
 * ============================================================================
 *  FIXTURE SINTETICO
 * ----------------------------------------------------------------------------
 *  Genera en memoria un libro de remuneraciones con la MISMA ESTRUCTURA que un
 *  libro chileno real, pero con datos completamente inventados.
 *
 *  IMPORTANTE (requisito 15): las pruebas NO contienen datos personales reales.
 *  Los RUT son ficticios pero con digito verificador correcto, para poder
 *  probar la validacion de terceros.
 * ============================================================================
 */

import * as XLSX from 'xlsx';
import { computeDv } from '../../src/modules/remuneraciones/utils/rutValidator';

/** Construye un RUT ficticio valido a partir de un cuerpo numerico. */
export function fakeRut(body: number): string {
  const b = String(body);
  const dv = computeDv(b);
  const withDots = b.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots}-${dv}`;
}

export interface SyntheticWorker {
  rut: string;
  code: string;
  lastName: string;
  secondLastName: string;
  firstNames: string;
  position: string;
  costCenter: string;
  /** Haberes */
  sueldoBase: number;
  gratificacion: number;
  horasExtras1: number;
  horasExtras2: number;
  colacion: number;
  /** Descuentos */
  prevision: number;
  salud: number;
  cesantia: number;
  /** Aportes del empleador */
  sis: number;
  mutual: number;
}

/** Seis trabajadores ficticios con cifras redondas y verificables a mano. */
export const SYNTHETIC_WORKERS: SyntheticWorker[] = [
  {
    rut: fakeRut(11111111), code: 'A1', lastName: 'Alfa', secondLastName: 'Uno',
    firstNames: 'Ana Maria', position: 'VENDEDORA', costCenter: 'TIENDA NORTE',
    sueldoBase: 500000, gratificacion: 125000, horasExtras1: 20000, horasExtras2: 0,
    colacion: 30000, prevision: 60000, salud: 40000, cesantia: 3600, sis: 8000, mutual: 4000,
  },
  {
    rut: fakeRut(12222222), code: 'A1', lastName: 'Bravo', secondLastName: 'Dos',
    firstNames: 'Bruno', position: 'SUPERVISOR', costCenter: 'OFICINA CENTRAL',
    sueldoBase: 800000, gratificacion: 200000, horasExtras1: 0, horasExtras2: 50000,
    colacion: 30000, prevision: 96000, salud: 64000, cesantia: 5760, sis: 12800, mutual: 6400,
  },
  {
    rut: fakeRut(13333333), code: 'A2', lastName: 'Charlie', secondLastName: 'Tres',
    firstNames: 'Carla Paz', position: 'VENDEDORA', costCenter: 'TIENDA SUR',
    sueldoBase: 450000, gratificacion: 112500, horasExtras1: 15000, horasExtras2: 0,
    colacion: 30000, prevision: 54000, salud: 36000, cesantia: 3240, sis: 7200, mutual: 3600,
  },
  {
    rut: fakeRut(14444444), code: 'A1', lastName: 'Delta', secondLastName: 'Cuatro',
    firstNames: 'Diego', position: 'BODEGUERO', costCenter: 'BODEGA',
    sueldoBase: 600000, gratificacion: 150000, horasExtras1: 35000, horasExtras2: 10000,
    colacion: 30000, prevision: 72000, salud: 48000, cesantia: 4320, sis: 9600, mutual: 4800,
  },
  {
    rut: fakeRut(15555555), code: 'A3', lastName: 'Echo', secondLastName: 'Cinco',
    firstNames: 'Elena', position: 'CAJERA', costCenter: 'TIENDA NORTE',
    sueldoBase: 480000, gratificacion: 120000, horasExtras1: 0, horasExtras2: 0,
    colacion: 30000, prevision: 57600, salud: 38400, cesantia: 3456, sis: 7680, mutual: 3840,
  },
  {
    // Trabajador con liquido 0: sirve para probar el salto de lineas en cero.
    rut: fakeRut(16666666), code: 'A2', lastName: 'Foxtrot', secondLastName: 'Seis',
    firstNames: 'Franco', position: 'PRACTICANTE', costCenter: 'OFICINA CENTRAL',
    sueldoBase: 100000, gratificacion: 0, horasExtras1: 0, horasExtras2: 0,
    colacion: 0, prevision: 60000, salud: 40000, cesantia: 0, sis: 0, mutual: 0,
  },
];

/** Titulos del libro sintetico. Incluye HORAS EXTRAS DUPLICADO a proposito. */
export const SYNTHETIC_HEADERS = [
  'RUT', 'CÓDIGO', 'AP PATERNO', 'AP MATERNO', 'NOMBRES', 'CARGO', 'CENTRO COSTO',
  'DÍAS TRABAJADOS',
  'SUELDO BASE', 'GRATIFICACIÓN', 'HORAS EXTRAS', 'HORAS EXTRAS', 'COLACIÓN',
  'TOTAL HABERES',
  'PREVIS', 'SALUD', 'CESANTÍA',
  'TOTAL DESCUENTOS',
  'SUELDO LÍQUIDO',
  'SIS', 'MUTUAL',
];

export interface FixtureOptions {
  /** Cuantas filas vacias/de titulo poner antes de la cabecera. */
  preambleRows?: number;
  /** Incluir la fila de totales al final. */
  includeTotals?: boolean;
  /** Nombre de la empresa ficticia. */
  companyName?: string;
  /** RUT ficticio de la empresa. */
  companyRut?: string;
  /** Periodo. */
  period?: string;
  /** Agrega una columna extra no reconocida por el diccionario. */
  extraUnknownColumn?: boolean;
  /**
   * Columnas adicionales con titulo propio, para simular conceptos que
   * aparecen recien en un periodo posterior (un bono nuevo, por ejemplo).
   * El monto es el mismo para todos los trabajadores.
   */
  extraColumns?: { label: string; amount: number }[];
}

/** Devuelve la matriz de celdas del libro sintetico. */
export function buildSyntheticGrid(options: FixtureOptions = {}): unknown[][] {
  const {
    includeTotals = true,
    companyName = 'EMPRESA DEMO SPA',
    companyRut = fakeRut(76111111),
    period = 'Julio 2026',
    extraUnknownColumn = false,
  } = options;

  const grid: unknown[][] = [];

  // Preambulo, igual que un libro real: metadatos y filas vacias.
  grid.push(['Libro: Remuneraciones']);
  grid.push([`Empresa: ${companyName} (${companyRut})`]);
  grid.push([`Periodo: ${period}`]);
  grid.push(['Fecha Generación: 31/07/2026 a las 10:00']);
  grid.push([]);

  const extraColumns = options.extraColumns ?? [];
  const headers = [...SYNTHETIC_HEADERS];
  if (extraUnknownColumn) headers.push('CONCEPTO RARO XZ');
  for (const c of extraColumns) headers.push(c.label);
  grid.push(headers);

  const rows: unknown[][] = [];
  for (const w of SYNTHETIC_WORKERS) {
    const totalHaberes =
      w.sueldoBase + w.gratificacion + w.horasExtras1 + w.horasExtras2 + w.colacion;
    const totalDescuentos = w.prevision + w.salud + w.cesantia;
    const liquido = totalHaberes - totalDescuentos;

    const row: unknown[] = [
      w.rut, w.code, w.lastName, w.secondLastName, w.firstNames, w.position, w.costCenter,
      30,
      w.sueldoBase, w.gratificacion, w.horasExtras1, w.horasExtras2, w.colacion,
      totalHaberes,
      w.prevision, w.salud, w.cesantia,
      totalDescuentos,
      liquido,
      w.sis, w.mutual,
    ];
    if (extraUnknownColumn) row.push(0);
    for (const c of extraColumns) row.push(c.amount);
    rows.push(row);
  }
  grid.push(...rows);

  if (includeTotals) {
    grid.push([]);
    const totals: unknown[] = ['Totales:', '-', '-', '-', '-', '-', '-'];
    for (let c = 7; c < headers.length; c++) {
      let sum = 0;
      for (const row of rows) sum += Number(row[c] ?? 0);
      totals.push(sum);
    }
    grid.push(totals);
  }

  return grid;
}

/** Devuelve el libro sintetico como ArrayBuffer XLSX. */
export function buildSyntheticWorkbookBuffer(options: FixtureOptions = {}): ArrayBuffer {
  const grid = buildSyntheticGrid(options);
  const ws = XLSX.utils.aoa_to_sheet(grid as never[][]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'EMPRESA DEMO');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

/* -------------------------------------------------------------------------- */
/*  CIFRAS ESPERADAS (calculadas de forma independiente para las aserciones)  */
/* -------------------------------------------------------------------------- */

export const EXPECTED = (() => {
  let sueldoBase = 0, gratificacion = 0, he1 = 0, he2 = 0, colacion = 0;
  let prevision = 0, salud = 0, cesantia = 0, sis = 0, mutual = 0;

  for (const w of SYNTHETIC_WORKERS) {
    sueldoBase += w.sueldoBase;
    gratificacion += w.gratificacion;
    he1 += w.horasExtras1;
    he2 += w.horasExtras2;
    colacion += w.colacion;
    prevision += w.prevision;
    salud += w.salud;
    cesantia += w.cesantia;
    sis += w.sis;
    mutual += w.mutual;
  }

  const totalHaberes = sueldoBase + gratificacion + he1 + he2 + colacion;
  const totalDescuentos = prevision + salud + cesantia;
  const liquido = totalHaberes - totalDescuentos;
  const aportes = sis + mutual;

  return {
    sueldoBase, gratificacion, he1, he2, colacion,
    prevision, salud, cesantia, sis, mutual,
    totalHaberes, totalDescuentos, liquido, aportes,
    /** DEBE = haberes + aportes(gasto) */
    totalDebit: totalHaberes + aportes,
    /** HABER = descuentos + liquido + aportes(obligacion) */
    totalCredit: totalDescuentos + liquido + aportes,
    /** Trabajadores con liquido distinto de cero. */
    workersWithLiquido: SYNTHETIC_WORKERS.filter(
      (w) =>
        w.sueldoBase + w.gratificacion + w.horasExtras1 + w.horasExtras2 + w.colacion -
          (w.prevision + w.salud + w.cesantia) !==
        0,
    ).length,
  };
})();

/* -------------------------------------------------------------------------- */
/*  PLAN DE CUENTAS FICTICIO PARA LAS PRUEBAS                                 */
/* -------------------------------------------------------------------------- */

export const TEST_ACCOUNTS: Record<string, string> = {
  SUELDO_BASE_01: '5.01.01.01',
  GRATIFICACION_01: '5.01.01.02',
  HORAS_EXTRAS_01: '5.01.01.03',
  HORAS_EXTRAS_02: '5.01.01.04',
  COLACION_01: '5.01.02.01',
  PREVIS_01: '2.01.03.01',
  SALUD_01: '2.01.03.02',
  CESANTIA_01: '2.01.03.03',
  SUELDO_LIQUIDO_01: '2.01.01.01',
};

export const TEST_EMPLOYER_ACCOUNTS: Record<string, [string, string]> = {
  SIS_01: ['5.01.03.01', '2.01.04.01'],
  MUTUAL_01: ['5.01.03.02', '2.01.04.02'],
};
