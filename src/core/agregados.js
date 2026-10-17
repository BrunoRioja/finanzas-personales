// Cálculos del dashboard. Funciones puras: reciben las listas ya leídas de la hoja.
// Todo suma en monto_pen; las transferencias no son gasto ni ingreso.

const SIN_CATEGORIA = { nombre: 'Sin categoría', emoji: '❓', color: '#3a3a48' };

function lineasCategoria_(movs, divisiones) {
  const porMovimiento = {};
  divisiones.forEach(d => { (porMovimiento[d.movimiento_id] = porMovimiento[d.movimiento_id] || []).push(d); });
  const lineas = [];
  movs.forEach(m => {
    if (m.tipo === 'transferencia') return;
    const partes = m.dividido ? porMovimiento[m.id] : null;
    if (partes && partes.length) {
      partes.forEach(d => lineas.push({ fecha: m.fecha, tipo: m.tipo, categoria_id: d.categoria_id, ambito_id: d.ambito_id || '', monto_pen: redondear2_(d.monto * m.tc) }));
    } else {
      lineas.push({ fecha: m.fecha, tipo: m.tipo, categoria_id: m.categoria_id, ambito_id: m.ambito_id || '', monto_pen: m.monto_pen });
    }
  });
  return lineas;
}

// Un préstamo (gasto con rol prestamo) y su devolución (ingreso con rol reembolso) mueven saldos
// pero no son gasto ni ingreso. Las transferencias y los gastos negativos se quedan.
function movimientosQueCuentan_(movs, categorias) {
  return movs.filter(m => {
    const rol = rolDe_(categorias, m.categoria_id);
    return !((m.tipo === 'gasto' && rol === 'prestamo') || (m.tipo === 'ingreso' && rol === 'reembolso'));
  });
}

function resumenMes_(movs, mes) {
  let ingresos = 0;
  let gastos = 0;
  movs.forEach(m => {
    if (mesDe_(m.fecha) !== mes) return;
    if (m.tipo === 'ingreso') ingresos += m.monto_pen;
    else if (m.tipo === 'gasto') gastos += m.monto_pen;
  });
  ingresos = redondear2_(ingresos);
  gastos = redondear2_(gastos);
  const ahorro = redondear2_(ingresos - gastos);
  return { ingresos: ingresos, gastos: gastos, ahorro: ahorro, tasaAhorro: ingresos > 0 ? Math.round(ahorro / ingresos * 100) : null };
}

function gastoPorCategoria_(lineas, categorias, mes) {
  const totales = {};
  lineas.forEach(l => {
    if (l.tipo !== 'gasto' || mesDe_(l.fecha) !== mes) return;
    totales[l.categoria_id] = (totales[l.categoria_id] || 0) + l.monto_pen;
  });
  const ids = Object.keys(totales).filter(id => redondear2_(totales[id]) > 0);
  const total = ids.reduce((s, id) => s + totales[id], 0);
  return ids.map(id => {
    const c = categorias.filter(x => x.id === id)[0] || SIN_CATEGORIA;
    return {
      categoria_id: id, nombre: c.nombre, emoji: c.emoji, color: c.color,
      monto: redondear2_(totales[id]), porcentaje: Math.round(totales[id] / total * 100),
    };
  }).sort((a, b) => b.monto - a.monto);
}

// Gasto del mes por ámbito, con el detalle por categoría. Mismas reglas que gastoPorCategoria_.
function gastoPorAmbito_(lineas, ambitos, categorias, mes) {
  const grupos = {};
  lineas.forEach(l => {
    if (l.tipo !== 'gasto' || mesDe_(l.fecha) !== mes) return;
    const id = ambitoEfectivo_(l.ambito_id, ambitos);
    const g = grupos[id] || (grupos[id] = { total: 0, porCategoria: {} });
    g.total += l.monto_pen;
    g.porCategoria[l.categoria_id] = (g.porCategoria[l.categoria_id] || 0) + l.monto_pen;
  });
  const ids = Object.keys(grupos).filter(id => redondear2_(grupos[id].total) > 0);
  const total = ids.reduce((s, id) => s + grupos[id].total, 0);
  return ids.map(id => {
    const a = (ambitos || []).filter(x => x.id === id)[0] || ambitoPersonal_();
    const g = grupos[id];
    const detalle = Object.keys(g.porCategoria).filter(c => redondear2_(g.porCategoria[c]) > 0).map(c => {
      const cat = categorias.filter(x => x.id === c)[0] || SIN_CATEGORIA;
      return { categoria_id: c, nombre: cat.nombre, emoji: cat.emoji, monto: redondear2_(g.porCategoria[c]) };
    }).sort((x, y) => y.monto - x.monto);
    return {
      ambito_id: id, nombre: a.nombre, emoji: a.emoji, monto: redondear2_(g.total),
      porcentaje: Math.round(g.total / total * 100), categorias: detalle,
    };
  }).sort((x, y) => y.monto - x.monto);
}

// Agrupar una sola categoría en "Resto" no aporta: solo se agrupa si sobran 2 o más.
function agruparCategorias_(lista, n) {
  if (lista.length <= n + 1) return lista;
  const resto = lista.slice(n);
  return lista.slice(0, n).concat([{
    categoria_id: '_resto', nombre: 'Resto', emoji: '•', color: '#3a3a48',
    monto: redondear2_(resto.reduce((s, c) => s + c.monto, 0)),
    porcentaje: resto.reduce((s, c) => s + c.porcentaje, 0),
  }]);
}

function tendencia_(movs, mesFin, n) {
  const meses = [];
  for (let i = n - 1; i >= 0; i--) meses.push(sumarMeses_(mesFin, -i));
  return meses.map(mes => {
    const r = resumenMes_(movs, mes);
    return { mes: mes, ingresos: r.ingresos, gastos: r.gastos };
  });
}

function saldosPorCuenta_(movs, cuentas, tcUsd) {
  const saldos = {};
  const tiene = id => Object.prototype.hasOwnProperty.call(saldos, id);
  cuentas.forEach(c => { saldos[c.id] = c.moneda === 'USD' ? c.saldo_inicial * (tcUsd || 0) : c.saldo_inicial; });
  movs.forEach(m => {
    if (m.tipo === 'ingreso' && tiene(m.cuenta_id)) saldos[m.cuenta_id] += m.monto_pen;
    if (m.tipo === 'gasto' && tiene(m.cuenta_id)) saldos[m.cuenta_id] -= m.monto_pen;
    if (m.tipo === 'transferencia') {
      if (tiene(m.cuenta_id)) saldos[m.cuenta_id] -= m.monto_pen;
      if (tiene(m.cuenta_destino_id)) saldos[m.cuenta_destino_id] += m.monto_pen;
    }
  });
  return cuentas.filter(c => c.activa).map(c => ({
    id: c.id, nombre: c.nombre, banco: c.banco, tipo: c.tipo, saldo_pen: redondear2_(saldos[c.id]),
  }));
}

function topComercios_(movs, mes, n) {
  const grupos = {};
  movs.forEach(m => {
    const nombre = String(m.comercio || '').trim();
    if (m.tipo !== 'gasto' || mesDe_(m.fecha) !== mes || !nombre) return;
    const clave = normalizarTexto_(nombre);
    const g = grupos[clave] || (grupos[clave] = { comercio: nombre, monto: 0, veces: 0 });
    g.monto += m.monto_pen;
    g.veces++;
  });
  return Object.keys(grupos).map(k => grupos[k])
    .filter(g => g.monto > 0)
    .map(g => ({ comercio: g.comercio, monto: redondear2_(g.monto), veces: g.veces }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, n);
}

// datos = { movs, divisiones, categorias, cuentas, tcUsd }
function construirDashboard_(datos, mes) {
  const cuentan = movimientosQueCuentan_(datos.movs, datos.categorias);
  const lineas = lineasCategoria_(cuentan, datos.divisiones);
  return {
    mes: mes,
    resumen: resumenMes_(cuentan, mes),
    resumenAnterior: resumenMes_(cuentan, sumarMeses_(mes, -1)),
    categorias: agruparCategorias_(gastoPorCategoria_(lineas, datos.categorias, mes), 5),
    ambitos: gastoPorAmbito_(lineas, datos.ambitos || [], datos.categorias, mes),
    tendencia: tendencia_(cuentan, mes, 6),
    saldos: saldosPorCuenta_(datos.movs, datos.cuentas, datos.tcUsd),
    comercios: topComercios_(cuentan, mes, 5),
  };
}
