/**
 * VISTA 4 — Previsualizacion del asiento contable.
 * Muestra exactamente lo que se enviara a Kame, con totales y cuadratura.
 */

import { useMemo, useState } from 'react';
import type { AccountingResult, CentralizationConfig } from '../types/payroll';
import { CLASSIFICATION_LABELS } from '../types/payroll';
import { summarizeByAccount } from '../core/accountingEngine';
import { formatCLP } from '../utils/numberUtils';
import { Badge, Button, Card, Stat } from './ui';

export interface AccountingPreviewProps {
  accounting: AccountingResult;
  config: CentralizationConfig;
  onBack: () => void;
  onContinue: () => void;
  canExport: boolean;
}

export function AccountingPreview({
  accounting,
  config,
  onBack,
  onContinue,
  canExport,
}: AccountingPreviewProps) {
  const [mode, setMode] = useState<'detail' | 'account'>('detail');
  const byAccount = useMemo(() => summarizeByAccount(accounting.entries), [accounting.entries]);

  return (
    <>
      <div className="crm-grid" style={{ marginBottom: 18 }}>
        <Stat label="Total Debe" value={formatCLP(accounting.totalDebit)} />
        <Stat label="Total Haber" value={formatCLP(accounting.totalCredit)} />
        <Stat
          label="Diferencia"
          value={formatCLP(accounting.difference)}
          tone={accounting.balanced ? 'ok' : 'error'}
        />
        <Stat label="Cantidad de movimientos" value={accounting.entries.length} />
      </div>

      <Card
        title="Asiento que se enviara a Kame"
        description={`Comprobante ${config.voucher.tipoComprobante} · folio ${config.voucher.folio} · fecha ${config.voucher.fecha} · movimiento ${config.voucher.numeroMovimiento}`}
        actions={
          <div className="crm-row">
            <Button size="sm" variant={mode === 'detail' ? 'primary' : 'default'} onClick={() => setMode('detail')}>
              Detalle
            </Button>
            <Button size="sm" variant={mode === 'account' ? 'primary' : 'default'} onClick={() => setMode('account')}>
              Resumen por cuenta
            </Button>
          </div>
        }
      >
        {mode === 'detail' ? (
          <div className="crm-table-wrap" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
            <table className="crm-table crm-table--wide">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Cuenta</th>
                  <th>Concepto</th>
                  <th className="crm-num" style={{ width: 120 }}>Debe</th>
                  <th className="crm-num" style={{ width: 120 }}>Haber</th>
                  <th style={{ width: 120 }}>RUT</th>
                  <th style={{ width: 180 }}>Tercero</th>
                  <th style={{ width: 110 }}>Documento</th>
                  <th style={{ width: 90 }}>Folio</th>
                  <th style={{ width: 100 }}>Vencimiento</th>
                </tr>
              </thead>
              <tbody>
                {accounting.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="crm-mono">{e.account}</td>
                    <td>
                      <div className="crm-truncate" title={e.comment}>{e.comment}</div>
                      <div className="crm-small crm-muted">
                        <Badge tone={e.nature === 'DEBE' ? 'info' : 'muted'}>{e.nature}</Badge>{' '}
                        {CLASSIFICATION_LABELS[e.classification]}
                        {e.thirdPartyMode === 'PER_WORKER' && ' · por trabajador'}
                      </div>
                    </td>
                    <td className="crm-num">{e.debit ? formatCLP(e.debit) : ''}</td>
                    <td className="crm-num">{e.credit ? formatCLP(e.credit) : ''}</td>
                    <td className="crm-mono crm-small">{e.thirdPartyRut || ''}</td>
                    <td className="crm-truncate crm-small">{e.thirdPartyName || ''}</td>
                    <td className="crm-small">{e.documentName || ''}</td>
                    <td className="crm-mono crm-small">{e.documentFolio || ''}</td>
                    <td className="crm-mono crm-small">{e.dueDate || ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="crm-table__foot">
                <tr>
                  <td colSpan={2}>TOTALES ({accounting.entries.length} movimientos)</td>
                  <td className="crm-num">{formatCLP(accounting.totalDebit)}</td>
                  <td className="crm-num">{formatCLP(accounting.totalCredit)}</td>
                  <td colSpan={5}>
                    Diferencia: <strong>{formatCLP(accounting.difference)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th className="crm-num">Debe</th>
                  <th className="crm-num">Haber</th>
                  <th className="crm-num">Movimientos</th>
                </tr>
              </thead>
              <tbody>
                {byAccount.map((r) => (
                  <tr key={r.account}>
                    <td className="crm-mono">{r.account}</td>
                    <td className="crm-num">{r.debit ? formatCLP(r.debit) : ''}</td>
                    <td className="crm-num">{r.credit ? formatCLP(r.credit) : ''}</td>
                    <td className="crm-num">{r.entries}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="crm-table__foot">
                <tr>
                  <td>{byAccount.length} cuentas</td>
                  <td className="crm-num">{formatCLP(accounting.totalDebit)}</td>
                  <td className="crm-num">{formatCLP(accounting.totalCredit)}</td>
                  <td className="crm-num">{accounting.entries.length}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Card title="Resumen por clasificacion">
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Clasificacion</th>
                <th className="crm-num">Debe</th>
                <th className="crm-num">Haber</th>
                <th className="crm-num">Movimientos</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(accounting.byClassification)
                .filter(([, v]) => v.count > 0)
                .map(([k, v]) => (
                  <tr key={k}>
                    <td>{CLASSIFICATION_LABELS[k as keyof typeof CLASSIFICATION_LABELS]}</td>
                    <td className="crm-num">{v.debit ? formatCLP(v.debit) : ''}</td>
                    <td className="crm-num">{v.credit ? formatCLP(v.credit) : ''}</td>
                    <td className="crm-num">{v.count}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {accounting.skippedConcepts.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary className="crm-small crm-muted" style={{ cursor: 'pointer' }}>
              {accounting.skippedConcepts.length} concepto(s) incluido(s) sin movimiento
            </summary>
            <ul className="crm-small crm-muted" style={{ marginTop: 8 }}>
              {accounting.skippedConcepts.map((s) => (
                <li key={s.conceptId}>
                  <strong>{s.label}</strong>: {s.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <div className="crm-row">
        <Button onClick={onBack}>← Volver a validacion</Button>
        <div className="crm-spacer" />
        <Button variant="primary" onClick={onContinue} disabled={!canExport}>
          Generar archivo Kame →
        </Button>
      </div>
    </>
  );
}
