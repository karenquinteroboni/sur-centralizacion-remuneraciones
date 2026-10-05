/**
 * Componentes de presentacion basicos y reutilizables.
 * Sin logica de negocio: solo presentacion.
 */

import type { ReactNode } from 'react';
import type { ConceptStatus, ValidationSeverity } from '../types/payroll';

/* -------------------------------------------------------------------------- */

export function Card({
  title,
  description,
  actions,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="crm-card">
      {(title || actions) && (
        <div className="crm-row" style={{ marginBottom: description ? 2 : 12 }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            {title && <h3 className="crm-card__title">{title}</h3>}
          </div>
          {actions}
        </div>
      )}
      {description && <p className="crm-card__desc">{description}</p>}
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function Button({
  children,
  onClick,
  variant = 'default',
  size,
  disabled,
  type = 'button',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost';
  size?: 'sm';
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}) {
  const classes = ['crm-btn'];
  if (variant === 'primary') classes.push('crm-btn--primary');
  if (variant === 'ghost') classes.push('crm-btn--ghost');
  if (size === 'sm') classes.push('crm-btn--sm');
  return (
    <button
      type={type}
      className={classes.join(' ')}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

export function Badge({
  children,
  tone = 'muted',
  title,
}: {
  children: ReactNode;
  tone?: 'muted' | 'ok' | 'warn' | 'error' | 'info';
  title?: string;
}) {
  const cls = tone === 'muted' ? 'crm-badge' : `crm-badge crm-badge--${tone}`;
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

/** Semaforo de estado de un concepto: verde / amarillo / rojo / gris. */
export function StatusBadge({ status }: { status: ConceptStatus }) {
  switch (status) {
    case 'OK':
      return <Badge tone="ok" title="Listo para contabilizar">Correcto</Badge>;
    case 'PENDING':
      return <Badge tone="warn" title="Falta cuenta o clasificacion">Requiere configuracion</Badge>;
    case 'NEW':
      return <Badge tone="warn" title="Concepto nuevo: requiere parametrizacion">Nuevo concepto</Badge>;
    case 'ERROR':
      return <Badge tone="error">Error</Badge>;
    case 'EXCLUDED':
    default:
      return <Badge title="No genera movimiento contable">Excluido</Badge>;
  }
}

export function SeverityBadge({ severity }: { severity: ValidationSeverity }) {
  if (severity === 'ERROR') return <Badge tone="error">Error</Badge>;
  if (severity === 'WARNING') return <Badge tone="warn">Advertencia</Badge>;
  return <Badge tone="info">Info</Badge>;
}

/* -------------------------------------------------------------------------- */

export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: 'ok' | 'error';
  hint?: string;
}) {
  const cls = tone ? `crm-stat crm-stat--${tone}` : 'crm-stat';
  return (
    <div className={cls}>
      <div className="crm-stat__label">{label}</div>
      <div className="crm-stat__value">{value}</div>
      {hint && <div className="crm-small crm-muted" style={{ marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'ok' | 'warn' | 'error';
  title?: ReactNode;
  children?: ReactNode;
}) {
  const icon = tone === 'ok' ? '✓' : tone === 'error' ? '✕' : tone === 'warn' ? '!' : 'i';
  return (
    <div className={`crm-alert crm-alert--${tone}`}>
      <span className="crm-alert__icon">{icon}</span>
      <div className="crm-alert__body">
        {title && <div className="crm-alert__title">{title}</div>}
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="crm-field">
      <label className="crm-label">{label}</label>
      {children}
      {hint && <div className="crm-small crm-muted">{hint}</div>}
    </div>
  );
}
