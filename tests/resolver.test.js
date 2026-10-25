const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

const CTX = {
  cuentas: [
    { id: 'deb', nombre: 'Débito', numeros: '4444, 1111', yape: true, activa: true },
    { id: 'aho', nombre: 'Ahorro', numeros: '3333', yape: false, activa: true },
    { id: 'visa', nombre: 'VISA', numeros: '2222', yape: false, activa: true },
    { id: 'vieja', nombre: 'Vieja', numeros: '9999', yape: false, activa: false },
  ],
  categorias: [
    { id: 'super', tipo: 'gasto', activa: true },
    { id: 'taxi', tipo: 'gasto', activa: true },
    { id: 'sueldo', tipo: 'ingreso', activa: true },
    { id: 'apagada', tipo: 'gasto', activa: false },
  ],
  reglas: [
    { id: 'r1', patron: 'TOTTUS', categoria_id: 'super' },
    { id: 'r2', patron: 'TOTTUS PRUEBA', categoria_id: 'taxi' },
    { id: 'r3', patron: 'APAGADA', categoria_id: 'apagada' },
    { id: 'r4', patron: 'EMPRESA', categoria_id: 'super' },
  ],
  tcUsd: 3.75,
};
const crudo = c => Object.assign({ tipo: 'gasto', monto: 89.3, moneda: 'PEN', comercio: 'Tottus Prueba Sur', numero_origen: '1111', fecha: '2026-10-06', ref_externa: 'gmail:x' }, c);
const resolver = (e, c, ctx) => e.llamar('resolverMovimiento_', crudo(c), Object.assign({}, CTX, ctx));

test('gasto con cuenta por número y regla (gana la más larga) → confirmado', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(resolver(e, {}), {
    fecha: '2026-10-06', tipo: 'gasto', monto: 89.3, moneda: 'PEN', tc: 1, monto_pen: 89.3,
    cuenta_id: 'deb', cuenta_destino_id: '', categoria_id: 'taxi', comercio: 'Tottus Prueba Sur', descripcion: '',
    origen: 'gmail', estado: 'confirmado', ref_externa: 'gmail:x', dividido: false, regla_id: 'r2',
  });
});

test('sin regla, o con regla a categoría desactivada o de otro tipo → por revisar', () => {
  const e = crearEntorno();
  const sinRegla = resolver(e, { comercio: 'CLARO' });
  assert.strictEqual(sinRegla.estado, 'por_revisar');
  assert.strictEqual(sinRegla.categoria_id, '');
  assert.strictEqual(sinRegla.regla_id, '');
  assert.strictEqual(resolver(e, { comercio: 'APAGADA SAC' }).estado, 'por_revisar');
  const ingreso = resolver(e, { tipo: 'ingreso', comercio: 'EMPRESA DEMO' });
  assert.strictEqual(ingreso.categoria_id, '');
  assert.strictEqual(ingreso.estado, 'por_revisar');
});

test('Yape va a la cuenta marcada; números desconocidos o de cuentas desactivadas quedan sin cuenta', () => {
  const e = crearEntorno();
  assert.strictEqual(resolver(e, { usa_yape: true, numero_origen: undefined }).cuenta_id, 'deb');
  const desconocido = resolver(e, { numero_origen: '7777' });
  assert.strictEqual(desconocido.cuenta_id, '');
  assert.strictEqual(desconocido.estado, 'por_revisar');
  assert.strictEqual(resolver(e, { numero_origen: '9999' }).cuenta_id, '');
  assert.strictEqual(resolver(e, { usa_yape: true }, { cuentas: CTX.cuentas.map(c => Object.assign({}, c, { yape: false })) }).cuenta_id, '');
});

test('transferencia: confirmada con ambas cuentas; sin destino queda por revisar', () => {
  const e = crearEntorno();
  const t = resolver(e, { tipo: 'transferencia', comercio: '', descripcion: 'Transferencia entre mis cuentas', numero_origen: '3333', numero_destino: '4444', monto: 290.26 });
  assert.strictEqual(t.cuenta_id, 'aho');
  assert.strictEqual(t.cuenta_destino_id, 'deb');
  assert.strictEqual(t.estado, 'confirmado');
  assert.strictEqual(t.descripcion, 'Transferencia entre mis cuentas');
  assert.strictEqual(resolver(e, { tipo: 'transferencia', numero_origen: '3333', numero_destino: '5555' }).estado, 'por_revisar');
});

test('dólares: usa el tc del correo, si no el último conocido, y si no hay queda por revisar', () => {
  const e = crearEntorno();
  assert.strictEqual(resolver(e, { moneda: 'USD', monto: 23.6 }).monto_pen, 88.5);
  assert.strictEqual(resolver(e, { moneda: 'USD', monto: 105.52, tc: 3.477 }).monto_pen, 366.89);
  const sinTc = resolver(e, { moneda: 'USD', monto: 23.6 }, { tcUsd: 0 });
  assert.strictEqual(sinTc.tc, 0);
  assert.strictEqual(sinTc.monto_pen, 0);
  assert.strictEqual(sinTc.estado, 'por_revisar');
  assert.strictEqual(sinTc.descripcion, 'Falta el tipo de cambio de USD');
});

test('reglaPara_ compara sin tildes ni mayúsculas', () => {
  const e = crearEntorno();
  assert.strictEqual(e.llamar('reglaPara_', 'tóttus plaza', [{ id: 'a', patron: 'TOTTUS' }]).id, 'a');
  assert.strictEqual(e.llamar('reglaPara_', '', [{ id: 'a', patron: 'TOTTUS' }]), null);
  assert.strictEqual(e.llamar('reglaPara_', 'METRO', [{ id: 'a', patron: 'TOTTUS' }]), null);
});

test('una regla hacia la categoría de préstamos no categoriza: el yapeo queda por revisar; sin el rol vuelve a categorizar', () => {
  const e = crearEntorno();
  const categorias = CTX.categorias.concat([{ id: 'prest', tipo: 'gasto', activa: true, rol: 'prestamo' }]);
  const reglas = [{ id: 'r9', patron: 'JUAN PRUEBA', categoria_id: 'prest' }];
  const sinRol = categorias.map(c => (c.id === 'prest' ? { id: 'prest', tipo: 'gasto', activa: true, rol: '' } : c));
  const m = e.llamar('resolverMovimiento_', crudo({ comercio: 'Juan Prueba' }), Object.assign({}, CTX, { categorias, reglas }));
  assert.deepStrictEqual([m.estado, m.categoria_id, m.regla_id], ['por_revisar', '', '']);
  const m2 = e.llamar('resolverMovimiento_', crudo({ comercio: 'Juan Prueba' }), Object.assign({}, CTX, { categorias: sinRol, reglas }));
  assert.deepStrictEqual([m2.estado, m2.categoria_id, m2.regla_id], ['confirmado', 'prest', 'r9']);
});

test('cuenta por banco y tipo cuando el correo no trae número (Sip)', () => {
  const e = crearEntorno();
  const cuentas = [
    { id: 'sipdeb', nombre: 'Sip', banco: 'Sip', tipo: 'debito', numeros: '', activa: true },
    { id: 'sipaho', nombre: 'AhorraMás', banco: 'SIP', tipo: 'ahorro', numeros: '', activa: true },
    { id: 'bcpdeb', nombre: 'BCP', banco: 'BCP', tipo: 'debito', numeros: '1111', activa: true },
  ];
  const sinNumero = { numero_origen: '', banco: 'Sip', tipo_origen: 'debito', comercio: 'Tottus' };
  const gasto = resolver(e, sinNumero, { cuentas });
  assert.deepStrictEqual([gasto.cuenta_id, gasto.estado], ['sipdeb', 'confirmado']);
  const transf = resolver(e, Object.assign({}, sinNumero, { tipo: 'transferencia', tipo_destino: 'ahorro' }), { cuentas });
  assert.deepStrictEqual([transf.cuenta_id, transf.cuenta_destino_id, transf.estado], ['sipdeb', 'sipaho', 'confirmado']);
  // Dos cuentas del mismo banco y tipo: no se adivina, queda por revisar.
  const dos = cuentas.concat([{ id: 'sipdeb2', nombre: 'Sip 2', banco: 'Sip', tipo: 'debito', numeros: '', activa: true }]);
  const ambiguo = resolver(e, sinNumero, { cuentas: dos });
  assert.deepStrictEqual([ambiguo.cuenta_id, ambiguo.estado], ['', 'por_revisar']);
});
