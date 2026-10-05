/**
 * Navegacion entre las 5 vistas del asistente.
 */

import type { WizardStep } from '../types/payroll';

export const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'upload', label: 'Carga de remuneraciones' },
  { id: 'concepts', label: 'Configuracion de conceptos' },
  { id: 'validation', label: 'Validacion' },
  { id: 'preview', label: 'Previsualizacion' },
  { id: 'export', label: 'Resultado / descarga' },
];

/** Paso previo opcional: solo existe cuando hay catalogo de empresas. */
export const COMPANIES_STEP: { id: WizardStep; label: string } = {
  id: 'companies',
  label: 'Empresas',
};

/** Pasos efectivos del asistente segun si hay catalogo multiempresa. */
export function buildSteps(hasCompanies: boolean): { id: WizardStep; label: string }[] {
  return hasCompanies ? [COMPANIES_STEP, ...STEPS] : STEPS;
}

export function Stepper({
  current,
  maxReached,
  onGo,
  steps = STEPS,
}: {
  current: WizardStep;
  /** Ultimo paso habilitado (no se puede saltar hacia adelante sin datos). */
  maxReached: WizardStep;
  onGo: (step: WizardStep) => void;
  /** Pasos a mostrar. Por defecto los cinco del asistente. */
  steps?: { id: WizardStep; label: string }[];
}) {
  const currentIndex = steps.findIndex((s) => s.id === current);
  const maxIndex = steps.findIndex((s) => s.id === maxReached);

  return (
    <nav className="crm-stepper" aria-label="Etapas de la centralizacion">
      {steps.map((step, index) => {
        const classes = ['crm-step'];
        if (index === currentIndex) classes.push('crm-step--active');
        else if (index < currentIndex) classes.push('crm-step--done');

        return (
          <button
            key={step.id}
            type="button"
            className={classes.join(' ')}
            disabled={index > maxIndex}
            onClick={() => onGo(step.id)}
            aria-current={index === currentIndex ? 'step' : undefined}
          >
            <span className="crm-step__num">{index < currentIndex ? '✓' : index + 1}</span>
            <span className="crm-step__label">{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
