/**
 * Contratos de la API de Buk Chile usados por el conector.
 * Verificados contra respuestas reales de `payroll_detail/month` y `employees`
 * (solo se tipan los campos que el conector realmente lee).
 */

export interface BukSettlementLine {
  /** haber | descuento | aporte | informativo */
  type: string;
  income_type?: string | null;
  subtype?: string | null;
  name: string;
  amount: number;
  /** Estable para conceptos de sistema; `assign_N` / `credit_N` son ids por trabajador. */
  code?: string | null;
  /** Codigo estable de Buk para conceptos asignables. */
  item_code?: string | null;
}

export interface BukPayrollRecord {
  liquidacion_id: number;
  employee_id: number;
  person_id: number;
  rut: string;
  month: number;
  year: number;
  income_gross: number;
  income_net: number;
  /** false = liquidacion en borrador (mes aun abierto). */
  closed: boolean;
  lines_settlement: BukSettlementLine[];
}

export interface BukCompanyRecord {
  id: number;
  name: string;
  rut: string;
}

export interface BukEmployee {
  rut: string;
  full_name?: string | null;
  code_sheet?: string | null;
  current_job?: {
    company_id?: number | null;
    role?: { name?: string | null } | null;
    cost_center?: string | null;
  } | null;
}

export interface BukPage<T> {
  pagination: { next: string | null; previous: string | null; count: number; total_pages: number };
  data: T[];
}
