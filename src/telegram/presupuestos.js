// Avisos de presupuesto por Telegram: al cruzar el 80 % y el 100 % de una categoría en el
// mes en curso, una sola vez por umbral. Se llaman después de escribir, fuera del bloqueo,
// y nunca lanzan: un fallo queda en el Log y el aviso sale en la siguiente revisión.

function presupuestoDelMesActual_() {
  const hoy = hoyIso_();
  const mes = mesDe_(hoy);
  const vigentes = presupuestosVigentes_(leerTabla_('Presupuestos'), mes);
  if (!Object.keys(vigentes).length) return { mes: mes, hoy: hoy, filas: [] };
  const categorias = leerTabla_('Categorias');
  const r = presupuestoVsReal_(lineasCategoria_(movimientosQueCuentan_(leerTabla_('Movimientos'), categorias), leerTabla_('Divisiones')),
    vigentes, categorias, mes, hoy);
  return { mes: mes, hoy: hoy, filas: r.filas };
}

function leerAlertasPresupuesto_(mes) {
  const todo = JSON.parse(PropertiesService.getScriptProperties().getProperty('ALERTAS_PRESUPUESTO') || '{}');
  return todo[mes] || {};
}

// Solo se guarda el mes en curso: los meses viejos se descartan.
function guardarAlertasPresupuesto_(mes, registro) {
  const todo = {};
  todo[mes] = registro;
  PropertiesService.getScriptProperties().setProperty('ALERTAS_PRESUPUESTO', JSON.stringify(todo));
}

function textoAlertaPresupuesto_(filas, diasRestantes) {
  return filas.map(f => {
    const base = escaparHtml_((f.emoji ? f.emoji + ' ' : '') + f.nombre) + ': ' + formatoMonto_(f.gastado, 'PEN') +
      ' de ' + formatoMonto_(f.presupuesto, 'PEN') + ' (' + f.porcentaje + ' %).';
    if (f.porcentaje < 100) {
      return '⚠️ ' + base + ' Te quedan ' + formatoMonto_(f.queda, 'PEN') + ' para ' + diasRestantes + (diasRestantes === 1 ? ' día.' : ' días.');
    }
    return '🚨 ' + base + (f.queda < 0 ? ' Te pasaste por ' + formatoMonto_(-f.queda, 'PEN') + '.' : ' Llegaste al tope.');
  }).join('\n');
}

function revisarPresupuestos_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MODO_DEMO') === 'si' || !telegramVinculado_()) return;
  try {
    const actual = presupuestoDelMesActual_();
    const registro = leerAlertasPresupuesto_(actual.mes);
    const nuevas = actual.filas.filter(f => umbralPresupuesto_(f.porcentaje) > (registro[f.categoria_id] || 0));
    if (!nuevas.length) return;
    const diasRestantes = diasDelMes_(actual.mes) - Number(actual.hoy.slice(8, 10)) + 1;
    const app = botonApp_(props.getProperty('APP_URL') || '');
    enviarMensaje_(textoAlertaPresupuesto_(nuevas, diasRestantes), app.length ? [app] : null);
    nuevas.forEach(f => { registro[f.categoria_id] = umbralPresupuesto_(f.porcentaje); });
    guardarAlertasPresupuesto_(actual.mes, registro);
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}

// Al cambiar presupuestos: el registro pasa al umbral que ya alcanzan, sin avisar. Subir un
// presupuesto vuelve a armar el aviso; bajarlo por debajo de lo gastado no avisa.
function ajustarAlertasPresupuesto_(categoriaIds) {
  if (!categoriaIds.length) return;
  try {
    const actual = presupuestoDelMesActual_();
    const registro = leerAlertasPresupuesto_(actual.mes);
    categoriaIds.forEach(id => {
      const fila = actual.filas.filter(f => f.categoria_id === id)[0];
      registro[id] = fila ? umbralPresupuesto_(fila.porcentaje) : 0;
    });
    guardarAlertasPresupuesto_(actual.mes, registro);
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}
