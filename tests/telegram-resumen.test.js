const test = require('node:test');
const assert = require('node:assert');
const { entornoBot } = require('./telegram');

function gasto(e, extra) {
  return e.llamar('guardarMovimiento', Object.assign({
    fecha: '2026-10-13', tipo: 'gasto', monto: 45.9, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Supermercado'), comercio: 'Tottus',
  }, extra));
}

test('el resumen diario llega con los movimientos de hoy y los botones', () => {
  const e = entornoBot();
  gasto(e);
  gasto(e, { fecha: '2026-10-12', monto: 99, comercio: 'Ayer' });
  e.llamar('enviarResumenDiario');
  const m = e.ultimoEnviado();
  assert.strictEqual(m.text, '📊 <b>Hoy · S/ 45.90 en gastos</b>\n\n• S/ 45.90 🛒 Supermercado — Tottus');
  assert.deepStrictEqual(e.botones(m), [[
    { text: 'Todo bien ✓', callback_data: 'ok' }, { text: 'Abrir la app', url: 'https://script.google.com/macros/s/APP-PRUEBA/exec' },
  ]]);
});

test('sin movimientos hoy, sin bot vinculado o en modo demo no se envía nada', () => {
  const e = entornoBot();
  gasto(e, { fecha: '2026-10-12' });
  e.llamar('enviarResumenDiario');
  gasto(e);
  delete e.propiedades.TELEGRAM_CHAT_ID;
  e.llamar('enviarResumenDiario');
  e.propiedades.TELEGRAM_CHAT_ID = '555';
  e.propiedades.MODO_DEMO = 'si';
  e.llamar('enviarResumenDiario');
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

test('si Telegram falla, el resumen no rompe el trigger y queda en el Log', () => {
  const e = entornoBot();
  gasto(e);
  e.telegram.falla = 'Bad Gateway';
  e.llamar('enviarResumenDiario');
  const log = e.filas('Log').filter(l => l.origen === 'enviarResumenDiario');
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].nivel, 'error');
});

test('/hoy y /mes', () => {
  const e = entornoBot();
  e.escribir('/hoy');
  assert.strictEqual(e.ultimoEnviado().text, 'Hoy no hay movimientos.');
  gasto(e);
  e.llamar('guardarMovimiento', { fecha: '2026-10-01', tipo: 'ingreso', monto: 3000, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Sueldo') });
  e.escribir('/hoy');
  assert.match(e.ultimoEnviado().text, /^📊 <b>Hoy · S\/ 45\.90 en gastos<\/b>/);
  assert.ok(!('reply_markup' in e.ultimoEnviado()));
  e.escribir('/mes');
  assert.strictEqual(e.ultimoEnviado().text,
    '📅 <b>Mes 2026-10</b>\n💰 Ingresos: S/ 3,000.00\n🛒 Gastos: S/ 45.90\n🐷 Ahorro: S/ 2,954.10 (98 %)\n\n' +
    '<b>Top categorías</b>\n• 🛒 Supermercado — S/ 45.90 (100 %)');
});

test('configurarResumen_ deja un solo trigger diario a la hora pedida; horaResumen_ lee "21:00"', () => {
  const e = entornoBot();
  assert.strictEqual(e.interno('horaResumen_'), 21);
  e.interno('configurarResumen_', 20);
  e.interno('configurarResumen_', 22);
  const t = e.triggers.filter(x => x.funcion === 'enviarResumenDiario');
  assert.strictEqual(t.length, 1);
  assert.deepStrictEqual([t[0].hora, t[0].cada], [22, '1 d']);
  e.interno('borrarTriggersResumen_');
  assert.strictEqual(e.triggers.filter(x => x.funcion === 'enviarResumenDiario').length, 0);
  e.interno('guardarConfig_', { hora_resumen: 'basura' });
  assert.strictEqual(e.interno('horaResumen_'), 21);
});
