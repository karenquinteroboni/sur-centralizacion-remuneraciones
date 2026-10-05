/**
 * VISTA 2 (dialogo) — Copiar los campos analiticos de una cuenta a otras.
 *
 * Resuelve el trabajo repetitivo de volver a escribir el mismo RUT, razon
 * social, documento, folio y vencimiento en cada concepto que los lleva.
 *
 * Dos decisiones de diseno:
 *  1. Se copia POR GRUPO (ficha / documento / folio / vencimiento), nunca campo
 *     a campo: los valores de un grupo carecen de sentido por separado.
 *  2. Los destinos se eligen EXPLICITAMENTE. La lista viene presugerida con los
 *     conceptos de la misma clasificacion, pero nada se aplica sin confirmar,
 *     y el dialogo muestra que valor se va a sobrescribir en cada destino.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConceptRow } from '../types/payroll';
import { CLASSIFICATION_LABELS } from '../types/payroll';
import {
  KAME_FIELD_GROUPS,
  activeKameFieldGroups,
  resolveKameFields,
  type KameFieldGroup,
} from '../core/kameFields';
import { Alert, Badge, Button } from './ui';

export interface CopyKameFieldsProps {
  /** Concepto cuya parametrizacion se copia. */
  source: ConceptRow;
  /** Candidatos a destino (ya filtrados: contabilizables y distintos del origen). */
  candidates: ConceptRow[];
  /** Destinos presugeridos al abrir (misma clasificacion que el origen). */
  suggestedIds: string[];
  onApply: (targetIds: string[], groups: KameFieldGroup[]) => void;
  onClose: () => void;
}

export function CopyKameFieldsDialog({
  source,
  candidates,
  suggestedIds,
  onApply,
  onClose,
}: CopyKameFieldsProps) {
  const sourceFields = useMemo(() => resolveKameFields(source.config), [source.config]);
  const active = useMemo(() => activeKameFieldGroups(sourceFields), [sourceFields]);

  // Por defecto se copian los grupos que el origen tiene encendidos.
  const [groups, setGroups] = useState<KameFieldGroup[]>(active);
  const [targets, setTargets] = useState<string[]>(suggestedIds);
  const [search, setSearch] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Los conceptos de la MISMA clasificacion que el origen van primero: son los
   * presugeridos, y si quedaran mezclados mas abajo el usuario veria "6
   * seleccionados" sin ninguna casilla marcada a la vista. El orden es estable
   * (no se reordena al marcar), para que la lista no salte bajo el cursor.
   */
  const visible = useMemo(() => {
    const t = search.trim().toUpperCase();
    const filtered = t
      ? candidates.filter(
          (r) => r.concept.label.toUpperCase().includes(t) || r.concept.id.includes(t),
        )
      : candidates;

    const sameClass = (r: ConceptRow) =>
      r.config.classification === source.config.classification ? 0 : 1;

    return [...filtered].sort(
      (a, b) => sameClass(a) - sameClass(b) || a.concept.columnIndex - b.concept.columnIndex,
    );
  }, [candidates, search, source.config.classification]);

  const toggleGroup = (id: KameFieldGroup) =>
    setGroups((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));

  const toggleTarget = (id: string) =>
    setTargets((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const selectByClassification = (classification: string | null) => {
    const ids = candidates
      .filter((r) => r.config.classification === classification)
      .map((r) => r.concept.id);
    setTargets((prev) => Array.from(new Set([...prev, ...ids])));
  };

  /** Resumen legible del valor que se copiara en cada grupo. */
  const groupSummary = (id: KameFieldGroup): string => {
    const f = sourceFields;
    switch (id) {
      case 'ficha': {
        if (!f.rut && !f.razonSocial) return 'apagada';
        const origen =
          f.fichaSource === 'TRABAJADOR'
            ? 'del trabajador'
            : f.fichaSource === 'EMPRESA'
              ? 'de la empresa'
              : `${f.fichaRut || 'sin RUT'} · ${f.fichaRazonSocial || 'sin razon social'}`;
        return origen;
      }
      case 'documento':
        return f.documento ? f.nombreDoc || '(sin nombre)' : 'apagado';
      case 'folio':
        return f.folio
          ? f.folioDocMode === 'PERIODO'
            ? 'periodo del libro (AAAAMM)'
            : f.folioDoc || '(vacio)'
          : 'apagado';
      case 'vencimiento':
        return f.vencimiento
          ? f.vencimientoMode === 'DIA_MES_SIGUIENTE'
            ? `dia ${f.vencimientoDia} del mes siguiente`
            : f.vencimientoFecha || '(sin fecha)'
          : 'apagado';
      default:
        return '';
    }
  };

  /** Que grupos del destino quedarian sobrescritos con valores distintos. */
  const overwritesFor = (row: ConceptRow): KameFieldGroup[] => {
    const targetFields = resolveKameFields(row.config);
    const targetActive = activeKameFieldGroups(targetFields);
    return groups.filter((g) => {
      if (!targetActive.includes(g)) return false;
      const keys = KAME_FIELD_GROUPS.find((x) => x.id === g)!.keys;
      return keys.some(
        (k) => JSON.stringify(targetFields[k]) !== JSON.stringify(sourceFields[k]),
      );
    });
  };

  const overwriteCount = targets.filter((id) => {
    const row = candidates.find((r) => r.concept.id === id);
    return row ? overwritesFor(row).length > 0 : false;
  }).length;

  const canApply = groups.length > 0 && targets.length > 0;

  return (
    <div
      className="crm-modal__backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Copiar campos a otros conceptos"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="crm-modal">
        <div className="crm-modal__head">
          <div className="crm-row">
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <h3 className="crm-card__title">Copiar campos a otros conceptos</h3>
              <p className="crm-card__desc" style={{ marginBottom: 0 }}>
                Origen: <strong>{source.concept.label}</strong>{' '}
                <span className="crm-mono crm-small">{source.concept.id}</span>
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              className="crm-modal__close"
              onClick={onClose}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </div>

        <div className="crm-modal__body">
          {active.length === 0 && (
            <Alert tone="warn" title="Este concepto no tiene ningun campo encendido">
              <span className="crm-small">
                Copiarlo apagaria los campos de los destinos. Parametrice primero el
                origen, o use esto justamente para apagar en bloque.
              </span>
            </Alert>
          )}

          {/* --- 1. Que copiar --------------------------------------------- */}
          <div className="crm-label" style={{ marginBottom: 8 }}>
            1. Que campos copiar
          </div>
          <div
            style={{
              display: 'grid',
              gap: 8,
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              marginBottom: 20,
            }}
          >
            {KAME_FIELD_GROUPS.map((g) => {
              const on = groups.includes(g.id);
              const encendido = active.includes(g.id);
              return (
                <label
                  key={g.id}
                  className={
                    on ? 'crm-pick crm-pick--on' : encendido ? 'crm-pick' : 'crm-pick crm-pick--off'
                  }
                >
                  <input
                    type="checkbox"
                    className="crm-checkbox"
                    checked={on}
                    onChange={() => toggleGroup(g.id)}
                  />
                  <span style={{ minWidth: 0 }}>
                    <div className="crm-strong">{g.label}</div>
                    <div className="crm-small crm-muted crm-mono">{g.columns}</div>
                    <div className="crm-small" style={{ marginTop: 2 }}>
                      {groupSummary(g.id)}
                    </div>
                  </span>
                </label>
              );
            })}
          </div>

          {/* --- 2. A donde ------------------------------------------------- */}
          <div className="crm-row" style={{ marginBottom: 8 }}>
            <span className="crm-label" style={{ margin: 0 }}>
              2. A que conceptos aplicarlos
            </span>
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
            <Button size="sm" onClick={() => setTargets(visible.map((r) => r.concept.id))}>
              Seleccionar visibles
            </Button>
            <Button size="sm" onClick={() => setTargets([])}>
              Quitar todos
            </Button>
            <Button size="sm" onClick={() => setTargets(suggestedIds)}>
              Volver a la sugerencia
            </Button>
            <div className="crm-spacer" />
            {(['HABER', 'DESCUENTO', 'APORTE_EMPLEADOR', 'NETO'] as const).map((c) => (
              <Button key={c} size="sm" onClick={() => selectByClassification(c)}>
                + {CLASSIFICATION_LABELS[c]}
              </Button>
            ))}
          </div>

          <div className="crm-table-wrap" style={{ maxHeight: '38vh', overflowY: 'auto' }}>
            <table className="crm-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }} />
                  <th>Concepto</th>
                  <th style={{ width: 130 }}>Clasificacion</th>
                  <th style={{ width: 120 }}>Cuenta</th>
                  <th style={{ width: 190 }}>Campos actuales</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="crm-muted" style={{ textAlign: 'center', padding: 22 }}>
                      No hay conceptos que cumplan la busqueda.
                    </td>
                  </tr>
                )}
                {visible.map((row) => {
                  const checked = targets.includes(row.concept.id);
                  const overwrites = checked ? overwritesFor(row) : [];
                  const targetActive = activeKameFieldGroups(resolveKameFields(row.config));
                  return (
                    <tr
                      key={row.concept.id}
                      className={checked ? 'crm-row--selected' : undefined}
                      onClick={() => toggleTarget(row.concept.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="crm-checkbox"
                          checked={checked}
                          onChange={() => toggleTarget(row.concept.id)}
                          aria-label={`Aplicar a ${row.concept.label}`}
                        />
                      </td>
                      <td>
                        <div className="crm-strong">{row.concept.label}</div>
                        <div className="crm-small crm-muted crm-mono">{row.concept.id}</div>
                        {overwrites.length > 0 && (
                          <div className="crm-small" style={{ color: 'var(--crm-warn)', marginTop: 2 }}>
                            ⚠ se reemplaza: {overwrites.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="crm-small">
                        {row.config.classification
                          ? CLASSIFICATION_LABELS[row.config.classification]
                          : '—'}
                      </td>
                      <td className="crm-mono crm-small">{row.config.account || '—'}</td>
                      <td>
                        {targetActive.length === 0 ? (
                          <span className="crm-small crm-muted">ninguno</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {targetActive.map((g) => (
                              <Badge key={g}>{g}</Badge>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="crm-modal__foot">
          <span className="crm-small crm-muted">
            {targets.length} concepto(s) seleccionado(s) · {groups.length} grupo(s) de campos
            {overwriteCount > 0 && (
              <>
                {' · '}
                <span style={{ color: 'var(--crm-warn)' }}>
                  {overwriteCount} con parametrizacion que sera reemplazada
                </span>
              </>
            )}
          </span>
          <div className="crm-spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!canApply}
            onClick={() => onApply(targets, groups)}
          >
            Aplicar a {targets.length} concepto{targets.length === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </div>
  );
}
