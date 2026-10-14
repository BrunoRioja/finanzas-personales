const test = require('node:test');
const assert = require('node:assert');
const { entornoBot, SECRETO, CHAT } = require('./telegram');

const ayuda = { message_id: 1, chat: { id: CHAT }, text: '/ayuda' };

test('sin el secreto correcto, con JSON inválido o sin update_id no hace nada', () => {
  const e = entornoBot();
  e.llamar('recibirTelegram', 'otro-secreto-de-32-caracteres!!', JSON.stringify({ update_id: 1, message: ayuda }));
  e.llamar('recibirTelegram', '', JSON.stringify({ update_id: 2, message: ayuda }));
  e.llamar('recibirTelegram', SECRETO, '{no es json');
  e.llamar('recibirTelegram', SECRETO, JSON.stringify({ message: ayuda }));
  assert.strictEqual(e.telegram.llamadas.length, 0);
  assert.ok(!('UPDATES_ATENDIDOS' in e.propiedades));
});

test('sin secreto configurado se ignora todo, incluso un secreto vacío', () => {
  const e = entornoBot();
  delete e.propiedades.WEBHOOK_SECRET;
  e.llamar('recibirTelegram', '', JSON.stringify({ update_id: 1, message: ayuda }));
  e.llamar('recibirTelegram', undefined, JSON.stringify({ update_id: 2, message: ayuda }));
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

test('/ayuda responde una vez aunque Telegram reenvíe el mismo update', () => {
  const e = entornoBot();
  const u = { update_id: 50, message: ayuda };
  e.enviar(u);
  e.enviar(u);
  assert.strictEqual(e.enviados().length, 1);
  assert.match(e.ultimoEnviado().text, /Registrar un gasto/);
  assert.deepStrictEqual(JSON.parse(e.propiedades.UPDATES_ATENDIDOS), [50]);
});

test('/start y /ayuda@prueba_bot muestran la ayuda; un comando desconocido lo dice', () => {
  const e = entornoBot();
  e.escribir('/start');
  e.escribir('/ayuda@prueba_bot');
  e.escribir('/xyz');
  const textos = e.enviados().map(m => m.text);
  assert.match(textos[0], /Registrar un gasto/);
  assert.match(textos[1], /Registrar un gasto/);
  assert.strictEqual(textos[2], 'Comando desconocido. Escribe /ayuda.');
});

test('mensajes de otro chat se ignoran en silencio', () => {
  const e = entornoBot();
  e.escribir('/ayuda', 999);
  e.enviar({ update_id: 70, callback_query: { id: 'x', data: 'ok', message: { message_id: 1, chat: { id: 999 }, text: 'a' } } });
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

test('foto o audio: por ahora solo texto', () => {
  const e = entornoBot();
  e.enviar({ update_id: 60, message: { message_id: 1, chat: { id: CHAT }, photo: [{ file_id: 'f' }] } });
  assert.strictEqual(e.ultimoEnviado().text, 'Por ahora solo entiendo texto. El audio y las fotos llegan en una próxima versión.');
});

test('modo demo: avisa, responde el botón y no escribe nada', () => {
  const e = entornoBot();
  e.propiedades.MODO_DEMO = 'si';
  const antes = e.hojas.Movimientos.length;
  e.escribir('taxi 12');
  e.tocar('ok');
  assert.strictEqual(e.hojas.Movimientos.length, antes);
  assert.deepStrictEqual(e.enviados().map(m => m.text), [
    'La app está en modo demo; sal del modo demo para usar el bot.', 'La app está en modo demo; sal del modo demo para usar el bot.',
  ]);
  assert.strictEqual(e.llamadas('answerCallbackQuery').length, 1);
});

test('si la respuesta falla, queda en el Log y se intenta avisar en el chat', () => {
  const e = entornoBot();
  let n = 0;
  e.telegram.respuestas.sendMessage = () => (++n === 1 ? { ok: false, description: 'Too Many Requests' } : { ok: true, result: { message_id: 9 } });
  e.escribir('/ayuda');
  const log = e.filas('Log').filter(l => l.origen === 'telegram');
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].nivel, 'error');
  assert.match(log[0].mensaje, /Too Many Requests/);
  assert.strictEqual(e.ultimoEnviado().text, '⚠️ No pude completar eso: Telegram respondió: Too Many Requests');
});

test('sin chat vinculado solo acepta /start con el código vigente, y una sola vez', () => {
  const e = entornoBot();
  delete e.propiedades.TELEGRAM_CHAT_ID;
  Object.assign(e.propiedades, { TELEGRAM_CODIGO: 'AB12CD', TELEGRAM_CODIGO_VENCE: String(Date.parse('2026-10-13T10:15:00')) });
  e.escribir('/ayuda', 777);
  e.escribir('/start ZZZZZZ', 777);
  e.escribir('/start', 777);
  assert.strictEqual(e.telegram.llamadas.length, 0);
  e.escribir('/start ab12cd', 777);
  assert.strictEqual(e.propiedades.TELEGRAM_CHAT_ID, '777');
  assert.ok(!('TELEGRAM_CODIGO' in e.propiedades));
  assert.ok(!('TELEGRAM_CODIGO_VENCE' in e.propiedades));
  assert.strictEqual(e.ultimoEnviado().chat_id, '777');
  assert.match(e.ultimoEnviado().text, /^✓ Vinculado\./);
  e.escribir('/start AB12CD', 888);
  assert.strictEqual(e.enviados().length, 1);
  assert.strictEqual(e.propiedades.TELEGRAM_CHAT_ID, '777');
});

test('un código vencido no vincula', () => {
  const e = entornoBot();
  delete e.propiedades.TELEGRAM_CHAT_ID;
  Object.assign(e.propiedades, { TELEGRAM_CODIGO: 'AB12CD', TELEGRAM_CODIGO_VENCE: String(Date.parse('2026-10-13T10:15:00')) });
  e.fijarAhora('2026-10-13T10:16:00');
  e.escribir('/start AB12CD', 777);
  assert.ok(!('TELEGRAM_CHAT_ID' in e.propiedades));
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

test('un update ya atendido no se repite aunque la caché se vacíe; uno más viejo que no se atendió sí se atiende', () => {
  const e = entornoBot();
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1234', yape: true });
  e.enviar({ update_id: 7000, message: { message_id: 1, chat: { id: CHAT }, text: 'taxi 12' } });
  e.fijarAhora('2026-10-13T10:01:00');
  e.enviar({ update_id: 7001, message: { message_id: 2, chat: { id: CHAT }, text: 'pan 5' } });
  e.enviar({ update_id: 7002, message: { message_id: 3, chat: { id: CHAT }, text: '/deshacer' } });
  Object.keys(e.cache).forEach(k => delete e.cache[k]);
  e.enviar({ update_id: 7002, message: { message_id: 3, chat: { id: CHAT }, text: '/deshacer' } });
  e.enviar({ update_id: 7000, message: { message_id: 1, chat: { id: CHAT }, text: 'taxi 12' } });
  assert.deepStrictEqual(e.filas('Movimientos').filter(m => m.origen === 'telegram').map(m => m.comercio), ['taxi']);
  // Telegram entrega en paralelo: un update anterior puede llegar después.
  e.fijarAhora('2026-10-13T10:02:00');
  e.enviar({ update_id: 6999, message: { message_id: 4, chat: { id: CHAT }, text: 'agua 2' } });
  assert.deepStrictEqual(e.filas('Movimientos').filter(m => m.origen === 'telegram').map(m => m.comercio), ['taxi', 'agua']);
});
