const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

const e = crearEntorno();
const f = (nombre, ...args) => e.llamar(nombre, ...args);

// Datos ficticios.
const EC_ANTERIOR = { id: 'ec1', cuenta_id: 'visa', emitido: '2026-08-28', total_pen: 600, total_usd: 20, minimo_pen: 90, minimo_usd: 10, fecha_limite: '2026-09-22', ref_externa: '' };
const EC = { id: 'ec2', cuenta_id: 'visa', emitido: '2026-09-30', total_pen: 800, total_usd: 50, minimo_pen: 120, minimo_usd: 10, fecha_limite: '2026-10-20', ref_externa: '' };
const pago = (fecha, monto, moneda, destino) => ({ tipo: 'transferencia', fecha, monto, moneda: moneda || 'PEN', cuenta_destino_id: destino || 'visa', estado: 'confirmado' });
const CUENTAS = [{ id: 'deb', nombre: 'Débito BCP' }, { id: 'visa', nombre: 'VISA BCP' }];
const CATEGORIAS = [{ id: 'sus', nombre: 'Suscripciones', emoji: '📺' }, { id: 'gym', nombre: 'Salud y gym', emoji: '💪' }];
const rec = (id, nombre, monto, dia, extra) => Object.assign({ id, nombre, monto, moneda: 'PEN', cuenta_id: 'deb', categoria_id: 'sus', dia_mes: dia, activo: true }, extra);
const datos = extra => Object.assign({ recurrentes: [], estados: [], cuentas: CUENTAS, categorias: CATEGORIAS, movimientos: [], tcUsd: 3.75 }, extra);

test('sumarDias_, diasEntre_, diaSemana_ y fechaCorta_', () => {
  assert.strictEqual(f('sumarDias_', '2026-10-30', 3), '2026-11-02');
  assert.strictEqual(f('sumarDias_', '2026-03-01', -1), '2026-02-28');
  assert.strictEqual(f('diasEntre_', '2026-10-13', '2026-11-12'), 30);
  assert.strictEqual(f('diasEntre_', '2026-10-13', '2026-10-10'), -3);
  assert.strictEqual(f('diaSemana_', '2026-10-16'), 'vie');
  assert.strictEqual(f('fechaCorta_', '2026-11-05'), '05/11');
});

test('fechaRecurrente_: este mes si aún no pasa, si no el siguiente; en meses cortos el último día', () => {
  assert.strictEqual(f('fechaRecurrente_', 20, '2026-10-13'), '2026-10-20');
  assert.strictEqual(f('fechaRecurrente_', 13, '2026-10-13'), '2026-10-13');
  assert.strictEqual(f('fechaRecurrente_', 5, '2026-10-13'), '2026-11-05');
  assert.strictEqual(f('fechaRecurrente_', 31, '2026-11-10'), '2026-11-30');
  assert.strictEqual(f('fechaRecurrente_', 30, '2027-02-01'), '2027-02-28');
  assert.strictEqual(f('fechaRecurrente_', 29, '2027-01-30'), '2027-02-28');
  assert.strictEqual(f('fechaRecurrente_', 31, '2026-12-31'), '2026-12-31');
});

test('estadoTarjeta_: cada moneda con lo suyo; cuentan los pagos desde el día siguiente al vencimiento anterior', () => {
  const movs = [
    pago('2026-09-22', 500), // último día del estado anterior: no cuenta
    pago('2026-09-27', 800), // antes de que llegue el correo: sí cuenta
    pago('2026-10-06', 4, 'USD'),
    pago('2026-10-07', 100, 'PEN', 'otra'),
    { tipo: 'gasto', fecha: '2026-10-08', monto: 30, moneda: 'USD', cuenta_destino_id: '' },
  ];
  const t = f('estadoTarjeta_', EC, [EC_ANTERIOR, EC], movs);
  assert.deepStrictEqual(t.pen, { total: 800, minimo: 120, pagado: 800, falta: 0, estado: 'pagado' });
  assert.deepStrictEqual(t.usd, { total: 50, minimo: 10, pagado: 4, falta: 46, estado: 'pendiente' });
  const t2 = f('estadoTarjeta_', EC, [EC_ANTERIOR, EC], movs.concat([pago('2026-10-09', 6, 'USD', 'visa')]));
  assert.strictEqual(t2.usd.estado, 'minimo');
  assert.strictEqual(t2.usd.falta, 40);
});

test('estadoTarjeta_: sin estado anterior cuenta desde 10 días antes del correo; una moneda en 0 es null', () => {
  const solo = Object.assign({}, EC, { total_usd: 0, minimo_usd: 0 });
  const t = f('estadoTarjeta_', solo, [solo], [pago('2026-09-19', 50), pago('2026-09-20', 70)]);
  assert.strictEqual(t.pen.pagado, 70);
  assert.strictEqual(t.pen.estado, 'pendiente');
  assert.strictEqual(t.usd, null);
});

test('proximosPagos_: recurrentes activos en 30 días ordenados por fecha, con la tarjeta y lo que falta pagar', () => {
  const r = f('proximosPagos_', datos({
    recurrentes: [rec('r1', 'Streaming', 20.9, 5), rec('r2', 'Gimnasio', 120, 15, { categoria_id: 'gym' }),
      rec('r3', 'Nube', 2, 13, { moneda: 'USD' }), rec('r4', 'Apagado', 50, 14, { activo: false })],
    estados: [EC], movimientos: [pago('2026-10-06', 800)],
  }), '2026-10-13');
  assert.deepStrictEqual(r.pagos.map(p => [p.nombre, p.fecha, p.dias]), [
    ['Nube', '2026-10-13', 0], ['Gimnasio', '2026-10-15', 2], ['VISA BCP', '2026-10-20', 7], ['Streaming', '2026-11-05', 23],
  ]);
  assert.deepStrictEqual(r.pagos[1], { tipo: 'recurrente', id: 'r2', nombre: 'Gimnasio', emoji: '💪', fecha: '2026-10-15', dias: 2, monto: 120, moneda: 'PEN', cuenta: 'Débito BCP' });
  const visa = r.pagos[2];
  assert.strictEqual(visa.tipo, 'tarjeta');
  assert.strictEqual(visa.emoji, '💳');
  assert.strictEqual(visa.pen.estado, 'pagado');
  assert.strictEqual(visa.usd.estado, 'pendiente');
  assert.strictEqual(visa.vencido, false);
  // 2 × 3.75 + 120 + 50 × 3.75 + 20.9
  assert.strictEqual(r.porPagar, 335.9);
});

test('proximosPagos_: la tarjeta pagada se ve hasta su vencimiento; impaga y vencida queda marcada; solo el último estado de cuenta', () => {
  const pagada = [pago('2026-10-06', 800), pago('2026-10-06', 50, 'USD')];
  const conPagada = hoy => f('proximosPagos_', datos({ estados: [EC], movimientos: pagada }), hoy).pagos;
  assert.strictEqual(conPagada('2026-10-20').length, 1);
  assert.strictEqual(conPagada('2026-10-21').length, 0);
  const vencida = f('proximosPagos_', datos({ estados: [EC] }), '2026-10-22');
  assert.strictEqual(vencida.pagos[0].vencido, true);
  assert.strictEqual(vencida.pagos[0].dias, -2);
  assert.strictEqual(vencida.porPagar, 987.5);
  const r = f('proximosPagos_', datos({ estados: [EC_ANTERIOR, EC] }), '2026-10-13');
  assert.deepStrictEqual(r.pagos.map(p => p.id), ['ec2']);
});

test('totalPagosFijos_ suma los activos y pasa los dólares a soles', () => {
  const lista = [rec('a', 'A', 20.9, 1), rec('b', 'B', 2, 1, { moneda: 'USD' }), rec('c', 'C', 50, 1, { activo: false })];
  assert.strictEqual(f('totalPagosFijos_', lista, 3.75), 28.4);
});
