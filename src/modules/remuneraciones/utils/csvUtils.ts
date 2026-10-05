/**
 * Utilidades de CSV y de codificacion.
 *
 * El archivo de referencia de Kame usa:
 *   - separador ";"
 *   - saltos de linea CRLF
 *   - codificacion ISO-8859-1 (Latin-1)
 *   - sin comillas de encapsulado
 *
 * Como no hay encapsulado, cualquier ";" o salto de linea presente en un texto
 * ROMPERIA el archivo. Por eso `sanitizeCsvValue` los reemplaza.
 */

export const CSV_SEPARATOR = ';';
export const CSV_EOL = '\r\n';

/**
 * Limpia un valor para que pueda escribirse en un CSV sin encapsulado:
 * elimina separadores, comillas y saltos de linea, y colapsa espacios.
 */
export function sanitizeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/;/g, ',')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Construye el texto CSV a partir de columnas y filas ya sanitizadas. */
export function buildCsv(
  columns: string[],
  rows: Record<string, string>[],
  options: { separator?: string; eol?: string; trailingEol?: boolean } = {},
): string {
  const sep = options.separator ?? CSV_SEPARATOR;
  const eol = options.eol ?? CSV_EOL;
  const lines: string[] = [columns.join(sep)];
  for (const row of rows) {
    lines.push(columns.map((c) => sanitizeCsvValue(row[c] ?? '')).join(sep));
  }
  const text = lines.join(eol);
  return options.trailingEol === false ? text : text + eol;
}

/**
 * Tabla de transliteracion para caracteres que no existen en Latin-1.
 * Evita que un caracter suelto (comillas tipograficas, guion largo) produzca
 * un "?" o rompa la importacion.
 */
const LATIN1_FALLBACK: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'",
  '“': '"', '”': '"', '„': '"',
  '–': '-', '—': '-', '−': '-',
  '…': '...', '•': '-', ' ': ' ',
  '€': 'EUR', '™': 'TM',
};

/** Reemplaza caracteres no representables en Latin-1 por equivalentes ASCII. */
export function toLatin1Safe(text: string): string {
  let out = '';
  for (const ch of text) {
    if (LATIN1_FALLBACK[ch] !== undefined) {
      out += LATIN1_FALLBACK[ch];
      continue;
    }
    const code = ch.codePointAt(0)!;
    if (code <= 0xff) {
      out += ch;
    } else {
      // Ultimo recurso: descomponer y quedarse con la letra base.
      const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      out += base.codePointAt(0)! <= 0xff ? base : '?';
    }
  }
  return out;
}

/** Codifica un string a bytes ISO-8859-1. */
export function encodeLatin1(text: string): Uint8Array {
  const safe = toLatin1Safe(text);
  const bytes = new Uint8Array(safe.length);
  for (let i = 0; i < safe.length; i++) {
    bytes[i] = safe.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Crea un Blob listo para descargar en el navegador.
 * `encoding` por defecto es latin1 para maxima compatibilidad con Kame.
 */
export function createCsvBlob(
  text: string,
  encoding: 'latin1' | 'utf8' = 'latin1',
): Blob {
  if (encoding === 'utf8') {
    // BOM para que Excel abra correctamente el UTF-8.
    return new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
  }
  const bytes = encodeLatin1(text);
  // `slice()` normaliza el tipo del buffer subyacente (ArrayBuffer, no
  // SharedArrayBuffer), que es lo que exige la firma de Blob.
  return new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: 'text/csv;charset=iso-8859-1;',
  });
}

/**
 * Estrategia de guardado de archivos.
 *
 * Existe para que el aplicativo anfitrion pueda desviar la descarga a su
 * propio mecanismo: un contenedor Electron, un puente movil, una subida al
 * backend, o un entorno donde el ancla `<a download>` no funciona.
 */
export type FileSaver = (blob: Blob, fileName: string) => void | Promise<void>;

let customSaver: FileSaver | null = null;

/** Instala una estrategia propia. `null` restaura la descarga estandar. */
export function setFileSaver(saver: FileSaver | null): void {
  customSaver = saver;
}

/** Guarda un archivo: usa la estrategia instalada o la descarga del navegador. */
export async function downloadFile(blob: Blob, fileName: string): Promise<void> {
  if (customSaver) {
    await customSaver(blob, fileName);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Libera memoria en el siguiente tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Sanea un texto para usarlo como parte de un nombre de archivo. */
export function slugForFileName(text: string): string {
  return toLatin1Safe(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'EMPRESA';
}
