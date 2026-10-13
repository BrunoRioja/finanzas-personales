// Sube el código y actualiza siempre el mismo despliegue para que la URL no cambie.
// El id del despliegue se guarda en .despliegue (ignorado por git).
const { execSync } = require('child_process');
const fs = require('fs');

const ARCHIVO = '.despliegue';
const correr = comando => execSync(comando, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

console.log(correr('npx clasp push --force'));
if (fs.existsSync(ARCHIVO)) {
  const id = fs.readFileSync(ARCHIVO, 'utf8').trim();
  console.log(correr('npx clasp create-deployment -i ' + id + ' -d "npm run deploy"'));
  console.log('Despliegue actualizado: ' + id);
} else {
  const salida = correr('npx clasp create-deployment -d "npm run deploy"');
  console.log(salida);
  const id = (/AKfy[\w-]+/.exec(salida) || [])[0];
  if (!id) throw new Error('No pude leer el id del despliegue en la salida de clasp.');
  fs.writeFileSync(ARCHIVO, id + '\n');
  console.log('Despliegue creado: ' + id + ' (guardado en ' + ARCHIVO + ')');
}
console.log('URL: https://script.google.com/macros/s/' + fs.readFileSync(ARCHIVO, 'utf8').trim() + '/exec');
