const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { entornoInstalado } = require('./fixtures');

const AMB = [
  { id: 'personal', nombre: 'Personal', emoji: '🙋', orden: 1, activo: true },
  { id: 'div', nombre: 'Diversión', emoji: '🎉', orden: 2, activo: true },
  { id: 'viejo', nombre: 'Viejo', emoji: '', orden: 3, activo: false },
];

test('ambitoEfectivo_: vacío, personal o inexistente → personal', () => {
  const e = crearEntorno();
  assert.strictEqual(e.llamar('ambitoEfectivo_', '', AMB), 'personal');
  assert.strictEqual(e.llamar('ambitoEfectivo_', 'personal', AMB), 'personal');
  assert.strictEqual(e.llamar('ambitoEfectivo_', 'borrado', AMB), 'personal');
  assert.strictEqual(e.llamar('ambitoEfectivo_', 'div', AMB), 'div');
  assert.strictEqual(e.llamar('ambitoEfectivo_', 'div', undefined), 'personal');
});

test('ambitoParaGuardar_: Personal y no-gastos se guardan vacíos; valida existencia y activo', () => {
  const e = crearEntorno();
  const g = (...a) => e.llamar('ambitoParaGuardar_', ...a);
  assert.strictEqual(g('gasto', 'div', AMB), 'div');
  assert.strictEqual(g('gasto', 'personal', AMB), '');
  assert.strictEqual(g('gasto', '', AMB), '');
  assert.strictEqual(g('ingreso', 'div', AMB), '');
  assert.strictEqual(g('transferencia', 'div', AMB), '');
  assert.throws(() => g('gasto', 'nada', AMB), /Ámbito inválido\./);
  assert.throws(() => g('gasto', 'viejo', AMB), /El ámbito "Viejo" está desactivado\./);
  assert.strictEqual(g('gasto', 'viejo', AMB, ['viejo']), 'viejo');
});

test('ambitosDeMovimiento_: efectivo del movimiento, de sus partes, o nada si no es gasto', () => {
  const e = crearEntorno();
  const f = (...a) => e.llamar('ambitosDeMovimiento_', ...a);
  assert.deepStrictEqual(f({ tipo: 'gasto', ambito_id: '' }, null, AMB), ['personal']);
  assert.deepStrictEqual(f({ tipo: 'gasto', ambito_id: 'div' }, null, AMB), ['div']);
  assert.deepStrictEqual(f({ tipo: 'ingreso', ambito_id: '' }, null, AMB), []);
  const partes = [{ ambito_id: 'div' }, { ambito_id: '' }, { ambito_id: 'div' }];
  assert.deepStrictEqual(f({ tipo: 'gasto', ambito_id: 'div', dividido: true }, partes, AMB), ['div', 'personal']);
});

test('normalizarAmbito_: nombre obligatorio y único, nuevo al final, Personal siempre activo', () => {
  const e = crearEntorno();
  const n = (...a) => e.llamar('normalizarAmbito_', ...a);
  assert.deepStrictEqual(n({ nombre: ' Pareja ', emoji: '💑' }, AMB, ''), { nombre: 'Pareja', emoji: '💑', orden: 4, activo: true });
  assert.throws(() => n({ nombre: '' }, AMB, ''), /El ámbito necesita un nombre\./);
  assert.throws(() => n({ nombre: 'diversion' }, AMB, ''), /Ya existe el ámbito "diversion"\./);
  assert.deepStrictEqual(n({ nombre: 'Diversión', emoji: '🥳', activo: false }, AMB, 'div'), { nombre: 'Diversión', emoji: '🥳', orden: 2, activo: false });
  assert.strictEqual(n({ nombre: 'Yo', activo: false }, AMB, 'personal').activo, true);
});

test('la instalación crea los 4 ámbitos y guardarAmbito agrega, edita y no desactiva Personal', () => {
  const e = entornoInstalado();
  const amb = () => e.llamar('obtenerCatalogos').ambitos;
  assert.deepStrictEqual(amb().map(a => [a.nombre, a.emoji, a.orden, a.activo]), [
    ['Personal', '🙋', 1, true], ['Diversión', '🎉', 2, true], ['Familia', '👨‍👩‍👧', 3, true], ['Trabajo', '💼', 4, true],
  ]);
  assert.strictEqual(amb()[0].id, 'personal');
  const nuevo = e.llamar('guardarAmbito', { nombre: 'Pareja', emoji: '💑' });
  assert.strictEqual(nuevo.orden, 5);
  e.llamar('guardarAmbito', { id: 'personal', nombre: 'Yo', emoji: '🙂', activo: false });
  const personal = amb().find(a => a.id === 'personal');
  assert.deepStrictEqual([personal.nombre, personal.activo], ['Yo', true]);
  assert.throws(() => e.llamar('guardarAmbito', { id: 'no-existe', nombre: 'X' }), /El ámbito ya no existe\./);
  assert.throws(() => e.llamar('guardarAmbito', { nombre: 'familia' }), /Ya existe el ámbito/);
});

test('asegurarAmbitos_ repone Personal si alguien lo borró de la hoja', () => {
  const e = entornoInstalado();
  e.interno('eliminarFila_', 'Ambitos', 'personal');
  e.interno('asegurarAmbitos_');
  e.interno('asegurarAmbitos_');
  assert.strictEqual(e.filas('Ambitos').filter(a => a.id === 'personal').length, 1);
  assert.strictEqual(e.filas('Ambitos').length, 4);
});
