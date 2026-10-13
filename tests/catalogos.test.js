const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { ASISTENTE, entornoInstalado } = require('./fixtures');

test('normalizarCuenta_ valida y normaliza', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(
    e.llamar('normalizarCuenta_', { nombre: ' VISA ', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: '-120.456', ultimos4: '0042' }),
    { nombre: 'VISA', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -120.46, ultimos4: '0042', activa: true });
  assert.strictEqual(e.llamar('normalizarCuenta_', { nombre: 'E', tipo: 'efectivo' }).saldo_inicial, 0);
  assert.throws(() => e.interno('normalizarCuenta_', { nombre: '', tipo: 'debito' }), /nombre/);
  assert.throws(() => e.interno('normalizarCuenta_', { nombre: 'X', tipo: 'cripto' }), /Tipo de cuenta/);
  assert.throws(() => e.interno('normalizarCuenta_', { nombre: 'X', tipo: 'debito', moneda: 'EUR' }), /Moneda/);
  assert.throws(() => e.interno('normalizarCuenta_', { nombre: 'X', tipo: 'debito', ultimos4: '42' }), /4 números/);
  assert.throws(() => e.interno('normalizarCuenta_', { nombre: 'X', tipo: 'debito', saldo_inicial: 'mucho' }), /saldo/);
});

test('normalizarCategoria_ valida tipo, nombre repetido y color', () => {
  const e = crearEntorno();
  const existentes = [{ id: 'c1', nombre: 'Café', tipo: 'gasto' }];
  const nueva = e.llamar('normalizarCategoria_', { nombre: 'Taxi', emoji: '🚕', tipo: 'gasto' }, existentes, '');
  assert.strictEqual(nueva.color, '#ffb347'); // PALETA[1] porque ya hay 1 categoría
  assert.strictEqual(nueva.activa, true);
  assert.strictEqual(e.llamar('normalizarCategoria_', { nombre: 'X', tipo: 'gasto', color: '#123456' }, [], '').color, '#123456');
  assert.throws(() => e.interno('normalizarCategoria_', { nombre: 'cafe', tipo: 'gasto' }, existentes, ''), /Ya existe/);
  assert.doesNotThrow(() => e.interno('normalizarCategoria_', { nombre: 'Café', tipo: 'gasto' }, existentes, 'c1'));
  assert.doesNotThrow(() => e.interno('normalizarCategoria_', { nombre: 'Café', tipo: 'ingreso' }, existentes, ''));
  assert.throws(() => e.interno('normalizarCategoria_', { nombre: 'X', tipo: 'otro' }, [], ''), /gasto o de ingreso/);
});

test('estadoInstalacion sin hojas indica no instalado', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('estadoInstalacion'), { instalado: false, modoDemo: false });
});

test('completarAsistente crea hojas, cuentas, categorías por defecto y config', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('completarAsistente', ASISTENTE), { instalado: true, modoDemo: false });
  const cat = e.llamar('obtenerCatalogos');
  assert.deepStrictEqual(cat.cuentas.map(c => [c.nombre, c.ultimos4, c.saldo_inicial]), [['Débito BCP', '1234', 1000], ['VISA BCP', '0042', -200]]);
  assert.strictEqual(cat.categorias.length, 20);
  assert.strictEqual(cat.categorias.filter(c => c.tipo === 'ingreso').length, 4);
  assert.deepStrictEqual(cat.config, { nombre: 'Ana', ultimo_tc: 3.75, moneda_principal: 'PEN' });
  assert.deepStrictEqual(cat.opciones.monedas, ['PEN', 'USD']);
  assert.ok(cat.opciones.bancos.indexOf('BCP') >= 0);
  assert.strictEqual(cat.urlHoja, 'https://docs.google.com/spreadsheets/d/libro-principal');
  const config = e.llamar('leerConfig_');
  assert.strictEqual(config.version_esquema, '1');
  assert.strictEqual(config.modo_bot, 'B');
  assert.strictEqual(config.hora_resumen, '21:00');
});

test('completarAsistente acepta categorías propias y valida sin crear nada si falla', () => {
  const e = crearEntorno();
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { nombre: ' ' })), /nombre/);
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { cuentas: [] })), /al menos una cuenta/);
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { categorias: [{ nombre: 'Solo gasto', tipo: 'gasto' }] })), /gasto y una de ingreso/);
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { tc_usd: 'x' })), /tipo de cambio/);
  assert.deepStrictEqual(Object.keys(e.hojas), []);

  e.llamar('completarAsistente', Object.assign({}, ASISTENTE, { categorias: [{ nombre: 'Comida', emoji: '🍔', tipo: 'gasto' }, { nombre: 'Sueldo', emoji: '💼', tipo: 'ingreso' }] }));
  assert.deepStrictEqual(e.llamar('obtenerCatalogos').categorias.map(c => c.nombre), ['Comida', 'Sueldo']);
});

test('completarAsistente no se puede repetir', () => {
  const e = entornoInstalado();
  assert.throws(() => e.interno('completarAsistente', ASISTENTE), /ya está instalada/);
});

test('guardarCuenta crea y edita', () => {
  const e = entornoInstalado();
  const nueva = e.llamar('guardarCuenta', { nombre: 'Interbank', banco: 'Interbank', tipo: 'debito', moneda: 'PEN' });
  assert.strictEqual(nueva.nombre, 'Interbank');
  e.llamar('guardarCuenta', Object.assign({}, nueva, { nombre: 'Interbank Google', activa: false }));
  const fila = e.filas('Cuentas').find(c => c.id === nueva.id);
  assert.strictEqual(fila.nombre, 'Interbank Google');
  assert.strictEqual(fila.activa, false);
  assert.throws(() => e.interno('guardarCuenta', { id: 'nada', nombre: 'X', tipo: 'debito' }), /ya no existe/);
  assert.ok(e.stats.locks >= 3);
});

test('guardarCategoria crea, edita y no permite duplicados', () => {
  const e = entornoInstalado();
  const nueva = e.llamar('guardarCategoria', { nombre: 'Mascotas', emoji: '🐶', tipo: 'gasto' });
  e.llamar('guardarCategoria', Object.assign({}, nueva, { nombre: 'Mascota', activa: false }));
  assert.strictEqual(e.filas('Categorias').find(c => c.id === nueva.id).nombre, 'Mascota');
  assert.throws(() => e.interno('guardarCategoria', { nombre: 'supermercado', tipo: 'gasto' }), /Ya existe/);
});

test('guardarAjustes cambia nombre y tipo de cambio', () => {
  const e = entornoInstalado();
  assert.deepStrictEqual(e.llamar('guardarAjustes', { nombre: 'Ana R.', ultimo_tc: '3.80' }), { nombre: 'Ana R.', ultimo_tc: 3.8, moneda_principal: 'PEN' });
  assert.throws(() => e.interno('guardarAjustes', { nombre: '', ultimo_tc: 3.8 }), /nombre/);
  assert.throws(() => e.interno('guardarAjustes', { nombre: 'A', ultimo_tc: -1 }), /tipo de cambio/);
});
