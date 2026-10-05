/**
 * VISTA 2 (izquierda) — Tabla editable de conceptos detectados.
 *
 * Columnas: Incluir | Concepto | Tipo detectado | Cuenta | Tercero | Estado
 * Todas las celdas son editables directamente; el panel lateral permite
 * afinar las opciones avanzadas del concepto seleccionado.
 */

import { useMemo, useState } from 'react';
import type {
  ConceptClassification,
  ConceptConfig,
  ConceptRow,
  ThirdPartyMode,
} from '../types/payroll';
import { CLASSIFICATIONS, CLASSIFICATION_LABELS } from '../types/payroll';
import { resolveKameFields } from '../core/kameFields';
import { formatCLP } from '../utils/numberUtils';
import { Badge, Button, StatusBadge } from './ui';

export interface ConceptsTableProps {
  rows: ConceptRow[];
  selectedId: string | null;
  onSelect: (conceptId: string) => void;
  onChange: (conceptId: string, patch: Partial<ConceptConfig>) => void;
  onBulk: (patch: Partial<ConceptConfig>, filter?: (row: ConceptRow) => boolean) => void;
}

type FilterKey = 'ALL' | 'INCLUDED' | 'PENDING' | 'NEW' | 'TOTALIZERS' | 'DUPLICATES';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'INCLUDED', label: 'Incluidos' },
  { key: 'PENDING', label: 'Requieren configuracion' },
  { key: 'NEW', label: 'Nuevos' },
  { key: 'TOTALIZERS', label: 'Posibles totalizadores' },
  { key: 'DUPLICATES', label: 'Titulos duplicados' },
];

export function ConceptsTable({
  rows,
  selectedId,
  onSelect,
  onChange,
  onBulk,
}: ConceptsTableProps) {
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const term = search.trim().toUpperCase();
    return rows.filter((row) => {
      if (term && !row.concept.label.toUpperCase().includes(term) && !row.concept.id.includes(term)) {
        return false;
      }
      switch (filter) {
        case 'INCLUDED':
          return row.config.include;
        case 'PENDING':
          return row.status === 'PENDING' || row.status === 'NEW';
        case 'NEW':
          return row.isNew;
        case 'TOTALIZERS':
          return row.analysis?.looksLikeTotalizer === true;
        case 'DUPLICATES':
          return row.concept.duplicateLabel;
        default:
          return true;
      }
    });
  }, [rows, filter, search]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      included: rows.filter((r) => r.config.include).length,
      pending: rows.filter((r) => r.status === 'PENDING' || r.status === 'NEW').length,
      ok: rows.filter((r) => r.status === 'OK').length,
    }),
    [rows],
  );

  return (
    <div>
      <div className="crm-toolbar">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'primary' : 'default'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
        <div className="crm-spacer" />
        <input
          className="crm-input crm-input--sm"
          style={{ width: 200 }}
          placeholder="Buscar concepto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="crm-toolbar">
        <span className="crm-small crm-muted">
          {counts.ok} listos · {counts.pending} por configurar · {counts.included} incluidos de {counts.total}
        </span>
        <div className="crm-spacer" />
        <Button size="sm" onClick={() => onBulk({ include: true }, (r) => visible.includes(r))}>
          Incluir visibles
        </Button>
        <Button size="sm" onClick={() => onBulk({ include: false }, (r) => visible.includes(r))}>
          Excluir visibles
        </Button>
        <Button
          size="sm"
          title="Excluye todos los conceptos detectados como totalizadores"
          onClick={() => onBulk({ include: false }, (r) => r.analysis?.looksLikeTotalizer === true && r.config.classification !== 'NETO')}
        >
          Excluir totalizadores
        </Button>
      </div>

      <div className="crm-table-wrap" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
        <table className="crm-table crm-table--wide">
          <thead>
            <tr>
              <th style={{ width: 58 }}>Incluir</th>
              <th style={{ minWidth: 220 }}>Concepto</th>
              <th style={{ width: 160 }}>Tipo detectado</th>
              <th className="crm-num" style={{ width: 115 }}>Total periodo</th>
              <th style={{ width: 195 }}>Cuenta</th>
              <th style={{ width: 135 }}>Tercero</th>
              <th style={{ width: 170 }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="crm-muted" style={{ textAlign: 'center', padding: 26 }}>
                  No hay conceptos que cumplan el filtro.
                </td>
              </tr>
            )}

            {visible.map((row) => {
              const { concept, config, analysis } = row;
              const isAporte = config.classification === 'APORTE_EMPLEADOR';
              const noEntry =
                config.classification === 'TOTALIZADOR' ||
                config.classification === 'INFORMATIVO';

              const classes: string[] = [];
              if (!config.include) classes.push('crm-row--excluded');
              if (selectedId === concept.id) classes.push('crm-row--selected');

              return (
                <tr
                  key={concept.id}
                  className={classes.join(' ')}
                  onClick={() => onSelect(concept.id)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="crm-checkbox"
                      checked={config.include}
                      onChange={(e) => onChange(concept.id, { include: e.target.checked })}
                      aria-label={`Incluir ${concept.label}`}
                    />
                  </td>

                  <td>
                    <div className="crm-strong">{concept.label}</div>
                    <div className="crm-small crm-muted crm-mono">{concept.id}</div>
                    <div style={{ marginTop: 3, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {concept.duplicateLabel && (
                        <Badge tone="info" title="Existe otra columna con el mismo titulo">
                          duplicado #{concept.occurrence}
                        </Badge>
                      )}
                      {analysis?.looksLikeTotalizer && (
                        <Badge tone="warn" title={analysis.totalizerReason ?? ''}>
                          posible totalizador
                        </Badge>
                      )}
                      {row.isNew && <Badge tone="warn">nuevo</Badge>}
                    </div>
                    {row.doubleCountWarning && (
                      <div className="crm-small" style={{ color: 'var(--crm-warn)', marginTop: 4 }}>
                        ⚠ {row.doubleCountWarning}
                      </div>
                    )}
                  </td>

                  <td onClick={(e) => e.stopPropagation()}>
                    <select
                      className="crm-select crm-select--sm"
                      value={config.classification ?? ''}
                      onChange={(e) =>
                        onChange(concept.id, {
                          classification: (e.target.value || null) as ConceptClassification | null,
                        })
                      }
                    >
                      <option value="">(sin clasificar)</option>
                      {CLASSIFICATIONS.map((c) => (
                        <option key={c} value={c}>
                          {CLASSIFICATION_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    {analysis?.suggestedClassification &&
                      analysis.suggestedClassification !== config.classification && (
                        <button
                          type="button"
                          className="crm-btn crm-btn--ghost crm-btn--sm"
                          style={{ marginTop: 3, padding: '2px 4px' }}
                          onClick={() =>
                            onChange(concept.id, {
                              classification: analysis.suggestedClassification,
                            })
                          }
                          title={analysis.rationale}
                        >
                          sugerido: {CLASSIFICATION_LABELS[analysis.suggestedClassification]}
                        </button>
                      )}
                  </td>

                  <td className="crm-num">{formatCLP(concept.total)}</td>

                  <td onClick={(e) => e.stopPropagation()}>
                    {noEntry ? (
                      <span className="crm-small crm-muted">no aplica</span>
                    ) : isAporte ? (
                      <div style={{ display: 'grid', gap: 3 }}>
                        <input
                          className="crm-input crm-input--sm crm-input--mono"
                          placeholder="Gasto (DEBE)"
                          value={config.expenseAccount ?? ''}
                          onChange={(e) =>
                            onChange(concept.id, { expenseAccount: e.target.value })
                          }
                        />
                        <input
                          className="crm-input crm-input--sm crm-input--mono"
                          placeholder="Obligacion (HABER)"
                          value={config.liabilityAccount ?? ''}
                          onChange={(e) =>
                            onChange(concept.id, { liabilityAccount: e.target.value })
                          }
                        />
                      </div>
                    ) : (
                      <input
                        className={
                          config.include && !config.account
                            ? 'crm-input crm-input--sm crm-input--mono crm-input--error'
                            : 'crm-input crm-input--sm crm-input--mono'
                        }
                        placeholder="5.01.01.01"
                        value={config.account}
                        onChange={(e) => onChange(concept.id, { account: e.target.value })}
                      />
                    )}
                  </td>

                  <td onClick={(e) => e.stopPropagation()}>
                    {noEntry ? (
                      <span className="crm-small crm-muted">—</span>
                    ) : (
                      <select
                        className="crm-select crm-select--sm"
                        value={config.thirdPartyMode}
                        onChange={(e) =>
                          onChange(concept.id, {
                            thirdPartyMode: e.target.value as ThirdPartyMode,
                          })
                        }
                      >
                        <option value="CONSOLIDATED">Consolidado</option>
                        <option value="PER_WORKER">Por trabajador</option>
                      </select>
                    )}
                  </td>

                  <td>
                    <StatusBadge status={row.status} />
                    {!noEntry && <KameFieldsHint config={config} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="crm-legend">
        <span><i className="crm-dot crm-dot--ok" /> Correcto: cuenta y clasificacion definidas</span>
        <span><i className="crm-dot crm-dot--warn" /> Requiere configuracion / concepto nuevo</span>
        <span><i className="crm-dot crm-dot--muted" /> Excluido o sin efecto contable</span>
      </div>
    </div>
  );
}

/**
 * Resume, en la fila del concepto, que columnas analiticas emitira la cuenta.
 * Permite ver de un vistazo cuales cuentas llevan ficha o documento sin abrir
 * el panel de configuracion de cada una.
 */
function KameFieldsHint({ config }: { config: ConceptConfig }) {
  const f = resolveKameFields(config);
  const activos = [
    f.rut && 'RUT',
    f.razonSocial && 'Rzn',
    f.documento && 'Doc',
    f.folio && 'Folio',
    f.vencimiento && 'Venc',
  ].filter(Boolean) as string[];

  if (activos.length === 0) return null;

  const origen =
    f.fichaSource === 'TRABAJADOR'
      ? 'ficha del trabajador'
      : f.fichaSource === 'EMPRESA'
        ? 'ficha de la empresa'
        : 'ficha fija';

  return (
    <div style={{ marginTop: 4 }}>
      <Badge
        tone="info"
        title={`Campos Kame: ${activos.join(', ')}${f.rut || f.razonSocial ? ` (${origen})` : ''}`}
      >
        {activos.join(' ')}
      </Badge>
    </div>
  );
}
