/**
 * VISTA 2 (derecha) — Panel de configuracion avanzada del concepto seleccionado
 * y de la cabecera del comprobante Kame.
 */

import type {
  CentralizationConfig,
  ConceptClassification,
  ConceptConfig as ConceptConfigType,
  ConceptKameFields,
  ConceptRow,
  FichaSource,
  FolioDocMode,
  ThirdPartyMode,
  VencimientoMode,
  VoucherConfig,
} from '../types/payroll';
import { resolveKameFields } from '../core/kameFields';
import { CLASSIFICATIONS, CLASSIFICATION_LABELS } from '../types/payroll';
import { formatCLP } from '../utils/numberUtils';
import { Alert, Badge, Button, Field } from './ui';

export interface ConceptConfigPanelProps {
  row: ConceptRow | null;
  voucher: VoucherConfig;
  onChangeConcept: (conceptId: string, patch: Partial<ConceptConfigType>) => void;
  onChangeVoucher: (patch: Partial<VoucherConfig>) => void;
  config: CentralizationConfig;
  /** Abre el dialogo para replicar los campos Kame a otros conceptos. */
  onCopyKameFields?: (conceptId: string) => void;
}

export function ConceptConfigPanel({
  row,
  voucher,
  onChangeConcept,
  onChangeVoucher,
  onCopyKameFields,
}: ConceptConfigPanelProps) {
  return (
    <aside className="crm-panel">
      <VoucherSection voucher={voucher} onChange={onChangeVoucher} />
      <hr className="crm-hr" />
      {row ? (
        <ConceptSection
          row={row}
          onChange={onChangeConcept}
          onCopyKameFields={onCopyKameFields}
        />
      ) : (
        <div className="crm-small crm-muted">
          Seleccione un concepto en la tabla para ver y ajustar sus opciones avanzadas
          (glosa de la linea, unidad de negocio y reglas especiales).
        </div>
      )}
    </aside>
  );
}

/* -------------------------------------------------------------------------- */

function VoucherSection({
  voucher,
  onChange,
}: {
  voucher: VoucherConfig;
  onChange: (patch: Partial<VoucherConfig>) => void;
}) {
  return (
    <div className="crm-panel__section">
      <h3 className="crm-card__title" style={{ marginBottom: 10 }}>
        Cabecera del comprobante
      </h3>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Tipo comprobante">
            <input
              className="crm-input crm-input--sm"
              value={voucher.tipoComprobante}
              onChange={(e) => onChange({ tipoComprobante: e.target.value })}
              list="crm-tipos-comprobante"
            />
            <datalist id="crm-tipos-comprobante">
              <option value="TRASPASO" />
              <option value="EGRESO" />
              <option value="INGRESO" />
            </datalist>
          </Field>

          <Field label="Folio auto">
            <select
              className="crm-select crm-select--sm"
              value={voucher.folioAuto}
              onChange={(e) => onChange({ folioAuto: e.target.value })}
            >
              <option value="S">S (lo asigna Kame)</option>
              <option value="N">N (manual)</option>
            </select>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Folio">
            <input
              className="crm-input crm-input--sm"
              value={voucher.folio}
              onChange={(e) => onChange({ folio: e.target.value })}
            />
          </Field>
          <Field label="Fecha del asiento">
            <input
              className="crm-input crm-input--sm"
              type="date"
              value={voucher.fecha}
              onChange={(e) => onChange({ fecha: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Glosa del comprobante">
          <input
            className="crm-input crm-input--sm"
            value={voucher.comentario}
            onChange={(e) => onChange({ comentario: e.target.value })}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Unidad de negocio">
            <input
              className="crm-input crm-input--sm"
              value={voucher.unidadNegocio}
              onChange={(e) => onChange({ unidadNegocio: e.target.value })}
            />
          </Field>
          <Field label="N.o movimiento" hint="Por convencion, el periodo AAAAMM.">
            <input
              className="crm-input crm-input--sm crm-input--mono"
              value={voucher.numeroMovimiento}
              onChange={(e) => onChange({ numeroMovimiento: e.target.value })}
            />
          </Field>
        </div>

        <details>
          <summary className="crm-small crm-muted" style={{ cursor: 'pointer' }}>
            Campos opcionales del documento
          </summary>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <Field label="Tipo movimiento">
              <input
                className="crm-input crm-input--sm"
                placeholder="(vacio)"
                value={voucher.tipoMovimiento}
                onChange={(e) => onChange({ tipoMovimiento: e.target.value })}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Nombre doc.">
                <input
                  className="crm-input crm-input--sm"
                  value={voucher.nombreDoc}
                  onChange={(e) => onChange({ nombreDoc: e.target.value })}
                />
              </Field>
              <Field label="Folio doc.">
                <input
                  className="crm-input crm-input--sm"
                  value={voucher.folioDoc}
                  onChange={(e) => onChange({ folioDoc: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ConceptSection({
  row,
  onChange,
  onCopyKameFields,
}: {
  row: ConceptRow;
  onChange: (conceptId: string, patch: Partial<ConceptConfigType>) => void;
  onCopyKameFields?: (conceptId: string) => void;
}) {
  const { concept, config, analysis } = row;
  const set = (patch: Partial<ConceptConfigType>) => onChange(concept.id, patch);
  const isAporte = config.classification === 'APORTE_EMPLEADOR';
  const noEntry =
    config.classification === 'TOTALIZADOR' || config.classification === 'INFORMATIVO';

  return (
    <div className="crm-panel__section">
      <h3 className="crm-card__title" style={{ marginBottom: 2 }}>
        {concept.label}
      </h3>
      <div className="crm-small crm-muted crm-mono" style={{ marginBottom: 10 }}>
        {concept.id} · columna {concept.columnIndex + 1} · total {formatCLP(concept.total)}
      </div>

      {analysis && (
        <div style={{ marginBottom: 10 }}>
          <Alert tone={analysis.suggestedClassification ? 'info' : 'warn'}
                 title={analysis.suggestedClassification
                   ? `Sugerencia automatica: ${CLASSIFICATION_LABELS[analysis.suggestedClassification]}`
                   : 'Nuevo concepto detectado: requiere parametrizacion'}>
            <span className="crm-small">{analysis.rationale}</span>
          </Alert>
        </div>
      )}

      {row.doubleCountWarning && (
        <Alert tone="warn" title="Posible doble contabilizacion">
          <span className="crm-small">{row.doubleCountWarning}</span>
        </Alert>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        <Field label="Incluir en la centralizacion">
          <label className="crm-row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              className="crm-checkbox"
              checked={config.include}
              onChange={(e) => set({ include: e.target.checked })}
            />
            <span className="crm-small">
              {config.include ? 'Se contabiliza' : 'Excluido del asiento'}
            </span>
          </label>
        </Field>

        <Field label="Clasificacion contable">
          <select
            className="crm-select crm-select--sm"
            value={config.classification ?? ''}
            onChange={(e) =>
              set({ classification: (e.target.value || null) as ConceptClassification | null })
            }
          >
            <option value="">(sin clasificar)</option>
            {CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>{CLASSIFICATION_LABELS[c]}</option>
            ))}
          </select>
        </Field>

        {!noEntry && (
          <>
            {isAporte ? (
              <>
                <Field label="Cuenta de gasto (DEBE)">
                  <input
                    className="crm-input crm-input--sm crm-input--mono"
                    value={config.expenseAccount ?? ''}
                    onChange={(e) => set({ expenseAccount: e.target.value })}
                    placeholder="5.01.03.01"
                  />
                </Field>
                <Field label="Cuenta de obligacion (HABER)">
                  <input
                    className="crm-input crm-input--sm crm-input--mono"
                    value={config.liabilityAccount ?? ''}
                    onChange={(e) => set({ liabilityAccount: e.target.value })}
                    placeholder="2.01.04.01"
                  />
                </Field>
              </>
            ) : (
              <Field
                label="Cuenta contable Kame"
                hint={
                  config.classification === 'HABER'
                    ? 'Genera movimiento al DEBE.'
                    : 'Genera movimiento al HABER.'
                }
              >
                <input
                  className="crm-input crm-input--sm crm-input--mono"
                  value={config.account}
                  onChange={(e) => set({ account: e.target.value })}
                  placeholder="5.01.01.01"
                />
              </Field>
            )}

            <Field
              label="Modalidad de tercero"
              hint={
                config.thirdPartyMode === 'PER_WORKER'
                  ? 'Un movimiento por trabajador, con RUT y nombre tomados del Excel.'
                  : 'Un unico movimiento con el total del concepto.'
              }
            >
              <select
                className="crm-select crm-select--sm"
                value={config.thirdPartyMode}
                onChange={(e) => set({ thirdPartyMode: e.target.value as ThirdPartyMode })}
              >
                <option value="CONSOLIDATED">Consolidado</option>
                <option value="PER_WORKER">Por trabajador</option>
              </select>
            </Field>

            <Field label="Glosa de la linea" hint="Si se deja vacia se usa el titulo del concepto.">
              <input
                className="crm-input crm-input--sm"
                value={config.lineComment ?? ''}
                onChange={(e) => set({ lineComment: e.target.value })}
                placeholder={concept.label}
              />
            </Field>

            <Field label="Unidad de negocio del concepto" hint="Vacio = usa la de la cabecera.">
              <input
                className="crm-input crm-input--sm"
                value={config.businessUnit ?? ''}
                onChange={(e) => set({ businessUnit: e.target.value })}
              />
            </Field>

            <KameFieldsSection row={row} onChange={onChange} onCopy={onCopyKameFields} />

            <details>
              <summary className="crm-small crm-muted" style={{ cursor: 'pointer' }}>
                Reglas especiales
              </summary>
              <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                <label className="crm-row crm-small" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    className="crm-checkbox"
                    checked={Boolean(config.rules?.invertNature)}
                    onChange={(e) =>
                      set({ rules: { ...config.rules, invertNature: e.target.checked } })
                    }
                  />
                  Invertir naturaleza (DEBE ↔ HABER)
                </label>
                <label className="crm-row crm-small" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    className="crm-checkbox"
                    checked={Boolean(config.rules?.ignoreNegative)}
                    onChange={(e) =>
                      set({ rules: { ...config.rules, ignoreNegative: e.target.checked } })
                    }
                  />
                  Ignorar montos negativos
                </label>
                <Field label="Factor multiplicador">
                  <input
                    className="crm-input crm-input--sm"
                    type="number"
                    step="0.01"
                    value={config.rules?.factor ?? 1}
                    onChange={(e) =>
                      set({ rules: { ...config.rules, factor: Number(e.target.value) || 1 } })
                    }
                  />
                </Field>
                <Field label="Monto minimo por linea">
                  <input
                    className="crm-input crm-input--sm"
                    type="number"
                    value={config.rules?.minAmount ?? 0}
                    onChange={(e) =>
                      set({ rules: { ...config.rules, minAmount: Number(e.target.value) || 0 } })
                    }
                  />
                </Field>
              </div>
            </details>
          </>
        )}

        {noEntry && (
          <div className="crm-small crm-muted">
            Los conceptos <Badge>{CLASSIFICATION_LABELS[config.classification!]}</Badge> no generan
            movimientos contables, por lo que no requieren cuenta ni tercero.
          </div>
        )}

        <Field label="Notas">
          <textarea
            className="crm-textarea"
            rows={2}
            value={config.notes ?? ''}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  CAMPOS ANALITICOS QUE EXIGE LA CUENTA EN KAME                             */
/* -------------------------------------------------------------------------- */

/**
 * En Kame no todas las cuentas admiten los mismos campos: las cuentas con
 * ficha exigen RUT y razon social, y las de pasivo con seguimiento documental
 * exigen documento, folio y vencimiento. Se configura POR CUENTA.
 */
function KameFieldsSection({
  row,
  onChange,
  onCopy,
}: {
  row: ConceptRow;
  onChange: (conceptId: string, patch: Partial<ConceptConfigType>) => void;
  onCopy?: (conceptId: string) => void;
}) {
  const { concept, config } = row;
  const f = resolveKameFields(config);

  const set = (patch: Partial<ConceptKameFields>) =>
    onChange(concept.id, { kameFields: { ...f, ...patch } });

  const activos = [
    f.rut && 'RUT',
    f.razonSocial && 'Razon social',
    f.documento && 'Documento',
    f.folio && 'Folio',
    f.vencimiento && 'Vencimiento',
  ].filter(Boolean) as string[];

  const necesitaFicha = f.rut || f.razonSocial;

  return (
    <details open={activos.length > 0}>
      <summary className="crm-small crm-muted" style={{ cursor: 'pointer' }}>
        Campos que exige la cuenta en Kame{' '}
        {activos.length > 0 ? (
          <Badge tone="info">{activos.join(' · ')}</Badge>
        ) : (
          <Badge>ninguno</Badge>
        )}
      </summary>

      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        <div className="crm-small crm-muted">
          Marque solo lo que la cuenta maneja. Lo que quede sin marcar se emite
          vacio en el archivo, que es lo que Kame espera.
        </div>

        <Toggle
          label="Rut Ficha"
          checked={f.rut}
          onChange={(v) => set({ rut: v })}
        />
        <Toggle
          label="Rzn Social Ficha"
          checked={f.razonSocial}
          onChange={(v) => set({ razonSocial: v })}
        />

        {necesitaFicha && (
          <div
            style={{
              display: 'grid',
              gap: 10,
              padding: '10px 12px',
              border: '1px solid var(--crm-border)',
              borderRadius: 'var(--crm-radius-sm)',
              background: 'var(--crm-surface-2)',
            }}
          >
            <Field label="Origen de la ficha">
              <select
                className="crm-select crm-select--sm"
                value={f.fichaSource}
                onChange={(e) => set({ fichaSource: e.target.value as FichaSource })}
              >
                <option value="TRABAJADOR">Del trabajador (una linea por persona)</option>
                <option value="FIJA">Tercero fijo (AFP, Isapre, mutual...)</option>
                <option value="EMPRESA">La propia empresa del libro</option>
              </select>
            </Field>

            {f.fichaSource === 'TRABAJADOR' && config.thirdPartyMode === 'CONSOLIDATED' && (
              <Alert tone="warn" title="El concepto esta consolidado">
                <span className="crm-small">
                  Con ficha del trabajador y modo consolidado se genera una sola linea
                  sin ficha. Cambie el concepto a «Por trabajador» o elija otro origen.
                </span>
              </Alert>
            )}

            {f.fichaSource === 'FIJA' && (
              <>
                {f.rut && (
                  <Field label="RUT del tercero">
                    <input
                      className="crm-input crm-input--sm crm-input--mono"
                      value={f.fichaRut}
                      onChange={(e) => set({ fichaRut: e.target.value })}
                      placeholder="76.123.456-7"
                    />
                  </Field>
                )}
                {f.razonSocial && (
                  <Field label="Razon social del tercero">
                    <input
                      className="crm-input crm-input--sm"
                      value={f.fichaRazonSocial}
                      onChange={(e) => set({ fichaRazonSocial: e.target.value })}
                      placeholder="AFP HABITAT S.A."
                    />
                  </Field>
                )}
              </>
            )}

            {f.fichaSource === 'EMPRESA' && (
              <div className="crm-small crm-muted">
                Se usan el RUT y la razon social detectados en la cabecera del libro.
              </div>
            )}
          </div>
        )}

        <Toggle
          label="Nombre Doc"
          checked={f.documento}
          onChange={(v) => set({ documento: v })}
        />
        {f.documento && (
          <Field label="Nombre del documento">
            <input
              className="crm-input crm-input--sm"
              value={f.nombreDoc}
              onChange={(e) => set({ nombreDoc: e.target.value })}
              placeholder="PLANILLA"
            />
          </Field>
        )}

        <Toggle
          label="Folio Doc"
          checked={f.folio}
          onChange={(v) => set({ folio: v })}
        />
        {f.folio && (
          <>
            <Field label="Origen del folio">
              <select
                className="crm-select crm-select--sm"
                value={f.folioDocMode}
                onChange={(e) => set({ folioDocMode: e.target.value as FolioDocMode })}
              >
                <option value="PERIODO">El periodo del libro (AAAAMM)</option>
                <option value="FIJO">Valor fijo</option>
              </select>
            </Field>
            {f.folioDocMode === 'FIJO' && (
              <Field label="Folio">
                <input
                  className="crm-input crm-input--sm crm-input--mono"
                  value={f.folioDoc}
                  onChange={(e) => set({ folioDoc: e.target.value })}
                />
              </Field>
            )}
          </>
        )}

        <Toggle
          label="Fecha Venc"
          checked={f.vencimiento}
          onChange={(v) => set({ vencimiento: v })}
        />
        {f.vencimiento && (
          <>
            <Field label="Como se calcula">
              <select
                className="crm-select crm-select--sm"
                value={f.vencimientoMode}
                onChange={(e) =>
                  set({ vencimientoMode: e.target.value as VencimientoMode })
                }
              >
                <option value="DIA_MES_SIGUIENTE">Dia fijo del mes siguiente</option>
                <option value="FIJA">Fecha exacta</option>
              </select>
            </Field>
            {f.vencimientoMode === 'DIA_MES_SIGUIENTE' ? (
              <Field
                label="Dia del mes siguiente"
                hint="Se recalcula en cada periodo. Si el mes no tiene ese dia, se usa el ultimo."
              >
                <input
                  className="crm-input crm-input--sm"
                  type="number"
                  min={1}
                  max={31}
                  value={f.vencimientoDia}
                  onChange={(e) => set({ vencimientoDia: Number(e.target.value) || 1 })}
                />
              </Field>
            ) : (
              <Field label="Fecha de vencimiento">
                <input
                  className="crm-input crm-input--sm"
                  type="date"
                  value={f.vencimientoFecha}
                  onChange={(e) => set({ vencimientoFecha: e.target.value })}
                />
              </Field>
            )}
          </>
        )}

        {onCopy && (
          <>
            <hr className="crm-hr" style={{ margin: '4px 0' }} />
            <Button size="sm" onClick={() => onCopy(concept.id)}>
              Copiar estos campos a otros conceptos…
            </Button>
            <div className="crm-small crm-muted">
              Replica lo que acaba de escribir en las demas cuentas que llevan la
              misma informacion, sin volver a digitarla.
            </div>
          </>
        )}
      </div>
    </details>
  );
}

/** Interruptor con etiqueta, para las columnas de Kame. */
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="crm-row crm-small" style={{ gap: 8 }}>
      <input
        type="checkbox"
        className="crm-checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="crm-mono">{label}</span>
    </label>
  );
}
