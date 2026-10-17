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
  assert.strictEqual(a.movimientos.filter(m => m.tipo === 'ingreso').length, 4); // 3 sueldos + el abono recibido por Yape
  assert.ok(a.movimientos.some(m => m.moneda === 'USD' && m.tc === 3.75));
  assert.ok(a.movimientos.some(m => m.tipo === 'transferencia'));
  assert.ok(a.movimientos.length > 60);
  const ctx = { cuentas: a.cuentas, categorias: a.categorias, ambitos: a.ambitos, tcUsd: 3.75 };
  assert.deepStrictEqual(a.ambitos.map(x => x.nombre), ['Personal', 'Diversión', 'Familia', 'Trabajo']);
  ['demo-amb-diversion', 'demo-amb-familia', 'demo-amb-trabajo'].forEach(id =>
    assert.ok(a.movimientos.some(m => m.ambito_id === id), id));
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
  assert.strictEqual(d.proximosPagos.pagos.length, 5);
  assert.strictEqual(e.libros[idDemo]._hojas.Ambitos.length, 5);
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

test('el demo trae 6 presupuestos con alguna categoría en alerta y otra pasada', () => {
  const e = crearEntorno();
  const d = e.llamar('generarDatosDemo_', '2026-10-20');
  assert.strictEqual(d.presupuestos.length, 6);
  assert.ok(d.presupuestos.every(p => p.desde === '2026-08' && p.monto >= 50));
  const r = e.llamar('presupuestoVsReal_', e.llamar('lineasCategoria_', d.movimientos, []),
    e.llamar('presupuestosVigentes_', d.presupuestos, '2026-10'), d.categorias, '2026-10', '2026-10-20');
  const estados = r.filas.map(x => x.estado);
  assert.ok(estados.indexOf('alerta') >= 0 && estados.indexOf('pasado') >= 0, estados.join(', '));
  e.llamar('cargarDemo');
  assert.strictEqual(e.libros[e.propiedades.DEMO_SHEET_ID]._hojas.Presupuestos.length, 7);
});

test('la demo trae 4 pagos fijos válidos y un estado de cuenta con soles pagados y dólares pendientes', () => {
  const e = crearEntorno();
  const a = e.llamar('generarDatosDemo_', '2026-10-13');
  assert.strictEqual(a.recurrentes.length, 4);
  assert.ok(a.recurrentes.some(r => r.moneda === 'USD'));
  a.recurrentes.forEach(r => e.llamar('normalizarRecurrente_', r, a.cuentas, a.categorias));
  assert.strictEqual(a.estadosCuenta.length, 1);
  const t = e.llamar('estadoTarjeta_', a.estadosCuenta[0], a.estadosCuenta, a.movimientos);
  assert.strictEqual(t.pen.estado, 'pagado');
  assert.strictEqual(t.usd.estado, 'pendiente');
});

test('la demo trae préstamos con abono, yapeos por rol y un reembolso que no cuentan como gasto ni ingreso', () => {
  const e = crearEntorno();
  const hoy = '2026-10-13';
  const a = e.llamar('generarDatosDemo_', hoy);
  assert.strictEqual(a.prestamos.length, 2);
  const juan = a.prestamos.filter(p => p.persona === 'Juan Prueba')[0];
  const ana = a.prestamos.filter(p => p.persona === 'Ana Prueba')[0];
  assert.strictEqual(juan.monto, 200);
  assert.strictEqual(juan.fecha_promesa, '2026-10-18');
  assert.strictEqual(ana.monto, 80);
  assert.strictEqual(ana.fecha_promesa, '2026-10-10');
  assert.strictEqual(a.abonos.length, 1);
  assert.strictEqual(a.abonos[0].prestamo_id, juan.id);
  assert.strictEqual(a.abonos[0].monto, 50);
  const rolDeMov = id => {
    const m = a.movimientos.filter(x => x.id === id)[0];
    return { m, rol: a.categorias.filter(c => c.id === m.categoria_id)[0].rol };
  };
  [juan, ana].forEach(p => {
    const r = rolDeMov(p.movimiento_id);
    assert.strictEqual(r.rol, 'prestamo');
    assert.strictEqual(r.m.tipo, 'gasto');
    assert.strictEqual(r.m.monto, p.monto);
  });
  const rAbono = rolDeMov(a.abonos[0].movimiento_id);
  assert.strictEqual(rAbono.rol, 'reembolso');
  assert.strictEqual(rAbono.m.tipo, 'ingreso');
  assert.strictEqual(rAbono.m.monto, 50);
  const cena = a.movimientos.filter(m => m.monto < 0)[0];
  assert.strictEqual(cena.monto, -40);
  assert.strictEqual(cena.monto_pen, -40);
  assert.strictEqual(cena.tipo, 'gasto');
  assert.strictEqual(a.categorias.filter(c => c.id === cena.categoria_id)[0].nombre, 'Comida fuera');
  const lista = e.llamar('listaPrestamos_', a.prestamos, a.abonos, hoy);
  assert.strictEqual(lista.pendientes.length, 2);
  assert.strictEqual(lista.pendientes[0].persona, 'Ana Prueba');
  assert.ok(lista.pendientes[0].vencido);
  assert.strictEqual(lista.total, 230);
  const sinRoles = e.llamar('movimientosQueCuentan_', a.movimientos, a.categorias);
  assert.strictEqual(a.movimientos.length - sinRoles.length, 3);
});

test('cargarDemo escribe Prestamos y Abonos en la hoja demo', () => {
  const e = crearEntorno();
  e.llamar('cargarDemo');
  const libro = e.libros[e.propiedades.DEMO_SHEET_ID];
  assert.strictEqual(libro._hojas.Prestamos.length, 3);
  assert.strictEqual(libro._hojas.Abonos.length, 2);
});
