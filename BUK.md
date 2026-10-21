# Conexión con Buk (API)

Trae las liquidaciones cerradas de un mes desde Buk y las entrega al módulo como si fueran un
libro Excel. El resto del flujo (conceptos, cuentas, asiento, validaciones, CSV Kame) no cambia.

```
Navegador ──/api/buk/payroll──▶ Proxy (server/) ──auth_token──▶ https://<cuenta>.buk.cl/api/v1/chile
                                   │  token solo aquí
                                   └─ payroll_detail/month + employees + companies ─▶ PayrollBook
```

## Configuración (servidor, nunca en el repo)

1. En Buk: *API Key → Crear API Key*, **solo lectura**, con *Limitar acceso por Empresas* activado.
2. Variables de entorno (ver `.env.example`):
   - `BUK_TOKEN_EXTERILIZA` — el token.
   - `BUK_COMPANIES` — JSON con `id`, `subdomain`, `tokenEnv` y, opcionalmente, `name`/`rut`.
     Si informa `rut`, se verifica contra el de Buk. Si la cuenta tiene más de una empresa,
     `bukCompanyId` es obligatorio (si no, la carga se aborta).
3. `npm run dev` (el proxy corre dentro de Vite) o `npm run server` (puerto 8787, solo localhost).
4. En la pantalla de carga aparece **“Traer desde Buk”** solo si el proxy responde.

Prueba por consola, sin UI y sin imprimir datos de personas:
`npx tsx scripts/runBukPayroll.ts exteriliza 2026-08`

> Publicar el proxy fuera de localhost exige ponerlo detrás de autenticación: cada llamada
> devuelve remuneraciones individuales.

Revisar muchos meses de una vez (cuáles están cerrados, cuántas liquidaciones, si el asiento cuadra):
`npx tsx scripts/scanBukPeriods.ts exteriliza 2025-01 2026-10`

## Comportamientos de la API verificados con datos reales

| Hecho | Consecuencia en el código |
|---|---|
| `date=DD/MM/AAAA` **no falla**: Buk lo ignora y devuelve el mes abierto (borrador); `01/08/2026` se lee como 8 de enero. Solo `AAAA-MM-DD` filtra. | El cliente siempre envía ISO. Además el adaptador rechaza cualquier liquidación cuyo mes/año no sea el pedido. |
| `page_size` se ignora (páginas de 25). | Se pagina por `pagination.next`, aceptando solo enlaces https del mismo host (el token no sale a otro dominio). |
| Meses sin cerrar vienen con `closed=false`. | Se rechazan; hay que cerrar el mes en Buk. |
| Sin cabecera `Accept` Buk responde 406. | El cliente la envía siempre. |
| `payroll_detail` no trae nombre, cargo ni centro de costo. | Se cruzan por RUT con `/employees` (incluye inactivos). |
| `payroll_detail` no informa la empresa. | Cuenta con 1 empresa: se usa esa. Con varias: se filtra por `current_job.company_id`. |
| Líneas `sobregiro`: parte de los descuentos que Buk no alcanzó a retener. Cumple `haberes − descuentos + sobregiro = líquido`. | Se registra como **DEBE** (concepto “… (sobregiro del mes)”). **Debe confirmar la cuenta contable.** |
| Las líneas `informativo` son provisiones de vacaciones. | No se contabilizan; se omiten. |
| La API no entrega fila de totales. | Se omite la validación de cuadratura contra el libro. |

## Limitaciones conocidas

- Un tipo de línea desconocido nunca se descarta: pasa como concepto **sin clasificar** y se avisa.
- No hay centralización por centro de costo todavía (el dato ya viene en cada trabajador).
- Los ids de concepto se derivan del nombre de la línea; si Buk renombra un concepto, aparecerá como nuevo.
