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
