const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');

function entorno() {
  const e = entornoInstalado();
  e.sus = e.categoria('Suscripciones');
  e.deb = e.cuenta('Débito BCP');
  e.fijo = extra => Object.assign({ nombre: 'Streaming', monto: '20.90', moneda: 'PEN', dia_mes: '5', cuenta_id: e.deb, categoria_id: e.sus }, extra);
  return e;
}

test('guardarRecurrente crea, edita, activa y desactiva; eliminarRecurrente borra', () => {
  const e = entorno();
  let r = e.llamar('guardarRecurrente', e.fijo());
  assert.strictEqual(r.recurrentes.length, 1);
  const id = r.recurrentes[0].id;
  assert.deepStrictEqual(r.recurrentes[0], { id, nombre: 'Streaming', monto: 20.9, moneda: 'PEN', cuenta_id: e.deb, categoria_id: e.sus, dia_mes: 5, activo: true });
  e.llamar('guardarRecurrente', e.fijo({ nombre: 'Nube', monto: '2', moneda: 'USD', dia_mes: 20 }));
  assert.strictEqual(e.llamar('obtenerRecurrentes').totalMensual, 28.4);
  r = e.llamar('guardarRecurrente', e.fijo({ id, monto: '1,200', dia_mes: 31 }));
  const editado = r.recurrentes.find(x => x.id === id);
  assert.strictEqual(editado.monto, 1200);
  assert.strictEqual(editado.dia_mes, 31);
  r = e.llamar('guardarRecurrente', e.fijo({ id, activo: false }));
  assert.strictEqual(r.recurrentes.find(x => x.id === id).activo, false);
  assert.strictEqual(r.totalMensual, 7.5);
  r = e.llamar('eliminarRecurrente', id);
  assert.deepStrictEqual(r.recurrentes.map(x => x.nombre), ['Nube']);
  assert.throws(() => e.llamar('eliminarRecurrente', id), /ya no existe/);
  assert.throws(() => e.llamar('guardarRecurrente', e.fijo({ id })), /ya no existe/);
});

test('guardarRecurrente valida nombre, monto, moneda, día, cuenta y categoría sin escribir nada', () => {
  const e = entorno();
  const casos = [
    [{ nombre: '  ' }, /nombre/],
    [{ monto: '0' }, /mayor que 0/],
    [{ monto: 'abc' }, /mayor que 0/],
    [{ moneda: 'EUR' }, /moneda/],
    [{ dia_mes: '0' }, /del 1 al 31/],
    [{ dia_mes: '32' }, /del 1 al 31/],
    [{ dia_mes: '5.5' }, /del 1 al 31/],
    [{ dia_mes: '' }, /del 1 al 31/],
    [{ cuenta_id: 'no-existe' }, /La cuenta no existe/],
    [{ categoria_id: '' }, /Elige una categoría/],
    [{ categoria_id: e.categoria('Sueldo') }, /de gasto/],
  ];
  casos.forEach(([cambio, error]) => assert.throws(() => e.llamar('guardarRecurrente', e.fijo(cambio)), error, JSON.stringify(cambio)));
  assert.deepStrictEqual(e.filas('Recurrentes'), []);
});

test('una cuenta desactivada no sirve para un pago nuevo, pero sí al editar uno que ya la usaba', () => {
  const e = entorno();
  const id = e.llamar('guardarRecurrente', e.fijo()).recurrentes[0].id;
  e.interno('actualizarFila_', 'Cuentas', e.deb, { activa: false });
  assert.throws(() => e.llamar('guardarRecurrente', e.fijo()), /desactivada/);
  const r = e.llamar('guardarRecurrente', e.fijo({ id, monto: '25' }));
  assert.strictEqual(r.recurrentes[0].monto, 25);
  assert.ok(!r.cuentas.some(c => c.id === e.deb), 'la lista para elegir solo trae cuentas activas');
});

test('obtenerDashboard trae los próximos pagos solo para el mes actual', () => {
  const e = entorno();
  e.llamar('guardarRecurrente', e.fijo({ dia_mes: '20' }));
  const d = e.llamar('obtenerDashboard', '2026-10');
  assert.deepStrictEqual(d.proximosPagos.pagos.map(p => [p.nombre, p.fecha, p.dias]), [['Streaming', '2026-10-20', 7]]);
  assert.strictEqual(d.proximosPagos.porPagar, 20.9);
  assert.strictEqual(e.llamar('obtenerDashboard', '2026-09').proximosPagos, null);
});
