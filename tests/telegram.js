const { entornoInstalado } = require('./fixtures');

// Datos ficticios del bot (nunca un token, chat o URL reales).
const SECRETO = 'secreto-de-prueba-0123456789abcd';
const CHAT = 555;
const TOKEN = '123456:token-de-prueba-abcdefghijklmnopqrstuvwxyz';
const UUIDS = [
  '0b6f3c1e-8f7a-4c2d-9e5b-1a2b3c4d5e6f', '7d2e9a40-1c3b-4f5e-8a6d-2b3c4d5e6f70',
  'c4a1e2f3-5b6c-4d7e-8f90-a1b2c3d4e5f6', '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b',
];

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
  let usados = 0;
  // Movimiento importado por revisar (con id UUID real, para probar la compactación).
  e.porRevisar = extra => {
    const mov = Object.assign({
      id: UUIDS[usados++], fecha: '2026-10-13', tipo: 'gasto', monto: 45.9, moneda: 'PEN', tc: 1, monto_pen: 45.9,
      cuenta_id: e.cuenta('VISA BCP'), cuenta_destino_id: '', categoria_id: '', comercio: 'TOTTUS PRIMAVERA', descripcion: '',
      origen: 'gmail', estado: 'por_revisar', ref_externa: 'gmail:x' + usados, dividido: false, creado_en: '2026-10-13 09:00:00',
    }, extra);
    e.interno('agregarFilas_', 'Movimientos', [mov]);
    return mov;
  };
  e.dato = (accion, mov, categoriaId) => accion + ':' + e.interno('compactarId_', mov.id) +
    (categoriaId ? ':' + e.interno('compactarId_', categoriaId) : '');
  e.mov = id => e.filas('Movimientos').find(m => m.id === id);
  return e;
}

module.exports = { entornoBot, SECRETO, CHAT, TOKEN };
