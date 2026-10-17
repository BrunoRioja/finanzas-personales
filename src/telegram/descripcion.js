// Descripción propia de un movimiento desde el chat. "✏️ Descripción" pide el texto con
// force_reply; responder (reply) a ese pedido o a cualquier aviso de un movimiento la cambia.
// El comercio no se toca: de él dependen las reglas y los préstamos.

const MAX_DESCRIPCION = 100;
const SEGUNDOS_PEDIDO_DESCRIPCION = 21600; // lo máximo que guarda la caché
// Acciones cuyo partes[1] es un movimiento ("f" lleva un préstamo y "ok" nada).
const ACCIONES_DE_MOVIMIENTO = ['c', 'o', 'k', 'v', 'r', 's', 'a', 'd', 'p', 'g', 'h', 'w'];

// replyMarkup = el teclado del mensaje respondido (Telegram lo manda en reply_to_message).
function movimientoDeTeclado_(replyMarkup) {
  const partes = [].concat.apply([], (replyMarkup && replyMarkup.inline_keyboard) || [])
    .filter(b => b && b.callback_data).map(b => String(b.callback_data).split(':'));
  const elegido = partes.filter(p => p[0] === 'e')[0] || partes.filter(p => ACCIONES_DE_MOVIMIENTO.indexOf(p[0]) >= 0)[0];
  return elegido ? expandirId_(elegido[1]) : '';
}

function pedirDescripcion_(mov, avisoMessageId) {
  const que = mov.comercio || tituloMovimiento_(mov);
  const enviado = pedirRespuesta_('✏️ Escribe la descripción para <b>' + formatoMonto_(mov.monto, mov.moneda) + '</b>' +
    (que ? ' · ' + escaparHtml_(que) : ''), 'Ej.: compras de la semana');
  CacheService.getScriptCache().put('desc:' + enviado.message_id, JSON.stringify({ m: mov.id, a: avisoMessageId }), SEGUNDOS_PEDIDO_DESCRIPCION);
  return enviado;
}

// true si el mensaje era una respuesta sobre un movimiento (y ya se atendió).
function manejarRespuesta_(mensaje) {
  if (typeof mensaje.text !== 'string' || mensaje.text.trim()[0] === '/') return false;
  const respondido = mensaje.reply_to_message;
  const guardado = CacheService.getScriptCache().get('desc:' + respondido.message_id);
  const pedido = guardado ? JSON.parse(guardado) : null;
  const movId = pedido ? pedido.m : movimientoDeTeclado_(respondido.reply_markup);
  if (!movId) return false;
  const descripcion = mensaje.text.trim().slice(0, MAX_DESCRIPCION);
  const mov = conBloqueo_(() => {
    const actual = leerTabla_('Movimientos').filter(m => m.id === movId)[0];
    if (!actual) return null;
    actualizarFila_('Movimientos', movId, { descripcion: descripcion });
    return Object.assign({}, actual, { descripcion: descripcion });
  });
  if (!mov) {
    enviarMensaje_('Ese movimiento ya no existe.');
    return true;
  }
  const avisoId = pedido ? pedido.a : respondido.message_id;
  if (avisoId) {
    try {
      const m = mensajeActual_(mov, contextoBot_());
      editarMensaje_(avisoId, m.texto, m.teclado);
    } catch (e) {
      // La descripción ya quedó guardada; un aviso que no se puede editar no la deshace.
      registrarAvisoTelegram_(e);
    }
  }
  enviarMensaje_(descripcion ? '✓ Descripción guardada' : '✓ Descripción borrada');
  return true;
}

// El aviso de un movimiento tal como se vería hoy, con sus botones.
function mensajeActual_(mov, ctx) {
  if (mov.estado === 'por_revisar') return mensajePorRevisar_(mov, frecuentes_(mov, ctx), ctx);
  const prestamo = rolDe_(ctx.categorias, mov.categoria_id) === 'prestamo' ? prestamoDeMovimiento_(mov.id) : null;
  // Sin fecha prometida se vuelven a ofrecer las fechas, como en el aviso original.
  if (prestamo) return mensajePrestamo_(Object.assign({}, prestamo, { nuevo: !prestamo.fecha_promesa }), mov, ctx);
  if (mov.origen === 'telegram') return { texto: textoRegistrado_(mov, ctx), teclado: tecladoRegistrado_(mov, ctx) };
  if (mov.tipo === 'transferencia') return { texto: textoMovimiento_(mov, ctx), teclado: tecladoConfirmado_(mov, ctx) };
  return { texto: textoCategorizado_(mov, mov.categoria_id, ctx), teclado: tecladoConfirmado_(mov, ctx) };
}
