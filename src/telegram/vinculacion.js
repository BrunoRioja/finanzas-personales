// Conexión del bot desde Ajustes. Se ejecuta en la app principal (no en el receptor):
// aquí se crea el trigger del resumen y se guardan la URL de la app y el id de la hoja,
// que el receptor no puede obtener por sí mismo.

const PATRON_TOKEN = /^\d+:[\w-]{30,}$/;
const PATRON_URL_RECEPTOR = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
const MINUTOS_CODIGO = 15;
const PROPIEDADES_TELEGRAM = [
  'TELEGRAM_TOKEN', 'TELEGRAM_CHAT_ID', 'WEBHOOK_SECRET', 'RECEPTOR_URL', 'TELEGRAM_BOT',
  'TELEGRAM_CODIGO', 'TELEGRAM_CODIGO_VENCE', 'ULTIMO_AVISO_ERROR',
];

function textoAlAzar_(largo) {
  let t = '';
  while (t.length < largo) t += Utilities.getUuid().replace(/-/g, '');
  return t.slice(0, largo);
}

function nuevoCodigo_(props) {
  props.setProperty('TELEGRAM_CODIGO', textoAlAzar_(6).toUpperCase());
  props.setProperty('TELEGRAM_CODIGO_VENCE', String(Date.now() + MINUTOS_CODIGO * 60000));
}

function configurarTelegram(datos) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MODO_DEMO') === 'si') throw new Error('Sal del modo demo para conectar Telegram.');
  const token = String(datos.token || '').trim();
  const url = String(datos.url_receptor || '').trim();
  if (!PATRON_TOKEN.test(token)) throw new Error('El token no parece de @BotFather: debe verse como 123456789:ABC…');
  if (!PATRON_URL_RECEPTOR.test(url)) throw new Error('La URL del receptor debe verse como https://script.google.com/macros/s/…/exec');
  const urlApp = ScriptApp.getService().getUrl() || '';
  if (url === urlApp) throw new Error('Esa es la URL de la app, no la del receptor. Copia la que imprime npm run deploy:receptor.');
  const bot = llamarTelegram_('getMe', {}, token);
  const secreto = textoAlAzar_(32);
  llamarTelegram_('setWebhook', {
    url: url + '?secret=' + secreto, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true,
  }, token);
  const idHoja = abrirLibro_().getId();
  PROPIEDADES_TELEGRAM.forEach(k => props.deleteProperty(k));
  props.setProperty('TELEGRAM_TOKEN', token);
  props.setProperty('WEBHOOK_SECRET', secreto);
  props.setProperty('RECEPTOR_URL', url);
  props.setProperty('TELEGRAM_BOT', bot.username || '');
  props.setProperty('APP_URL', urlApp);
  if (!props.getProperty('SHEET_ID')) props.setProperty('SHEET_ID', idHoja);
  nuevoCodigo_(props);
  configurarResumen_(horaResumen_());
  return estadoTelegram();
}

function estadoTelegram() {
  const props = PropertiesService.getScriptProperties();
  const config = leerConfig_();
  const bot = props.getProperty('TELEGRAM_BOT') || '';
  const vinculado = !!props.getProperty('TELEGRAM_CHAT_ID');
  const vence = Number(props.getProperty('TELEGRAM_CODIGO_VENCE')) || 0;
  const codigo = !vinculado && vence > Date.now() ? props.getProperty('TELEGRAM_CODIGO') || '' : '';
  return {
    configurado: !!props.getProperty('TELEGRAM_TOKEN'), vinculado: vinculado, bot: bot,
    url_receptor: props.getProperty('RECEPTOR_URL') || '', codigo: codigo,
    enlace: codigo && bot ? 'https://t.me/' + bot + '?start=' + codigo : '',
    hora_resumen: horaResumen_(config), cuenta_bot: config.cuenta_bot || '',
  };
}

function nuevoCodigoTelegram() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TELEGRAM_TOKEN')) throw new Error('Primero conecta el bot.');
  if (props.getProperty('TELEGRAM_CHAT_ID')) throw new Error('El bot ya está vinculado.');
  nuevoCodigo_(props);
  return estadoTelegram();
}

function guardarTelegram(datos) {
  const hora = Number(datos.hora_resumen);
  if (!Number.isInteger(hora) || hora < 0 || hora > 23) throw new Error('La hora del resumen debe ir de 0 a 23.');
  const cuentaId = String(datos.cuenta_bot || '');
  conBloqueo_(() => {
    if (cuentaId) buscarActiva_(leerTabla_('Cuentas'), cuentaId, 'La cuenta');
    guardarConfig_({ hora_resumen: hora + ':00', cuenta_bot: cuentaId });
  });
  if (PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN')) configurarResumen_(hora);
  return estadoTelegram();
}

function probarTelegram() {
  if (!telegramVinculado_()) throw new Error('El bot aún no está vinculado.');
  enviarMensaje_('✓ Mensaje de prueba de tu app de finanzas.');
  return { ok: true };
}

function desvincularTelegram() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TELEGRAM_TOKEN')) {
    try {
      llamarTelegram_('deleteWebhook', { drop_pending_updates: true });
    } catch (e) {
      registrarAvisoTelegram_(e);
    }
  }
  PROPIEDADES_TELEGRAM.forEach(k => props.deleteProperty(k));
  borrarTriggersResumen_();
  return estadoTelegram();
}
