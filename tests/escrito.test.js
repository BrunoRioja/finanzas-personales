const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

const e = crearEntorno();
const CUENTAS = [
  { id: 'cu-deb', nombre: 'Débito BCP', tipo: 'debito', moneda: 'PEN', activa: true, yape: true },
  { id: 'cu-visa', nombre: 'VISA BCP', tipo: 'credito', moneda: 'PEN', activa: true, yape: false },
  { id: 'cu-bill', nombre: 'Billetera', tipo: 'efectivo', moneda: 'PEN', activa: true, yape: false },
  { id: 'cu-vieja', nombre: 'Ahorro viejo', tipo: 'ahorro', moneda: 'PEN', activa: false, yape: false },
];
const CATEGORIAS = [
  { id: 'ca-super', nombre: 'Supermercado', tipo: 'gasto', activa: true },
  { id: 'ca-comida', nombre: 'Comida fuera', tipo: 'gasto', activa: true },
  { id: 'ca-comis', nombre: 'Comisiones bancarias', tipo: 'gasto', activa: true },
  { id: 'ca-trans', nombre: 'Transporte', tipo: 'gasto', activa: true },
  { id: 'ca-sueldo', nombre: 'Sueldo', tipo: 'ingreso', activa: true },
];
const REGLAS = [{ id: 're-taxi', patron: 'TAXI', categoria_id: 'ca-trans' }];
const leer = (texto, extra) => e.llamar('leerEscrito_', texto, Object.assign({ cuentas: CUENTAS, categorias: CATEGORIAS, reglas: REGLAS, cuentaBot: '' }, extra));

test('"taxi 12 yape": cuenta de Yape y categoría por regla', () => {
  assert.deepStrictEqual(leer('taxi 12 yape'), {
    ok: true, tipo: 'gasto', monto: 12, descripcion: 'taxi', cuenta_id: 'cu-deb', categoria_id: 'ca-trans', regla_id: 're-taxi',
  });
});

test('"almuerzo 25.50 efectivo comida": cuenta de efectivo y categoría por inicio de palabra', () => {
  assert.deepStrictEqual(leer('almuerzo 25.50 efectivo comida'), {
    ok: true, tipo: 'gasto', monto: 25.5, descripcion: 'almuerzo', cuenta_id: 'cu-bill', categoria_id: 'ca-comida', regla_id: '',
  });
});

test('montos: coma decimal, miles con coma y S/ pegado o separado', () => {
  [['pan 12,50', 12.5], ['pan S/12', 12], ['pan s/ 12.50', 12.5], ['pan S/. 7', 7], ['tv 1,250.00', 1250], ['tv 1,250', 1250], ['pan 3.5', 3.5]]
    .forEach(([texto, monto]) => assert.strictEqual(leer(texto).monto, monto, texto));
});

test('"+ sueldo 3500" es ingreso y toma la categoría por la descripción', () => {
  const r = leer('+ sueldo 3500');
  assert.deepStrictEqual([r.tipo, r.monto, r.descripcion, r.categoria_id, r.cuenta_id], ['ingreso', 3500, 'sueldo', 'ca-sueldo', 'cu-deb']);
});

test('cuenta por nombre completo o por inicio único; inactivas no cuentan', () => {
  assert.strictEqual(leer('cena 80 visa bcp').cuenta_id, 'cu-visa');
  assert.strictEqual(leer('cena 80 visa').cuenta_id, 'cu-visa');
  const r = leer('pan 5 ahorro viejo');
  assert.deepStrictEqual([r.cuenta_id, r.descripcion], ['cu-deb', 'pan ahorro viejo']);
});

test('cuenta por defecto: la de Ajustes si está activa, si no la de Yape; sin ninguna, error', () => {
  assert.strictEqual(leer('pan 5', { cuentaBot: 'cu-visa' }).cuenta_id, 'cu-visa');
  assert.strictEqual(leer('pan 5', { cuentaBot: 'cu-vieja' }).cuenta_id, 'cu-deb');
  const sinYape = CUENTAS.map(c => Object.assign({}, c, { yape: false }));
  const r = leer('pan 5', { cuentas: sinYape });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /Ajustes/);
});

test('el monto puede ir primero; el primer número de una cantidad no se toma como monto', () => {
  const a = leer('12 taxi yape');
  assert.deepStrictEqual([a.monto, a.descripcion, a.cuenta_id, a.categoria_id], [12, 'taxi', 'cu-deb', 'ca-trans']);
  const b = leer('2 cafés 8');
  assert.deepStrictEqual([b.monto, b.descripcion], [8, '2 cafés']);
});

test('palabras ambiguas o de otro tipo quedan en la descripción', () => {
  const a = leer('algo 5 comi');
  assert.deepStrictEqual([a.descripcion, a.categoria_id], ['algo comi', '']);
  const b = leer('+ venta 100 supermercado');
  assert.deepStrictEqual([b.tipo, b.descripcion, b.categoria_id], ['ingreso', 'venta supermercado', '']);
});

test('errores: sin monto, monto cero, sin descripción', () => {
  assert.match(leer('hola').error, /No entendí/);
  assert.match(leer('taxi 0').error, /mayor que cero/);
  assert.match(leer('12').error, /Falta la descripción/);
  assert.strictEqual(leer('').ok, false);
});
