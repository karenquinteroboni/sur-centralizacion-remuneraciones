/**
 * VISTA 1 — Carga del libro de remuneraciones.
 *
 * El archivo se lee ENTERAMENTE en el navegador (FileReader + SheetJS).
 * No se sube a ningun servidor y no se registran datos personales en consola.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PayrollBook } from '../types/payroll';
import type { BukCompanyOption } from '../core/buk/bukSource';
import { Alert, Button, Card, Stat } from './ui';

export interface UploadPayrollProps {
  onFileSelected: (file: File) => void;
  /** Empresas con Buk configurado en el servidor. Vacio = no se muestra la opcion. */
  bukCompanies?: BukCompanyOption[];
  onFetchBuk?: (companyId: string, period: string) => void;
  loading: boolean;
  error: string | null;
  book: PayrollBook | null;
  onContinue: () => void;
  onReset: () => void;
}

const ACCEPTED = '.xlsx,.xlsm,.xls,.csv';

export function UploadPayroll({
  onFileSelected,
  bukCompanies = [],
  onFetchBuk,
  loading,
  error,
  book,
  onContinue,
  onReset,
}: UploadPayrollProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [bukCompany, setBukCompany] = useState('');
  useEffect(() => {
    if (bukCompanies.length === 1) setBukCompany(bukCompanies[0].id);
  }, [bukCompanies]);
  const [bukPeriod, setBukPeriod] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1); // mes anterior: el que normalmente se centraliza
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected],
  );

  return (
    <>
      <Card
        title="1. Cargue el libro de remuneraciones"
        description="Arrastre el archivo Excel o seleccionelo. El analisis se realiza integramente en su navegador: el archivo no se envia a ningun servidor."
      >
        <div
          className={dragging ? 'crm-drop crm-drop--active' : 'crm-drop'}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
        >
          <div className="crm-drop__icon">{loading ? '⏳' : '📄'}</div>
          <div className="crm-drop__title">
            {loading ? 'Analizando el libro...' : 'Arrastre el archivo aqui o haga clic para seleccionarlo'}
          </div>
          <div className="crm-drop__hint">Formatos aceptados: {ACCEPTED}</div>
          <input
            ref={inputRef}
            className="crm-file-input"
            type="file"
            accept={ACCEPTED}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {error && (
          <div style={{ marginTop: 14 }}>
            <Alert tone="error" title="No fue posible leer el archivo">
              {error}
            </Alert>
          </div>
        )}
      </Card>

      {bukCompanies.length > 0 && onFetchBuk && (
        <Card
          title="O traiga los datos directamente desde Buk"
          description="Solo se leen liquidaciones cerradas. El token de Buk permanece en el servidor."
        >
          <div className="crm-row" style={{ alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <label className="crm-field">
              <span className="crm-small crm-muted">Empresa</span>
              <select
                className="crm-select"
                value={bukCompany}
                onChange={(e) => setBukCompany(e.target.value)}
              >
                <option value="">Seleccione...</option>
                {bukCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || c.id}</option>
                ))}
              </select>
            </label>
            <label className="crm-field">
              <span className="crm-small crm-muted">Periodo</span>
              <input
                className="crm-input"
                type="month"
                value={bukPeriod}
                onChange={(e) => setBukPeriod(e.target.value)}
              />
            </label>
            <Button
              variant="primary"
              disabled={loading || !bukCompany || !/^\d{4}-\d{2}$/.test(bukPeriod)}
              onClick={() => onFetchBuk(bukCompany, bukPeriod)}
            >
              {loading ? 'Consultando Buk...' : 'Traer desde Buk'}
            </Button>
          </div>
        </Card>
      )}

      {book && (
        <Card
          title="Datos detectados"
          actions={
            <div className="crm-row">
              <Button variant="ghost" onClick={onReset}>Cargar otro archivo</Button>
              <Button variant="primary" onClick={onContinue}>
                Continuar a configuracion →
              </Button>
            </div>
          }
        >
          <div className="crm-grid" style={{ marginBottom: 16 }}>
            <Stat label="Empresa" value={<span style={{ fontSize: 15 }}>{book.meta.companyName || '—'}</span>} hint={book.meta.companyRut || 'Sin RUT detectado'} />
            <Stat label="Periodo" value={<span style={{ fontSize: 15 }}>{book.meta.periodLabel || '—'}</span>} hint={book.meta.periodCode ? `Codigo ${book.meta.periodCode}` : 'Sin codigo'} />
            <Stat label="Trabajadores" value={book.workers.length} />
            <Stat label="Conceptos detectados" value={book.concepts.length} />
          </div>

          <div className="crm-small crm-muted" style={{ marginBottom: 12 }}>
            {book.meta.sourceFileName.startsWith('buk:') ? (
              <>Fuente: <strong>API de Buk</strong> (liquidaciones cerradas) · sin fila de totales</>
            ) : (
              <>
                Hoja <strong>{book.meta.sheetName}</strong> · fila de titulos detectada:{' '}
                <strong>{book.meta.headerRowIndex + 1}</strong> ·{' '}
                {book.meta.totalsRowIndex !== null
                  ? <>fila de totales: <strong>{book.meta.totalsRowIndex + 1}</strong></>
                  : 'sin fila de totales'}
              </>
            )}
          </div>

          {book.warnings.map((w, i) => (
            <Alert key={i} tone="warn" title="Aviso de lectura">{w}</Alert>
          ))}

          <details style={{ marginTop: 12 }}>
            <summary className="crm-small crm-muted" style={{ cursor: 'pointer' }}>
              Ver las primeras filas leidas (verificacion de la deteccion)
            </summary>
            <div className="crm-table-wrap" style={{ marginTop: 10 }}>
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>RUT</th>
                    <th>Nombre</th>
                    <th>Cargo</th>
                    {book.concepts.slice(0, 4).map((c) => (
                      <th key={c.id} className="crm-num">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {book.workers.slice(0, 5).map((w) => (
                    <tr key={w.rowIndex}>
                      <td className="crm-mono">{w.rut || '—'}</td>
                      <td className="crm-truncate">{w.fullName}</td>
                      <td className="crm-truncate crm-muted">{w.position || '—'}</td>
                      {book.concepts.slice(0, 4).map((c) => (
                        <td key={c.id} className="crm-num">
                          {(w.amounts[c.id] ?? 0).toLocaleString('es-CL')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="crm-small crm-muted" style={{ marginTop: 6 }}>
              Solo se muestran 5 filas y 4 conceptos a modo de verificacion.
            </div>
          </details>
        </Card>
      )}
    </>
  );
}
