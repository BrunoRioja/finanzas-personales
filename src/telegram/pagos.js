// Próximos pagos por Telegram: aviso al llegar el estado de cuenta, recordatorio diario a
// las 8:00 (3 días antes y el mismo día) y el comando /pagos. Nunca lanzan: un fallo queda
// en el Log.

function montosPorMoneda_(pen, usd) {
  return [pen > 0 ? formatoMonto_(pen, 'PEN') : '', usd > 0 ? formatoMonto_(usd, 'USD') : ''].filter(Boolean).join(' + ');
}

function textoLlegoEstadoCuenta_(ec, nombreTarjeta) {
  const minimo = montosPorMoneda_(ec.minimo_pen, ec.minimo_usd);
  return '💳 Llegó tu estado de cuenta ' + escaparHtml_(nombreTarjeta) + ': ' + montosPorMoneda_(ec.total_pen, ec.total_usd) +
    (minimo ? ' · mínimo ' + minimo : '') + ' · vence el ' + fechaCorta_(ec.fecha_limite) + '.';
}

function avisarEstadosCuenta_(estados) {
  const props = PropertiesService.getScriptProperties();
  if (!estados.length || props.getProperty('MODO_DEMO') === 'si' || !telegramVinculado_()) return;
  try {
    const cuentas = leerTabla_('Cuentas');
    estados.forEach(ec => enviarMensaje_(textoLlegoEstadoCuenta_(ec, nombreCuenta_(cuentas, ec.cuenta_id))));
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}

const HORA_RECORDATORIO_PAGOS = 8;
const DIAS_REGISTRO_RECORDADOS = 7;
const ESTADO_TARJETA_TEXTO = { pagado: '✓', minimo: 'mínimo cubierto', pendiente: 'pendiente' };

function nombrePago_(p) {
  return escaparHtml_((p.emoji ? p.emoji + ' ' : '') + p.nombre);
}

function monedasTarjeta_(p) {
  return [[p.pen, 'PEN'], [p.usd, 'USD']].filter(x => x[0]);
}

function cuandoPago_(p) {
  if (p.vencido) return '⚠️ venció el ' + fechaCorta_(p.fecha);
  if (p.dias < 0) return 'venció el ' + fechaCorta_(p.fecha);
  if (p.dias === 0) return 'hoy';
  if (p.dias === 1) return 'mañana';
  return diaSemana_(p.fecha) + ' ' + fechaCorta_(p.fecha);
}

function lineaPago_(p) {
  if (p.tipo === 'recurrente') {
    return '• ' + nombrePago_(p) + ' · ' + cuandoPago_(p) + ' · ' + formatoMonto_(p.monto, p.moneda) + (p.cuenta ? ' · ' + escaparHtml_(p.cuenta) : '');
  }
  return '• ' + nombrePago_(p) + ' · ' + cuandoPago_(p) + ' · ' +
    monedasTarjeta_(p).map(x => formatoMonto_(x[0].total, x[1]) + ' ' + ESTADO_TARJETA_TEXTO[x[0].estado]).join(' · ');
}

// r = proximosPagos_(…)
function textoPagos_(r) {
  if (!r.pagos.length) return 'No tienes pagos en los próximos ' + DIAS_PROXIMOS_PAGOS + ' días.';
  return ['📅 <b>Próximos pagos</b>'].concat(r.pagos.map(lineaPago_),
    ['', 'Por pagar en ' + DIAS_PROXIMOS_PAGOS + ' días: ' + formatoMonto_(r.porPagar, 'PEN')]).join('\n');
}

// De la tarjeta solo se nombra lo que falta; el mínimo, mientras no esté cubierto.
function lineaRecordatorio_(p) {
  if (p.tipo === 'recurrente') {
    return '• ' + nombrePago_(p) + ' · ' + formatoMonto_(p.monto, p.moneda) + (p.cuenta ? ' · ' + escaparHtml_(p.cuenta) : '');
  }
  const faltan = monedasTarjeta_(p).filter(x => x[0].estado !== 'pagado').map(x => formatoMonto_(x[0].falta, x[1]) +
    (x[0].estado === 'pendiente' ? ' (mínimo ' + formatoMonto_(redondear2_(x[0].minimo - x[0].pagado), x[1]) + ')' : ''));
  return '• ' + nombrePago_(p) + ' · falta ' + faltan.join(' + ');
}

function textoRecordatorio_(hoy, enTres) {
  const lineas = ['📅 <b>Pagos por venir</b>'];
  if (hoy.length) lineas.push('<b>Hoy</b>', ...hoy.map(lineaRecordatorio_));
  if (enTres.length) {
    const f = enTres[0].fecha;
    lineas.push('<b>En ' + DIAS_AVISO_PREVIO + ' días (' + diaSemana_(f) + ' ' + fechaCorta_(f) + ')</b>', ...enTres.map(lineaRecordatorio_));
  }
  return lineas.join('\n');
}

function clavePago_(p) {
  return (p.tipo === 'recurrente' ? 'rec:' : 'ec:') + p.id + ':' + p.fecha;
}

function leerPagosRecordados_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('PAGOS_RECORDADOS') || '{}');
}

// Solo se guarda la última semana: los días viejos se descartan.
function guardarPagosRecordados_(registro, hoy, claves) {
  const limite = sumarDias_(hoy, -DIAS_REGISTRO_RECORDADOS);
  const nuevo = {};
  Object.keys(registro).forEach(d => { if (d > limite) nuevo[d] = registro[d]; });
  nuevo[hoy] = claves;
  PropertiesService.getScriptProperties().setProperty('PAGOS_RECORDADOS', JSON.stringify(nuevo));
}

// La llama el trigger diario de las 8:00. Lo ya recordado no se repite aunque corra dos veces.
function recordarPagos() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MODO_DEMO') === 'si' || !telegramVinculado_()) return;
  try {
    asegurarRecordatorioPagos_();
    asegurarEsquema_();
    const hoy = hoyIso_();
    const registro = leerPagosRecordados_();
    const yaRecordados = registro[hoy] || [];
    const elegidos = proximosPagosDeHoy_().pagos.filter(p =>
      (p.dias === 0 || p.dias === DIAS_AVISO_PREVIO) && yaRecordados.indexOf(clavePago_(p)) < 0 &&
      (p.tipo === 'recurrente' || monedasTarjeta_(p).some(x => x[0].estado !== 'pagado')));
    const prestamos = listaPrestamos_(leerTabla_('Prestamos'), leerTabla_('Abonos'), hoy).pendientes.filter(p =>
      (p.dias === 0 || p.dias === 1) && p.falta > 0 && yaRecordados.indexOf(clavePrestamo_(p)) < 0);
    if (!elegidos.length && !prestamos.length) return;
    const textos = [];
    if (elegidos.length) textos.push(textoRecordatorio_(elegidos.filter(p => p.dias === 0), elegidos.filter(p => p.dias === DIAS_AVISO_PREVIO)));
    if (prestamos.length) textos.push(textoRecordatorioPrestamos_(prestamos.filter(p => p.dias === 0), prestamos.filter(p => p.dias === 1)));
    const app = botonApp_(props.getProperty('APP_URL') || '');
    enviarMensaje_(textos.join('\n\n'), app.length ? [app] : null);
    guardarPagosRecordados_(registro, hoy, yaRecordados.concat(elegidos.map(clavePago_), prestamos.map(clavePrestamo_)));
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}

// Solo desde la app principal: los triggers quedan en el proyecto que los crea.
function configurarRecordatorioPagos_() {
  borrarTriggersRecordatorio_();
  ScriptApp.newTrigger('recordarPagos').timeBased().atHour(HORA_RECORDATORIO_PAGOS).everyDays(1).create();
}

function borrarTriggersRecordatorio_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'recordarPagos')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

// Al abrir la app y en cada recordatorio: deja exactamente un trigger si el bot está
// conectado (falta tras actualizar desde v0.5; sobra si dos aperturas a la vez crearon dos).
// Nunca lanza.
function asegurarRecordatorioPagos_() {
  try {
    if (!PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN')) return;
    const propios = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'recordarPagos');
    if (propios.length > 1) propios.slice(1).forEach(t => ScriptApp.deleteTrigger(t));
    if (propios.length) return;
    configurarRecordatorioPagos_();
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}
