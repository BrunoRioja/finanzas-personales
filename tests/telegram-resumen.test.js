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

test('/mes muestra los presupuestos en alerta', () => {
  const e = entornoBot();
  e.llamar('guardarPresupuestos', { montos: { [e.categoria('Supermercado')]: '50' } });
  gasto(e);
  e.escribir('/mes');
  assert.match(e.ultimoEnviado().text, /\n\n<b>Presupuestos<\/b>\n• 🛒 Supermercado 92 % · quedan S\/ 4\.10$/);
});

test('el resumen diario migra una hoja v4 antes de leer los ámbitos', () => {
  const e = entornoBot();
  gasto(e);
  delete e.hojas.Ambitos;
  e.hojas.Movimientos[0] = e.hojas.Movimientos[0].filter(h => h !== 'ambito_id');
  e.hojas.Divisiones[0] = e.hojas.Divisiones[0].filter(h => h !== 'ambito_id');
  e.interno('guardarConfig_', { version_esquema: 4 });
  e.llamar('enviarResumenDiario');
  assert.strictEqual(e.filas('Log').filter(l => l.origen === 'enviarResumenDiario').length, 0);
  assert.strictEqual(e.interno('leerConfig_').version_esquema, '6');
  assert.strictEqual(e.filas('Ambitos').length, 4);
  assert.match(e.ultimoEnviado().text, /Tottus/);
});

test('/mes y el resumen diario no suman préstamos ni reembolsos, pero el diario los lista con 🤝', () => {
  const e = entornoBot();
  gasto(e, { monto: 100, comercio: 'Tottus' });
  gasto(e, { monto: 200, categoria_id: e.categoria('Préstamos'), comercio: 'Juan' });
  e.llamar('guardarMovimiento', { fecha: '2026-10-13', tipo: 'ingreso', monto: 50, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Reembolsos'), comercio: 'Juan' });
  e.escribir('/hoy');
  const hoy = e.ultimoEnviado().text;
  assert.match(hoy, /^📊 <b>Hoy · S\/ 100\.00 en gastos<\/b>\n\n/);
  assert.ok(!hoy.includes('en ingresos'));
  assert.match(hoy, /• S\/ 200\.00 🤝 Préstamos — Juan/);
  assert.match(hoy, /• S\/ 50\.00 🤝 .*Reembolsos — Juan/);
  e.escribir('/mes');
  const mes = e.ultimoEnviado().text;
  assert.match(mes, /💰 Ingresos: S\/ 0\.00\n🛒 Gastos: S\/ 100\.00/);
  assert.ok(!mes.includes('Préstamos'));
});

test('desactivar la categoría de préstamos hace que sus movimientos vuelvan a contar', () => {
  const e = entornoBot();
  gasto(e, { monto: 200, categoria_id: e.categoria('Préstamos') });
  const prest = e.filas('Categorias').find(c => c.id === e.categoria('Préstamos'));
  e.llamar('guardarCategoria', Object.assign({}, prest, { activa: false }));
  e.escribir('/mes');
  assert.match(e.ultimoEnviado().text, /🛒 Gastos: S\/ 200\.00/);
});
