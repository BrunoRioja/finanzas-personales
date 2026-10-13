// Crea (la primera vez) y actualiza el proyecto receptor del webhook de Telegram.
// Usa la app como biblioteca en modo desarrollo: siempre corre el último código subido.
// receptor/.clasp.json, receptor/.despliegue y receptor/appsscript.json no se versionan.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DIR = path.join(RAIZ, 'receptor');
const correr = comando => execSync(comando, { cwd: DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
// -P fija el proyecto del receptor: sin él, clasp sube por las carpetas, encuentra el
// .clasp.json de la app y desplegaría sobre ella.
const clasp = 'npx clasp -P "' + DIR + '" ';

const app = JSON.parse(fs.readFileSync(path.join(RAIZ, '.clasp.json'), 'utf8'));
if (!app.scriptId) throw new Error('Falta .clasp.json de la app: instala la app antes que el receptor.');

if (!fs.existsSync(path.join(DIR, '.clasp.json'))) {
  console.log(correr(clasp + 'create-script --type standalone --title "Finanzas · receptor de Telegram" --rootDir .'));
}
const receptor = JSON.parse(fs.readFileSync(path.join(DIR, '.clasp.json'), 'utf8'));
if (!receptor.scriptId || receptor.scriptId === app.scriptId) throw new Error('receptor/.clasp.json no apunta a un proyecto propio del receptor.');
const manifiesto = {
  timeZone: 'America/Lima',
  runtimeVersion: 'V8',
  exceptionLogging: 'STACKDRIVER',
  dependencies: { libraries: [{ userSymbol: 'Finanzas', libraryId: app.scriptId, version: '1', developmentMode: true }] },
  oauthScopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/script.external_request',
  ],
  webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' },
};
fs.writeFileSync(path.join(DIR, 'appsscript.json'), JSON.stringify(manifiesto, null, 2) + '\n');
console.log(correr(clasp + 'push --force'));

const ARCHIVO = path.join(DIR, '.despliegue');
let id = fs.existsSync(ARCHIVO) ? fs.readFileSync(ARCHIVO, 'utf8').trim() : '';
if (id) {
  console.log(correr(clasp + 'create-deployment -i ' + id + ' -d "npm run deploy:receptor"'));
} else {
  const salida = correr(clasp + 'create-deployment -d "npm run deploy:receptor"');
  console.log(salida);
  id = (/AKfy[\w-]+/.exec(salida) || [])[0];
  if (!id) throw new Error('No pude leer el id del despliegue en la salida de clasp.');
  fs.writeFileSync(ARCHIVO, id + '\n');
}
console.log('Editor del receptor (ejecuta "autorizar" una vez): https://script.google.com/d/' + receptor.scriptId + '/edit');
console.log('URL del receptor (pégala en Ajustes → Telegram): https://script.google.com/macros/s/' + id + '/exec');
