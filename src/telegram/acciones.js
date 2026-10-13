// Botones de los mensajes del bot. callback_data = "acción:id[:id]" (ids compactados):
// c categorizar · o otras categorías · v volver · r recordar · s solo esta vez ·
// d deshacer · k cambiar categoría · ok resumen visto.

function manejarBoton_(boton) {
  const partes = String(boton.data || '').split(':');
  const accion = partes[0];
  const messageId = boton.message.message_id;
  if (accion === 'ok') return editarMensaje_(messageId, escaparHtml_(boton.message.text || '') + '\n✓ Visto', null);
  const ctx = contextoBot_();
  const mov = leerTabla_('Movimientos').filter(m => m.id === expandirId_(partes[1]))[0];
  if (!mov) return editarMensaje_(messageId, 'Ese movimiento ya no existe.', null);
  // Un importado ya resuelto (en la app o con otro botón) no se vuelve a tocar desde un mensaje viejo.
  if (mov.estado === 'confirmado' && mov.origen !== 'telegram' && accion !== 'r' && accion !== 's') {
    return editarMensaje_(messageId, textoYaEstaba_(mov, ctx), null);
  }
  if ((accion === 'r' || accion === 's') && (mov.estado !== 'confirmado' || !mov.categoria_id)) {
    return editarMensaje_(messageId, textoMovimiento_(mov, ctx), tecladoCategorias_(mov, frecuentes_(mov, ctx), ctx));
  }
  switch (accion) {
    case 'o':
    case 'k':
      return editarMensaje_(messageId, textoMovimiento_(mov, ctx), tecladoTodas_(mov, ctx));
    case 'v':
      return editarMensaje_(messageId, textoMovimiento_(mov, ctx),
        mov.estado === 'confirmado' ? tecladoRegistrado_(mov) : tecladoCategorias_(mov, frecuentes_(mov, ctx), ctx));
    case 'c':
      return elegirCategoria_(mov, expandirId_(partes[2]), messageId, ctx);
    case 'r':
      return recordarDesdeBot_(mov, messageId, ctx);
    case 's':
      return editarMensaje_(messageId, textoCategorizado_(mov, mov.categoria_id, ctx), null);
    case 'd':
      return deshacerDesdeBot_(mov, messageId, ctx);
    default:
      return null;
  }
}

function frecuentes_(mov, ctx) {
  return categoriasFrecuentes_(leerTabla_('Movimientos'), ctx.categorias)[mov.tipo] || [];
}

function textoYaEstaba_(mov, ctx) {
  return textoMovimiento_(mov, ctx) + (mov.tipo === 'transferencia'
    ? '\nYa estaba revisado.' : '\nYa estaba en ' + escaparHtml_(nombreCategoria_(ctx.categorias, mov.categoria_id)));
}

function elegirCategoria_(mov, categoriaId, messageId, ctx) {
  const estabaPorRevisar = mov.estado === 'por_revisar';
  if (estabaPorRevisar) {
    categorizarMovimiento({ id: mov.id, categoria_id: categoriaId });
  } else {
    // Cambiar la categoría de un gasto escrito que ya estaba confirmado.
    conBloqueo_(() => {
      const categoria = buscarActiva_(leerTabla_('Categorias'), categoriaId, 'La categoría');
      if (categoria.tipo !== mov.tipo) throw new Error('La categoría "' + categoria.nombre + '" no es de ' + mov.tipo + '.');
      actualizarFila_('Movimientos', mov.id, { categoria_id: categoria.id });
    });
  }
  const actualizado = Object.assign({}, mov, { categoria_id: categoriaId, estado: 'confirmado' });
  if (estabaPorRevisar && mov.comercio) {
    const pregunta = '\n¿Recordar para <b>' + escaparHtml_(normalizarTexto_(mov.comercio)) + '</b>?';
    return editarMensaje_(messageId, textoCategorizado_(actualizado, categoriaId, ctx, pregunta), tecladoRecordar_(actualizado));
  }
  return editarMensaje_(messageId, textoCategorizado_(actualizado, categoriaId, ctx),
    mov.origen === 'telegram' ? tecladoRegistrado_(actualizado) : null);
}

function recordarDesdeBot_(mov, messageId, ctx) {
  const r = conBloqueo_(() => recordarComercio_(leerTabla_('Movimientos'), mov, '', mov.categoria_id));
  const extra = ' · recordado para <b>' + escaparHtml_(r.regla.patron) + '</b>' + (r.confirmados ? ' (+' + r.confirmados + ' más)' : '');
  return editarMensaje_(messageId, textoCategorizado_(mov, mov.categoria_id, ctx, extra), null);
}

function deshacerDesdeBot_(mov, messageId, ctx) {
  if (mov.origen !== 'telegram') {
    return editarMensaje_(messageId, textoMovimiento_(mov, ctx) + '\nSolo se puede deshacer lo registrado por el bot.', null);
  }
  conBloqueo_(() => {
    eliminarFila_('Movimientos', mov.id);
    borrarDivisiones_(mov.id);
  });
  return editarMensaje_(messageId, '↩ Deshecho: ' + formatoMonto_(mov.monto, mov.moneda) + ' · ' + escaparHtml_(mov.comercio), null);
}
