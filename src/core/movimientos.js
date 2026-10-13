// Validación y normalización de movimientos. Función pura: recibe catálogos en `ctx`.

const TIPOS_MOVIMIENTO = ['gasto', 'ingreso', 'transferencia'];

// Busca por id y exige que esté activa, salvo que el movimiento ya la usara (edición).
function buscarActiva_(lista, id, etiqueta, idsPrevios) {
  const item = lista.filter(x => x.id === id)[0];
  if (!item) throw new Error(etiqueta + ' no existe.');
  if (!item.activa && (idsPrevios || []).indexOf(id) < 0) {
    throw new Error(etiqueta + ' "' + item.nombre + '" está desactivada.');
  }
  return item;
}

// ctx = { cuentas, categorias, tcUsd, idsPrevios? }
function normalizarMovimiento_(datos, ctx) {
  const tipo = String(datos.tipo || '');
  if (TIPOS_MOVIMIENTO.indexOf(tipo) < 0) throw new Error('Tipo de movimiento inválido.');
  if (!esFechaIso_(datos.fecha)) throw new Error('La fecha debe tener el formato aaaa-mm-dd.');
  const monto = redondear2_(datos.monto);
  if (!isFinite(monto) || monto === 0) throw new Error('El monto debe ser un número distinto de cero.');
  if (monto < 0 && tipo !== 'gasto') throw new Error('Solo un gasto (reembolso) puede tener monto negativo.');
  const cuenta = buscarActiva_(ctx.cuentas, datos.cuenta_id, 'La cuenta', ctx.idsPrevios);
  const moneda = String(datos.moneda || cuenta.moneda || 'PEN');
  if (MONEDAS.indexOf(moneda) < 0) throw new Error('Moneda no soportada: ' + moneda);
  const tc = moneda === 'PEN' ? 1 : Number(datos.tc || ctx.tcUsd);
  if (!(tc > 0)) throw new Error('Falta el tipo de cambio para ' + moneda + '. Configúralo en Ajustes.');
  const mov = {
    fecha: datos.fecha, tipo: tipo, monto: monto, moneda: moneda, tc: tc, monto_pen: redondear2_(monto * tc),
    cuenta_id: cuenta.id, cuenta_destino_id: '', categoria_id: '',
    comercio: String(datos.comercio || '').trim(), descripcion: String(datos.descripcion || '').trim(),
    origen: datos.origen || 'manual', estado: datos.estado || 'confirmado',
    ref_externa: String(datos.ref_externa || ''), dividido: false,
  };
  if (tipo === 'transferencia') {
    const destino = buscarActiva_(ctx.cuentas, datos.cuenta_destino_id, 'La cuenta destino', ctx.idsPrevios);
    if (destino.id === cuenta.id) throw new Error('La cuenta destino debe ser distinta de la de origen.');
    mov.cuenta_destino_id = destino.id;
  } else {
    const cat = buscarActiva_(ctx.categorias, datos.categoria_id, 'La categoría', ctx.idsPrevios);
    if (cat.tipo !== tipo) throw new Error('La categoría "' + cat.nombre + '" no es de ' + tipo + '.');
    mov.categoria_id = cat.id;
  }
  return mov;
}
