const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { ASUNTOS, correo } = require('./correos');

const REMITENTE = 'estadodecuenta@notificacionesbcp.com.pe';
const leer = (e, extra) => e.llamar('leerCorreoBancario_',
  correo(e, 'estado-cuenta.html', Object.assign({ remitente: REMITENTE, asunto: ASUNTOS.estadoCuenta }, extra)));

test('lee totales y mínimos en soles y dólares (con coma de miles) y el último día de pago', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e), { estadoCuenta: {
    emitido: '2026-10-06', total_pen: 1234.5, total_usd: 45.6, minimo_pen: 150, minimo_usd: 10,
    fecha_limite: '2026-11-05', ref_externa: 'gmail:estado-cuenta',
  } });
});

test('otros correos del mismo remitente y el mismo asunto desde otro remitente se ignoran', () => {
  const e = crearEntorno();
  assert.strictEqual(leer(e, { asunto: 'Informacion de tu Credito' }), null);
  assert.strictEqual(e.llamar('leerEstadoCuentaBcp_', correo(e, 'estado-cuenta.html', { asunto: ASUNTOS.estadoCuenta })), null);
});

test('un estado de cuenta con otro formato o una fecha imposible queda pendiente', () => {
  const e = crearEntorno();
  const base = { id: 'x', remitente: REMITENTE, asunto: ASUNTOS.estadoCuenta, fecha: '2026-10-06' };
  const pendiente = { pendiente: 'No se pudo leer el estado de cuenta.' };
  assert.deepStrictEqual(e.llamar('leerEstadoCuentaBcp_', Object.assign({ texto: 'Pago total del mes: 959 Último día de pago: 20/10/2026' }, base)), pendiente);
  const fechaMala = 'Pago total del mes: 10.00 0.00 Pago mínimo del mes: 5.00 0.00 Último día de pago: 31/02/2026';
  assert.deepStrictEqual(e.llamar('leerEstadoCuentaBcp_', Object.assign({ texto: fechaMala }, base)), pendiente);
});
