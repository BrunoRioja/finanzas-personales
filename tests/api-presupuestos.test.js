const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');

function entorno() {
  const e = entornoInstalado();
  e.sup = e.categoria('Supermercado');
  e.com = e.categoria('Comida fuera');
  e.bod = e.categoria('Bodega');
  e.nombre = id => e.llamar('obtenerCatalogos').categorias.find(c => c.id === id).nombre;
  e.filasPpto = () => e.filas('Presupuestos').map(p => [e.nombre(p.categoria_id), p.monto, p.desde]);
  e.gasto = (fecha, monto, categoria_id) => e.llamar('guardarMovimiento', {
    fecha, tipo: 'gasto', monto, cuenta_id: e.cuenta('Débito BCP'), categoria_id: categoria_id || e.sup, comercio: 'Tottus',
  });
  return e;
}

test('guardar crea filas desde el mes actual y obtenerPresupuestos las devuelve con la referencia', () => {
  const e = entorno();
  e.gasto('2026-09-10', 380);
  const r = e.llamar('guardarPresupuestos', { montos: { [e.sup]: '600', [e.com]: ' 400,50 ', [e.bod]: '' } });
  assert.strictEqual(r.cambiadas, 2);
  assert.strictEqual(r.mes, '2026-10');
  assert.deepStrictEqual(r.montos, { [e.sup]: 600, [e.com]: 400.5 });
  assert.deepStrictEqual(r.referencia[e.sup], { mesPasado: 380, promedio3: 126.67 });
  assert.ok(r.categorias.length > 10 && r.categorias.every(c => c.tipo === 'gasto' && c.activa));
  assert.deepStrictEqual(e.filasPpto(), [['Supermercado', 600, '2026-10'], ['Comida fuera', 400.5, '2026-10']]);
  assert.deepStrictEqual(e.llamar('obtenerPresupuestos').montos, r.montos);
});

test('en el mismo mes actualiza la fila; en un mes nuevo agrega otra y el anterior no cambia; sin cambios no escribe', () => {
  const e = entorno();
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: 600 } });
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: 650 } });
  assert.deepStrictEqual(e.filasPpto(), [['Supermercado', 650, '2026-10']]);
  assert.strictEqual(e.llamar('guardarPresupuestos', { montos: { [e.sup]: '650', [e.com]: '' } }).cambiadas, 0);
  e.fijarAhora('2026-11-05T09:00:00');
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: 700 } });
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: '' } });
  assert.deepStrictEqual(e.filasPpto(), [['Supermercado', 650, '2026-10'], ['Supermercado', 0, '2026-11']]);
  assert.deepStrictEqual(e.llamar('obtenerPresupuestos').montos, {});
  assert.deepStrictEqual(e.llamar('presupuestosVigentes_', e.filas('Presupuestos'), '2026-10'), { [e.sup]: 650 });
});

test('valida antes de escribir: solo gasto, activa, existente y número positivo', () => {
  const e = entorno();
  const intentar = montos => () => e.llamar('guardarPresupuestos', { montos: montos });
  assert.throws(intentar({ [e.sup]: 100, [e.categoria('Sueldo')]: 50 }), /Solo las categorías de gasto/);
  assert.throws(intentar({ [e.sup]: '-5' }), /número positivo/);
  assert.throws(intentar({ [e.sup]: 'mucho' }), /número positivo/);
  assert.throws(intentar({ 'no-existe': 10 }), /no existe/);
  e.llamar('guardarCategoria', { id: e.bod, nombre: 'Bodega', emoji: '🏪', color: '#7c5cff', tipo: 'gasto', activa: false });
  assert.throws(intentar({ [e.sup]: 100, [e.bod]: 30 }), /desactivada/);
  assert.deepStrictEqual(e.filas('Presupuestos'), []);
});

test('obtenerDashboard incluye el presupuesto del mes elegido', () => {
  const e = entorno();
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: 100 } });
  e.gasto('2026-10-02', 85);
  const p = e.llamar('obtenerDashboard', '2026-10').presupuesto;
  assert.deepStrictEqual(p.filas.map(x => [x.categoria_id, x.porcentaje, x.estado]), [[e.sup, 85, 'alerta']]);
  assert.deepStrictEqual(e.llamar('obtenerDashboard', '2026-09').presupuesto.filas, []);
});
