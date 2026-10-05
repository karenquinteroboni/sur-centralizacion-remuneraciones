/** Respuestas sinteticas con la forma real de Buk (sin datos de personas reales). */
import type {
  BukEmployee,
  BukPayrollRecord,
  BukSettlementLine,
} from '../../src/modules/remuneraciones/core/buk/bukTypes';

const L = (
  type: string,
  name: string,
  amount: number,
  code: string,
  item_code: string | null = null,
): BukSettlementLine => ({
  type, name, amount, code, item_code,
  income_type: null, subtype: null,
});

interface Spec {
  id: number;
  rut: string;
  base: number;
  /** Descuentos extra (ej. creditos) como [nombre, monto]. */
  extra?: [string, number][];
  closed?: boolean;
  month?: number;
  /** Fuerza un liquido distinto del calculado (inconsistencia de Buk). */
  netOverride?: number;
  /**
   * Descuentos superan el sueldo: Buk limita el liquido a `net` y agrega una linea
   * de tipo `sobregiro` por la parte no retenida (forma verificada en datos reales).
   */
  overdraftNet?: number;
  /** Linea extra de un tipo arbitrario. */
  extraLine?: BukSettlementLine;
}

export function buildRecord(s: Spec): BukPayrollRecord {
  const afp = Math.round(s.base * 0.11);
  const salud = Math.round(s.base * 0.07);
  const lines: BukSettlementLine[] = [
    L('haber', 'Sueldo Base', s.base, `assign_${s.id}1`, 'buk_wage'),
    L('descuento', 'Cotiz. Previ. Obligatoria', afp, 'prevision'),
    L('descuento', 'Cotiz. Salud Obligatoria', salud, 'salud_obligatoria'),
    L('aporte', 'Mutual Empleador', Math.round(s.base * 0.009), 'mutual_empleador'),
    L('informativo', 'Saldo Provision Vacaciones', 12345, 'prov_vac'),
  ];
  for (const [name, amount] of s.extra ?? []) {
    lines.push(L('descuento', name, amount, `credit_${s.id}${amount}`));
  }
  const desc = lines.filter((l) => l.type === 'descuento').reduce((a, l) => a + l.amount, 0);
  let net = s.base - desc;
  if (s.overdraftNet !== undefined) {
    lines.push(L('sobregiro', 'Sobregiro', s.overdraftNet - net, `sobregiro_${s.id}`));
    net = s.overdraftNet;
  }
  if (s.extraLine) lines.push(s.extraLine);
  return {
    liquidacion_id: 1000 + s.id,
    employee_id: s.id,
    person_id: s.id,
    rut: s.rut,
    month: s.month ?? 8,
    year: 2026,
    income_gross: s.base,
    income_net: s.netOverride ?? net,
    closed: s.closed ?? true,
    lines_settlement: lines,
  };
}

export const EMPLOYEES: BukEmployee[] = [
  { rut: '11.111.111-1', full_name: 'Ana Prueba Uno', code_sheet: 'A1', current_job: { role: { name: 'Analista' }, cost_center: 'CC-100' } },
  { rut: '22.222.222-k', full_name: 'Beto Prueba Dos', code_sheet: 'B2', current_job: { role: { name: 'Operador' }, cost_center: 'CC-200' } },
  { rut: '33.333.333-3', full_name: 'Carla Prueba Tres', current_job: null },
];

export function cleanPayroll(): BukPayrollRecord[] {
  return [
    // Dos lineas del MISMO credito: deben sumarse.
    buildRecord({ id: 1, rut: '11111111-1', base: 1_000_000, extra: [['Credito Personal Caja', 50_000], ['Credito Personal Caja', 20_000]] }),
    // RUT con k minuscula y sin puntos.
    buildRecord({ id: 2, rut: '22222222-k', base: 800_000 }),
    buildRecord({ id: 3, rut: '33.333.333-3', base: 600_000 }),
  ];
}
