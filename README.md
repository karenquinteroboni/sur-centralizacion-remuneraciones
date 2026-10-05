# Centralización de Remuneraciones → Kame

Módulo autónomo, modular y portable para transformar un **libro de remuneraciones (Excel)**
en un **asiento contable cuadrado** y en el **archivo CSV de importación contable de Kame**.

Está construido para incorporarse posteriormente al aplicativo web de conciliación ya
existente: la lógica de negocio (`core/`) está completamente separada de la interfaz
(`components/`), de modo que el motor puede reutilizarse aunque la capa visual deba
adaptarse a otro framework.

---

## 1. Instalación y ejecución

Requisitos: **Node.js 18+**.

```bash
npm install       # instala dependencias
npm run dev       # servidor de desarrollo (http://localhost:5180)
npm run build     # build de producción a dist/
npm run preview   # sirve el build
npm test          # 160 pruebas automatizadas
npm run typecheck # verificación de tipos
```

Prueba del motor por línea de comandos, **sin renderizar la interfaz**:

```bash
npx tsx scripts/runRealPayroll.ts <libro.xlsx> [configuracion.json] [salida.csv]
```

Ejemplo real ya ejecutado y verificado (ver `ejemplo-salida/`):

```bash
npx tsx scripts/runRealPayroll.ts libro.xlsx \
  ejemplo-salida/plan-de-cuentas-demo.json \
  salida.csv
```

### Dependencias

| Paquete | Uso |
|---|---|
| `react`, `react-dom` | Interfaz (solo la capa `components/`) |
| `xlsx` (SheetJS) | Lectura del Excel en el navegador |
| `vite`, `@vitejs/plugin-react` | Build y servidor de desarrollo |
| `vitest` | Pruebas |
| `typescript`, `tsx` | Tipado y ejecución de scripts |

**No hay ninguna otra dependencia.** La generación del CSV, la codificación
ISO-8859-1, la validación de RUT y el motor contable son código propio.

---

> **Fuente Buk (API):** ver [`BUK.md`](BUK.md).

## 2. Arquitectura

```text
src/modules/remuneraciones/
├── RemuneracionesModule.tsx      ← ÚNICO punto de entrada de la UI
├── index.ts                      ← API pública del módulo
│
├── core/                         ← LÓGICA DE NEGOCIO (sin React, sin DOM)
│   ├── excelParser.ts            ← Excel → PayrollBook normalizado
│   ├── payrollAnalyzer.ts        ← clasificación, duplicados, totalizadores
│   ├── accountingEngine.ts       ← generateAccountingEntries()
│   ├── validationEngine.ts       ← las 9 validaciones
│   ├── kameExporter.ts           ← asiento → CSV Kame
│   ├── kameFields.ts             ← campos analíticos exigidos por la cuenta
│   ├── configStore.ts            ← parametrización reutilizable por empresa
│   └── companyRegistry.ts        ← cartera multiempresa (opcional)
│
├── components/                   ← UI (React, reemplazable)
│   ├── CompaniesPanel.tsx        ← Vista 0: cartera de empresas (opcional)
│   ├── UploadPayroll.tsx         ← Vista 1: carga
│   ├── ConceptsTable.tsx         ← Vista 2: tabla editable de conceptos
│   ├── ConceptConfig.tsx         ← Vista 2: panel de configuración
│   ├── CopyKameFields.tsx        ← Vista 2: replicar campos a otras cuentas
│   ├── ValidationPanel.tsx       ← Vista 3: validaciones
│   ├── AccountingPreview.tsx     ← Vista 4: previsualización del asiento
│   ├── ExportResult.tsx          ← Vista 5: resultado y descarga
│   ├── Stepper.tsx
│   └── ui.tsx                    ← Card, Button, Badge, Stat, Alert…
│
├── types/
│   ├── payroll.ts                ← contratos de datos (única fuente de verdad)
│   └── company.ts                ← contratos del catálogo multiempresa
├── utils/
│   ├── rutValidator.ts           ← RUT chileno, módulo 11
│   ├── numberUtils.ts            ← parseo/formato de montos
│   ├── conceptUtils.ts           ← normalización + diccionarios
│   └── csvUtils.ts               ← CSV y codificación Latin-1
├── config/exampleConfiguration.json
└── styles.css                    ← todas las clases con prefijo `crm-`
```

**Regla de dependencias:** `components/` puede importar de `core/`, `utils/` y `types/`.
`core/` **nunca** importa de `components/`. Por eso el motor funciona igual en Node,
en un worker o en un backend.

### Flujo de datos

```text
Excel ──parsePayrollWorkbook──▶ PayrollBook
                                   │
                                   ├──analyzePayroll──▶ ConceptAnalysis[]   (sugerencias)
                                   │
        CentralizationConfig ◀──buildWorkingConfig──────┘   (+ config guardada)
                     │
                     └──generateAccountingEntries──▶ AccountingResult
                                                          │
                                validateCentralization ◀──┤
                                                          │
                                      generateKameCsv ◀───┘ ──▶ CSV Kame
```

---

## 3. Uso

### 3.0 Vista 0 — Cartera de empresas (opcional)

Si el aplicativo anfitrion entrega un catalogo de empresas, el asistente
comienza con un panel de cartera:

```tsx
<RemuneracionesModule companies={await api.get('/empresas')} />
```

Sin la prop `companies` el modulo funciona exactamente como antes: se parte
cargando un archivo. Con ella se agrega un paso previo que muestra:

- **Resumen de cartera**: empresas totales, parametrizadas, centralizadas en el
  periodo y pendientes.
- **Listado** con RUT, grupo, estado de parametrizacion y ultimo periodo
  centralizado, con busqueda, filtros por faceta y vista agrupada por holding.
- **Semaforo por empresa**: lista / incompleta / sin configurar.

El estado se calcula **exclusivamente** desde la configuracion realmente
guardada en el repositorio: una empresa sin parametrizar aparece como
«Sin configurar». El panel nunca simula avance.

**Salvaguarda de RUT.** Al elegir una empresa y cargar un libro, el modulo
compara el RUT de la cabecera del Excel con el de la empresa seleccionada y
bloquea la carga si no coinciden. Con decenas de empresas, centralizar el libro
equivocado es el error mas facil de cometer y el mas caro de deshacer.

El catalogo acepta formatos laxos —`Company`, `{nombre, rut}` o un string— y
**preserva los campos propios** que agregue el anfitrion (responsable, cartera,
lo que sea), de modo que `renderCompanyExtra` y `companyFacets` puedan usarlos:

```tsx
<RemuneracionesModule
  companies={empresas}
  companyFacets={[
    { id: 'adp', label: 'Responsable', options: responsables.map(r => ({
        value: r, label: r, match: row => (row.company as MiEmpresa).adp === r })) },
  ]}
  renderCompanyExtra={(row) => <>ADP: {(row.company as MiEmpresa).adp}</>}
/>
```

### 3.1 Vista 1 — Carga

Se arrastra o selecciona el Excel. El módulo:

- elige la hoja con más contenido;
- **detecta la fila de títulos por puntuación heurística**, no por posición fija
  (puntúa textos distintos, penaliza números en la propia fila, premia la presencia de
  `RUT`/`NOMBRES`/`AP PATERNO`… y que las filas siguientes sean numéricas);
- extrae empresa, RUT y período de las filas de cabecera;
- localiza la fila de totales y la excluye de los trabajadores;
- construye la lista de trabajadores y de conceptos.

Todo ocurre **en el navegador**. El archivo no se sube a ningún servidor y no se escriben
datos personales en consola.

### 3.2 Vista 2 — Configuración de conceptos

Tabla editable: `Incluir | Concepto | Tipo detectado | Total | Cuenta | Tercero | Estado`.

Cada concepto tiene un **identificador interno único**. Dos columnas con el mismo título
visual reciben identificadores distintos:

| Título en el Excel | Columna | Identificador interno |
|---|---|---|
| `HORAS EXTRAS` | 17 | `HORAS_EXTRAS_01` |
| `HORAS EXTRAS` | 27 | `HORAS_EXTRAS_02` |

La interfaz muestra el título original y una insignia «duplicado #n»; internamente jamás
se confunden.

**Clasificaciones y naturaleza contable:**

| Clasificación | Movimiento generado |
|---|---|
| `HABER` | **DEBE** (gasto) |
| `DESCUENTO` | **HABER** (pasivo) |
| `NETO` | **HABER** (sueldos por pagar) |
| `APORTE_EMPLEADOR` | **DEBE** en cuenta de gasto **+ HABER** en cuenta de obligación |
| `TOTALIZADOR` | ninguno |
| `INFORMATIVO` | ninguno |

Un monto negativo invierte automáticamente la naturaleza, de modo que todas las líneas
salen con importes positivos (requisito de Kame).

**Modalidad de tercero**, configurable de forma independiente por concepto:

- `CONSOLIDATED` → un único movimiento con el total.
- `PER_WORKER` → un movimiento por trabajador, tomando RUT y nombre **directamente del
  Excel** (`Rut Ficha` y `Rzn Social Ficha`). No se pide nada al usuario.

### 3.2.1 Campos que exige la cuenta en Kame

En Kame no todas las cuentas admiten los mismos campos: las cuentas con ficha
exigen **Rut Ficha** y **Rzn Social Ficha**, y las de pasivo con seguimiento
documental exigen **Nombre Doc**, **Folio Doc** y **Fecha Venc**. Por eso la
elección es **por cuenta** (es decir, por concepto), no global del comprobante.

Cada concepto tiene cinco interruptores independientes. Lo que quede apagado se
emite **vacío**, que es lo que Kame espera cuando la cuenta no maneja esa columna.

| Campo | Orígenes disponibles |
|---|---|
| `Rut Ficha` / `Rzn Social Ficha` | **Del trabajador** (una línea por persona, tomando RUT y nombre del libro) · **Tercero fijo** (AFP, Isapre, mutual: se escribe una vez en la parametrización) · **La empresa** (RUT y razón social de la cabecera del libro) |
| `Nombre Doc` | Texto fijo por concepto (`PLANILLA`, `F29`…) |
| `Folio Doc` | **El período** del libro en formato `AAAAMM` · **Valor fijo** |
| `Fecha Venc` | **Día fijo del mes siguiente** (se recalcula solo en cada período; si el mes no tiene ese día se usa el último) · **Fecha exacta** |

Ejemplo real, del archivo en `ejemplo-salida/`:

```text
… ;2.01.03.01;0;3320961;PREVIS;   ;   ;PLANILLA;202607;10/08/2026; …
… ;2.01.03.06;0;1385835;IMPUESTO; ;   ;F29     ;202607;12/08/2026; …
… ;2.01.01.01;0;357235;Sueldo liquido…;21121573-9;Valentina Andrea Becerra Encalada;;;; …
… ;5.01.01.01;30043989;0;SUELDO BASE;  ;   ;        ;      ;          ; …
```

Las cotizaciones llevan planilla con vencimiento el día 10; el impuesto único
lleva F29 con vencimiento el 12; el líquido lleva ficha del trabajador y ningún
documento; y las cuentas de gasto no llevan nada.

#### Replicar la parametrización a otras cuentas

Una vez escrito el RUT, la razón social, el documento, el folio y el vencimiento en
un concepto, el botón **«Copiar estos campos a otros conceptos…»** abre un diálogo
para replicarlos sin volver a digitarlos.

- **Qué copiar**: se elige por **grupo** —Ficha, Documento, Folio, Vencimiento—,
  nunca campo a campo, porque los valores de un grupo carecen de sentido por
  separado (el origen de la ficha sin el RUT, el modo de vencimiento sin el día).
  Vienen premarcados los grupos que el origen tiene encendidos.
- **A dónde**: la lista llega presugerida con los conceptos de la **misma
  clasificación** que el origen —el agrupamiento que en la práctica comparte
  tratamiento— y ordenada con esos primeros. Se puede buscar, seleccionar por
  clasificación (`+ Haber`, `+ Descuento`, `+ Aporte empleador`, `+ Neto`) o
  marcar uno por uno. **Nada se aplica sin confirmar.**
- **Qué se sobrescribe**: cada destino muestra los campos que ya tiene, y los que
  quedarían reemplazados con un valor distinto se marcan con `⚠ se reemplaza: …`.
  El pie del diálogo resume cuántos destinos están en esa situación.
- **Copiar un grupo no toca los demás**: replicar el documento respeta la ficha
  que el destino ya tenía parametrizada.
- **Deshacer**: tras aplicar aparece un aviso con el recuento y un botón
  **Deshacer** que restaura la parametrización anterior de todos los destinos.

**Compatibilidad.** Las configuraciones guardadas antes de esta funcionalidad no
traen esta sección: se derivan de la modalidad de tercero y el archivo generado
queda **byte a byte idéntico** al que producían antes. Hay una prueba que lo
verifica (`kameFields.test.ts`), así que no hace falta migrar nada.

### 3.2.2 Continuidad mes a mes

El ciclo previsto es: se parametriza una vez, se guarda, y los meses siguientes
solo se carga el libro nuevo.

**Se conserva** (queda como predeterminado y no hay que volver a escribirlo):

| Dato | Dónde vive |
|---|---|
| Cuenta contable, y cuentas de gasto/obligación de los aportes | `account`, `expenseAccount`, `liabilityAccount` |
| Clasificación contable | `classification` |
| Incluir / excluir, incluidas las exclusiones hechas a mano | `include` |
| Modalidad de tercero | `thirdPartyMode` |
| RUT y razón social de la ficha fija | `kameFields.fichaRut`, `fichaRazonSocial` |
| Documento asociado | `kameFields.nombreDoc` |
| Glosa de línea, unidad de negocio, reglas especiales | resto de `ConceptConfig` |

**Se recalcula solo** desde el período del libro cargado:

| Dato | Cómo |
|---|---|
| `Folio Doc` | con origen «el período del libro»: `202607` → `202608` |
| `Fecha Venc` | con origen «día fijo del mes siguiente»: `10/08/2026` → `10/09/2026` |
| `Fecha` y `Número Movimiento` del comprobante | siguen al período |

⚠️ **Los modos «valor fijo» y «fecha exacta» NO se recalculan**, por definición:
son valores escritos a mano. Como eso puede pasar inadvertido de un mes a otro,
el módulo ahora **advierte** (sin bloquear) cuando detecta que quedaron del
período anterior:

- `V10_FOLIO_DE_OTRO_PERIODO` — el folio fijo menciona otro período. Reconoce
  tanto `202607` como `JULIO`, así que detecta `PLANILLA-JULIO` en agosto.
- `V10_VENCIMIENTO_DE_OTRO_PERIODO` — la fecha fija es anterior al cierre del
  período que se está centralizando.

Si usa «período del libro» y «día fijo del mes siguiente», no aparece ninguna
advertencia: todo se actualiza solo.

**Los conceptos nuevos llegan siempre sin cuenta.** Cuando aparece una columna
que no existía, el módulo:

- la marca como **«Nuevo concepto detectado: requiere parametrización»**;
- deja `account`, `expenseAccount` y `liabilityAccount` **vacíos**, aunque el
  diccionario sepa clasificarla (un `BONO PRODUCTIVIDAD` se sugiere como Haber,
  pero sin cuenta);
- no le hereda ficha, documento ni vencimiento de ningún otro concepto;
- **bloquea la exportación** con `V1_SIN_CUENTA` hasta que se le asigne una.

El re-emparejamiento es por identificador interno y, como respaldo, por título +
ocurrencia, así que **sobrevive a cambios en el orden de las columnas**: si el
bono nuevo entra en medio del libro, las cuentas siguen pegadas al concepto
correcto y no a la posición.

### 3.3 Detección de totalizadores

Se combinan dos señales:

1. **Nombre**: `TOTAL…`, `SUBTOTAL`, `SUMA`…
2. **Relación matemática verificada fila a fila** (no solo sobre el gran total):
   - bloque contiguo de columnas anteriores cuya suma reproduce la columna
     (`TOTAL HABERES` = SUELDO BASE + GRATIFICACIÓN + … );
   - diferencia entre dos columnas anteriores (`LÍQUIDO` = TOTAL HABERES − TOTAL DESCUENTOS).

Se exige que al menos el 90 % de las filas con movimiento cuadren y que ambas columnas de
una diferencia tengan valores, para no producir falsos positivos con columnas vacías.

El líquido se reconoce como diferencia pero **se mantiene clasificado como `NETO`**: es lo
contablemente correcto y no genera advertencia.

**Advertencia de doble contabilización:** si se incluye un totalizador *y* los conceptos
que lo componen, aparece el aviso

> «Este concepto parece corresponder a una suma de conceptos seleccionados. Su inclusión
> podría generar doble contabilización.»

No bloquea (salvo que se active `strictDoubleCounting`), pero además el asiento quedará
descuadrado y **eso sí** bloquea.

### 3.4 Vista 3 — Validaciones

| # | Validación | Severidad |
|---|---|---|
| V1 | Todo concepto incluido tiene cuenta (los aportes, las dos) | ERROR |
| V2 | Todo concepto incluido tiene clasificación | ERROR |
| V3 | Las cuentas cumplen el formato (`^[0-9A-Za-z]+([.\-][0-9A-Za-z]+)*$`, mín. 3 car.) | ERROR |
| V4 | No quedan conceptos ambiguos sin resolver | ERROR |
| V5 | Posible doble contabilización | ADVERTENCIA (configurable a ERROR) |
| V6 | Terceros con RUT válido (módulo 11) | ERROR |
| V7 | Terceros con nombre | ERROR |
| V8 | Totales del Excel vs. sumas contabilizadas | ADVERTENCIA |
| V9 | Asiento completamente cuadrado | ERROR |
| V10 | Los campos exigidos por la cuenta tienen valor resoluble (ficha, documento, folio, vencimiento) | ERROR |
| V10 | El folio fijo o la fecha fija quedaron del período anterior | ADVERTENCIA |

La vista muestra **TOTAL DEBE**, **TOTAL HABER**, **DIFERENCIA** y el veredicto
`✓ CENTRALIZACIÓN BALANCEADA` / `✕ CENTRALIZACIÓN NO BALANCEADA`.
Con diferencia distinta de cero **no se puede exportar**, salvo que el aplicativo
anfitrión pase la opción administrativa:

```tsx
<RemuneracionesModule validationOptions={{ allowUnbalancedExport: true }} />
```

### 3.5 Vista 4 — Previsualización

Tabla `Cuenta | Concepto | Debe | Haber | RUT | Tercero`, con Total Debe, Total Haber,
Diferencia y Cantidad de movimientos, más una vista de resumen por cuenta y por
clasificación.

### 3.6 Vista 5 — Resultado y descarga

Verificación automática de la estructura y descarga del CSV.
Nombre generado:

```text
Centralizacion_Remuneraciones_[EMPRESA]_[PERIODO].csv
```

---

## 4. Configuración

### 4.1 Parametrización reutilizable por empresa

La configuración se guarda con clave = **RUT de la empresa** (o su nombre normalizado si no
hay RUT). Al volver a cargar un libro de la misma empresa se reutiliza automáticamente.

El re-emparejamiento es doble: primero por identificador interno y, como respaldo, por
título + número de ocurrencia. Así sobrevive a cambios en el orden de las columnas.

Un concepto que no existía muestra:

> **«Nuevo concepto detectado: requiere parametrización»**

y **nunca** se le asume una cuenta: `account` queda vacío y `classification` en `null`.

Persistencia: por defecto `localStorage` (procesamiento local). Se puede inyectar otro
repositorio:

```tsx
import { RemuneracionesModule, type ConfigRepository } from '@/modules/remuneraciones';

const apiRepo: ConfigRepository = {
  async load(companyKey)  { return (await fetch(`/api/config/${companyKey}`)).json(); },
  async save(config)      { await fetch('/api/config', { method: 'POST', body: JSON.stringify(config) }); },
  async remove(companyKey){ await fetch(`/api/config/${companyKey}`, { method: 'DELETE' }); },
  async list()            { return (await fetch('/api/config')).json(); },
};

<RemuneracionesModule configRepository={apiRepo} />
```

También se puede exportar/importar la configuración como `.json` desde la interfaz.

### 4.2 Formato de la configuración

`src/modules/remuneraciones/config/exampleConfiguration.json` es la plantilla.
**Todas las cuentas van vacías a propósito**: el módulo no inventa cuentas contables.

```json
{
  "conceptId": "SUELDO_BASE_01",
  "label": "SUELDO BASE",
  "include": true,
  "classification": "HABER",
  "account": "",
  "thirdPartyMode": "CONSOLIDATED"
}
```

Para un aporte del empleador:

```json
{
  "conceptId": "SIS_01",
  "label": "SIS",
  "include": true,
  "classification": "APORTE_EMPLEADOR",
  "expenseAccount": "",
  "liabilityAccount": "",
  "thirdPartyMode": "CONSOLIDATED"
}
```

Reglas especiales opcionales por concepto: `invertNature`, `ignoreNegative`, `factor`,
`minAmount`.

---

## 5. Generación del CSV de Kame

La estructura está tomada literalmente del archivo de referencia
`Ejemplo_importador_Contable (21).csv`:

```text
TipoComprobante;FolioAuto;Folio;Fecha;Comentario;Cuenta;Debe;Haber;Comentario Linea;Rut Ficha;Rzn Social Ficha;Nombre Doc;Folio Doc;Fecha Venc;Unidad Negocio;Tipo Movimiento;Número Movimiento
```

Las cinco columnas analíticas (`Rut Ficha`, `Rzn Social Ficha`, `Nombre Doc`,
`Folio Doc`, `Fecha Venc`) se llenan según la parametrización de cada cuenta
(§3.2.1). Lo que trae la cabecera del comprobante actúa solo como respaldo para
las cuentas que no las parametrizan.

| Característica | Valor |
|---|---|
| Columnas | 17, en ese orden exacto |
| Separador | `;` |
| Salto de línea | `CRLF` |
| Codificación | ISO-8859-1 (Latin-1) |
| Fecha y Fecha Venc | `d/MM/yyyy` (ej. `2/07/2026`); el vencimiento va vacío si la cuenta no lo maneja |
| Importes | enteros, sin separador de miles; la columna sin monto va en `0` |
| Encapsulado | ninguno |

Como no hay encapsulado, todo texto pasa por `sanitizeCsvValue`, que reemplaza `;` por `,`
y elimina saltos de línea: un nombre con punto y coma no puede romper el archivo.
Los caracteres inexistentes en Latin-1 (comillas tipográficas, guiones largos) se
transliteran a su equivalente ASCII.

### ⚠️ Zona que NO debe modificarse

En `core/kameExporter.ts`:

- la constante `KAME_COLUMNS`
- la función `formatKameDate`
- `CSV_SEPARATOR` y `CSV_EOL` en `utils/csvUtils.ts`
- la función `formatKameAmount` en `utils/numberUtils.ts`

Definen el contrato con el ERP. Cambiarlas rompe la importación. La prueba
`tests/kameExporter.test.ts` compara la cabecera generada contra la cabecera literal del
archivo de referencia y fallará si alguien las toca.

### Decisiones documentadas

- **`TipoComprobante` = `TRASPASO`** por defecto: una centralización de remuneraciones es
  un asiento de traspaso, no un egreso de caja. El archivo de referencia usaba `EGRESO`
  porque documentaba pagos individuales. Es editable desde la interfaz.
- **`Número Movimiento` = período `AAAAMM`**, siguiendo la convención del archivo de
  referencia (`202607`).
- **`Unidad Negocio` = `Casa Matriz`** por defecto, igual que la referencia; editable en la
  cabecera y sobreescribible por concepto.
- **Un solo folio para todo el asiento**: la centralización es un único comprobante.
- **Líneas en cero se omiten**: Kame las rechaza y ensucian el asiento.

---

## 6. Pruebas

```bash
npm test
```

160 pruebas en 8 archivos:

| Archivo | Cubre |
|---|---|
| `excelParser.test.ts` | lectura XLSX real, detección de fila de títulos en distintas posiciones, metadatos, período, fila de totales, sumas por columna, **identificadores únicos para títulos duplicados**, parseo de montos, RUT módulo 11 |
| `payrollAnalyzer.test.ts` | clasificación de haberes/descuentos/neto/aportes, ambigüedad, **detección de totalizadores por nombre y por matemática**, no-falsos-positivos, **advertencia de doble contabilización** |
| `accountingEngine.test.ts` | naturaleza DEBE/HABER, doble línea del aporte empleador, cálculo de haberes y descuentos, columnas duplicadas independientes, **exclusión de totalizadores**, **terceros consolidado vs. por trabajador**, cuadratura, reglas especiales |
| `validationEngine.test.ts` | las 9 validaciones, modo estricto, opción administrativa, **reutilización de configuración y detección de conceptos nuevos** |
| `kameFields.test.ts` | los cinco campos y sus orígenes, cálculo del vencimiento (cambio de año, meses cortos, bisiestos), validaciones V6/V7/V10, **la copia por grupos entre conceptos** (que no muta el original, que respeta los grupos no seleccionados y que omite totalizadores) y **que una configuración antigua produce un archivo idéntico** |
| `continuidadMensual.test.ts` | **el ciclo de dos meses completo**: que las cuentas, la ficha y el documento se reutilizan; que solo cambian folio, vencimiento y cabecera —comparando columna por columna los CSV de julio y agosto—; que un concepto nuevo llega sin cuenta y bloquea; y que se advierte cuando un valor fijo quedó del mes anterior |
| `companyRegistry.test.ts` | normalización del catálogo (string, `{nombre, rut}`, `Company`), **preservación de campos propios del anfitrión**, estado por empresa desde la configuración real, resumen de cartera, cálculo del período anterior, búsqueda y orden |
| `kameExporter.test.ts` | **cabecera idéntica a la del archivo de referencia**, 17 columnas, CRLF, formato de fecha e importes, terceros, nombre de archivo, codificación Latin-1, saneamiento de separadores |

Las pruebas usan un **fixture sintético** (`tests/fixtures/syntheticPayroll.ts`) que
reproduce la estructura de un libro chileno real con datos totalmente inventados: **no hay
datos personales reales en el código** (requisito 15). Los RUT ficticios llevan dígito
verificador correcto para poder probar V6.

Las cifras esperadas se calculan de forma independiente al motor, de modo que las
aserciones verifican realmente el cálculo y no se limitan a repetir su salida.

---

## 7. Resultado con el libro real de referencia

Ejecución de `scripts/runRealPayroll.ts` sobre el libro entregado
(`ejemplo-salida/verificacion-ejecucion.txt` contiene la salida completa):

| Verificación | Resultado |
|---|---|
| Empresa detectada | `JOSE HERRERA SPA (76.562.151-8)` |
| Período detectado | `Julio 2026` → `202607` |
| Fila de títulos | fila 6, detectada automáticamente |
| Fila de totales | fila 31, excluida de los trabajadores |
| Trabajadores | 23 |
| Conceptos | 39 |
| Títulos duplicados | `HORAS EXTRAS` → `HORAS_EXTRAS_01` (965.233) y `HORAS_EXTRAS_02` (118.796) |
| Totalizadores detectados | `TOTAL HABERES`, `TOTAL DESCUENTOS` (excluidos por defecto) |
| Concepto ambiguo | `CUENTA_2` → «requiere parametrización» |
| **TOTAL DEBE** | **39.622.132** |
| **TOTAL HABER** | **39.622.132** |
| **DIFERENCIA** | **0 → ✓ CENTRALIZACIÓN BALANCEADA** |
| Validaciones | 0 errores, 0 advertencias |
| Movimientos | 52 |
| CSV generado | 17 columnas, estructura válida, ISO-8859-1, CRLF |

Comprobación contable independiente:

```text
DEBE   = haberes 37.531.959 + aportes empleador 2.090.173 = 39.622.132
HABER  = descuentos 7.535.322 + líquido 29.996.637
         + obligaciones empleador 2.090.173               = 39.622.132
```

Y la identidad del libro: `37.531.959 − 7.535.322 = 29.996.637` ✓

Los archivos en `ejemplo-salida/` son:

- `Centralizacion_Remuneraciones_JOSE_HERRERA_SPA_Julio_2026.csv` — salida Kame real.
- `plan-de-cuentas-demo.json` — configuración usada, con **cuentas ficticias**
  (`5.01.01.xx`, `2.01.03.xx`…). El libro de origen no trae cuentas, así que se usaron
  placeholders coherentes, tal como pide el requisito 6.
- `verificacion-ejecucion.txt` — log completo de la ejecución.

---

## 7.1 Guardado de archivos en entornos especiales

`downloadFile` usa el ancla `<a download>` del navegador. En entornos donde eso
no funciona (un contenedor Electron, un puente móvil, un visor con descargas
restringidas) se puede desviar el guardado sin tocar el módulo:

```ts
import { setFileSaver } from '@/modules/remuneraciones';

setFileSaver(async (blob, fileName) => {
  await miPuente.guardarArchivo(fileName, await blob.arrayBuffer());
});
```

`setFileSaver(null)` restaura el comportamiento estándar.

## 8. Privacidad

- El Excel se procesa **íntegramente en el navegador** (FileReader + SheetJS).
- No se hace ninguna petición de red con datos del libro.
- No hay `console.log` de datos personales; el único registro opcional
  (`onExported`) recibe solo metadatos.
- La configuración guardada contiene **cuentas y clasificaciones**, nunca nombres ni RUT
  de trabajadores.
- El repositorio por defecto es `localStorage`, local al equipo del usuario.
- Los archivos de prueba no contienen datos reales.

---

## 9. Integración en el aplicativo existente

Ver **[INTEGRACION.md](./INTEGRACION.md)** para el paso a paso completo: qué carpetas
copiar, qué dependencias instalar, qué componente importar, qué servicios conectar y qué
partes del código no deben modificarse.
