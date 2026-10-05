/**
 * VISTA 0 — Panel de empresas (cartera).
 *
 * Se muestra antes del asistente cuando el aplicativo anfitrion entrega un
 * catalogo de empresas. Permite ver el estado de parametrizacion de toda la
 * cartera y entrar a centralizar una empresa concreta.
 *
 * IMPORTANTE: el estado de cada empresa se calcula EXCLUSIVAMENTE a partir de
 * la configuracion realmente guardada en el repositorio. El panel nunca inventa
 * avance: una empresa sin configuracion aparece como "Sin configurar".
 */

import { useMemo, useState } from 'react';
import type { CompanyRow, CompanyStatus, PortfolioSummary } from '../types/company';
import { filterCompanyRows, sortCompanyRows } from '../core/companyRegistry';
import { Badge, Button, Card, Stat } from './ui';

export interface CompaniesPanelProps {
  rows: CompanyRow[];
  summary: PortfolioSummary;
  /** Periodo de referencia (AAAAMM) para la columna "ultimo periodo". */
  referencePeriod: string | null;
  /** Se invoca al elegir una empresa: entra al asistente de carga. */
  onSelectCompany: (row: CompanyRow) => void;
  /** Etiquetas opcionales por empresa (ej. responsable, complejidad). */
  renderExtra?: (row: CompanyRow) => React.ReactNode;
  /** Filtros adicionales inyectados por el anfitrion (responsable, grupo...). */
  facets?: CompaniesFacet[];
  title?: string;
  description?: string;
}

/** Un filtro por faceta: etiqueta + funcion de pertenencia. */
export interface CompaniesFacet {
  id: string;
  label: string;
  options: { value: string; label: string; match: (row: CompanyRow) => boolean }[];
}

type StatusFilter = 'ALL' | CompanyStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'Todas' },
  { key: 'INCOMPLETE', label: 'Parametrizacion incompleta' },
  { key: 'UNCONFIGURED', label: 'Sin configurar' },
  { key: 'READY', label: 'Listas' },
];

export function CompaniesPanel({
  rows,
  summary,
  referencePeriod,
  onSelectCompany,
  renderExtra,
  facets = [],
  title = 'Empresas',
  description = 'Seleccione la empresa cuyo libro de remuneraciones desea centralizar.',
}: CompaniesPanelProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [facetValues, setFacetValues] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<'attention' | 'name'>('attention');
  const [groupView, setGroupView] = useState(false);

  const visible = useMemo(() => {
    let out = filterCompanyRows(rows, search);
    if (status !== 'ALL') out = out.filter((r) => r.status === status);
    for (const facet of facets) {
      const value = facetValues[facet.id];
      if (!value) continue;
      const option = facet.options.find((o) => o.value === value);
      if (option) out = out.filter(option.match);
    }
    return sortCompanyRows(out, sortBy);
  }, [rows, search, status, facetValues, facets, sortBy]);

  const grouped = useMemo(() => {
    if (!groupView) return null;
    const map = new Map<string, CompanyRow[]>();
    for (const row of visible) {
      const key = row.company.group ?? 'Sin grupo';
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => {
      // Los grupos con mas de una empresa primero.
      if (a[1].length !== b[1].length) return b[1].length - a[1].length;
      return a[0].localeCompare(b[0], 'es');
    });
  }, [visible, groupView]);

  return (
    <>
      <div className="crm-grid" style={{ marginBottom: 18 }}>
        <Stat label="Empresas en cartera" value={summary.total} />
        <Stat
          label="Parametrizadas"
          value={summary.ready}
          tone={summary.ready === summary.total && summary.total > 0 ? 'ok' : undefined}
          hint={`${summary.incomplete} incompletas · ${summary.unconfigured} sin configurar`}
        />
        <Stat
          label={referencePeriod ? `Centralizadas ${formatPeriod(referencePeriod)}` : 'Centralizadas'}
          value={summary.processedThisPeriod}
          hint={
            summary.total > 0
              ? `${Math.round((summary.processedThisPeriod / summary.total) * 100)}% de la cartera`
              : undefined
          }
        />
        <Stat
          label="Pendientes del periodo"
          value={summary.total - summary.processedThisPeriod}
          tone={summary.total - summary.processedThisPeriod > 0 ? 'error' : 'ok'}
        />
      </div>

      <Card
        title={title}
        description={description}
        actions={
          <div className="crm-row">
            <Button
              size="sm"
              variant={groupView ? 'primary' : 'default'}
              onClick={() => setGroupView((v) => !v)}
              title="Agrupa las empresas por holding / grupo economico"
            >
              Ver por grupo
            </Button>
            <Button
              size="sm"
              onClick={() => setSortBy((s) => (s === 'attention' ? 'name' : 'attention'))}
              title="Alterna el orden del listado"
            >
              Orden: {sortBy === 'attention' ? 'por atencion' : 'alfabetico'}
            </Button>
          </div>
        }
      >
        <div className="crm-toolbar">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={status === f.key ? 'primary' : 'default'}
              onClick={() => setStatus(f.key)}
            >
              {f.label}
            </Button>
          ))}
          <div className="crm-spacer" />
          <input
            className="crm-input crm-input--sm"
            style={{ width: 260 }}
            placeholder="Buscar por nombre, RUT, grupo o responsable..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {facets.length > 0 && (
          <div className="crm-toolbar">
            {facets.map((facet) => (
              <label key={facet.id} className="crm-row" style={{ gap: 6 }}>
                <span className="crm-small crm-muted">{facet.label}</span>
                <select
                  className="crm-select crm-select--sm"
                  style={{ width: 'auto' }}
                  value={facetValues[facet.id] ?? ''}
                  onChange={(e) =>
                    setFacetValues((prev) => ({ ...prev, [facet.id]: e.target.value }))
                  }
                >
                  <option value="">Todos</option>
                  {facet.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            ))}
            <div className="crm-spacer" />
            <span className="crm-small crm-muted">
              Mostrando {visible.length} de {rows.length}
            </span>
          </div>
        )}

        {grouped ? (
          grouped.map(([group, list]) => (
            <div key={group} style={{ marginBottom: 16 }}>
              <div className="crm-row" style={{ marginBottom: 6 }}>
                <span className="crm-strong">{group}</span>
                <Badge>{list.length} {list.length === 1 ? 'empresa' : 'empresas'}</Badge>
              </div>
              <CompaniesTable
                rows={list}
                onSelectCompany={onSelectCompany}
                renderExtra={renderExtra}
              />
            </div>
          ))
        ) : (
          <CompaniesTable
            rows={visible}
            onSelectCompany={onSelectCompany}
            renderExtra={renderExtra}
          />
        )}

        <div className="crm-legend">
          <span><i className="crm-dot crm-dot--ok" /> Lista: parametrizacion completa</span>
          <span><i className="crm-dot crm-dot--warn" /> Incompleta: faltan cuentas o clasificaciones</span>
          <span><i className="crm-dot crm-dot--muted" /> Sin configurar: aun no se parametriza</span>
        </div>
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function CompaniesTable({
  rows,
  onSelectCompany,
  renderExtra,
}: {
  rows: CompanyRow[];
  onSelectCompany: (row: CompanyRow) => void;
  renderExtra?: (row: CompanyRow) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="crm-table-wrap">
        <div className="crm-muted" style={{ textAlign: 'center', padding: 28 }}>
          No hay empresas que cumplan el filtro.
        </div>
      </div>
    );
  }

  return (
    <div className="crm-table-wrap">
      <table className="crm-table">
        <thead>
          <tr>
            <th style={{ minWidth: 240 }}>Empresa</th>
            <th style={{ width: 130 }}>RUT</th>
            <th style={{ width: 190 }}>Detalle</th>
            <th style={{ width: 150 }}>Parametrizacion</th>
            <th style={{ width: 120 }}>Ultimo periodo</th>
            <th style={{ width: 165 }}>Estado</th>
            <th style={{ width: 120 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.company.key}>
              <td>
                <div className="crm-strong">{row.company.name}</div>
                {row.company.shortName && row.company.shortName !== row.company.name && (
                  <div className="crm-small crm-muted">{row.company.shortName}</div>
                )}
                {row.company.group && (
                  <div style={{ marginTop: 3 }}>
                    <Badge tone="info">{row.company.group}</Badge>
                  </div>
                )}
              </td>

              <td className="crm-mono">{row.company.rut ?? '—'}</td>

              <td className="crm-small">{renderExtra ? renderExtra(row) : '—'}</td>

              <td className="crm-small">
                {row.hasConfig ? (
                  <>
                    <span className="crm-strong">{row.readyCount}</span> conceptos listos
                    {row.pendingCount > 0 && (
                      <div style={{ color: 'var(--crm-warn)' }}>
                        {row.pendingCount} por configurar
                      </div>
                    )}
                  </>
                ) : (
                  <span className="crm-muted">Sin parametrizar</span>
                )}
              </td>

              <td className="crm-mono crm-small">
                {row.lastPeriod ? formatPeriod(row.lastPeriod) : '—'}
              </td>

              <td><CompanyStatusBadge status={row.status} /></td>

              <td>
                <Button size="sm" variant="primary" onClick={() => onSelectCompany(row)}>
                  Centralizar →
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  switch (status) {
    case 'READY':
      return <Badge tone="ok" title="Parametrizacion completa">Lista</Badge>;
    case 'INCOMPLETE':
      return <Badge tone="warn" title="Faltan cuentas o clasificaciones">Incompleta</Badge>;
    case 'INACTIVE':
      return <Badge title="Empresa marcada como inactiva">Inactiva</Badge>;
    case 'UNCONFIGURED':
    default:
      return <Badge title="Todavia no se parametriza">Sin configurar</Badge>;
  }
}

/** "202607" → "Julio 2026" */
export function formatPeriod(code: string): string {
  const m = code.match(/^(\d{4})(\d{2})$/);
  if (!m) return code;
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  const idx = Number(m[2]) - 1;
  return idx >= 0 && idx < 12 ? `${meses[idx]} ${m[1]}` : code;
}
