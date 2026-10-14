const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

test('autorizarPermisos pide de una vez todos los permisos del manifiesto', () => {
  const e = crearEntorno();
  assert.strictEqual(e.llamar('autorizarPermisos'), 'Permisos concedidos. Ya puedes volver a la app.');
  assert.deepStrictEqual(e.permisosPedidos, ['FULL']);
});
