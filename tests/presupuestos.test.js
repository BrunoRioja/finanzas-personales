const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

const e = crearEntorno();
const f = (nombre, ...args) => e.llamar(nombre, ...args);

const CATS = [
  { id: 'super', nombre: 'Supermercado', emoji: '🛒', color: '#3ddc97', tipo: 'gasto', activa: true },
  { id: 'comida', nombre: 'Comida fuera', emoji: '🍽️', color: '#ffb347', tipo: 'gasto', activa: true },
  { id: 'ropa', nombre: 'Ropa', emoji: '👕', color: '#7c5cff', tipo: 'gasto', activa: false },
  { id: 'bodega', nombre: 'Bodega', emoji: '🏪', color: '#ff6b6b', tipo: 'gasto', activa: true },
];
const linea = (fecha, categoria_id, monto_pen, tipo) => ({ fecha, tipo: tipo || 'gasto', categoria_id, monto_pen });

test('presupuestosVigentes_: la fila más reciente que no sea posterior al mes; 0 quita el presupuesto', () => {
  const filas = [
    { id: '1', categoria_id: 'super', monto: 500, desde: '2026-08' },
    { id: '2', categoria_id: 'super', monto: 600, desde: '2026-10' },
    { id: '3', categoria_id: 'comida', monto: 300, desde: '2026-09' },
    { id: '4', categoria_id: 'comida', monto: 0, desde: '2026-11' },
    { id: '5', categoria_id: 'bodega', monto: 80, desde: '2026-12' },
  ];
  assert.deepStrictEqual(f('presupuestosVigentes_', filas, '2026-07'), {});
  assert.deepStrictEqual(f('presupuestosVigentes_', filas, '2026-09'), { super: 500, comida: 300 });
  assert.deepStrictEqual(f('presupuestosVigentes_', filas, '2026-10'), { super: 600, comida: 300 });
  assert.deepStrictEqual(f('presupuestosVigentes_', filas, '2026-11'), { super: 600 });
  assert.deepStrictEqual(f('presupuestosVigentes_', filas, '2027-01'), { super: 600, bodega: 80 });
});

test('presupuestoVsReal_: gastado del mes con reembolsos, estados, orden, total y sin presupuesto', () => {
  const lineas = [
    linea('2026-10-02', 'super', 300), linea('2026-10-05', 'super', 180.5),
    linea('2026-10-03', 'comida', 310), linea('2026-10-09', 'comida', -10),
    linea('2026-10-04', 'bodega', 39.5),
    linea('2026-10-06', 'ropa', 120),
    linea('2026-10-07', '', 45),
    linea('2026-09-30', 'super', 999),
    linea('2026-10-01', 'sueldo', 3500, 'ingreso'),
  ];
  const r = f('presupuestoVsReal_', lineas, { super: 600, comida: 300, bodega: 50 }, CATS, '2026-10', '2026-10-15');
  assert.deepStrictEqual(r.filas.map(x => [x.categoria_id, x.gastado, x.porcentaje, x.queda, x.estado]), [
    ['comida', 300, 100, 0, 'pasado'], ['super', 480.5, 80, 119.5, 'alerta'], ['bodega', 39.5, 79, 10.5, 'ok'],
  ]);
  assert.deepStrictEqual(r.total, { presupuesto: 950, gastado: 820 });
  assert.strictEqual(r.sinPresupuesto, 165);
  assert.deepStrictEqual([r.filas[0].nombre, r.filas[0].emoji, r.filas[0].color, r.filas[0].ritmo], ['Comida fuera', '🍽️', '#ffb347', 48]);
});

test('una categoría desactivada o borrada con presupuesto se sigue mostrando', () => {
  const r = f('presupuestoVsReal_', [linea('2026-10-02', 'ropa', 50)], { ropa: 100, borrada: 40 }, CATS, '2026-10', '2026-10-15');
  assert.deepStrictEqual(r.filas.map(x => [x.nombre, x.porcentaje, x.estado]), [['Ropa', 50, 'ok'], ['Sin categoría', 0, 'ok']]);
});

test('ritmo: proporción del mes transcurrido; 100 en meses pasados y 0 en futuros', () => {
  const ritmo = (mes, hoy) => f('presupuestoVsReal_', [], { super: 100 }, CATS, mes, hoy).filas[0].ritmo;
  assert.strictEqual(ritmo('2026-10', '2026-10-31'), 100);
  assert.strictEqual(ritmo('2026-10', '2026-10-01'), 3);
  assert.strictEqual(ritmo('2026-02', '2026-02-14'), 50);
  assert.strictEqual(ritmo('2026-09', '2026-10-15'), 100);
  assert.strictEqual(ritmo('2026-11', '2026-10-15'), 0);
  assert.strictEqual(f('diasDelMes_', '2028-02'), 29);
});

test('umbralPresupuesto_: 0, 80 o 100', () => {
  assert.deepStrictEqual([0, 79, 80, 99, 100, 140].map(p => f('umbralPresupuesto_', p)), [0, 0, 80, 80, 100, 100]);
});

test('referenciaPresupuesto_: mes pasado y promedio de los 3 anteriores (los meses sin gasto cuentan 0)', () => {
  const lineas = [
    linea('2026-09-10', 'super', 300), linea('2026-09-20', 'super', 100),
    linea('2026-08-10', 'super', 200), linea('2026-07-05', 'super', 300),
    linea('2026-08-15', 'comida', 90), linea('2026-06-01', 'comida', 500),
    linea('2026-10-01', 'super', 999), linea('2026-09-01', 'sueldo', 3000, 'ingreso'), linea('2026-09-02', '', 40),
  ];
  assert.deepStrictEqual(f('referenciaPresupuesto_', lineas, '2026-10'), {
    super: { mesPasado: 400, promedio3: 300 }, comida: { mesPasado: 0, promedio3: 30 },
  });
});
