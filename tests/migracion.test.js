const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { ASISTENTE, entornoInstalado } = require('./fixtures');

function hojaV1() {
  return crearEntorno({
    hojas: {
      Config: [['clave', 'valor'], ['instalado', 'si'], ['version_esquema', '1'], ['nombre', 'Ana']],
      Cuentas: [['id', 'nombre', 'banco', 'tipo', 'moneda', 'saldo_inicial', 'ultimos4', 'activa'], ['c1', 'Débito', 'BCP', 'debito', 'PEN', 100, '0042', true]],
    },
  });
}

test('estadoInstalacion migra una hoja v1 a v2 sin perder datos', () => {
  const e = hojaV1();
  assert.deepStrictEqual(e.llamar('estadoInstalacion'), { instalado: true, modoDemo: false });
  assert.deepStrictEqual(e.hojas.Cuentas[0], ['id', 'nombre', 'banco', 'tipo', 'moneda', 'saldo_inicial', 'numeros', 'activa', 'yape']);
  const cuenta = e.llamar('leerTabla_', 'Cuentas')[0];
  assert.strictEqual(cuenta.numeros, '0042');
  assert.strictEqual(cuenta.yape, false);
  assert.strictEqual(cuenta.saldo_inicial, 100);
  assert.ok(e.hojas.Pendientes, 'crea la hoja Pendientes');
  assert.strictEqual(e.llamar('leerConfig_').version_esquema, '2');
  assert.strictEqual(e.principal._formatos['Cuentas!9'], undefined, 'yape es booleano: sin formato texto');
});

test('la migración es idempotente y no bloquea si no hace falta', () => {
  const e = hojaV1();
  e.llamar('estadoInstalacion');
  const locks = e.stats.locks;
  const encabezados = e.hojas.Cuentas[0].slice();
  e.llamar('estadoInstalacion');
  assert.deepStrictEqual(e.hojas.Cuentas[0], encabezados);
  assert.strictEqual(e.stats.locks, locks);
});

test('normalizarCuenta_ acepta varios números y marca de Yape', () => {
  const e = crearEntorno();
  const c = e.llamar('normalizarCuenta_', { nombre: 'Gastos', tipo: 'debito', numeros: ' 1063,7373  1063 ', yape: true });
  assert.strictEqual(c.numeros, '1063, 7373');
  assert.strictEqual(c.yape, true);
  assert.strictEqual(e.llamar('normalizarCuenta_', { nombre: 'E', tipo: 'efectivo' }).numeros, '');
  assert.throws(() => e.interno('normalizarCuenta_', { nombre: 'X', tipo: 'debito', numeros: '1063, 73' }), /4 dígitos: "73"/);
  assert.deepStrictEqual(e.llamar('numerosDe_', { numeros: '1063, 7373' }), ['1063', '7373']);
});

test('guardarCuenta rechaza números repetidos entre cuentas y deja una sola cuenta de Yape', () => {
  const e = entornoInstalado();
  const deb = e.cuenta('Débito BCP');
  e.llamar('guardarCuenta', { id: deb, nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', numeros: '1063, 7373', yape: true });
  assert.throws(() => e.interno('guardarCuenta', { nombre: 'Otra', tipo: 'ahorro', numeros: '7373' }), /7373 ya está en la cuenta "Débito BCP"/);
  const ahorro = e.llamar('guardarCuenta', { nombre: 'Ahorro BCP', tipo: 'ahorro', numeros: '3099', yape: true });
  const cuentas = e.filas('Cuentas');
  assert.strictEqual(cuentas.find(c => c.id === deb).yape, false);
  assert.strictEqual(cuentas.find(c => c.id === ahorro.id).yape, true);
  assert.doesNotThrow(() => e.interno('guardarCuenta', { id: deb, nombre: 'Débito BCP', tipo: 'debito', numeros: '1063, 7373' }));
});

test('completarAsistente valida números repetidos y una sola cuenta de Yape', () => {
  const e = crearEntorno();
  const dos = { nombre: 'A', tipo: 'debito', numeros: '1111' };
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { cuentas: [dos, Object.assign({}, dos, { nombre: 'B' })] })), /1111 ya está/);
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { cuentas: [Object.assign({}, dos, { yape: true }), { nombre: 'B', tipo: 'ahorro', yape: true }] })), /Solo una cuenta puede ser la de Yape/);
  assert.deepStrictEqual(Object.keys(e.hojas), []);
});
