const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno, crearLibro } = require('./harness');

const HOJAS = ['Categorias', 'Config', 'Cuentas', 'Divisiones', 'Log', 'Movimientos', 'Reglas'];

test('crearHojas_ crea todas las hojas con encabezados y es idempotente', () => {
  const e = crearEntorno();
  e.interno('crearHojas_', e.principal);
  e.interno('crearHojas_', e.principal);
  assert.deepStrictEqual(Object.keys(e.hojas).sort(), HOJAS);
  assert.deepStrictEqual(e.hojas.Cuentas, [['id', 'nombre', 'banco', 'tipo', 'moneda', 'saldo_inicial', 'ultimos4', 'activa']]);
});

test('crearHojas_ pone formato texto en columnas texto/fecha (conserva ceros a la izquierda)', () => {
  const e = crearEntorno();
  e.interno('crearHojas_', e.principal);
  assert.strictEqual(e.principal._formatos['Cuentas!7'], '@');   // ultimos4
  assert.strictEqual(e.principal._formatos['Movimientos!2'], '@'); // fecha
  assert.strictEqual(e.principal._formatos['Cuentas!6'], undefined); // saldo_inicial es número
});

test('agregarFilas_ y leerTabla_ convierten tipos', () => {
  const e = crearEntorno();
  e.interno('crearHojas_', e.principal);
  e.interno('agregarFilas_', 'Cuentas', [{ id: 'a', nombre: 'Débito', saldo_inicial: '10.5', ultimos4: '0042', activa: true }]);
  assert.deepStrictEqual(e.hojas.Cuentas[1], ['a', 'Débito', '', '', '', 10.5, '0042', true]);
  assert.deepStrictEqual(e.llamar('leerTabla_', 'Cuentas'), [
    { id: 'a', nombre: 'Débito', banco: '', tipo: '', moneda: '', saldo_inicial: 10.5, ultimos4: '0042', activa: true },
  ]);
});

test('leerTabla_ convierte fechas Date a yyyy-MM-dd, respeta columnas reordenadas e ignora filas vacías', () => {
  const e = crearEntorno({
    hojas: {
      Divisiones: [
        ['monto', 'id', 'movimiento_id', 'categoria_id', 'nota'],
        ['5', 'd1', 'm1', 'c1', ''],
        ['', '', '', '', ''],
      ],
      Movimientos: [['id', 'fecha', 'dividido'], ['m1', new Date(2026, 9, 6), 'TRUE']],
    },
  });
  assert.deepStrictEqual(e.llamar('leerTabla_', 'Divisiones'), [{ id: 'd1', movimiento_id: 'm1', categoria_id: 'c1', monto: 5, nota: '' }]);
  const mov = e.llamar('leerTabla_', 'Movimientos')[0];
  assert.strictEqual(mov.fecha, '2026-10-06');
  assert.strictEqual(mov.dividido, true);
  assert.strictEqual(mov.monto, 0);
});

test('actualizarFila_ cambia solo lo indicado y conserva columnas extra del usuario', () => {
  const e = crearEntorno({
    hojas: { Cuentas: [['id', 'nombre', 'banco', 'tipo', 'moneda', 'saldo_inicial', 'ultimos4', 'activa', 'Mi nota'], ['a', 'X', 'BCP', 'debito', 'PEN', 5, '1111', true, 'no tocar']] },
  });
  e.interno('actualizarFila_', 'Cuentas', 'a', { nombre: 'Y' });
  assert.deepStrictEqual(e.hojas.Cuentas[1], ['a', 'Y', 'BCP', 'debito', 'PEN', 5, '1111', true, 'no tocar']);
  assert.throws(() => e.interno('actualizarFila_', 'Cuentas', 'zz', { nombre: 'Z' }), /No existe Cuentas con id zz/);
});

test('eliminarFila_ borra por id', () => {
  const e = crearEntorno();
  e.interno('crearHojas_', e.principal);
  e.interno('agregarFilas_', 'Reglas', [{ id: 'r1', patron: 'A' }, { id: 'r2', patron: 'B' }]);
  e.interno('eliminarFila_', 'Reglas', 'r1');
  assert.deepStrictEqual(e.llamar('leerTabla_', 'Reglas').map(r => r.id), ['r2']);
  assert.throws(() => e.interno('eliminarFila_', 'Reglas', 'r1'), /No existe/);
});

test('leerTabla_ sin hoja pide abrir el asistente', () => {
  const e = crearEntorno();
  assert.throws(() => e.interno('leerTabla_', 'Cuentas'), /asistente/);
});

test('leerConfig_ y guardarConfig_ crean y actualizan claves', () => {
  const e = crearEntorno();
  e.interno('crearHojas_', e.principal);
  e.interno('guardarConfig_', { nombre: 'Ana', ultimo_tc: 3.75 });
  e.interno('guardarConfig_', { nombre: 'Ana María' });
  assert.deepStrictEqual(e.llamar('leerConfig_'), { nombre: 'Ana María', ultimo_tc: '3.75' });
  assert.strictEqual(e.hojas.Config.length, 3);
});

test('abrirLibro_ usa SHEET_ID, la demo si está activa, y vuelve a la real si la demo no existe', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('abrirLibro_'), e.principal);

  const otro = crearLibro('libro-x', {});
  e.libros['libro-x'] = otro;
  e.propiedades.SHEET_ID = 'libro-x';
  assert.strictEqual(e.interno('abrirLibro_'), otro);

  e.propiedades.MODO_DEMO = 'si';
  e.propiedades.DEMO_SHEET_ID = 'no-existe';
  assert.strictEqual(e.interno('abrirLibro_'), otro);
  assert.strictEqual(e.propiedades.MODO_DEMO, 'no');
});

test('conBloqueo_ toma el bloqueo y devuelve el resultado', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('conBloqueo_', () => 7), 7);
  assert.strictEqual(e.stats.locks, 1);
});
