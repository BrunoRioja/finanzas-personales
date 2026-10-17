// Préstamos y abonos: cálculos puros (sin hojas ni Google).

function normalizarPrestamo_(datos) {
  const persona = String(datos.persona == null ? '' : datos.persona).replace(/\s+/g, ' ').trim();
  if (!persona) throw new Error('Pon a quién le prestaste.');
  if (persona.length > 60) throw new Error('El nombre de la persona es muy largo (máximo 60 caracteres).');
  const monto = redondear2_(datos.monto);
  if (!(monto > 0)) throw new Error('El monto del préstamo debe ser mayor que 0.');
  if (!esFechaIso_(datos.fecha)) throw new Error('La fecha del préstamo no es válida.');
  const promesa = datos.fecha_promesa == null ? '' : String(datos.fecha_promesa);
  if (promesa && !esFechaIso_(promesa)) throw new Error('La fecha prometida no es válida.');
  const nota = String(datos.nota == null ? '' : datos.nota).trim();
  if (nota.length > 200) throw new Error('La nota es muy larga (máximo 200 caracteres).');
  return { persona, monto, fecha: String(datos.fecha), fecha_promesa: promesa, nota };
}

function normalizarAbono_(datos) {
  const monto = redondear2_(datos.monto);
  if (!(monto > 0)) throw new Error('El monto del abono debe ser mayor que 0.');
  if (!esFechaIso_(datos.fecha)) throw new Error('La fecha del abono no es válida.');
  return { fecha: String(datos.fecha), monto };
}

function sumaAbonos_(abonos) {
  return redondear2_((abonos || []).reduce((s, a) => s + Number(a.monto), 0));
}

function estadoSegunAbonos_(monto, abonos) {
  return sumaAbonos_(abonos) >= Number(monto) ? 'pagado' : 'pendiente';
}

function listaPrestamos_(prestamos, abonos, hoyIso) {
  const items = (prestamos || []).map(p => {
    const propios = (abonos || []).filter(a => a.prestamo_id === p.id)
      .sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));
    const abonado = sumaAbonos_(propios);
    const dias = p.fecha_promesa ? diasEntre_(hoyIso, p.fecha_promesa) : null;
    return Object.assign({}, p, {
      abonos: propios,
      abonado,
      falta: Math.max(0, redondear2_(Number(p.monto) - abonado)),
      vencido: dias !== null && dias < 0,
      dias,
    });
  });
  const pendientes = items.filter(p => p.estado !== 'pagado').sort((a, b) => {
    if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
    if (a.fecha_promesa !== b.fecha_promesa) {
      if (!a.fecha_promesa) return 1;
      if (!b.fecha_promesa) return -1;
      return a.fecha_promesa < b.fecha_promesa ? -1 : 1;
    }
    return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0;
  });
  const ultimo = p => (p.abonos.length ? p.abonos[p.abonos.length - 1].fecha : p.fecha);
  const pagados = items.filter(p => p.estado === 'pagado')
    .sort((a, b) => (ultimo(a) < ultimo(b) ? 1 : ultimo(a) > ultimo(b) ? -1 : 0));
  const total = redondear2_(pendientes.reduce((s, p) => s + p.falta, 0));
  return { pendientes, pagados, total };
}

function ultimoDiaMes_(fechaIso) {
  const d = fechaDeIso_(fechaIso);
  return isoDeFecha_(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function fechaPromesa_(opcion, hoyIso) {
  if (opcion === 'manana') return sumarDias_(hoyIso, 1);
  if (opcion === 'semana') return sumarDias_(hoyIso, 7 - fechaDeIso_(hoyIso).getDay());
  if (opcion === 'quincena') {
    const dia = Number(String(hoyIso).slice(8, 10));
    return dia < 15 ? String(hoyIso).slice(0, 8) + '15' : ultimoDiaMes_(hoyIso);
  }
  if (opcion === 'mes') {
    const fin = ultimoDiaMes_(hoyIso);
    return fin === hoyIso ? ultimoDiaMes_(sumarDias_(hoyIso, 1)) : fin;
  }
  return '';
}

function mismaPersona_(a, b) {
  const palabras = t => normalizarTexto_(t).replace(/\./g, '').split(' ').filter(Boolean);
  const pa = palabras(a);
  const pb = palabras(b);
  if (!pa.length || !pb.length) return false;
  const n = pa.length === 1 || pb.length === 1 ? 1 : 2;
  return pa.slice(0, n).join(' ') === pb.slice(0, n).join(' ');
}

function prestamosSugeridos_(pendientes, comercio, max) {
  const porFecha = (a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0);
  const mismos = pendientes.filter(p => mismaPersona_(p.persona, comercio)).sort(porFecha);
  const otros = pendientes.filter(p => !mismaPersona_(p.persona, comercio)).sort(porFecha);
  return mismos.concat(otros).slice(0, max);
}
