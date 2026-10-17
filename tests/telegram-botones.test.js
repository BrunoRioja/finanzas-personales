const test = require('node:test');
const assert = require('node:assert');
const { entornoBot } = require('./telegram');

test('elegir categoría confirma, pregunta si recordar y "Sí, recordar" crea la regla y confirma los del mismo comercio', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  const otro = e.porRevisar({ monto: 20, monto_pen: 20 });
  const sup = e.categoria('Supermercado');
  e.tocar(e.dato('c', mov, sup));
  assert.deepStrictEqual([e.mov(mov.id).estado, e.mov(mov.id).categoria_id], ['confirmado', sup]);
  const ed = e.ultimoEditado();
  assert.strictEqual(ed.message_id, 77);
  assert.match(ed.text, /\n✓ 🛒 Supermercado · 🙋 Personal\n¿Recordar para <b>TOTTUS PRIMAVERA<\/b>\?$/);
  assert.deepStrictEqual(e.botones(ed)[0].map(b => b.text), ['Sí, recordar', 'Solo esta vez']);
  assert.strictEqual(e.llamadas('answerCallbackQuery').length, 1);

  e.tocar(e.dato('r', mov));
  assert.deepStrictEqual(e.filas('Reglas').map(r => [r.patron, r.categoria_id]), [['TOTTUS PRIMAVERA', sup]]);
  assert.deepStrictEqual([e.mov(otro.id).estado, e.mov(otro.id).categoria_id], ['confirmado', sup]);
  const final = e.ultimoEditado();
  assert.match(final.text, /✓ 🛒 Supermercado · 🙋 Personal · recordado para <b>TOTTUS PRIMAVERA<\/b> \(\+1 más\)$/);
  assert.deepStrictEqual(e.botones(final).map(f => f.length), [3, 1]);
  assert.strictEqual(e.botones(final)[1][0].text, '✏️ Descripción');
});

test('"Solo esta vez" no crea reglas', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  e.tocar(e.dato('c', mov, e.categoria('Supermercado')));
  e.tocar(e.dato('s', mov));
  assert.strictEqual(e.filas('Reglas').length, 0);
  assert.match(e.ultimoEditado().text, /\n✓ 🛒 Supermercado · 🙋 Personal$/);
});

test('"Otra…" muestra todas las categorías del tipo, 2 por fila; "← Volver" regresa a las 3', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  e.tocar(e.dato('o', mov));
  const todas = e.botones(e.ultimoEditado());
  const gastos = e.llamar('obtenerCatalogos').categorias.filter(c => c.tipo === 'gasto' && c.activa).length;
  assert.strictEqual(todas.length, Math.ceil(gastos / 2) + 1);
  assert.deepStrictEqual(todas[todas.length - 1].map(b => b.text), ['← Volver']);
  todas.flat().forEach(b => assert.ok(Buffer.byteLength(b.callback_data) <= 64));
  e.tocar(e.dato('v', mov));
  const tres = e.botones(e.ultimoEditado());
  assert.strictEqual(tres[0].length, 3);
  assert.strictEqual(tres[1][0].text, 'Otra…');
});

test('botón viejo: ya categorizado en la app o borrado → lo dice y no cambia nada', () => {
  const e = entornoBot();
  const sup = e.categoria('Supermercado');
  const listo = e.porRevisar({ estado: 'confirmado', categoria_id: sup });
  e.tocar(e.dato('c', listo, e.categoria('Ropa')));
  assert.strictEqual(e.mov(listo.id).categoria_id, sup);
  assert.match(e.ultimoEditado().text, /\nYa estaba en 🛒 Supermercado$/);
  e.tocar('c:' + e.interno('compactarId_', '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b') + ':~x');
  assert.strictEqual(e.ultimoEditado().text, 'Ese movimiento ya no existe.');
  assert.strictEqual(e.llamadas('answerCallbackQuery').length, 2);
});

test('Deshacer y Cambiar categoría solo para lo registrado por el bot', () => {
  const e = entornoBot();
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1234', yape: true });
  e.interno('guardarRegla_', 'TAXI', e.categoria('Transporte'));
  e.escribir('taxi 12');
  const escrito = e.filas('Movimientos').find(m => m.origen === 'telegram');
  e.tocar(e.dato('k', escrito));
  assert.ok(e.botones(e.ultimoEditado()).length > 3);
  e.tocar(e.dato('c', escrito, e.categoria('Comida fuera')));
  assert.deepStrictEqual([e.mov(escrito.id).categoria_id, e.mov(escrito.id).estado], [e.categoria('Comida fuera'), 'confirmado']);
  assert.deepStrictEqual(e.botones(e.ultimoEditado())[0].map(b => b.text), ['Deshacer', 'Cambiar categoría']);
  e.tocar(e.dato('d', escrito));
  assert.strictEqual(e.mov(escrito.id), undefined);
  assert.match(e.ultimoEditado().text, /^↩ Deshecho: S\/ 12\.00 · taxi$/);

  const importado = e.porRevisar();
  e.tocar(e.dato('d', importado));
  assert.ok(e.mov(importado.id));
  assert.match(e.ultimoEditado().text, /\nSolo se puede deshacer lo registrado por el bot\.$/);
});

test('"Todo bien" del resumen deja el texto escapado con ✓ Visto y sin botones', () => {
  const e = entornoBot();
  e.tocar('ok', 'Resumen <b> & más');
  const ed = e.ultimoEditado();
  assert.strictEqual(ed.text, 'Resumen &lt;b&gt; &amp; más\n✓ Visto');
  assert.ok(!('reply_markup' in ed));
});

test('una categoría de otro tipo da error en el chat, queda en el Log y no cambia el movimiento', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  e.tocar(e.dato('c', mov, e.categoria('Sueldo')));
  assert.strictEqual(e.mov(mov.id).estado, 'por_revisar');
  assert.strictEqual(e.ultimoEnviado().text, '⚠️ No pude completar eso: La categoría "Sueldo" no es de gasto.');
  assert.strictEqual(e.filas('Log').filter(l => l.origen === 'telegram' && l.nivel === 'error').length, 1);
  assert.strictEqual(e.llamadas('answerCallbackQuery').length, 1);
});

test('tras categorizar se muestra el ámbito y una fila con los otros; tocar uno lo cambia y mantiene "¿Recordar?"', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  const amb = nombre => e.llamar('obtenerCatalogos').ambitos.find(a => a.nombre === nombre).id;
  e.tocar(e.dato('c', mov, e.categoria('Transporte')));
  const ed = e.ultimoEditado();
  assert.match(ed.text, /\n✓ 🚕 Transporte · 🙋 Personal\n¿Recordar para/);
  const filas = e.botones(ed);
  assert.deepStrictEqual(filas[0].map(b => b.text), ['Sí, recordar', 'Solo esta vez']);
  assert.deepStrictEqual(filas[1].map(b => b.text), ['🎉 Diversión', '👨‍👩‍👧 Familia', '💼 Trabajo']);
  filas.flat().forEach(b => assert.ok(Buffer.byteLength(b.callback_data) <= 64, b.callback_data));

  e.tocar(filas[1][2].callback_data);
  assert.strictEqual(e.mov(mov.id).ambito_id, amb('Trabajo'));
  const despues = e.ultimoEditado();
  assert.match(despues.text, /✓ 🚕 Transporte · 💼 Trabajo\n¿Recordar para/);
  assert.deepStrictEqual(e.botones(despues)[1].map(b => b.text), ['🙋 Personal', '🎉 Diversión', '👨‍👩‍👧 Familia']);

  e.tocar(e.botones(despues)[1][0].callback_data);
  assert.strictEqual(e.mov(mov.id).ambito_id, '');
});

test('"Solo esta vez" deja la fila de ámbitos; cambiar el ámbito después no vuelve a preguntar', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  e.tocar(e.dato('c', mov, e.categoria('Transporte')));
  e.tocar(e.dato('s', mov));
  const ed = e.ultimoEditado();
  assert.match(ed.text, /\n✓ 🚕 Transporte · 🙋 Personal$/);
  assert.deepStrictEqual(e.botones(ed).map(f => f.length), [3, 1]);
  e.tocar(e.botones(ed)[0][0].callback_data);
  assert.match(e.ultimoEditado().text, /· 🎉 Diversión$/);
  assert.strictEqual(e.botones(e.ultimoEditado()).length, 2);
});

test('botón de ámbito en un movimiento borrado o aún por revisar no rompe', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  const div = e.llamar('obtenerCatalogos').ambitos.find(a => a.nombre === 'Diversión').id;
  e.tocar(e.dato('a', mov, div));
  assert.strictEqual(e.mov(mov.id).ambito_id, '');
  assert.strictEqual(e.botones(e.ultimoEditado())[1][0].text, 'Otra…');
  e.tocar('a:' + e.interno('compactarId_', '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b') + ':~personal');
  assert.strictEqual(e.ultimoEditado().text, 'Ese movimiento ya no existe.');
});
