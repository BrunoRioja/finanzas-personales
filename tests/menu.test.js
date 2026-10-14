const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

test('onOpen agrega el menú 💸 Finanzas con sus dos opciones', () => {
  const e = crearEntorno();
  e.llamar('onOpen');
  assert.deepStrictEqual(e.ui.menus, [{
    titulo: '💸 Finanzas', items: [['Abrir mi app', 'abrirMiApp'], ['Cómo publicar mi app', 'comoPublicarMiApp']],
  }]);
});

test('Abrir mi app muestra el enlace si está publicada y los pasos si no', () => {
  const e = crearEntorno();
  e.llamar('abrirMiApp');
  assert.strictEqual(e.ui.dialogos[0].titulo, 'Tu app');
  assert.match(e.ui.dialogos[0].html, /href="https:\/\/script\.google\.com\/macros\/s\/APP-PRUEBA\/exec"/);
  e.servicio.url = null;
  e.llamar('abrirMiApp');
  assert.strictEqual(e.ui.dialogos[1].titulo, 'Cómo publicar tu app');
  assert.match(e.ui.dialogos[1].html, /Nueva implementación/);
  assert.match(e.ui.dialogos[1].html, /no verificó/);
  e.llamar('comoPublicarMiApp');
  assert.strictEqual(e.ui.dialogos[2].html, e.ui.dialogos[1].html);
});

test('htmlEnlaceApp_ escapa la URL', () => {
  const e = crearEntorno();
  const html = e.llamar('htmlEnlaceApp_', 'https://x/"><script>alert(1)</script>');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
});

test('el manifiesto pide el permiso de interfaz de la hoja si el código usa getUi', () => {
  const fs = require('fs');
  const path = require('path');
  const manifiesto = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'appsscript.json'), 'utf8'));
  const usaUi = fs.readFileSync(path.join(__dirname, '..', 'src', 'web', 'menu.js'), 'utf8').includes('getUi(');
  assert.ok(usaUi);
  assert.ok(manifiesto.oauthScopes.includes('https://www.googleapis.com/auth/script.container.ui'));
});
