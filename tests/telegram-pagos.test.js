const test = require('node:test');
const assert = require('node:assert');
const { entornoBot } = require('./telegram');
const { ASUNTOS, html } = require('./correos');

test('al llegar el estado de cuenta avisa por Telegram con totales, mínimos y vencimiento', () => {
  const e = entornoBot({ correos: [{ id: 'g7', de: 'estadodecuenta@notificacionesbcp.com.pe', asunto: ASUNTOS.estadoCuenta, html: html('estado-cuenta.html'), recibido: '2026-10-11T10:00:00' }] });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.limpiarTelegram();
  e.llamar('revisarCorreos');
  assert.strictEqual(e.enviados().length, 1);
  assert.strictEqual(e.ultimoEnviado().text,
    '💳 Llegó tu estado de cuenta VISA BCP: S/ 1,234.50 + US$ 45.60 · mínimo S/ 150.00 + US$ 10.00 · vence el 05/11.');
});

test('textoLlegoEstadoCuenta_ omite la moneda sin deuda y escapa el nombre', () => {
  const e = entornoBot();
  const ec = { total_pen: 300, total_usd: 0, minimo_pen: 40, minimo_usd: 0, fecha_limite: '2026-11-05' };
  assert.strictEqual(e.llamar('textoLlegoEstadoCuenta_', ec, 'Visa <A&B>'),
    '💳 Llegó tu estado de cuenta Visa &lt;A&amp;B&gt;: S/ 300.00 · mínimo S/ 40.00 · vence el 05/11.');
});

function entornoPagos() {
  const e = entornoBot();
  e.sus = e.categoria('Suscripciones');
  e.visa = e.cuenta('VISA BCP');
  e.fijo = (nombre, monto, dia, extra) => e.llamar('guardarRecurrente', Object.assign({
    nombre, monto, moneda: 'PEN', dia_mes: dia, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.sus,
  }, extra));
  e.estado = extra => e.interno('agregarFilas_', 'EstadosCuenta', [Object.assign({
    id: 'ec1', cuenta_id: e.visa, emitido: '2026-10-01', total_pen: 800, total_usd: 50, minimo_pen: 120, minimo_usd: 10,
    fecha_limite: '2026-10-16', ref_externa: '',
  }, extra)]);
  e.pagar = (monto, moneda) => e.interno('agregarFilas_', 'Movimientos', [{
    id: 'p-' + monto + moneda, fecha: '2026-10-10', tipo: 'transferencia', monto, moneda, tc: moneda === 'USD' ? 3.75 : 1,
    monto_pen: moneda === 'USD' ? monto * 3.75 : monto, cuenta_id: e.cuenta('Débito BCP'), cuenta_destino_id: e.visa,
    categoria_id: '', comercio: '', descripcion: '', origen: 'gmail', estado: 'confirmado', ref_externa: '', dividido: false,
    creado_en: '2026-10-10 10:00:00',
  }]);
  e.recordar = () => e.llamar('recordarPagos');
  e.limpiarTelegram();
  return e;
}

test('a las 8:00 recuerda lo de hoy y lo de dentro de 3 días en un solo mensaje, sin repetir', () => {
  const e = entornoPagos();
  e.fijo('Streaming', '20.90', 13);
  e.fijo('Gimnasio', '120', 16);
  e.fijo('Alquiler', '900', 14);
  e.estado();
  e.recordar();
  e.recordar();
  assert.strictEqual(e.enviados().length, 1);
  assert.strictEqual(e.ultimoEnviado().text, [
    '📅 <b>Pagos por venir</b>',
    '<b>Hoy</b>',
    '• 📺 Streaming · S/ 20.90 · Débito BCP',
    '<b>En 3 días (vie 16/10)</b>',
    '• 📺 Gimnasio · S/ 120.00 · Débito BCP',
    '• 💳 VISA BCP · falta S/ 800.00 (mínimo S/ 120.00) + US$ 50.00 (mínimo US$ 10.00)',
  ].join('\n'));
  assert.deepStrictEqual(e.botones(e.ultimoEnviado()), [[{ text: 'Abrir la app', url: 'https://script.google.com/macros/s/APP-PRUEBA/exec' }]]);
});

test('la tarjeta pagada no se recuerda y, si falta una moneda, solo nombra esa', () => {
  const e = entornoPagos();
  e.estado();
  e.pagar(800, 'PEN');
  e.recordar();
  assert.strictEqual(e.ultimoEnviado().text.split('\n').slice(-1)[0], '• 💳 VISA BCP · falta US$ 50.00 (mínimo US$ 10.00)');
  const e2 = entornoPagos();
  e2.estado();
  e2.pagar(800, 'PEN');
  e2.pagar(50, 'USD');
  e2.recordar();
  assert.strictEqual(e2.enviados().length, 0);
});

test('si Telegram falla no marca nada y lo envía en la siguiente vuelta; en demo o sin bot no envía', () => {
  const e = entornoPagos();
  e.fijo('Streaming', '20.90', 13);
  e.telegram.falla = 'Bad Gateway';
  e.recordar();
  assert.strictEqual(e.propiedades.PAGOS_RECORDADOS, undefined);
  assert.ok(e.filas('Log').some(l => l.nivel === 'aviso'));
  e.telegram.falla = null;
  e.recordar();
  assert.strictEqual(e.enviados().length, 2);
  assert.ok(e.propiedades.PAGOS_RECORDADOS);
  const demo = entornoPagos();
  demo.fijo('Streaming', '20.90', 13);
  demo.propiedades.MODO_DEMO = 'si';
  demo.recordar();
  const sinBot = entornoPagos();
  sinBot.fijo('Streaming', '20.90', 13);
  delete sinBot.propiedades.TELEGRAM_CHAT_ID;
  sinBot.recordar();
  assert.strictEqual(demo.enviados().length + sinBot.enviados().length, 0);
});

test('el registro de recordados guarda solo la última semana', () => {
  const e = entornoPagos();
  e.propiedades.PAGOS_RECORDADOS = JSON.stringify({ '2026-10-01': ['rec:x:2026-10-01'], '2026-10-07': ['rec:y:2026-10-07'] });
  e.fijo('Streaming', '20.90', 13);
  e.recordar();
  assert.deepStrictEqual(Object.keys(JSON.parse(e.propiedades.PAGOS_RECORDADOS)).sort(), ['2026-10-07', '2026-10-13']);
});

test('/pagos lista los próximos 30 días con lo que falta; sin pagos lo dice; la tarjeta vencida se marca', () => {
  const e = entornoPagos();
  e.escribir('/pagos');
  assert.strictEqual(e.ultimoEnviado().text, 'No tienes pagos en los próximos 30 días.');
  e.fijo('Streaming', '20.90', 13);
  e.fijo('Nube', '2', 14, { moneda: 'USD' });
  e.estado();
  e.pagar(800, 'PEN');
  e.escribir('/pagos');
  assert.strictEqual(e.ultimoEnviado().text, [
    '📅 <b>Próximos pagos</b>',
    '• 📺 Streaming · hoy · S/ 20.90 · Débito BCP',
    '• 📺 Nube · mañana · US$ 2.00 · Débito BCP',
    '• 💳 VISA BCP · vie 16/10 · S/ 800.00 ✓ · US$ 50.00 pendiente',
    '',
    'Por pagar en 30 días: S/ 215.90',
  ].join('\n'));
  e.fijarAhora('2026-10-18T10:00:00');
  e.escribir('/pagos');
  assert.ok(e.ultimoEnviado().text.split('\n').includes('• 💳 VISA BCP · ⚠️ venció el 16/10 · S/ 800.00 ✓ · US$ 50.00 pendiente'));
});

test('el recordatorio de las 8:00 se instala al abrir la app con el bot conectado y se borra al desvincular', () => {
  const e = entornoPagos();
  const recordatorios = () => e.triggers.filter(t => t.funcion === 'recordarPagos');
  assert.strictEqual(recordatorios().length, 0);
  e.llamar('estadoInstalacion');
  e.llamar('estadoInstalacion');
  assert.deepStrictEqual(recordatorios().map(t => [t.hora, t.cada]), [[8, '1 d']]);
  e.llamar('desvincularTelegram');
  assert.strictEqual(recordatorios().length, 0);
  e.llamar('estadoInstalacion');
  assert.strictEqual(recordatorios().length, 0);
});

test('/ayuda menciona /pagos', () => {
  const e = entornoPagos();
  e.escribir('/ayuda');
  assert.match(e.ultimoEnviado().text, /\/pagos — próximos pagos/);
});
