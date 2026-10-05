/**
 * VISTA 5 — Resultado y descarga del archivo Kame.
 */

import { useMemo } from 'react';
import type { CentralizationConfig, KameExportResult, PayrollBook } from '../types/payroll';
import { verifyKameStructure } from '../core/kameExporter';
import { createCsvBlob, downloadFile } from '../utils/csvUtils';
import { formatCLP } from '../utils/numberUtils';
import { Alert, Button, Card, Stat } from './ui';

export interface ExportResultProps {
  csv: KameExportResult;
  book: PayrollBook;
  config: CentralizationConfig;
  totalDebit: number;
  totalCredit: number;
  onBack: () => void;
  onRestart: () => void;
  onSaveConfig: () => void;
  onExportConfig: () => void;
  configSaved: boolean;
}

export function ExportResult({
  csv,
  book,
  config,
  totalDebit,
  totalCredit,
  onBack,
  onRestart,
  onSaveConfig,
  onExportConfig,
  configSaved,
}: ExportResultProps) {
  const check = useMemo(() => verifyKameStructure(csv.content), [csv.content]);

  const preview = useMemo(() => {
    const lines = csv.content.split('\r\n').filter(Boolean);
    const head = lines.slice(0, 12);
    if (lines.length > 12) head.push(`… (${lines.length - 12} filas mas)`);
    return head.join('\n');
  }, [csv.content]);

  const download = (encoding: 'latin1' | 'utf8') => {
    void downloadFile(createCsvBlob(csv.content, encoding), csv.fileName);
  };

  return (
    <>
      <div className="crm-verdict crm-verdict--ok">
        <span style={{ fontSize: 22 }}>✓</span>
        <span>ARCHIVO DE IMPORTACION KAME GENERADO</span>
      </div>

      <div className="crm-grid" style={{ marginBottom: 18 }}>
        <Stat label="Filas generadas" value={csv.rowCount} />
        <Stat label="Columnas" value={check.columnCount} hint="Estructura Kame" />
        <Stat label="Total Debe" value={formatCLP(totalDebit)} />
        <Stat label="Total Haber" value={formatCLP(totalCredit)} />
      </div>

      <Card
        title="Descargar"
        description={`Nombre del archivo: ${csv.fileName}`}
        actions={
          <div className="crm-row">
            <Button variant="primary" onClick={() => download('latin1')}>
              ⬇ Descargar CSV para Kame
            </Button>
          </div>
        }
      >
        {check.ok ? (
          <Alert tone="ok" title="La estructura del archivo cumple el formato de Kame">
            17 columnas en el orden exacto, separador «;», saltos CRLF, codificacion ISO-8859-1,
            fechas d/MM/yyyy e importes enteros.
          </Alert>
        ) : (
          <Alert tone="error" title="La estructura del archivo presenta problemas">
            <ul className="crm-small" style={{ margin: '6px 0 0 16px' }}>
              {check.problems.slice(0, 8).map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </Alert>
        )}

        <div className="crm-row" style={{ marginTop: 10 }}>
          <Button size="sm" onClick={() => download('utf8')} title="Solo para revisar en Excel: Kame espera ISO-8859-1">
            Descargar copia en UTF-8 (revision)
          </Button>
          <Button
            size="sm"
            onClick={() => navigator.clipboard?.writeText(csv.content)}
            title="Copia el contenido al portapapeles"
          >
            Copiar contenido
          </Button>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="crm-label" style={{ marginBottom: 6 }}>Vista previa del archivo</div>
          <pre className="crm-code">{preview}</pre>
        </div>
      </Card>

      <Card
        title="Guardar la parametrizacion de esta empresa"
        description="La proxima vez que cargue un libro de esta empresa, el sistema reutilizara automaticamente estas cuentas y clasificaciones."
        actions={
          <div className="crm-row">
            <Button size="sm" onClick={onExportConfig}>Exportar configuracion (.json)</Button>
            <Button size="sm" variant={configSaved ? 'default' : 'primary'} onClick={onSaveConfig}>
              {configSaved ? '✓ Configuracion guardada' : 'Guardar configuracion'}
            </Button>
          </div>
        }
      >
        <div className="crm-small crm-muted">
          Empresa <strong>{config.companyName || '—'}</strong>
          {book.meta.companyRut && <> · RUT {book.meta.companyRut}</>} · clave interna{' '}
          <span className="crm-mono">{config.companyKey}</span> ·{' '}
          {Object.keys(config.concepts).length} conceptos parametrizados.
        </div>
      </Card>

      <div className="crm-row">
        <Button onClick={onBack}>← Volver a previsualizacion</Button>
        <div className="crm-spacer" />
        <Button onClick={onRestart}>Procesar otro libro</Button>
      </div>
    </>
  );
}
