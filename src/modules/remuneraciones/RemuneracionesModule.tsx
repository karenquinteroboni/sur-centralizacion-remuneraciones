/**
 * ============================================================================
 *  RemuneracionesModule.tsx  —  PUNTO DE ENTRADA DEL MODULO
 * ----------------------------------------------------------------------------
 *  Este es el UNICO componente que el aplicativo anfitrion necesita importar:
 *
 *      import { RemuneracionesModule } from '@/modules/remuneraciones';
 *      <RemuneracionesModule />
 *
 *  Orquesta el estado del asistente y conecta las 5 vistas con el nucleo
 *  (core/*). Toda la logica contable vive en `core/`, de modo que esta capa
 *  puede reescribirse en otro framework sin tocar el motor.
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  CentralizationConfig,
  ConceptConfig,
  ConceptRow,
  PayrollBook,
  VoucherConfig,
  WizardStep,
} from './types/payroll';

import { parsePayrollWorkbook } from './core/excelParser';
import { analyzePayroll } from './core/payrollAnalyzer';
import {
  ConfigRepository,
  LocalStorageConfigRepository,
  buildConceptRows,
  buildWorkingConfig,
  exportConfigToJson,
  importConfigFromJson,
} from './core/configStore';
import { generateAccountingEntries } from './core/accountingEngine';
import {
  applyKameFieldsTo,
  buildDefaultKameFields,
  suggestCopyTargets,
  type KameFieldGroup,
} from './core/kameFields';
import { CopyKameFieldsDialog } from './components/CopyKameFields';
import { validateCentralization, type ValidationOptions } from './core/validationEngine';
import { generateKameCsv } from './core/kameExporter';

import { STEPS, Stepper, buildSteps } from './components/Stepper';
import { CompaniesPanel, type CompaniesFacet } from './components/CompaniesPanel';
import type { Company, CompanyRow } from './types/company';
import {
  buildCompanyRows,
  normalizeCatalog,
  previousPeriodCode,
  summarizePortfolio,
} from './core/companyRegistry';
import { UploadPayroll } from './components/UploadPayroll';
import { ConceptsTable } from './components/ConceptsTable';
import { ConceptConfigPanel } from './components/ConceptConfig';
import { ValidationPanel } from './components/ValidationPanel';
import { AccountingPreview } from './components/AccountingPreview';
import { ExportResult } from './components/ExportResult';
import { Alert, Button, Card } from './components/ui';

import './styles.css';

/* -------------------------------------------------------------------------- */
/*  PROPS PUBLICAS                                                            */
/* -------------------------------------------------------------------------- */

export interface RemuneracionesModuleProps {
  /**
   * Repositorio de configuracion. Por defecto usa localStorage.
   * El aplicativo anfitrion puede inyectar el suyo (API REST, IndexedDB...).
   */
  configRepository?: ConfigRepository;
  /** Opciones de validacion (formato de cuenta, tolerancia, modo administrador). */
  validationOptions?: ValidationOptions;
  /** Se invoca al generar el CSV. Util para auditoria o para subirlo a un backend. */
  onExported?: (payload: {
    fileName: string;
    content: string;
    rowCount: number;
    companyKey: string;
    period: string;
  }) => void;
  /** Se invoca cada vez que se guarda la configuracion de la empresa. */
  onConfigSaved?: (config: CentralizationConfig) => void;
  /** Oculta el encabezado del modulo (util al embeberlo dentro de otro layout). */
  hideHeader?: boolean;
  /** Titulo del encabezado. */
  title?: string;

  /* --- Multiempresa (opcional) ------------------------------------------ */
  /**
   * Catalogo de empresas de la cartera. Si se entrega, el asistente comienza
   * con el panel de empresas. Si se omite, el modulo funciona exactamente
   * igual que antes: se parte cargando un archivo.
   *
   * Acepta objetos `Company`, objetos laxos ({nombre, rut}) o strings.
   */
  companies?: (Company | string | Record<string, unknown>)[];
  /** Periodo de referencia AAAAMM. Por defecto, el mes anterior al actual. */
  referencePeriod?: string;
  /** Filtros adicionales del panel de empresas (responsable, grupo, etc.). */
  companyFacets?: CompaniesFacet[];
  /** Columna "Detalle" del panel de empresas. */
  renderCompanyExtra?: (row: CompanyRow) => React.ReactNode;
  /**
   * Se invoca al elegir una empresa. Permite al anfitrion, por ejemplo,
   * precargar el libro desde su propio almacenamiento.
   */
  onSelectCompany?: (row: CompanyRow) => void;
}

/* -------------------------------------------------------------------------- */

export function RemuneracionesModule({
  configRepository,
  validationOptions,
  onExported,
  onConfigSaved,
  hideHeader = false,
  title = 'Centralizacion de Remuneraciones',
  companies,
  referencePeriod,
  companyFacets,
  renderCompanyExtra,
  onSelectCompany,
}: RemuneracionesModuleProps = {}) {
  const repository = useMemo(
    () => configRepository ?? new LocalStorageConfigRepository(),
    [configRepository],
  );

  /* --- Catalogo multiempresa -------------------------------------------- */
  const catalog = useMemo(
    () => (companies && companies.length > 0 ? normalizeCatalog(companies) : null),
    [companies],
  );
  const hasCompanies = catalog !== null;
  const steps = useMemo(() => buildSteps(hasCompanies), [hasCompanies]);
  const firstStep: WizardStep = hasCompanies ? 'companies' : 'upload';
  const period = referencePeriod ?? previousPeriodCode();

  const [companyRows, setCompanyRows] = useState<CompanyRow[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyRow | null>(null);
  const [companiesVersion, setCompaniesVersion] = useState(0);

  /* --- Estado ----------------------------------------------------------- */
  const [step, setStep] = useState<WizardStep>(firstStep);
  const [maxStep, setMaxStep] = useState<WizardStep>(firstStep);

  const [book, setBook] = useState<PayrollBook | null>(null);
  const [config, setConfig] = useState<CentralizationConfig | null>(null);
  const [newConceptIds, setNewConceptIds] = useState<Set<string>>(new Set());
  const [reusedExisting, setReusedExisting] = useState(false);

  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [configSaved, setConfigSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const importInputRef = useRef<HTMLInputElement>(null);

  /* --- Copia de campos Kame entre conceptos ------------------------------ */
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  /**
   * Instantanea previa a la ultima aplicacion masiva. Permite deshacer: un clic
   * puede reescribir decenas de conceptos y rehacerlos a mano seria costoso.
   */
  const [kameUndo, setKameUndo] = useState<{
    concepts: Record<string, ConceptConfig>;
    count: number;
  } | null>(null);

  /* --- Analisis derivado (memoizado) ------------------------------------ */
  const analyses = useMemo(() => (book ? analyzePayroll(book) : {}), [book]);

  const conceptRows: ConceptRow[] = useMemo(
    () => (book && config ? buildConceptRows(book, analyses, config, newConceptIds) : []),
    [book, config, analyses, newConceptIds],
  );

  const accounting = useMemo(
    () => (book && config ? generateAccountingEntries(book, config) : null),
    [book, config],
  );

  const report = useMemo(
    () =>
      book && config && accounting
        ? validateCentralization(book, config, analyses, accounting, validationOptions)
        : null,
    [book, config, analyses, accounting, validationOptions],
  );

  const csv = useMemo(
    () => (book && config && accounting ? generateKameCsv(accounting, config, book) : null),
    [book, config, accounting],
  );

  /* --- Carga del estado de la cartera ------------------------------------ */
  useEffect(() => {
    if (!catalog) return;
    let cancelled = false;
    void (async () => {
      const rows = await buildCompanyRows(catalog, repository);
      if (!cancelled) setCompanyRows(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [catalog, repository, companiesVersion]);

  const portfolio = useMemo(
    () => summarizePortfolio(companyRows, period),
    [companyRows, period],
  );

  /* --- Navegacion -------------------------------------------------------- */
  const goTo = useCallback(
    (target: WizardStep) => {
      setStep(target);
      setMaxStep((prev) => {
        const a = steps.findIndex((s) => s.id === prev);
        const b = steps.findIndex((s) => s.id === target);
        return b > a ? target : prev;
      });
    },
    [steps],
  );

  const handleSelectCompany = useCallback(
    (row: CompanyRow) => {
      setSelectedCompany(row);
      setNotice(null);
      onSelectCompany?.(row);
      goTo('upload');
    },
    [goTo, onSelectCompany],
  );

  /* --- Carga del archivo -------------------------------------------------- */
  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setReadError(null);
      setConfigSaved(false);
      try {
        const buffer = await file.arrayBuffer();
        const parsed = parsePayrollWorkbook(buffer, { fileName: file.name });
        if (parsed.concepts.length === 0) {
          throw new Error('No se detectaron conceptos en el archivo.');
        }

        const parsedAnalyses = analyzePayroll(parsed);
        const key = parsed.meta.companyRut
          ? parsed.meta.companyRut.replace(/\./g, '')
          : (parsed.meta.companyName || parsed.meta.sheetName || 'SIN_EMPRESA')
              .toUpperCase()
              .replace(/\s+/g, '_')
              .slice(0, 60);

        // SALVAGUARDA: si se eligio una empresa en el panel, el RUT del libro
        // debe coincidir. Evita centralizar el libro equivocado en una cartera
        // de decenas de empresas.
        if (selectedCompany?.company.rut && parsed.meta.companyRut) {
          const esperado = selectedCompany.company.rut.replace(/\./g, '').toUpperCase();
          const encontrado = parsed.meta.companyRut.replace(/\./g, '').toUpperCase();
          if (esperado !== encontrado) {
            throw new Error(
              `El libro pertenece a ${parsed.meta.companyName || 'otra empresa'} ` +
                `(RUT ${parsed.meta.companyRut}), pero usted eligio ` +
                `${selectedCompany.company.name} (RUT ${selectedCompany.company.rut}). ` +
                `Verifique el archivo o vuelva al panel y seleccione la empresa correcta.`,
            );
          }
        }

        const existing = await repository.load(key);
        const built = buildWorkingConfig(parsed, parsedAnalyses, existing);

        setBook(parsed);
        setConfig(built.config);
        setNewConceptIds(new Set(built.newConceptIds));
        setReusedExisting(built.reusedExisting);
        setSelectedConceptId(null);

        if (built.reusedExisting) {
          setNotice(
            built.newConceptIds.length > 0
              ? `Se reutilizo la configuracion guardada de esta empresa. Se detectaron ${built.newConceptIds.length} concepto(s) nuevo(s) que requieren parametrizacion.`
              : 'Se reutilizo la configuracion guardada de esta empresa.',
          );
        } else {
          setNotice(null);
        }
      } catch (e) {
        setBook(null);
        setConfig(null);
        setReadError(
          e instanceof Error
            ? e.message
            : 'Ocurrio un error inesperado al procesar el archivo.',
        );
      } finally {
        setLoading(false);
      }
    },
    [repository, selectedCompany],
  );

  /* --- Edicion de conceptos ---------------------------------------------- */
  const patchConcept = useCallback((conceptId: string, patch: Partial<ConceptConfig>) => {
    setConfigSaved(false);
    setConfig((prev) => {
      if (!prev) return prev;
      const current = prev.concepts[conceptId];
      if (!current) return prev;
      const next: ConceptConfig = { ...current, ...patch };

      // Al pasar a APORTE_EMPLEADOR se preparan las dos cuentas.
      if (patch.classification === 'APORTE_EMPLEADOR') {
        next.expenseAccount = next.expenseAccount ?? next.account ?? '';
        next.liabilityAccount = next.liabilityAccount ?? '';
      }
      // Los totalizadores e informativos se excluyen automaticamente.
      if (patch.classification === 'TOTALIZADOR' || patch.classification === 'INFORMATIVO') {
        next.include = false;
      }
      // Al cambiar la modalidad de tercero se reajustan los campos Kame SOLO
      // si el usuario aun no los habia tocado: asi "por trabajador" enciende
      // la ficha sola, sin pisar una parametrizacion hecha a mano.
      if (patch.thirdPartyMode && patch.thirdPartyMode !== current.thirdPartyMode) {
        const previousDefaults = buildDefaultKameFields(current.thirdPartyMode);
        const untouched =
          !current.kameFields ||
          JSON.stringify(current.kameFields) === JSON.stringify(previousDefaults);
        if (untouched) next.kameFields = buildDefaultKameFields(patch.thirdPartyMode);
      }
      return { ...prev, concepts: { ...prev.concepts, [conceptId]: next } };
    });
  }, []);

  const patchBulk = useCallback(
    (patch: Partial<ConceptConfig>, filter?: (row: ConceptRow) => boolean) => {
      setConfigSaved(false);
      setConfig((prev) => {
        if (!prev) return prev;
        const concepts = { ...prev.concepts };
        for (const row of conceptRows) {
          if (filter && !filter(row)) continue;
          const current = concepts[row.concept.id];
          if (!current) continue;
          concepts[row.concept.id] = { ...current, ...patch };
        }
        return { ...prev, concepts };
      });
    },
    [conceptRows],
  );

  const applyKameFieldsToTargets = useCallback(
    (targetIds: string[], groups: KameFieldGroup[]) => {
      if (!copySourceId) return;
      setConfig((prev) => {
        if (!prev) return prev;
        const result = applyKameFieldsTo(prev.concepts, copySourceId, targetIds, groups);
        if (result.appliedTo.length === 0) return prev;
        // Se guarda el estado anterior ANTES de reemplazarlo, para poder volver.
        setKameUndo({ concepts: prev.concepts, count: result.appliedTo.length });
        return { ...prev, concepts: result.concepts };
      });
      setConfigSaved(false);
      setCopySourceId(null);
    },
    [copySourceId],
  );

  const undoKameFields = useCallback(() => {
    setConfig((prev) => (prev && kameUndo ? { ...prev, concepts: kameUndo.concepts } : prev));
    setKameUndo(null);
    setConfigSaved(false);
  }, [kameUndo]);

  const patchVoucher = useCallback((patch: Partial<VoucherConfig>) => {
    setConfigSaved(false);
    setConfig((prev) => (prev ? { ...prev, voucher: { ...prev.voucher, ...patch } } : prev));
  }, []);

  /* --- Persistencia ------------------------------------------------------- */
  const saveConfig = useCallback(async () => {
    if (!config) return;
    const toSave: CentralizationConfig = { ...config, updatedAt: new Date().toISOString() };
    await repository.save(toSave);
    setConfigSaved(true);
    setCompaniesVersion((v) => v + 1); // refresca el estado del panel de empresas
    onConfigSaved?.(toSave);
  }, [config, repository, onConfigSaved]);

  const exportConfig = useCallback(() => {
    if (!config) return;
    const blob = new Blob([exportConfigToJson(config)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `configuracion_${config.companyKey}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [config]);

  const importConfig = useCallback(
    async (file: File) => {
      if (!book) return;
      try {
        const text = await file.text();
        const imported = importConfigFromJson(text);
        const built = buildWorkingConfig(book, analyses, imported);
        setConfig(built.config);
        setNewConceptIds(new Set(built.newConceptIds));
        setNotice(
          built.newConceptIds.length > 0
            ? `Configuracion importada. ${built.newConceptIds.length} concepto(s) del libro no estaban en el archivo y requieren parametrizacion.`
            : 'Configuracion importada correctamente.',
        );
        setConfigSaved(false);
      } catch (e) {
        setNotice(
          e instanceof Error ? `No se pudo importar: ${e.message}` : 'No se pudo importar el archivo.',
        );
      }
    },
    [book, analyses],
  );

  /* --- Exportacion -------------------------------------------------------- */
  useEffect(() => {
    if (step !== 'export' || !csv || !config || !book) return;
    onExported?.({
      fileName: csv.fileName,
      content: csv.content,
      rowCount: csv.rowCount,
      companyKey: config.companyKey,
      period: book.meta.periodCode,
    });
    // Se notifica una sola vez por combinacion archivo/paso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, csv?.fileName, csv?.rowCount]);

  const reset = useCallback(() => {
    setBook(null);
    setConfig(null);
    setNewConceptIds(new Set());
    setSelectedConceptId(null);
    setReadError(null);
    setNotice(null);
    setConfigSaved(false);
    setSelectedCompany(null);
    setCompaniesVersion((v) => v + 1);
    setStep(firstStep);
    setMaxStep(firstStep);
  }, [firstStep]);

  const selectedRow = useMemo(
    () => conceptRows.find((r) => r.concept.id === selectedConceptId) ?? null,
    [conceptRows, selectedConceptId],
  );

  const copySource = useMemo(
    () => conceptRows.find((r) => r.concept.id === copySourceId) ?? null,
    [conceptRows, copySourceId],
  );

  /** Destinos posibles: conceptos contabilizables distintos del origen. */
  const copyCandidates = useMemo(
    () =>
      conceptRows.filter(
        (r) =>
          r.concept.id !== copySourceId &&
          r.config.classification !== null &&
          r.config.classification !== 'TOTALIZADOR' &&
          r.config.classification !== 'INFORMATIVO',
      ),
    [conceptRows, copySourceId],
  );

  const copySuggested = useMemo(
    () => (config && copySourceId ? suggestCopyTargets(config.concepts, copySourceId) : []),
    [config, copySourceId],
  );

  /* --- Render ------------------------------------------------------------- */
  return (
    <div className="crm-root">
      <div className="crm-shell">
        {!hideHeader && (
          <header className="crm-header">
            <div>
              <h2 className="crm-title">{title}</h2>
              <p className="crm-subtitle">
                Libro de remuneraciones → asiento contable → archivo de importacion Kame.
                El procesamiento se realiza integramente en su navegador.
              </p>
            </div>
            <div className="crm-row">
              {book && (
                <span className="crm-small crm-muted">
                  {book.meta.companyName} · {book.meta.periodLabel} · {book.workers.length} trabajadores
                </span>
              )}
              {hasCompanies && step !== 'companies' && (
                <Button size="sm" onClick={() => goTo('companies')}>
                  ← Cartera de empresas
                </Button>
              )}
              {book && <Button size="sm" onClick={reset}>Reiniciar</Button>}
            </div>
          </header>
        )}

        <Stepper current={step} maxReached={maxStep} onGo={goTo} steps={steps} />

        {notice && (
          <Alert tone="info" title="Configuracion">
            {notice}
          </Alert>
        )}

        {kameUndo && step === 'concepts' && (
          <Alert tone="ok" title="Campos aplicados">
            <span className="crm-row" style={{ gap: 10 }}>
              <span className="crm-small">
                Se copiaron los campos a {kameUndo.count} concepto
                {kameUndo.count === 1 ? '' : 's'}.
              </span>
              <Button size="sm" onClick={undoKameFields}>
                Deshacer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setKameUndo(null)}>
                Descartar aviso
              </Button>
            </span>
          </Alert>
        )}

        {/* --- VISTA 0: cartera de empresas --- */}
        {step === 'companies' && catalog && (
          <CompaniesPanel
            rows={companyRows}
            summary={portfolio}
            referencePeriod={period}
            onSelectCompany={handleSelectCompany}
            facets={companyFacets}
            renderExtra={renderCompanyExtra}
          />
        )}

        {/* --- VISTA 1 --- */}
        {step === 'upload' && selectedCompany && (
          <Alert tone="info" title={`Empresa seleccionada: ${selectedCompany.company.name}`}>
            <span className="crm-small">
              RUT {selectedCompany.company.rut ?? '—'}
              {selectedCompany.company.group && <> · {selectedCompany.company.group}</>}
              {' · '}
              Se verificara que el libro cargado corresponda a este RUT.{' '}
              <button
                type="button"
                className="crm-btn crm-btn--ghost crm-btn--sm"
                onClick={() => goTo('companies')}
              >
                cambiar empresa
              </button>
            </span>
          </Alert>
        )}

        {step === 'upload' && (
          <UploadPayroll
            onFileSelected={handleFile}
            loading={loading}
            error={readError}
            book={book}
            onContinue={() => goTo('concepts')}
            onReset={reset}
          />
        )}

        {/* --- VISTA 2 --- */}
        {step === 'concepts' && book && config && (
          <>
            <Card
              title="2. Configuracion de conceptos"
              description="Defina que conceptos se contabilizan, su clasificacion, la cuenta contable y si se registran consolidados o por trabajador."
              actions={
                <div className="crm-row">
                  <Button size="sm" onClick={() => importInputRef.current?.click()}>
                    Importar configuracion
                  </Button>
                  <Button size="sm" onClick={saveConfig}>
                    {configSaved ? '✓ Guardada' : 'Guardar configuracion'}
                  </Button>
                  <input
                    ref={importInputRef}
                    className="crm-file-input"
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importConfig(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              }
            >
              {reusedExisting && newConceptIds.size > 0 && (
                <Alert tone="warn" title="Nuevos conceptos detectados: requieren parametrizacion">
                  {[...newConceptIds]
                    .map((id) => book.concepts.find((c) => c.id === id)?.label ?? id)
                    .join(', ')}
                  . No se asumio ninguna cuenta contable para ellos.
                </Alert>
              )}

              <div className="crm-split">
                <ConceptsTable
                  rows={conceptRows}
                  selectedId={selectedConceptId}
                  onSelect={setSelectedConceptId}
                  onChange={patchConcept}
                  onBulk={patchBulk}
                />
                <ConceptConfigPanel
                  row={selectedRow}
                  voucher={config.voucher}
                  config={config}
                  onChangeConcept={patchConcept}
                  onChangeVoucher={patchVoucher}
                  onCopyKameFields={setCopySourceId}
                />
              </div>
            </Card>

            <div className="crm-row">
              <Button onClick={() => goTo('upload')}>← Volver a la carga</Button>
              <div className="crm-spacer" />
              <Button variant="primary" onClick={() => goTo('validation')}>
                Continuar a validacion →
              </Button>
            </div>
          </>
        )}

        {/* --- VISTA 3 --- */}
        {step === 'validation' && report && (
          <ValidationPanel
            report={report}
            onGoToConcepts={() => goTo('concepts')}
            onContinue={() => goTo('preview')}
            onFocusConcept={(id) => {
              setSelectedConceptId(id);
              goTo('concepts');
            }}
          />
        )}

        {/* --- VISTA 4 --- */}
        {step === 'preview' && accounting && config && (
          <AccountingPreview
            accounting={accounting}
            config={config}
            canExport={report?.canExport ?? false}
            onBack={() => goTo('validation')}
            onContinue={() => goTo('export')}
          />
        )}

        {/* --- VISTA 5 --- */}
        {step === 'export' && csv && book && config && accounting && (
          <ExportResult
            csv={csv}
            book={book}
            config={config}
            totalDebit={accounting.totalDebit}
            totalCredit={accounting.totalCredit}
            onBack={() => goTo('preview')}
            onRestart={reset}
            onSaveConfig={saveConfig}
            onExportConfig={exportConfig}
            configSaved={configSaved}
          />
        )}
      </div>

      {copySource && (
        <CopyKameFieldsDialog
          source={copySource}
          candidates={copyCandidates}
          suggestedIds={copySuggested}
          onApply={applyKameFieldsToTargets}
          onClose={() => setCopySourceId(null)}
        />
      )}
    </div>
  );
}

export default RemuneracionesModule;
