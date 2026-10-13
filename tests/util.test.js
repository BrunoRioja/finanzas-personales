const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

test('redondear2_ redondea a 2 decimales sin errores de coma flotante', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('redondear2_', 0.1 + 0.2), 0.3);
  assert.strictEqual(e.interno('redondear2_', 1.005), 1.01);
  assert.strictEqual(e.interno('redondear2_', '12.346'), 12.35);
  assert.ok(Number.isNaN(e.interno('redondear2_', 'abc')));
});

test('normalizarTexto_ quita tildes, pasa a mayúsculas y compacta espacios', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('normalizarTexto_', '  Tóttus   chiclayo '), 'TOTTUS CHICLAYO');
  assert.strictEqual(e.interno('normalizarTexto_', null), '');
});

test('esFechaIso_ valida formato y que el día exista', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('esFechaIso_', '2026-10-13'), true);
  assert.strictEqual(e.interno('esFechaIso_', '2028-02-29'), true);
  assert.strictEqual(e.interno('esFechaIso_', '2026-02-29'), false);
  assert.strictEqual(e.interno('esFechaIso_', '13/10/2026'), false);
  assert.strictEqual(e.interno('esFechaIso_', ''), false);
});

test('esFecha_ reconoce Date de cualquier contexto', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('esFecha_', new Date(2026, 9, 6)), true);
  assert.strictEqual(e.interno('esFecha_', '2026-10-06'), false);
  assert.strictEqual(e.interno('esFecha_', new Date('x')), false);
});

test('meses: mesDe_, sumarMeses_ y validarMes_', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('mesDe_', '2026-10-13'), '2026-10');
  assert.strictEqual(e.interno('sumarMeses_', '2026-01', -1), '2025-12');
  assert.strictEqual(e.interno('sumarMeses_', '2026-11', 2), '2027-01');
  assert.strictEqual(e.interno('validarMes_', '2026-10'), '2026-10');
  assert.throws(() => e.interno('validarMes_', '2026-13'), /Mes inválido/);
  assert.throws(() => e.interno('validarMes_', undefined), /Mes inválido/);
});

test('hoyIso_ usa la fecha actual y nuevoId_ genera ids distintos', () => {
  const e = crearEntorno({ ahora: '2026-10-13T23:30:00' });
  assert.strictEqual(e.interno('hoyIso_'), '2026-10-13');
  assert.notStrictEqual(e.interno('nuevoId_'), e.interno('nuevoId_'));
});
