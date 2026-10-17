const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');

function entorno() {
  const e = entornoInstalado();
  e.deb = e.cuenta('Débito BCP');
  e.prestamos = e.categoria('Préstamos');
  e.reembolsos = e.categoria('Reembolsos');
  e.comida = e.categoria('Comida fuera');
  e.sueldo = e.categoria('Sueldo');
  // Movimiento importado "por revisar" (sin categoría), como lo deja la lectura de correos.
  e.porRevisar = extra => {
    const d = Object.assign({ fecha: '2026-10-10', tipo: 'gasto', monto: 200, cuenta_id: e.deb, comercio: 'Juan Prueba' }, extra);
    d.categoria_id = d.tipo === 'gasto' ? e.categoria('Otros') : e.sueldo;
    const mov = e.llamar('guardarMovimiento', d);
    e.interno('actualizarFila_', 'Movimientos', mov.id, { estado: 'por_revisar', categoria_id: '' });
    return mov.id;
  };
  e.mov = id => e.filas('Movimientos').find(m => m.id === id);
  // Un préstamo de 200 creado al categorizar un yapeo enviado.
  e.prestar = extra => {
    const id = e.porRevisar(extra);
    e.llamar('categorizarMovimiento', { id, categoria_id: e.prestamos });
    return { movId: id, prestamo: e.filas('Prestamos').find(p => p.movimiento_id === id) };
  };
  return e;
}

const editar = (e, id, cambios) => e.llamar('guardarMovimiento', Object.assign({}, e.mov(id), cambios));

test('categorizar un yapeo como Préstamos crea el préstamo; pasarlo a otra categoría lo borra', () => {
  const e = entorno();
  const id = e.porRevisar();
  const r = e.llamar('categorizarMovimiento', { id, categoria_id: e.prestamos });
  const filas = e.filas('Prestamos');
  assert.strictEqual(filas.length, 1);
  const p = filas[0];
  assert.deepStrictEqual(
    { persona: p.persona, monto: p.monto, fecha: p.fecha, estado: p.estado, movimiento_id: p.movimiento_id, fecha_promesa: p.fecha_promesa },
    { persona: 'Juan Prueba', monto: 200, fecha: '2026-10-10', estado: 'pendiente', movimiento_id: id, fecha_promesa: '' });
  assert.strictEqual(r.prestamo.id, p.id);
  editar(e, id, { categoria_id: e.comida });
  assert.deepStrictEqual(e.filas('Prestamos'), []);
});

test('un movimiento nuevo en Préstamos crea el préstamo y borrarlo lo quita; sin comercio usa la descripción', () => {
  const e = entorno();
  const mov = e.llamar('guardarMovimiento', { fecha: '2026-10-11', tipo: 'gasto', monto: 50, cuenta_id: e.deb, categoria_id: e.prestamos, descripcion: 'Para Rosa Inventada' });
  assert.deepStrictEqual(e.filas('Prestamos').map(p => [p.persona, p.monto, p.movimiento_id]), [['Para Rosa Inventada', 50, mov.id]]);
  e.llamar('eliminarMovimiento', mov.id);
  assert.deepStrictEqual(e.filas('Prestamos'), []);
  e.llamar('guardarMovimiento', { fecha: '2026-10-11', tipo: 'gasto', monto: 30, cuenta_id: e.deb, categoria_id: e.prestamos });
  assert.strictEqual(e.filas('Prestamos')[0].persona, 'Sin nombre');
});

test('con abonos, cambiar o borrar el movimiento del préstamo se rechaza y no escribe nada', () => {
  const e = entorno();
  const { movId, prestamo } = e.prestar();
  e.llamar('registrarAbono', { prestamo_id: prestamo.id, monto: 50, fecha: '2026-10-12' });
  const movsAntes = e.filas('Movimientos');
  const prestamosAntes = e.filas('Prestamos');
  const abonosAntes = e.filas('Abonos');
  assert.throws(() => editar(e, movId, { categoria_id: e.comida }), /Este préstamo ya tiene abonos: bórralos primero en Préstamos\./);
  assert.throws(() => e.llamar('eliminarMovimiento', movId), /Este préstamo ya tiene abonos/);
  assert.throws(() => editar(e, movId, { monto: 40 }), /El préstamo ya tiene abonos por S\/ 50\.00: el monto no puede ser menor\./);
  assert.deepStrictEqual(e.filas('Movimientos'), movsAntes);
  assert.deepStrictEqual(e.filas('Prestamos'), prestamosAntes);
  assert.deepStrictEqual(e.filas('Abonos'), abonosAntes);
});

test('abonar con un yapeo recibido y luego borrar ese yapeo devuelve el préstamo a pendiente', () => {
  const e = entorno();
  const { prestamo } = e.prestar();
  const ing = e.porRevisar({ tipo: 'ingreso', monto: 200, fecha: '2026-10-12' });
  const r = e.llamar('categorizarMovimiento', { id: ing, categoria_id: e.reembolsos, prestamo_id: prestamo.id });
  assert.strictEqual(r.abono.pagado, true);
  assert.strictEqual(r.abono.falta, 0);
  assert.deepStrictEqual(e.filas('Abonos').map(a => [a.prestamo_id, a.monto, a.fecha, a.movimiento_id]), [[prestamo.id, 200, '2026-10-12', ing]]);
  assert.strictEqual(e.filas('Prestamos')[0].estado, 'pagado');
  assert.strictEqual(e.mov(ing).categoria_id, e.reembolsos);
  assert.strictEqual(e.mov(ing).estado, 'confirmado');
  e.llamar('eliminarMovimiento', ing);
  assert.deepStrictEqual(e.filas('Abonos'), []);
  assert.strictEqual(e.filas('Prestamos')[0].estado, 'pendiente');
});

test('editar el yapeo de un abono sincroniza el abono; pasarlo a otra categoría lo borra', () => {
  const e = entorno();
  const { prestamo } = e.prestar();
  const ing = e.porRevisar({ tipo: 'ingreso', monto: 200 });
  e.llamar('categorizarMovimiento', { id: ing, categoria_id: e.reembolsos, prestamo_id: prestamo.id });
  editar(e, ing, { monto: 80, fecha: '2026-10-13' });
  assert.deepStrictEqual(e.filas('Abonos').map(a => [a.monto, a.fecha]), [[80, '2026-10-13']]);
  assert.strictEqual(e.filas('Prestamos')[0].estado, 'pendiente');
  editar(e, ing, { categoria_id: e.sueldo });
  assert.deepStrictEqual(e.filas('Abonos'), []);
});

test('reembolso de cena: resolverReembolso con categoria_id convierte en gasto −40 en Comida', () => {
  const e = entorno();
  const ing = e.porRevisar({ tipo: 'ingreso', monto: 40, comercio: 'Ana Ficticia' });
  e.llamar('resolverReembolso', { id: ing, categoria_id: e.comida });
  const m = e.mov(ing);
  assert.deepStrictEqual(
    { tipo: m.tipo, monto: m.monto, monto_pen: m.monto_pen, categoria_id: m.categoria_id, estado: m.estado, comercio: m.comercio, ambito_id: m.ambito_id },
    { tipo: 'gasto', monto: -40, monto_pen: -40, categoria_id: e.comida, estado: 'confirmado', comercio: 'Ana Ficticia', ambito_id: '' });
  assert.throws(() => e.llamar('resolverReembolso', { id: ing, categoria_id: e.comida }), /Solo un ingreso puede ser reembolso de un gasto\./);
  const otro = e.porRevisar({ tipo: 'ingreso', monto: 10 });
  assert.throws(() => e.llamar('resolverReembolso', { id: otro, categoria_id: e.prestamos }), /Elige una categoría de gasto\./);
  assert.throws(() => e.llamar('resolverReembolso', { id: otro, categoria_id: e.sueldo }), /Elige una categoría de gasto\./);
  assert.throws(() => e.llamar('resolverReembolso', { id: otro }), /Elige de qué es el reembolso\./);
});

test('categorizar con reembolso_de convierte el ingreso en gasto negativo y quita un abono previo', () => {
  const e = entorno();
  const { prestamo } = e.prestar();
  const ing = e.porRevisar({ tipo: 'ingreso', monto: 40 });
  e.llamar('categorizarMovimiento', { id: ing, categoria_id: e.reembolsos, prestamo_id: prestamo.id });
  const r = e.llamar('categorizarMovimiento', { id: ing, reembolso_de: e.comida });
  assert.strictEqual(r.movimiento.monto, -40);
  assert.strictEqual(e.mov(ing).tipo, 'gasto');
  assert.strictEqual(e.mov(ing).categoria_id, e.comida);
  assert.deepStrictEqual(e.filas('Abonos'), []);
});

test('categorizar en Reembolsos sin decir de qué se rechaza', () => {
  const e = entorno();
  const ing = e.porRevisar({ tipo: 'ingreso', monto: 40 });
  const antes = e.filas('Movimientos');
  assert.throws(() => e.llamar('categorizarMovimiento', { id: ing, categoria_id: e.reembolsos }), /Elige de qué es el reembolso\./);
  assert.throws(() => e.llamar('categorizarMovimiento', { id: ing, categoria_id: e.reembolsos, prestamo_id: 'no-existe' }), /El préstamo ya no existe\./);
  assert.deepStrictEqual(e.filas('Movimientos'), antes);
  assert.deepStrictEqual(e.filas('Abonos'), []);
});

test('guardarMovimiento en Reembolsos exige el préstamo al crear o al pasar a ese rol, no al editar uno que ya lo era', () => {
  const e = entorno();
  const { prestamo } = e.prestar();
  const nuevo = { fecha: '2026-10-12', tipo: 'ingreso', monto: 50, cuenta_id: e.deb, categoria_id: e.reembolsos };
  assert.throws(() => e.llamar('guardarMovimiento', nuevo), /Elige de qué es el reembolso\./);
  const sueldo = e.llamar('guardarMovimiento', Object.assign({}, nuevo, { categoria_id: e.sueldo }));
  assert.throws(() => editar(e, sueldo.id, { categoria_id: e.reembolsos }), /Elige de qué es el reembolso\./);
  assert.strictEqual(e.mov(sueldo.id).categoria_id, e.sueldo);
  const mov = e.llamar('guardarMovimiento', Object.assign({}, nuevo, { prestamo_id: prestamo.id }));
  assert.deepStrictEqual(e.filas('Abonos').map(a => [a.prestamo_id, a.monto, a.movimiento_id]), [[prestamo.id, 50, mov.id]]);
  editar(e, mov.id, { descripcion: 'Primera parte' });
  assert.strictEqual(e.filas('Abonos').length, 1);
  assert.throws(() => e.llamar('guardarMovimiento', Object.assign({}, nuevo, { prestamo_id: 'no-existe' })), /El préstamo ya no existe\./);
  assert.strictEqual(e.filas('Movimientos').filter(m => m.categoria_id === e.reembolsos).length, 1);
});

test('abonarConMovimiento_ rechaza un movimiento que ya es abono, un préstamo pagado o sin categoría de reembolso', () => {
  const e = entorno();
  const { prestamo } = e.prestar();
  const ing = e.porRevisar({ tipo: 'ingreso', monto: 200 });
  e.llamar('resolverReembolso', { id: ing, prestamo_id: prestamo.id });
  assert.throws(() => e.llamar('resolverReembolso', { id: ing, prestamo_id: prestamo.id }), /Este movimiento ya es un abono\./);
  const otro = e.porRevisar({ tipo: 'ingreso', monto: 10 });
  assert.throws(() => e.llamar('resolverReembolso', { id: otro, prestamo_id: prestamo.id }), /Ese préstamo ya está pagado\./);
  const p2 = e.prestar({ comercio: 'Luis Inventado' }).prestamo;
  e.interno('actualizarFila_', 'Categorias', e.reembolsos, { rol: '' });
  assert.throws(() => e.llamar('resolverReembolso', { id: otro, prestamo_id: p2.id }), /Marca una categoría de ingreso como reembolso en Ajustes\./);
});

test('saldarPrestamo crea el abono por lo que falta y lo marca pagado; eliminarAbono lo reabre', () => {
  const e = entorno();
  const { prestamo } = e.prestar();
  e.llamar('registrarAbono', { prestamo_id: prestamo.id, monto: 50, fecha: '2026-10-11' });
  const r = e.llamar('saldarPrestamo', prestamo.id);
  assert.strictEqual(r.total, 0);
  assert.strictEqual(r.pagados[0].estado, 'pagado');
  assert.deepStrictEqual(e.filas('Abonos').map(a => [a.monto, a.fecha, a.movimiento_id]), [[50, '2026-10-11', ''], [150, '2026-10-13', '']]);
  assert.throws(() => e.llamar('saldarPrestamo', prestamo.id), /Ese préstamo ya está pagado\./);
  const ultimo = e.filas('Abonos')[1];
  const r2 = e.llamar('eliminarAbono', ultimo.id);
  assert.strictEqual(r2.pendientes[0].falta, 150);
  assert.strictEqual(e.filas('Prestamos')[0].estado, 'pendiente');
});

test('un abono que viene de un movimiento no se borra desde Préstamos', () => {
  const e = entorno();
  const { prestamo } = e.prestar();
  const ing = e.porRevisar({ tipo: 'ingreso', monto: 20 });
  e.llamar('resolverReembolso', { id: ing, prestamo_id: prestamo.id });
  assert.throws(() => e.llamar('eliminarAbono', e.filas('Abonos')[0].id), /movimiento/);
  assert.strictEqual(e.filas('Abonos').length, 1);
});

test('abonar de más se acepta y queda pagado', () => {
  const e = entorno();
  const { prestamo } = e.prestar();
  const r = e.llamar('registrarAbono', { prestamo_id: prestamo.id, monto: 250, fecha: '2026-10-12' });
  assert.strictEqual(r.pagados[0].id, prestamo.id);
  assert.strictEqual(r.pagados[0].falta, 0);
  assert.strictEqual(e.filas('Prestamos')[0].estado, 'pagado');
});

test('editar el monto del yapeo de un préstamo sincroniza el préstamo', () => {
  const e = entorno();
  const { movId } = e.prestar();
  editar(e, movId, { monto: 260, fecha: '2026-10-09', comercio: 'Otro Nombre' });
  const p = e.filas('Prestamos')[0];
  assert.deepStrictEqual([p.monto, p.fecha, p.persona], [260, '2026-10-09', 'Juan Prueba']);
});

test('guardarPrestamo crea uno manual y edita persona, promesa, nota y monto; eliminarPrestamo solo los manuales', () => {
  const e = entorno();
  let r = e.llamar('guardarPrestamo', { persona: 'Rosa Inventada', monto: '100', fecha: '2026-10-01', fecha_promesa: '2026-10-20' });
  const manual = r.pendientes[0];
  assert.deepStrictEqual([manual.persona, manual.monto, manual.movimiento_id, manual.estado, manual.falta], ['Rosa Inventada', 100, '', 'pendiente', 100]);
  e.llamar('registrarAbono', { prestamo_id: manual.id, monto: 60, fecha: '2026-10-05' });
  assert.throws(() => e.llamar('guardarPrestamo', { id: manual.id, persona: 'Rosa', monto: 50 }), /abonos por S\/ 60\.00/);
  r = e.llamar('guardarPrestamo', { id: manual.id, persona: 'Rosa I.', monto: 60, nota: 'cine', fecha_promesa: '' });
  assert.deepStrictEqual([r.pagados[0].persona, r.pagados[0].nota, r.pagados[0].fecha_promesa, r.pagados[0].estado], ['Rosa I.', 'cine', '', 'pagado']);
  const { prestamo } = e.prestar();
  assert.throws(() => e.llamar('guardarPrestamo', { id: prestamo.id, persona: 'Juan', monto: 300 }), /movimiento/);
  e.llamar('guardarPrestamo', { id: prestamo.id, persona: 'Juan P.', monto: 200, fecha_promesa: '2026-10-31' });
  assert.deepStrictEqual([e.filas('Prestamos')[1].persona, e.filas('Prestamos')[1].fecha_promesa], ['Juan P.', '2026-10-31']);
  assert.throws(() => e.llamar('eliminarPrestamo', prestamo.id), /movimiento/);
  e.llamar('eliminarPrestamo', manual.id);
  assert.deepStrictEqual(e.filas('Prestamos').map(p => p.id), [prestamo.id]);
  assert.deepStrictEqual(e.filas('Abonos'), []);
  assert.throws(() => e.llamar('eliminarPrestamo', manual.id), /El préstamo ya no existe\./);
});

test('fijarFechaPromesa_ valida la fecha', () => {
  const e = entorno();
  const { prestamo } = e.prestar();
  e.interno('fijarFechaPromesa_', prestamo.id, '2026-10-18');
  assert.strictEqual(e.filas('Prestamos')[0].fecha_promesa, '2026-10-18');
  assert.throws(() => e.interno('fijarFechaPromesa_', prestamo.id, '18/10'), /La fecha prometida no es válida\./);
  assert.throws(() => e.interno('fijarFechaPromesa_', 'no-existe', '2026-10-18'), /El préstamo ya no existe\./);
});

test('categorizar en Préstamos con "recordar" no crea la regla', () => {
  const e = entorno();
  const id = e.porRevisar();
  e.llamar('categorizarMovimiento', { id, categoria_id: e.prestamos, recordar: true });
  assert.deepStrictEqual(e.filas('Reglas'), []);
});

test('obtenerDashboard trae prestamos.total y hasta 3 personas, vencidos primero', () => {
  const e = entorno();
  e.llamar('guardarPrestamo', { persona: 'Ana Ficticia', monto: 10, fecha: '2026-10-01', fecha_promesa: '2026-10-20' });
  e.llamar('guardarPrestamo', { persona: 'Beto Ficticio', monto: 20, fecha: '2026-10-01' });
  e.llamar('guardarPrestamo', { persona: 'Carla Ficticia', monto: 30, fecha: '2026-10-01', fecha_promesa: '2026-10-05' });
  e.llamar('guardarPrestamo', { persona: 'Dante Ficticio', monto: 40, fecha: '2026-10-01', fecha_promesa: '2026-10-15' });
  const d = e.llamar('obtenerDashboard', '2026-10');
  assert.deepStrictEqual(d.prestamos, {
    total: 100,
    personas: [
      { persona: 'Carla Ficticia', falta: 30, vencido: true },
      { persona: 'Dante Ficticio', falta: 40, vencido: false },
      { persona: 'Ana Ficticia', falta: 10, vencido: false },
    ],
  });
});
