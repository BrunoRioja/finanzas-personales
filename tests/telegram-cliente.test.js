const test = require('node:test');
const assert = require('node:assert');
const { entornoBot, TOKEN, CHAT } = require('./telegram');

test('enviarMensaje_ manda HTML al chat vinculado con su teclado', () => {
  const e = entornoBot();
  const r = e.interno('enviarMensaje_', 'Hola <b>Ana</b>', [[{ text: 'A', callback_data: 'x' }]]);
  assert.strictEqual(r.message_id, 101);
  const [l] = e.telegram.llamadas;
  assert.strictEqual(l.token, TOKEN);
  assert.strictEqual(l.metodo, 'sendMessage');
  assert.deepStrictEqual(l.datos, {
    chat_id: String(CHAT), text: 'Hola <b>Ana</b>', parse_mode: 'HTML', disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: 'A', callback_data: 'x' }]] },
  });
});

test('sin teclado no hay reply_markup; editar sin teclado quita los botones', () => {
  const e = entornoBot();
  e.interno('enviarMensaje_', 'solo texto');
  e.interno('editarMensaje_', 77, 'editado', null);
  const [envio, edicion] = e.telegram.llamadas;
  assert.ok(!('reply_markup' in envio.datos));
  assert.strictEqual(edicion.metodo, 'editMessageText');
  assert.deepStrictEqual(edicion.datos, { chat_id: String(CHAT), message_id: 77, text: 'editado', parse_mode: 'HTML', disable_web_page_preview: true });
});

test('un error de Telegram se informa con su descripción y sin el token', () => {
  const e = entornoBot();
  e.telegram.falla = 'Bad Request: chat not found';
  assert.throws(() => e.interno('enviarMensaje_', 'x'),
    err => err.message === 'Telegram respondió: Bad Request: chat not found' && err.message.indexOf(TOKEN) < 0);
});

test('una respuesta que no es JSON se informa con el código HTTP', () => {
  const e = entornoBot();
  e.telegram.respuestas.sendMessage = () => ({ __crudo: '<html>Bad gateway</html>', __codigo: 502 });
  assert.throws(() => e.interno('enviarMensaje_', 'x'), /^Error: Telegram respondió: HTTP 502$/);
});

test('editarMensaje_ ignora "message is not modified" (doble toque) pero no otros errores', () => {
  const e = entornoBot();
  e.telegram.falla = 'Bad Request: message is not modified: specified new message content is the same';
  assert.strictEqual(e.interno('editarMensaje_', 77, 'x', null), null);
  e.telegram.falla = 'Bad Request: message to edit not found';
  assert.throws(() => e.interno('editarMensaje_', 77, 'x', null), /message to edit not found/);
});

test('sin token: "Telegram no está configurado"; telegramVinculado_ exige token y chat', () => {
  const e = entornoBot();
  assert.strictEqual(e.interno('telegramVinculado_'), true);
  delete e.propiedades.TELEGRAM_CHAT_ID;
  assert.strictEqual(e.interno('telegramVinculado_'), false);
  delete e.propiedades.TELEGRAM_TOKEN;
  assert.throws(() => e.interno('enviarMensaje_', 'x'), /Telegram no está configurado/);
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

test('llamarTelegram_ con token explícito (antes de guardarlo) y responderBoton_', () => {
  const e = entornoBot();
  delete e.propiedades.TELEGRAM_TOKEN;
  assert.strictEqual(e.interno('llamarTelegram_', 'getMe', {}, '999:otro-token').username, 'prueba_bot');
  assert.strictEqual(e.telegram.llamadas[0].token, '999:otro-token');
  e.propiedades.TELEGRAM_TOKEN = TOKEN;
  e.interno('responderBoton_', 'cb1');
  e.interno('responderBoton_', 'cb2', 'Listo');
  assert.deepStrictEqual(e.llamadas('answerCallbackQuery'), [{ callback_query_id: 'cb1' }, { callback_query_id: 'cb2', text: 'Listo' }]);
});

test('una falla de red no deja el token en el error ni en el Log', () => {
  const e = entornoBot();
  e.telegram.redCaida = true;
  assert.throws(() => e.interno('enviarMensaje_', 'x'),
    err => err.message.indexOf(TOKEN) < 0 && /^No pude conectar con Telegram: Address unavailable: https:\/\/api\.telegram\.org\/bot<token>\/sendMessage$/.test(err.message));
  e.escribir('/ayuda');
  const log = e.filas('Log');
  assert.ok(log.length > 0);
  assert.ok(!JSON.stringify(log).includes(TOKEN));
});
