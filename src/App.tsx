/**
 * Aplicacion demo que aloja el modulo, con el catalogo real de empresas.
 *
 * NOTA DE INTEGRACION: este archivo NO forma parte del modulo. Existe solo
 * para ejecutarlo de forma aislada. Al integrarlo en el aplicativo de
 * conciliacion se copia unicamente `src/modules/remuneraciones/`, y el
 * catalogo de empresas se obtiene del backend en lugar de un archivo estatico.
 */

import { useEffect, useMemo } from 'react';
import {
  RemuneracionesModule,
  setFileSaver,
  type CompaniesFacet,
  type CompanyRow,
} from './modules/remuneraciones';
import {
  EMPRESAS_SUR,
  adpInconsistente,
  tieneRemuneraciones,
  type EmpresaSur,
} from './demo/empresasSur';

/** Solo las empresas con servicio ADP centralizan remuneraciones. */
const EMPRESAS = EMPRESAS_SUR.filter(tieneRemuneraciones);

/** Acceso tipado a los campos propios del catalogo de Sur. */
function asSur(row: CompanyRow): EmpresaSur {
  return row.company as EmpresaSur;
}

/**
 * Cuando la pagina se publica como Artifact de claude.ai, el visor bloquea la
 * descarga directa (`<a download>`) y la ruta correcta es la capacidad
 * `downloads`. Se conecta desde AQUI, no desde el modulo: el modulo solo
 * expone el punto de extension `setFileSaver`.
 *
 * En un navegador normal `claude.use` no existe, no se instala nada y el
 * modulo descarga como siempre.
 */
function useArtifactDownloads() {
  useEffect(() => {
    const claude = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } })
      .claude;
    if (!claude?.use) return;

    let cancelled = false;
    void claude.use('downloads').then((ns) => {
      const downloads = ns as {
        save: (r: { filename: string; data: Blob }) => Promise<unknown>;
      } | null;
      if (!downloads || cancelled) return;

      setFileSaver(async (blob, fileName) => {
        try {
          // El Blob se COPIA (no se transfiere), asi que puede reutilizarse.
          await downloads.save({ filename: fileName, data: blob });
        } catch (e) {
          const code = (e as { code?: string })?.code;
          if (code === 'extension_not_enabled') {
            // .csv puede no estar habilitado en esta vista: se ofrece .txt,
            // que tiene exactamente el mismo contenido.
            await downloads.save({
              filename: fileName.replace(/\.csv$/i, '.csv.txt'),
              data: blob,
            });
            return;
          }
          if (code === 'declined' || code === 'rate_limited') return; // el usuario decidio
          throw e;
        }
      });
    });

    return () => {
      cancelled = true;
      setFileSaver(null);
    };
  }, []);
}

export default function App() {
  useArtifactDownloads();

  /** Filtros por responsable de ADP, grupo y complejidad. */
  const facets = useMemo<CompaniesFacet[]>(() => {
    const responsables = [...new Set(EMPRESAS.map((e) => e.adp).filter(Boolean))].sort();
    const grupos = [...new Set(EMPRESAS.map((e) => e.group).filter(Boolean))].sort() as string[];
    const complejidades = [...new Set(EMPRESAS.map((e) => e.complejidad))].sort();

    return [
      {
        id: 'adp',
        label: 'Responsable ADP',
        options: responsables.map((r) => ({
          value: String(r),
          label: String(r),
          match: (row) => asSur(row).adp === r,
        })),
      },
      {
        id: 'grupo',
        label: 'Grupo',
        options: grupos.map((g) => ({
          value: g,
          label: g,
          match: (row) => row.company.group === g,
        })),
      },
      {
        id: 'complejidad',
        label: 'Complejidad',
        options: complejidades.map((c) => ({
          value: c,
          label: c,
          match: (row) => asSur(row).complejidad === c,
        })),
      },
    ];
  }, []);

  return (
    <RemuneracionesModule
      title="Centralizacion de Remuneraciones · Sur Consulting"
      companies={EMPRESAS}
      companyFacets={facets}
      renderCompanyExtra={(row) => {
        const e = asSur(row);
        return (
          <>
            <div>
              <span className="crm-muted">ADP:</span>{' '}
              <strong>{e.adp ?? 'sin asignar'}</strong>
              {adpInconsistente(e) && (
                <span
                  title="El codigo de servicio y el responsable de ADP no coinciden en el maestro de empresas."
                  style={{ color: 'var(--crm-warn)', marginLeft: 6 }}
                >
                  ⚠
                </span>
              )}
            </div>
            <div className="crm-muted">
              Contab.: {e.contabilidad ?? '—'} · {e.complejidad}
            </div>
          </>
        );
      }}
      onExported={(payload) => {
        // Ejemplo de enganche con el aplicativo anfitrion (auditoria, backend...).
        // Se registran solo metadatos, nunca datos personales.
        console.info(
          `[centralizacion] ${payload.fileName} · ${payload.rowCount} filas · periodo ${payload.period}`,
        );
      }}
    />
  );
}
