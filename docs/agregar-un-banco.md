# Agregar un banco

Cada banco tiene un **lector**: una función pura que recibe un correo ya convertido a texto y devuelve un movimiento crudo. No toca Gmail ni la hoja, así que se prueba con correos de ejemplo.

## 1. Consigue un correo de ejemplo y anonimízalo

Guarda el HTML de una notificación real en `tests/fixtures/correos/<banco>-<tipo>.html` y **reemplaza** nombres, números de tarjeta y cuenta, números de operación y montos por valores inventados (usa "Ana Prueba", tarjetas `1111`/`2222`, cuentas `3333`/`4444`).

## 2. Escribe la prueba primero

```js
// tests/lector-<banco>.test.js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { correo } = require('./correos');

test('consumo con tarjeta de <banco>', () => {
  const e = crearEntorno();
  const c = correo(e, '<banco>-consumo.html', { remitente: 'alertas@<banco>.pe', asunto: 'Consumo con tu tarjeta' });
  assert.deepStrictEqual(e.llamar('leerCorreo<Banco>_', c).crudo, {
    tipo: 'gasto', monto: 45.5, moneda: 'PEN', comercio: 'COMERCIO PRUEBA', numero_origen: '1111',
    fecha: '2026-10-06', ref_externa: 'gmail:<banco>-consumo',
  });
});
```

## 3. Escribe el lector en `src/parsers/<banco>.js`

```js
const REMITENTE_<BANCO> = 'alertas@<banco>.pe';

function leerCorreo<Banco>_(correo) {
  if (correo.remitente !== REMITENTE_<BANCO>) return null;      // remitente exacto
  const t = correo.texto;                                        // una sola línea de texto
  const monto = new RegExp('Consumo de ' + PATRON_MONTO).exec(t);
  const tarjeta = /Tarjeta\s*\*+\s*(\d{4})/.exec(t);
  const comercio = /Comercio\s+(.+?)\s+Fecha/.exec(t);
  if (!monto || !tarjeta || !comercio) return { pendiente: 'No se pudo leer el consumo.' };
  return { crudo: Object.assign({ tipo: 'gasto' }, leerMonto_(monto[1], monto[2]), {
    comercio: comercio[1].trim(), numero_origen: tarjeta[1], fecha: correo.fecha, ref_externa: 'gmail:' + correo.id,
  }) };
}
```

Reglas del movimiento crudo: `tipo` (`gasto`/`ingreso`/`transferencia`), `monto` positivo, `moneda` (`PEN`/`USD`), `numero_origen` (últimos 4 dígitos), `numero_destino` en transferencias, `usa_yape: true` si el correo no trae número y sale de la cuenta de Yape, `tc` si el correo trae tipo de cambio. Nunca pongas claves con `undefined`.

Devuelve `null` si el correo no es una operación (publicidad, estados de cuenta) y `{ pendiente }` si es una operación que no pudiste leer: así aparece en "Correos que no se pudieron leer" y no se pierde.

## 4. Regístralo en `src/parsers/lectores.js`

Agrega la función a `lectoresDeCorreo_()` y el dominio del remitente a `REMITENTES_BANCARIOS`.

## 5. Corre las pruebas y abre un PR

```bash
npm test && npm run lint
```
