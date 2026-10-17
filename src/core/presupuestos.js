// Presupuestos mensuales por categoría con vigencia "desde": cada fila vale desde su mes
// hasta que otra más reciente de la misma categoría la reemplaza. Funciones puras.

const UMBRAL_ALERTA = 80;

function presupuestosVigentes_(filas, mes) {
  const elegidas = {};
  filas.forEach(f => {
    if (!f.categoria_id || !f.desde || f.desde > mes) return;
    const actual = elegidas[f.categoria_id];
    if (!actual || f.desde > actual.desde) elegidas[f.categoria_id] = f;
  });
  const vigentes = {};
  Object.keys(elegidas).forEach(id => {
    const monto = redondear2_(elegidas[id].monto);
    if (monto > 0) vigentes[id] = monto;
  });
  return vigentes;
}

function diasDelMes_(mes) {
  const p = mes.split('-').map(Number);
  return new Date(p[0], p[1], 0).getDate();
}

function umbralPresupuesto_(porcentaje) {
  if (porcentaje >= 100) return 100;
  return porcentaje >= UMBRAL_ALERTA ? UMBRAL_ALERTA : 0;
}

// Porcentaje del mes transcurrido: dónde "debería" ir el gasto a esta fecha.
function ritmoDelMes_(mes, hoyIso) {
  const actual = mesDe_(hoyIso);
  if (mes < actual) return 100;
  if (mes > actual) return 0;
  return Math.round(Number(hoyIso.slice(8, 10)) / diasDelMes_(mes) * 100);
}

// lineas = lineasCategoria_(movs, divisiones); vigentes = presupuestosVigentes_(filas, mes).
function presupuestoVsReal_(lineas, vigentes, categorias, mes, hoyIso) {
  const gastado = {};
  let sinPresupuesto = 0;
  lineas.forEach(l => {
    if (l.tipo !== 'gasto' || mesDe_(l.fecha) !== mes) return;
    if (l.categoria_id && vigentes[l.categoria_id]) gastado[l.categoria_id] = (gastado[l.categoria_id] || 0) + l.monto_pen;
    else sinPresupuesto += l.monto_pen;
  });
  const ritmo = ritmoDelMes_(mes, hoyIso);
  const filas = Object.keys(vigentes).map(id => {
    const c = categorias.filter(x => x.id === id)[0] || SIN_CATEGORIA;
    const presupuesto = vigentes[id];
    // Una categoría con más reembolsos que gastos no baja de 0.
    const g = Math.max(0, redondear2_(gastado[id] || 0));
    const porcentaje = Math.round(g / presupuesto * 100);
    const estado = porcentaje >= 100 ? 'pasado' : porcentaje >= UMBRAL_ALERTA ? 'alerta' : 'ok';
    return {
      categoria_id: id, nombre: c.nombre, emoji: c.emoji, color: c.color, gastado: g, presupuesto: presupuesto,
      porcentaje: porcentaje, queda: redondear2_(presupuesto - g), estado: estado, ritmo: ritmo,
    };
  }).sort((a, b) => b.porcentaje - a.porcentaje || a.nombre.localeCompare(b.nombre));
  return {
    filas: filas,
    total: {
      presupuesto: redondear2_(filas.reduce((s, x) => s + x.presupuesto, 0)),
      gastado: redondear2_(filas.reduce((s, x) => s + x.gastado, 0)),
    },
    sinPresupuesto: redondear2_(sinPresupuesto),
  };
}

// Gasto del mes anterior y promedio de los 3 anteriores, como referencia al presupuestar.
function referenciaPresupuesto_(lineas, mes) {
  const meses = [1, 2, 3].map(n => sumarMeses_(mes, -n));
  const porCategoria = {};
  lineas.forEach(l => {
    if (l.tipo !== 'gasto' || !l.categoria_id) return;
    const i = meses.indexOf(mesDe_(l.fecha));
    if (i < 0) return;
    const sumas = porCategoria[l.categoria_id] = porCategoria[l.categoria_id] || [0, 0, 0];
    sumas[i] += l.monto_pen;
  });
  const referencia = {};
  Object.keys(porCategoria).forEach(id => {
    const s = porCategoria[id];
    referencia[id] = { mesPasado: redondear2_(s[0]), promedio3: redondear2_((s[0] + s[1] + s[2]) / 3) };
  });
  return referencia;
}
