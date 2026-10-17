// Bandeja "Por revisar": movimientos importados sin categoría o sin cuenta, correos
// que no se pudieron leer, y reglas comercio → categoría.

function obtenerPorRevisar() {
  const movs = leerTabla_('Movimientos');
  return {
    movimientos: movs.filter(m => m.estado === 'por_revisar').map(m => Object.assign(m, conTitulo_(m)))
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
  const resultado = conBloqueo_(() => {
    const movs = leerTabla_('Movimientos');
    const mov = movs.filter(m => m.id === datos.id)[0];
    if (!mov) throw new Error('El movimiento ya no existe.');
    const cuentas = leerTabla_('Cuentas');
    const categorias = leerTabla_('Categorias');
    const cambios = { estado: 'confirmado' };
    // "Reembolso de un gasto": el ingreso pasa a gasto negativo en esa categoría (no lleva categoría propia).
    const reembolsoDe = mov.tipo !== 'transferencia' && datos.reembolso_de ? datos.reembolso_de : '';
    if (mov.tipo !== 'transferencia' && !reembolsoDe) {
      const categoria = buscarActiva_(categorias, datos.categoria_id, 'La categoría');
      if (categoria.tipo !== mov.tipo) throw new Error('La categoría "' + categoria.nombre + '" no es de ' + mov.tipo + '.');
      cambios.categoria_id = categoria.id;
      if (datos.ambito_id !== undefined) {
        cambios.ambito_id = ambitoParaGuardar_(mov.tipo, datos.ambito_id, leerTabla_('Ambitos'), [mov.ambito_id]);
      }
    }
    if (datos.cuenta_id) cambios.cuenta_id = buscarActiva_(cuentas, datos.cuenta_id, 'La cuenta').id;
    if (datos.cuenta_destino_id) cambios.cuenta_destino_id = buscarActiva_(cuentas, datos.cuenta_destino_id, 'La cuenta destino').id;
    Object.assign(cambios, cambiosParaConfirmar_(Object.assign({}, mov, cambios)));
    const final = Object.assign({}, mov, cambios);
    const r = { confirmados: 1, regla: null };
    if (reembolsoDe) {
      r.movimiento = reembolsoComoGasto_(final, reembolsoDe);
      return r;
    }
    const rol = cambios.categoria_id ? rolDe_(categorias, cambios.categoria_id) : '';
    if (rol === 'reembolso') {
      if (!datos.prestamo_id) throw new Error('Elige de qué es el reembolso.');
      validarAbonoConMovimiento_(final, datos.prestamo_id);
    }
    sincronizarPrestamos_(mov, final);
    actualizarFila_('Movimientos', mov.id, cambios);
    if (rol === 'reembolso') r.abono = abonarConMovimiento_(final, datos.prestamo_id);
    if (rol === 'prestamo') r.prestamo = prestamoDeMovimiento_(mov.id);
    // No se recuerdan comercios hacia categorías con rol: cada caso pasa por su flujo.
    if (datos.recordar && !rol && mov.tipo !== 'transferencia' && mov.comercio) {
      const rec = recordarComercio_(movs, mov, datos.patron, cambios.categoria_id);
      r.regla = rec.regla;
      r.confirmados += rec.confirmados;
    }
    return r;
  });
  revisarPresupuestos_();
  return resultado;
}

// Valida las cuentas de `final` y completa el tipo de cambio que falte para confirmarlo.
// Devuelve los cambios extra (vacío si no hay).
function cambiosParaConfirmar_(final) {
  if (!final.cuenta_id) throw new Error('Elige la cuenta del movimiento.');
  if (final.tipo === 'transferencia' && !final.cuenta_destino_id) throw new Error('Elige la cuenta destino.');
  if (final.tipo === 'transferencia' && final.cuenta_id === final.cuenta_destino_id) throw new Error('La cuenta destino debe ser distinta de la de origen.');
  if (final.moneda !== 'PEN' && !(final.tc > 0)) {
    const tc = Number(leerConfig_().ultimo_tc) || 0;
    if (!tc) throw new Error('Configura el tipo de cambio en Ajustes para confirmar un movimiento en ' + final.moneda + '.');
    return { tc: tc, monto_pen: redondear2_(final.monto * tc), descripcion: '' };
  }
  return {};
}

// Dentro del bloqueo: crea o actualiza la regla del comercio y confirma los demás
// "por revisar" que coinciden. `confirmados` no cuenta a `mov`. La usan la bandeja y el bot.
function recordarComercio_(movs, mov, patronTexto, categoriaId) {
  if (rolDe_(leerTabla_('Categorias'), categoriaId)) throw new Error('Los préstamos y reembolsos no se recuerdan.');
  const patron = normalizarTexto_(patronTexto || mov.comercio);
  if (!patron) throw new Error('Escribe el texto del comercio a recordar.');
  const regla = guardarRegla_(patron, categoriaId);
  let confirmados = 0;
  movs.filter(m => m.id !== mov.id && m.estado === 'por_revisar' && m.tipo === mov.tipo && m.cuenta_id &&
    (m.moneda === 'PEN' || m.tc > 0) && normalizarTexto_(m.comercio).indexOf(patron) >= 0)
    .forEach(m => {
      actualizarFila_('Movimientos', m.id, { categoria_id: categoriaId, estado: 'confirmado' });
      confirmados++;
    });
  return { regla: regla, confirmados: confirmados };
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
  const categorias = leerTabla_('Categorias');
  // En pausa: apunta a una categoría con rol, así que no categoriza hasta que se quite el rol.
  return leerTabla_('Reglas').map(r => Object.assign({}, r, { en_pausa: !!rolDe_(categorias, r.categoria_id) })).sort((a, b) => a.patron.localeCompare(b.patron));
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
  const resultado = conBloqueo_(() => {
    const mov = leerTabla_('Movimientos').filter(m => m.id === datos.id)[0];
    if (!mov) throw new Error('El movimiento ya no existe.');
    if (rolDe_(leerTabla_('Categorias'), mov.categoria_id)) throw new Error('Los préstamos y reembolsos no se dividen.');
    const previos = leerTabla_('Divisiones').filter(d => d.movimiento_id === mov.id).map(d => d.ambito_id).concat([mov.ambito_id]);
    const partes = normalizarPartes_(mov, datos.partes, leerTabla_('Categorias'), leerTabla_('Ambitos'), previos);
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
  revisarPresupuestos_();
  return resultado;
}

function quitarDivision(id) {
  conBloqueo_(() => {
    if (!leerTabla_('Movimientos').some(m => m.id === id)) throw new Error('El movimiento ya no existe.');
    borrarDivisiones_(id);
    actualizarFila_('Movimientos', id, { dividido: false });
  });
  revisarPresupuestos_();
  return { ok: true };
}

function obtenerDivisiones(id) {
  return leerTabla_('Divisiones').filter(d => d.movimiento_id === id);
}

function borrarDivisiones_(movimientoId) {
  leerTabla_('Divisiones').filter(d => d.movimiento_id === movimientoId)
    .forEach(d => eliminarFila_('Divisiones', d.id));
}
