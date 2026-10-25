const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { correo } = require('./correos');

const TARJETA = 'no-reply@servicioalcliente.sip.pe';
const APP = 'no-reply@operaciones.agora.pe';
const CONSUMO = 'Sip, realizaste un consumo con tu Tarjeta de Crédito Sip';
const OPERACION = 'Realizaste una operación';

test('consumo con la tarjeta de crédito Sip (monto "S/." con miles)', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('leerCorreoSip_', correo(e, 'sip-consumo.html', { remitente: TARJETA, asunto: CONSUMO })), {
    crudo: { tipo: 'gasto', moneda: 'PEN', monto: 1283.6, comercio: 'TIENDA PRUEBA SUR', numero_origen: '1111', fecha: '2026-10-06', ref_externa: 'gmail:sip-consumo' },
  });
});

test('pago a comercios desde la app: gasto de la cuenta de débito Sip', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('leerCorreoSip_', correo(e, 'sip-pago-comercio.html', { remitente: APP, asunto: OPERACION })), {
    crudo: {
      tipo: 'gasto', moneda: 'PEN', monto: 47.8, comercio: 'Compra APP - Pago de compra realizada en Web Cine Prueba (AgoraWeb)',
      banco: 'Sip', tipo_origen: 'debito', fecha: '2026-10-06', ref_externa: 'gmail:sip-pago-comercio',
    },
  });
});

test('transferencia a mis cuentas: de débito Sip a AhorraMás', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('leerCorreoSip_', correo(e, 'sip-transferencia.html', { remitente: APP, asunto: OPERACION })), {
    crudo: {
      tipo: 'transferencia', moneda: 'PEN', monto: 1500, comercio: '', descripcion: 'Transferencia entre mis cuentas',
      banco: 'Sip', tipo_origen: 'debito', tipo_destino: 'ahorro', fecha: '2026-10-06', ref_externa: 'gmail:sip-transferencia',
    },
  });
});

test('Sip: otro remitente o aviso que no es operación → null; operación desconocida o ilegible → pendiente', () => {
  const e = crearEntorno();
  assert.strictEqual(e.llamar('leerCorreoSip_', correo(e, 'sip-consumo.html', { remitente: 'promos@sip.pe', asunto: CONSUMO })), null);
  assert.strictEqual(e.llamar('leerCorreoSip_', { id: 'x', remitente: APP, asunto: '¡Los cambios en tu tarjeta virtual se realizaron con éxito!', texto: 'Hola', fecha: '2026-10-06' }), null);
  assert.strictEqual(e.llamar('leerCorreoSip_', { id: 'x', remitente: TARJETA, asunto: '¡Aprovecha los Días Sip!', texto: 'Hola', fecha: '2026-10-06' }), null);
  assert.deepStrictEqual(e.llamar('leerCorreoSip_', { id: 'x', remitente: APP, asunto: OPERACION, texto: 'Operación realizada: Retiro Monto S/ 10.00', fecha: '2026-10-06' }),
    { pendiente: 'Operación de Sip que la app aún no sabe leer.' });
  assert.deepStrictEqual(e.llamar('leerCorreoSip_', { id: 'x', remitente: TARJETA, asunto: CONSUMO, texto: 'Hola sin datos', fecha: '2026-10-06' }),
    { pendiente: 'No se pudo leer el consumo de Sip.' });
});
