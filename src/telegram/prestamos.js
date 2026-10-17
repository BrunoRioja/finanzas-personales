// Textos y teclados del bot para préstamos y reembolsos. Funciones puras, como mensajes.js.

// Letra del botón de fecha prometida → opción de fechaPromesa_.
const OPCIONES_FECHA_PROMESA = { m: 'manana', s: 'semana', q: 'quincena', f: 'mes', n: 'sin' };
const MAX_PRESTAMOS_SUGERIDOS = 4;

// prestamo = fila de Prestamos; `nuevo: true` agrega la pregunta de la fecha.
function textoPrestamo_(prestamo, mov, ctx) {
  const promesa = prestamo.fecha_promesa
    ? ' · vuelve el ' + diaSemana_(prestamo.fecha_promesa) + ' ' + fechaCorta_(prestamo.fecha_promesa)
    : prestamo.nuevo ? '\n¿Para cuándo te lo devuelve?' : '';
  return (mov ? textoMovimiento_(mov, ctx) + '\n' : '') + '🤝 Préstamo a <b>' + escaparHtml_(prestamo.persona) + '</b> · ' +
    formatoMonto_(Number(prestamo.monto), 'PEN') + promesa;
}

function tecladoFechaPromesa_(prestamo) {
  const id = compactarId_(prestamo.id);
  const b = (texto, letra) => boton_(texto, 'f:' + id + ':' + letra);
  return [[b('Mañana', 'm'), b('Esta semana', 's')], [b('Fin de quincena', 'q'), b('Fin de mes', 'f')], [b('Sin fecha', 'n')]];
}

function botonReembolsoGasto_(mov, categoriaId, ctx) {
  return boton_(nombreCategoria_(ctx.categorias, categoriaId), 'g:' + compactarId_(mov.id) + ':' + compactarId_(categoriaId));
}

const esGastoSinRol_ = (ctx, id) => ctx.categorias.some(c => c.id === id && c.tipo === 'gasto' && c.activa && !c.rol);

// sugeridos = prestamosSugeridos_(…) (pendientes con `falta`); idsGastoFrecuentes = ids de gasto por uso.
function mensajeReembolso_(mov, sugeridos, idsGastoFrecuentes, ctx) {
  const id = compactarId_(mov.id);
  const filas = sugeridos.slice(0, MAX_PRESTAMOS_SUGERIDOS).map(p => [boton_(
    '🤝 Préstamo de ' + p.persona + ' (faltan ' + formatoMonto_(p.falta, 'PEN') + ')', 'p:' + id + ':' + compactarId_(p.id))]);
  const gastos = idsGastoFrecuentes.filter(cid => esGastoSinRol_(ctx, cid)).slice(0, 3).map(cid => botonReembolsoGasto_(mov, cid, ctx));
  if (gastos.length) filas.push(gastos);
  filas.push([boton_('Otras categorías…', 'h:' + id), boton_('← Volver', 'v:' + id)]);
  return { texto: textoMovimiento_(mov, ctx) + '\n¿De qué es este reembolso?', teclado: filas };
}

// Todas las categorías de gasto sin rol, 2 por fila, para un reembolso de gasto.
function tecladoReembolsoTodas_(mov, ctx) {
  const botones = ctx.categorias.filter(c => esGastoSinRol_(ctx, c.id)).map(c => botonReembolsoGasto_(mov, c.id, ctx));
  const filas = [];
  for (let i = 0; i < botones.length; i += 2) filas.push(botones.slice(i, i + 2));
  filas.push([boton_('← Volver', 'w:' + compactarId_(mov.id))]);
  return filas;
}

// r = { prestamo, falta, pagado } de abonarConMovimiento_.
function textoAbono_(r) {
  const persona = escaparHtml_(r.prestamo.persona);
  return r.pagado ? '✓ ' + persona + ' te pagó todo 🎉' : '✓ Abono de <b>' + persona + '</b> · faltan ' + formatoMonto_(r.falta, 'PEN');
}
