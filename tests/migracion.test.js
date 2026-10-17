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
  assert.strictEqual(e.llamar('leerConfig_').version_esquema, '6');
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
  const c = e.llamar('normalizarCuenta_', { nombre: 'Gastos', tipo: 'debito', numeros: ' 5101,5202  5101 ', yape: true });
  assert.strictEqual(c.numeros, '5101, 5202');
  assert.strictEqual(c.yape, true);
  assert.strictEqual(e.llamar('normalizarCuenta_', { nombre: 'E', tipo: 'efectivo' }).numeros, '');
  assert.throws(() => e.interno('normalizarCuenta_', { nombre: 'X', tipo: 'debito', numeros: '5101, 73' }), /4 dígitos: "73"/);
  assert.deepStrictEqual(e.llamar('numerosDe_', { numeros: '5101, 5202' }), ['5101', '5202']);
});

test('guardarCuenta rechaza números repetidos entre cuentas y deja una sola cuenta de Yape', () => {
  const e = entornoInstalado();
  const deb = e.cuenta('Débito BCP');
  e.llamar('guardarCuenta', { id: deb, nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', numeros: '5101, 5202', yape: true });
  assert.throws(() => e.interno('guardarCuenta', { nombre: 'Otra', tipo: 'ahorro', numeros: '5202' }), /5202 ya está en la cuenta "Débito BCP"/);
  const ahorro = e.llamar('guardarCuenta', { nombre: 'Ahorro BCP', tipo: 'ahorro', numeros: '5303', yape: true });
  const cuentas = e.filas('Cuentas');
  assert.strictEqual(cuentas.find(c => c.id === deb).yape, false);
  assert.strictEqual(cuentas.find(c => c.id === ahorro.id).yape, true);
  assert.doesNotThrow(() => e.interno('guardarCuenta', { id: deb, nombre: 'Débito BCP', tipo: 'debito', numeros: '5101, 5202' }));
});

test('completarAsistente valida números repetidos y una sola cuenta de Yape', () => {
  const e = crearEntorno();
  const dos = { nombre: 'A', tipo: 'debito', numeros: '1111' };
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { cuentas: [dos, Object.assign({}, dos, { nombre: 'B' })] })), /1111 ya está/);
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { cuentas: [Object.assign({}, dos, { yape: true }), { nombre: 'B', tipo: 'ahorro', yape: true }] })), /Solo una cuenta puede ser la de Yape/);
  assert.deepStrictEqual(Object.keys(e.hojas), []);
});

test('una hoja v2 pasa a v3 con la hoja Presupuestos, sin tocar los datos', () => {
  const e = entornoInstalado();
  delete e.hojas.Presupuestos;
  e.interno('guardarConfig_', { version_esquema: 2 });
  const movimientos = JSON.stringify(e.hojas.Movimientos);
  e.llamar('estadoInstalacion');
  assert.deepStrictEqual(e.hojas.Presupuestos[0], ['id', 'categoria_id', 'monto', 'desde']);
  assert.strictEqual(e.llamar('leerConfig_').version_esquema, '6');
  assert.strictEqual(JSON.stringify(e.hojas.Movimientos), movimientos);
});
test('una hoja v3 pasa a v4 con Recurrentes y EstadosCuenta, sin tocar los datos', () => {
  const e = entornoInstalado();
  delete e.hojas.Recurrentes;
  delete e.hojas.EstadosCuenta;
  e.interno('guardarConfig_', { version_esquema: 3 });
  const movimientos = JSON.stringify(e.hojas.Movimientos);
  e.llamar('estadoInstalacion');
  assert.deepStrictEqual(e.hojas.Recurrentes[0], ['id', 'nombre', 'monto', 'moneda', 'cuenta_id', 'categoria_id', 'dia_mes', 'activo']);
  assert.deepStrictEqual(e.hojas.EstadosCuenta[0], ['id', 'cuenta_id', 'emitido', 'total_pen', 'total_usd', 'minimo_pen', 'minimo_usd', 'fecha_limite', 'ref_externa']);
  assert.strictEqual(e.llamar('leerConfig_').version_esquema, '6');
  assert.strictEqual(JSON.stringify(e.hojas.Movimientos), movimientos);
});

test('migrar de v4 a v5 crea Ambitos con los iniciales una sola vez y agrega ambito_id', () => {
  const e = entornoInstalado();
  delete e.hojas.Ambitos;
  e.hojas.Movimientos[0] = e.hojas.Movimientos[0].filter(h => h !== 'ambito_id');
  e.hojas.Divisiones[0] = e.hojas.Divisiones[0].filter(h => h !== 'ambito_id');
  e.interno('guardarConfig_', { version_esquema: 4 });
  e.llamar('estadoInstalacion');
  e.interno('guardarConfig_', { version_esquema: 4 });
  e.llamar('estadoInstalacion');
  assert.strictEqual(e.llamar('leerConfig_').version_esquema, '6');
  assert.deepStrictEqual(e.filas('Ambitos').map(a => a.nombre), ['Personal', 'Diversión', 'Familia', 'Trabajo']);
  assert.strictEqual(e.hojas.Movimientos[0].slice(-1)[0], 'ambito_id');
  assert.strictEqual(e.hojas.Divisiones[0].slice(-1)[0], 'ambito_id');
});
