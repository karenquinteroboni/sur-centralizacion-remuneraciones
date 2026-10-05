/**
 * PRUEBA 5 — Generacion del CSV de Kame.
 *
 * La cabecera esperada se declara aqui LITERALMENTE, copiada del archivo de
 * referencia "Ejemplo_importador_Contable (21).csv": si alguien modifica el
 * exportador, esta prueba lo detecta.
 */

import { describe, expect, it } from 'vitest';
import {
  buildKameFileName,
  formatKameDate,
  generateKameCsv,
  verifyKameStructure,
} from '../src/modules/remuneraciones/core/kameExporter';
import {
  encodeLatin1,
  sanitizeCsvValue,
  toLatin1Safe,
} from '../src/modules/remuneraciones/utils/csvUtils';
import { EXPECTED } from './fixtures/syntheticPayroll';
import { buildScenario } from './helpers';

/** Cabecera EXACTA del archivo de referencia entregado por el cliente. */
const REFERENCE_HEADER =
  'TipoComprobante;FolioAuto;Folio;Fecha;Comentario;Cuenta;Debe;Haber;' +
  'Comentario Linea;Rut Ficha;Rzn Social Ficha;Nombre Doc;Folio Doc;Fecha Venc;' +
  'Unidad Negocio;Tipo Movimiento;Número Movimiento';

const scenario = buildScenario();
const lines = scenario.csv.content.split('\r\n').filter(Boolean);

describe('kameExporter — estructura del archivo', () => {
  it('la cabecera coincide EXACTAMENTE con el archivo de referencia', () => {
    expect(lines[0]).toBe(REFERENCE_HEADER);
  });

  it('tiene 17 columnas en cada fila', () => {
    for (const line of lines) {
      expect(line.split(';')).toHaveLength(17);
    }
  });

  it('usa separador ";" y saltos CRLF', () => {
    expect(scenario.csv.content).toContain('\r\n');
    expect(scenario.csv.content.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
  });

  it('la verificacion interna de estructura pasa sin problemas', () => {
    const check = verifyKameStructure(scenario.csv.content);
    expect(check.problems).toEqual([]);
    expect(check.ok).toBe(true);
    expect(check.columnCount).toBe(17);
    expect(check.rowCount).toBe(scenario.accounting.entries.length);
  });

  it('genera una fila por movimiento contable', () => {
    expect(scenario.csv.rowCount).toBe(scenario.accounting.entries.length);
    expect(lines).toHaveLength(scenario.accounting.entries.length + 1);
  });
});

describe('kameExporter — contenido de las filas', () => {
  const dataRows = lines.slice(1).map((l) => l.split(';'));

  it('los importes son enteros sin separador de miles y la columna vacia va en 0', () => {
    for (const cells of dataRows) {
      expect(cells[6]).toMatch(/^\d+$/);
      expect(cells[7]).toMatch(/^\d+$/);
      // Nunca hay monto en Debe y Haber a la vez.
      expect(cells[6] === '0' || cells[7] === '0').toBe(true);
    }
  });

  it('la fecha usa el formato d/MM/yyyy del archivo de referencia', () => {
    for (const cells of dataRows) {
      expect(cells[3]).toMatch(/^\d{1,2}\/\d{2}\/\d{4}$/);
    }
    expect(formatKameDate('2026-07-02')).toBe('2/07/2026');
    expect(formatKameDate('2026-07-31')).toBe('31/07/2026');
    expect(formatKameDate('2026-12-01')).toBe('1/12/2026');
  });

  it('la suma de Debe y de Haber del archivo coincide con el asiento', () => {
    let debe = 0;
    let haber = 0;
    for (const cells of dataRows) {
      debe += Number(cells[6]);
      haber += Number(cells[7]);
    }
    expect(debe).toBe(EXPECTED.totalDebit);
    expect(haber).toBe(EXPECTED.totalCredit);
    expect(debe).toBe(haber);
  });

  it('los movimientos por trabajador llevan Rut Ficha y Rzn Social Ficha', () => {
    const perWorker = dataRows.filter((c) => c[9] !== '');
    expect(perWorker.length).toBe(EXPECTED.workersWithLiquido);
    for (const cells of perWorker) {
      expect(cells[9]).toMatch(/^\d+-[0-9K]$/); // Rut Ficha
      expect(cells[10].length).toBeGreaterThan(0); // Rzn Social Ficha
    }
  });

  it('los movimientos consolidados NO llevan tercero', () => {
    const sueldoRow = dataRows.find((c) => c[5] === '5.01.01.01')!;
    expect(sueldoRow[9]).toBe('');
    expect(sueldoRow[10]).toBe('');
    expect(sueldoRow[6]).toBe(String(EXPECTED.sueldoBase));
  });

  it('todas las filas comparten cabecera de comprobante y numero de movimiento', () => {
    const tipos = new Set(dataRows.map((c) => c[0]));
    const movimientos = new Set(dataRows.map((c) => c[16]));
    expect(tipos.size).toBe(1);
    expect(movimientos.size).toBe(1);
    expect([...movimientos][0]).toBe('202607');
  });

  it('la columna Cuenta nunca queda vacia', () => {
    for (const cells of dataRows) {
      expect(cells[5].trim().length).toBeGreaterThan(0);
    }
  });
});

describe('kameExporter — nombre del archivo', () => {
  it('sigue el patron Centralizacion_Remuneraciones_[EMPRESA]_[PERIODO].csv', () => {
    expect(scenario.csv.fileName).toBe(
      'Centralizacion_Remuneraciones_EMPRESA_DEMO_SPA_Julio_2026.csv',
    );
    expect(scenario.csv.fileName).toMatch(
      /^Centralizacion_Remuneraciones_.+_.+\.csv$/,
    );
  });

  it('funciona aunque falten metadatos', () => {
    const name = buildKameFileName({
      ...scenario.book,
      meta: { ...scenario.book.meta, companyName: '', periodLabel: '', periodCode: '' },
    } as never);
    expect(name.startsWith('Centralizacion_Remuneraciones_')).toBe(true);
    expect(name.endsWith('.csv')).toBe(true);
  });
});

describe('kameExporter — codificacion y saneamiento', () => {
  it('codifica a ISO-8859-1 conservando las tildes', () => {
    const text = 'GRATIFICACIÓN';
    const bytes = encodeLatin1(text);
    expect(bytes).toHaveLength(text.length);
    expect(bytes[text.indexOf('Ó')]).toBe(0xd3); // Ó = 0xD3 en ISO-8859-1
    expect(bytes[bytes.length - 1]).toBe(0x4e); // N
    // CESANTÍA: la Í tambien debe conservarse.
    const bytes2 = encodeLatin1('CESANTÍA');
    expect(bytes2[6]).toBe(0xcd); // Í = 0xCD
  });

  it('transcribe caracteres que no existen en Latin-1', () => {
    expect(toLatin1Safe('“comillas” – guion')).toBe('"comillas" - guion');
    expect(toLatin1Safe('emoji 😀')).toBe('emoji ?');
  });

  it('elimina separadores y saltos de linea de los textos', () => {
    expect(sanitizeCsvValue('uno;dos')).toBe('uno,dos');
    expect(sanitizeCsvValue('linea1\nlinea2')).toBe('linea1 linea2');
    expect(sanitizeCsvValue(null)).toBe('');
  });

  it('un nombre con punto y coma no rompe la estructura del archivo', () => {
    const s = buildScenario();
    const modified = {
      ...s.config,
      voucher: { ...s.config.voucher, comentario: 'GLOSA; CON; SEPARADORES' },
    };
    // Se regenera el CSV con la glosa peligrosa.
    const regenerated = generateKameCsv(s.accounting, modified, s.book);
    expect(verifyKameStructure(regenerated.content).ok).toBe(true);
    expect(regenerated.content).not.toContain('GLOSA; CON');
    expect(regenerated.content).toContain('GLOSA, CON, SEPARADORES');
  });
});
