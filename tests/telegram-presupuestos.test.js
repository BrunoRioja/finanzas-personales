const test = require('node:test');
const assert = require('node:assert');
const { entornoBot } = require('./telegram');

const URL_APP = 'https://script.google.com/macros/s/APP-PRUEBA/exec';

function entorno() {
  const e = entornoBot();
  e.sup = e.categoria('Supermercado');
  e.com = e.categoria('Comida fuera');
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: '100', [e.com]: '200' } });
  let n = 0;
  e.gasto = (monto, extra) => e.interno('agregarFilas_', 'Movimientos', [Object.assign({
    id: 'g' + (++n), fecha: '2026-10-13', tipo: 'gasto', monto, moneda: 'PEN', tc: 1, monto_pen: monto,
    cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.sup, comercio: 'Tottus', origen: 'manual', estado: 'confirmado',
    dividido: false, creado_en: '2026-10-13 10:00:00',
  }, extra)]);
  e.revisar = () => e.llamar('revisarPresupuestos_');
  e.registro = () => JSON.parse(e.propiedades.ALERTAS_PRESUPUESTO || '{}');
  e.limpiarTelegram();
  return e;
}

test('al cruzar el 80 % avisa una sola vez, con lo que queda y los días restantes', () => {
  const e = entorno();
  e.gasto(85);
  e.revisar();
  e.revisar();
  e.gasto(5);
  e.revisar();
  assert.strictEqual(e.enviados().length, 1);
  const m = e.ultimoEnviado();
  assert.strictEqual(m.text, '⚠️ 🛒 Supermercado: S/ 85.00 de S/ 100.00 (85 %). Te quedan S/ 15.00 para 19 días.');
  assert.deepStrictEqual(e.botones(m), [[{ text: 'Abrir la app', url: URL_APP }]]);
  assert.deepStrictEqual(e.registro(), { '2026-10': { [e.sup]: 80, [e.com]: 0 } });
});

test('pasar del 100 % de golpe avisa solo el 100 %; justo 100 % dice que llegó al tope', () => {
  const e = entorno();
  e.gasto(120);
  e.revisar();
  assert.strictEqual(e.ultimoEnviado().text, '🚨 🛒 Supermercado: S/ 120.00 de S/ 100.00 (120 %). Te pasaste por S/ 20.00.');
  e.gasto(200, { categoria_id: e.com });
  e.revisar();
  assert.strictEqual(e.ultimoEnviado().text, '🚨 🍽️ Comida fuera: S/ 200.00 de S/ 200.00 (100 %). Llegaste al tope.');
  e.revisar();
  assert.strictEqual(e.enviados().length, 2);
});

test('varias categorías que cruzan a la vez van en un solo mensaje, la más alta primero', () => {
  const e = entorno();
  e.gasto(85);
  e.gasto(190, { categoria_id: e.com });
  e.revisar();
  assert.strictEqual(e.enviados().length, 1);
  const lineas = e.ultimoEnviado().text.split('\n');
  assert.strictEqual(lineas.length, 2);
  assert.ok(lineas[0].startsWith('⚠️ 🍽️ Comida fuera: S/ 190.00'), lineas[0]);
  assert.ok(lineas[1].startsWith('⚠️ 🛒 Supermercado: S/ 85.00'), lineas[1]);
});

test('subir el presupuesto vuelve a armar el aviso; bajarlo por debajo de lo gastado no avisa', () => {
  const e = entorno();
  e.gasto(85);
  e.revisar();
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: '200' } });
  assert.deepStrictEqual(e.registro()['2026-10'][e.sup], 0);
  e.gasto(80);
  e.revisar();
  assert.strictEqual(e.enviados().length, 2);
  assert.match(e.ultimoEnviado().text, /S\/ 165\.00 de S\/ 200\.00 \(83 %\)/);
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: '100' } });
  e.revisar();
  assert.strictEqual(e.enviados().length, 2);
  assert.strictEqual(e.registro()['2026-10'][e.sup], 100);
});

test('un mes nuevo empieza de cero y el registro solo guarda el mes en curso', () => {
  const e = entorno();
  e.gasto(85);
  e.revisar();
  e.fijarAhora('2026-11-02T09:00:00');
  e.gasto(90, { fecha: '2026-11-02' });
  e.revisar();
  assert.strictEqual(e.enviados().length, 2);
  assert.match(e.ultimoEnviado().text, /para 29 días\.$/);
  assert.deepStrictEqual(Object.keys(e.registro()), ['2026-11']);
});

test('con Telegram caído el aviso queda pendiente y sale en la siguiente revisión', () => {
  const e = entorno();
  e.gasto(85);
  e.telegram.falla = 'Bad Gateway';
  e.revisar();
  assert.strictEqual(e.registro()['2026-10'][e.sup], 0);
  assert.strictEqual(e.filas('Log').filter(l => l.origen === 'telegram' && l.nivel === 'aviso').length, 1);
  e.telegram.falla = null;
  e.revisar();
  assert.match(e.ultimoEnviado().text, /^⚠️ 🛒 Supermercado/);
});

test('un gasto de un mes pasado, el modo demo o el bot sin vincular no avisan', () => {
  const e = entorno();
  e.gasto(500, { fecha: '2026-09-10' });
  e.revisar();
  e.gasto(95);
  e.propiedades.MODO_DEMO = 'si';
  e.revisar();
  e.propiedades.MODO_DEMO = 'no';
  delete e.propiedades.TELEGRAM_CHAT_ID;
  e.revisar();
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

const { ASUNTOS, html } = require('./correos');

test('la lectura de correos avisa si un gasto nuevo cruza el umbral', () => {
  const e = entornoBot({ correos: [{ id: 'g1', de: 'notificaciones@notificacionesbcp.com.pe', asunto: ASUNTOS.debito, html: html('debito.html'), recibido: '2026-10-06T16:19:00' }] });
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '4444, 1111', yape: true });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.interno('guardarRegla_', 'TOTTUS', e.categoria('Supermercado'));
  e.llamar('guardarPresupuestos', { montos: { [e.categoria('Supermercado')]: '100' } });
  e.llamar('revisarCorreos');
  assert.match(e.ultimoEnviado().text, /^⚠️ 🛒 Supermercado: S\/ 89\.30 de S\/ 100\.00 \(89 %\)/);
});

test('un gasto escrito al bot y un gasto guardado en la app avisan', () => {
  const e = entorno();
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1234', yape: true });
  e.escribir('mercado 85 super');
  assert.match(e.ultimoEnviado().text, /^⚠️ 🛒 Supermercado: S\/ 85\.00/);
  e.llamar('guardarMovimiento', { fecha: '2026-10-13', tipo: 'gasto', monto: 190, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.com, comercio: 'Pardos' });
  assert.match(e.ultimoEnviado().text, /^⚠️ 🍽️ Comida fuera: S\/ 190\.00/);
});

test('categorizar un por revisar desde la app o desde un botón, y dividir, avisan', () => {
  const e = entorno();
  const mov = e.porRevisar({ monto: 85, monto_pen: 85 });
  e.llamar('categorizarMovimiento', { id: mov.id, categoria_id: e.sup });
  assert.match(e.ultimoEnviado().text, /^⚠️ 🛒 Supermercado: S\/ 85\.00/);
  const otro = e.porRevisar({ monto: 190, monto_pen: 190, comercio: 'PARDOS' });
  e.tocar(e.dato('c', otro, e.com));
  assert.match(e.ultimoEnviado().text, /^⚠️ 🍽️ Comida fuera: S\/ 190\.00/);
  const mixto = e.porRevisar({ monto: 40, monto_pen: 40, comercio: 'PLAZA VEA' });
  e.llamar('dividirMovimiento', { id: mixto.id, partes: [{ categoria_id: e.sup, monto: 30 }, { categoria_id: e.com, monto: 10 }] });
  assert.match(e.ultimoEnviado().text, /^🚨 🛒 Supermercado: S\/ 115\.00 de S\/ 100\.00 \(115 %\)/);
  assert.strictEqual(e.enviados().length, 3);
});
