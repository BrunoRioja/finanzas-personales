# 💸 Finanzas personales

[![CI](https://github.com/USUARIO_GITHUB/finanzas-personales/actions/workflows/ci.yml/badge.svg)](https://github.com/USUARIO_GITHUB/finanzas-personales/actions/workflows/ci.yml)
![Licencia MIT](https://img.shields.io/badge/licencia-MIT-7c5cff)

> **EN —** Self-hosted personal finance app built on Google Apps Script + Google Sheets. Each person runs their own copy in their own Google account: no servers, no shared data. Roadmap: bank-notification emails parsed automatically, a Telegram bot that only asks about what it doesn't know, and Gemini for voice notes and receipts.

App de finanzas personales que vive en **tu propia cuenta de Google**. Registra gastos, ingresos y transferencias, y muestra en un dashboard en qué se va tu dinero — en el celular y en la laptop.

| Laptop | Celular |
|---|---|
| ![Dashboard en laptop](docs/img/dashboard-laptop.png) | ![Dashboard en celular](docs/img/dashboard-movil.png) |

## Qué hace hoy (v0.1)

- **Dashboard:** ingresos, gastos, ahorro y tasa de ahorro del mes; gasto por categoría; tendencia de 6 meses; saldos por cuenta; comercios donde más gastas.
- **Movimientos:** registro rápido desde el botón **+**, filtros por mes, cuenta, categoría y texto. Gastos en soles y dólares.
- **Cuentas y categorías** configurables; tarjetas de crédito con deuda en negativo.
- **Asistente de instalación** que pregunta tus bancos, cuentas y categorías.
- **Modo demo** con datos ficticios en una hoja aparte.

## Hoja de ruta

| Versión | Qué agrega | Estado |
|---|---|---|
| v0.1 | Núcleo, dashboard, registro manual, asistente, demo | ✅ |
| v0.2 | Lectura automática de correos del banco (BCP, Yape) | ⏳ |
| v0.3 | Bot de Telegram: solo pregunta lo que no conoce, resumen diario | ⏳ |
| v0.4 | Gemini: audios, foto de boleta, dividir compras | ⏳ |
| v0.5 | Presupuestos, próximos pagos, plantilla "Hacer una copia" | ⏳ |

## Instalación

Ver [docs/instalacion.md](docs/instalacion.md). Resumen para desarrolladores:

```bash
git clone https://github.com/USUARIO_GITHUB/finanzas-personales.git
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
