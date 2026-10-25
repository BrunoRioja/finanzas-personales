const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { correo } = require('./correos');

const SCOTIA = 'bancadigital@scotiabank.com.pe';

test('transferencia a otro banco: gasto por el total cargado, comercio = destinatario', () => {
  const e = crearEntorno();
  const c = correo(e, 'scotiabank-otro-banco.html', { remitente: SCOTIA, asunto: 'Constancia de operación - Transferencia a otro banco' });
  assert.deepStrictEqual(e.llamar('leerCorreoScotiabank_', c), {
    crudo: { tipo: 'gasto', moneda: 'PEN', monto: 29.5, comercio: 'Ca*** Pr*** Ro***', numero_origen: '3333', fecha: '2026-10-06', ref_externa: 'gmail:scotiabank-otro-banco' },
  });
});

test('transferencia Plin: gasto por el monto enviado, comercio = a quién se envió', () => {
  const e = crearEntorno();
  const c = correo(e, 'scotiabank-plin.html', { remitente: SCOTIA, asunto: 'Constancia de operación - Transferencia Plin' });
  assert.deepStrictEqual(e.llamar('leerCorreoScotiabank_', c), {
    crudo: { tipo: 'gasto', moneda: 'PEN', monto: 50, comercio: 'Carlos Pru*** 999', numero_origen: '3333', fecha: '2026-10-06', ref_externa: 'gmail:scotiabank-plin' },
  });
});

test('Scotiabank: publicidad → null; constancia desconocida o ilegible → pendiente', () => {
  const e = crearEntorno();
  assert.strictEqual(e.llamar('leerCorreoScotiabank_', { id: 'x', remitente: SCOTIA, asunto: '¡Hasta 4.60% para tus ahorros!', texto: 'Hola', fecha: '2026-10-06' }), null);
  assert.strictEqual(e.llamar('leerCorreoScotiabank_', correo(e, 'scotiabank-plin.html', { remitente: 'novedades@scotiabank.com.pe', asunto: 'Constancia de operación - Transferencia Plin' })), null);
  assert.deepStrictEqual(e.llamar('leerCorreoScotiabank_', { id: 'x', remitente: SCOTIA, asunto: 'Constancia de operación - Pago de servicios', texto: 'Hola', fecha: '2026-10-06' }),
    { pendiente: 'Operación de Scotiabank que la app aún no sabe leer.' });
  assert.deepStrictEqual(e.llamar('leerCorreoScotiabank_', { id: 'x', remitente: SCOTIA, asunto: 'Constancia de operación - Transferencia Plin', texto: 'Hola sin datos', fecha: '2026-10-06' }),
    { pendiente: 'No se pudo leer la transferencia de Scotiabank.' });
});
