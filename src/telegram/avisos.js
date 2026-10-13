// Avisos que la app manda por el bot: movimientos nuevos por revisar y errores de los
// triggers. Nunca lanzan: si Telegram falla, queda en el Log y la tarea que llamó sigue.

const MS_ENTRE_AVISOS_ERROR = 3600000;

function avisarPorRevisar_(movimientos) {
  if (!movimientos.length || !telegramVinculado_()) return;
  try {
    const ctx = contextoBot_();
    if (movimientos.length > MAX_AVISOS_SUELTOS) {
      const m = mensajeAgrupado_(movimientos.length, ctx.urlApp);
      enviarMensaje_(m.texto, m.teclado);
      return;
    }
    const frecuentes = categoriasFrecuentes_(leerTabla_('Movimientos'), ctx.categorias);
    movimientos.forEach(mov => {
      const m = mensajePorRevisar_(mov, frecuentes[mov.tipo] || [], ctx);
      enviarMensaje_(m.texto, m.teclado);
    });
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}

function registrarAvisoTelegram_(error) {
  try {
    conBloqueo_(() => registrarLog_('aviso', 'telegram', error.message, error.stack));
  } catch { /* sin hoja no hay dónde registrar */ }
}

// `tarea` completa la frase "Falló …" (p. ej. "la lectura de correos").
function avisarError_(tarea, error) {
  if (!telegramVinculado_()) return;
  const props = PropertiesService.getScriptProperties();
  const ultimo = Number(props.getProperty('ULTIMO_AVISO_ERROR')) || 0;
  if (Date.now() - ultimo < MS_ENTRE_AVISOS_ERROR) return;
  props.setProperty('ULTIMO_AVISO_ERROR', String(Date.now()));
  try {
    enviarMensaje_('⚠️ Falló ' + tarea + ': ' + escaparHtml_(error.message));
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}
