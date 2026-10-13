const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

test('generarDatosDemo_ es determinista, cubre 3 meses y cada movimiento es válido', () => {
  const e = crearEntorno();
  const a = e.llamar('generarDatosDemo_', '2026-10-13');
  const b = e.llamar('generarDatosDemo_', '2026-10-13');
  assert.deepStrictEqual(a, b);
  const fechas = a.movimientos.map(m => m.fecha).sort();
  assert.strictEqual(fechas[0], '2026-08-01');
  assert.ok(fechas[fechas.length - 1] <= '2026-10-13');
  assert.strictEqual(a.movimientos.filter(m => m.tipo === 'ingreso').length, 3);
  assert.ok(a.movimientos.some(m => m.moneda === 'USD' && m.tc === 3.75));
  assert.ok(a.movimientos.some(m => m.tipo === 'transferencia'));
  assert.ok(a.movimientos.length > 60);
  const ctx = { cuentas: a.cuentas, categorias: a.categorias, tcUsd: 3.75 };
  a.movimientos.forEach(m => {
    const n = e.llamar('normalizarMovimiento_', m, ctx);
    assert.strictEqual(n.monto_pen, m.monto_pen, 'monto_pen de ' + m.id);
  });
});

test('cargarDemo crea una hoja aparte, activa el modo demo y no toca la hoja real', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('cargarDemo'), { instalado: true, modoDemo: true });
  assert.strictEqual(e.propiedades.MODO_DEMO, 'si');
  const idDemo = e.propiedades.DEMO_SHEET_ID;
  assert.ok(idDemo && idDemo !== 'libro-principal');
  assert.deepStrictEqual(Object.keys(e.hojas), []);
  const d = e.llamar('obtenerDashboard', '2026-10');
  assert.ok(d.resumen.gastos > 0);
  const total = e.libros[idDemo]._hojas.Movimientos.length;
  e.llamar('cargarDemo');
  assert.strictEqual(e.propiedades.DEMO_SHEET_ID, idDemo);
  assert.strictEqual(e.libros[idDemo]._hojas.Movimientos.length, total);
});

test('salirDemo vuelve a la hoja real', () => {
  const e = crearEntorno();
  e.llamar('cargarDemo');
  assert.deepStrictEqual(e.llamar('salirDemo'), { instalado: false, modoDemo: false });
  assert.strictEqual(e.interno('abrirLibro_'), e.principal);
});

test('cargarDemo recrea la hoja demo si fue borrada', () => {
  const e = crearEntorno({ propiedades: { DEMO_SHEET_ID: 'borrada' } });
  e.llamar('cargarDemo');
  assert.notStrictEqual(e.propiedades.DEMO_SHEET_ID, 'borrada');
  assert.strictEqual(e.llamar('estadoInstalacion').modoDemo, true);
});
