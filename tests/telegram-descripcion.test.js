const test = require('node:test');
const assert = require('node:assert');
const { entornoBot, CHAT } = require('./telegram');
const { entornoInstalado } = require('./fixtures');

let ultimo = 5000;
// Bot con cuenta Yape y una regla para "taxi", para registrar gastos escritos.
function entorno() {
  const e = entornoBot();
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1234', yape: true });
  e.interno('guardarRegla_', 'TAXI', e.categoria('Transporte'));
  return e;
}
// Respuesta (reply) del chat a un mensaje del bot.
const responder = (e, texto, aQuien) => {
  ultimo++;
  e.enviar({ update_id: ultimo, message: { message_id: ultimo, chat: { id: CHAT }, text: texto, reply_to_message: aQuien } });
};

test('✏️ pide la descripción y la respuesta la guarda y actualiza el aviso', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  e.tocar(e.dato('e', mov));
  const pedido = e.ultimoEnviado();
  assert.match(pedido.text, /^✏️ Escribe la descripción para <b>S\/ 45\.90<\/b> · TOTTUS PRIMAVERA$/);
  assert.strictEqual(pedido.reply_markup.force_reply, true);
  assert.strictEqual(e.llamadas('editMessageText').length, 0);
  e.enviar({ update_id: 5000, message: { message_id: 900, chat: { id: CHAT }, text: 'compras de la semana',
    reply_to_message: { message_id: 101 } } });   // 101 = message_id que devolvió el pedido
  assert.strictEqual(e.mov(mov.id).descripcion, 'compras de la semana');
  assert.strictEqual(e.mov(mov.id).comercio, 'TOTTUS PRIMAVERA');
  assert.match(e.ultimoEditado().text, /compras de la semana · hoy\n<i>TOTTUS PRIMAVERA<\/i>/);
  assert.strictEqual(e.ultimoEditado().message_id, 77);
  // El aviso por revisar conserva sus botones (categorías + ✏️).
  assert.deepStrictEqual(e.botones(e.ultimoEditado()).slice(-1)[0].map(b => b.text), ['✏️ Descripción']);
  assert.strictEqual(e.ultimoEnviado().text, '✓ Descripción guardada');
});

test('responder al aviso original (con teclado) también cambia la descripción', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  e.interno('avisarPorRevisar_', [mov]);
  const aviso = e.ultimoEnviado();
  responder(e, 'pasaje de <mamá>', { message_id: 101, text: aviso.text, reply_markup: aviso.reply_markup });
  assert.strictEqual(e.mov(mov.id).descripcion, 'pasaje de <mamá>');
  const editado = e.ultimoEditado();
  assert.strictEqual(editado.message_id, 101);
  assert.match(editado.text, /pasaje de &lt;mamá&gt; · hoy\n<i>TOTTUS PRIMAVERA<\/i>/);
  assert.strictEqual(e.ultimoEnviado().text, '✓ Descripción guardada');
});

test('responder al aviso de un movimiento categorizado o registrado por el bot lo actualiza con sus botones', () => {
  const e = entorno();
  const mov = e.porRevisar();
  e.tocar(e.dato('c', mov, e.categoria('Supermercado')));
  const aviso = e.ultimoEditado();
  responder(e, 'víveres', { message_id: 77, reply_markup: aviso.reply_markup });
  const editado = e.ultimoEditado();
  assert.match(editado.text, /víveres · hoy\n<i>TOTTUS PRIMAVERA<\/i>\n✓ 🛒 Supermercado/);
  assert.deepStrictEqual(e.botones(editado).slice(-1)[0].map(b => b.text), ['✏️ Descripción']);

  e.escribir('taxi 12 yape');
  const registrado = e.ultimoEnviado();
  const delBot = e.filas('Movimientos').find(m => m.origen === 'telegram');
  responder(e, 'al aeropuerto', { message_id: 101, reply_markup: registrado.reply_markup });
  assert.strictEqual(e.mov(delBot.id).descripcion, 'al aeropuerto');
  assert.match(e.ultimoEditado().text, /^✓ <b>S\/ 12\.00<\/b> · al aeropuerto · /);
  assert.deepStrictEqual(e.botones(e.ultimoEditado())[0].map(b => b.text), ['Deshacer', 'Cambiar categoría']);
});

test('responder a un resumen o a /pagos se trata como texto normal', () => {
  const e = entorno();
  const antes = e.filas('Movimientos').length;
  responder(e, 'taxi 12 yape', { message_id: 300, text: '📊 Hoy · S/ 0.00 en gastos' });
  responder(e, 'taxi 15 yape', { message_id: 301, text: 'Próximos pagos', reply_markup: { inline_keyboard: [[{ text: 'Visto', callback_data: 'ok' }]] } });
  assert.strictEqual(e.filas('Movimientos').length, antes + 2);
  assert.match(e.ultimoEnviado().text, /^✓ <b>S\/ 15\.00<\/b> · taxi/);
});

test('un comando en respuesta a un aviso sigue siendo comando', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  e.tocar(e.dato('e', mov));
  responder(e, '/ayuda', { message_id: 101 });
  assert.strictEqual(e.mov(mov.id).descripcion, '');
  assert.match(e.ultimoEnviado().text, /<b>Registrar un gasto<\/b>/);
});

test('respuesta vacía borra la descripción; más de 100 caracteres se recorta', () => {
  const e = entornoBot();
  const mov = e.porRevisar({ descripcion: 'algo viejo' });
  e.tocar(e.dato('e', mov));
  responder(e, 'x'.repeat(130), { message_id: 101 });
  assert.strictEqual(e.mov(mov.id).descripcion, 'x'.repeat(100));
  e.tocar(e.dato('e', mov));
  responder(e, '   ', { message_id: 103 });
  assert.strictEqual(e.mov(mov.id).descripcion, '');
  assert.strictEqual(e.ultimoEnviado().text, '✓ Descripción borrada');
  assert.match(e.ultimoEditado().text, /\nTOTTUS PRIMAVERA · hoy/);
});

test('responder por un movimiento que ya no existe avisa', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  e.tocar(e.dato('e', mov));
  e.interno('eliminarFila_', 'Movimientos', mov.id);
  responder(e, 'compras', { message_id: 101 });
  assert.strictEqual(e.ultimoEnviado().text, 'Ese movimiento ya no existe.');
});

test('un mensaje que no es respuesta sigue registrando gastos', () => {
  const e = entorno();
  const antes = e.filas('Movimientos').length;
  e.escribir('taxi 25.50 yape');
  assert.strictEqual(e.filas('Movimientos').length, antes + 1);
  assert.match(e.ultimoEnviado().text, /^✓ <b>S\/ 25\.50<\/b> · taxi/);
});

test('movimientoDeTeclado_: prefiere ✏️, ignora fechas de préstamo y botones sin movimiento', () => {
  const e = entornoBot();
  const C = id => e.interno('compactarId_', id);
  const id = '0b6f3c1e-8f7a-4c2d-9e5b-1a2b3c4d5e6f';
  const de = filas => e.interno('movimientoDeTeclado_', { inline_keyboard: filas });
  const b = data => ({ text: 'x', callback_data: data });
  assert.strictEqual(de([[b('f:' + C('otro-id') + ':m')], [b('d:' + C(id))]]), id);
  assert.strictEqual(de([[b('c:' + C('mov-a') + ':' + C('cat'))], [b('e:' + C(id))]]), id);
  assert.strictEqual(de([[b('f:' + C(id) + ':m')], [b('ok')], [{ text: 'App', url: 'https://x' }]]), '');
  assert.strictEqual(e.interno('movimientoDeTeclado_', undefined), '');
});

test('tituloMovimiento_: "Pago de tarjeta" no es descripción propia', () => {
  const e = entornoBot();
  const t = mov => [e.interno('tituloMovimiento_', mov), e.interno('subtituloMovimiento_', mov), e.interno('descripcionPropia_', mov)];
  assert.deepStrictEqual(t({ comercio: 'BCP', descripcion: 'Pago de tarjeta' }), ['BCP', '', false]);
  assert.deepStrictEqual(t({ comercio: '', descripcion: 'Transferencia entre mis cuentas' }), ['Transferencia entre mis cuentas', '', false]);
  assert.deepStrictEqual(t({ comercio: 'AMAZON', descripcion: 'Falta el tipo de cambio de USD' }), ['AMAZON', '', false]);
  assert.deepStrictEqual(t({ comercio: 'TOTTUS', descripcion: 'compras' }), ['compras', 'TOTTUS', true]);
  assert.deepStrictEqual(t({ comercio: '', descripcion: 'compras' }), ['compras', '', true]);
  assert.deepStrictEqual(t({ comercio: 'TOTTUS', descripcion: '' }), ['TOTTUS', '', false]);
});

test('listarMovimientos y obtenerPorRevisar traen titulo y subtitulo', () => {
  const e = entornoInstalado();
  e.llamar('guardarMovimiento', { fecha: '2026-10-06', tipo: 'gasto', monto: 20, cuenta_id: e.cuenta('Débito BCP'),
    categoria_id: e.categoria('Supermercado'), comercio: 'Tottus', descripcion: 'compras de la semana' });
  const [m] = e.llamar('listarMovimientos', { mes: '2026-10' });
  assert.deepStrictEqual([m.titulo, m.subtitulo], ['compras de la semana', 'Tottus']);
  e.interno('agregarFilas_', 'Movimientos', [{ id: 'rv1', fecha: '2026-10-07', tipo: 'gasto', monto: 5, moneda: 'PEN', tc: 1, monto_pen: 5,
    cuenta_id: '', cuenta_destino_id: '', categoria_id: '', comercio: 'PLAZA VEA', descripcion: '', origen: 'gmail',
    estado: 'por_revisar', ref_externa: 'gmail:rv1', dividido: false, creado_en: '2026-10-07 09:00:00' }]);
  const [r] = e.llamar('obtenerPorRevisar').movimientos;
  assert.deepStrictEqual([r.titulo, r.subtitulo], ['PLAZA VEA', '']);
});

test('responder al aviso de un préstamo conserva el texto del préstamo y la pregunta de la fecha', () => {
  const e = entornoBot();
  const mov = e.porRevisar({ comercio: 'Juan Prueba', monto: 200, monto_pen: 200 });
  e.tocar(e.dato('c', mov, e.categoria('Préstamos')));
  responder(e, 'para el pasaje', { message_id: 77, reply_markup: e.ultimoEditado().reply_markup });
  const ed = e.ultimoEditado();
  assert.match(ed.text, /para el pasaje · hoy\n<i>Juan Prueba<\/i>\n🤝 Préstamo a <b>Juan Prueba<\/b> · S\/ 200\.00\n¿Para cuándo/);
  assert.deepStrictEqual(e.botones(ed).map(f => f[0].text), ['Mañana', 'Fin de quincena', 'Sin fecha', '✏️ Descripción']);
  assert.strictEqual(e.filas('Prestamos')[0].persona, 'Juan Prueba');
});
