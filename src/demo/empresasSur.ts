/**
 * ============================================================================
 *  CATALOGO DE EMPRESAS — SUR CONSULTING
 * ----------------------------------------------------------------------------
 *  Generado a partir de "EMPRESAS SUR.xlsx".
 *
 *  ATENCION: este archivo NO forma parte del modulo. Vive en `src/demo/` a
 *  proposito. En el aplicativo real el catalogo debe venir de su backend
 *  (una llamada a /api/empresas), no de un archivo estatico versionado:
 *  cambia cuando entran o salen clientes de la cartera.
 *
 *      const empresas = await api.get('/empresas');
 *      <RemuneracionesModule companies={empresas} />
 *
 *  El modulo solo necesita `key`, `name` y `rut`; el resto de los campos son
 *  opcionales y se usan para filtrar y agrupar en el panel.
 *
 *  Convencion de `key`: RUT sin puntos. Debe coincidir con el RUT que aparece
 *  en la cabecera del libro de remuneraciones para que el modulo reconozca
 *  automaticamente la parametrizacion guardada de la empresa.
 * ============================================================================
 */

import type { Company } from '../modules/remuneraciones';

/** Servicios contratados por cada cliente. ADP = Administracion de Personal. */
export type Servicio = 'CP' | 'CE' | 'AyCG' | 'ADP' | 'AF' | 'DF' | 'CHX';

export interface EmpresaSur extends Company {
  /** Codigo de complejidad de la cartera (CAC, CBC, CEC, CMC, CBCAuto). */
  complejidad: string;
  /** Servicios contratados, ya descompuestos. */
  servicios: Servicio[];
  /** Responsable de Administracion de Personal (remuneraciones). */
  adp?: string;
  /** Responsable de contabilidad. */
  contabilidad?: string;
  /** Responsable de finanzas. */
  finanzas?: string;
}

/**
 * true si la empresa tiene remuneraciones (ADP).
 *
 * Se usa el criterio AMPLIO —codigo de servicio ADP **o** responsable de ADP
 * asignado— porque en "EMPRESAS SUR.xlsx" ambas columnas no siempre coinciden:
 *
 *   - 60 empresas tienen el codigo ADP en la columna "Servicios".
 *   - 59 empresas tienen un responsable en la columna "ADP".
 *   - La union son 61.
 *
 * Discrepancias detectadas (conviene revisarlas en el maestro):
 *   · CHILERAINDOOR SPA (76.718.895-1) — responsable Carlos, pero sus
 *     servicios figuran como "CPAyCGAF", sin ADP.
 *   · IMPORTADORA Y EXPORTADORA CORELLA LIMITADA (77.771.940-8) — servicio
 *     ADP contratado, sin responsable asignado.
 *   · MELLA Y ASOCIADOS SERVICIOS DE INFORMATICA SPA (76.712.888-6) — idem.
 *
 * Preferimos incluir de mas: dejar fuera una empresa que si centraliza es
 * peor que mostrar una de mas, que el usuario puede ignorar.
 */
export function tieneRemuneraciones(e: EmpresaSur): boolean {
  return e.servicios.includes('ADP') || Boolean(e.adp);
}

/** Empresas cuyo maestro presenta datos inconsistentes de ADP. */
export function adpInconsistente(e: EmpresaSur): boolean {
  return e.servicios.includes('ADP') !== Boolean(e.adp);
}

export const EMPRESAS_SUR: EmpresaSur[] = [
  {     key: '77539925-2', name: 'ADAPTIVE SECURITY CONSULTING', rut: '77.539.925-2', group: 'GRUPO ADAPTIVE', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG'], contabilidad: 'Pedro', finanzas: 'Matías' },
  {     key: '76644983-2', name: 'ADAPTIVE SECURITY SPA', rut: '76.644.983-2', shortName: 'ADAPTIVE SECURITY', group: 'GRUPO ADAPTIVE', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG'], contabilidad: 'Pedro', finanzas: 'Matías' },
  {     key: '78031792-2', name: 'AGRÍCOLA LJP ORCHARD SPA', rut: '78.031.792-2', active: true, complejidad: 'CBCAuto', servicios: ['CE'], contabilidad: 'Stefan' },
  {     key: '77938122-6', name: 'ALIMENTOS NILO SPA', rut: '77.938.122-6', shortName: 'NOLIA', group: 'GRUPO SEIS', active: true, complejidad: 'CAC', servicios: ['CP', 'ADP'], adp: 'Javier', contabilidad: 'Brenda', finanzas: 'Paula' },
  {     key: '78034259-5', name: 'AMIGO DE ARTISTAS SPA', rut: '78.034.259-5', shortName: 'AMIGO DE ARTISTAS', active: true, complejidad: 'CBC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Juan' },
  {     key: '77139965-7', name: 'AMR PRO SPA', rut: '77.139.965-7', shortName: 'AMR PRO', active: true, complejidad: 'CAC', servicios: ['ADP', 'CE'], adp: 'Carlos', contabilidad: 'Brenda' },
  {     key: '76978736-4', name: 'ANDES CONSULTORES SPA', rut: '76.978.736-4', shortName: 'ANDES CONSULTORES', group: 'GRUPO ANDES', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG'], contabilidad: 'Stefan', finanzas: 'Martín' },
  {     key: '76659430-1', name: 'ANDES LOGÍSTICA LTDA', rut: '76.659.430-1', shortName: 'ANDES LOGISTICA', group: 'GRUPO ANDES', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Carlos', contabilidad: 'Stefan', finanzas: 'Martín' },
  {     key: '76480649-2', name: 'ARMATEC SPA', rut: '76.480.649-2', group: 'GRUPO ARMATEC', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Shantal', contabilidad: 'Stefan', finanzas: 'Martín' },
  {     key: '77384092-K', name: 'ARRASATE ARQUITECTURA SPA', rut: '77.384.092-K', shortName: 'ARRASATE ARQUITECTURA', group: 'GRUPO ARRASATE', active: true, complejidad: 'CMC', servicios: ['CE', 'ADP', 'CHX'], adp: 'Carlos', contabilidad: 'Pedro', finanzas: 'Francisco' },
  {     key: '77920003-5', name: 'ATS ASESORES LTDA', rut: '77.920.003-5', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Víctor' },
  {     key: '78585230-3', name: 'AUTOMOTRIZ TECNOSUR SPA', rut: '78.585.230-3', shortName: 'AUTOMOTRIZ TECNOSUR', group: 'GRUPO TECNOSUR', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Carlos', contabilidad: 'Víctor', finanzas: 'Martín' },
  {     key: '78059703-8', name: 'AVP Exportaciones  SpA', rut: '78.059.703-8', shortName: 'AVP EXPORTACIONES', group: 'GRUPO COLBOX', active: true, complejidad: 'CAC', servicios: ['CP'], contabilidad: 'Brenda', finanzas: 'Lucas' },
  {     key: '76453366-6', name: 'BALLOON LATINOAMERICA SPA', rut: '76.453.366-6', shortName: 'BALLOON', active: true, complejidad: 'CMC', servicios: ['CE'], contabilidad: 'Víctor' },
  {     key: '16606394-9', name: 'BENJAMIN PEREZ', rut: '16.606.394-9', group: 'GRUPO BENJAMIN PEREZ', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Brenda' },
  {     key: '78323763-6', name: 'BERIESTAIN MATEO SPA', rut: '78.323.763-6', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Brenda' },
  {     key: '96519830-K', name: 'BPH SpA', rut: '96.519.830-K', active: true, complejidad: 'CEC', servicios: ['DF'], finanzas: 'María' },
  {     key: '77316138-0', name: 'BRAND&CO', rut: '77.316.138-0', group: 'GRUPO SEBA HECHEM', active: true, complejidad: 'CAC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Pedro', finanzas: 'Francisco' },
  {     key: '76721999-7', name: 'CAF RENTAL SPA', rut: '76.721.999-7', shortName: 'CAF RENTAL', group: 'GRUPO ALDO IBACETA', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Juan' },
  {     key: '77343388-7', name: 'CASA JARDIN SPA', rut: '77.343.388-7', shortName: 'CASA JARDIN', active: true, complejidad: 'CMC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Juan', finanzas: 'Lucas' },
  {     key: '76718895-1', name: 'CHILERAINDOOR SPA', rut: '76.718.895-1', shortName: 'RAINDOOR', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG', 'AF'], adp: 'Carlos', contabilidad: 'Pedro', finanzas: 'Matías' },
  {     key: '77467253-2', name: 'COLBOX', rut: '77.467.253-2', group: 'GRUPO COLBOX', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG'], contabilidad: 'Brenda', finanzas: 'Lucas' },
  {     key: '76181207-6', name: 'COMERCIAL GESTAPACK SPA', rut: '76.181.207-6', shortName: 'GESTAPACK', group: 'GRUPO GESTAPACK', active: true, complejidad: 'CAC', servicios: ['CP', 'ADP'], adp: 'Javier', contabilidad: 'Pedro', finanzas: 'Martín' },
  {     key: '77253079-K', name: 'COMERCIAL KITCHEN-IT SPA', rut: '77.253.079-K', shortName: 'KITCHEN IT', group: 'GRUPO KITCHEN IT', active: true, complejidad: 'CAC', servicios: ['CP', 'ADP', 'CHX'], adp: 'Javier', contabilidad: 'Brenda', finanzas: 'Paula' },
  {     key: '77758327-1', name: 'COMERCIALIZADORA DE LINOS SPA', rut: '77.758.327-1', shortName: 'CASA DEL LINO', active: true, complejidad: 'CMC', servicios: ['ADP', 'CP'], adp: 'Javier', contabilidad: 'Pedro', finanzas: 'Francisco' },
  {     key: '78065983-1', name: 'COMERCIALIZADORA JAVERIM SPA', rut: '78.065.983-1', shortName: 'COMERCIALIZADORA JAVERIM', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Brenda' },
  {     key: '77338927-6', name: 'COMERCIALIZADORA ROCA', rut: '77.338.927-6', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Javier', contabilidad: 'Pedro', finanzas: 'Francisco' },
  {     key: '77506151-0', name: 'COMPRO', rut: '77.506.151-0', group: 'HOLDING PRO', active: true, complejidad: 'CAC', servicios: ['CP'], contabilidad: 'Juan', finanzas: 'Martín' },
  {     key: '76732961-K', name: 'CONNECTION PRO SPA', rut: '76.732.961-K', shortName: 'CONNECTION PRO', group: 'HOLDING PRO', active: true, complejidad: 'CAC', servicios: ['CP'], contabilidad: 'Juan', finanzas: 'Martín' },
  {     key: '76923831-K', name: 'CONSTRUCCIONES CONSEGA SPA', rut: '76.923.831-K', shortName: 'CONSEGA', group: 'GRUPO GARVAL', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG'], contabilidad: 'Víctor', finanzas: 'Lucas' },
  {     key: '76883896-8', name: 'CONSTRUCTORA PUNTO CL SPA', rut: '76.883.896-8', shortName: 'CONSTRUCTORA PUNTO CL', group: 'GRUPO MSY', active: true, complejidad: 'CAC', servicios: ['CE'], contabilidad: 'Juan', finanzas: 'Lucas' },
  {     key: '76385063-3', name: 'CONSTRUCTORIA HPA LIMITADA', rut: '76.385.063-3', shortName: 'CONSTRUCTORA HPA', group: 'GRUPO POLCHILE', active: true, complejidad: 'CEC', servicios: ['CE'], contabilidad: 'Víctor', finanzas: 'Francisco' },
  {     key: '77183588-0', name: 'CONSULTORÍA Y ACCIONES DE GESTIÓN SPA', rut: '77.183.588-0', active: true, complejidad: 'CMC', servicios: ['ADP'], adp: 'Carlos' },
  {     key: '77549594-4', name: 'CONSULTORÍAS Y ASESORÍAS CONNECTION PRO', rut: '77.549.594-4', group: 'HOLDING PRO', active: true, complejidad: 'CAC', servicios: ['CP'], contabilidad: 'Juan', finanzas: 'Martín' },
  {     key: '77674706-8', name: 'ELEVAPRO SPA', rut: '77.674.706-8', shortName: 'ELEVAPRO', group: 'HOLDING PRO', active: true, complejidad: 'CAC', servicios: ['CP'], contabilidad: 'Juan', finanzas: 'Martín' },
  {     key: '76048013-4', name: 'EMPRESA DE PROYECTO EN INGENIERIA Y CONSTRUCCIÓN LIMITADA', rut: '76.048.013-4', shortName: 'EPROIC', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Brenda' },
  {     key: '76933266-9', name: 'ENERCITY SPA', rut: '76.933.266-9', shortName: 'ENERCITY', active: true, complejidad: 'CBC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Juan' },
  {     key: '76832491-3', name: 'ENHORABUENA ESTUDIO', rut: '76.832.491-3', active: true, complejidad: 'CBC', servicios: ['ADP'], adp: 'Carlos' },
  {     key: '77872567-3', name: 'EXPORTADORA VISSION FRESH SPA', rut: '77.872.567-3', active: true, complejidad: 'CMC', servicios: ['CE'], contabilidad: 'Stefan' },
  {     key: '76282756-5', name: 'EXTERILIZA SPA', rut: '76.282.756-5', shortName: 'EXTERILIZA', group: 'GRUPO EXTERILIZA', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Javier', contabilidad: 'Pedro', finanzas: 'Matías' },
  {     key: '65197444-5', name: 'FUNDACIÓN ACCIÓN COLECTIVA', rut: '65.197.444-5', shortName: 'FUNDACION ACCION COLECTIVA', active: true, complejidad: 'CBC', servicios: ['CE', 'ADP'], adp: 'Carlos', contabilidad: 'Víctor' },
  {     key: '65084846-2', name: 'FUNDACIÓN CERROS ISLA', rut: '65.084.846-2', active: true, complejidad: 'CMC', servicios: ['CP', 'AyCG', 'ADP', 'AF'], adp: 'Javier', contabilidad: 'Víctor', finanzas: 'Martín' },
  {     key: '77919818-9', name: 'GARVALE SPA', rut: '77.919.818-9', shortName: 'GARVALE', group: 'GRUPO GARVAL', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Carlos', contabilidad: 'Víctor', finanzas: 'Lucas' },
  {     key: '77201862-2', name: 'GASTRONOMICA GRUPO SEIS SPA', rut: '77.201.862-2', shortName: 'LOCAL BURGER', group: 'GRUPO SEIS', active: true, complejidad: 'CAC', servicios: ['CP', 'ADP'], adp: 'Carlos', contabilidad: 'Brenda', finanzas: 'Paula' },
  {     key: '77891173-6', name: 'GLOBAL BREKKIE SPA', rut: '77.891.173-6', shortName: 'BREKKIE', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG'], contabilidad: 'Stefan', finanzas: 'Lucas' },
  {     key: '77740671-K', name: 'GROWTH PRO SPA', rut: '77.740.671-K', shortName: 'GROWTH PRO', active: true, complejidad: 'CAC', servicios: ['AyCG', 'ADP', 'AF'], adp: 'Javier', contabilidad: 'Juan', finanzas: 'Martín' },
  {     key: '76763668-7', name: 'GRUAS CONO SUR SPA', rut: '76.763.668-7', shortName: 'GRUAS CONO SUR', active: true, complejidad: 'CAC', servicios: ['DF'] },
  {     key: '77977813-4', name: 'GRUPO AM SPA', rut: '77.977.813-4', group: 'GRUPO ALDO IBACETA', active: true, complejidad: 'CBC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Juan' },
  {     key: '77266581-4', name: 'GRUPO AUMA', rut: '77.266.581-4', shortName: 'ASESORIAS E INVERSIONES AUMA SPA', active: true, complejidad: 'CBC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Stefan' },
  {     key: '78128221-9', name: 'GRUPO CAF SpA', rut: '78.128.221-9', shortName: 'GRUPO CAF', group: 'GRUPO MATÍAS FACHE', active: true, complejidad: 'CAC', servicios: ['CE'], contabilidad: 'Juan' },
  {     key: '76715268-K', name: 'GRUPO RYF SPA', rut: '76.715.268-K', shortName: 'RYF', group: 'GRUPO ALDO IBACETA', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Juan' },
  {     key: '77771940-8', name: 'IMPORTADORA Y EXPORTADORA CORELLA LIMITADA', rut: '77.771.940-8', shortName: 'Didácticos Corella', active: true, complejidad: 'CBC', servicios: ['ADP', 'CE'] },
  {     key: '77906985-0', name: 'INA MONTT ASESORIAS DE MARKETING Y PUBLICIDAD LIMITADA', rut: '77.906.985-0', active: true, complejidad: 'CBC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Brenda' },
  {     key: '76338547-7', name: 'INMOBILIARIA ANDES LTDA', rut: '76.338.547-7', shortName: 'INMOBILIARIA ANDES', group: 'GRUPO ANDES', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG'], contabilidad: 'Stefan', finanzas: 'Martín' },
  {     key: '77583353-K', name: 'INMOBILIARIA Y CONSTRUCTORA GARVAL SPA', rut: '77.583.353-K', shortName: 'GARVAL', group: 'GRUPO GARVAL', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Carlos', contabilidad: 'Víctor', finanzas: 'Lucas' },
  {     key: '77489597-3', name: 'INVERSIONES AGC SPA', rut: '77.489.597-3', group: 'HOLDING PRO', active: true, complejidad: 'CAC', servicios: ['CE'], contabilidad: 'Víctor', finanzas: 'Martín' },
  {     key: '77489602-3', name: 'INVERSIONES AVA SPA', rut: '77.489.602-3', group: 'HOLDING PRO', active: true, complejidad: 'CAC', servicios: ['CE'], contabilidad: 'Víctor', finanzas: 'Martín' },
  {     key: '77912378-2', name: 'INVERSIONES BBC SPA', rut: '77.912.378-2', group: 'GRUPO BENJA PEREZ', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Brenda' },
  {     key: '77020443-7', name: 'INVERSIONES DEL RETIRO SPA', rut: '77.020.443-7', shortName: 'INVERSIONES DEL RETIRO', group: 'GRUPO GARVAL', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Carlos', contabilidad: 'Víctor', finanzas: 'Lucas' },
  {     key: '77489595-7', name: 'INVERSIONES DOÑA ADELINA SPA', rut: '77.489.595-7', group: 'HOLDING PRO', active: true, complejidad: 'CAC', servicios: ['CE'], contabilidad: 'Víctor', finanzas: 'Martín' },
  {     key: '77822379-1', name: 'INVERSIONES HPR LTDA', rut: '77.822.379-1', group: 'GRUPO POLCHILE', active: true, complejidad: 'CEC', servicios: ['CE'], contabilidad: 'Víctor', finanzas: 'Francisco' },
  {     key: '76321062-6', name: 'INVERSIONES JUAN CORDOVA EIRL', rut: '76.321.062-6', shortName: 'INVERSIONES JUAN CORDOVA LEIVA E.I.R.L.', group: 'GRUPO ANDES', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG'], contabilidad: 'Stefan', finanzas: 'Martín' },
  {     key: '77822376-7', name: 'INVERSIONES MMACARENA PDA LTDA', rut: '77.822.376-7', group: 'GRUPO POLCHILE', active: true, complejidad: 'CEC', servicios: ['CE'], contabilidad: 'Víctor', finanzas: 'Francisco' },
  {     key: '77822371-6', name: 'INVERSIONES MPAULA PDA LTDA', rut: '77.822.371-6', group: 'GRUPO POLCHILE', active: true, complejidad: 'CEC', servicios: ['CE'], contabilidad: 'Víctor', finanzas: 'Francisco' },
  {     key: '77489598-1', name: 'INVERSIONES N10 SPA', rut: '77.489.598-1', group: 'HOLDING PRO', active: true, complejidad: 'CAC', servicios: ['CE'], contabilidad: 'Víctor', finanzas: 'Martín' },
  {     key: '78047185-9', name: 'INVERSIONES VERDALIA SPA', rut: '78.047.185-9', shortName: 'INVERSIONES VERDALIA', group: 'GRUPO SEBA HECHEM', active: true, complejidad: 'CAC', servicios: ['CE'], contabilidad: 'Pedro', finanzas: 'Francisco' },
  {     key: '77139524-4', name: 'INVERSIONES VISSION SPA', rut: '77.139.524-4', group: 'GRUPO VISSION FRESH', active: true, complejidad: 'CBCAuto', servicios: ['CE'], contabilidad: 'Stefan' },
  {     key: '78071218-K', name: 'INVERSIONES VN SPA', rut: '78.071.218-K', group: 'GRUPO KITCHEN IT', active: true, complejidad: 'CBC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Brenda', finanzas: 'Paula' },
  {     key: '77573889-8', name: 'JAPECO SPA', rut: '77.573.889-8', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Brenda' },
  {     key: '76745244-6', name: 'JASATRUCK SPA', rut: '76.745.244-6', shortName: 'JASATRUCK', group: 'GRUPO POLCHILE', active: true, complejidad: 'CAC', servicios: ['CE'], contabilidad: 'Brenda' },
  {     key: '76816009-0', name: 'JAVERIM SPA', rut: '76.816.009-0', shortName: 'JAVERIM', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Brenda' },
  {     key: '78111503-7', name: 'JMENTORING SPA', rut: '78.111.503-7', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Brenda' },
  {     key: '76562151-8', name: 'JOSE HERRERA SPA', rut: '76.562.151-8', shortName: 'JOSE HERRERA', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Carlos', contabilidad: 'Pedro', finanzas: 'Matías' },
  {     key: '78206608-0', name: 'JOSEFINA BERIESTAIN SPA', rut: '78.206.608-0', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Brenda' },
  {     key: '8945367-4', name: 'JOSEFINA KONIG', rut: '8.945.367-4', active: true, complejidad: 'CBC', servicios: ['CP'], contabilidad: 'Pedro', finanzas: 'Francisco' },
  {     key: '77788336-4', name: 'KEEP PUSHING BUSINESS SPA', rut: '77.788.336-4', shortName: 'KPB', group: 'GRUPO KPB', active: true, complejidad: 'CAC', servicios: ['CP', 'ADP', 'AF'], adp: 'Javier', contabilidad: 'Brenda', finanzas: 'Francisco' },
  {     key: '76184561-6', name: 'KH INGENIERIA URBANA LIMITADA', rut: '76.184.561-6', shortName: 'KH INGENIERIA URBANA', group: 'GRUPO KH', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Juan' },
  {     key: '77768921-5', name: 'KH OBRAS URBANAS SPA', rut: '77.768.921-5', shortName: 'KH OBRAS URBANAS', group: 'GRUPO KH', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Juan' },
  {     key: '77561664-4', name: 'LA LAUNA SPA', rut: '77.561.664-4', shortName: 'STACKER', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG', 'ADP', 'AF'], adp: 'Javier', contabilidad: 'Juan', finanzas: 'Lucas' },
  {     key: '76907746-4', name: 'LA MAR MANDA SPA', rut: '76.907.746-4', shortName: 'DO SUSHI', group: 'GRUPO SEIS', active: true, complejidad: 'CAC', servicios: ['CP', 'ADP'], adp: 'Carlos', contabilidad: 'Brenda', finanzas: 'Paula' },
  {     key: '77017393-0', name: 'LAS MERCEDES INVERSIONES SPA', rut: '77.017.393-0', group: 'GRUPO EXTERILIZA', active: true, complejidad: 'CEC', servicios: ['CE'], contabilidad: 'Pedro', finanzas: 'Matías' },
  {     key: '77160717-9', name: 'LEGGERA INVERSIONES SPA', rut: '77.160.717-9', shortName: 'LEGGERA', group: 'GRUPO ALDO IBACETA', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Juan' },
  {     key: '77374838-1', name: 'M5 INDUSTRIAL SPA', rut: '77.374.838-1', group: 'GRUPO POLCHILE', active: true, complejidad: 'CEC', servicios: ['CP', 'ADP'], adp: 'Carlos', contabilidad: 'Víctor', finanzas: 'Francisco' },
  {     key: '76718658-4', name: 'MAQUINARIAS SANTA YOLANDA LIMITADA', rut: '76.718.658-4', group: 'GRUPO MSY', active: true, complejidad: 'CAC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Juan', finanzas: 'Lucas' },
  {     key: '77968095-9', name: 'MAQUINARIAS SANTA YOLANDA SPA', rut: '77.968.095-9', group: 'GRUPO MSY', active: true, complejidad: 'CAC', servicios: ['CE'], contabilidad: 'Juan', finanzas: 'Lucas' },
  {     key: '76769053-3', name: 'MASTER TEC SERVICES', rut: '76.769.053-3', shortName: 'MTS', active: true, complejidad: 'CEC', servicios: ['AyCG', 'ADP', 'CP'], adp: 'Javier', contabilidad: 'Juan', finanzas: 'Martín' },
  {     key: '76712887-8', name: 'MELLA Y ASOCIADOS INVERSIONES SPA', rut: '76.712.887-8', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Pedro' },
  {     key: '76712888-6', name: 'MELLA Y ASOCIADOS SERVICIOS DE INFORMATICA SPA', rut: '76.712.888-6', shortName: 'NUBETIC', group: 'GRUPO NUBETIC', active: true, complejidad: 'CAC', servicios: ['CE', 'ADP'], contabilidad: 'Pedro' },
  {     key: '77285643-1', name: 'MUNDAKA SPA', rut: '77.285.643-1', group: 'GRUPO ARRASATE', active: true, complejidad: 'CMC', servicios: ['CE'], contabilidad: 'Pedro', finanzas: 'Francisco' },
  {     key: '77774405-4', name: 'NEGRETE Y MONTSERRAT INGENIERIA LIMITADA', rut: '77.774.405-4', group: 'GRUPO RIVERINE', active: true, complejidad: 'CAC', servicios: ['CE'], contabilidad: 'Stefan', finanzas: 'Matías' },
  {     key: '77847873-0', name: 'NESTA INVERSIONES SPA', rut: '77.847.873-0', shortName: 'NESTA', group: 'GRUPO SEBA HECHEM', active: true, complejidad: 'CAC', servicios: ['CE'], contabilidad: 'Pedro', finanzas: 'Francisco' },
  {     key: '77645707-8', name: 'NGH CAPITAL SPA', rut: '77.645.707-8', shortName: 'NGH CAPITAL', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Víctor' },
  {     key: '77904308-8', name: 'ONIS SPA', rut: '77.904.308-8', shortName: 'CASA ONIS', active: true, complejidad: 'CBC', servicios: ['CP', 'ADP'], adp: 'Javier', contabilidad: 'Pedro', finanzas: 'Francisco' },
  {     key: '77919833-2', name: 'PASEO INTERMODAL LA FLORIDA SPA', rut: '77.919.833-2', shortName: 'PASEO INTERMODAL LA FLORIDA', group: 'GRUPO GARVAL', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Carlos', contabilidad: 'Víctor', finanzas: 'Lucas' },
  {     key: '76450796-7', name: 'PEOPLE PRO', rut: '76.450.796-7', active: true, complejidad: 'CMC', servicios: ['CHX', 'AF'] },
  {     key: '77060527-K', name: 'PLANTME SPA', rut: '77.060.527-K', shortName: 'PLANT ME', group: 'GRUPO SEBA HECHEM', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG', 'ADP', 'AF'], adp: 'Javier', contabilidad: 'Pedro', finanzas: 'Francisco' },
  {     key: '77935420-2', name: 'POLCHILE SPA', rut: '77.935.420-2', shortName: 'POLCHILE', group: 'GRUPO POLCHILE', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Carlos', contabilidad: 'Pedro', finanzas: 'Francisco' },
  {     key: '77115331-3', name: 'RAMAQ SPA', rut: '77.115.331-3', shortName: 'RAMAQ', active: true, complejidad: 'CBC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Juan' },
  {     key: '78356736-9', name: 'RAYTE SPA', rut: '78.356.736-9', group: 'GRUPO GESTAPACK', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Pedro' },
  {     key: '77927564-7', name: 'RAZEN BRAND EXPERIENCE SPA', rut: '77.927.564-7', shortName: 'RAZEN BRAND EXPERIENCE', group: 'GRUPO RAZEN', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Javier', contabilidad: 'Brenda', finanzas: 'Paula' },
  {     key: '77120729-4', name: 'RAZEN PRODUCCIONES SPA', rut: '77.120.729-4', shortName: 'RAZEN PRODUCCIONES', group: 'GRUPO RAZEN', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Javier', contabilidad: 'Brenda', finanzas: 'Paula' },
  {     key: '77927572-8', name: 'RAZPAY SPA', rut: '77.927.572-8', shortName: 'RAZPAY', group: 'GRUPO RAZEN', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG'], contabilidad: 'Brenda', finanzas: 'Paula' },
  {     key: '77844522-0', name: 'RECICLAJE Y DEMOLICIONES RIO ALTO SPA', rut: '77.844.522-0', shortName: 'RIO ALTO', group: 'GRUPO MATÍAS FACHE', active: true, complejidad: 'CAC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Juan' },
  {     key: '76731277-6', name: 'RESTAURANT ALEXIS YOSSIMAR NAVARRETE RIVAS E.I.R.L.', rut: '76.731.277-6', group: 'GRUPO TERRA', active: true, complejidad: 'CAC', servicios: ['CP'], contabilidad: 'Juan', finanzas: 'Lucas' },
  {     key: '76231686-2', name: 'RICARDO ALLEL INV. EIRL', rut: '76.231.686-2', group: 'GRUPO ARMATEC', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG'], contabilidad: 'Stefan', finanzas: 'Martín' },
  {     key: '76972787-6', name: 'RIVERINE SPA', rut: '76.972.787-6', shortName: 'RIVERINE', group: 'GRUPO RIVERINE', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG', 'ADP', 'AF'], adp: 'Shantal', contabilidad: 'Stefan', finanzas: 'Matías' },
  {     key: '77575240-8', name: 'SERVICIO TECNICO TECNOSUR LIMITADA', rut: '77.575.240-8', shortName: 'SERVICIO TÉCNICO TECNOSUR', group: 'GRUPO TECNOSUR', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Carlos', contabilidad: 'Víctor', finanzas: 'Martín' },
  {     key: '76156446-3', name: 'SERVICIOS ARMATEC LTDA', rut: '76.156.446-3', shortName: 'ARMATEC LTDA', group: 'GRUPO ARMATEC', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Shantal', contabilidad: 'Stefan', finanzas: 'Martín' },
  {     key: '77780516-9', name: 'SERVICIOS E INSUMOS EXTERILIZA SPA', rut: '77.780.516-9', group: 'GRUPO EXTERILIZA', active: true, complejidad: 'CEC', servicios: ['CE'], contabilidad: 'Pedro', finanzas: 'Matías' },
  {     key: '76480646-8', name: 'SOC. DE INV. INMOBILIARIA ALLEL SPA', rut: '76.480.646-8', shortName: 'SOCIEDAD DE INVERSIONES INMOBILIARIAS ALLEL SPA', group: 'GRUPO ARMATEC', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG'], contabilidad: 'Stefan', finanzas: 'Martín' },
  {     key: '76511631-7', name: 'SOCIEDAD DE PROFESIONALES ARASAL SPA', rut: '76.511.631-7', shortName: 'CLINICA UPGRADE', active: true, complejidad: 'CAC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Javier', contabilidad: 'Pedro', finanzas: 'Francisco' },
  {     key: '77742769-5', name: 'SOCIEDAD DE PROFESIONALES Pablo Salas', rut: '77.742.769-5', shortName: 'PABLO SALAS SERVICIOS PROFESIONALES E.I.R.L.', group: 'GRUPO KPB', active: true, complejidad: 'CAC', servicios: ['CP'], contabilidad: 'Brenda', finanzas: 'Francisco' },
  {     key: '76175377-0', name: 'SOCIEDAD DE SERVICIOS C & S LIMITADA', rut: '76.175.377-0', shortName: 'C&S', group: 'GRUPO POLCHILE', active: true, complejidad: 'CAC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Brenda' },
  {     key: '76991925-2', name: 'SOCIEDAD INMOBILIARIA CAILIN SPA', rut: '76.991.925-2', active: true, complejidad: 'CBCAuto', servicios: ['CE'], contabilidad: 'Brenda' },
  {     key: '76230521-6', name: 'SOCIEDAD SALINAS SUNG Y CIA SPA', rut: '76.230.521-6', shortName: 'COLABORA TI', active: true, complejidad: 'CBC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Brenda' },
  {     key: '77815293-2', name: 'SOLUCIONES COMERCIALES Y TECNOLOGICAS C PRO SOCIEDAD DE RESPONSABILIDAD LIMITADA', rut: '77.815.293-2', shortName: 'C PRO', group: 'HOLDING PRO', active: true, complejidad: 'CAC', servicios: ['CP'], contabilidad: 'Juan', finanzas: 'Martín' },
  {     key: '76908986-1', name: 'SOLUCIONES GASTRONOMICAS SV SPA', rut: '76.908.986-1', shortName: 'BURGRASS', active: true, complejidad: 'CMC', servicios: ['CE', 'ADP'], adp: 'Carlos', contabilidad: 'Brenda' },
  {     key: '76206397-2', name: 'SPORT PRO', rut: '76.206.397-2', group: 'HOLDING PRO', active: true, complejidad: 'CAC', servicios: ['CP'], contabilidad: 'Juan', finanzas: 'Martín' },
  {     key: '77046871-K', name: 'SUR CONSULTING SPA', rut: '77.046.871-K', active: true, complejidad: 'CEC', servicios: ['CP', 'ADP', 'AyCG'], adp: 'Diana', contabilidad: 'Juan', finanzas: 'Matías' },
  {     key: '76738662-1', name: 'TAMANGO BREBAJES SPA', rut: '76.738.662-1', shortName: 'TAMANGO BREBAJES', group: 'GRUPO TAMANGO', active: true, complejidad: 'CMC', servicios: ['CE'], contabilidad: 'Stefan' },
  {     key: '77270908-0', name: 'TAMANGO SERVICES SPA', rut: '77.270.908-0', group: 'GRUPO TAMANGO', active: true, complejidad: 'CMC', servicios: ['CE'], contabilidad: 'Stefan' },
  {     key: '77367892-8', name: 'TECH CO SPA', rut: '77.367.892-8', shortName: 'TECH CO', group: 'GRUPO KITCHEN IT', active: true, complejidad: 'CAC', servicios: ['CP'], contabilidad: 'Brenda', finanzas: 'Paula' },
  {     key: '77576894-0', name: 'TERRA-ANGAMOS RESTARAURANT SPA', rut: '77.576.894-0', shortName: 'TERRA-ANGAMOS', group: 'GRUPO TERRA', active: true, complejidad: 'CAC', servicios: ['CP'], contabilidad: 'Juan', finanzas: 'Lucas' },
  {     key: '77576891-6', name: 'TERRALENGA RESTAURANT SPA', rut: '77.576.891-6', shortName: 'TERRA-LENGA', group: 'GRUPO TERRA', active: true, complejidad: 'CAC', servicios: ['CP'], contabilidad: 'Juan', finanzas: 'Lucas' },
  {     key: '77576893-2', name: 'TERRALOMAS RESTAURANT SPA', rut: '77.576.893-2', shortName: 'TERRA-LOMAS', group: 'GRUPO TERRA', active: true, complejidad: 'CAC', servicios: ['CP'], contabilidad: 'Juan', finanzas: 'Lucas' },
  {     key: '66666666-6', name: 'THEPARTICULARPROJECTS.COM', rut: '66.666.666-6', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Víctor' },
  {     key: '77902001-0', name: 'TIERRA Y AGUA SPA', rut: '77.902.001-0', shortName: 'TIERRA Y AGUA', group: 'GRUPO POLCHILE', active: true, complejidad: 'CMC', servicios: ['CP', 'ADP'], adp: 'Javier', contabilidad: 'Pedro', finanzas: 'Francisco' },
  {     key: '78353859-8', name: 'TOTTORI SPA', rut: '78.353.859-8', group: 'GRUPO GESTAPACK', active: true, complejidad: 'CBC', servicios: ['CE'], contabilidad: 'Pedro' },
  {     key: '77038174-6', name: 'TRANSPORTE ALLEL SPA', rut: '77.038.174-6', shortName: 'TRANSPORTES ALLEL SPA', group: 'GRUPO ARMATEC', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG', 'ADP'], adp: 'Shantal', contabilidad: 'Stefan', finanzas: 'Martín' },
  {     key: '76473719-9', name: 'TRANSPORTE ARMATEC LTDA.', rut: '76.473.719-9', shortName: 'TRANSPORTE ARMATEC', group: 'GRUPO ARMATEC', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG'], contabilidad: 'Stefan', finanzas: 'Martín' },
  {     key: '76338592-2', name: 'TRANSPORTES JUAN CORDOVA EIRL', rut: '76.338.592-2', shortName: 'TRANSPORTES JUAN CORDOVA', group: 'GRUPO ANDES', active: true, complejidad: 'CEC', servicios: ['CP', 'AyCG'], contabilidad: 'Stefan', finanzas: 'Martín' },
  {     key: '77532065-6', name: 'TRANSPORTES MYKONOS SPA', rut: '77.532.065-6', shortName: 'TRANSPORTES MYKONOS', active: true, complejidad: 'CBC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Stefan' },
  {     key: '77147523-K', name: 'VINDER CHILE SPA', rut: '77.147.523-K', shortName: 'VINDER', active: true, complejidad: 'CAC', servicios: ['CP', 'ADP', 'AyCG'], adp: 'Javier', contabilidad: 'Pedro', finanzas: 'Matías' },
  {     key: '76550472-4', name: 'VIVERO RODRIGUEZ LOBO SPA', rut: '76.550.472-4', shortName: 'DECOPLANTAS', active: true, complejidad: 'CMC', servicios: ['CP', 'ADP'], adp: 'Shantal', contabilidad: 'Pedro', finanzas: 'Matías' },
  {     key: '77136733-K', name: 'VULCAN - SENNA MOTORS SPA', rut: '77.136.733-K', shortName: 'SENNA MOTORS', group: 'GRUPO MATÍAS FACHE', active: true, complejidad: 'CMC', servicios: ['CE', 'ADP'], adp: 'Javier', contabilidad: 'Juan' },
  {     key: '77562687-9', name: 'ZOLA OUTDOORS SPA', rut: '77.562.687-9', group: 'GRUPO KITCHEN IT', active: true, complejidad: 'CBC', servicios: ['CP', 'ADP'], adp: 'Javier', contabilidad: 'Brenda', finanzas: 'Paula' },
];

/** Solo las empresas que centralizan remuneraciones. */
export const EMPRESAS_CON_REMUNERACIONES = EMPRESAS_SUR.filter(tieneRemuneraciones);
