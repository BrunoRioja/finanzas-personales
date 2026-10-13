const test = require('node:test');
const assert = require('node:assert');
const { entornoBot } = require('./telegram');
const { ASUNTOS, html } = require('./correos');

const BCP = 'notificaciones@notificacionesbcp.com.pe';
const YAPE = 'notificaciones@yape.pe';
const correo = (id, archivo, asunto, recibido, de) => ({ id, de: de || BCP, asunto, html: html(archivo), recibido });

function entorno(correos, opciones) {
  const e = entornoBot(Object.assign({ correos }, opciones));
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '4444, 1111', yape: true });
  e.llamar('guardarCuenta', { id: e.cuenta('VISA BCP'), nombre: 'VISA BCP', tipo: 'credito', numeros: '2222' });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.limpiarTelegram();
  return e;
}

test('cada movimiento nuevo por revisar llega con sus categorías; nunca se envían números de cuenta', () => {
  const e = entorno([
    correo('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00'),
    correo('g3', 'yape-enviado.html', ASUNTOS.yape, '2026-10-08T19:51:00', YAPE),
  ]);
  const r = e.llamar('revisarCorreos');
  assert.strictEqual(r.porRevisar, 2);
  const enviados = e.enviados();
  assert.strictEqual(enviados.length, 2);
  assert.match(enviados[0].text, /<b>S\/ 89\.30<\/b> · Débito BCP\nTOTTUS PRUEBA SUR/);
  assert.strictEqual(e.botones(enviados[0])[1][0].text, 'Otra…');
  enviados.forEach(m => assert.ok(!/1111|4444|2222/.test(JSON.stringify(m))));
});

test('lo que una regla ya categorizó no genera mensaje', () => {
  const e = entorno([correo('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00')]);
  e.interno('guardarRegla_', 'TOTTUS', e.categoria('Supermercado'));
  e.llamar('revisarCorreos');
  assert.strictEqual(e.enviados().length, 0);
});

test('más de 5 por revisar de golpe: un solo mensaje agrupado', () => {
  const correos = Array.from({ length: 6 }, (_, i) => correo('g' + i, 'debito.html', ASUNTOS.debito, '2026-10-0' + (i + 2) + 'T10:00:00'));
  const e = entorno(correos);
  e.llamar('revisarCorreos');
  assert.deepStrictEqual(e.enviados().map(m => m.text), ['📥 <b>6 movimientos nuevos por revisar</b>']);
});

test('sin cuenta reconocida: el aviso pide abrir la app', () => {
  const e = entorno([correo('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00')]);
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '4444', yape: true });
  e.llamar('revisarCorreos');
  const [m] = e.enviados();
  assert.match(m.text, /Elige la cuenta en la app\./);
  assert.deepStrictEqual(e.botones(m), [[{ text: 'Abrir en la app', url: 'https://script.google.com/macros/s/APP-PRUEBA/exec' }]]);
});

test('sin bot vinculado no se llama a Telegram', () => {
  const e = entorno([correo('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00')]);
  delete e.propiedades.TELEGRAM_CHAT_ID;
  e.llamar('revisarCorreos');
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

test('Telegram caído: la lectura de correos termina igual y queda un aviso en el Log', () => {
  const e = entorno([
    correo('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00'),
    correo('g3', 'yape-enviado.html', ASUNTOS.yape, '2026-10-08T19:51:00', YAPE),
  ]);
  e.telegram.falla = 'Bad Gateway';
  const r = e.llamar('revisarCorreos');
  assert.strictEqual(r.creados, 2);
  assert.strictEqual(e.filas('Movimientos').length, 2);
  const log = e.filas('Log').filter(l => l.origen === 'telegram');
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].nivel, 'aviso');
});

test('si el trigger de lectura falla, avisa por el bot como máximo una vez por hora', () => {
  const e = entorno([], { gmailFalla: 'Gmail no responde' });
  assert.throws(() => e.llamar('revisarCorreos', { triggerUid: '1' }), /Gmail no responde/);
  assert.deepStrictEqual(e.enviados().map(m => m.text), ['⚠️ Falló la lectura de correos: Gmail no responde']);
  e.fijarAhora('2026-10-13T10:30:00');
  assert.throws(() => e.llamar('revisarCorreos', { triggerUid: '1' }));
  assert.strictEqual(e.enviados().length, 1);
  e.fijarAhora('2026-10-13T11:01:00');
  assert.throws(() => e.llamar('revisarCorreos', { triggerUid: '1' }));
  assert.strictEqual(e.enviados().length, 2);
  assert.throws(() => e.llamar('revisarCorreos'));
  assert.strictEqual(e.enviados().length, 2);
});
