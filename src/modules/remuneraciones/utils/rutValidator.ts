/**
 * Utilidades de RUT chileno (modulo 11).
 */

/** Deja solo digitos y el digito verificador en mayuscula. */
export function cleanRut(rut: string | null | undefined): string {
  if (!rut) return '';
  return String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
}

/** Calcula el digito verificador de un cuerpo numerico. */
export function computeDv(body: string): string {
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const rest = 11 - (sum % 11);
  if (rest === 11) return '0';
  if (rest === 10) return 'K';
  return String(rest);
}

/** true si el RUT es valido segun modulo 11. */
export function isValidRut(rut: string | null | undefined): boolean {
  const clean = cleanRut(rut);
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  if (Number(body) === 0) return false;
  return computeDv(body) === dv;
}

/** Formatea a 12.345.678-9. Devuelve el original limpio si no se puede. */
export function formatRut(rut: string | null | undefined): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return clean;
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots}-${dv}`;
}

/** Formato usado en la columna "Rut Ficha" de Kame: 12345678-9 (sin puntos). */
export function formatRutForKame(rut: string | null | undefined): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return '';
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

/** Extrae el primer RUT que aparezca en un texto libre. */
export function extractRut(text: string | null | undefined): string {
  if (!text) return '';
  const m = String(text).match(/(\d{1,3}(?:\.\d{3})*|\d{7,8})\s*-\s*([0-9kK])/);
  if (!m) return '';
  return formatRut(`${m[1]}-${m[2]}`);
}
