const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

const e = crearEntorno();

test('listaPrestamos_ calcula falta, vencidos primero y total', () => {
  const p = [
    { id: 'a', persona: 'Juan Prueba', monto: 200, fecha: '2026-10-01', fecha_promesa: '2026-10-20', estado: 'pendiente' },
    { id: 'b', persona: 'Ana Prueba', monto: 100, fecha: '2026-10-02', fecha_promesa: '2026-10-10', estado: 'pendiente' },
    { id: 'c', persona: 'Luis Prueba', monto: 50, fecha: '2026-09-01', fecha_promesa: '', estado: 'pagado' },
  ];
  const ab = [{ id: 'x', prestamo_id: 'a', fecha: '2026-10-05', monto: 50, movimiento_id: '' },
    { id: 'y', prestamo_id: 'c', fecha: '2026-09-03', monto: 50, movimiento_id: '' }];
  const r = e.interno('listaPrestamos_', p, ab, '2026-10-13');
  assert.deepStrictEqual(r.pendientes.map(x => [x.id, x.falta, x.vencido, x.dias]), [['b', 100, true, -3], ['a', 150, false, 7]]);
  assert.deepStrictEqual(r.pagados.map(x => x.id), ['c']);
  assert.strictEqual(r.total, 250);
  assert.strictEqual(r.pendientes[1].abonado, 50);
});

test('listaPrestamos_: sin fecha al final, pagados por último abono descendente', () => {
  const p = [
    { id: 'a', persona: 'A', monto: 10, fecha: '2026-10-01', fecha_promesa: '', estado: 'pendiente' },
    { id: 'b', persona: 'B', monto: 10, fecha: '2026-10-02', fecha_promesa: '2026-11-01', estado: 'pendiente' },
    { id: 'c', persona: 'C', monto: 10, fecha: '2026-09-01', fecha_promesa: '', estado: 'pagado' },
    { id: 'd', persona: 'D', monto: 10, fecha: '2026-09-01', fecha_promesa: '', estado: 'pagado' },
  ];
  const ab = [{ id: '1', prestamo_id: 'c', fecha: '2026-09-03', monto: 10 }, { id: '2', prestamo_id: 'd', fecha: '2026-09-09', monto: 10 }];
  const r = e.interno('listaPrestamos_', p, ab, '2026-10-13');
  assert.deepStrictEqual(r.pendientes.map(x => [x.id, x.dias]), [['b', 19], ['a', null]]);
  assert.strictEqual(r.pendientes[1].vencido, false);
  assert.deepStrictEqual(r.pagados.map(x => x.id), ['d', 'c']);
});

test('fechaPromesa_', () => {
  const f = (o, h) => e.interno('fechaPromesa_', o, h);
  assert.strictEqual(f('manana', '2026-10-31'), '2026-11-01');
  assert.strictEqual(f('semana', '2026-10-13'), '2026-10-18');
  assert.strictEqual(f('semana', '2026-10-18'), '2026-10-25');
  assert.strictEqual(f('quincena', '2026-10-13'), '2026-10-15');
  assert.strictEqual(f('quincena', '2026-10-15'), '2026-10-31');
  assert.strictEqual(f('mes', '2026-02-10'), '2026-02-28');
  assert.strictEqual(f('mes', '2026-10-31'), '2026-11-30');
  assert.strictEqual(f('sin', '2026-10-13'), '');
});

test('prestamosSugeridos_ pone primero a la misma persona aunque el correo la escriba distinto', () => {
  const pend = [
    { id: 'a', persona: 'Ana Prueba', fecha: '2026-10-05' },
    { id: 'b', persona: 'Juan Pérez', fecha: '2026-10-01' },
    { id: 'c', persona: 'Luis Prueba', fecha: '2026-10-09' },
  ];
  const r = e.interno('prestamosSugeridos_', pend, 'JUAN PEREZ G.', 3);
  assert.deepStrictEqual(r.map(x => x.id), ['b', 'c', 'a']);
  assert.deepStrictEqual(e.interno('prestamosSugeridos_', pend, 'JUAN PEREZ G.', 2).map(x => x.id), ['b', 'c']);
  assert.strictEqual(e.interno('mismaPersona_', 'Juan', 'JUAN PEREZ G.'), true);
  assert.strictEqual(e.interno('mismaPersona_', 'Ana Prueba', 'Juan Prueba'), false);
  assert.strictEqual(e.interno('mismaPersona_', 'J. Pérez', 'J Perez'), true);
});

test('normalizarPrestamo_ y normalizarAbono_ rechazan montos ≤ 0, fechas inválidas y persona vacía', () => {
  const n = d => e.interno('normalizarPrestamo_', d);
  const ok = { persona: '  Juan   Prueba ', monto: '10.456', fecha: '2026-10-13', fecha_promesa: '', nota: 'x' };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(n(ok))), { persona: 'Juan Prueba', monto: 10.46, fecha: '2026-10-13', fecha_promesa: '', nota: 'x' });
  assert.throws(() => n({ ...ok, persona: '   ' }));
  assert.throws(() => n({ ...ok, persona: 'x'.repeat(61) }));
  assert.throws(() => n({ ...ok, monto: 0 }));
  assert.throws(() => n({ ...ok, monto: -5 }));
  assert.throws(() => n({ ...ok, fecha: '2026-02-30' }));
  assert.throws(() => n({ ...ok, fecha_promesa: 'mañana' }));
  assert.throws(() => n({ ...ok, nota: 'x'.repeat(201) }));
  assert.strictEqual(n({ ...ok, fecha_promesa: '2026-11-01', nota: undefined }).nota, '');
  const a = d => e.interno('normalizarAbono_', d);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a({ fecha: '2026-10-13', monto: '5' }))), { fecha: '2026-10-13', monto: 5 });
  assert.throws(() => a({ fecha: '2026-10-13', monto: 0 }));
  assert.throws(() => a({ fecha: 'hoy', monto: 5 }));
});

test('estadoSegunAbonos_: abonar de más deja pagado', () => {
  const s = (m, ab) => e.interno('estadoSegunAbonos_', m, ab);
  assert.strictEqual(s(100, []), 'pendiente');
  assert.strictEqual(s(100, [{ monto: 60 }]), 'pendiente');
  assert.strictEqual(s(100, [{ monto: 60 }, { monto: 40 }]), 'pagado');
  assert.strictEqual(s(100, [{ monto: 150 }]), 'pagado');
});
