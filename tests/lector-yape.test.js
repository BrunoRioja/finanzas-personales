const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { ASUNTOS, correo } = require('./correos');

const YAPE = 'notificaciones@yape.pe';

test('yapeo enviado: gasto de la cuenta de Yape, comercio = beneficiario', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('leerCorreoYape_', correo(e, 'yape-enviado.html', { remitente: YAPE, asunto: ASUNTOS.yape })), {
    crudo: { tipo: 'gasto', monto: 11, moneda: 'PEN', comercio: 'CARLOS PRUEBA R.', usa_yape: true, fecha: '2026-10-06', ref_externa: 'gmail:yape-enviado' },
  });
});

test('Yape: otro remitente o correo sin yapeo → null; yapeo ilegible → pendiente', () => {
  const e = crearEntorno();
  assert.strictEqual(e.llamar('leerCorreoYape_', correo(e, 'yape-enviado.html', { remitente: 'encuestas@postventa.yape.com.pe' })), null);
  assert.strictEqual(e.llamar('leerCorreoYape_', { id: 'x', remitente: YAPE, asunto: 'Encuesta', texto: 'Participa y gana un yapeo de S/40', fecha: '2026-10-06' }), null);
  assert.deepStrictEqual(e.llamar('leerCorreoYape_', { id: 'x', remitente: YAPE, asunto: ASUNTOS.yape, texto: '¡Acabas de yapear exitosamente! sin datos', fecha: '2026-10-06' }), { pendiente: 'No se pudo leer el yapeo.' });
});

test('leerCorreoBancario_ usa el primer lector que reconoce el correo', () => {
  const e = crearEntorno();
  assert.strictEqual(e.llamar('leerCorreoBancario_', correo(e, 'yape-enviado.html', { remitente: YAPE, asunto: ASUNTOS.yape })).crudo.comercio, 'CARLOS PRUEBA R.');
  assert.strictEqual(e.llamar('leerCorreoBancario_', correo(e, 'debito.html', { asunto: ASUNTOS.debito })).crudo.comercio, 'TOTTUS PRUEBA SUR');
  assert.strictEqual(e.llamar('leerCorreoBancario_', correo(e, 'debito.html', { remitente: 'otro@banco.com', asunto: ASUNTOS.debito })), null);
  assert.deepStrictEqual(e.llamar('remitentesBancarios_'), ['notificacionesbcp.com.pe', 'yape.pe']);
});
