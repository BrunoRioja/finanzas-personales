# Arquitectura

```
Navegador (celular / laptop)          Trigger cada 5 min
        │  google.script.run                  │
        ▼                                     ▼
src/web/        api.js · api-revisar.js · vistas .html      src/ingesta/   revisar.js · activacion.js
        │                                                           │  resolver.js (cuenta, regla, tc)
src/setup/      asistente.js · demo.js                              │  gmail.js  ← única capa que toca Gmail
        │                                                    src/parsers/   bcp.js · yape.js · lectores.js (puros)
src/core/       movimientos.js · agregados.js · catalogos.js · divisiones.js · util.js   ← lógica pura
        │
src/core/repo.js   ← única capa que toca SpreadsheetApp (y migra el esquema)
        │
Google Sheet    Movimientos · Divisiones · Cuentas · Categorias · Reglas · Pendientes · Config · Log
```

## Reglas del código

- Apps Script carga todos los archivos en un mismo ámbito global. Las funciones que el navegador puede llamar **no** terminan en `_`; las internas **sí** (Apps Script las oculta al navegador).
- Toda escritura pasa por `conBloqueo_` para evitar choques entre pestañas.
- Las fechas se guardan como texto `yyyy-MM-dd` en columnas con formato texto, y se leen convirtiendo cualquier `Date` que Sheets devuelva.
- Cada columna se ubica por su encabezado: se puede reordenar la hoja o agregar columnas propias.

## Modelo de datos

| Hoja | Para qué |
|---|---|
| Movimientos | Gastos, ingresos y transferencias. `monto` en la moneda original, `monto_pen` en soles. |
| Divisiones | Partes de un movimiento dividido entre categorías (se usa desde v0.2). |
| Cuentas | Débito, crédito (saldo negativo = deuda), ahorro, billetera, efectivo. `numeros`: últimos 4 dígitos de cuentas y tarjetas (varios por cuenta); `yape`: la cuenta de la que sale Yape. |
| Categorias | De gasto o de ingreso; desactivar conserva el historial. |
| Reglas | Comercio → categoría (se usa desde v0.2). |
| Pendientes | Correos bancarios que ningún lector pudo leer (se registran a mano o se descartan). |
| Config | Nombre, tipo de cambio, versión del esquema. Nunca secretos. |
| Log | Errores de procesos automáticos (desde v0.2). |

## Pruebas

`tests/harness.js` carga `src/**/*.js` en un contexto `vm` de Node con Sheets, Properties, Lock y Utilities simulados. `tests/ui/ver.js` abre la interfaz real en Chrome sin cabeza con `google.script.run` simulado (`tests/ui/stub.js`) para revisarla y tomar capturas.
