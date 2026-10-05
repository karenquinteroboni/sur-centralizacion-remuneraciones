/**
 * Utilidades numericas. Sin dependencias externas.
 */

/**
 * Convierte a numero un valor proveniente de una celda Excel.
 * Acepta numeros nativos y texto en formato chileno ("1.234.567", "1.234,56"),
 * formato anglosajon ("1,234,567.89"), parentesis para negativos y simbolos $.
 * Devuelve 0 cuando no hay valor interpretable.
 */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;

  let s = String(value).trim();
  if (!s) return 0;

  // Negativo entre parentesis: (1.234) => -1234
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Elimina simbolos de moneda y espacios (incl. NBSP)
  s = s.replace(/[$\s ]/g, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (!s) return 0;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // El ultimo separador que aparece es el decimal.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Una sola coma con 1-2 decimales => decimal; si no, separador de miles.
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      s = parts[0] + '.' + parts[1];
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasDot) {
    const parts = s.split('.');
    // "1.234" o "1.234.567" => separador de miles en formato chileno.
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = parts.join('');
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

/** Redondea a `decimals` decimales evitando errores de coma flotante. */
export function round(n: number, decimals = 0): number {
  const f = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Redondea a peso entero (moneda chilena). */
export function toCLP(n: number): number {
  return Math.round(n);
}

/** Compara con tolerancia. */
export function nearlyEqual(a: number, b: number, tolerance = 1): boolean {
  return Math.abs(a - b) <= tolerance;
}

/** Formatea como pesos chilenos para la interfaz: 1.234.567 */
export function formatCLP(n: number): string {
  const neg = n < 0;
  const s = Math.abs(Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return neg ? `-${s}` : s;
}

/**
 * Formatea un numero para el CSV de Kame.
 * El archivo de referencia usa enteros sin separador de miles (ej. "1065961").
 */
export function formatKameAmount(n: number): string {
  return String(Math.round(n));
}

/** Suma segura de un arreglo. */
export function sum(values: number[]): number {
  let t = 0;
  for (const v of values) t += v;
  return t;
}
