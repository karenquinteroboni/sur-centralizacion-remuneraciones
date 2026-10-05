# Integración en el aplicativo de conciliación existente

Guía operativa para incorporar el módulo al sistema que ya está desplegado.

---

## 1. Qué carpetas copiar

Copie **una sola carpeta**:

```text
src/modules/remuneraciones/    →    <su-proyecto>/src/modules/remuneraciones/
```

Contenido completo de esa carpeta (todo se copia, nada se deja fuera):

```text
remuneraciones/
├── RemuneracionesModule.tsx
├── index.ts
├── styles.css
├── components/   (10 archivos .tsx)
├── core/         (8 archivos .ts)
├── types/        (payroll.ts, company.ts)
├── utils/        (4 archivos .ts)
└── config/       (exampleConfiguration.json)
```

### Qué NO copiar

Estos archivos existen solo para poder ejecutar y probar el módulo de forma aislada.
**No forman parte del módulo** y no deben llevarse al aplicativo:

| Archivo / carpeta | Motivo |
|---|---|
| `src/App.tsx`, `src/main.tsx` | Bootstrap de la app demo |
| `index.html` | Página de la demo |
| `vite.config.ts`, `tsconfig.json`, `package.json` | Configuración del proyecto demo |
| `tests/` | Pruebas (opcional: ver §6) |
| `scripts/` | Prueba por línea de comandos (opcional, útil) |
| `ejemplo-salida/` | Ejemplos generados |
| `dist/`, `node_modules/` | Artefactos |

---

## 2. Qué dependencias instalar

En el aplicativo anfitrión:

```bash
npm install xlsx@^0.18.5
```

Eso es **todo**. `react` y `react-dom` ya existen en su proyecto.
El módulo no usa librerías de UI, de estado, de fechas ni de CSV: no arrastra nada más.

Si su proyecto usa TypeScript, requiere `typescript` ≥ 5.0. Si usa JavaScript puro,
compile la carpeta o use un bundler que transpile TS (Vite, Next, CRA con `@babel/preset-typescript`).

---

## 3. Qué componente importar

Un único import:

```tsx
import { RemuneracionesModule } from '@/modules/remuneraciones';

export function CentralizacionRemuneracionesPage() {
  return <RemuneracionesModule />;
}
```

Registro de la ruta, según su router:

```tsx
// React Router
<Route path="/remuneraciones" element={<RemuneracionesModule />} />

// Next.js — app/remuneraciones/page.tsx
'use client';
import { RemuneracionesModule } from '@/modules/remuneraciones';
export default function Page() { return <RemuneracionesModule />; }
```

> **Next.js:** el módulo lee archivos con `FileReader` y usa `localStorage`, por lo que debe
> ser un **Client Component** (`'use client'`).

Si su layout ya tiene su propio encabezado:

```tsx
<RemuneracionesModule hideHeader title="Centralización de Remuneraciones" />
```

---

## 4. Qué servicios conectar

Los cuatro puntos de enganche, todos opcionales:

### 4.1 Persistencia de la configuración

Por defecto usa `localStorage`. Para guardar en su backend, implemente `ConfigRepository`:

```tsx
import {
  RemuneracionesModule,
  type ConfigRepository,
  type CentralizationConfig,
} from '@/modules/remuneraciones';

const repo: ConfigRepository = {
  async load(companyKey) {
    const r = await api.get(`/centralizacion/config/${companyKey}`);
    return r.status === 404 ? null : (r.data as CentralizationConfig);
  },
  async save(config) {
    await api.put(`/centralizacion/config/${config.companyKey}`, config);
  },
  async remove(companyKey) {
    await api.delete(`/centralizacion/config/${companyKey}`);
  },
  async list() {
    return (await api.get('/centralizacion/config')).data;
  },
};

<RemuneracionesModule configRepository={repo} />
```

Esquema sugerido de la tabla:

```sql
CREATE TABLE centralizacion_config (
  company_key  VARCHAR(64) PRIMARY KEY,   -- RUT sin puntos, ej. "76562151-8"
  company_name VARCHAR(255),
  updated_at   TIMESTAMP,
  payload      JSONB NOT NULL             -- el CentralizationConfig completo
);
```

> La configuración **no contiene datos personales**: solo cuentas, clasificaciones y
> modalidades. Es seguro almacenarla en el backend.

### 4.2 Auditoría / envío del archivo generado

```tsx
<RemuneracionesModule
  onExported={({ fileName, content, rowCount, companyKey, period }) => {
    // El usuario ya puede descargarlo; esto es adicional.
    api.post('/centralizacion/exportaciones', {
      fileName, rowCount, companyKey, period,
      usuario: sesion.usuarioId,
    });
  }}
/>
```

> ⚠️ `content` contiene RUT y nombres de trabajadores. Envíelo al backend **solo** si su
> política de datos lo permite y por un canal cifrado. Para auditoría suelen bastar los
> metadatos.

### 4.3 Opciones de validación

```tsx
<RemuneracionesModule
  validationOptions={{
    // Formato de cuenta de SU plan de cuentas
    accountPattern: /^\d\.\d{2}\.\d{2}\.\d{2}$/,
    tolerance: 1,                    // pesos
    strictDoubleCounting: false,     // true = la doble contabilización bloquea
    allowUnbalancedExport: false,    // opción administrativa
  }}
/>
```

### 4.4 Catálogo de empresas (multiempresa)

Si su aplicativo administra varias empresas, entréguele el catálogo y el módulo
abrirá con el panel de cartera:

```tsx
const empresas = await api.get('/empresas');   // NO un archivo estático
<RemuneracionesModule companies={empresas} />
```

`companies` acepta `Company`, `{nombre, rut}` o strings, y **preserva los campos
propios** que agregue (responsable, cartera, complejidad), disponibles luego en
`companyFacets` y `renderCompanyExtra`.

La clave de cada empresa debe ser el **RUT sin puntos**, igual que el
`companyKey` que genera el módulo a partir de la cabecera del libro: así se
reconoce la parametrización guardada y funciona la salvaguarda que impide
cargar el libro de otra empresa.

### 4.5 Guardado de archivos en entornos especiales

```ts
import { setFileSaver } from '@/modules/remuneraciones';
setFileSaver(async (blob, fileName) => miPuente.guardar(fileName, blob));
```

Útil en Electron, puentes móviles o visores con descargas restringidas.
`setFileSaver(null)` restaura la descarga estándar del navegador.

### 4.6 Notificación al guardar configuración

```tsx
<RemuneracionesModule onConfigSaved={(config) => toast.success(`Configuración de ${config.companyName} guardada`)} />
```

---

## 5. Qué configuración adaptar

### 5.1 Identidad visual

Todas las clases llevan el prefijo `crm-` y todos los colores son variables CSS. Para
alinear el módulo con su design system, redefina las variables **después** de importar el
módulo:

```css
.crm-root {
  --crm-primary:      #0f766e;   /* su color corporativo */
  --crm-primary-dark: #115e59;
  --crm-primary-soft: #f0fdfa;
  --crm-radius:       6px;
  font-family: var(--font-app);
}
```

No hay estilos globales ni resets: el módulo no puede alterar el resto de su aplicación.
Si su bundler no procesa el `import './styles.css'`, importe el archivo desde su hoja
global o cópielo a su pipeline de estilos.

### 5.2 Valores por defecto del comprobante

En `core/configStore.ts`, función `buildDefaultVoucher`:

```ts
tipoComprobante: 'TRASPASO',    // ← ajuste al tipo que usa su Kame
unidadNegocio:   'Casa Matriz', // ← su unidad de negocio habitual
folioAuto:       'S',
```

Son **valores iniciales**; el usuario puede cambiarlos en la interfaz.

### 5.2.1 Campos analíticos de las cuentas

Los cinco campos (`Rut Ficha`, `Rzn Social Ficha`, `Nombre Doc`, `Folio Doc`,
`Fecha Venc`) se parametrizan **por concepto** desde la interfaz, y quedan
guardados en la configuración de la empresa, de modo que se reutilizan cada mes.

Los valores por defecto están en `core/kameFields.ts`, función
`buildDefaultKameFields`: hoy solo enciende la ficha del trabajador cuando el
concepto es «por trabajador». Si en su plan de cuentas hay un patrón fijo (por
ejemplo, que toda cuenta de pasivo previsional lleve planilla con vencimiento el
día 10), conviene ajustar ahí el valor inicial para no repetirlo empresa por
empresa.

Dentro de una misma empresa, el diálogo **«Copiar estos campos a otros
conceptos…»** replica la parametrización de una cuenta a las demás por grupos
(ficha / documento / folio / vencimiento), con selección explícita de destinos y
opción de deshacer. La lógica es pura y está en `applyKameFieldsTo`, de modo que
también puede invocarse desde un script de carga masiva.

### 5.3 Diccionario de conceptos

En `utils/conceptUtils.ts`, `CLASSIFICATION_RULES` contiene los patrones de clasificación
automática. Si sus libros usan nomenclatura propia (por ejemplo `BONO PROD.` o
`DCTO. CASINO`), agregue patrones al bloque correspondiente. **Respete el orden**: las
reglas se evalúan de arriba hacia abajo y la primera coincidencia gana, por eso los
aportes del empleador y los totalizadores van antes que los genéricos.

Este diccionario **no contiene cuentas contables** y no debe contenerlas: las cuentas son
siempre responsabilidad de la configuración de cada empresa.

### 5.4 Alias de rutas

Si su proyecto no usa el alias `@/`, ajuste los imports. Dentro del módulo todas las rutas
son **relativas** (`../core/...`), así que solo hay que cambiar el import de la página que
lo consume.

---

## 6. Pruebas (opcional pero recomendado)

Si su proyecto ya usa Vitest o Jest, copie también:

```text
tests/                    →  <su-proyecto>/tests/centralizacion/
```

y ajuste las rutas de import. Las pruebas no dependen de React ni del DOM: se ejecutan en
Node. Son la red de seguridad que detecta si alguien altera el contrato con Kame.

---

## 7. Qué parte del código NO debe modificarse

### 7.1 Contrato con Kame — crítico

| Ubicación | Elemento |
|---|---|
| `core/kameExporter.ts` | `KAME_COLUMNS` — los 17 nombres y su orden |
| `core/kameExporter.ts` | `formatKameDate` — formato `d/MM/yyyy` |
| `utils/csvUtils.ts` | `CSV_SEPARATOR` (`;`) y `CSV_EOL` (`\r\n`) |
| `utils/csvUtils.ts` | `encodeLatin1` / `toLatin1Safe` — codificación ISO-8859-1 |
| `utils/numberUtils.ts` | `formatKameAmount` — enteros sin separador de miles |

Modificar cualquiera de ellos hace que Kame rechace el archivo. Están marcados en el
código con un bloque `NO MODIFICAR` y protegidos por `tests/kameExporter.test.ts`, que
compara la cabecera generada contra la cabecera literal del archivo de referencia.

### 7.2 Motor contable — modificar solo con pruebas

| Ubicación | Motivo |
|---|---|
| `core/accountingEngine.ts` → `NATURAL_NATURE` | Define DEBE/HABER por clasificación. Alterarlo descuadra todos los asientos. |
| `core/accountingEngine.ts` → `generateAccountingEntries` | Función central; cualquier cambio debe pasar `accountingEngine.test.ts`. |
| `utils/rutValidator.ts` → `computeDv` | Algoritmo módulo 11. |
| `types/payroll.ts` | Contratos de datos. Cambiarlos rompe la compatibilidad de las configuraciones ya guardadas. |
| `core/kameFields.ts` → `resolveKameFieldValues` | Un campo apagado debe emitirse SIEMPRE vacío: es lo que Kame espera cuando la cuenta no maneja esa columna. |

Si necesita cambiar el esquema de configuración, **incremente `schemaVersion`** y añada
una migración en `importConfigFromJson`; el repositorio ignora las versiones desconocidas
en lugar de corromper datos.

### 7.3 Libre de modificar

- Todo `components/` — es la capa reemplazable. Si su aplicativo usa Vue, Angular u otra
  librería de UI, reescriba estos archivos y conserve `core/` intacto.
- `styles.css` — completo.
- `config/exampleConfiguration.json` — es una plantilla.
- `CLASSIFICATION_RULES` en `utils/conceptUtils.ts` — amplíe según su nomenclatura.

---

## 8. Uso del motor sin interfaz

Si prefiere procesar en el backend o en un worker, el núcleo funciona sin React:

```ts
import {
  parsePayrollWorkbook,
  analyzePayroll,
  buildWorkingConfig,
  generateAccountingEntries,
  validateCentralization,
  generateKameCsv,
} from '@/modules/remuneraciones';

const book      = parsePayrollWorkbook(buffer, { fileName: 'libro.xlsx' });
const analyses  = analyzePayroll(book);
const { config } = buildWorkingConfig(book, analyses, configuracionGuardada);

const accounting = generateAccountingEntries(book, config);
const report     = validateCentralization(book, config, analyses, accounting);

if (!report.canExport) throw new Error(report.errors.map(e => e.message).join('\n'));

const csv = generateKameCsv(accounting, config, book);
// csv.content  → texto del archivo
// csv.fileName → Centralizacion_Remuneraciones_[EMPRESA]_[PERIODO].csv
```

`scripts/runRealPayroll.ts` es exactamente eso y sirve como referencia ejecutable.

---

## 9. Lista de verificación de la integración

- [ ] Copiada la carpeta `src/modules/remuneraciones/`
- [ ] (Multiempresa) El catálogo viene del backend y usa el RUT sin puntos como clave
- [ ] Instalado `xlsx@^0.18.5`
- [ ] Creada la ruta/página que renderiza `<RemuneracionesModule />`
- [ ] (Next.js) La página está marcada `'use client'`
- [ ] `styles.css` se está cargando (verificar que la interfaz no se vea sin estilos)
- [ ] Variables `--crm-*` ajustadas a la identidad visual
- [ ] `tipoComprobante` y `unidadNegocio` por defecto ajustados a su Kame
- [ ] `accountPattern` ajustado al formato de su plan de cuentas
- [ ] Decidida la persistencia: `localStorage` o `ConfigRepository` propio
- [ ] Probado con un libro real: carga → configuración → validación → previsualización → CSV
- [ ] El CSV descargado importa correctamente en Kame
- [ ] Pruebas copiadas y ejecutándose en CI (opcional)
