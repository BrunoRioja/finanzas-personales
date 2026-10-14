const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');
const { TOKEN } = require('./telegram');

const URL_RECEPTOR = 'https://script.google.com/macros/s/RECEPTOR-PRUEBA_1/exec';
const conectar = (e, extra) => e.llamar('configurarTelegram', Object.assign({ token: TOKEN, url_receptor: URL_RECEPTOR }, extra));
const metodos = e => e.telegram.llamadas.map(l => l.metodo);

test('valida el token y la URL antes de llamar a Telegram', () => {
  const e = entornoInstalado();
  assert.throws(() => conectar(e, { token: 'hola' }), /@BotFather/);
  assert.throws(() => conectar(e, { url_receptor: 'https://ejemplo.com/exec' }), /URL del receptor/);
  assert.throws(() => conectar(e, { url_receptor: 'https://script.google.com/macros/s/APP-PRUEBA/exec' }), /URL de la app/);
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

test('un token rechazado por Telegram no guarda nada', () => {
  const e = entornoInstalado();
  e.telegram.falla = 'Unauthorized';
  assert.throws(() => conectar(e), /Telegram respondió: Unauthorized/);
  assert.ok(!('TELEGRAM_TOKEN' in e.propiedades));
});

test('conectar guarda los secretos, registra el webhook con el secreto, crea el trigger y da un código', () => {
  const e = entornoInstalado();
  const estado = conectar(e);
  const p = e.propiedades;
  assert.strictEqual(p.TELEGRAM_TOKEN, TOKEN);
  assert.strictEqual(p.WEBHOOK_SECRET.length, 32);
  assert.deepStrictEqual([p.RECEPTOR_URL, p.TELEGRAM_BOT, p.APP_URL, p.SHEET_ID],
    [URL_RECEPTOR, 'prueba_bot', 'https://script.google.com/macros/s/APP-PRUEBA/exec', 'libro-principal']);
  assert.ok(!('TELEGRAM_CHAT_ID' in p));
  assert.deepStrictEqual(metodos(e), ['getMe', 'setWebhook']);
  assert.deepStrictEqual(e.telegram.llamadas[1].datos, {
    url: URL_RECEPTOR + '?secret=' + p.WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true,
  });
  assert.match(estado.codigo, /^[0-9A-Z]{6}$/);
  assert.deepStrictEqual(estado, {
    configurado: true, vinculado: false, bot: 'prueba_bot', url_receptor: URL_RECEPTOR, codigo: estado.codigo,
    enlace: 'https://t.me/prueba_bot?start=' + estado.codigo, hora_resumen: 21, cuenta_bot: '',
  });
  const t = e.triggers.filter(x => x.funcion === 'enviarResumenDiario');
  assert.deepStrictEqual(t.map(x => x.hora), [21]);
  assert.deepStrictEqual(e.triggers.filter(x => x.funcion === 'recordarPagos').map(x => x.hora), [8]);
});

test('flujo completo: el código enviado al bot vincula el chat; vence a los 15 minutos', () => {
  const e = entornoInstalado();
  const { codigo } = conectar(e);
  const secreto = e.propiedades.WEBHOOK_SECRET;
  e.llamar('recibirTelegram', secreto, JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: 4321 }, text: '/start ' + codigo } }));
  const estado = e.llamar('estadoTelegram');
  assert.deepStrictEqual([estado.vinculado, estado.codigo, estado.enlace], [true, '', '']);
  assert.strictEqual(e.propiedades.TELEGRAM_CHAT_ID, '4321');

  const otro = entornoInstalado();
  const r = conectar(otro);
  otro.fijarAhora('2026-10-13T10:16:00');
  assert.strictEqual(otro.llamar('estadoTelegram').codigo, '');
  otro.llamar('recibirTelegram', otro.propiedades.WEBHOOK_SECRET, JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: 1 }, text: '/start ' + r.codigo } }));
  assert.strictEqual(otro.llamar('estadoTelegram').vinculado, false);
  const nuevo = otro.llamar('nuevoCodigoTelegram');
  assert.notStrictEqual(nuevo.codigo, r.codigo);
  assert.match(nuevo.codigo, /^[0-9A-Z]{6}$/);
});

test('nuevoCodigoTelegram exige el bot conectado y sin vincular', () => {
  const e = entornoInstalado();
  assert.throws(() => e.llamar('nuevoCodigoTelegram'), /Primero conecta el bot/);
  conectar(e);
  e.propiedades.TELEGRAM_CHAT_ID = '1';
  assert.throws(() => e.llamar('nuevoCodigoTelegram'), /ya está vinculado/);
});

test('guardarTelegram valida y cambia la hora del resumen y la cuenta predeterminada', () => {
  const e = entornoInstalado();
  conectar(e);
  const estado = e.llamar('guardarTelegram', { hora_resumen: 20, cuenta_bot: e.cuenta('VISA BCP') });
  assert.deepStrictEqual([estado.hora_resumen, estado.cuenta_bot], [20, e.cuenta('VISA BCP')]);
  assert.strictEqual(e.interno('leerConfig_').hora_resumen, '20:00');
  assert.deepStrictEqual(e.triggers.filter(x => x.funcion === 'enviarResumenDiario').map(x => x.hora), [20]);
  assert.throws(() => e.llamar('guardarTelegram', { hora_resumen: 25, cuenta_bot: '' }), /de 0 a 23/);
  e.llamar('guardarCuenta', { id: e.cuenta('VISA BCP'), nombre: 'VISA BCP', tipo: 'credito', numeros: '0042', activa: false });
  assert.throws(() => e.llamar('guardarTelegram', { hora_resumen: 21, cuenta_bot: e.cuenta('VISA BCP') }), /desactivada/);
  assert.strictEqual(e.llamar('guardarTelegram', { hora_resumen: 21, cuenta_bot: '' }).cuenta_bot, '');
});

test('probarTelegram envía un mensaje solo con el bot vinculado', () => {
  const e = entornoInstalado();
  assert.throws(() => e.llamar('probarTelegram'), /aún no está vinculado/);
  conectar(e);
  e.propiedades.TELEGRAM_CHAT_ID = '4321';
  assert.deepStrictEqual(e.llamar('probarTelegram'), { ok: true });
  assert.strictEqual(e.telegram.llamadas.slice(-1)[0].datos.text, '✓ Mensaje de prueba de tu app de finanzas.');
});

test('desvincular borra el webhook, los secretos y el trigger; funciona aunque Telegram falle', () => {
  const e = entornoInstalado();
  conectar(e);
  e.propiedades.TELEGRAM_CHAT_ID = '4321';
  e.telegram.falla = 'Bad Gateway';
  const estado = e.llamar('desvincularTelegram');
  assert.strictEqual(metodos(e).slice(-1)[0], 'deleteWebhook');
  ['TELEGRAM_TOKEN', 'TELEGRAM_CHAT_ID', 'WEBHOOK_SECRET', 'RECEPTOR_URL', 'TELEGRAM_BOT', 'TELEGRAM_CODIGO', 'TELEGRAM_CODIGO_VENCE']
    .forEach(k => assert.ok(!(k in e.propiedades), k));
  assert.strictEqual(e.triggers.filter(x => x.funcion === 'enviarResumenDiario').length, 0);
  assert.deepStrictEqual([estado.configurado, estado.vinculado], [false, false]);
  assert.strictEqual(e.filas('Log').filter(l => l.origen === 'telegram').length, 1);
});

test('en modo demo no se puede conectar', () => {
  const e = entornoInstalado();
  e.propiedades.MODO_DEMO = 'si';
  assert.throws(() => conectar(e), /modo demo/);
});

test('conectar un bot nuevo olvida los updates atendidos del anterior y no limita las conexiones', () => {
  const e = entornoInstalado();
  e.propiedades.UPDATES_ATENDIDOS = '[999999999]';
  conectar(e);
  assert.ok(!('UPDATES_ATENDIDOS' in e.propiedades));
  assert.ok(!('max_connections' in e.telegram.llamadas[1].datos));
});
