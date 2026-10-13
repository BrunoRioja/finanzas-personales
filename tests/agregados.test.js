const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { entornoInstalado } = require('./fixtures');

let n = 0;
function M(o) {
  const tc = o.tc || 1;
  return Object.assign({
    id: 'm' + (++n), tipo: 'gasto', moneda: 'PEN', tc: tc, cuenta_id: 'deb', cuenta_destino_id: '',
    categoria_id: 'super', comercio: '', estado: 'confirmado', dividido: false,
  }, o, { monto_pen: Math.round(o.monto * tc * 100) / 100 });
}
const CATS = [
  { id: 'super', nombre: 'Supermercado', emoji: '🛒', color: '#3ddc97', tipo: 'gasto' },
  { id: 'taxi', nombre: 'Transporte', emoji: '🚕', color: '#7c5cff', tipo: 'gasto' },
  { id: 'aseo', nombre: 'Aseo personal', emoji: '🧴', color: '#4cc9f0', tipo: 'gasto' },
  { id: 'sueldo', nombre: 'Sueldo', emoji: '💼', color: '#3ddc97', tipo: 'ingreso' },
];

test('resumenMes_: ignora transferencias, resta reembolsos y calcula la tasa de ahorro', () => {
  const e = crearEntorno();
  const movs = [
    M({ fecha: '2026-10-01', tipo: 'ingreso', monto: 3000, categoria_id: 'sueldo' }),
    M({ fecha: '2026-10-02', monto: 100 }),
    M({ fecha: '2026-10-03', monto: 50 }),
    M({ fecha: '2026-10-04', monto: -20 }),
    M({ fecha: '2026-10-05', tipo: 'transferencia', monto: 500, cuenta_destino_id: 'visa', categoria_id: '' }),
    M({ fecha: '2026-09-30', monto: 999 }),
  ];
  assert.deepStrictEqual(e.llamar('resumenMes_', movs, '2026-10'), { ingresos: 3000, gastos: 130, ahorro: 2870, tasaAhorro: 96 });
});

test('resumenMes_ sin ingresos: tasa null (nunca NaN ni Infinity)', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('resumenMes_', [M({ fecha: '2026-10-02', monto: 40 })], '2026-10'), { ingresos: 0, gastos: 40, ahorro: -40, tasaAhorro: null });
  assert.deepStrictEqual(e.llamar('resumenMes_', [], '2026-10'), { ingresos: 0, gastos: 0, ahorro: 0, tasaAhorro: null });
});

test('gastoPorCategoria_: suma por categoría, usa divisiones, porcentajes y orden', () => {
  const e = crearEntorno();
  const dividido = M({ id: 'mx', fecha: '2026-10-06', monto: 10, moneda: 'USD', tc: 4, dividido: true });
  const movs = [
    M({ fecha: '2026-10-02', monto: 60 }),
    M({ fecha: '2026-10-03', monto: 20, categoria_id: 'taxi' }),
    M({ fecha: '2026-10-04', monto: 10, categoria_id: 'borrada' }),
    M({ fecha: '2026-10-05', monto: -10, categoria_id: 'aseo' }), // reembolso: deja Aseo en 0
    M({ fecha: '2026-10-01', tipo: 'ingreso', monto: 1000, categoria_id: 'sueldo' }),
    dividido,
  ];
  const divisiones = [
    { id: 'd1', movimiento_id: 'mx', categoria_id: 'super', monto: 7.5 },
    { id: 'd2', movimiento_id: 'mx', categoria_id: 'aseo', monto: 2.5 },
  ];
  const lineas = e.interno('lineasCategoria_', movs, divisiones);
  assert.deepStrictEqual(e.llamar('gastoPorCategoria_', lineas, CATS, '2026-10'), [
    { categoria_id: 'super', nombre: 'Supermercado', emoji: '🛒', color: '#3ddc97', monto: 90, porcentaje: 75 },
    { categoria_id: 'taxi', nombre: 'Transporte', emoji: '🚕', color: '#7c5cff', monto: 20, porcentaje: 17 },
    { categoria_id: 'borrada', nombre: 'Sin categoría', emoji: '❓', color: '#3a3a48', monto: 10, porcentaje: 8 },
  ]);
});

test('agruparCategorias_: deja hasta n+1 tal cual; si hay más agrupa en Resto', () => {
  const e = crearEntorno();
  const lista = [7, 6, 5, 4, 3, 2, 1].map((m, i) => ({ categoria_id: 'c' + i, nombre: 'C' + i, emoji: '', color: '#000000', monto: m, porcentaje: m }));
  assert.strictEqual(e.llamar('agruparCategorias_', lista.slice(0, 6), 5).length, 6);
  const agrupada = e.llamar('agruparCategorias_', lista, 5);
  assert.strictEqual(agrupada.length, 6);
  assert.deepStrictEqual(agrupada[5], { categoria_id: '_resto', nombre: 'Resto', emoji: '•', color: '#3a3a48', monto: 3, porcentaje: 3 });
});

test('tendencia_: n meses terminando en el mes pedido, incluso vacíos', () => {
  const e = crearEntorno();
  const movs = [
    M({ fecha: '2026-10-01', tipo: 'ingreso', monto: 100, categoria_id: 'sueldo' }),
    M({ fecha: '2026-08-15', monto: 30 }),
  ];
  assert.deepStrictEqual(e.llamar('tendencia_', movs, '2026-10', 3), [
    { mes: '2026-08', ingresos: 0, gastos: 30 },
    { mes: '2026-09', ingresos: 0, gastos: 0 },
    { mes: '2026-10', ingresos: 100, gastos: 0 },
  ]);
});

test('saldosPorCuenta_: saldo inicial ± movimientos, tarjeta en negativo, USD convertido, solo activas', () => {
  const e = crearEntorno();
  const cuentas = [
    { id: 'deb', nombre: 'Débito', banco: 'BCP', tipo: 'debito', moneda: 'PEN', saldo_inicial: 1000, activa: true },
    { id: 'visa', nombre: 'VISA', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -200, activa: true },
    { id: 'usd', nombre: 'Ahorro $', banco: 'BCP', tipo: 'ahorro', moneda: 'USD', saldo_inicial: 100, activa: true },
    { id: 'vieja', nombre: 'Vieja', banco: 'Otro', tipo: 'debito', moneda: 'PEN', saldo_inicial: 5, activa: false },
  ];
  const movs = [
    M({ fecha: '2026-10-01', tipo: 'ingreso', monto: 500, categoria_id: 'sueldo' }),
    M({ fecha: '2026-10-02', monto: 50 }),
    M({ fecha: '2026-10-03', monto: 80, cuenta_id: 'visa' }),
    M({ fecha: '2026-10-04', tipo: 'transferencia', monto: 200, cuenta_destino_id: 'visa', categoria_id: '' }),
  ];
  assert.deepStrictEqual(e.llamar('saldosPorCuenta_', movs, cuentas, 3.75), [
    { id: 'deb', nombre: 'Débito', banco: 'BCP', tipo: 'debito', saldo_pen: 1250 },
    { id: 'visa', nombre: 'VISA', banco: 'BCP', tipo: 'credito', saldo_pen: -80 },
    { id: 'usd', nombre: 'Ahorro $', banco: 'BCP', tipo: 'ahorro', saldo_pen: 375 },
  ]);
});

test('topComercios_: agrupa nombres equivalentes, solo gastos del mes, top n', () => {
  const e = crearEntorno();
  const movs = [
    M({ fecha: '2026-10-02', monto: 50, comercio: 'Tottus' }),
    M({ fecha: '2026-10-09', monto: 40, comercio: 'TOTTUS ' }),
    M({ fecha: '2026-10-03', monto: 12, comercio: 'Taxi' }),
    M({ fecha: '2026-10-04', monto: 70, comercio: 'Zara' }),
    M({ fecha: '2026-10-05', monto: 5, comercio: '' }),
    M({ fecha: '2026-09-05', monto: 500, comercio: 'Tottus' }),
    M({ fecha: '2026-10-01', tipo: 'ingreso', monto: 900, comercio: 'Empresa', categoria_id: 'sueldo' }),
  ];
  assert.deepStrictEqual(e.llamar('topComercios_', movs, '2026-10', 2), [
    { comercio: 'Tottus', monto: 90, veces: 2 },
    { comercio: 'Zara', monto: 70, veces: 1 },
  ]);
});

test('obtenerDashboard y obtenerCatalogos.saldos desde la hoja', () => {
  const e = entornoInstalado();
  const deb = e.cuenta('Débito BCP');
  e.llamar('guardarMovimiento', { fecha: '2026-10-01', tipo: 'ingreso', monto: 2000, cuenta_id: deb, categoria_id: e.categoria('Sueldo') });
  e.llamar('guardarMovimiento', { fecha: '2026-10-06', tipo: 'gasto', monto: 89.3, cuenta_id: deb, categoria_id: e.categoria('Supermercado'), comercio: 'Tottus' });
  const d = e.llamar('obtenerDashboard', '2026-10');
  assert.strictEqual(d.mes, '2026-10');
  assert.deepStrictEqual(d.resumen, { ingresos: 2000, gastos: 89.3, ahorro: 1910.7, tasaAhorro: 96 });
  assert.deepStrictEqual(d.resumenAnterior, { ingresos: 0, gastos: 0, ahorro: 0, tasaAhorro: null });
  assert.strictEqual(d.categorias[0].nombre, 'Supermercado');
  assert.strictEqual(d.tendencia.length, 6);
  assert.deepStrictEqual(d.comercios, [{ comercio: 'Tottus', monto: 89.3, veces: 1 }]);
  assert.deepStrictEqual(d.saldos.map(s => s.saldo_pen), [2910.7, -200]);
  assert.deepStrictEqual(e.llamar('obtenerCatalogos').saldos, d.saldos);
  assert.throws(() => e.interno('obtenerDashboard', '2026-1'), /Mes inválido/);
});
