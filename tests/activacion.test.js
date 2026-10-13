const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');
const { ASUNTOS, html } = require('./correos');

test('configurarLectura deja un solo trigger con la frecuencia elegida', () => {
  const e = entornoInstalado();
  assert.deepStrictEqual(e.llamar('configurarLectura', { frecuencia: '5', etiquetar: true }), {
    activa: true, frecuencia: '5', etiquetar: true, importar_desde: '2026-10-01', ultima_revision: '', info: '',
    horario_inicio: 7, horario_fin: 24,
  });
  assert.deepStrictEqual(e.triggers.map(t => [t.funcion, t.cada]), [['revisarCorreos', '5 min']]);
  const horaria = e.llamar('configurarLectura', { frecuencia: '60', etiquetar: false });
  assert.deepStrictEqual(e.triggers.map(t => t.cada), ['1 h']);
  assert.strictEqual(horaria.etiquetar, false);
  assert.strictEqual(horaria.importar_desde, '2026-10-01');
  assert.strictEqual(e.llamar('configurarLectura', { frecuencia: 'manual' }).activa, true);
  assert.strictEqual(e.triggers.length, 0);
  assert.strictEqual(e.llamar('configurarLectura', { frecuencia: 'apagada' }).activa, false);
  assert.strictEqual(e.triggers.length, 0);
  assert.throws(() => e.interno('configurarLectura', { frecuencia: '7' }), /Frecuencia inválida/);
});

test('estadoLectura sin configurar', () => {
  const e = entornoInstalado();
  assert.deepStrictEqual(e.llamar('estadoLectura'), { activa: false, frecuencia: 'apagada', etiquetar: true, importar_desde: '', ultima_revision: '', info: '', horario_inicio: 7, horario_fin: 24 });
});

test('importarCorreosDesde valida la fecha, reinicia el cursor y trae los correos anteriores', () => {
  const correos = [
    { id: 'g1', de: 'notificaciones@notificacionesbcp.com.pe', asunto: ASUNTOS.debito, html: html('debito.html'), recibido: '2026-10-06T16:19:00' },
    { id: 'g8', de: 'notificaciones@notificacionesbcp.com.pe', asunto: ASUNTOS.debito, html: html('debito.html'), recibido: '2026-09-20T10:00:00' },
  ];
  const e = entornoInstalado({ correos });
  e.llamar('configurarLectura', { frecuencia: '5' });
  assert.strictEqual(e.llamar('revisarCorreos').leidos, 1);
  const r = e.llamar('importarCorreosDesde', '2026-09-01');
  assert.strictEqual(r.leidos, 1);
  assert.strictEqual(r.creados, 1);
  assert.strictEqual(e.llamar('estadoLectura').importar_desde, '2026-09-01');
  assert.throws(() => e.interno('importarCorreosDesde', '01/09/2026'), /Fecha inválida/);
  assert.throws(() => e.interno('importarCorreosDesde', '2026-12-01'), /futuro/);
});

test('horario de lectura: se configura y se valida', () => {
  const e = entornoInstalado();
  const est = e.llamar('configurarLectura', { frecuencia: '5', horario_inicio: '8', horario_fin: '22' });
  assert.strictEqual(est.horario_inicio, 8);
  assert.strictEqual(est.horario_fin, 22);
  assert.throws(() => e.interno('configurarLectura', { frecuencia: '5', horario_inicio: 22, horario_fin: 8 }), /horario/);
  assert.throws(() => e.interno('configurarLectura', { frecuencia: '5', horario_inicio: 7, horario_fin: 25 }), /horario/);
});
