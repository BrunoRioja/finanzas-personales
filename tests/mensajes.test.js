const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

const e = crearEntorno();
const f = (nombre, ...args) => e.llamar(nombre, ...args);

const UUID_MOV = '0b6f3c1e-8f7a-4c2d-9e5b-1a2b3c4d5e6f';
const UUID_SUPER = '7d2e9a40-1c3b-4f5e-8a6d-2b3c4d5e6f70';
const UUID_COMIDA = 'c4a1e2f3-5b6c-4d7e-8f90-a1b2c3d4e5f6';
const CATS = [
  { id: UUID_SUPER, nombre: 'Supermercado', emoji: '🛒', tipo: 'gasto', activa: true },
  { id: UUID_COMIDA, nombre: 'Comida fuera', emoji: '🍽️', tipo: 'gasto', activa: true },
  { id: 'cat-trans', nombre: 'Transporte', emoji: '🚕', tipo: 'gasto', activa: true },
  { id: 'cat-ropa', nombre: 'Ropa', emoji: '👕', tipo: 'gasto', activa: true },
  { id: 'cat-vieja', nombre: 'Vieja', emoji: '', tipo: 'gasto', activa: false },
  { id: 'cat-sueldo', nombre: 'Sueldo', emoji: '💼', tipo: 'ingreso', activa: true },
];
const CUENTAS = [{ id: 'cu-visa', nombre: 'VISA <BCP>', numeros: '2222' }, { id: 'cu-deb', nombre: 'Débito BCP', numeros: '1111' }];
const URL_APP = 'https://script.google.com/macros/s/APP/exec';
const CTX = { cuentas: CUENTAS, categorias: CATS, urlApp: URL_APP, hoy: '2026-10-13' };
const MOV = {
  id: UUID_MOV, fecha: '2026-10-13', tipo: 'gasto', monto: 45.9, moneda: 'PEN', monto_pen: 45.9, cuenta_id: 'cu-visa',
  cuenta_destino_id: '', categoria_id: '', comercio: 'TOTTUS & <CIA>', descripcion: '', estado: 'por_revisar', origen: 'gmail',
};
const C = id => f('compactarId_', id);

test('escaparHtml_ y formatoMonto_', () => {
  assert.strictEqual(f('escaparHtml_', 'A & <b>'), 'A &amp; &lt;b&gt;');
  assert.strictEqual(f('escaparHtml_', null), '');
  assert.strictEqual(f('formatoMonto_', 45.9, 'PEN'), 'S/ 45.90');
  assert.strictEqual(f('formatoMonto_', 1250, 'PEN'), 'S/ 1,250.00');
  assert.strictEqual(f('formatoMonto_', 1234567.5, 'PEN'), 'S/ 1,234,567.50');
  assert.strictEqual(f('formatoMonto_', 23.6, 'USD'), 'US$ 23.60');
  assert.strictEqual(f('formatoMonto_', -40, 'PEN'), '−S/ 40.00');
});

test('compactarId_/expandirId_: un UUID cabe en 22 caracteres y vuelve igual; otros ids van con ~', () => {
  const c = C(UUID_MOV);
  assert.match(c, /^[A-Za-z0-9_-]{22}$/);
  assert.strictEqual(f('expandirId_', c), UUID_MOV);
  assert.strictEqual(f('expandirId_', C(UUID_SUPER)), UUID_SUPER);
  assert.strictEqual(C('id-0001'), '~id-0001');
  assert.strictEqual(f('expandirId_', '~id-0001'), 'id-0001');
  assert.strictEqual(C(UUID_MOV.toUpperCase()), '~' + UUID_MOV.toUpperCase());
  assert.strictEqual(f('expandirId_', 'basura'), '');
  assert.strictEqual(f('expandirId_', undefined), '');
});

test('textoMovimiento_ escapa datos, dice "hoy" o la fecha, y nunca muestra números de cuenta', () => {
  assert.strictEqual(f('textoMovimiento_', MOV, CTX), '🛒 <b>S/ 45.90</b> · VISA &lt;BCP&gt;\nTOTTUS &amp; &lt;CIA&gt; · hoy');
  assert.strictEqual(f('textoMovimiento_', Object.assign({}, MOV, { fecha: '2026-10-12' }), CTX).split('\n')[1], 'TOTTUS &amp; &lt;CIA&gt; · 12/10');
  const tr = Object.assign({}, MOV, { tipo: 'transferencia', cuenta_destino_id: 'cu-deb', comercio: '' });
  assert.strictEqual(f('textoMovimiento_', tr, CTX), '🔁 <b>S/ 45.90</b> · VISA &lt;BCP&gt; → Débito BCP\nSin descripción · hoy');
  assert.ok(!/2222|1111/.test(f('textoMovimiento_', tr, CTX)));
});

test('tecladoCategorias_: 3 frecuentes, Otra… y Abrir en la app; todo callback_data ≤ 64 bytes', () => {
  const t = f('tecladoCategorias_', MOV, [UUID_SUPER, UUID_COMIDA, 'cat-trans', 'cat-ropa'], CTX);
  assert.deepStrictEqual(t[0].map(b => b.text), ['🛒 Supermercado', '🍽️ Comida fuera', '🚕 Transporte']);
  assert.strictEqual(t[0][0].callback_data, 'c:' + C(UUID_MOV) + ':' + C(UUID_SUPER));
  assert.deepStrictEqual(t[1], [{ text: 'Otra…', callback_data: 'o:' + C(UUID_MOV) }, { text: 'Abrir en la app', url: URL_APP }]);
  t.flat().filter(b => b.callback_data).forEach(b => assert.ok(Buffer.byteLength(b.callback_data) <= 64, b.callback_data));
  const sinApp = f('tecladoCategorias_', MOV, [UUID_SUPER], Object.assign({}, CTX, { urlApp: '' }));
  assert.deepStrictEqual(sinApp[1], [{ text: 'Otra…', callback_data: 'o:' + C(UUID_MOV) }]);
});

test('tecladoTodas_: categorías activas del tipo, 2 por fila, y ← Volver', () => {
  const t = f('tecladoTodas_', MOV, CTX);
  assert.deepStrictEqual(t.map(fila => fila.map(b => b.text)), [
    ['🛒 Supermercado', '🍽️ Comida fuera'], ['🚕 Transporte', '👕 Ropa'], ['← Volver'],
  ]);
  assert.strictEqual(t[2][0].callback_data, 'v:' + C(UUID_MOV));
  t.flat().forEach(b => assert.ok(Buffer.byteLength(b.callback_data) <= 64));
});

test('mensajePorRevisar_: sin cuenta o transferencia → solo Abrir en la app; si no, categorías', () => {
  const sinCuenta = f('mensajePorRevisar_', Object.assign({}, MOV, { cuenta_id: '' }), [UUID_SUPER], CTX);
  assert.match(sinCuenta.texto, /\n<i>Elige la cuenta en la app\.<\/i>$/);
  assert.deepStrictEqual(sinCuenta.teclado, [[{ text: 'Abrir en la app', url: URL_APP }]]);
  const tr = f('mensajePorRevisar_', Object.assign({}, MOV, { tipo: 'transferencia' }), [], CTX);
  assert.match(tr.texto, /Elige la cuenta destino en la app\./);
  const sinApp = f('mensajePorRevisar_', Object.assign({}, MOV, { cuenta_id: '' }), [], Object.assign({}, CTX, { urlApp: '' }));
  assert.strictEqual(sinApp.teclado, null);
  const normal = f('mensajePorRevisar_', MOV, [UUID_SUPER], CTX);
  assert.strictEqual(normal.texto, f('textoMovimiento_', MOV, CTX));
  assert.strictEqual(normal.teclado[0][0].text, '🛒 Supermercado');
});

test('mensajeAgrupado_, textoCategorizado_, tecladoRecordar_, textoRegistrado_ y tecladoRegistrado_', () => {
  assert.deepStrictEqual(f('mensajeAgrupado_', 7, URL_APP), {
    texto: '📥 <b>7 movimientos nuevos por revisar</b>', teclado: [[{ text: 'Abrir la app', url: URL_APP }]],
  });
  assert.strictEqual(f('mensajeAgrupado_', 7, '').teclado, null);
  assert.strictEqual(f('textoCategorizado_', MOV, UUID_SUPER, CTX, ' · extra'), f('textoMovimiento_', MOV, CTX) + '\n✓ 🛒 Supermercado · extra');
  assert.deepStrictEqual(f('tecladoRecordar_', MOV), [[
    { text: 'Sí, recordar', callback_data: 'r:' + C(UUID_MOV) }, { text: 'Solo esta vez', callback_data: 's:' + C(UUID_MOV) },
  ]]);
  const escrito = Object.assign({}, MOV, { monto: 12, comercio: 'taxi', categoria_id: 'cat-trans', cuenta_id: 'cu-deb' });
  assert.strictEqual(f('textoRegistrado_', escrito, CTX), '✓ <b>S/ 12.00</b> · taxi · 🚕 Transporte · Débito BCP');
  assert.deepStrictEqual(f('tecladoRegistrado_', escrito), [[
    { text: 'Deshacer', callback_data: 'd:' + C(UUID_MOV) }, { text: 'Cambiar categoría', callback_data: 'k:' + C(UUID_MOV) },
  ]]);
});

test('textoResumen_: vacío sin movimientos; totales, líneas escapadas y pie', () => {
  assert.strictEqual(f('textoResumen_', [], CTX, { porRevisar: 3, noLeidos: 0 }), '');
  const movs = [
    { tipo: 'gasto', monto: 45.9, moneda: 'PEN', monto_pen: 45.9, categoria_id: UUID_SUPER, comercio: 'Tottus', estado: 'confirmado' },
    { tipo: 'ingreso', monto: 100, moneda: 'PEN', monto_pen: 100, categoria_id: 'cat-sueldo', comercio: 'Ana <Empresa>', estado: 'confirmado' },
    { tipo: 'gasto', monto: 12, moneda: 'PEN', monto_pen: 12, categoria_id: '', comercio: 'PLIN-X', estado: 'por_revisar' },
  ];
  assert.strictEqual(f('textoResumen_', movs, CTX, { porRevisar: 1, noLeidos: 1 }),
    '📊 <b>Hoy · S/ 57.90 en gastos</b>\n💰 S/ 100.00 en ingresos\n\n' +
    '• S/ 45.90 🛒 Supermercado — Tottus\n• S/ 100.00 💼 Sueldo — Ana &lt;Empresa&gt;\n• S/ 12.00 ⚠ por revisar — PLIN-X\n\n' +
    '1 por revisar · 1 correo no leído');
  const muchos = Array.from({ length: 16 }, () => movs[0]);
  const texto = f('textoResumen_', muchos, CTX, { porRevisar: 0, noLeidos: 2 });
  assert.strictEqual(texto.split('\n').filter(l => l.startsWith('• ')).length, 15);
  assert.match(texto, /\n…y 1 más\n\n2 correos no leídos$/);
});

test('textoMes_', () => {
  assert.strictEqual(f('textoMes_', '2026-10', { ingresos: 3500, gastos: 1200.5, ahorro: 2299.5, tasaAhorro: 66 }, [
    { nombre: 'Supermercado', emoji: '🛒', monto: 800, porcentaje: 67 }, { nombre: 'Ropa & más', emoji: '', monto: 400.5, porcentaje: 33 },
  ]), '📅 <b>Mes 2026-10</b>\n💰 Ingresos: S/ 3,500.00\n🛒 Gastos: S/ 1,200.50\n🐷 Ahorro: S/ 2,299.50 (66 %)\n\n' +
    '<b>Top categorías</b>\n• 🛒 Supermercado — S/ 800.00 (67 %)\n• Ropa &amp; más — S/ 400.50 (33 %)');
  assert.strictEqual(f('textoMes_', '2026-10', { ingresos: 0, gastos: 0, ahorro: 0, tasaAhorro: null }, []),
    '📅 <b>Mes 2026-10</b>\n💰 Ingresos: S/ 0.00\n🛒 Gastos: S/ 0.00\n🐷 Ahorro: S/ 0.00');
});
