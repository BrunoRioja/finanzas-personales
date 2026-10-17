const test = require('node:test');
const assert = require('node:assert');
const { entornoBot } = require('./telegram');

// Préstamo pendiente creado como en el bot: un yapeo de gasto que se pone en Préstamos.
function prestar(e, persona, monto, fecha) {
  const mov = e.porRevisar({ comercio: persona, monto: monto, monto_pen: monto, fecha: fecha || '2026-10-10' });
  e.tocar(e.dato('c', mov, e.categoria('Préstamos')));
  return e.filas('Prestamos').find(p => p.movimiento_id === mov.id);
}

const ingreso = (e, extra) => e.porRevisar(Object.assign({ tipo: 'ingreso', comercio: 'JUAN PRUEBA', monto: 50, monto_pen: 50 }, extra));
const todosLosBotones = ed => (ed.reply_markup ? ed.reply_markup.inline_keyboard.flat() : []);

test('elegir Préstamos crea el préstamo y pregunta la fecha; "Esta semana" fija el domingo', () => {
  const e = entornoBot();
  const mov = e.porRevisar({ comercio: 'Juan Prueba', monto: 200, monto_pen: 200 });
  e.tocar(e.dato('c', mov, e.categoria('Préstamos')));
  const ed = e.ultimoEditado();
  assert.match(ed.text, /🤝 Préstamo a <b>Juan Prueba<\/b> · S\/ 200\.00\n¿Para cuándo te lo devuelve\?$/);
  assert.deepStrictEqual(e.botones(ed).map(f => f.map(b => b.text)),
    [['Mañana', 'Esta semana'], ['Fin de quincena', 'Fin de mes'], ['Sin fecha']]);
  assert.ok(!/Recordar/.test(ed.text));
  const p = e.filas('Prestamos')[0];
  assert.deepStrictEqual([p.persona, Number(p.monto), p.movimiento_id], ['Juan Prueba', 200, mov.id]);
  e.tocar('f:' + e.interno('compactarId_', p.id) + ':s');
  assert.strictEqual(e.filas('Prestamos')[0].fecha_promesa, '2026-10-18');
  const final = e.ultimoEditado();
  assert.match(final.text, /🤝 Préstamo a <b>Juan Prueba<\/b> · S\/ 200\.00 · vuelve el dom 18\/10$/);
  assert.ok(!final.reply_markup);
});

test('las otras fechas prometidas: mañana, quincena, fin de mes y sin fecha', () => {
  const e = entornoBot();
  const p = prestar(e, 'Ana Ejemplo', 80);
  const f = letra => { e.tocar('f:' + e.interno('compactarId_', p.id) + ':' + letra); return e.filas('Prestamos')[0].fecha_promesa; };
  assert.strictEqual(f('m'), '2026-10-14');
  assert.strictEqual(f('q'), '2026-10-15');
  assert.strictEqual(f('f'), '2026-10-31');
  assert.strictEqual(f('n'), '');
  assert.match(e.ultimoEditado().text, /🤝 Préstamo a <b>Ana Ejemplo<\/b> · S\/ 80\.00$/);
  e.tocar('f:~no-existe:s');
  assert.strictEqual(e.ultimoEditado().text, 'Ese préstamo ya no existe.');
});

test('elegir Reembolsos muestra primero el préstamo de la misma persona y abonar descuenta', () => {
  const e = entornoBot();
  const juan = prestar(e, 'Juan Prueba', 200, '2026-10-01');
  prestar(e, 'Ana Ejemplo', 80, '2026-10-05');
  const mov = ingreso(e);
  e.tocar(e.dato('c', mov, e.categoria('Reembolsos')));
  assert.strictEqual(e.mov(mov.id).estado, 'por_revisar');
  const ed = e.ultimoEditado();
  assert.match(ed.text, /\n¿De qué es este reembolso\?$/);
  const filas = e.botones(ed);
  assert.deepStrictEqual(filas[0].map(b => b.text), ['🤝 Préstamo de Juan Prueba (faltan S/ 200.00)']);
  assert.deepStrictEqual(filas[1].map(b => b.text), ['🤝 Préstamo de Ana Ejemplo (faltan S/ 80.00)']);
  assert.strictEqual(filas[2].length, 3);
  filas[2].forEach(b => assert.match(b.callback_data, /^g:/));
  assert.ok(filas[2].every(b => !/Préstamos/.test(b.text)));
  assert.deepStrictEqual(filas[3].map(b => b.text), ['Otras categorías…', '← Volver']);

  e.tocar(filas[0][0].callback_data);
  assert.deepStrictEqual([e.mov(mov.id).estado, e.mov(mov.id).categoria_id], ['confirmado', e.categoria('Reembolsos')]);
  const abonos = e.filas('Abonos');
  assert.deepStrictEqual(abonos.map(a => [a.prestamo_id, Number(a.monto), a.movimiento_id]), [[juan.id, 50, mov.id]]);
  assert.match(e.ultimoEditado().text, /\n✓ Abono de <b>Juan Prueba<\/b> · faltan S\/ 150\.00$/);

  const resto = ingreso(e, { monto: 150, monto_pen: 150 });
  e.tocar(e.dato('c', resto, e.categoria('Reembolsos')));
  e.tocar(e.botones(e.ultimoEditado())[0][0].callback_data);
  assert.match(e.ultimoEditado().text, /\n✓ Juan Prueba te pagó todo 🎉$/);
  assert.strictEqual(e.filas('Prestamos').find(p => p.id === juan.id).estado, 'pagado');
});

test('tocar dos veces el botón de abono no crea dos abonos', () => {
  const e = entornoBot();
  const p = prestar(e, 'Juan Prueba', 200);
  const importado = ingreso(e);
  const deBot = ingreso(e, { origen: 'telegram', ref_externa: 'tg:9' });
  [importado, deBot].forEach(mov => {
    const dato = 'p:' + e.interno('compactarId_', mov.id) + ':' + e.interno('compactarId_', p.id);
    e.tocar(dato);
    e.tocar(dato);
    assert.match(e.ultimoEditado().text, /\nYa estaba en 🔁 Reembolsos$/);
  });
  assert.strictEqual(e.filas('Abonos').length, 2);
  assert.strictEqual(e.llamadas('sendMessage').filter(m => /No pude/.test(m.text)).length, 0);
});

test('reembolso de cena desde el bot: g resta de Comida fuera', () => {
  const e = entornoBot();
  const comida = e.categoria('Comida fuera');
  const mov = ingreso(e, { monto: 40, monto_pen: 40, comercio: 'ANA EJEMPLO' });
  e.tocar(e.dato('c', mov, e.categoria('Reembolsos')));
  e.tocar(e.dato('h', mov));
  const todas = todosLosBotones(e.ultimoEditado());
  assert.ok(todas.some(b => b.callback_data === e.dato('g', mov, comida)));
  assert.ok(!todas.some(b => /Préstamos/.test(b.text)));
  assert.strictEqual(todas[todas.length - 1].text, '← Volver');
  e.tocar(todas[todas.length - 1].callback_data);
  assert.match(e.ultimoEditado().text, /¿De qué es este reembolso\?$/);

  e.tocar(e.dato('g', mov, comida));
  const r = e.mov(mov.id);
  assert.deepStrictEqual([r.tipo, Number(r.monto), Number(r.monto_pen), r.categoria_id, r.estado], ['gasto', -40, -40, comida, 'confirmado']);
  const ed = e.ultimoEditado();
  assert.match(ed.text, /\n✓ 🍽️? ?Comida fuera · 🙋 Personal · reembolso$/u);
  assert.ok(e.botones(ed).flat().every(b => /^a:/.test(b.callback_data)));
  e.tocar(e.dato('g', mov, comida));
  assert.strictEqual(Number(e.mov(mov.id).monto), -40);
  assert.strictEqual(e.filas('Abonos').length, 0);
});

test('todos los callback_data nuevos caben en 64 bytes', () => {
  const e = entornoBot();
  const p = prestar(e, 'Juan Prueba', 200);
  const botones = todosLosBotones(e.ultimoEditado());
  const mov = ingreso(e);
  e.tocar(e.dato('c', mov, e.categoria('Reembolsos')));
  botones.push(...todosLosBotones(e.ultimoEditado()));
  e.tocar(e.dato('h', mov));
  botones.push(...todosLosBotones(e.ultimoEditado()));
  assert.ok(botones.length > 10);
  assert.ok(botones.some(b => b.callback_data.indexOf('f:' + e.interno('compactarId_', p.id)) === 0));
  botones.forEach(b => assert.ok(Buffer.byteLength(b.callback_data) <= 64, b.callback_data));
});

test('escrito: un préstamo pregunta la fecha y un reembolso pregunta de qué es', () => {
  const e = entornoBot();
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1234', yape: true });
  e.escribir('juan prueba 120 préstamos');
  const enviado = e.ultimoEnviado();
  assert.match(enviado.text, /🤝 Préstamo a <b>juan prueba<\/b> · S\/ 120\.00\n¿Para cuándo te lo devuelve\?$/);
  const filas = e.botones(enviado).map(f => f.map(b => b.text));
  assert.deepStrictEqual(filas.slice(0, 3), [['Mañana', 'Esta semana'], ['Fin de quincena', 'Fin de mes'], ['Sin fecha']]);
  assert.deepStrictEqual(filas[3], ['Deshacer', 'Cambiar categoría']);
  const p = e.filas('Prestamos')[0];
  e.tocar('f:' + e.interno('compactarId_', p.id) + ':m');
  assert.deepStrictEqual(e.botones(e.ultimoEditado()).map(f => f.map(b => b.text)), [['Deshacer', 'Cambiar categoría']]);

  e.escribir('+ juan prueba 20 reembolsos');
  const r = e.ultimoEnviado();
  assert.match(r.text, /¿De qué es este reembolso\?$/);
  assert.strictEqual(e.botones(r)[0][0].text, '🤝 Préstamo de juan prueba (faltan S/ 120.00)');
  e.tocar(e.botones(r)[0][0].callback_data);
  assert.match(e.ultimoEditado().text, /✓ Abono de <b>juan prueba<\/b> · faltan S\/ 100\.00$/);
});

test('deshacer desde el bot un préstamo con abonos muestra el error en el mensaje y no borra', () => {
  const e = entornoBot();
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1234', yape: true });
  e.escribir('juan prueba 120 préstamos');
  const mov = e.filas('Movimientos').find(m => m.origen === 'telegram');
  const p = e.filas('Prestamos')[0];
  e.llamar('registrarAbono', { prestamo_id: p.id, monto: 20 });
  e.tocar(e.dato('d', mov));
  assert.ok(e.mov(mov.id));
  assert.match(e.ultimoEditado().text, /\n⚠️ Este préstamo ya tiene abonos: bórralos primero en Préstamos\.$/);
  // Cambiar la categoría tampoco lo deja sin su préstamo.
  e.tocar(e.dato('c', mov, e.categoria('Comida fuera')));
  assert.strictEqual(e.mov(mov.id).categoria_id, e.categoria('Préstamos'));
  assert.match(e.ultimoEnviado().text, /No pude completar eso: Este préstamo ya tiene abonos/);
});

test('cambiar la categoría de un gasto del bot a Préstamos crea el préstamo; sacarlo lo borra', () => {
  const e = entornoBot();
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1234', yape: true });
  e.escribir('ana ejemplo 30 comida fuera');
  const mov = e.filas('Movimientos').find(m => m.origen === 'telegram');
  e.tocar(e.dato('c', mov, e.categoria('Préstamos')));
  assert.strictEqual(e.filas('Prestamos').length, 1);
  assert.match(e.ultimoEditado().text, /¿Para cuándo te lo devuelve\?$/);
  e.tocar(e.dato('c', mov, e.categoria('Comida fuera')));
  assert.strictEqual(e.filas('Prestamos').length, 0);
  assert.strictEqual(e.mov(mov.id).categoria_id, e.categoria('Comida fuera'));

  // Con la categoría de reembolsos (un ingreso del bot) se abre el selector sin escribir.
  e.escribir('+ ana ejemplo 15 sueldo');
  const ing = e.filas('Movimientos').find(m => m.origen === 'telegram' && m.tipo === 'ingreso');
  e.tocar(e.dato('c', ing, e.categoria('Reembolsos')));
  assert.strictEqual(e.mov(ing.id).categoria_id, e.categoria('Sueldo'));
  assert.match(e.ultimoEditado().text, /¿De qué es este reembolso\?$/);
});

test('un "Sí, recordar" viejo sobre un préstamo no crea regla ni rompe', () => {
  const e = entornoBot();
  const mov = e.porRevisar({ comercio: 'Juan Prueba', monto: 200, monto_pen: 200 });
  e.tocar(e.dato('c', mov, e.categoria('Préstamos')));
  e.tocar(e.dato('r', mov));
  assert.strictEqual(e.filas('Reglas').length, 0);
  assert.match(e.ultimoEditado().text, /\n✓ 🤝 Préstamos( · 🙋 Personal)?$/);
  assert.strictEqual(e.llamadas('sendMessage').filter(m => /No pude/.test(m.text)).length, 0);
});
