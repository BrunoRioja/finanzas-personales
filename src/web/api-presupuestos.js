// Pestaña Presupuestos: montos vigentes del mes actual con referencias, y guardado que
// rige "desde este mes" sin tocar los meses anteriores.

function obtenerPresupuestos() {
  const mes = mesDe_(hoyIso_());
  return {
    mes: mes,
    montos: presupuestosVigentes_(leerTabla_('Presupuestos'), mes),
    referencia: referenciaPresupuesto_(lineasCategoria_(leerTabla_('Movimientos'), leerTabla_('Divisiones')), mes),
    categorias: leerTabla_('Categorias').filter(c => c.tipo === 'gasto' && c.activa),
  };
}

// datos.montos = { categoria_id: monto } (texto o número; vacío = sin presupuesto).
function guardarPresupuestos(datos) {
  const mes = mesDe_(hoyIso_());
  const cambiadas = conBloqueo_(() => guardarPresupuestosSinAvisar_((datos && datos.montos) || {}, mes));
  return Object.assign({ cambiadas: cambiadas.length }, obtenerPresupuestos());
}

// Dentro del bloqueo. Valida todo antes de escribir; devuelve las categorías que cambiaron.
function guardarPresupuestosSinAvisar_(montos, mes) {
  const categorias = leerTabla_('Categorias');
  const filas = leerTabla_('Presupuestos');
  const vigentes = presupuestosVigentes_(filas, mes);
  const cambios = [];
  Object.keys(montos).forEach(id => {
    const categoria = buscarActiva_(categorias, id, 'La categoría');
    if (categoria.tipo !== 'gasto') throw new Error('Solo las categorías de gasto llevan presupuesto: "' + categoria.nombre + '".');
    const texto = montos[id] === null || montos[id] === undefined ? '' : String(montos[id]).trim().replace(',', '.');
    const monto = texto === '' ? 0 : redondear2_(texto);
    if (!isFinite(monto) || monto < 0) throw new Error('El presupuesto de "' + categoria.nombre + '" debe ser un número positivo.');
    if (monto !== (vigentes[id] || 0)) cambios.push({ categoria_id: id, monto: monto });
  });
  cambios.forEach(c => {
    const fila = filas.filter(f => f.categoria_id === c.categoria_id && f.desde === mes)[0];
    if (fila) actualizarFila_('Presupuestos', fila.id, { monto: c.monto });
    else agregarFilas_('Presupuestos', [{ id: nuevoId_(), categoria_id: c.categoria_id, monto: c.monto, desde: mes }]);
  });
  return cambios.map(c => c.categoria_id);
}
