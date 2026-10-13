// Único archivo que habla con la API de Telegram (UrlFetchApp). El token vive solo en
// las propiedades del script y nunca aparece en los mensajes de error.

const URL_API_TELEGRAM = 'https://api.telegram.org/bot';

// `token` solo se pasa al conectar el bot, antes de guardarlo.
function llamarTelegram_(metodo, datos, token) {
  const clave = token || PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN');
  if (!clave) throw new Error('Telegram no está configurado.');
  const respuesta = UrlFetchApp.fetch(URL_API_TELEGRAM + clave + '/' + metodo, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(datos || {}), muteHttpExceptions: true,
  });
  let cuerpo = {};
  try {
    cuerpo = JSON.parse(respuesta.getContentText());
  } catch {
    // Una página de error en vez de JSON: se informa con el código HTTP.
  }
  if (!cuerpo.ok) throw new Error('Telegram respondió: ' + (cuerpo.description || 'HTTP ' + respuesta.getResponseCode()));
  return cuerpo.result;
}

function telegramVinculado_() {
  const props = PropertiesService.getScriptProperties();
  return !!(props.getProperty('TELEGRAM_TOKEN') && props.getProperty('TELEGRAM_CHAT_ID'));
}

function datosMensaje_(texto, teclado) {
  const datos = {
    chat_id: PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID'),
    text: texto, parse_mode: 'HTML', disable_web_page_preview: true,
  };
  if (teclado && teclado.length) datos.reply_markup = { inline_keyboard: teclado };
  return datos;
}

// teclado = filas de botones [{ text, callback_data } | { text, url }]; sin teclado = sin botones.
function enviarMensaje_(texto, teclado) {
  return llamarTelegram_('sendMessage', datosMensaje_(texto, teclado));
}

function editarMensaje_(messageId, texto, teclado) {
  try {
    return llamarTelegram_('editMessageText', Object.assign({ message_id: messageId }, datosMensaje_(texto, teclado)));
  } catch (e) {
    // Tocar dos veces el mismo botón deja el mensaje igual y Telegram lo reporta como error.
    if (/message is not modified/i.test(e.message)) return null;
    throw e;
  }
}

function responderBoton_(callbackId, texto) {
  return llamarTelegram_('answerCallbackQuery', texto ? { callback_query_id: callbackId, text: texto } : { callback_query_id: callbackId });
}
