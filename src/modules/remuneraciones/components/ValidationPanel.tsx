/**
 * VISTA 3 — Panel de validaciones.
 * Muestra el resultado de las validaciones y el veredicto de cuadratura.
 */

import { useMemo } from 'react';
import type { ValidationReport } from '../types/payroll';
import { formatCLP } from '../utils/numberUtils';
import { Alert, Button, Card, SeverityBadge, Stat } from './ui';

export interface ValidationPanelProps {
  report: ValidationReport;
  onGoToConcepts: () => void;
  onContinue: () => void;
  onFocusConcept: (conceptId: string) => void;
}

/** Descripcion legible de cada validacion exigida. */
const VALIDATION_CATALOG: { id: string; label: string; prefixes: string[] }[] = [
  { id: 'V1', label: 'Todos los conceptos incluidos tienen cuenta', prefixes: ['V1_'] },
  { id: 'V2', label: 'Todos los conceptos incluidos tienen clasificacion', prefixes: ['V2_'] },
  { id: 'V3', label: 'Las cuentas cumplen el formato esperado', prefixes: ['V3_'] },
  { id: 'V4', label: 'No quedan conceptos ambiguos sin resolver', prefixes: ['V4_AMBIGUO'] },
  { id: 'V5', label: 'Sin dobles contabilizaciones detectadas', prefixes: ['V5_'] },
  { id: 'V6', label: 'Los terceros requeridos tienen RUT valido', prefixes: ['V6_'] },
  { id: 'V7', label: 'Los terceros requeridos tienen nombre', prefixes: ['V7_'] },
  { id: 'V8', label: 'Los totales del Excel coinciden con lo contabilizado', prefixes: ['V8_IDENTIDAD_LIBRO_ERROR', 'V8_TOTAL_COLUMNA', 'V8_MONTO_CONTABILIZADO'] },
  { id: 'V9', label: 'El asiento esta completamente cuadrado', prefixes: ['V9_NO_CUADRADO', 'V9_SIN_MOVIMIENTOS'] },
  { id: 'V10', label: 'Documento, folio y vencimiento exigidos por la cuenta', prefixes: ['V10_'] },
];

export function ValidationPanel({
  report,
  onGoToConcepts,
  onContinue,
  onFocusConcept,
}: ValidationPanelProps) {
  const catalog = useMemo(
    () =>
      VALIDATION_CATALOG.map((v) => {
        const matched = report.issues.filter((i) =>
          v.prefixes.some((p) => i.code.startsWith(p)),
        );
        const hasError = matched.some((i) => i.severity === 'ERROR');
        const hasWarn = matched.some((i) => i.severity === 'WARNING');
        return {
          ...v,
          state: hasError ? 'error' : hasWarn ? 'warn' : 'ok',
          count: matched.length,
        } as const;
      }),
    [report],
  );

  return (
    <>
      <div className={report.balanced ? 'crm-verdict crm-verdict--ok' : 'crm-verdict crm-verdict--error'}>
        <span style={{ fontSize: 22 }}>{report.balanced ? '✓' : '✕'}</span>
        <span>
          {report.balanced ? 'CENTRALIZACION BALANCEADA' : 'CENTRALIZACION NO BALANCEADA'}
        </span>
      </div>

      <div className="crm-grid" style={{ marginBottom: 18 }}>
        <Stat label="Total Debe" value={formatCLP(report.totalDebit)} />
        <Stat label="Total Haber" value={formatCLP(report.totalCredit)} />
        <Stat
          label="Diferencia"
          value={formatCLP(report.difference)}
          tone={report.difference === 0 ? 'ok' : 'error'}
        />
        <Stat
          label="Estado de exportacion"
          value={report.canExport ? 'Habilitada' : 'Bloqueada'}
          tone={report.canExport ? 'ok' : 'error'}
          hint={`${report.errors.length} error(es) · ${report.warnings.length} advertencia(s)`}
        />
      </div>

      <Card title="Resumen de validaciones" description="Se ejecutan todas las validaciones obligatorias antes de habilitar la exportacion.">
        <div className="crm-table-wrap">
          <table className="crm-table">
            <tbody>
              {catalog.map((v) => (
                <tr key={v.id}>
                  <td style={{ width: 40 }}>
                    <i
                      className={
                        v.state === 'ok'
                          ? 'crm-dot crm-dot--ok'
                          : v.state === 'warn'
                            ? 'crm-dot crm-dot--warn'
                            : 'crm-dot crm-dot--error'
                      }
                    />
                  </td>
                  <td style={{ width: 52 }} className="crm-mono crm-strong">{v.id}</td>
                  <td>{v.label}</td>
                  <td className="crm-num crm-muted crm-small" style={{ width: 130 }}>
                    {v.count === 0 ? 'sin observaciones' : `${v.count} observacion(es)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {report.errors.length > 0 && (
        <Card title={`Errores que bloquean la exportacion (${report.errors.length})`}>
          {report.errors.slice(0, 60).map((issue, i) => (
            <IssueLine key={i} issue={issue} onFocusConcept={onFocusConcept} />
          ))}
          {report.errors.length > 60 && (
            <div className="crm-small crm-muted">
              …y {report.errors.length - 60} error(es) mas del mismo tipo.
            </div>
          )}
        </Card>
      )}

      {report.warnings.length > 0 && (
        <Card title={`Advertencias (${report.warnings.length})`} description="No bloquean la exportacion, pero conviene revisarlas.">
          {report.warnings.slice(0, 40).map((issue, i) => (
            <IssueLine key={i} issue={issue} onFocusConcept={onFocusConcept} />
          ))}
        </Card>
      )}

      {report.infos.length > 0 && (
        <Card title="Informacion">
          <details>
            <summary className="crm-small crm-muted" style={{ cursor: 'pointer' }}>
              Ver {report.infos.length} mensaje(s) informativo(s)
            </summary>
            <div style={{ marginTop: 10 }}>
              {report.infos.map((issue, i) => (
                <IssueLine key={i} issue={issue} onFocusConcept={onFocusConcept} />
              ))}
            </div>
          </details>
        </Card>
      )}

      <div className="crm-row">
        <Button onClick={onGoToConcepts}>← Volver a configuracion</Button>
        <div className="crm-spacer" />
        <Button variant="primary" onClick={onContinue} disabled={!report.canExport}>
          {report.canExport
            ? 'Continuar a previsualizacion →'
            : 'Corrija los errores para continuar'}
        </Button>
      </div>
    </>
  );
}

function IssueLine({
  issue,
  onFocusConcept,
}: {
  issue: ValidationReport['issues'][number];
  onFocusConcept: (conceptId: string) => void;
}) {
  const tone =
    issue.severity === 'ERROR' ? 'error' : issue.severity === 'WARNING' ? 'warn' : 'info';
  return (
    <Alert tone={tone} title={
      <span className="crm-row" style={{ gap: 8 }}>
        <SeverityBadge severity={issue.severity} />
        <span className="crm-mono crm-small">{issue.code}</span>
        <span>{issue.title}</span>
        {issue.conceptId && (
          <button
            type="button"
            className="crm-btn crm-btn--ghost crm-btn--sm"
            onClick={() => onFocusConcept(issue.conceptId!)}
          >
            ir al concepto
          </button>
        )}
      </span>
    }>
      <span className="crm-small">{issue.message}</span>
    </Alert>
  );
}
