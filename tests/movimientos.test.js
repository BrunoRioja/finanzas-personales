const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { entornoInstalado } = require('./fixtures');

const CTX = {
  cuentas: [
    { id: 'deb', nombre: 'Débito', moneda: 'PEN', activa: true },
    { id: 'visa', nombre: 'VISA', moneda: 'PEN', activa: true },
    { id: 'usd', nombre: 'Ahorro $', moneda: 'USD', activa: true },
    { id: 'vieja', nombre: 'Vieja', moneda: 'PEN', activa: false },
  ],
  categorias: [
    { id: 'super', nombre: 'Supermercado', tipo: 'gasto', activa: true },
    { id: 'sueldo', nombre: 'Sueldo', tipo: 'ingreso', activa: true },
    { id: 'antigua', nombre: 'Antigua', tipo: 'gasto', activa: false },
  ],
  tcUsd: 3.75,
};
const BASE = { fecha: '2026-10-06', tipo: 'gasto', monto: 89.3, cuenta_id: 'deb', categoria_id: 'super', comercio: ' Tottus ' };
const norm = (e, cambios, ctx) => e.llamar('normalizarMovimiento_', Object.assign({}, BASE, cambios), Object.assign({}, CTX, ctx));

test('gasto válido en soles', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(norm(e, {}), {
    fecha: '2026-10-06', tipo: 'gasto', monto: 89.3, moneda: 'PEN', tc: 1, monto_pen: 89.3,
    cuenta_id: 'deb', cuenta_destino_id: '', categoria_id: 'super', comercio: 'Tottus', descripcion: '',
    origen: 'manual', estado: 'confirmado', ref_externa: '', dividido: false,
  });
});

test('moneda: toma la de la cuenta, convierte USD con el tc configurado o el del movimiento', () => {
  const e = crearEntorno();
  const usd = norm(e, { moneda: 'USD', monto: 23.6 });
  assert.strictEqual(usd.tc, 3.75);
  assert.strictEqual(usd.monto_pen, 88.5);
  assert.strictEqual(norm(e, { moneda: 'USD', monto: 105.52, tc: 3.477 }).monto_pen, 366.89);
  assert.strictEqual(norm(e, { cuenta_id: 'usd' }).moneda, 'USD');
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { moneda: 'EUR' }), CTX), /Moneda/);
});

test('gasto en USD sin tipo de cambio configurado da un error claro (nunca NaN)', () => {
  const e = crearEntorno();
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { moneda: 'USD' }), Object.assign({}, CTX, { tcUsd: 0 })), /tipo de cambio/);
});

test('transferencia: exige destino distinto y no lleva categoría', () => {
  const e = crearEntorno();
  const t = norm(e, { tipo: 'transferencia', cuenta_destino_id: 'visa', monto: 600 });
  assert.strictEqual(t.cuenta_destino_id, 'visa');
  assert.strictEqual(t.categoria_id, '');
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { tipo: 'transferencia', cuenta_destino_id: 'deb' }), CTX), /distinta/);
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { tipo: 'transferencia', cuenta_destino_id: '' }), CTX), /destino no existe/);
});

test('categoría debe existir, estar activa y ser del mismo tipo', () => {
  const e = crearEntorno();
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { categoria_id: 'sueldo' }), CTX), /no es de gasto/);
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { categoria_id: 'nada' }), CTX), /categoría no existe/);
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { categoria_id: 'antigua' }), CTX), /desactivada/);
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { cuenta_id: 'vieja' }), CTX), /desactivada/);
  // Al editar, una cuenta o categoría ya usada por el movimiento se permite aunque esté desactivada.
  assert.strictEqual(norm(e, { categoria_id: 'antigua', cuenta_id: 'vieja' }, { idsPrevios: ['vieja', 'antigua'] }).categoria_id, 'antigua');
});

test('monto y fecha', () => {
  const e = crearEntorno();
  const falla = (cambios, patron) => assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, cambios), CTX), patron);
  falla({ monto: 0 }, /distinto de cero/);
  falla({ monto: 'abc' }, /distinto de cero/);
  falla({ tipo: 'ingreso', categoria_id: 'sueldo', monto: -5 }, /negativo/);
  falla({ fecha: '2026-13-01' }, /fecha/);
  falla({ tipo: 'prestamo' }, /Tipo de movimiento/);
  assert.strictEqual(norm(e, { monto: -20 }).monto_pen, -20); // reembolso de un gasto
  assert.strictEqual(norm(e, { monto: '12.346' }).monto, 12.35);
});

test('guardarMovimiento crea con id y creado_en y listarMovimientos lo devuelve', () => {
  const e = entornoInstalado();
  const deb = e.cuenta('Débito BCP');
  const sup = e.categoria('Supermercado');
  const locks = e.stats.locks;
  const m = e.llamar('guardarMovimiento', { fecha: '2026-10-06', tipo: 'gasto', monto: 89.3, cuenta_id: deb, categoria_id: sup, comercio: 'Tottus' });
  assert.ok(m.id);
  assert.strictEqual(m.creado_en, '2026-10-13 10:00:00');
  assert.strictEqual(e.stats.locks, locks + 1);
  assert.deepStrictEqual(e.llamar('listarMovimientos', { mes: '2026-10' }), [m]);
  assert.deepStrictEqual(e.llamar('listarMovimientos', { mes: '2026-09' }), []);
});

test('listarMovimientos filtra por cuenta (origen o destino) y categoría, y ordena por fecha y creación', () => {
  const e = entornoInstalado();
  const deb = e.cuenta('Débito BCP');
  const visa = e.cuenta('VISA BCP');
  const sup = e.categoria('Supermercado');
  const taxi = e.categoria('Transporte');
  const g = d => e.llamar('guardarMovimiento', Object.assign({ tipo: 'gasto', monto: 10, cuenta_id: deb, categoria_id: sup }, d));
  const a = g({ fecha: '2026-10-02' });
  e.fijarAhora('2026-10-13T11:00:00');
  const b = g({ fecha: '2026-10-05', categoria_id: taxi });
  e.fijarAhora('2026-10-13T12:00:00');
  const c = g({ fecha: '2026-10-05', cuenta_id: visa });
  const t = e.llamar('guardarMovimiento', { fecha: '2026-10-01', tipo: 'transferencia', monto: 50, cuenta_id: deb, cuenta_destino_id: visa });
  assert.deepStrictEqual(e.llamar('listarMovimientos', { mes: '2026-10' }).map(m => m.id), [c.id, b.id, a.id, t.id]);
  assert.deepStrictEqual(e.llamar('listarMovimientos', { mes: '2026-10', cuenta_id: visa }).map(m => m.id), [c.id, t.id]);
  assert.deepStrictEqual(e.llamar('listarMovimientos', { mes: '2026-10', categoria_id: taxi }).map(m => m.id), [b.id]);
  assert.throws(() => e.interno('listarMovimientos', { mes: 'octubre' }), /Mes inválido/);
});

test('editar conserva id, creado_en y origen; eliminar borra', () => {
  const e = entornoInstalado();
  const deb = e.cuenta('Débito BCP');
  const sup = e.categoria('Supermercado');
  const m = e.llamar('guardarMovimiento', { fecha: '2026-10-06', tipo: 'gasto', monto: 10, cuenta_id: deb, categoria_id: sup });
  e.fijarAhora('2026-10-14T09:00:00');
  const editado = e.llamar('guardarMovimiento', Object.assign({}, m, { monto: 12, origen: 'gmail' }));
  assert.strictEqual(editado.id, m.id);
  assert.strictEqual(editado.creado_en, m.creado_en);
  assert.strictEqual(editado.origen, 'manual');
  assert.strictEqual(e.filas('Movimientos')[0].monto, 12);
  assert.throws(() => e.interno('guardarMovimiento', Object.assign({}, m, { id: 'nada' })), /ya no existe/);
  assert.deepStrictEqual(e.llamar('eliminarMovimiento', m.id), { ok: true });
  assert.deepStrictEqual(e.filas('Movimientos'), []);
  assert.throws(() => e.interno('eliminarMovimiento', m.id), /No existe/);
});

test('un movimiento dividido no se edita desde el formulario normal', () => {
  const e = entornoInstalado();
  const m = e.llamar('guardarMovimiento', { fecha: '2026-10-06', tipo: 'gasto', monto: 10, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Supermercado') });
  e.interno('actualizarFila_', 'Movimientos', m.id, { dividido: true });
  assert.throws(() => e.interno('guardarMovimiento', Object.assign({}, m, { monto: 20 })), /dividido/);
});

test('editar un gasto en USD conserva su tipo de cambio aunque cambie el de Ajustes', () => {
  const e = entornoInstalado();
  const m = e.llamar('guardarMovimiento', { fecha: '2026-10-09', tipo: 'gasto', monto: 9.99, moneda: 'USD', cuenta_id: e.cuenta('VISA BCP'), categoria_id: e.categoria('Suscripciones'), comercio: 'Netflix' });
  assert.strictEqual(m.monto_pen, 37.46);
  e.llamar('guardarAjustes', { nombre: 'Ana', ultimo_tc: 3.8 });
  // Lo que envía el formulario: sin tc.
  const formulario = Object.assign({}, m, { descripcion: 'plan básico' });
  delete formulario.tc;
  delete formulario.monto_pen;
  const editado = e.llamar('guardarMovimiento', formulario);
  assert.strictEqual(editado.tc, 3.75);
  assert.strictEqual(editado.monto_pen, 37.46);
  const aSoles = e.llamar('guardarMovimiento', Object.assign({}, editado, { moneda: 'PEN', monto: 40 }));
  assert.strictEqual(aSoles.tc, 1);
});
