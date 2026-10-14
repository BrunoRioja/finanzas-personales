// Próximos pagos: pagos fijos (recurrentes, que solo se recuerdan) y la tarjeta de crédito
// según su último estado de cuenta, controlada por moneda. Funciones puras.

const DIAS_PROXIMOS_PAGOS = 30;
const DIAS_AVISO_PREVIO = 3;
// Sin estado de cuenta anterior, los pagos cuentan desde estos días antes del correo:
// es común pagar desde la app del banco antes de que llegue.
const DIAS_PAGO_ANTICIPADO = 10;
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function fechaDeIso_(fechaIso) {
  const p = String(fechaIso).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function isoDeFecha_(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function sumarDias_(fechaIso, n) {
  const d = fechaDeIso_(fechaIso);
  d.setDate(d.getDate() + n);
  return isoDeFecha_(d);
}

// Con UTC para que un cambio de horario no corra el resultado.
function diasEntre_(aIso, bIso) {
  const utc = iso => { const p = String(iso).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  return Math.round((utc(bIso) - utc(aIso)) / 86400000);
}

function diaSemana_(fechaIso) {
  return DIAS_SEMANA[fechaDeIso_(fechaIso).getDay()];
}

function fechaCorta_(fechaIso) {
  return String(fechaIso).slice(8, 10) + '/' + String(fechaIso).slice(5, 7);
}

// Próxima fecha ≥ hoy de un pago del día `diaMes` (1–31); en meses cortos, el último día.
function fechaRecurrente_(diaMes, hoyIso) {
  const enMes = mes => mes + '-' + String(Math.min(Number(diaMes), diasDelMes_(mes))).padStart(2, '0');
  const mes = mesDe_(hoyIso);
  const esteMes = enMes(mes);
  return esteMes >= hoyIso ? esteMes : enMes(sumarMeses_(mes, 1));
}

// Desde el día siguiente al vencimiento del estado de cuenta anterior de la misma tarjeta.
function inicioPagosTarjeta_(ec, estados) {
  const previos = estados
    .filter(x => x.cuenta_id === ec.cuenta_id && x.emitido < ec.emitido)
    .sort((a, b) => (a.emitido < b.emitido ? 1 : -1));
  return previos.length ? sumarDias_(previos[0].fecha_limite, 1) : sumarDias_(ec.emitido, -DIAS_PAGO_ANTICIPADO);
}

// Pagos por moneda: los de S/ cuentan contra el total en S/, y los de $ contra el total en $.
// Se cuentan también los pagos por revisar: el pago ya ocurrió.
function estadoTarjeta_(ec, estados, movimientos) {
  const desde = inicioPagosTarjeta_(ec, estados);
  const pagado = { PEN: 0, USD: 0 };
  movimientos.forEach(m => {
    if (m.tipo !== 'transferencia' || m.cuenta_destino_id !== ec.cuenta_id || m.fecha < desde) return;
    if (m.moneda in pagado) pagado[m.moneda] += Number(m.monto) || 0;
  });
  const parte = (total, minimo, abonado) => {
    const t = redondear2_(total);
    if (!(t > 0)) return null;
    const p = redondear2_(abonado);
    const min = redondear2_(minimo);
    return { total: t, minimo: min, pagado: p, falta: redondear2_(Math.max(0, t - p)), estado: p >= t ? 'pagado' : p >= min ? 'minimo' : 'pendiente' };
  };
  return { pen: parte(ec.total_pen, ec.minimo_pen, pagado.PEN), usd: parte(ec.total_usd, ec.minimo_usd, pagado.USD) };
}

function ultimosEstadosCuenta_(estados) {
  const ultimo = {};
  estados.forEach(ec => {
    if (!ec.cuenta_id) return;
    const actual = ultimo[ec.cuenta_id];
    if (!actual || ec.emitido > actual.emitido) ultimo[ec.cuenta_id] = ec;
  });
  return Object.keys(ultimo).map(k => ultimo[k]);
}

// datos = { recurrentes, estados, cuentas, categorias, movimientos, tcUsd }
function proximosPagos_(datos, hoyIso) {
  const limite = sumarDias_(hoyIso, DIAS_PROXIMOS_PAGOS);
  const cuenta = id => datos.cuentas.filter(c => c.id === id)[0];
  const categoria = id => datos.categorias.filter(c => c.id === id)[0];
  const tc = Number(datos.tcUsd) || 0;
  const pagos = [];
  datos.recurrentes.forEach(r => {
    if (!r.activo) return;
    const fecha = fechaRecurrente_(r.dia_mes, hoyIso);
    if (fecha > limite) return;
    pagos.push({
      tipo: 'recurrente', id: r.id, nombre: r.nombre, emoji: (categoria(r.categoria_id) || {}).emoji || '', fecha: fecha,
      dias: diasEntre_(hoyIso, fecha), monto: redondear2_(r.monto), moneda: r.moneda, cuenta: (cuenta(r.cuenta_id) || {}).nombre || '',
    });
  });
  ultimosEstadosCuenta_(datos.estados).forEach(ec => {
    const t = estadoTarjeta_(ec, datos.estados, datos.movimientos);
    const partes = [t.pen, t.usd].filter(Boolean);
    if (!partes.length || ec.fecha_limite > limite) return;
    const debe = partes.some(p => p.estado !== 'pagado');
    if (!debe && ec.fecha_limite < hoyIso) return;
    pagos.push({
      tipo: 'tarjeta', id: ec.id, nombre: (cuenta(ec.cuenta_id) || {}).nombre || 'Tarjeta', emoji: '💳', fecha: ec.fecha_limite,
      dias: diasEntre_(hoyIso, ec.fecha_limite), pen: t.pen, usd: t.usd,
      vencido: ec.fecha_limite < hoyIso && partes.some(p => p.estado === 'pendiente'),
    });
  });
  pagos.sort((a, b) => (a.fecha === b.fecha ? a.nombre.localeCompare(b.nombre) : a.fecha < b.fecha ? -1 : 1));
  const enSoles = (monto, moneda) => (moneda === 'USD' ? monto * tc : monto);
  const porPagar = pagos.reduce((s, p) => {
    if (p.tipo === 'recurrente') return s + enSoles(p.monto, p.moneda);
    return s + (p.pen ? p.pen.falta : 0) + (p.usd ? enSoles(p.usd.falta, 'USD') : 0);
  }, 0);
  return { pagos: pagos, porPagar: redondear2_(porPagar) };
}

function totalPagosFijos_(recurrentes, tcUsd) {
  return redondear2_(recurrentes
    .filter(r => r.activo)
    .reduce((s, r) => s + (r.moneda === 'USD' ? Number(r.monto) * (Number(tcUsd) || 0) : Number(r.monto)), 0));
}
