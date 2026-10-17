// Resumen del día (trigger diario y /hoy) y del mes (/mes).

const HORA_RESUMEN_POR_DEFECTO = 21;

// Config.hora_resumen se guarda como "21:00".
function horaResumen_(config) {
  const h = parseInt(String((config || leerConfig_()).hora_resumen || ''), 10);
  return h >= 0 && h <= 23 ? h : HORA_RESUMEN_POR_DEFECTO;
}

function resumenDelDia_(fecha) {
  const ctx = contextoBot_();
  const movs = leerTabla_('Movimientos');
  const delDia = movs.filter(m => m.fecha === fecha).sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  return textoResumen_(delDia, ctx, {
    cuentan: movimientosQueCuentan_(delDia, ctx.categorias),
    porRevisar: movs.filter(m => m.estado === 'por_revisar').length,
    noLeidos: leerTabla_('Pendientes').filter(p => p.estado === 'pendiente').length,
  });
}

function resumenDelMes_(mes) {
  const movs = leerTabla_('Movimientos');
  const categorias = leerTabla_('Categorias');
  const cuentan = movimientosQueCuentan_(movs, categorias);
  const lineas = lineasCategoria_(cuentan, leerTabla_('Divisiones'));
  const presupuesto = presupuestoVsReal_(lineas, presupuestosVigentes_(leerTabla_('Presupuestos'), mes), categorias, mes, hoyIso_());
  return textoMes_(mes, resumenMes_(cuentan, mes), gastoPorCategoria_(lineas, categorias, mes), presupuesto);
}

// La llama el trigger diario. No lanza: un fallo queda en el Log y se avisa (máx. 1 por hora).
function enviarResumenDiario() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MODO_DEMO') === 'si' || !telegramVinculado_()) return;
  try {
    asegurarEsquema_();
    const texto = resumenDelDia_(hoyIso_());
    if (!texto) return;
    enviarMensaje_(texto, [[boton_('Todo bien ✓', 'ok')].concat(botonApp_(props.getProperty('APP_URL') || ''))]);
  } catch (e) {
    try {
      conBloqueo_(() => registrarLog_('error', 'enviarResumenDiario', e.message, e.stack));
    } catch { /* sin hoja */ }
    avisarError_('el resumen diario', e);
  }
}

// Solo desde la app principal (Ajustes): los triggers quedan en el proyecto que los crea.
function configurarResumen_(hora) {
  borrarTriggersResumen_();
  ScriptApp.newTrigger('enviarResumenDiario').timeBased().atHour(hora).everyDays(1).create();
}

function borrarTriggersResumen_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'enviarResumenDiario')
    .forEach(t => ScriptApp.deleteTrigger(t));
}
