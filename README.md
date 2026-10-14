# 💸 Finanzas personales

[![CI](https://github.com/BrunoRioja/finanzas-personales/actions/workflows/ci.yml/badge.svg)](https://github.com/BrunoRioja/finanzas-personales/actions/workflows/ci.yml)
![Licencia MIT](https://img.shields.io/badge/licencia-MIT-7c5cff)

> **EN —** Self-hosted personal finance app built on Google Apps Script + Google Sheets. Each person runs their own copy in their own Google account: no servers, no shared data. Roadmap: bank-notification emails parsed automatically, a Telegram bot that only asks about what it doesn't know, and Gemini for voice notes and receipts.

App de finanzas personales que vive en **tu propia cuenta de Google**. Registra gastos, ingresos y transferencias, y muestra en un dashboard en qué se va tu dinero — en el celular y en la laptop.

| Laptop | Celular |
|---|---|
| ![Dashboard en laptop](docs/img/dashboard-laptop.png) | ![Dashboard en celular](docs/img/dashboard-movil.png) |

## Qué hace hoy (v0.5)

- **Lectura automática de correos** del BCP y Yape (consumos con débito y crédito en S/ y $, PLIN, yapeos enviados y recibidos, transferencias entre cuentas, pago de tarjeta, pago de servicios), cada 5 minutos o con la frecuencia que elijas.
- **Bandeja "Por revisar"**: lo que la app no sabe categorizar se resuelve con un toque y queda como regla para la próxima vez.
- **Bot de Telegram:** te pregunta solo por las compras que no reconoce (un toque para elegir la categoría y recordarla), registra lo que escribes (`taxi 12 yape`), responde `/hoy`, `/mes` y `/deshacer`, y te manda un resumen a las 21:00 los días con movimientos.
- **Presupuestos por categoría:** pones un monto a las categorías que quieres controlar (con lo que gastaste el mes pasado como referencia), el Inicio muestra cuánto llevas contra lo planeado y el bot te avisa al llegar al 80 % y al 100 %.
- **Dividir** una compra entre varias categorías (supermercado + aseo + ropa).
- **Dashboard:** ingresos, gastos, ahorro y tasa de ahorro del mes; gasto por categoría; tendencia de 6 meses; saldos por cuenta; comercios donde más gastas.
- **Movimientos:** registro rápido desde el botón **+**, filtros por mes, cuenta, categoría y texto. Gastos en soles y dólares.
- **Cuentas y categorías** configurables; tarjetas de crédito con deuda en negativo.
- **Asistente de instalación** que pregunta tus bancos, cuentas y categorías.
- **Modo demo** con datos ficticios en una hoja aparte.

## Hoja de ruta

| Versión | Qué agrega | Estado |
|---|---|---|
| v0.1 | Núcleo, dashboard, registro manual, asistente, demo | ✅ |
| v0.2 | Lectura automática de correos del banco (BCP, Yape), bandeja y dividir | ✅ |
| v0.3 | Bot de Telegram: solo pregunta lo que no conoce, resumen diario | ✅ |
| v0.4 | Gemini: foto de boleta para dividir compras (a decidir con el uso real) | ⏸️ |
| v0.5 | Presupuestos por categoría y avisos por Telegram | ✅ |
| v0.6 | Próximos pagos: estado de cuenta de la tarjeta y pagos recurrentes | ⏳ |
| v0.7 | Plantilla "Hacer una copia" y pulido del README | ⏳ |

## Instalación

Ver [docs/instalacion.md](docs/instalacion.md). Resumen para desarrolladores:

```bash
git clone https://github.com/BrunoRioja/finanzas-personales.git
cd finanzas-personales
npm install
npx clasp login
npm run setup      # crea tu Google Sheet y el proyecto de Apps Script
git checkout src/appsscript.json
npm run deploy     # sube el código y publica la web app (solo tú puedes abrirla)
```

## Decisiones técnicas

- **Apps Script + Google Sheets:** gratis, sin servidores, los datos quedan en la cuenta de cada persona y se pueden abrir y exportar como cualquier hoja.
- **Lógica pura separada de Google:** `src/core/` no depende de servicios de Google, así que se prueba en Node con un arnés que simula Sheets (`tests/harness.js`). Solo `src/core/repo.js` toca la hoja.
- **Sin doble conteo:** pagar la tarjeta o mover plata entre tus cuentas es una *transferencia*, no un gasto. El gasto se cuenta una sola vez, cuando compras.
- **Multimoneda simple:** cada movimiento guarda su moneda original y su equivalente en soles con el tipo de cambio; el dashboard suma en soles.
- **Columnas por encabezado:** la app ubica cada columna por su nombre, así que puedes reordenar columnas o agregar las tuyas en la hoja sin romper nada.
- **Lectores deterministas por banco:** cada banco es una función pura con sus correos de ejemplo anonimizados como pruebas; agregar uno no toca el resto ([docs/agregar-un-banco.md](docs/agregar-un-banco.md)). Un correo que no se entiende queda visible en la bandeja, nunca se pierde.
- **Gmail con el permiso mínimo útil:** `gmail.modify` solo para buscar, leer y etiquetar; la app recuerda qué correos ya leyó por su id, no por la etiqueta.
- **Bot sin abrir la app:** un receptor público mínimo recibe el webhook de Telegram y usa la app como biblioteca; la app y los datos siguen siendo "solo yo" ([docs/arquitectura.md](docs/arquitectura.md)).

Más detalle en [docs/arquitectura.md](docs/arquitectura.md) y el diseño completo en [docs/superpowers/specs](docs/superpowers/specs/2026-10-13-app-finanzas-design.md).

## Desarrollo

```bash
npm test          # pruebas (node:test)
npm run lint      # ESLint
npm run ui -- "mostrar('movimientos')" vista captura.png 420   # revisar la interfaz en Chrome con datos simulados
```

## Privacidad

Tus datos viven solo en tu Google Sheet. Lee [docs/privacidad.md](docs/privacidad.md).

## Licencia

[MIT](LICENSE)
