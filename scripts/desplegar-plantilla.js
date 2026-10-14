// Crea (la primera vez) y actualiza la hoja plantilla pública ("Hacer una copia").
// Solo sube el código: la plantilla nunca se publica ni ejecuta nada, así su proyecto no
// tiene propiedades (Google las copia junto con la hoja). plantilla/.clasp.json y
// plantilla/src/ no se versionan.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DIR = path.join(RAIZ, 'plantilla');
const correr = comando => execSync(comando, { cwd: DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
// -P con ruta absoluta: sin él, clasp sube por las carpetas y encuentra el .clasp.json de la app.
const clasp = 'npx clasp -P "' + DIR + '" ';
const idDe = archivo => (fs.existsSync(archivo) ? JSON.parse(fs.readFileSync(archivo, 'utf8')).scriptId : '');

fs.mkdirSync(DIR, { recursive: true });
if (!fs.existsSync(path.join(DIR, '.clasp.json'))) {
  console.log(correr(clasp + 'create-script --type sheets --title "Finanzas personales — plantilla" --rootDir src'));
}
const plantilla = JSON.parse(fs.readFileSync(path.join(DIR, '.clasp.json'), 'utf8'));
const otros = [idDe(path.join(RAIZ, '.clasp.json')), idDe(path.join(RAIZ, 'receptor', '.clasp.json'))].filter(Boolean);
if (!plantilla.scriptId || otros.indexOf(plantilla.scriptId) >= 0) {
  throw new Error('plantilla/.clasp.json no apunta a un proyecto propio de la plantilla.');
}
fs.rmSync(path.join(DIR, 'src'), { recursive: true, force: true });
fs.cpSync(path.join(RAIZ, 'src'), path.join(DIR, 'src'), { recursive: true });
console.log(correr(clasp + 'push --force'));
const hoja = [].concat(plantilla.parentId || [])[0];
console.log(hoja
  ? 'Enlace "Hacer una copia": https://docs.google.com/spreadsheets/d/' + hoja + '/copy'
  : 'Busca la hoja "Finanzas personales — plantilla" en Drive y usa su id en https://docs.google.com/spreadsheets/d/<id>/copy');
