// Pestaña Presupuestos, sección "Pagos fijos": pagos mensuales que solo se recuerdan
// (no crean movimientos). También arma la lista de próximos pagos de hoy.

function obtenerRecurrentes() {
  const tcUsd = Number(leerConfig_().ultimo_tc) || 0;
  const recurrentes = leerTabla_('Recurrentes')
    .sort((a, b) => a.dia_mes - b.dia_mes || a.nombre.localeCompare(b.nombre));
  return {
    recurrentes: recurrentes,
    totalMensual: totalPagosFijos_(recurrentes, tcUsd),
    cuentas: leerTabla_('Cuentas').filter(c => c.activa),
    categorias: leerTabla_('Categorias').filter(c => c.tipo === 'gasto' && c.activa),
    tc: tcUsd,
  };
}

function guardarRecurrente(datos) {
  conBloqueo_(() => {
    const d = datos || {};
    const previo = d.id ? leerTabla_('Recurrentes').filter(x => x.id === d.id)[0] : null;
    if (d.id && !previo) throw new Error('Ese pago fijo ya no existe.');
    const r = normalizarRecurrente_(d, leerTabla_('Cuentas'), leerTabla_('Categorias'), previo);
    if (previo) actualizarFila_('Recurrentes', previo.id, r);
    else agregarFilas_('Recurrentes', [Object.assign({ id: nuevoId_() }, r)]);
  });
  return obtenerRecurrentes();
}

function eliminarRecurrente(id) {
  conBloqueo_(() => {
    if (!leerTabla_('Recurrentes').some(x => x.id === id)) throw new Error('Ese pago fijo ya no existe.');
    eliminarFila_('Recurrentes', id);
  });
  return obtenerRecurrentes();
}

// Lista de los próximos 30 días desde hoy (Inicio, /pagos y el recordatorio de las 8:00).
function proximosPagosDeHoy_(movs) {
  return proximosPagos_({
    recurrentes: leerTabla_('Recurrentes'), estados: leerTabla_('EstadosCuenta'), cuentas: leerTabla_('Cuentas'),
    categorias: leerTabla_('Categorias'), movimientos: movs || leerTabla_('Movimientos'),
    tcUsd: Number(leerConfig_().ultimo_tc) || 0,
  }, hoyIso_());
}
