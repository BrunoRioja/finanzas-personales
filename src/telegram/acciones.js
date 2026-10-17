// Botones de los mensajes del bot. callback_data = "acción:id[:id]" (ids compactados):
// c categorizar · o otras categorías · v volver · r recordar · s solo esta vez ·
// d deshacer · k cambiar categoría · a cambiar ámbito · ok resumen visto.
// Préstamos: f:<préstamo>:<m|s|q|f|n> fecha prometida (mañana, semana, quincena, fin de mes,
// sin fecha) · p:<mov>:<préstamo> abono · g:<mov>:<categoría de gasto> reembolso de un gasto ·
// h:<mov> todas las categorías de gasto del reembolso · w:<mov> volver a "¿de qué?".

function manejarBoton_(boton) {
  const partes = String(boton.data || '').split(':');
  const accion = partes[0];
  const messageId = boton.message.message_id;
  if (accion === 'ok') return editarMensaje_(messageId, escaparHtml_(boton.message.text || '') + '\n✓ Visto', null);
  if (accion === 'f') return fijarFechaDesdeBot_(partes[1], partes[2], messageId);
  const ctx = contextoBot_();
  const mov = leerTabla_('Movimientos').filter(m => m.id === expandirId_(partes[1]))[0];
  if (!mov) return editarMensaje_(messageId, 'Ese movimiento ya no existe.', null);
  // Un importado ya resuelto (en la app o con otro botón) no se vuelve a tocar desde un mensaje viejo.
  if (mov.estado === 'confirmado' && mov.origen !== 'telegram' && ['r', 's', 'a'].indexOf(accion) < 0) {
    return editarMensaje_(messageId, textoYaEstaba_(mov, ctx), null);
  }
  if (['r', 's', 'a'].indexOf(accion) >= 0 && (mov.estado !== 'confirmado' || !mov.categoria_id)) {
    return editarMensaje_(messageId, textoMovimiento_(mov, ctx), tecladoCategorias_(mov, frecuentes_(mov, ctx), ctx));
  }
  if (['p', 'g', 'h', 'w'].indexOf(accion) >= 0 && reembolsoResuelto_(mov, ctx)) {
    return editarMensaje_(messageId, textoYaEstaba_(mov, ctx), null);
  }
  switch (accion) {
    case 'o':
    case 'k':
      return editarMensaje_(messageId, textoMovimiento_(mov, ctx), tecladoTodas_(mov, ctx));
    case 'v':
      return editarMensaje_(messageId, textoMovimiento_(mov, ctx),
        mov.estado === 'confirmado' ? tecladoRegistrado_(mov, ctx) : tecladoCategorias_(mov, frecuentes_(mov, ctx), ctx));
    case 'c':
      return elegirCategoria_(mov, expandirId_(partes[2]), messageId, ctx);
    case 'r':
      // Un "Sí, recordar" viejo sobre un préstamo o reembolso: no hay nada que recordar.
      if (rolDe_(ctx.categorias, mov.categoria_id)) {
        return editarMensaje_(messageId, textoCategorizado_(mov, mov.categoria_id, ctx), tecladoONulo_(filaAmbitos_(mov, ctx, false)));
      }
      return recordarDesdeBot_(mov, messageId, ctx);
    case 's':
      return editarMensaje_(messageId, textoCategorizado_(mov, mov.categoria_id, ctx), tecladoONulo_(filaAmbitos_(mov, ctx, false)));
    case 'a':
      return cambiarAmbitoDesdeBot_(mov, expandirId_(partes[2]), partes[3] === 'r', messageId, ctx);
    case 'd':
      return deshacerDesdeBot_(mov, messageId, ctx);
    case 'p':
      return abonarDesdeBot_(mov, expandirId_(partes[2]), messageId, ctx);
    case 'g':
      return reembolsoGastoDesdeBot_(mov, expandirId_(partes[2]), messageId, ctx);
    case 'h':
      return editarMensaje_(messageId, textoMovimiento_(mov, ctx) + '\n¿De qué es este reembolso?', tecladoReembolsoTodas_(mov, ctx));
    case 'w':
      return editarReembolso_(mov, messageId, ctx);
    default:
      return null;
  }
}

function tecladoONulo_(filas) {
  return filas.length ? filas : null;
}

function preguntaRecordar_(mov) {
  return '\n¿Recordar para <b>' + escaparHtml_(normalizarTexto_(mov.comercio)) + '</b>?';
}

function cambiarAmbitoDesdeBot_(mov, ambitoId, conRecordar, messageId, ctx) {
  const guardado = conBloqueo_(() => {
    const id = ambitoParaGuardar_(mov.tipo, ambitoId, ctx.ambitos, [mov.ambito_id]);
    actualizarFila_('Movimientos', mov.id, { ambito_id: id });
    return id;
  });
  const actualizado = Object.assign({}, mov, { ambito_id: guardado });
  if (mov.origen === 'telegram') {
    return editarMensaje_(messageId, textoRegistrado_(actualizado, ctx), tecladoRegistrado_(actualizado, ctx));
  }
  if (conRecordar && mov.comercio && !rolDe_(ctx.categorias, mov.categoria_id)) {
    return editarMensaje_(messageId, textoCategorizado_(actualizado, mov.categoria_id, ctx, preguntaRecordar_(mov)), tecladoRecordar_(actualizado, ctx));
  }
  return editarMensaje_(messageId, textoCategorizado_(actualizado, mov.categoria_id, ctx), tecladoONulo_(filaAmbitos_(actualizado, ctx, false)));
}

function frecuentes_(mov, ctx) {
  return categoriasFrecuentes_(leerTabla_('Movimientos'), ctx.categorias)[mov.tipo] || [];
}

function textoYaEstaba_(mov, ctx) {
  return textoMovimiento_(mov, ctx) + (mov.tipo === 'transferencia'
    ? '\nYa estaba revisado.' : '\nYa estaba en ' + escaparHtml_(nombreCategoria_(ctx.categorias, mov.categoria_id)));
}

// También cambia la categoría de un movimiento del bot ya confirmado ("Cambiar categoría"):
// categorizarMovimiento valida el tipo y mantiene en línea el préstamo o el abono vinculado.
function elegirCategoria_(mov, categoriaId, messageId, ctx) {
  const rol = rolDe_(ctx.categorias, categoriaId);
  // Un reembolso necesita saber de qué es antes de guardarse.
  if (rol === 'reembolso' && mov.tipo === 'ingreso') return editarReembolso_(mov, messageId, ctx);
  const estabaPorRevisar = mov.estado === 'por_revisar';
  const r = categorizarMovimiento({ id: mov.id, categoria_id: categoriaId });
  const actualizado = Object.assign({}, mov, { categoria_id: categoriaId, estado: 'confirmado' });
  if (rol === 'prestamo' && r.prestamo) {
    const prestamo = Object.assign({}, r.prestamo, { nuevo: !r.prestamo.fecha_promesa });
    return editarMensaje_(messageId, textoPrestamo_(prestamo, actualizado, ctx),
      tecladoFechaPromesa_(prestamo).concat(mov.origen === 'telegram' ? tecladoRegistrado_(actualizado, ctx) : []));
  }
  if (estabaPorRevisar && mov.comercio && !rol) {
    return editarMensaje_(messageId, textoCategorizado_(actualizado, categoriaId, ctx, preguntaRecordar_(mov)), tecladoRecordar_(actualizado, ctx));
  }
  return editarMensaje_(messageId, textoCategorizado_(actualizado, categoriaId, ctx),
    mov.origen === 'telegram' ? tecladoRegistrado_(actualizado, ctx) : tecladoONulo_(filaAmbitos_(actualizado, ctx, false)));
}

// Un ingreso ya convertido en gasto o ya confirmado como reembolso no se vuelve a resolver.
function reembolsoResuelto_(mov, ctx) {
  return mov.tipo !== 'ingreso' || (mov.estado === 'confirmado' && rolDe_(ctx.categorias, mov.categoria_id) === 'reembolso');
}

// "¿De qué es este reembolso?" con los préstamos pendientes (la misma persona primero).
function mensajeReembolsoDe_(mov, ctx) {
  const pendientes = listaPrestamos_(leerTabla_('Prestamos'), leerTabla_('Abonos'), ctx.hoy).pendientes;
  const frecuentes = categoriasFrecuentes_(leerTabla_('Movimientos'), ctx.categorias).gasto || [];
  return mensajeReembolso_(mov, prestamosSugeridos_(pendientes, mov.comercio, MAX_PRESTAMOS_SUGERIDOS), frecuentes, ctx);
}

function editarReembolso_(mov, messageId, ctx) {
  const m = mensajeReembolsoDe_(mov, ctx);
  return editarMensaje_(messageId, m.texto, m.teclado);
}

function tecladoTrasResolver_(mov, ctx) {
  return mov.origen === 'telegram' ? tecladoRegistrado_(mov, ctx) : null;
}

function abonarDesdeBot_(mov, prestamoId, messageId, ctx) {
  const categoria = categoriaConRol_(ctx.categorias, 'reembolso');
  if (!categoria) throw new Error('Marca una categoría de ingreso como reembolso en Ajustes.');
  const r = categorizarMovimiento({ id: mov.id, categoria_id: categoria.id, prestamo_id: prestamoId });
  const actualizado = Object.assign({}, mov, { categoria_id: categoria.id, estado: 'confirmado' });
  return editarMensaje_(messageId, textoMovimiento_(actualizado, ctx) + '\n' + textoAbono_(r.abono), tecladoTrasResolver_(actualizado, ctx));
}

function reembolsoGastoDesdeBot_(mov, categoriaId, messageId, ctx) {
  const nuevo = categorizarMovimiento({ id: mov.id, reembolso_de: categoriaId }).movimiento;
  const teclado = nuevo.origen === 'telegram' ? tecladoRegistrado_(nuevo, ctx) : tecladoONulo_(filaAmbitos_(nuevo, ctx, false));
  return editarMensaje_(messageId, textoCategorizado_(nuevo, categoriaId, ctx, ' · reembolso'), teclado);
}

function fijarFechaDesdeBot_(prestamoCompacto, letra, messageId) {
  const opcion = OPCIONES_FECHA_PROMESA[letra];
  if (!opcion) return null;
  const prestamoId = expandirId_(prestamoCompacto);
  const prestamo = conBloqueo_(() => {
    if (!prestamoId || !leerTabla_('Prestamos').some(p => p.id === prestamoId)) return null;
    return fijarFechaPromesa_(prestamoId, fechaPromesa_(opcion, hoyIso_()));
  });
  if (!prestamo) return editarMensaje_(messageId, 'Ese préstamo ya no existe.', null);
  const ctx = contextoBot_();
  const mov = prestamo.movimiento_id ? leerTabla_('Movimientos').filter(m => m.id === prestamo.movimiento_id)[0] : null;
  return editarMensaje_(messageId, textoPrestamo_(prestamo, mov, ctx), mov ? tecladoTrasResolver_(mov, ctx) : null);
}

function recordarDesdeBot_(mov, messageId, ctx) {
  const r = conBloqueo_(() => recordarComercio_(leerTabla_('Movimientos'), mov, '', mov.categoria_id));
  const extra = ' · recordado para <b>' + escaparHtml_(r.regla.patron) + '</b>' + (r.confirmados ? ' (+' + r.confirmados + ' más)' : '');
  return editarMensaje_(messageId, textoCategorizado_(mov, mov.categoria_id, ctx, extra), tecladoONulo_(filaAmbitos_(mov, ctx, false)));
}

function deshacerDesdeBot_(mov, messageId, ctx) {
  if (mov.origen !== 'telegram') {
    return editarMensaje_(messageId, textoMovimiento_(mov, ctx) + '\nSolo se puede deshacer lo registrado por el bot.', null);
  }
  try {
    conBloqueo_(() => {
      sincronizarPrestamos_(mov, null);
      eliminarFila_('Movimientos', mov.id);
      borrarDivisiones_(mov.id);
    });
  } catch (e) {
    // Un préstamo con abonos no se deshace: se avisa en el mismo mensaje.
    return editarMensaje_(messageId, textoMovimiento_(mov, ctx) + '\n⚠️ ' + escaparHtml_(e.message), tecladoRegistrado_(mov, ctx));
  }
  return editarMensaje_(messageId, '↩ Deshecho: ' + formatoMonto_(mov.monto, mov.moneda) + ' · ' + escaparHtml_(mov.comercio), null);
}
