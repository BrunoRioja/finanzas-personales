const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');

function entorno() {
  const e = entornoInstalado();
  e.ambito = nombre => e.llamar('obtenerCatalogos').ambitos.find(a => a.nombre === nombre).id;
  e.gasto = extra => e.llamar('guardarMovimiento', Object.assign({
    tipo: 'gasto', fecha: '2026-10-10', monto: 10, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Transporte'), comercio: 'Taxi',
  }, extra));
  return e;
}

test('guardarMovimiento guarda el ámbito de un gasto; Personal y los no-gastos quedan vacíos', () => {
  const e = entorno();
  assert.strictEqual(e.gasto({ ambito_id: e.ambito('Diversión') }).ambito_id, e.ambito('Diversión'));
  assert.strictEqual(e.gasto({ ambito_id: 'personal' }).ambito_id, '');
  assert.strictEqual(e.gasto({}).ambito_id, '');
  const ingreso = e.llamar('guardarMovimiento', {
    tipo: 'ingreso', fecha: '2026-10-10', monto: 50, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Sueldo'), ambito_id: e.ambito('Trabajo'),
  });
  assert.strictEqual(ingreso.ambito_id, '');
  assert.throws(() => e.gasto({ ambito_id: 'no-existe' }), /Ámbito inválido\./);
});

test('un ámbito desactivado se conserva al editar, pero no se puede usar en un gasto nuevo', () => {
  const e = entorno();
  const fam = e.ambito('Familia');
  const mov = e.gasto({ ambito_id: fam });
  e.llamar('guardarAmbito', { id: fam, nombre: 'Familia', emoji: '👨‍👩‍👧', activo: false });
  const editado = e.llamar('guardarMovimiento', Object.assign({}, mov, { monto: 12 }));
  assert.strictEqual(editado.ambito_id, fam);
  assert.throws(() => e.gasto({ ambito_id: fam }), /El ámbito "Familia" está desactivado\./);
});

test('categorizarMovimiento guarda el ámbito elegido en Por revisar', () => {
  const e = entorno();
  const mov = e.gasto({});
  e.interno('actualizarFila_', 'Movimientos', mov.id, { estado: 'por_revisar', categoria_id: '' });
  e.llamar('categorizarMovimiento', { id: mov.id, categoria_id: e.categoria('Transporte'), ambito_id: e.ambito('Trabajo') });
  const final = e.filas('Movimientos').find(m => m.id === mov.id);
  assert.deepStrictEqual([final.estado, final.ambito_id], ['confirmado', e.ambito('Trabajo')]);
});

test('dividir guarda un ámbito por parte', () => {
  const e = entorno();
  const mov = e.gasto({ monto: 200, categoria_id: e.categoria('Supermercado') });
  e.llamar('dividirMovimiento', { id: mov.id, partes: [
    { categoria_id: e.categoria('Supermercado'), monto: 150, ambito_id: e.ambito('Familia') },
    { categoria_id: e.categoria('Aseo personal'), monto: 50, ambito_id: 'personal' },
  ] });
  assert.deepStrictEqual(e.llamar('obtenerDivisiones', mov.id).map(d => [d.monto, d.ambito_id]), [[150, e.ambito('Familia')], [50, '']]);
  assert.throws(() => e.llamar('dividirMovimiento', { id: mov.id, partes: [
    { categoria_id: e.categoria('Supermercado'), monto: 150, ambito_id: 'x' },
    { categoria_id: e.categoria('Aseo personal'), monto: 50 },
  ] }), /Ámbito inválido\./);
});
