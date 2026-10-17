const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const paquete = require('../package.json');

const REPO = 'https://github.com/BrunoRioja/finanzas-personales';
const ADAPTAR = REPO + '/blob/main/docs/adaptar-con-claude.md#antes-de-actualizar';

test('la versión de la app es la del package.json', () => {
  const e = crearEntorno();
  assert.strictEqual(e.llamar('estadoVersion').actual, paquete.version);
});

test('compararVersiones_ compara número por número', () => {
  const e = crearEntorno();
  const c = (a, b) => e.llamar('compararVersiones_', a, b);
  assert.strictEqual(c('0.10.0', '0.9.0'), 1);
  assert.strictEqual(c('0.7.0', '0.7.0'), 0);
  assert.strictEqual(c('0.7.0', '1.0.0'), -1);
  assert.strictEqual(c('basura', '0.0.1'), -1);
  assert.strictEqual(c('', '0.0.0'), 0);
});

test('estadoVersion no consulta GitHub', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('estadoVersion'), {
    actual: paquete.version, repo: REPO, cambios: REPO + '/blob/main/CHANGELOG.md', actualizar: REPO + '/blob/main/docs/actualizar.md',
    adaptarBanco: ADAPTAR,
  });
  assert.strictEqual(e.github.llamadas, 0);
});

test('buscarActualizacion consulta GitHub cada vez que se pide y avisa si hay una versión mayor', () => {
  const e = crearEntorno();
  e.github.version = '9.0.0';
  assert.deepStrictEqual(e.llamar('buscarActualizacion'), {
    actual: paquete.version, repo: REPO, cambios: REPO + '/blob/main/CHANGELOG.md', actualizar: REPO + '/blob/main/docs/actualizar.md',
    adaptarBanco: ADAPTAR, ultima: '9.0.0', hayNueva: true, error: false,
  });
  e.github.version = paquete.version;
  const r = e.llamar('buscarActualizacion');
  assert.strictEqual(r.hayNueva, false);
  assert.strictEqual(r.error, false);
  assert.strictEqual(e.github.llamadas, 2, 'sin caché: cada toque consulta');
});

test('con GitHub caído buscarActualizacion no lanza y lo dice', () => {
  const e = crearEntorno();
  e.github.falla = true;
  const r = e.llamar('buscarActualizacion');
  assert.strictEqual(r.error, true);
  assert.strictEqual(r.hayNueva, false);
  assert.strictEqual(r.ultima, '');
});

test('estadoVersion trae el enlace adaptarBanco a la sección "Antes de actualizar"', () => {
  const e = crearEntorno();
  assert.strictEqual(e.llamar('estadoVersion').adaptarBanco, ADAPTAR);
});
