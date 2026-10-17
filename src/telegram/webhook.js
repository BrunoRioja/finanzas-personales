// Puerta de entrada del bot. El receptor público llama a recibirTelegram con el secreto de
// la URL y el cuerpo del POST. Todo lo que no traiga el secreto, o no venga del chat
// vinculado, se ignora en silencio. Nada de aquí crea triggers (se ejecuta en el receptor).

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
  if (!esUpdateNuevo_(update.update_id)) return;
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

const MAX_UPDATES_ATENDIDOS = 200;

// Telegram reintenta cada update mientras no reciba un 200, y Apps Script siempre responde
// 302: se recuerdan los últimos updates atendidos (en propiedades, que no se vacían como la
// caché). Telegram entrega en paralelo, así que no se asume ningún orden.
function esUpdateNuevo_(updateId) {
  return conBloqueo_(() => {
    const props = PropertiesService.getScriptProperties();
    const atendidos = JSON.parse(props.getProperty('UPDATES_ATENDIDOS') || '[]');
    if (atendidos.indexOf(updateId) >= 0) return false;
    props.setProperty('UPDATES_ATENDIDOS', JSON.stringify(atendidos.concat([updateId]).slice(-MAX_UPDATES_ATENDIDOS)));
    return true;
  });
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
    asegurarEsquema_(); // fuera de conBloqueo_: toma el lock solo si hay que migrar
    if (boton) {
      try {
        manejarBoton_(boton);
      } finally {
        // Quita el reloj del botón aunque la acción falle.
        try { responderBoton_(boton.id); } catch { /* el mensaje de error de abajo basta */ }
      }
      revisarPresupuestos_();
      return;
    }
    const texto = String(mensaje.text || '').trim();
    if (!texto) {
      enviarMensaje_('Por ahora solo entiendo texto. El audio y las fotos llegan en una próxima versión.');
      return;
    }
    if (texto[0] === '/') {
      manejarComando_(texto);
    } else {
      manejarEscrito_(texto, updateId);
      revisarPresupuestos_();
    }
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
    case '/hoy':
      return enviarMensaje_(resumenDelDia_(hoyIso_()) || 'Hoy no hay movimientos.');
    case '/mes':
      return enviarMensaje_(resumenDelMes_(mesDe_(hoyIso_())));
    case '/pagos':
      return enviarMensaje_(textoPagos_(proximosPagosDeHoy_()));
    case '/prestamos':
      return enviarMensaje_(textoPrestamos_(listaPrestamos_(leerTabla_('Prestamos'), leerTabla_('Abonos'), hoyIso_())));
    case '/deshacer':
      return deshacerUltimo_();
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
