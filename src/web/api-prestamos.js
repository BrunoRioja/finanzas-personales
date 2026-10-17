// Préstamos y abonos guardados en hojas: los mantiene en línea con los movimientos
// (categorías con rol) y expone la sección "Préstamos" a la web. Las funciones con guion
// bajo final se llaman dentro de conBloqueo_.

function obtenerPrestamos() {
  return listaPrestamos_(leerTabla_('Prestamos'), leerTabla_('Abonos'), hoyIso_());
}

function prestamoDeMovimiento_(movId) {
  if (!movId) return null;
  return leerTabla_('Prestamos').filter(p => p.movimiento_id === movId)[0] || null;
}

function abonoDeMovimiento_(movId) {
  if (!movId) return null;
  return leerTabla_('Abonos').filter(a => a.movimiento_id === movId)[0] || null;
}

function buscarPrestamo_(id) {
  const prestamo = leerTabla_('Prestamos').filter(p => p.id === id)[0];
  if (!id || !prestamo) throw new Error('El préstamo ya no existe.');
  return prestamo;
}

function abonosDe_(prestamoId) {
  return leerTabla_('Abonos').filter(a => a.prestamo_id === prestamoId);
}

function validarMontoContraAbonos_(monto, abonos) {
  const abonado = sumaAbonos_(abonos);
  if (redondear2_(monto) < abonado) {
    throw new Error('El préstamo ya tiene abonos por ' + formatoMonto_(abonado, 'PEN') + ': el monto no puede ser menor.');
  }
}

// Escribe el estado que corresponde a sus abonos (si cambió) y devuelve el préstamo al día.
function recalcularPrestamo_(prestamo) {
  const abonos = abonosDe_(prestamo.id);
  const estado = estadoSegunAbonos_(prestamo.monto, abonos);
  if (estado !== prestamo.estado) actualizarFila_('Prestamos', prestamo.id, { estado: estado });
  const actual = Object.assign({}, prestamo, { estado: estado });
  return { prestamo: actual, falta: Math.max(0, redondear2_(Number(prestamo.monto) - sumaAbonos_(abonos))), pagado: estado === 'pagado' };
}

const esMovDeRol_ = (categorias, mov, rol) =>
  !!mov && mov.tipo === ROLES_CATEGORIA[rol] && rolDe_(categorias, mov.categoria_id) === rol;

// Se llama antes de escribir la fila del movimiento: valida todo primero y solo después
// escribe, para que un rechazo no deje nada a medias. `previo`/`actual` null = no existe.
function sincronizarPrestamos_(previo, actual) {
  const categorias = leerTabla_('Categorias');
  const prestamo = previo ? prestamoDeMovimiento_(previo.id) : null;
  const abono = previo ? abonoDeMovimiento_(previo.id) : null;
  // Solo se crea la línea al entrar al rol: lo que ya estaba en Préstamos sin línea (antes de
  // la v0.9) no gana una al editarlo.
  const sigueSiendoPrestamo = esMovDeRol_(categorias, actual, 'prestamo') &&
    (!!prestamo || !esMovDeRol_(categorias, previo, 'prestamo'));
  const sigueSiendoAbono = esMovDeRol_(categorias, actual, 'reembolso');

  let datosPrestamo = null;
  if (sigueSiendoPrestamo) {
    datosPrestamo = prestamo
      ? normalizarPrestamo_(Object.assign({}, prestamo, { monto: actual.monto_pen, fecha: actual.fecha }))
      : normalizarPrestamo_({
        persona: String(actual.comercio || actual.descripcion || 'Sin nombre').trim().slice(0, 60),
        monto: actual.monto_pen, fecha: actual.fecha, fecha_promesa: '', nota: '',
      });
    if (prestamo) validarMontoContraAbonos_(datosPrestamo.monto, abonosDe_(prestamo.id));
  } else if (prestamo && abonosDe_(prestamo.id).length) {
    throw new Error('Este préstamo ya tiene abonos: bórralos primero en Préstamos.');
  }
  const datosAbono = abono && sigueSiendoAbono ? normalizarAbono_({ monto: actual.monto_pen, fecha: actual.fecha }) : null;

  if (sigueSiendoPrestamo && prestamo) {
    actualizarFila_('Prestamos', prestamo.id, { monto: datosPrestamo.monto, fecha: datosPrestamo.fecha });
    recalcularPrestamo_(Object.assign({}, prestamo, { monto: datosPrestamo.monto, fecha: datosPrestamo.fecha }));
  } else if (sigueSiendoPrestamo) {
    agregarFilas_('Prestamos', [Object.assign({ id: nuevoId_() }, datosPrestamo, {
      movimiento_id: actual.id, estado: 'pendiente', creado_en: formatearFecha_(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    })]);
  } else if (prestamo) {
    eliminarFila_('Prestamos', prestamo.id);
  }

  if (abono) {
    if (datosAbono) actualizarFila_('Abonos', abono.id, datosAbono);
    else eliminarFila_('Abonos', abono.id);
    const suyo = leerTabla_('Prestamos').filter(p => p.id === abono.prestamo_id)[0];
    if (suyo) recalcularPrestamo_(suyo);
  }
}

// Valida que `mov` pueda volverse abono de `prestamoId`, sin escribir nada.
function validarAbonoConMovimiento_(mov, prestamoId) {
  if (mov.tipo !== 'ingreso') throw new Error('Solo un ingreso puede ser abono de un préstamo.');
  if (abonoDeMovimiento_(mov.id)) throw new Error('Este movimiento ya es un abono.');
  const prestamo = buscarPrestamo_(prestamoId);
  if (prestamo.estado === 'pagado') throw new Error('Ese préstamo ya está pagado.');
  const categoria = categoriaConRol_(leerTabla_('Categorias'), 'reembolso');
  if (!categoria) throw new Error('Marca una categoría de ingreso como reembolso en Ajustes.');
  normalizarAbono_({ monto: mov.monto_pen, fecha: mov.fecha });
  return { prestamo: prestamo, categoria: categoria };
}

function abonarConMovimiento_(mov, prestamoId) {
  const v = validarAbonoConMovimiento_(mov, prestamoId);
  actualizarFila_('Movimientos', mov.id, { categoria_id: v.categoria.id, estado: 'confirmado' });
  return crearAbono_(v.prestamo, { monto: mov.monto_pen, fecha: mov.fecha }, mov.id);
}

function crearAbono_(prestamo, datos, movimientoId) {
  const abono = normalizarAbono_(datos);
  agregarFilas_('Abonos', [Object.assign({ id: nuevoId_(), prestamo_id: prestamo.id }, abono, { movimiento_id: movimientoId || '' })]);
  return recalcularPrestamo_(prestamo);
}

// Un ingreso que devuelve parte de un gasto compartido: pasa a gasto negativo en esa categoría.
function reembolsoComoGasto_(mov, categoriaId) {
  if (mov.tipo !== 'ingreso') throw new Error('Solo un ingreso puede ser reembolso de un gasto.');
  if (mov.dividido) throw new Error('Este movimiento está dividido; edítalo desde "Dividir".');
  const categoria = leerTabla_('Categorias').filter(c => c.id === categoriaId)[0];
  if (!categoria || categoria.tipo !== 'gasto' || categoria.activa === false || categoria.rol) {
    throw new Error('Elige una categoría de gasto.');
  }
  const nuevo = Object.assign({}, mov, {
    tipo: 'gasto', monto: -Math.abs(Number(mov.monto)), monto_pen: -Math.abs(Number(mov.monto_pen)),
    categoria_id: categoria.id, ambito_id: '', estado: 'confirmado',
  });
  sincronizarPrestamos_(mov, nuevo);
  actualizarFila_('Movimientos', mov.id, nuevo);
  return nuevo;
}

function fijarFechaPromesa_(prestamoId, fechaIso) {
  const prestamo = buscarPrestamo_(prestamoId);
  const fecha = fechaIso == null ? '' : String(fechaIso);
  if (fecha && !esFechaIso_(fecha)) throw new Error('La fecha prometida no es válida.');
  actualizarFila_('Prestamos', prestamo.id, { fecha_promesa: fecha });
  return Object.assign({}, prestamo, { fecha_promesa: fecha });
}

// Crea un préstamo a mano (sin movimiento) o edita persona, fecha prometida, nota y monto.
function guardarPrestamo(datos) {
  conBloqueo_(() => {
    const d = datos || {};
    if (!d.id) {
      agregarFilas_('Prestamos', [Object.assign({ id: nuevoId_() }, normalizarPrestamo_(Object.assign({}, d, { fecha: d.fecha || hoyIso_() })), {
        movimiento_id: '', estado: 'pendiente', creado_en: formatearFecha_(new Date(), 'yyyy-MM-dd HH:mm:ss'),
      })]);
      return;
    }
    const previo = buscarPrestamo_(d.id);
    const valor = k => (d[k] === undefined ? previo[k] : d[k]);
    if (previo.movimiento_id && d.monto !== undefined && redondear2_(d.monto) !== redondear2_(previo.monto)) {
      throw new Error('El monto de este préstamo viene de su movimiento: cámbialo en Movimientos.');
    }
    const p = normalizarPrestamo_({
      persona: valor('persona'), monto: valor('monto'), fecha: previo.fecha,
      fecha_promesa: valor('fecha_promesa'), nota: valor('nota'),
    });
    validarMontoContraAbonos_(p.monto, abonosDe_(previo.id));
    actualizarFila_('Prestamos', previo.id, p);
    recalcularPrestamo_(Object.assign({}, previo, p));
  });
  return obtenerPrestamos();
}

function eliminarPrestamo(id) {
  conBloqueo_(() => {
    const prestamo = buscarPrestamo_(id);
    if (prestamo.movimiento_id) throw new Error('Este préstamo viene de un movimiento: cámbialo o bórralo en Movimientos.');
    abonosDe_(prestamo.id).forEach(a => eliminarFila_('Abonos', a.id));
    eliminarFila_('Prestamos', prestamo.id);
  });
  return obtenerPrestamos();
}

function buscarPendiente_(id) {
  const prestamo = buscarPrestamo_(id);
  if (prestamo.estado === 'pagado') throw new Error('Ese préstamo ya está pagado.');
  return prestamo;
}

// Abono en efectivo (sin movimiento). Pasar de lo que falta se acepta: queda pagado.
function registrarAbono(datos) {
  conBloqueo_(() => {
    const d = datos || {};
    crearAbono_(buscarPendiente_(d.prestamo_id), { monto: d.monto, fecha: d.fecha || hoyIso_() }, '');
  });
  return obtenerPrestamos();
}

// "Ya me pagó todo": abono en efectivo por lo que falta.
function saldarPrestamo(id) {
  conBloqueo_(() => {
    const prestamo = buscarPendiente_(id);
    const falta = redondear2_(Number(prestamo.monto) - sumaAbonos_(abonosDe_(prestamo.id)));
    if (falta > 0) crearAbono_(prestamo, { monto: falta, fecha: hoyIso_() }, '');
    else recalcularPrestamo_(prestamo);
  });
  return obtenerPrestamos();
}

function eliminarAbono(id) {
  conBloqueo_(() => {
    const abono = leerTabla_('Abonos').filter(a => a.id === id)[0];
    if (!id || !abono) throw new Error('El abono ya no existe.');
    if (abono.movimiento_id) throw new Error('Este abono viene de un movimiento: cámbialo o bórralo en Movimientos.');
    eliminarFila_('Abonos', abono.id);
    const prestamo = leerTabla_('Prestamos').filter(p => p.id === abono.prestamo_id)[0];
    if (prestamo) recalcularPrestamo_(prestamo);
  });
  return obtenerPrestamos();
}

// "¿De qué es este reembolso?": un préstamo pendiente (abono) o una categoría de gasto.
function resolverReembolso(datos) {
  const resultado = conBloqueo_(() => {
    const d = datos || {};
    const mov = leerTabla_('Movimientos').filter(m => m.id === d.id)[0];
    if (!mov) throw new Error('El movimiento ya no existe.');
    if (!d.prestamo_id && !d.categoria_id) throw new Error('Elige de qué es el reembolso.');
    const final = Object.assign({}, mov, cambiosParaConfirmar_(mov));
    if (d.prestamo_id) {
      validarAbonoConMovimiento_(final, d.prestamo_id);
      actualizarFila_('Movimientos', mov.id, final);
      return Object.assign({ movimiento: final }, abonarConMovimiento_(final, d.prestamo_id));
    }
    return { movimiento: reembolsoComoGasto_(final, d.categoria_id) };
  });
  revisarPresupuestos_();
  return resultado;
}
