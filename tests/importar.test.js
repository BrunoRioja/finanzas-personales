const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno, crearLibro } = require('./harness');
const { entornoInstalado } = require('./fixtures');

const ID_ANTERIOR = '1AnteriorAnteriorAnterior01';
const ID_NUEVA = '1NuevaNuevaNuevaNuevaNueva02';

// App instalada con datos ficticios: es la "hoja anterior".
function hojaAnterior() {
  const a = entornoInstalado();
  a.llamar('guardarMovimiento', {
    tipo: 'gasto', fecha: '2026-10-05', monto: '45.90', moneda: 'PEN', cuenta_id: a.cuenta('Débito BCP'),
    categoria_id: a.categoria('Supermercado'), comercio: 'Tottus', descripcion: '',
  });
  a.llamar('guardarPresupuestos', { montos: { [a.categoria('Supermercado')]: '600' } });
  a.llamar('guardarRecurrente', {
    nombre: 'Streaming', monto: '20.90', moneda: 'PEN', dia_mes: '5', cuenta_id: a.cuenta('Débito BCP'), categoria_id: a.categoria('Suscripciones'),
  });
  a.interno('guardarConfig_', { lectura_activa: 'si', importar_desde: '2026-09-01', horario_inicio: 8 });
  a.interno('registrarLog_', 'error', 'prueba', 'un error viejo', '');
  return a;
}

// Copia recién hecha de la plantilla (sin instalar) que puede abrir la hoja anterior.
function copiaNueva(hojas) {
  const e = crearEntorno({ idPrincipal: ID_NUEVA });
  e.libros[ID_ANTERIOR] = crearLibro(ID_ANTERIOR, JSON.parse(JSON.stringify(hojas)));
  e.filas = hoja => e.llamar('leerTabla_', hoja);
  return e;
}

test('importa todas las tablas con sus ids, la configuración elegida y deja la app instalada', () => {
  const a = hojaAnterior();
  const e = copiaNueva(a.hojas);
  const r = e.llamar('importarHojaAnterior', 'https://docs.google.com/spreadsheets/d/' + ID_ANTERIOR + '/edit#gid=0');
  assert.deepStrictEqual(r.estado, { instalado: true, modoDemo: false });
  assert.strictEqual(r.importado.Movimientos, 1);
  assert.strictEqual(r.importado.Recurrentes, 1);
  ['Cuentas', 'Categorias', 'Movimientos', 'Divisiones', 'Reglas', 'Presupuestos', 'Recurrentes', 'EstadosCuenta']
    .forEach(t => assert.deepStrictEqual(e.filas(t), a.filas(t), t));
  const config = e.llamar('leerConfig_');
  assert.strictEqual(config.nombre, 'Ana');
  assert.strictEqual(config.ultimo_tc, '3.75');
  assert.strictEqual(config.horario_inicio, '8');
  assert.strictEqual(config.version_esquema, '4');
  assert.strictEqual(config.instalado, 'si');
  assert.strictEqual(config.importar_desde, undefined);
  assert.strictEqual(config.lectura_activa, undefined);
  assert.deepStrictEqual(e.filas('Log'), []);
  assert.deepStrictEqual(e.filas('Pendientes'), []);
});

test('importa una hoja de una versión anterior (sin Presupuestos ni pagos fijos, con ultimos4)', () => {
  const a = hojaAnterior();
  const hojas = JSON.parse(JSON.stringify(a.hojas));
  ['Presupuestos', 'Recurrentes', 'EstadosCuenta'].forEach(h => { delete hojas[h]; });
  hojas.Cuentas[0] = hojas.Cuentas[0].map(h => (h === 'numeros' ? 'ultimos4' : h));
  const e = copiaNueva(hojas);
  const r = e.llamar('importarHojaAnterior', ID_ANTERIOR);
  assert.strictEqual(r.importado.Presupuestos, 0);
  assert.deepStrictEqual(e.filas('Cuentas').map(c => c.numeros), a.filas('Cuentas').map(c => c.numeros));
  assert.deepStrictEqual(e.filas('Recurrentes'), []);
  assert.strictEqual(e.llamar('estadoInstalacion').instalado, true);
});

test('valida el enlace, la hoja, el modo demo y el estado de la copia sin escribir nada', () => {
  const a = hojaAnterior();
  const e = copiaNueva(a.hojas);
  const imp = x => () => e.interno('importarHojaAnterior', x);
  assert.throws(imp('hola'), /Pega el enlace/);
  assert.throws(imp(''), /Pega el enlace/);
  assert.throws(imp(ID_NUEVA), /misma hoja/);
  assert.throws(imp('1NoExisteNoExisteNoExiste03'), /No pude abrir/);
  e.libros['1SinInstalarSinInstalar004'] = crearLibro('1SinInstalarSinInstalar004', { Config: [['clave', 'valor']] });
  assert.throws(imp('1SinInstalarSinInstalar004'), /no es de la app/);
  e.libros['1OtraHojaCualquieraXYZ0005'] = crearLibro('1OtraHojaCualquieraXYZ0005', { Hoja1: [['a', 'b']] });
  assert.throws(imp('1OtraHojaCualquieraXYZ0005'), /no es de la app/);
  e.propiedades.MODO_DEMO = 'si';
  assert.throws(imp(ID_ANTERIOR), /modo demo/);
  delete e.propiedades.MODO_DEMO;
  assert.deepStrictEqual(Object.keys(e.hojas), [], 'nada escrito');
  e.llamar('importarHojaAnterior', ID_ANTERIOR);
  assert.throws(imp(ID_ANTERIOR), /ya está instalada/);
});
