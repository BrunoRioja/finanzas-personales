const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');
const { ASUNTOS, html } = require('./correos');

function conGasto() {
  const e = entornoInstalado();
  e.mov = e.llamar('guardarMovimiento', { fecha: '2026-10-06', tipo: 'gasto', monto: 89.3, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Supermercado'), comercio: 'Tottus' });
  return e;
}

test('dividir guarda las partes, marca el movimiento y el dashboard usa las partes', () => {
  const e = conGasto();
  const r = e.llamar('dividirMovimiento', { id: e.mov.id, partes: [
    { categoria_id: e.categoria('Supermercado'), monto: 60 },
    { categoria_id: e.categoria('Aseo personal'), monto: '20' },
    { categoria_id: e.categoria('Ropa'), monto: 9.3 },
  ] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(e.filas('Divisiones').length, 3);
  const mov = e.filas('Movimientos')[0];
  assert.strictEqual(mov.dividido, true);
  assert.strictEqual(mov.categoria_id, e.categoria('Supermercado'));
  const cats = e.llamar('obtenerDashboard', '2026-10').categorias.map(c => [c.nombre, c.monto]);
  assert.deepStrictEqual(cats, [['Supermercado', 60], ['Aseo personal', 20], ['Ropa', 9.3]]);
  e.llamar('dividirMovimiento', { id: e.mov.id, partes: [
    { categoria_id: e.categoria('Supermercado'), monto: 80 },
    { categoria_id: e.categoria('Ropa'), monto: 9.3 },
  ] });
  assert.strictEqual(e.llamar('obtenerDivisiones', e.mov.id).length, 2);
});

test('dividir valida suma, cantidad, tipo de categoría y transferencias', () => {
  const e = conGasto();
  const sup = e.categoria('Supermercado');
  const falla = (partes, patron) => assert.throws(() => e.interno('dividirMovimiento', { id: e.mov.id, partes }), patron);
  falla([{ categoria_id: sup, monto: 60 }, { categoria_id: sup, monto: 20 }], /suman 80.00 y el movimiento es 89.30/);
  falla([{ categoria_id: sup, monto: 89.3 }], /al menos 2 partes/);
  falla([{ categoria_id: sup, monto: 89.3 }, { categoria_id: e.categoria('Sueldo'), monto: 0.01 }], /no es de gasto/);
  falla([{ categoria_id: sup, monto: 100 }, { categoria_id: sup, monto: -10.7 }], /mismo signo/);
  const t = e.llamar('guardarMovimiento', { fecha: '2026-10-06', tipo: 'transferencia', monto: 50, cuenta_id: e.cuenta('Débito BCP'), cuenta_destino_id: e.cuenta('VISA BCP') });
  assert.throws(() => e.interno('dividirMovimiento', { id: t.id, partes: [{ categoria_id: sup, monto: 25 }, { categoria_id: sup, monto: 25 }] }), /transferencia no se puede dividir/);
  assert.strictEqual(e.filas('Divisiones').length, 0);
});

test('quitar la división y eliminar el movimiento no dejan divisiones sueltas', () => {
  const e = conGasto();
  const partes = [{ categoria_id: e.categoria('Supermercado'), monto: 60 }, { categoria_id: e.categoria('Ropa'), monto: 29.3 }];
  e.llamar('dividirMovimiento', { id: e.mov.id, partes });
  assert.deepStrictEqual(e.llamar('quitarDivision', e.mov.id), { ok: true });
  assert.strictEqual(e.filas('Divisiones').length, 0);
  assert.strictEqual(e.filas('Movimientos')[0].dividido, false);
  e.llamar('dividirMovimiento', { id: e.mov.id, partes });
  e.llamar('eliminarMovimiento', e.mov.id);
  assert.strictEqual(e.filas('Divisiones').length, 0);
});

test('un movimiento importado que se elimina no vuelve en la siguiente lectura', () => {
  const correos = [{ id: 'g1', de: 'notificaciones@notificacionesbcp.com.pe', asunto: ASUNTOS.debito, html: html('debito.html'), recibido: '2026-10-06T16:19:00' }];
  const e = entornoInstalado({ correos });
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1111' });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.llamar('revisarCorreos');
  e.llamar('eliminarMovimiento', e.filas('Movimientos')[0].id);
  e.interno('guardarConfig_', { cursor_lectura: 0 });
  assert.strictEqual(e.llamar('revisarCorreos').leidos, 0);
  assert.deepStrictEqual(e.filas('Movimientos'), []);
});

test('dividir un movimiento sin cuenta exige elegirla y la guarda', () => {
  const correos = [{ id: 'g1', de: 'notificaciones@notificacionesbcp.com.pe', asunto: ASUNTOS.debito, html: html('debito.html'), recibido: '2026-10-06T16:19:00' }];
  const e = entornoInstalado({ correos });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.llamar('revisarCorreos');
  const mov = e.filas('Movimientos')[0];
  const partes = [{ categoria_id: e.categoria('Supermercado'), monto: 60 }, { categoria_id: e.categoria('Ropa'), monto: 29.3 }];
  assert.throws(() => e.interno('dividirMovimiento', { id: mov.id, partes }), /Elige la cuenta/);
  e.llamar('dividirMovimiento', { id: mov.id, partes, cuenta_id: e.cuenta('Débito BCP') });
  const final = e.filas('Movimientos')[0];
  assert.strictEqual(final.cuenta_id, e.cuenta('Débito BCP'));
  assert.strictEqual(final.estado, 'confirmado');
});
