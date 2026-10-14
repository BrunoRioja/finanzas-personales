const test = require('node:test');
const assert = require('node:assert');
const { entornoBot } = require('./telegram');
const { ASUNTOS, html } = require('./correos');

test('al llegar el estado de cuenta avisa por Telegram con totales, mínimos y vencimiento', () => {
  const e = entornoBot({ correos: [{ id: 'g7', de: 'estadodecuenta@notificacionesbcp.com.pe', asunto: ASUNTOS.estadoCuenta, html: html('estado-cuenta.html'), recibido: '2026-10-11T10:00:00' }] });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.limpiarTelegram();
  e.llamar('revisarCorreos');
  assert.strictEqual(e.enviados().length, 1);
  assert.strictEqual(e.ultimoEnviado().text,
    '💳 Llegó tu estado de cuenta VISA BCP: S/ 1,234.50 + US$ 45.60 · mínimo S/ 150.00 + US$ 10.00 · vence el 05/11.');
});

test('textoLlegoEstadoCuenta_ omite la moneda sin deuda y escapa el nombre', () => {
  const e = entornoBot();
  const ec = { total_pen: 300, total_usd: 0, minimo_pen: 40, minimo_usd: 0, fecha_limite: '2026-11-05' };
  assert.strictEqual(e.llamar('textoLlegoEstadoCuenta_', ec, 'Visa <A&B>'),
    '💳 Llegó tu estado de cuenta Visa &lt;A&amp;B&gt;: S/ 300.00 · mínimo S/ 40.00 · vence el 05/11.');
});
