# Ejemplo de salida generado con el libro de referencia

Archivos de esta carpeta:

| Archivo | Descripción |
|---|---|
| `Centralizacion_Remuneraciones_JOSE_HERRERA_SPA_Julio_2026.csv` | Salida Kame real, generada por el módulo a partir del libro de remuneraciones entregado. 52 movimientos, 17 columnas, ISO-8859-1, CRLF, separador `;`. |
| `plan-de-cuentas-demo.json` | Configuración usada para generarlo. **Las cuentas son ficticias** (`5.01.01.xx`, `2.01.03.xx`, `2.01.04.xx`): el libro de origen no contiene cuentas contables, por lo que se usaron placeholders coherentes. Reemplácelas por las de su plan de cuentas Kame. |
| `verificacion-ejecucion.txt` | Log completo de la ejecución del núcleo: conceptos detectados, clasificaciones, totales, validaciones y verificación de la estructura del CSV. |

## Resultado

```
TOTAL DEBE ........... 39.622.132
TOTAL HABER .......... 39.622.132
DIFERENCIA ........... 0
ESTADO ............... CENTRALIZACION BALANCEADA
Errores: 0 | Advertencias: 0
```

## Cómo reproducirlo

```bash
npx tsx scripts/runRealPayroll.ts <libro.xlsx> \
  ejemplo-salida/plan-de-cuentas-demo.json \
  salida.csv
```
