// Bandeja "Por revisar": movimientos importados sin categoría o sin cuenta, correos
// que no se pudieron leer, y reglas comercio → categoría.

function obtenerPorRevisar() {
  const movs = leerTabla_('Movimientos');
  return {
    movimientos: movs.filter(m => m.estado === 'por_revisar')
      .sort((a, b) => (b.fecha + b.creado_en).localeCompare(a.fecha + a.creado_en)),
    pendientes: leerTabla_('Pendientes').filter(p => p.estado === 'pendiente')
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    categoriasFrecuentes: categoriasFrecuentes_(movs, leerTabla_('Categorias')),
  };
}

// Las 6 categorías activas más usadas en movimientos confirmados, por tipo.
function categoriasFrecuentes_(movs, categorias) {
  const r = {};
  ['gasto', 'ingreso'].forEach(tipo => {
    const usos = {};
    movs.forEach(m => {
      if (m.tipo === tipo && m.estado === 'confirmado' && m.categoria_id) usos[m.categoria_id] = (usos[m.categoria_id] || 0) + 1;
    });
    r[tipo] = categorias.filter(c => c.tipo === tipo && c.activa)
      .sort((a, b) => (usos[b.id] || 0) - (usos[a.id] || 0))
      .slice(0, 6).map(c => c.id);
  });
  return r;
}

function categorizarMovimiento(datos) {
  return conBloqueo_(() => {
    const movs = leerTabla_('Movimientos');
    const mov = movs.filter(m => m.id === datos.id)[0];
    if (!mov) throw new Error('El movimiento ya no existe.');
    const cuentas = leerTabla_('Cuentas');
    const cambios = { estado: 'confirmado' };
    if (mov.tipo !== 'transferencia') {
      const categoria = buscarActiva_(leerTabla_('Categorias'), datos.categoria_id, 'La categoría');
      if (categoria.tipo !== mov.tipo) throw new Error('La categoría "' + categoria.nombre + '" no es de ' + mov.tipo + '.');
      cambios.categoria_id = categoria.id;
    }
    if (datos.cuenta_id) cambios.cuenta_id = buscarActiva_(cuentas, datos.cuenta_id, 'La cuenta').id;
    if (datos.cuenta_destino_id) cambios.cuenta_destino_id = buscarActiva_(cuentas, datos.cuenta_destino_id, 'La cuenta destino').id;
    const final = Object.assign({}, mov, cambios);
    if (!final.cuenta_id) throw new Error('Elige la cuenta del movimiento.');
    if (final.tipo === 'transferencia' && !final.cuenta_destino_id) throw new Error('Elige la cuenta destino.');
    if (final.tipo === 'transferencia' && final.cuenta_id === final.cuenta_destino_id) throw new Error('La cuenta destino debe ser distinta de la de origen.');
    if (final.moneda !== 'PEN' && !(final.tc > 0)) {
      const tc = Number(leerConfig_().ultimo_tc) || 0;
      if (!tc) throw new Error('Configura el tipo de cambio en Ajustes para confirmar un movimiento en ' + final.moneda + '.');
      Object.assign(cambios, { tc: tc, monto_pen: redondear2_(final.monto * tc), descripcion: '' });
    }
    actualizarFila_('Movimientos', mov.id, cambios);
    let confirmados = 1;
    let regla = null;
    if (datos.recordar && mov.tipo !== 'transferencia' && mov.comercio) {
      const patron = normalizarTexto_(datos.patron || mov.comercio);
      if (!patron) throw new Error('Escribe el texto del comercio a recordar.');
      regla = guardarRegla_(patron, cambios.categoria_id);
      movs.filter(m => m.id !== mov.id && m.estado === 'por_revisar' && m.tipo === mov.tipo && m.cuenta_id &&
        (m.moneda === 'PEN' || m.tc > 0) && normalizarTexto_(m.comercio).indexOf(patron) >= 0)
        .forEach(m => {
          actualizarFila_('Movimientos', m.id, { categoria_id: cambios.categoria_id, estado: 'confirmado' });
          confirmados++;
        });
    }
    return { confirmados: confirmados, regla: regla };
  });
}

function guardarRegla_(patron, categoriaId) {
  const existente = leerTabla_('Reglas').filter(r => normalizarTexto_(r.patron) === patron)[0];
  if (existente) {
    actualizarFila_('Reglas', existente.id, { categoria_id: categoriaId });
    return Object.assign({}, existente, { categoria_id: categoriaId });
  }
  const nueva = { id: nuevoId_(), patron: patron, categoria_id: categoriaId, cuenta_id: '', creada_por: 'usuario', usos: 0 };
  agregarFilas_('Reglas', [nueva]);
  return nueva;
}

function listarReglas() {
  return leerTabla_('Reglas').sort((a, b) => a.patron.localeCompare(b.patron));
}

function eliminarRegla(id) {
  conBloqueo_(() => eliminarFila_('Reglas', id));
  return { ok: true };
}

function descartarPendiente(id) {
  conBloqueo_(() => actualizarFila_('Pendientes', id, { estado: 'descartado' }));
  return { ok: true };
}

function dividirMovimiento(datos) {
  return conBloqueo_(() => {
    const mov = leerTabla_('Movimientos').filter(m => m.id === datos.id)[0];
    if (!mov) throw new Error('El movimiento ya no existe.');
    const partes = normalizarPartes_(mov, datos.partes, leerTabla_('Categorias'));
    const cambios = { dividido: true, estado: 'confirmado' };
    if (!mov.cuenta_id) {
      if (!datos.cuenta_id) throw new Error('Elige la cuenta del movimiento antes de dividirlo.');
      cambios.cuenta_id = buscarActiva_(leerTabla_('Cuentas'), datos.cuenta_id, 'La cuenta').id;
    }
    if (mov.moneda !== 'PEN' && !(mov.tc > 0)) throw new Error('Configura el tipo de cambio en Ajustes antes de dividir.');
    cambios.categoria_id = partes.slice().sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))[0].categoria_id;
    borrarDivisiones_(mov.id);
    agregarFilas_('Divisiones', partes.map(p => Object.assign({ id: nuevoId_(), movimiento_id: mov.id }, p)));
    actualizarFila_('Movimientos', mov.id, cambios);
    return { ok: true, partes: partes };
  });
}

function quitarDivision(id) {
  conBloqueo_(() => {
    if (!leerTabla_('Movimientos').some(m => m.id === id)) throw new Error('El movimiento ya no existe.');
    borrarDivisiones_(id);
    actualizarFila_('Movimientos', id, { dividido: false });
  });
  return { ok: true };
}

function obtenerDivisiones(id) {
  return leerTabla_('Divisiones').filter(d => d.movimiento_id === id);
}

function borrarDivisiones_(movimientoId) {
  leerTabla_('Divisiones').filter(d => d.movimiento_id === movimientoId)
    .forEach(d => eliminarFila_('Divisiones', d.id));
}
