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

const AMBS = [
  { id: 'personal', nombre: 'Personal', emoji: '🙋', orden: 1, activo: true },
  { id: 'div', nombre: 'Diversión', emoji: '🎉', orden: 2, activo: true },
];

test('gastoPorAmbito_: sin ámbito suma en Personal, respeta divisiones y excluye ingresos y transferencias', () => {
  const e = crearEntorno();
  const dividido = M({ fecha: '2026-10-05', monto: 100, dividido: true });
  const movs = [
    M({ fecha: '2026-10-01', monto: 10, categoria_id: 'taxi' }),
    M({ fecha: '2026-10-02', monto: 30, categoria_id: 'taxi', ambito_id: 'div' }),
    M({ fecha: '2026-10-03', monto: 999, tipo: 'ingreso', categoria_id: 'sueldo', ambito_id: 'div' }),
    M({ fecha: '2026-10-04', monto: 500, tipo: 'transferencia', categoria_id: '' }),
    M({ fecha: '2026-09-30', monto: 77, ambito_id: 'div' }),
    dividido,
  ];
  const divisiones = [
    { movimiento_id: dividido.id, categoria_id: 'super', monto: 60, ambito_id: 'div' },
    { movimiento_id: dividido.id, categoria_id: 'aseo', monto: 40, ambito_id: '' },
  ];
  const lineas = e.llamar('lineasCategoria_', movs, divisiones);
  assert.deepStrictEqual(e.llamar('gastoPorAmbito_', lineas, AMBS, CATS, '2026-10'), [
    { ambito_id: 'div', nombre: 'Diversión', emoji: '🎉', monto: 90, porcentaje: 64, categorias: [
      { categoria_id: 'super', nombre: 'Supermercado', emoji: '🛒', monto: 60 },
      { categoria_id: 'taxi', nombre: 'Transporte', emoji: '🚕', monto: 30 },
    ] },
    { ambito_id: 'personal', nombre: 'Personal', emoji: '🙋', monto: 50, porcentaje: 36, categorias: [
      { categoria_id: 'aseo', nombre: 'Aseo personal', emoji: '🧴', monto: 40 },
      { categoria_id: 'taxi', nombre: 'Transporte', emoji: '🚕', monto: 10 },
    ] },
  ]);
});

test('gastoPorAmbito_: un ámbito borrado de la hoja cuenta como Personal; sin gastos devuelve []', () => {
  const e = crearEntorno();
  const lineas = e.llamar('lineasCategoria_', [M({ fecha: '2026-10-01', monto: 5, ambito_id: 'borrado' })], []);
  assert.deepStrictEqual(e.llamar('gastoPorAmbito_', lineas, AMBS, CATS, '2026-10').map(a => [a.ambito_id, a.monto]), [['personal', 5]]);
  assert.deepStrictEqual(e.llamar('gastoPorAmbito_', [], AMBS, CATS, '2026-10'), []);
});

test('obtenerDashboard incluye el gasto por ámbito', () => {
  const e = entornoInstalado();
  const div = e.llamar('obtenerCatalogos').ambitos.find(a => a.nombre === 'Diversión').id;
  e.llamar('guardarMovimiento', { tipo: 'gasto', fecha: '2026-10-10', monto: 25, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Transporte'), ambito_id: div });
  assert.deepStrictEqual(e.llamar('obtenerDashboard', '2026-10').ambitos.map(a => [a.nombre, a.monto]), [['Diversión', 25]]);
});

const CATS_ROL = CATS.concat([
  { id: 'prest', nombre: 'Préstamos', emoji: '🤝', color: '#999', tipo: 'gasto', activa: true, rol: 'prestamo' },
  { id: 'reemb', nombre: 'Reembolsos', emoji: '↩️', color: '#999', tipo: 'ingreso', activa: true, rol: 'reembolso' },
]);

test('movimientosQueCuentan_: saca préstamos y reembolsos; deja transferencias y gastos negativos', () => {
  const e = crearEntorno();
  const movs = [
    M({ fecha: '2026-10-02', monto: 200, categoria_id: 'prest' }),
    M({ fecha: '2026-10-03', tipo: 'ingreso', monto: 50, categoria_id: 'reemb' }),
    M({ fecha: '2026-10-04', monto: 100 }),
    M({ fecha: '2026-10-05', monto: -40 }),
    M({ fecha: '2026-10-06', tipo: 'transferencia', monto: 10, cuenta_destino_id: 'visa', categoria_id: '' }),
  ];
  const r = e.llamar('movimientosQueCuentan_', movs, CATS_ROL);
  assert.deepStrictEqual(r.map(m => m.id), [movs[2].id, movs[3].id, movs[4].id]);
  const inactivas = CATS_ROL.map(c => Object.assign({}, c, { activa: false }));
  assert.strictEqual(e.llamar('movimientosQueCuentan_', movs, inactivas).length, 5);
});

test('préstamo y devolución no cambian gastos, ingresos ni tendencia; sí los saldos', () => {
  const e = crearEntorno();
  const datos = {
    movs: [
      M({ fecha: '2026-10-02', monto: 200, categoria_id: 'prest' }),
      M({ fecha: '2026-10-03', tipo: 'ingreso', monto: 50, categoria_id: 'reemb' }),
      M({ fecha: '2026-10-04', monto: 100 }),
    ],
    divisiones: [], categorias: CATS_ROL,
    cuentas: [{ id: 'deb', nombre: 'Débito', banco: 'BCP', tipo: 'debito', moneda: 'PEN', saldo_inicial: 1000, activa: true }],
    tcUsd: 3.7,
  };
  const d = e.llamar('construirDashboard_', datos, '2026-10');
  assert.deepStrictEqual([d.resumen.gastos, d.resumen.ingresos], [100, 0]);
  assert.deepStrictEqual([d.tendencia[5].gastos, d.tendencia[5].ingresos], [100, 0]);
  assert.ok(!d.categorias.some(c => c.categoria_id === 'prest'));
  assert.strictEqual(d.saldos[0].saldo_pen, 1000 - 200 + 50 - 100);
});
