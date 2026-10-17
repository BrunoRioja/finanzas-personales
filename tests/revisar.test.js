const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');
const { ASUNTOS, html } = require('./correos');

const BCP = 'notificaciones@notificacionesbcp.com.pe';
const YAPE = 'notificaciones@yape.pe';
const correoGmail = (id, archivo, asunto, recibido, de) => ({ id, de: de || BCP, asunto, html: html(archivo), recibido });

function entorno(numerosDebito) {
  const correos = [
    correoGmail('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00'),
    correoGmail('g2', 'credito-dolares.html', ASUNTOS.credito, '2026-10-07T10:00:00'),
    correoGmail('g3', 'yape-enviado.html', ASUNTOS.yape, '2026-10-08T19:51:00', YAPE),
    correoGmail('g5', 'pago-tarjeta-dolares.html', ASUNTOS.pagoTarjeta, '2026-10-10T13:42:00'),
    correoGmail('g6', 'consumo-roto.html', ASUNTOS.debito, '2026-10-11T09:00:00'),
    correoGmail('g9', 'debito.html', ASUNTOS.debito, '2026-10-12T12:00:00'),
  ];
  const e = entornoInstalado({ correos });
  e.correos = correos;
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: numerosDebito || '4444, 1111', yape: true });
  e.llamar('guardarCuenta', { id: e.cuenta('VISA BCP'), nombre: 'VISA BCP', tipo: 'credito', numeros: '2222' });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.movDe = gid => e.filas('Movimientos').find(m => m.ref_externa === 'gmail:' + gid);
  return e;
}

test('obtenerPorRevisar lista movimientos por revisar, correos no leídos y categorías frecuentes', () => {
  const e = entorno();
  e.llamar('revisarCorreos');
  const d = e.llamar('obtenerPorRevisar');
  assert.deepStrictEqual(d.movimientos.map(m => m.ref_externa), ['gmail:g9', 'gmail:g3', 'gmail:g2', 'gmail:g1']);
  assert.deepStrictEqual(d.pendientes.map(p => p.gmail_id), ['g6']);
  assert.strictEqual(d.categoriasFrecuentes.gasto.length, 6);
  assert.strictEqual(d.categoriasFrecuentes.ingreso.length, 4);
  assert.strictEqual(e.llamar('obtenerDashboard', '2026-10').porRevisar, 5);
});

test('categorizar con "recordar" crea la regla, confirma los del mismo comercio y sirve para los siguientes correos', () => {
  const e = entorno();
  e.llamar('revisarCorreos');
  const sup = e.categoria('Supermercado');
  const r = e.llamar('categorizarMovimiento', { id: e.movDe('g1').id, categoria_id: sup, recordar: true, patron: 'tottus' });
  assert.strictEqual(r.confirmados, 2);
  assert.strictEqual(r.regla.patron, 'TOTTUS');
  assert.strictEqual(e.movDe('g9').estado, 'confirmado');
  assert.strictEqual(e.movDe('g9').categoria_id, sup);
  assert.deepStrictEqual(e.llamar('listarReglas').map(x => [x.patron, x.categoria_id]), [['TOTTUS', sup]]);
  e.correos.push(correoGmail('g10', 'debito.html', ASUNTOS.debito, '2026-10-13T09:30:00'));
  const nueva = e.llamar('revisarCorreos');
  assert.strictEqual(nueva.creados, 1);
  assert.strictEqual(nueva.porRevisar, 0);
  assert.strictEqual(e.filas('Reglas')[0].usos, 1);
});

test('categorizar sin recordar no crea reglas; recordar otra vez el mismo patrón actualiza la regla', () => {
  const e = entorno();
  e.llamar('revisarCorreos');
  e.llamar('categorizarMovimiento', { id: e.movDe('g3').id, categoria_id: e.categoria('Transporte'), recordar: false });
  assert.strictEqual(e.filas('Reglas').length, 0);
  e.llamar('categorizarMovimiento', { id: e.movDe('g1').id, categoria_id: e.categoria('Supermercado'), recordar: true });
  e.llamar('categorizarMovimiento', { id: e.movDe('g9').id, categoria_id: e.categoria('Bodega'), recordar: true });
  assert.deepStrictEqual(e.llamar('listarReglas').map(x => [x.patron, x.categoria_id]), [['TOTTUS PRUEBA SUR', e.categoria('Bodega')]]);
});

test('si el correo traía un número desconocido, pide la cuenta', () => {
  const e = entorno('4444');
  e.llamar('revisarCorreos');
  const g1 = e.movDe('g1');
  assert.strictEqual(g1.cuenta_id, '');
  assert.throws(() => e.interno('categorizarMovimiento', { id: g1.id, categoria_id: e.categoria('Supermercado') }), /Elige la cuenta/);
  e.llamar('categorizarMovimiento', { id: g1.id, categoria_id: e.categoria('Supermercado'), cuenta_id: e.cuenta('Débito BCP') });
  assert.strictEqual(e.movDe('g1').cuenta_id, e.cuenta('Débito BCP'));
  assert.strictEqual(e.movDe('g1').estado, 'confirmado');
});

test('un gasto en dólares sin tipo de cambio lo completa al categorizar', () => {
  const e = entorno();
  e.interno('guardarConfig_', { ultimo_tc: 0 });
  e.llamar('revisarCorreos');
  const g2 = e.movDe('g2');
  assert.strictEqual(g2.monto_pen, 0);
  e.interno('guardarConfig_', { ultimo_tc: 0 });
  assert.throws(() => e.interno('categorizarMovimiento', { id: g2.id, categoria_id: e.categoria('Suscripciones') }), /tipo de cambio/);
  e.interno('guardarConfig_', { ultimo_tc: 3.477 });
  e.llamar('categorizarMovimiento', { id: g2.id, categoria_id: e.categoria('Suscripciones') });
  assert.strictEqual(e.movDe('g2').tc, 3.477);
  assert.strictEqual(e.movDe('g2').monto_pen, 82.06);
  assert.strictEqual(e.movDe('g2').descripcion, '');
});

test('eliminar reglas y descartar correos no leídos', () => {
  const e = entorno();
  e.llamar('revisarCorreos');
  e.llamar('categorizarMovimiento', { id: e.movDe('g1').id, categoria_id: e.categoria('Supermercado'), recordar: true });
  const regla = e.llamar('listarReglas')[0];
  assert.deepStrictEqual(e.llamar('eliminarRegla', regla.id), { ok: true });
  assert.deepStrictEqual(e.llamar('listarReglas'), []);
  const p = e.llamar('obtenerPorRevisar').pendientes[0];
  assert.deepStrictEqual(e.llamar('descartarPendiente', p.id), { ok: true });
  assert.deepStrictEqual(e.llamar('obtenerPorRevisar').pendientes, []);
  assert.throws(() => e.interno('categorizarMovimiento', { id: 'nada', categoria_id: e.categoria('Bodega') }), /ya no existe/);
});

test('recordarComercio_ hacia una categoría con rol lanza y listarReglas marca en_pausa', () => {
  const e = entorno();
  const prest = e.categoria('Préstamos');
  const sup = e.categoria('Supermercado');
  assert.throws(() => e.interno('recordarComercio_', [], { id: 'x', comercio: 'Juan', tipo: 'gasto' }, 'JUAN', prest), /Los préstamos y reembolsos no se recuerdan\./);
  e.interno('guardarRegla_', 'JUAN', prest);
  e.interno('guardarRegla_', 'TOTTUS', sup);
  assert.deepStrictEqual(e.llamar('listarReglas').map(x => [x.patron, x.en_pausa]), [['JUAN', true], ['TOTTUS', false]]);
});
