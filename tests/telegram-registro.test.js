const test = require('node:test');
const assert = require('node:assert');
const { entornoBot, CHAT } = require('./telegram');

function entorno() {
  const e = entornoBot();
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1234', yape: true });
  e.interno('guardarRegla_', 'TAXI', e.categoria('Transporte'));
  e.movsBot = () => e.filas('Movimientos').filter(m => m.origen === 'telegram');
  return e;
}

test('"taxi 12 yape" guarda un gasto confirmado y responde con Deshacer y Cambiar categoría', () => {
  const e = entorno();
  const u = e.escribir('taxi 12 yape');
  const movs = e.movsBot();
  assert.strictEqual(movs.length, 1);
  const m = movs[0];
  assert.deepStrictEqual([m.fecha, m.tipo, m.monto, m.moneda, m.monto_pen, m.cuenta_id, m.categoria_id, m.comercio, m.estado, m.ref_externa],
    ['2026-10-13', 'gasto', 12, 'PEN', 12, e.cuenta('Débito BCP'), e.categoria('Transporte'), 'taxi', 'confirmado', 'tg:' + u]);
  assert.strictEqual(e.filas('Reglas')[0].usos, 1);
  const r = e.ultimoEnviado();
  assert.strictEqual(r.text, '✓ <b>S/ 12.00</b> · taxi · 🚕 Transporte · 🙋 Personal · Débito BCP');
  assert.deepStrictEqual(e.botones(r)[0].map(b => b.text), ['Deshacer', 'Cambiar categoría']);
  assert.deepStrictEqual(e.botones(r)[1].map(b => b.text), ['🎉 Diversión', '👨‍👩‍👧 Familia', '💼 Trabajo']);
});

test('sin regla ni categoría queda por revisar y pregunta con las categorías', () => {
  const e = entorno();
  e.escribir('cena 30');
  const [m] = e.movsBot();
  assert.deepStrictEqual([m.estado, m.categoria_id], ['por_revisar', '']);
  const r = e.ultimoEnviado();
  assert.match(r.text, /<b>S\/ 30\.00<\/b> · Débito BCP\ncena · hoy/);
  assert.strictEqual(e.botones(r)[0].length, 3);
  assert.strictEqual(e.botones(r)[1][0].text, 'Otra…');
});

test('si no entiende o falta la cuenta, explica y no guarda nada', () => {
  const e = entorno();
  e.escribir('hola');
  assert.match(e.ultimoEnviado().text, /No entendí/);
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1234', yape: false });
  e.escribir('pan 5');
  assert.match(e.ultimoEnviado().text, /Ajustes → Telegram/);
  assert.strictEqual(e.movsBot().length, 0);
});

test('Telegram reenvía el mismo update: el gasto se guarda una sola vez', () => {
  const e = entorno();
  const u = { update_id: 5000, message: { message_id: 1, chat: { id: CHAT }, text: 'taxi 12' } };
  e.enviar(u);
  e.enviar(u);
  assert.strictEqual(e.movsBot().length, 1);
});

test('/deshacer borra el último gasto del bot de las últimas 24 h y nada más', () => {
  const e = entorno();
  e.escribir('taxi 12');
  e.fijarAhora('2026-10-13T10:05:00');
  e.escribir('pan 5');
  e.llamar('guardarMovimiento', { fecha: '2026-10-13', tipo: 'gasto', monto: 9, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Bodega'), comercio: 'manual' });
  e.escribir('/deshacer');
  assert.deepStrictEqual(e.movsBot().map(m => m.comercio), ['taxi']);
  assert.strictEqual(e.ultimoEnviado().text, '↩ Borré S/ 5.00 · pan');
  e.fijarAhora('2026-10-14T10:01:00');
  e.escribir('/deshacer');
  assert.strictEqual(e.ultimoEnviado().text, 'No hay movimientos registrados por el bot en las últimas 24 horas.');
  assert.strictEqual(e.movsBot().length, 1);
  assert.ok(e.filas('Movimientos').some(m => m.comercio === 'manual'));
});

test('un gasto escrito con ámbito se guarda con ese ámbito', () => {
  const e = entorno();
  e.escribir('taxi 15 diversión yape');
  const [m] = e.movsBot();
  const div = e.llamar('obtenerCatalogos').ambitos.find(a => a.nombre === 'Diversión').id;
  assert.deepStrictEqual([m.comercio, m.categoria_id, m.ambito_id], ['taxi', e.categoria('Transporte'), div]);
});

test('una hoja v4 se migra al recibir un gasto escrito por el webhook', () => {
  const e = entorno();
  delete e.hojas.Ambitos;
  e.hojas.Movimientos[0] = e.hojas.Movimientos[0].filter(h => h !== 'ambito_id');
  e.hojas.Divisiones[0] = e.hojas.Divisiones[0].filter(h => h !== 'ambito_id');
  e.interno('guardarConfig_', { version_esquema: 4 });
  e.escribir('taxi 12 yape');
  assert.strictEqual(e.movsBot().length, 1);
  assert.strictEqual(e.interno('leerConfig_').version_esquema, '6');
  assert.strictEqual(e.filas('Ambitos').length, 4);
});
