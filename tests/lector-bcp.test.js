const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { ASUNTOS, correo } = require('./correos');

const base = id => ({ fecha: '2026-10-06', ref_externa: 'gmail:' + id });
const leer = (e, archivo, extra) => e.llamar('leerCorreoBcp_', correo(e, archivo, extra));

test('htmlATexto_ quita etiquetas, estilos, comentarios, entidades y caracteres invisibles', () => {
  const e = crearEntorno();
  const html = '<style>p{color:red}</style><!-- x --><p>Hola&nbsp;<b>H&amp;M</b></p><td>(01)​ 311&#8203;-9898 &#x41;</td>';
  assert.strictEqual(e.interno('htmlATexto_', html), 'Hola H&M (01) 311-9898 A');
  assert.strictEqual(e.interno('htmlATexto_', null), '');
});

test('leerMonto_ entiende soles, dólares y miles', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('leerMonto_', 'S/', '1,250.00'), { moneda: 'PEN', monto: 1250 });
  assert.deepStrictEqual(e.llamar('leerMonto_', '$', '23.60'), { moneda: 'USD', monto: 23.6 });
});

test('consumo con débito', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'debito.html', { asunto: ASUNTOS.debito }), {
    crudo: Object.assign({ tipo: 'gasto', monto: 89.3, moneda: 'PEN', comercio: 'TOTTUS PRUEBA SUR', numero_origen: '1111' }, base('debito')),
  });
});

test('consumo con crédito en soles con miles y en dólares', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'credito-soles.html', { asunto: ASUNTOS.credito }).crudo,
    Object.assign({ tipo: 'gasto', monto: 1250, moneda: 'PEN', comercio: 'SAGA FALABELLA PRUEBA', numero_origen: '2222' }, base('credito-soles')));
  assert.deepStrictEqual(leer(e, 'credito-dolares.html', { asunto: ASUNTOS.credito }).crudo,
    Object.assign({ tipo: 'gasto', monto: 23.6, moneda: 'USD', comercio: 'ANTHROPIC* CLAUDE SUB', numero_origen: '2222' }, base('credito-dolares')));
});

test('PLIN: el comercio es la persona, sin el prefijo', () => {
  const e = crearEntorno();
  assert.strictEqual(leer(e, 'plin.html', { asunto: ASUNTOS.debito }).crudo.comercio, 'JUAN PEREZ PRUEB');
});

test('transferencia entre mis cuentas', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'transferencia.html', { asunto: ASUNTOS.transferencia }), {
    crudo: Object.assign({ tipo: 'transferencia', monto: 290.26, moneda: 'PEN', comercio: '', descripcion: 'Transferencia entre mis cuentas', numero_origen: '3333', numero_destino: '4444' }, base('transferencia')),
  });
});

test('pago de tarjeta en dólares trae el tipo de cambio; en soles no', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'pago-tarjeta-dolares.html', { asunto: ASUNTOS.pagoTarjeta }).crudo,
    Object.assign({ tipo: 'transferencia', monto: 105.52, moneda: 'USD', tc: 3.477, actualiza_tc: true, comercio: '', descripcion: 'Pago de tarjeta', numero_origen: '4444', numero_destino: '2222' }, base('pago-tarjeta-dolares')));
  assert.deepStrictEqual(leer(e, 'pago-tarjeta-soles.html', { asunto: ASUNTOS.pagoTarjeta }).crudo,
    Object.assign({ tipo: 'transferencia', monto: 959.74, moneda: 'PEN', comercio: '', descripcion: 'Pago de tarjeta', numero_origen: '4444', numero_destino: '2222' }, base('pago-tarjeta-soles')));
});

test('pago de servicio', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'pago-servicio.html', { asunto: ASUNTOS.servicio }).crudo,
    Object.assign({ tipo: 'gasto', monto: 24.47, moneda: 'PEN', comercio: 'CLARO', numero_origen: '4444' }, base('pago-servicio')));
});

test('yapeo recibido es ingreso de la cuenta de Yape', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'yape-recibido.html', { asunto: ASUNTOS.yapeRecibido }).crudo,
    Object.assign({ tipo: 'ingreso', monto: 200, moneda: 'PEN', comercio: 'Lopez Prueba Maria Elena', usa_yape: true }, base('yape-recibido')));
});

test('operación reconocida pero ilegible → pendiente; otros correos → null', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'consumo-roto.html', { asunto: ASUNTOS.debito }), { pendiente: 'No se pudo leer el consumo.' });
  assert.strictEqual(leer(e, 'estado-cuenta.html', { asunto: ASUNTOS.estadoCuenta, remitente: 'estadodecuenta@notificacionesbcp.com.pe' }), null);
  assert.strictEqual(leer(e, 'debito.html', { asunto: ASUNTOS.comprobante }), null);
  assert.strictEqual(leer(e, 'debito.html', { asunto: ASUNTOS.debito, remitente: 'notificaciones@notificacionesbcp.com.pe.estafa.com' }), null);
});

test('I6: una operación del BCP que aún no sabemos leer va a pendientes, no se ignora', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'debito.html', { asunto: 'Constancia de Transferencia a Terceros - Servicio de Notificaciones BCP' }),
    { pendiente: 'Operación del BCP que la app aún no sabe leer.' });
  assert.strictEqual(leer(e, 'debito.html', { asunto: 'Constancia de envío de Estado de Cuenta - Servicio de Notificaciones BCP' }), null);
});

test('htmlATexto_ decodifica las tildes y eñes escritas como entidades con nombre', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('htmlATexto_', 'Pago m&iacute;nimo &Uacute;ltimo d&iacute;a CONTRASE&Ntilde;A &ndash; &amp;iacute; &foo;'),
    'Pago mínimo Último día CONTRASEÑA – &iacute; &foo;');
});
