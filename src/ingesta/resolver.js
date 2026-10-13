// Convierte un movimiento crudo (de un lector de correo) en un movimiento listo para
// guardar: cuenta por número o por Yape, categoría por regla y monto en soles.

// La regla cuyo patrón está contenido en el comercio; si varias, la del patrón más largo.
function reglaPara_(comercio, reglas) {
  const texto = normalizarTexto_(comercio);
  if (!texto) return null;
  return reglas
    .filter(r => r.patron && texto.indexOf(normalizarTexto_(r.patron)) >= 0)
    .sort((a, b) => normalizarTexto_(b.patron).length - normalizarTexto_(a.patron).length)[0] || null;
}

// ctx = { cuentas, categorias, reglas, tcUsd }
function resolverMovimiento_(crudo, ctx) {
  const activas = ctx.cuentas.filter(c => c.activa);
  const porNumero = n => (n ? activas.filter(c => numerosDe_(c).indexOf(n) >= 0)[0] || null : null);
  const origen = crudo.usa_yape ? activas.filter(c => c.yape)[0] || null : porNumero(crudo.numero_origen);
  const destino = crudo.tipo === 'transferencia' ? porNumero(crudo.numero_destino) : null;
  const tc = crudo.moneda === 'PEN' ? 1 : Number(crudo.tc || ctx.tcUsd) || 0;
  const mov = {
    fecha: crudo.fecha, tipo: crudo.tipo, monto: crudo.monto, moneda: crudo.moneda, tc: tc,
    monto_pen: redondear2_(crudo.monto * tc), cuenta_id: origen ? origen.id : '',
    cuenta_destino_id: destino ? destino.id : '', categoria_id: '', comercio: crudo.comercio || '',
    descripcion: crudo.descripcion || '', origen: 'gmail', estado: 'por_revisar',
    ref_externa: crudo.ref_externa, dividido: false, regla_id: '',
  };
  let completo = !!origen && tc > 0;
  if (crudo.tipo === 'transferencia') {
    completo = completo && !!destino;
  } else {
    const regla = reglaPara_(mov.comercio, ctx.reglas);
    const categoria = regla ? ctx.categorias.filter(c => c.id === regla.categoria_id && c.activa && c.tipo === crudo.tipo)[0] : null;
    if (categoria) {
      mov.categoria_id = categoria.id;
      mov.regla_id = regla.id;
    } else {
      completo = false;
    }
  }
  if (!tc) mov.descripcion = 'Falta el tipo de cambio de ' + crudo.moneda;
  if (completo) mov.estado = 'confirmado';
  return mov;
}
