const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { ASISTENTE, entornoInstalado } = require('./fixtures');

test('normalizarCategoria_ valida el rol', () => {
  const e = crearEntorno();
  const n = (d, ex) => e.interno('normalizarCategoria_', d, ex || [], '');
  assert.strictEqual(n({ nombre: 'Préstamos', tipo: 'gasto', rol: 'prestamo' }).rol, 'prestamo');
  assert.strictEqual(n({ nombre: 'Sueldo', tipo: 'ingreso' }).rol, '');
  assert.throws(() => n({ nombre: 'X', tipo: 'ingreso', rol: 'prestamo' }), /préstamo.*gasto/i);
  assert.throws(() => n({ nombre: 'X', tipo: 'gasto', rol: 'otro' }), /rol/i);
  const ya = [{ id: 'a', nombre: 'Préstamos', tipo: 'gasto', rol: 'prestamo', activa: true }];
  assert.throws(() => n({ nombre: 'Fiados', tipo: 'gasto', rol: 'prestamo' }, ya), /Ya hay una categoría.*"Préstamos"/);
  const yaR = [{ id: 'b', nombre: 'Reembolsos', tipo: 'ingreso', rol: 'reembolso', activa: true }];
  assert.throws(() => n({ nombre: 'Devoluciones', tipo: 'ingreso', rol: 'reembolso' }, yaR), /como reembolso: "Reembolsos"/);
  assert.strictEqual(e.interno('normalizarCategoria_', { nombre: 'Préstamos', tipo: 'gasto', rol: 'prestamo' }, ya, 'a').rol, 'prestamo');
});

test('rolDe_ y categoriaConRol_ ignoran categorías desactivadas', () => {
  const e = crearEntorno();
  const cats = [
    { id: 'a', tipo: 'gasto', rol: 'prestamo', activa: true },
    { id: 'b', tipo: 'ingreso', rol: 'reembolso', activa: false },
  ];
  assert.strictEqual(e.interno('rolDe_', cats, 'a'), 'prestamo');
  assert.strictEqual(e.interno('rolDe_', cats, 'b'), '');
  assert.strictEqual(e.interno('rolDe_', cats, 'zzz'), '');
  assert.strictEqual(e.interno('categoriaConRol_', cats, 'prestamo').id, 'a');
  assert.strictEqual(e.interno('categoriaConRol_', cats, 'reembolso'), null);
});

function libroV5(categorias) {
  const e = entornoInstalado();
  e.hojas.Categorias.splice(1);
  delete e.hojas.Prestamos;
  delete e.hojas.Abonos;
  e.hojas.Categorias[0] = e.hojas.Categorias[0].filter(h => h !== 'rol');
  e.interno('guardarConfig_', { version_esquema: 5 });
  categorias.forEach((c, i) => e.interno('agregarFilas_', 'Categorias', [Object.assign({ id: 'c' + i, emoji: '', color: '#123456', padre_id: '', activa: true }, c)]));
  return e;
}

test('migrar a esquema 6 marca "Reembolsos" y "PRESTAMOS" sin tildes, sin crear otra', () => {
  const e = libroV5([{ nombre: 'PRESTAMOS', tipo: 'gasto' }, { nombre: 'Reembolsos', tipo: 'ingreso' }]);
  e.llamar('estadoInstalacion');
  const cats = e.filas('Categorias');
  assert.strictEqual(cats.length, 2);
  assert.strictEqual(cats.find(c => c.nombre === 'PRESTAMOS').rol, 'prestamo');
  assert.strictEqual(cats.find(c => c.nombre === 'Reembolsos').rol, 'reembolso');
  assert.deepStrictEqual(e.hojas.Prestamos[0], ['id', 'persona', 'monto', 'fecha', 'fecha_promesa', 'movimiento_id', 'estado', 'nota', 'creado_en']);
  assert.deepStrictEqual(e.hojas.Abonos[0], ['id', 'prestamo_id', 'fecha', 'monto', 'movimiento_id']);
});

test('migrar a esquema 6 crea "Préstamos 🤝" si falta y no duplica en una segunda migración', () => {
  const e = libroV5([{ nombre: 'Comida', tipo: 'gasto' }]);
  e.llamar('estadoInstalacion');
  let cats = e.filas('Categorias');
  const p = cats.filter(c => c.rol === 'prestamo');
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].nombre, 'Préstamos');
  assert.strictEqual(p[0].emoji, '🤝');
  assert.strictEqual(p[0].tipo, 'gasto');
  assert.strictEqual(cats.filter(c => c.rol === 'reembolso').length, 0, 'no crea reembolso');
  e.interno('guardarConfig_', { version_esquema: 5 });
  e.llamar('estadoInstalacion');
  cats = e.filas('Categorias');
  assert.strictEqual(cats.length, 2);
});

test('las categorías por defecto traen Préstamos y Reembolsos con su rol', () => {
  const e = entornoInstalado();
  const cats = e.filas('Categorias');
  assert.strictEqual(cats.find(c => c.nombre === 'Préstamos').rol, 'prestamo');
  assert.strictEqual(cats.find(c => c.nombre === 'Reembolsos').rol, 'reembolso');
  assert.strictEqual(cats.filter(c => c.rol).length, 2);
});

test('guardarCategoria conserva el rol al editar sin enviarlo y lo quita con rol vacío', () => {
  const e = entornoInstalado();
  const id = e.categoria('Préstamos');
  e.llamar('guardarCategoria', { id: id, nombre: 'Préstamos a amigos', emoji: '🤝', tipo: 'gasto' });
  let c = e.filas('Categorias').find(x => x.id === id);
  assert.strictEqual(c.nombre, 'Préstamos a amigos');
  assert.strictEqual(c.rol, 'prestamo');
  e.llamar('guardarCategoria', { id: id, nombre: 'Préstamos a amigos', emoji: '🤝', tipo: 'gasto', rol: '' });
  c = e.filas('Categorias').find(x => x.id === id);
  assert.strictEqual(c.rol, '');
});

// El asistente web envía las categorías elegidas como { nombre, emoji, tipo, rol }; un cliente
// viejo (o una lista propia) puede no traer el rol.
function instalarCon(categorias) {
  const e = crearEntorno();
  e.llamar('completarAsistente', Object.assign({}, ASISTENTE, { categorias }));
  return e.llamar('leerTabla_', 'Categorias');
}

test('completarAsistente con las categorías del cliente deja Préstamos y Reembolsos con su rol, envíe o no el rol', () => {
  const base = crearEntorno().llamar('datosAsistente').categorias;
  const conRol = base.map(c => ({ nombre: c.nombre, emoji: c.emoji, tipo: c.tipo, rol: c.rol || '' }));
  const sinRol = base.map(c => ({ nombre: c.nombre, emoji: c.emoji, tipo: c.tipo }));
  [conRol, sinRol].forEach(lista => {
    const cats = instalarCon(lista);
    assert.strictEqual(cats.length, base.length);
    assert.strictEqual(cats.find(c => c.nombre === 'Préstamos').rol, 'prestamo');
    assert.strictEqual(cats.find(c => c.nombre === 'Reembolsos').rol, 'reembolso');
    assert.strictEqual(cats.filter(c => c.rol).length, 2);
  });
});

test('completarAsistente con una lista propia sin categoría de préstamos crea "Préstamos 🤝"', () => {
  const cats = instalarCon([{ nombre: 'Comida', emoji: '', tipo: 'gasto' }, { nombre: 'Sueldo', emoji: '', tipo: 'ingreso' }]);
  const p = cats.filter(c => c.rol === 'prestamo');
  assert.deepStrictEqual(p.map(c => [c.nombre, c.emoji, c.tipo, c.activa]), [['Préstamos', '🤝', 'gasto', true]]);
  assert.strictEqual(cats.length, 3);
});

test('migrar a esquema 6 con "Préstamos" y "Reembolsos" desactivadas las reusa y reactiva, sin duplicar', () => {
  const e = libroV5([
    { nombre: 'Préstamos', tipo: 'gasto', activa: false },
    { nombre: 'Reembolsos', tipo: 'ingreso', activa: false },
  ]);
  e.llamar('estadoInstalacion');
  assert.strictEqual(Number(e.interno('leerConfig_').version_esquema), 6);
  const cats = e.filas('Categorias');
  assert.deepStrictEqual(cats.map(c => [c.nombre, c.rol, c.activa]), [['Préstamos', 'prestamo', true], ['Reembolsos', 'reembolso', true]]);
});
