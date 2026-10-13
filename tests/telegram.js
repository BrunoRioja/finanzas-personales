const { entornoInstalado } = require('./fixtures');

// Datos ficticios del bot (nunca un token, chat o URL reales).
const SECRETO = 'secreto-de-prueba-0123456789abcd';
const CHAT = 555;
const TOKEN = '123456:token-de-prueba-abcdefghijklmnopqrstuvwxyz';

// App instalada con el bot ya conectado y vinculado al chat CHAT.
function entornoBot(opciones) {
  const e = entornoInstalado(opciones);
  Object.assign(e.propiedades, {
    TELEGRAM_TOKEN: TOKEN, WEBHOOK_SECRET: SECRETO, TELEGRAM_CHAT_ID: String(CHAT), TELEGRAM_BOT: 'prueba_bot',
    APP_URL: 'https://script.google.com/macros/s/APP-PRUEBA/exec',
  });
  let ultimoUpdate = 1000;
  e.enviar = u => e.llamar('recibirTelegram', SECRETO, JSON.stringify(u));
  // Mensaje de texto del chat (por defecto el vinculado). Devuelve el update_id usado.
  e.escribir = (texto, chat) => {
    ultimoUpdate++;
    e.enviar({ update_id: ultimoUpdate, message: { message_id: ultimoUpdate, chat: { id: chat || CHAT }, text: texto } });
    return ultimoUpdate;
  };
  // Toque de un botón del mensaje 77; `texto` = texto visible de ese mensaje.
  e.tocar = (data, texto) => {
    ultimoUpdate++;
    e.enviar({ update_id: ultimoUpdate, callback_query: { id: 'cb' + ultimoUpdate, data, message: { message_id: 77, chat: { id: CHAT }, text: texto || 'mensaje anterior' } } });
  };
  e.llamadas = metodo => e.telegram.llamadas.filter(l => l.metodo === metodo).map(l => l.datos);
  e.enviados = () => e.llamadas('sendMessage');
  e.ultimoEnviado = () => e.enviados().slice(-1)[0];
  e.ultimoEditado = () => e.llamadas('editMessageText').slice(-1)[0];
  e.botones = datos => (datos && datos.reply_markup ? datos.reply_markup.inline_keyboard : []);
  e.limpiarTelegram = () => { e.telegram.llamadas.length = 0; };
  return e;
}

module.exports = { entornoBot, SECRETO, CHAT, TOKEN };
