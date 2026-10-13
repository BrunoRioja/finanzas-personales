// Abre src/web/Index.html en Chrome sin cabeza con google.script.run simulado
// (tests/ui/stub.js), ejecuta un script y muestra el texto visible de un elemento.
//
// Uso: node tests/ui/ver.js "<js a ejecutar>" <id del elemento> [captura.png] [ancho]
// Ej.: node tests/ui/ver.js "mostrar('movimientos')" vista captura.png 420
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WEB = path.join(__dirname, '..', '..', 'src', 'web');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [js, id, captura, ancho] = process.argv.slice(2);

let html = fs.readFileSync(path.join(WEB, 'Index.html'), 'utf8')
  .replace(/<\?!=\s*incluir_\('web\/([\w-]+)'\);?\s*\?>/g, (_, nombre) => fs.readFileSync(path.join(WEB, nombre + '.html'), 'utf8'));
const stub = fs.readFileSync(path.join(__dirname, 'stub.js'), 'utf8');
html = html.replace('<head>', () => '<head>\n<script>' + stub + '</script>');
const cierre = `<script>
window.addEventListener('error', function (e) { window.__error = String(e.message); });
window.addEventListener('load', function () {
  setTimeout(function () {
    try { ${js || ''} } catch (e) { window.__error = String(e); }
    setTimeout(function () {
      var el = document.getElementById(${JSON.stringify(id || 'vista')});
      var out = document.createElement('pre');
      out.id = '__salida';
      out.style.display = 'none';
      out.textContent = JSON.stringify({
        visible: el ? !!(el.offsetWidth || el.offsetHeight) : null,
        texto: el ? el.innerText : null,
        error: window.__error || null,
        llamadas: window.__llamadas.map(function (l) { return l.nombre; }),
      });
      document.body.appendChild(out);
    }, 1500);
  }, 500);
});
</script></body>`;
html = html.replace('</body>', () => cierre);

const tmp = path.join(os.tmpdir(), 'finanzas-ui-' + process.pid + '.html');
fs.writeFileSync(tmp, html);
const url = 'file:///' + tmp.replace(/\\/g, '/');
const base = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=' + (ancho || 420) + ',900', '--virtual-time-budget=6000'];
try {
  const dom = execFileSync(CHROME, [...base, '--dump-dom', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const m = /<pre id="__salida"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
  if (!m) { console.log('SIN SALIDA (la página no cargó)'); process.exitCode = 1; }
  else {
    const salida = JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    console.log(JSON.stringify(salida, null, 2));
  }
  if (captura) {
    execFileSync(CHROME, [...base, '--screenshot=' + path.resolve(captura), url], { stdio: 'ignore' });
    console.log('Captura:', path.resolve(captura));
  }
} finally {
  fs.unlinkSync(tmp);
}
