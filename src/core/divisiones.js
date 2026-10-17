// Validación de las partes de un movimiento dividido entre categorías.

function normalizarPartes_(mov, partes, categorias, ambitos, idsPrevios) {
  if (mov.tipo === 'transferencia') throw new Error('Una transferencia no se puede dividir.');
  if (mov.monto < 0) throw new Error('Un reembolso no se divide.');
  if (!partes || partes.length < 2) throw new Error('Divide el movimiento en al menos 2 partes.');
  const limpias = partes.map(p => {
    const categoria = buscarActiva_(categorias, p.categoria_id, 'La categoría');
    if (rolDe_(categorias, categoria.id)) throw new Error('Los préstamos y reembolsos no se dividen.');
    if (categoria.tipo !== mov.tipo) throw new Error('La categoría "' + categoria.nombre + '" no es de ' + mov.tipo + '.');
    const monto = redondear2_(p.monto);
    if (!isFinite(monto) || monto === 0) throw new Error('Cada parte necesita un monto.');
    if (Math.sign(monto) !== Math.sign(mov.monto)) throw new Error('Las partes deben tener el mismo signo que el movimiento.');
    return {
      categoria_id: categoria.id, monto: monto, nota: String(p.nota || '').trim(),
      ambito_id: ambitoParaGuardar_(mov.tipo, p.ambito_id, ambitos, idsPrevios),
    };
  });
  const suma = redondear2_(limpias.reduce((s, p) => s + p.monto, 0));
  if (suma !== redondear2_(mov.monto)) {
    throw new Error('Las partes suman ' + suma.toFixed(2) + ' y el movimiento es ' + redondear2_(mov.monto).toFixed(2) + '.');
  }
  return limpias;
}
