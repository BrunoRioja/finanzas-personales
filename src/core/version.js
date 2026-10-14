// Versión de esta copia de la app. Una prueba exige que sea la de package.json.
const VERSION_APP = '0.7.1';
const URL_REPO = 'https://github.com/BrunoRioja/finanzas-personales';

function partesVersion_(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v == null ? '' : v).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

// Por número en cada parte: 0.10.0 es mayor que 0.9.0. Un texto inválido vale 0.0.0.
function compararVersiones_(a, b) {
  const x = partesVersion_(a);
  const y = partesVersion_(b);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  }
  return 0;
}
