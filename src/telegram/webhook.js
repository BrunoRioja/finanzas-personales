// Puerta de entrada del bot. El receptor público llama a recibirTelegram con el secreto de
// la URL y el cuerpo del POST. Todo lo que no traiga el secreto, o no venga del chat
// vinculado, se ignora en silencio. Nada de aquí crea triggers (se ejecuta en el receptor).

const SEGUNDOS_RECORDAR_UPDATE = 21600; // 6 h: Telegram reintenta mientras no reciba 200

function recibirTelegram(secreto, cuerpo) {
  const props = PropertiesService.getScriptProperties();
  if (!secretoValido_(secreto, props.getProperty('WEBHOOK_SECRET'))) return;
  let update;
  try {
    update = JSON.parse(cuerpo);
  } catch {
    return;
  }
  if (!update || typeof update.update_id !== 'number') return;
  const cache = CacheService.getScriptCache();
  const clave = 'tg:' + update.update_id;
  if (cache.get(clave)) return;
  cache.put(clave, '1', SEGUNDOS_RECORDAR_UPDATE);
  const mensaje = update.message;
  const boton = update.callback_query;
  const chat = mensaje ? mensaje.chat : boton && boton.message ? boton.message.chat : null;
  if (!chat) return;
  const vinculado = props.getProperty('TELEGRAM_CHAT_ID');
  if (!vinculado) {
    if (mensaje) intentarVincular_(String(chat.id), String(mensaje.text || ''));
    return;
  }
  if (String(chat.id) !== vinculado) return;
  atenderTelegram_(update.update_id, mensaje, boton);
}

// Comparación de tiempo constante: no revela cuántos caracteres coinciden.
function secretoValido_(recibido, esperado) {
  const a = String(recibido || '');
  const b = String(esperado || '');
  if (!b || a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

function atenderTelegram_(updateId, mensaje, boton) {
  try {
    if (PropertiesService.getScriptProperties().getProperty('MODO_DEMO') === 'si') {
      if (boton) responderBoton_(boton.id);
      enviarMensaje_('La app está en modo demo; sal del modo demo para usar el bot.');
      return;
    }
    if (boton) {
      try {
        manejarBoton_(boton);
      } finally {
        // Quita el reloj del botón aunque la acción falle.
        try { responderBoton_(boton.id); } catch { /* el mensaje de error de abajo basta */ }
      }
      return;
    }
    const texto = String(mensaje.text || '').trim();
    if (!texto) {
      enviarMensaje_('Por ahora solo entiendo texto. El audio y las fotos llegan en una próxima versión.');
      return;
    }
    if (texto[0] === '/') manejarComando_(texto);
    else manejarEscrito_(texto, updateId);
  } catch (e) {
    try {
      conBloqueo_(() => registrarLog_('error', 'telegram', e.message, e.stack));
    } catch { /* sin hoja no hay dónde registrar */ }
    try {
      enviarMensaje_('⚠️ No pude completar eso: ' + escaparHtml_(e.message));
    } catch { /* Telegram caído: queda en el Log */ }
  }
}

function manejarComando_(texto) {
  const comando = texto.split(/\s+/)[0].toLowerCase().replace(/@\w+$/, '');
  switch (comando) {
    case '/start':
    case '/ayuda':
    case '/help':
      return enviarMensaje_(TEXTO_AYUDA);
    default:
      return enviarMensaje_('Comando desconocido. Escribe /ayuda.');
  }
}

// Solo antes de vincular: el primer "/start <código>" correcto y vigente fija el chat.
function intentarVincular_(chatId, texto) {
  const m = /^\/start\s+([A-Za-z0-9]+)$/.exec(texto.trim());
  if (!m) return;
  const props = PropertiesService.getScriptProperties();
  const codigo = props.getProperty('TELEGRAM_CODIGO');
  const vence = Number(props.getProperty('TELEGRAM_CODIGO_VENCE')) || 0;
  if (!codigo || m[1].toUpperCase() !== codigo || Date.now() > vence) return;
  props.setProperty('TELEGRAM_CHAT_ID', chatId);
  props.deleteProperty('TELEGRAM_CODIGO');
  props.deleteProperty('TELEGRAM_CODIGO_VENCE');
  try {
    enviarMensaje_('✓ Vinculado. Te escribiré cuando haya algo por revisar.\n\n' + TEXTO_AYUDA);
  } catch (e) {
    try {
      conBloqueo_(() => registrarLog_('aviso', 'telegram', e.message, e.stack));
    } catch { /* sin hoja */ }
  }
}
