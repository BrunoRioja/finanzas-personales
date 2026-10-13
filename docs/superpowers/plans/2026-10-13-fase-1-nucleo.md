# Fase 1 · Núcleo + repo — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** Dejar un repositorio profesional con la app instalable en Apps Script: asistente inicial, registro manual de movimientos, cuentas, categorías, ajustes, modo demo y dashboard (bloques 1, 2, 3, 6 y 7) en estilo B oscuro.

**Arquitectura:** Apps Script (V8) con Google Sheets como base de datos. Todo el código vive en `src/` (lo único que `clasp` sube). La lógica pura (`src/core/`) no toca servicios de Google salvo `Utilities`/`Session` para fechas; `src/core/repo.js` es la única capa que toca `SpreadsheetApp`. La interfaz es una web app (`HtmlService`) con vistas en archivos `.html` separados. Las pruebas corren en Node cargando `src/**/*.js` en un contexto `vm` con los servicios de Google simulados (mismo patrón que el sistema del gym).

**Tecnologías:** Google Apps Script, Google Sheets, `@google/clasp` 3, Node 24 (`node --test`), ESLint 9, GitHub Actions, Chrome headless para revisar la interfaz.

**Spec:** [docs/superpowers/specs/2026-10-13-app-finanzas-design.md](../specs/2026-10-13-app-finanzas-design.md)

## Restricciones globales

- Rama de trabajo: `fase-1` (crear desde `main` en la Tarea 1). Un commit por tarea como mínimo, estilo convencional en español (`feat: …`, `test: …`, `docs: …`, `chore: …`), terminado con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Comando de pruebas: `npm test` (= `node --test` sin argumentos; en Node 24 `node --test tests/` falla).
- **Nunca** `new Date('yyyy-mm-dd')` (cae un día antes en Lima, UTC-5): construir con `new Date(a, m - 1, d)`. **Nunca** `instanceof Date` (las fechas de la hoja vienen de otro contexto): usar `esFecha_`.
- Archivos de `src/**/*.js`: sin `require`, sin `module`, sin `import`. En el nivel superior solo declaraciones `function` y `const` con literales; ningún `const` de nivel superior puede usar en su inicialización algo definido en otro archivo (el orden de carga de Apps Script no está garantizado).
- Funciones llamadas desde el navegador (`google.script.run`) **sin** guion bajo final; funciones internas **con** guion bajo final (Apps Script las oculta al navegador).
- Toda escritura en la hoja va dentro de `conBloqueo_`; nunca anidar `conBloqueo_`.
- Montos siempre redondeados con `redondear2_`. Los agregados del dashboard suman `monto_pen`.
- Nada de datos personales ni secretos en el repo: datos de demo y de pruebas son ficticios. Secretos solo en Script Properties.
- Estilo B (tokens exactos): fondo `#0b0b10`, superficie `#17171f`, superficie‑2 `#1f1f29`, borde `#23232e`, texto `#f2f2f7`, texto‑2 `#8b8b99`, primario `#7c5cff`, positivo `#3ddc97`, alerta `#ffb347`, negativo `#ff6b6b`, info `#4cc9f0`.
- Interfaz: nunca `alert`/`confirm`/`prompt`; `localStorage` siempre dentro de `try/catch`; todo texto que venga de datos pasa por `esc()` antes de ir a `innerHTML`.
- Web app: `executeAs: USER_DEPLOYING`, `access: MYSELF`.
- Zona horaria: `America/Lima`.

## Review Focus

- Una fecha escrita a mano en la hoja llega como objeto `Date` → debe leerse como `yyyy-MM-dd`, no como texto largo (prueba en Tarea 2).
- Últimos 4 dígitos con cero inicial (`0042`) → la columna queda en formato texto `@` y el valor no pierde el cero (pruebas en Tareas 2 y 3).
- Hoja demo borrada mientras `MODO_DEMO=si` → la app vuelve sola a la hoja real en vez de romperse (prueba en Tarea 2).
- Gasto en USD sin tipo de cambio configurado → error claro, nunca `monto_pen` NaN (prueba en Tarea 4).
- Mes sin ingresos → tasa de ahorro `null` (se muestra "—"), nunca NaN ni Infinity (prueba en Tarea 5).

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `package.json`, `package-lock.json` | Scripts `test`, `lint`, `setup`, `push`, `deploy`, `ui`; dependencias de desarrollo |
| `eslint.config.js` | Reglas de lint para `src/` (ámbito global compartido), `tests/` y `scripts/` |
| `.github/workflows/ci.yml` | Lint + pruebas en cada push y PR |
| `LICENSE`, `README.md`, `CHANGELOG.md`, `DESIGN.md` | Licencia MIT, portada del repo, cambios, sistema visual |
| `docs/instalacion.md`, `docs/arquitectura.md`, `docs/privacidad.md` | Documentación |
| `scripts/desplegar.js` | Sube el código y actualiza siempre el mismo despliegue |
| `src/appsscript.json` | Manifiesto (zona horaria, web app solo yo) |
| `src/core/util.js` | Redondeo, texto normalizado, fechas, meses, ids |
| `src/core/esquema.js` | Hojas, columnas y tipos |
| `src/core/repo.js` | Abrir libro (real/demo), crear hojas, leer/escribir/actualizar/borrar filas, Config, bloqueo |
| `src/core/catalogos.js` | Bancos, tipos de cuenta, monedas, paleta, categorías por defecto, validación de cuentas y categorías |
| `src/core/movimientos.js` | Validación y normalización de movimientos |
| `src/core/agregados.js` | Cálculos del dashboard |
| `src/setup/asistente.js` | `datosAsistente`, `estadoInstalacion`, `completarAsistente` |
| `src/setup/demo.js` | Generador de datos ficticios, `cargarDemo`, `salirDemo` |
| `src/web/api.js` | Funciones públicas de catálogos, movimientos y dashboard |
| `src/web/servidor.js` | `doGet` e `incluir_` |
| `src/web/Index.html`, `estilos.html`, `cliente.html` | Esqueleto, estilos, utilidades y enrutador del navegador |
| `src/web/vista-inicio.html`, `vista-movimientos.html`, `vista-cuentas.html`, `vista-ajustes.html`, `vista-asistente.html` | Vistas |
| `tests/harness.js`, `tests/fixtures.js` | Servicios simulados; entorno ya instalado |
| `tests/*.test.js` | Pruebas por tarea |
| `tests/ui/stub.js`, `tests/ui/ver.js` | `google.script.run` simulado y revisión de la interfaz en Chrome |

---

### Task 1: Andamiaje del repo, arnés de pruebas y utilidades

**Archivos:**
- Crear: `package.json`, `eslint.config.js`, `.github/workflows/ci.yml`, `LICENSE`, `src/appsscript.json`, `src/core/util.js`, `tests/harness.js`, `tests/util.test.js`
- Modificar: `.gitignore`

**Interfaces:**
- Produce (arnés): `crearEntorno({hojas, propiedades, ahora})` → `{ principal, libros, hojas, propiedades, stats, llamar(nombre, ...args), interno(nombre, ...args), fijarAhora(iso) }`. `llamar` devuelve datos planos (pasa por JSON: úsalo cuando compares con `deepStrictEqual`); `interno` devuelve el valor tal cual. `principal._hojas` es el mismo objeto que `hojas`; `principal._formatos['Hoja!col']` guarda los formatos de número aplicados. `stats.locks` cuenta bloqueos tomados.
- Produce (util): `redondear2_(n) → number`, `normalizarTexto_(t) → string` (mayúsculas, sin tildes, espacios simples), `esFecha_(v) → bool`, `formatearFecha_(fecha, patron?) → string`, `hoyIso_() → 'yyyy-MM-dd'`, `esFechaIso_(t) → bool`, `mesDe_(fechaIso) → 'yyyy-MM'`, `sumarMeses_(mes, n) → 'yyyy-MM'`, `validarMes_(mes) → string` (lanza si no es `yyyy-MM`), `nuevoId_() → string`.

- [ ] **Paso 1: Crear la rama**

```bash
git checkout -b fase-1
```

- [ ] **Paso 2: Crear `package.json`**

```json
{
  "name": "finanzas-personales",
  "version": "0.1.0",
  "private": true,
  "description": "App de finanzas personales autoalojada en Google Apps Script + Google Sheets",
  "license": "MIT",
  "scripts": {
    "test": "node --test",
    "lint": "eslint .",
    "setup": "clasp create-script --type sheets --title \"Finanzas personales\" --rootDir src",
    "push": "clasp push --force",
    "deploy": "node scripts/desplegar.js",
    "ui": "node tests/ui/ver.js"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Paso 3: Instalar dependencias de desarrollo**

Run: `npm install --save-dev eslint@9 @eslint/js@9 globals @google/clasp@3`
Expected: se crean `node_modules/` y `package-lock.json`; `package.json` gana `devDependencies` con versiones exactas resueltas.

- [ ] **Paso 4: Crear `eslint.config.js`**

```js
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', '.superpowers/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
    },
    rules: {
      // Apps Script comparte un solo ámbito global entre archivos: las funciones
      // de un archivo se usan desde otros, así que no-undef/no-unused-vars globales
      // darían falsos positivos.
      'no-undef': 'off',
      'no-unused-vars': ['error', { vars: 'local', args: 'after-used' }],
    },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['tests/ui/stub.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
];
```

- [ ] **Paso 5: Crear `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  pruebas:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
```

- [ ] **Paso 6: Crear `LICENSE` (MIT)**

```text
MIT License

Copyright (c) 2026 Bruno Rioja

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Paso 7: Crear `src/appsscript.json`**

```json
{
  "timeZone": "America/Lima",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "MYSELF"
  }
}
```

- [ ] **Paso 8: Reemplazar `.gitignore`**

```text
.clasp.json
.clasprc.json
.despliegue
node_modules/
.superpowers/
.tmp-*
*.png
!docs/img/*.png
```

- [ ] **Paso 9: Crear `tests/harness.js`**

```js
// Arnés de pruebas: carga todo src/**/*.js en un contexto de Node con los servicios
// de Google simulados (Sheets, Properties, Lock, Utilities, Session).
process.env.TZ = 'America/Lima';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function archivosJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(d => {
      const ruta = path.join(dir, d.name);
      if (d.isDirectory()) return archivosJs(ruta);
      return d.name.endsWith('.js') ? [ruta] : [];
    });
}

function formatear(d, patron) {
  const p = n => String(n).padStart(2, '0');
  return patron.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1))
    .replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes()))
    .replace('ss', p(d.getSeconds()));
}

// Libro simulado. `hojas` = { nombreHoja: [[fila1], [fila2], ...] } (fila 1 = encabezados).
function crearLibro(id, hojas) {
  const formatos = {};
  const ancho = nombre => Math.max(0, ...hojas[nombre].map(f => f.length));
  const hoja = nombre => ({
    getName: () => nombre,
    getDataRange: () => ({
      getValues: () => hojas[nombre].map(f => Array.from({ length: ancho(nombre) }, (_, i) => (f[i] === undefined ? '' : f[i]))),
    }),
    getLastRow: () => hojas[nombre].length,
    getLastColumn: () => ancho(nombre),
    getMaxRows: () => 1000,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
        const v = (hojas[nombre][r - 1 + i] || [])[c - 1 + j];
        return v === undefined ? '' : v;
      })),
      setValues: vs => vs.forEach((fila, i) => {
        while (hojas[nombre].length < r + i) hojas[nombre].push([]);
        fila.forEach((x, j) => { hojas[nombre][r - 1 + i][c - 1 + j] = x; });
      }),
      setNumberFormat: f => { for (let j = 0; j < nc; j++) formatos[nombre + '!' + (c + j)] = f; },
      setFontWeight: () => {},
    }),
    appendRow: fila => { hojas[nombre].push(fila.slice()); },
    deleteRow: n => { hojas[nombre].splice(n - 1, 1); },
    setFrozenRows: () => {},
  });
  return {
    getId: () => id,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id,
    getSheetByName: n => (hojas[n] ? hoja(n) : null),
    insertSheet: n => { hojas[n] = []; return hoja(n); },
    _hojas: hojas,
    _formatos: formatos,
  };
}

function crearEntorno(opciones = {}) {
  let ahora = new Date(opciones.ahora || '2026-10-13T10:00:00');
  const principal = crearLibro('libro-principal', opciones.hojas || {});
  const libros = { [principal.getId()]: principal };
  const propiedades = Object.assign({}, opciones.propiedades || {});
  const stats = { locks: 0 };
  let contadorId = 0;
  let contadorLibros = 0;

  class FechaFija extends Date {
    constructor(...args) { if (args.length === 0) super(ahora.getTime()); else super(...args); }
    static now() { return ahora.getTime(); }
  }

  const contexto = vm.createContext({
    console, JSON, Math, Object, Number, String, Array, Error, RegExp, isNaN, isFinite, Date: FechaFija,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => principal,
      openById: id => {
        if (!libros[id]) throw new Error('No se encontró el documento ' + id);
        return libros[id];
      },
      create: nombre => {
        const libro = crearLibro('libro-' + (++contadorLibros), {});
        libro.nombre = nombre;
        libros[libro.getId()] = libro;
        return libro;
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in propiedades ? propiedades[k] : null),
        setProperty: (k, v) => { propiedades[k] = String(v); },
        deleteProperty: k => { delete propiedades[k]; },
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => { stats.locks++; }, releaseLock() {} }) },
    Utilities: {
      formatDate: (d, tz, patron) => formatear(d, patron),
      getUuid: () => 'id-' + String(++contadorId).padStart(4, '0'),
    },
    Session: { getScriptTimeZone: () => 'America/Lima' },
    Logger: { log() {} },
  });
  for (const archivo of archivosJs(SRC)) {
    vm.runInContext(fs.readFileSync(archivo, 'utf8'), contexto, { filename: path.relative(SRC, archivo) });
  }

  return {
    principal, libros, propiedades, stats,
    hojas: principal._hojas,
    llamar(nombre, ...args) {
      const salida = contexto[nombre](...args);
      return salida === undefined ? salida : JSON.parse(JSON.stringify(salida));
    },
    interno(nombre, ...args) { return contexto[nombre](...args); },
    fijarAhora(iso) { ahora = new Date(iso); },
  };
}

module.exports = { crearEntorno, crearLibro };
```

- [ ] **Paso 10: Escribir la prueba que falla `tests/util.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

test('redondear2_ redondea a 2 decimales sin errores de coma flotante', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('redondear2_', 0.1 + 0.2), 0.3);
  assert.strictEqual(e.interno('redondear2_', 1.005), 1.01);
  assert.strictEqual(e.interno('redondear2_', '12.346'), 12.35);
  assert.ok(Number.isNaN(e.interno('redondear2_', 'abc')));
});

test('normalizarTexto_ quita tildes, pasa a mayúsculas y compacta espacios', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('normalizarTexto_', '  Tóttus   chiclayo '), 'TOTTUS CHICLAYO');
  assert.strictEqual(e.interno('normalizarTexto_', null), '');
});

test('esFechaIso_ valida formato y que el día exista', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('esFechaIso_', '2026-10-13'), true);
  assert.strictEqual(e.interno('esFechaIso_', '2028-02-29'), true);
  assert.strictEqual(e.interno('esFechaIso_', '2026-02-29'), false);
  assert.strictEqual(e.interno('esFechaIso_', '13/10/2026'), false);
  assert.strictEqual(e.interno('esFechaIso_', ''), false);
});

test('esFecha_ reconoce Date de cualquier contexto', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('esFecha_', new Date(2026, 9, 6)), true);
  assert.strictEqual(e.interno('esFecha_', '2026-10-06'), false);
  assert.strictEqual(e.interno('esFecha_', new Date('x')), false);
});

test('meses: mesDe_, sumarMeses_ y validarMes_', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('mesDe_', '2026-10-13'), '2026-10');
  assert.strictEqual(e.interno('sumarMeses_', '2026-01', -1), '2025-12');
  assert.strictEqual(e.interno('sumarMeses_', '2026-11', 2), '2027-01');
  assert.strictEqual(e.interno('validarMes_', '2026-10'), '2026-10');
  assert.throws(() => e.interno('validarMes_', '2026-13'), /Mes inválido/);
  assert.throws(() => e.interno('validarMes_', undefined), /Mes inválido/);
});

test('hoyIso_ usa la fecha actual y nuevoId_ genera ids distintos', () => {
  const e = crearEntorno({ ahora: '2026-10-13T23:30:00' });
  assert.strictEqual(e.interno('hoyIso_'), '2026-10-13');
  assert.notStrictEqual(e.interno('nuevoId_'), e.interno('nuevoId_'));
});
```

- [ ] **Paso 11: Correr la prueba y verificar que falla**

Run: `npm test`
Expected: FAIL con `ENOENT ... src` o `redondear2_ is not a function` (aún no existe `src/core/util.js`).

- [ ] **Paso 12: Crear `src/core/util.js`**

```js
// Utilidades puras compartidas. Solo usan Utilities/Session para formatear fechas
// en la zona horaria del script.

function redondear2_(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function normalizarTexto_(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

// No usar instanceof: las fechas de la hoja vienen de otro contexto.
function esFecha_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

function formatearFecha_(fecha, patron) {
  return Utilities.formatDate(fecha, Session.getScriptTimeZone(), patron || 'yyyy-MM-dd');
}

function hoyIso_() {
  return formatearFecha_(new Date());
}

// 'yyyy-MM-dd' con un día que exista en el calendario.
function esFechaIso_(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto));
  if (!m) return false;
  const a = Number(m[1]);
  const me = Number(m[2]);
  const d = Number(m[3]);
  const f = new Date(a, me - 1, d);
  return f.getFullYear() === a && f.getMonth() === me - 1 && f.getDate() === d;
}

function mesDe_(fechaIso) {
  return String(fechaIso).slice(0, 7);
}

// Suma n meses (n puede ser negativo) a 'yyyy-MM'.
function sumarMeses_(mes, n) {
  const partes = mes.split('-').map(Number);
  const total = partes[0] * 12 + (partes[1] - 1) + n;
  return Math.floor(total / 12) + '-' + String((total % 12) + 1).padStart(2, '0');
}

function validarMes_(mes) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes))) throw new Error('Mes inválido: ' + mes);
  return String(mes);
}

function nuevoId_() {
  return Utilities.getUuid();
}
```

- [ ] **Paso 13: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: 6 pruebas PASS; lint sin errores.

- [ ] **Paso 14: Commit**

```bash
git add .gitignore package.json package-lock.json eslint.config.js .github LICENSE src tests
git commit -m "chore: andamiaje del repo, CI, arnés de pruebas y utilidades

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Esquema y capa de datos (`repo.js`)

**Archivos:**
- Crear: `src/core/esquema.js`, `src/core/repo.js`, `tests/repo.test.js`

**Interfaces:**
- Consume: `esFecha_`, `formatearFecha_` (Tarea 1).
- Produce:
  - `VERSION_ESQUEMA` (= 1) y `ESQUEMA` = `{ Hoja: [[columna, tipo], ...] }`, tipos `texto | numero | fecha | booleano`. La primera columna de cada hoja es su clave (`id` o `clave`).
  - `abrirLibro_() → Spreadsheet` (demo si `MODO_DEMO='si'` y `DEMO_SHEET_ID` abre; si la demo no abre, pone `MODO_DEMO='no'` y sigue; luego `SHEET_ID`; si no, `getActiveSpreadsheet()`).
  - `crearHojas_(libro)` idempotente.
  - `leerTabla_(nombre) → objeto[]` con tipos convertidos.
  - `agregarFilas_(nombre, objetos[])`, `actualizarFila_(nombre, id, cambios)`, `eliminarFila_(nombre, id)` (las dos últimas lanzan `No existe <hoja> con id <id>`).
  - `leerConfig_() → {clave: valor}`, `guardarConfig_(cambios)`.
  - `conBloqueo_(fn) → resultado de fn`.

- [ ] **Paso 1: Escribir la prueba que falla `tests/repo.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno, crearLibro } = require('./harness');

const HOJAS = ['Categorias', 'Config', 'Cuentas', 'Divisiones', 'Log', 'Movimientos', 'Reglas'];

test('crearHojas_ crea todas las hojas con encabezados y es idempotente', () => {
  const e = crearEntorno();
  e.interno('crearHojas_', e.principal);
  e.interno('crearHojas_', e.principal);
  assert.deepStrictEqual(Object.keys(e.hojas).sort(), HOJAS);
  assert.deepStrictEqual(e.hojas.Cuentas, [['id', 'nombre', 'banco', 'tipo', 'moneda', 'saldo_inicial', 'ultimos4', 'activa']]);
});

test('crearHojas_ pone formato texto en columnas texto/fecha (conserva ceros a la izquierda)', () => {
  const e = crearEntorno();
  e.interno('crearHojas_', e.principal);
  assert.strictEqual(e.principal._formatos['Cuentas!7'], '@');   // ultimos4
  assert.strictEqual(e.principal._formatos['Movimientos!2'], '@'); // fecha
  assert.strictEqual(e.principal._formatos['Cuentas!6'], undefined); // saldo_inicial es número
});

test('agregarFilas_ y leerTabla_ convierten tipos', () => {
  const e = crearEntorno();
  e.interno('crearHojas_', e.principal);
  e.interno('agregarFilas_', 'Cuentas', [{ id: 'a', nombre: 'Débito', saldo_inicial: '10.5', ultimos4: '0042', activa: true }]);
  assert.deepStrictEqual(e.hojas.Cuentas[1], ['a', 'Débito', '', '', '', 10.5, '0042', true]);
  assert.deepStrictEqual(e.llamar('leerTabla_', 'Cuentas'), [
    { id: 'a', nombre: 'Débito', banco: '', tipo: '', moneda: '', saldo_inicial: 10.5, ultimos4: '0042', activa: true },
  ]);
});

test('leerTabla_ convierte fechas Date a yyyy-MM-dd, respeta columnas reordenadas e ignora filas vacías', () => {
  const e = crearEntorno({
    hojas: {
      Divisiones: [
        ['monto', 'id', 'movimiento_id', 'categoria_id', 'nota'],
        ['5', 'd1', 'm1', 'c1', ''],
        ['', '', '', '', ''],
      ],
      Movimientos: [['id', 'fecha', 'dividido'], ['m1', new Date(2026, 9, 6), 'TRUE']],
    },
  });
  assert.deepStrictEqual(e.llamar('leerTabla_', 'Divisiones'), [{ id: 'd1', movimiento_id: 'm1', categoria_id: 'c1', monto: 5, nota: '' }]);
  const mov = e.llamar('leerTabla_', 'Movimientos')[0];
  assert.strictEqual(mov.fecha, '2026-10-06');
  assert.strictEqual(mov.dividido, true);
  assert.strictEqual(mov.monto, 0);
});

test('actualizarFila_ cambia solo lo indicado y conserva columnas extra del usuario', () => {
  const e = crearEntorno({
    hojas: { Cuentas: [['id', 'nombre', 'banco', 'tipo', 'moneda', 'saldo_inicial', 'ultimos4', 'activa', 'Mi nota'], ['a', 'X', 'BCP', 'debito', 'PEN', 5, '1111', true, 'no tocar']] },
  });
  e.interno('actualizarFila_', 'Cuentas', 'a', { nombre: 'Y' });
  assert.deepStrictEqual(e.hojas.Cuentas[1], ['a', 'Y', 'BCP', 'debito', 'PEN', 5, '1111', true, 'no tocar']);
  assert.throws(() => e.interno('actualizarFila_', 'Cuentas', 'zz', { nombre: 'Z' }), /No existe Cuentas con id zz/);
});

test('eliminarFila_ borra por id', () => {
  const e = crearEntorno();
  e.interno('crearHojas_', e.principal);
  e.interno('agregarFilas_', 'Reglas', [{ id: 'r1', patron: 'A' }, { id: 'r2', patron: 'B' }]);
  e.interno('eliminarFila_', 'Reglas', 'r1');
  assert.deepStrictEqual(e.llamar('leerTabla_', 'Reglas').map(r => r.id), ['r2']);
  assert.throws(() => e.interno('eliminarFila_', 'Reglas', 'r1'), /No existe/);
});

test('leerTabla_ sin hoja pide abrir el asistente', () => {
  const e = crearEntorno();
  assert.throws(() => e.interno('leerTabla_', 'Cuentas'), /asistente/);
});

test('leerConfig_ y guardarConfig_ crean y actualizan claves', () => {
  const e = crearEntorno();
  e.interno('crearHojas_', e.principal);
  e.interno('guardarConfig_', { nombre: 'Ana', ultimo_tc: 3.75 });
  e.interno('guardarConfig_', { nombre: 'Ana María' });
  assert.deepStrictEqual(e.llamar('leerConfig_'), { nombre: 'Ana María', ultimo_tc: '3.75' });
  assert.strictEqual(e.hojas.Config.length, 3);
});

test('abrirLibro_ usa SHEET_ID, la demo si está activa, y vuelve a la real si la demo no existe', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('abrirLibro_'), e.principal);

  const otro = crearLibro('libro-x', {});
  e.libros['libro-x'] = otro;
  e.propiedades.SHEET_ID = 'libro-x';
  assert.strictEqual(e.interno('abrirLibro_'), otro);

  e.propiedades.MODO_DEMO = 'si';
  e.propiedades.DEMO_SHEET_ID = 'no-existe';
  assert.strictEqual(e.interno('abrirLibro_'), otro);
  assert.strictEqual(e.propiedades.MODO_DEMO, 'no');
});

test('conBloqueo_ toma el bloqueo y devuelve el resultado', () => {
  const e = crearEntorno();
  assert.strictEqual(e.interno('conBloqueo_', () => 7), 7);
  assert.strictEqual(e.stats.locks, 1);
});
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Run: `npm test`
Expected: FAIL con `crearHojas_ is not a function` (y las demás de repo).

- [ ] **Paso 3: Crear `src/core/esquema.js`**

```js
// Hojas y columnas de la base de datos. La fila 1 de cada hoja son estos encabezados.
// La primera columna de cada hoja es su clave. Tipos: texto | numero | fecha (yyyy-MM-dd) | booleano.
const VERSION_ESQUEMA = 1;

const ESQUEMA = {
  Movimientos: [
    ['id', 'texto'], ['fecha', 'fecha'], ['tipo', 'texto'], ['monto', 'numero'], ['moneda', 'texto'],
    ['monto_pen', 'numero'], ['tc', 'numero'], ['cuenta_id', 'texto'], ['cuenta_destino_id', 'texto'],
    ['categoria_id', 'texto'], ['comercio', 'texto'], ['descripcion', 'texto'], ['origen', 'texto'],
    ['estado', 'texto'], ['ref_externa', 'texto'], ['dividido', 'booleano'], ['creado_en', 'texto'],
  ],
  Divisiones: [
    ['id', 'texto'], ['movimiento_id', 'texto'], ['categoria_id', 'texto'], ['monto', 'numero'], ['nota', 'texto'],
  ],
  Cuentas: [
    ['id', 'texto'], ['nombre', 'texto'], ['banco', 'texto'], ['tipo', 'texto'], ['moneda', 'texto'],
    ['saldo_inicial', 'numero'], ['ultimos4', 'texto'], ['activa', 'booleano'],
  ],
  Categorias: [
    ['id', 'texto'], ['nombre', 'texto'], ['emoji', 'texto'], ['color', 'texto'], ['tipo', 'texto'],
    ['padre_id', 'texto'], ['activa', 'booleano'],
  ],
  Reglas: [
    ['id', 'texto'], ['patron', 'texto'], ['categoria_id', 'texto'], ['cuenta_id', 'texto'],
    ['creada_por', 'texto'], ['usos', 'numero'],
  ],
  Config: [['clave', 'texto'], ['valor', 'texto']],
  Log: [['fecha', 'texto'], ['nivel', 'texto'], ['origen', 'texto'], ['mensaje', 'texto'], ['detalle', 'texto']],
};
```

- [ ] **Paso 4: Crear `src/core/repo.js`**

```js
// Única capa que toca SpreadsheetApp. Convierte filas <-> objetos según ESQUEMA,
// ubicando cada columna por su encabezado (el usuario puede reordenar o agregar columnas).

function abrirLibro_() {
  const props = PropertiesService.getScriptProperties();
  const demo = props.getProperty('DEMO_SHEET_ID');
  if (props.getProperty('MODO_DEMO') === 'si' && demo) {
    try {
      return SpreadsheetApp.openById(demo);
    } catch {
      // La hoja demo fue borrada: volver a la real en vez de romper la app.
      props.setProperty('MODO_DEMO', 'no');
    }
  }
  const id = props.getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

// Crea las hojas que falten con encabezados en negrita, fila congelada y formato
// texto (@) en columnas texto/fecha para que Sheets no convierta '0042' ni fechas.
function crearHojas_(libro) {
  Object.keys(ESQUEMA).forEach(nombre => {
    if (libro.getSheetByName(nombre)) return;
    const hoja = libro.insertSheet(nombre);
    const columnas = ESQUEMA[nombre];
    hoja.getRange(1, 1, 1, columnas.length).setValues([columnas.map(c => c[0])]);
    hoja.getRange(1, 1, 1, columnas.length).setFontWeight('bold');
    hoja.setFrozenRows(1);
    columnas.forEach((c, i) => {
      if (c[1] === 'texto' || c[1] === 'fecha') hoja.getRange(2, i + 1, hoja.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });
}

function hoja_(nombre) {
  const hoja = abrirLibro_().getSheetByName(nombre);
  if (!hoja) throw new Error('Falta la hoja "' + nombre + '". Abre la app para completar el asistente de instalación.');
  return hoja;
}

function tiposDe_(nombre) {
  const tipos = {};
  ESQUEMA[nombre].forEach(c => { tipos[c[0]] = c[1]; });
  return tipos;
}

function desdeCelda_(valor, tipo) {
  if (tipo === 'numero') {
    const n = Number(valor);
    return valor === '' || valor === null || isNaN(n) ? 0 : n;
  }
  if (tipo === 'booleano') return valor === true || String(valor).toUpperCase() === 'TRUE';
  if (tipo === 'fecha') return esFecha_(valor) ? formatearFecha_(valor) : String(valor == null ? '' : valor);
  return valor == null ? '' : String(valor);
}

function haciaCelda_(valor, tipo) {
  if (valor === undefined || valor === null) return tipo === 'booleano' ? false : '';
  if (tipo === 'numero') return valor === '' ? '' : Number(valor);
  if (tipo === 'booleano') return valor === true;
  return String(valor);
}

function encabezados_(hoja) {
  return hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
}

function leerTabla_(nombre) {
  const columnas = ESQUEMA[nombre];
  const valores = hoja_(nombre).getDataRange().getValues();
  const encabezados = valores[0] || [];
  const indices = columnas.map(c => encabezados.indexOf(c[0]));
  return valores.slice(1)
    .filter(fila => fila.some(v => v !== '' && v !== null))
    .map(fila => {
      const obj = {};
      columnas.forEach((c, i) => { obj[c[0]] = desdeCelda_(indices[i] < 0 ? '' : fila[indices[i]], c[1]); });
      return obj;
    });
}

function agregarFilas_(nombre, objetos) {
  if (!objetos.length) return;
  const hoja = hoja_(nombre);
  const encabezados = encabezados_(hoja);
  const tipos = tiposDe_(nombre);
  const filas = objetos.map(o => encabezados.map(h => (h in tipos ? haciaCelda_(o[h], tipos[h]) : '')));
  hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, encabezados.length).setValues(filas);
}

// Número de fila (1-based) cuya clave (primera columna del esquema) es `id`, o -1.
function buscarFila_(hoja, nombre, id) {
  const clave = ESQUEMA[nombre][0][0];
  const valores = hoja.getDataRange().getValues();
  const col = valores[0].indexOf(clave);
  for (let i = 1; i < valores.length; i++) {
    if (String(valores[i][col]) === String(id)) return i + 1;
  }
  return -1;
}

function actualizarFila_(nombre, id, cambios) {
  const hoja = hoja_(nombre);
  const fila = buscarFila_(hoja, nombre, id);
  if (fila < 0) throw new Error('No existe ' + nombre + ' con id ' + id);
  const encabezados = encabezados_(hoja);
  const tipos = tiposDe_(nombre);
  const actual = hoja.getRange(fila, 1, 1, encabezados.length).getValues()[0];
  const nueva = encabezados.map((h, i) => {
    if (!(h in tipos)) return actual[i]; // columna agregada por el usuario: no se toca
    const valor = h in cambios ? cambios[h] : desdeCelda_(actual[i], tipos[h]);
    return haciaCelda_(valor, tipos[h]);
  });
  hoja.getRange(fila, 1, 1, encabezados.length).setValues([nueva]);
}

function eliminarFila_(nombre, id) {
  const hoja = hoja_(nombre);
  const fila = buscarFila_(hoja, nombre, id);
  if (fila < 0) throw new Error('No existe ' + nombre + ' con id ' + id);
  hoja.deleteRow(fila);
}

function leerConfig_() {
  const config = {};
  leerTabla_('Config').forEach(f => { config[f.clave] = f.valor; });
  return config;
}

function guardarConfig_(cambios) {
  const actual = leerConfig_();
  Object.keys(cambios).forEach(clave => {
    if (clave in actual) actualizarFila_('Config', clave, { valor: cambios[clave] });
    else agregarFilas_('Config', [{ clave: clave, valor: cambios[clave] }]);
  });
}

function conBloqueo_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
```

- [ ] **Paso 5: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: todas PASS (16 en total); lint sin errores.

- [ ] **Paso 6: Commit**

```bash
git add src/core/esquema.js src/core/repo.js tests/repo.test.js
git commit -m "feat: esquema de hojas y capa de datos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Catálogos, asistente de instalación y API de catálogos

**Archivos:**
- Crear: `src/core/catalogos.js`, `src/setup/asistente.js`, `src/web/api.js`, `tests/fixtures.js`, `tests/catalogos.test.js`

**Interfaces:**
- Consume: Tareas 1 y 2.
- Produce:
  - Constantes `TIPOS_CUENTA`, `BANCOS`, `MONEDAS` (`['PEN','USD']`), `PALETA`, `CATEGORIAS_POR_DEFECTO` (`[[nombre, emoji, tipo], ...]`).
  - `normalizarCuenta_(datos) → {nombre, banco, tipo, moneda, saldo_inicial, ultimos4, activa}`.
  - `normalizarCategoria_(datos, existentes, idActual) → {nombre, emoji, color, tipo, padre_id, activa}`.
  - Públicas: `datosAsistente() → {bancos, tiposCuenta, monedas, categorias:[{nombre, emoji, tipo}]}`, `estadoInstalacion() → {instalado, modoDemo}`, `completarAsistente({nombre, tc_usd, cuentas[], categorias[]?}) → estadoInstalacion()`, `obtenerCatalogos() → {cuentas, categorias, config:{nombre, ultimo_tc, moneda_principal}, opciones:{bancos, tiposCuenta, monedas}, modoDemo, urlHoja}`, `guardarCuenta(datos) → cuenta`, `guardarCategoria(datos) → categoria`, `guardarAjustes({nombre, ultimo_tc}) → obtenerCatalogos().config`.
  - Fixtures: `ASISTENTE`, `entornoInstalado(opciones)` → entorno + `e.cuenta(nombre) → id`, `e.categoria(nombre) → id`, `e.filas(hoja) → objetos planos`.

- [ ] **Paso 1: Crear `tests/fixtures.js`**

```js
const { crearEntorno } = require('./harness');

// Datos ficticios del asistente (nunca datos reales).
const ASISTENTE = {
  nombre: 'Ana',
  tc_usd: 3.75,
  cuentas: [
    { nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', moneda: 'PEN', saldo_inicial: 1000, ultimos4: '1234' },
    { nombre: 'VISA BCP', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -200, ultimos4: '0042' },
  ],
};

function entornoInstalado(opciones) {
  const e = crearEntorno(opciones);
  e.llamar('completarAsistente', ASISTENTE);
  e.cuenta = nombre => e.llamar('obtenerCatalogos').cuentas.find(c => c.nombre === nombre).id;
  e.categoria = nombre => e.llamar('obtenerCatalogos').categorias.find(c => c.nombre === nombre).id;
  e.filas = hoja => e.llamar('leerTabla_', hoja);
  return e;
}

module.exports = { ASISTENTE, entornoInstalado };
```

- [ ] **Paso 2: Escribir la prueba que falla `tests/catalogos.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { ASISTENTE, entornoInstalado } = require('./fixtures');

test('normalizarCuenta_ valida y normaliza', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(
    e.llamar('normalizarCuenta_', { nombre: ' VISA ', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: '-120.456', ultimos4: '0042' }),
    { nombre: 'VISA', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -120.46, ultimos4: '0042', activa: true });
  assert.strictEqual(e.llamar('normalizarCuenta_', { nombre: 'E', tipo: 'efectivo' }).saldo_inicial, 0);
  assert.throws(() => e.interno('normalizarCuenta_', { nombre: '', tipo: 'debito' }), /nombre/);
  assert.throws(() => e.interno('normalizarCuenta_', { nombre: 'X', tipo: 'cripto' }), /Tipo de cuenta/);
  assert.throws(() => e.interno('normalizarCuenta_', { nombre: 'X', tipo: 'debito', moneda: 'EUR' }), /Moneda/);
  assert.throws(() => e.interno('normalizarCuenta_', { nombre: 'X', tipo: 'debito', ultimos4: '42' }), /4 números/);
  assert.throws(() => e.interno('normalizarCuenta_', { nombre: 'X', tipo: 'debito', saldo_inicial: 'mucho' }), /saldo/);
});

test('normalizarCategoria_ valida tipo, nombre repetido y color', () => {
  const e = crearEntorno();
  const existentes = [{ id: 'c1', nombre: 'Café', tipo: 'gasto' }];
  const nueva = e.llamar('normalizarCategoria_', { nombre: 'Taxi', emoji: '🚕', tipo: 'gasto' }, existentes, '');
  assert.strictEqual(nueva.color, '#ffb347'); // PALETA[1] porque ya hay 1 categoría
  assert.strictEqual(nueva.activa, true);
  assert.strictEqual(e.llamar('normalizarCategoria_', { nombre: 'X', tipo: 'gasto', color: '#123456' }, [], '').color, '#123456');
  assert.throws(() => e.interno('normalizarCategoria_', { nombre: 'cafe', tipo: 'gasto' }, existentes, ''), /Ya existe/);
  assert.doesNotThrow(() => e.interno('normalizarCategoria_', { nombre: 'Café', tipo: 'gasto' }, existentes, 'c1'));
  assert.doesNotThrow(() => e.interno('normalizarCategoria_', { nombre: 'Café', tipo: 'ingreso' }, existentes, ''));
  assert.throws(() => e.interno('normalizarCategoria_', { nombre: 'X', tipo: 'otro' }, [], ''), /gasto o de ingreso/);
});

test('estadoInstalacion sin hojas indica no instalado', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('estadoInstalacion'), { instalado: false, modoDemo: false });
});

test('completarAsistente crea hojas, cuentas, categorías por defecto y config', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('completarAsistente', ASISTENTE), { instalado: true, modoDemo: false });
  const cat = e.llamar('obtenerCatalogos');
  assert.deepStrictEqual(cat.cuentas.map(c => [c.nombre, c.ultimos4, c.saldo_inicial]), [['Débito BCP', '1234', 1000], ['VISA BCP', '0042', -200]]);
  assert.strictEqual(cat.categorias.length, 20);
  assert.strictEqual(cat.categorias.filter(c => c.tipo === 'ingreso').length, 4);
  assert.deepStrictEqual(cat.config, { nombre: 'Ana', ultimo_tc: 3.75, moneda_principal: 'PEN' });
  assert.deepStrictEqual(cat.opciones.monedas, ['PEN', 'USD']);
  assert.ok(cat.opciones.bancos.indexOf('BCP') >= 0);
  assert.strictEqual(cat.urlHoja, 'https://docs.google.com/spreadsheets/d/libro-principal');
  const config = e.llamar('leerConfig_');
  assert.strictEqual(config.version_esquema, '1');
  assert.strictEqual(config.modo_bot, 'B');
  assert.strictEqual(config.hora_resumen, '21:00');
});

test('completarAsistente acepta categorías propias y valida sin crear nada si falla', () => {
  const e = crearEntorno();
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { nombre: ' ' })), /nombre/);
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { cuentas: [] })), /al menos una cuenta/);
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { categorias: [{ nombre: 'Solo gasto', tipo: 'gasto' }] })), /gasto y una de ingreso/);
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { tc_usd: 'x' })), /tipo de cambio/);
  assert.deepStrictEqual(Object.keys(e.hojas), []);

  e.llamar('completarAsistente', Object.assign({}, ASISTENTE, { categorias: [{ nombre: 'Comida', emoji: '🍔', tipo: 'gasto' }, { nombre: 'Sueldo', emoji: '💼', tipo: 'ingreso' }] }));
  assert.deepStrictEqual(e.llamar('obtenerCatalogos').categorias.map(c => c.nombre), ['Comida', 'Sueldo']);
});

test('completarAsistente no se puede repetir', () => {
  const e = entornoInstalado();
  assert.throws(() => e.interno('completarAsistente', ASISTENTE), /ya está instalada/);
});

test('guardarCuenta crea y edita', () => {
  const e = entornoInstalado();
  const nueva = e.llamar('guardarCuenta', { nombre: 'Interbank', banco: 'Interbank', tipo: 'debito', moneda: 'PEN' });
  assert.strictEqual(nueva.nombre, 'Interbank');
  e.llamar('guardarCuenta', Object.assign({}, nueva, { nombre: 'Interbank Google', activa: false }));
  const fila = e.filas('Cuentas').find(c => c.id === nueva.id);
  assert.strictEqual(fila.nombre, 'Interbank Google');
  assert.strictEqual(fila.activa, false);
  assert.throws(() => e.interno('guardarCuenta', { id: 'nada', nombre: 'X', tipo: 'debito' }), /ya no existe/);
  assert.ok(e.stats.locks >= 3);
});

test('guardarCategoria crea, edita y no permite duplicados', () => {
  const e = entornoInstalado();
  const nueva = e.llamar('guardarCategoria', { nombre: 'Mascotas', emoji: '🐶', tipo: 'gasto' });
  e.llamar('guardarCategoria', Object.assign({}, nueva, { nombre: 'Mascota', activa: false }));
  assert.strictEqual(e.filas('Categorias').find(c => c.id === nueva.id).nombre, 'Mascota');
  assert.throws(() => e.interno('guardarCategoria', { nombre: 'supermercado', tipo: 'gasto' }), /Ya existe/);
});

test('guardarAjustes cambia nombre y tipo de cambio', () => {
  const e = entornoInstalado();
  assert.deepStrictEqual(e.llamar('guardarAjustes', { nombre: 'Ana R.', ultimo_tc: '3.80' }), { nombre: 'Ana R.', ultimo_tc: 3.8, moneda_principal: 'PEN' });
  assert.throws(() => e.interno('guardarAjustes', { nombre: '', ultimo_tc: 3.8 }), /nombre/);
  assert.throws(() => e.interno('guardarAjustes', { nombre: 'A', ultimo_tc: -1 }), /tipo de cambio/);
});
```

- [ ] **Paso 3: Correr la prueba y verificar que falla**

Run: `npm test`
Expected: FAIL con `completarAsistente is not a function` / `normalizarCuenta_ is not a function`.

- [ ] **Paso 4: Crear `src/core/catalogos.js`**

```js
// Catálogos fijos (bancos, tipos, monedas, categorías sugeridas) y validación de
// cuentas y categorías.

const TIPOS_CUENTA = ['debito', 'credito', 'ahorro', 'billetera', 'efectivo'];
const BANCOS = ['BCP', 'Interbank', 'BBVA', 'Scotiabank', 'Banco de la Nación', 'Yape', 'Plin', 'Efectivo', 'Otro'];
const MONEDAS = ['PEN', 'USD'];
const PALETA = ['#3ddc97', '#ffb347', '#7c5cff', '#4cc9f0', '#ff6b6b', '#f72585', '#b5e48c', '#ffd166'];

const CATEGORIAS_POR_DEFECTO = [
  ['Supermercado', '🛒', 'gasto'], ['Comida fuera', '🍽️', 'gasto'], ['Bodega', '🏪', 'gasto'],
  ['Transporte', '🚕', 'gasto'], ['Vivienda y servicios', '🏠', 'gasto'], ['Suscripciones', '📺', 'gasto'],
  ['Salud y gym', '💪', 'gasto'], ['Suplementos', '💊', 'gasto'], ['Aseo personal', '🧴', 'gasto'],
  ['Ropa', '👕', 'gasto'], ['Entretenimiento', '🎮', 'gasto'], ['Educación', '🎓', 'gasto'],
  ['Viajes', '✈️', 'gasto'], ['Regalos', '🎁', 'gasto'], ['Comisiones bancarias', '💸', 'gasto'],
  ['Otros', '❓', 'gasto'],
  ['Sueldo', '💼', 'ingreso'], ['Freelance / extras', '💰', 'ingreso'], ['Reembolsos', '🔁', 'ingreso'],
  ['Otros ingresos', '🎁', 'ingreso'],
];

function normalizarCuenta_(datos) {
  const nombre = String(datos.nombre || '').trim();
  if (!nombre) throw new Error('La cuenta necesita un nombre.');
  const tipo = String(datos.tipo || '');
  if (TIPOS_CUENTA.indexOf(tipo) < 0) throw new Error('Tipo de cuenta inválido: ' + tipo);
  const moneda = String(datos.moneda || 'PEN');
  if (MONEDAS.indexOf(moneda) < 0) throw new Error('Moneda no soportada: ' + moneda);
  const ultimos4 = String(datos.ultimos4 == null ? '' : datos.ultimos4).trim();
  if (ultimos4 && !/^\d{4}$/.test(ultimos4)) throw new Error('Los últimos 4 dígitos deben ser 4 números.');
  const vacio = datos.saldo_inicial === '' || datos.saldo_inicial === undefined || datos.saldo_inicial === null;
  const saldo = vacio ? 0 : redondear2_(datos.saldo_inicial);
  if (!isFinite(saldo)) throw new Error('El saldo inicial debe ser un número.');
  return {
    nombre: nombre, banco: String(datos.banco || 'Otro'), tipo: tipo, moneda: moneda,
    saldo_inicial: saldo, ultimos4: ultimos4, activa: datos.activa !== false,
  };
}

// `existentes` = categorías ya guardadas; `idActual` = id de la que se edita ('' si es nueva).
function normalizarCategoria_(datos, existentes, idActual) {
  const nombre = String(datos.nombre || '').trim();
  if (!nombre) throw new Error('La categoría necesita un nombre.');
  const tipo = String(datos.tipo || '');
  if (tipo !== 'gasto' && tipo !== 'ingreso') throw new Error('La categoría debe ser de gasto o de ingreso.');
  const repetida = existentes.some(c => c.id !== idActual && c.tipo === tipo &&
    normalizarTexto_(c.nombre) === normalizarTexto_(nombre));
  if (repetida) throw new Error('Ya existe la categoría "' + nombre + '".');
  const color = /^#[0-9a-fA-F]{6}$/.test(String(datos.color || '')) ? datos.color : PALETA[existentes.length % PALETA.length];
  return {
    nombre: nombre, emoji: String(datos.emoji || '').trim(), color: color, tipo: tipo,
    padre_id: String(datos.padre_id || ''), activa: datos.activa !== false,
  };
}
```

- [ ] **Paso 5: Crear `src/setup/asistente.js`**

```js
// Asistente de instalación: primera configuración de cada persona.

function datosAsistente() {
  return {
    bancos: BANCOS,
    tiposCuenta: TIPOS_CUENTA,
    monedas: MONEDAS,
    categorias: CATEGORIAS_POR_DEFECTO.map(c => ({ nombre: c[0], emoji: c[1], tipo: c[2] })),
  };
}

function estaInstalado_(libro) {
  return !!libro.getSheetByName('Config') && leerConfig_().instalado === 'si';
}

function estadoInstalacion() {
  const instalado = estaInstalado_(abrirLibro_());
  return {
    instalado: instalado,
    modoDemo: PropertiesService.getScriptProperties().getProperty('MODO_DEMO') === 'si',
  };
}

// Valida todo antes de crear hojas: si algo falla, el libro queda intacto.
function completarAsistente(datos) {
  return conBloqueo_(() => {
    const libro = abrirLibro_();
    if (estaInstalado_(libro)) throw new Error('La app ya está instalada. Cambia tus datos desde Ajustes.');
    const nombre = String(datos.nombre || '').trim();
    if (!nombre) throw new Error('Escribe tu nombre.');
    const tc = datos.tc_usd === '' || datos.tc_usd == null ? 0 : Number(datos.tc_usd);
    if (!(tc >= 0)) throw new Error('El tipo de cambio debe ser un número positivo.');
    const cuentas = (datos.cuentas || []).map(c => Object.assign({ id: nuevoId_() }, normalizarCuenta_(c)));
    if (!cuentas.length) throw new Error('Agrega al menos una cuenta.');
    const fuente = datos.categorias && datos.categorias.length ? datos.categorias : datosAsistente().categorias;
    const categorias = [];
    fuente.forEach(c => categorias.push(Object.assign({ id: nuevoId_() }, normalizarCategoria_(c, categorias, ''))));
    if (!categorias.some(c => c.tipo === 'gasto') || !categorias.some(c => c.tipo === 'ingreso')) {
      throw new Error('Necesitas al menos una categoría de gasto y una de ingreso.');
    }
    crearHojas_(libro);
    agregarFilas_('Cuentas', cuentas);
    agregarFilas_('Categorias', categorias);
    guardarConfig_({
      nombre: nombre, moneda_principal: 'PEN', ultimo_tc: tc, modo_bot: 'B', hora_resumen: '21:00',
      version_esquema: VERSION_ESQUEMA, instalado: 'si',
    });
    return estadoInstalacion();
  });
}
```

- [ ] **Paso 6: Crear `src/web/api.js`**

```js
// Funciones que llama el navegador con google.script.run (sin guion bajo final).

function obtenerCatalogos() {
  const config = leerConfig_();
  return {
    cuentas: leerTabla_('Cuentas'),
    categorias: leerTabla_('Categorias'),
    config: {
      nombre: config.nombre || '',
      ultimo_tc: Number(config.ultimo_tc) || 0,
      moneda_principal: config.moneda_principal || 'PEN',
    },
    opciones: { bancos: BANCOS, tiposCuenta: TIPOS_CUENTA, monedas: MONEDAS },
    modoDemo: PropertiesService.getScriptProperties().getProperty('MODO_DEMO') === 'si',
    urlHoja: abrirLibro_().getUrl(),
  };
}

function guardarCuenta(datos) {
  return conBloqueo_(() => {
    const cuenta = normalizarCuenta_(datos);
    if (datos.id) {
      if (!leerTabla_('Cuentas').some(c => c.id === datos.id)) throw new Error('La cuenta ya no existe.');
      actualizarFila_('Cuentas', datos.id, cuenta);
      return Object.assign({ id: datos.id }, cuenta);
    }
    const nueva = Object.assign({ id: nuevoId_() }, cuenta);
    agregarFilas_('Cuentas', [nueva]);
    return nueva;
  });
}

function guardarCategoria(datos) {
  return conBloqueo_(() => {
    const existentes = leerTabla_('Categorias');
    const categoria = normalizarCategoria_(datos, existentes, datos.id || '');
    if (datos.id) {
      if (!existentes.some(c => c.id === datos.id)) throw new Error('La categoría ya no existe.');
      actualizarFila_('Categorias', datos.id, categoria);
      return Object.assign({ id: datos.id }, categoria);
    }
    const nueva = Object.assign({ id: nuevoId_() }, categoria);
    agregarFilas_('Categorias', [nueva]);
    return nueva;
  });
}

function guardarAjustes(datos) {
  conBloqueo_(() => {
    const nombre = String(datos.nombre || '').trim();
    if (!nombre) throw new Error('Escribe tu nombre.');
    const tc = Number(datos.ultimo_tc);
    if (!(tc >= 0)) throw new Error('El tipo de cambio debe ser un número positivo.');
    guardarConfig_({ nombre: nombre, ultimo_tc: tc });
  });
  return obtenerCatalogos().config;
}
```

- [ ] **Paso 7: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: todas PASS; lint sin errores.

- [ ] **Paso 8: Commit**

```bash
git add src/core/catalogos.js src/setup/asistente.js src/web/api.js tests/fixtures.js tests/catalogos.test.js
git commit -m "feat: catálogos, asistente de instalación y API de cuentas, categorías y ajustes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Movimientos (validación y API)

**Archivos:**
- Crear: `src/core/movimientos.js`, `tests/movimientos.test.js`
- Modificar: `src/web/api.js` (agregar al final)

**Interfaces:**
- Consume: Tareas 1–3 (`MONEDAS`, `leerTabla_`, `agregarFilas_`, `actualizarFila_`, `eliminarFila_`, `leerConfig_`, `conBloqueo_`).
- Produce:
  - `TIPOS_MOVIMIENTO` = `['gasto','ingreso','transferencia']`.
  - `normalizarMovimiento_(datos, ctx) → {fecha, tipo, monto, moneda, tc, monto_pen, cuenta_id, cuenta_destino_id, categoria_id, comercio, descripcion, origen, estado, ref_externa, dividido}`; `ctx = {cuentas, categorias, tcUsd, idsPrevios?}`.
  - Públicas: `guardarMovimiento(datos) → movimiento completo (con id y creado_en)`, `listarMovimientos({mes, cuenta_id?, categoria_id?}) → movimiento[]` (orden: fecha desc, luego `creado_en` desc), `eliminarMovimiento(id) → {ok:true}`.

- [ ] **Paso 1: Escribir la prueba que falla `tests/movimientos.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { entornoInstalado } = require('./fixtures');

const CTX = {
  cuentas: [
    { id: 'deb', nombre: 'Débito', moneda: 'PEN', activa: true },
    { id: 'visa', nombre: 'VISA', moneda: 'PEN', activa: true },
    { id: 'usd', nombre: 'Ahorro $', moneda: 'USD', activa: true },
    { id: 'vieja', nombre: 'Vieja', moneda: 'PEN', activa: false },
  ],
  categorias: [
    { id: 'super', nombre: 'Supermercado', tipo: 'gasto', activa: true },
    { id: 'sueldo', nombre: 'Sueldo', tipo: 'ingreso', activa: true },
    { id: 'antigua', nombre: 'Antigua', tipo: 'gasto', activa: false },
  ],
  tcUsd: 3.75,
};
const BASE = { fecha: '2026-10-06', tipo: 'gasto', monto: 89.3, cuenta_id: 'deb', categoria_id: 'super', comercio: ' Tottus ' };
const norm = (e, cambios, ctx) => e.llamar('normalizarMovimiento_', Object.assign({}, BASE, cambios), Object.assign({}, CTX, ctx));

test('gasto válido en soles', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(norm(e, {}), {
    fecha: '2026-10-06', tipo: 'gasto', monto: 89.3, moneda: 'PEN', tc: 1, monto_pen: 89.3,
    cuenta_id: 'deb', cuenta_destino_id: '', categoria_id: 'super', comercio: 'Tottus', descripcion: '',
    origen: 'manual', estado: 'confirmado', ref_externa: '', dividido: false,
  });
});

test('moneda: toma la de la cuenta, convierte USD con el tc configurado o el del movimiento', () => {
  const e = crearEntorno();
  const usd = norm(e, { moneda: 'USD', monto: 23.6 });
  assert.strictEqual(usd.tc, 3.75);
  assert.strictEqual(usd.monto_pen, 88.5);
  assert.strictEqual(norm(e, { moneda: 'USD', monto: 105.52, tc: 3.477 }).monto_pen, 366.89);
  assert.strictEqual(norm(e, { cuenta_id: 'usd' }).moneda, 'USD');
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { moneda: 'EUR' }), CTX), /Moneda/);
});

test('gasto en USD sin tipo de cambio configurado da un error claro (nunca NaN)', () => {
  const e = crearEntorno();
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { moneda: 'USD' }), Object.assign({}, CTX, { tcUsd: 0 })), /tipo de cambio/);
});

test('transferencia: exige destino distinto y no lleva categoría', () => {
  const e = crearEntorno();
  const t = norm(e, { tipo: 'transferencia', cuenta_destino_id: 'visa', monto: 600 });
  assert.strictEqual(t.cuenta_destino_id, 'visa');
  assert.strictEqual(t.categoria_id, '');
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { tipo: 'transferencia', cuenta_destino_id: 'deb' }), CTX), /distinta/);
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { tipo: 'transferencia', cuenta_destino_id: '' }), CTX), /destino no existe/);
});

test('categoría debe existir, estar activa y ser del mismo tipo', () => {
  const e = crearEntorno();
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { categoria_id: 'sueldo' }), CTX), /no es de gasto/);
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { categoria_id: 'nada' }), CTX), /categoría no existe/);
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { categoria_id: 'antigua' }), CTX), /desactivada/);
  assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, { cuenta_id: 'vieja' }), CTX), /desactivada/);
  // Al editar, una cuenta o categoría ya usada por el movimiento se permite aunque esté desactivada.
  assert.strictEqual(norm(e, { categoria_id: 'antigua', cuenta_id: 'vieja' }, { idsPrevios: ['vieja', 'antigua'] }).categoria_id, 'antigua');
});

test('monto y fecha', () => {
  const e = crearEntorno();
  const falla = (cambios, patron) => assert.throws(() => e.interno('normalizarMovimiento_', Object.assign({}, BASE, cambios), CTX), patron);
  falla({ monto: 0 }, /distinto de cero/);
  falla({ monto: 'abc' }, /distinto de cero/);
  falla({ tipo: 'ingreso', categoria_id: 'sueldo', monto: -5 }, /negativo/);
  falla({ fecha: '2026-13-01' }, /fecha/);
  falla({ tipo: 'prestamo' }, /Tipo de movimiento/);
  assert.strictEqual(norm(e, { monto: -20 }).monto_pen, -20); // reembolso de un gasto
  assert.strictEqual(norm(e, { monto: '12.346' }).monto, 12.35);
});

test('guardarMovimiento crea con id y creado_en y listarMovimientos lo devuelve', () => {
  const e = entornoInstalado();
  const deb = e.cuenta('Débito BCP');
  const sup = e.categoria('Supermercado');
  const locks = e.stats.locks;
  const m = e.llamar('guardarMovimiento', { fecha: '2026-10-06', tipo: 'gasto', monto: 89.3, cuenta_id: deb, categoria_id: sup, comercio: 'Tottus' });
  assert.ok(m.id);
  assert.strictEqual(m.creado_en, '2026-10-13 10:00:00');
  assert.strictEqual(e.stats.locks, locks + 1);
  assert.deepStrictEqual(e.llamar('listarMovimientos', { mes: '2026-10' }), [m]);
  assert.deepStrictEqual(e.llamar('listarMovimientos', { mes: '2026-09' }), []);
});

test('listarMovimientos filtra por cuenta (origen o destino) y categoría, y ordena por fecha y creación', () => {
  const e = entornoInstalado();
  const deb = e.cuenta('Débito BCP');
  const visa = e.cuenta('VISA BCP');
  const sup = e.categoria('Supermercado');
  const taxi = e.categoria('Transporte');
  const g = d => e.llamar('guardarMovimiento', Object.assign({ tipo: 'gasto', monto: 10, cuenta_id: deb, categoria_id: sup }, d));
  const a = g({ fecha: '2026-10-02' });
  e.fijarAhora('2026-10-13T11:00:00');
  const b = g({ fecha: '2026-10-05', categoria_id: taxi });
  e.fijarAhora('2026-10-13T12:00:00');
  const c = g({ fecha: '2026-10-05', cuenta_id: visa });
  const t = e.llamar('guardarMovimiento', { fecha: '2026-10-01', tipo: 'transferencia', monto: 50, cuenta_id: deb, cuenta_destino_id: visa });
  assert.deepStrictEqual(e.llamar('listarMovimientos', { mes: '2026-10' }).map(m => m.id), [c.id, b.id, a.id, t.id]);
  assert.deepStrictEqual(e.llamar('listarMovimientos', { mes: '2026-10', cuenta_id: visa }).map(m => m.id), [c.id, t.id]);
  assert.deepStrictEqual(e.llamar('listarMovimientos', { mes: '2026-10', categoria_id: taxi }).map(m => m.id), [b.id]);
  assert.throws(() => e.interno('listarMovimientos', { mes: 'octubre' }), /Mes inválido/);
});

test('editar conserva id, creado_en y origen; eliminar borra', () => {
  const e = entornoInstalado();
  const deb = e.cuenta('Débito BCP');
  const sup = e.categoria('Supermercado');
  const m = e.llamar('guardarMovimiento', { fecha: '2026-10-06', tipo: 'gasto', monto: 10, cuenta_id: deb, categoria_id: sup });
  e.fijarAhora('2026-10-14T09:00:00');
  const editado = e.llamar('guardarMovimiento', Object.assign({}, m, { monto: 12, origen: 'gmail' }));
  assert.strictEqual(editado.id, m.id);
  assert.strictEqual(editado.creado_en, m.creado_en);
  assert.strictEqual(editado.origen, 'manual');
  assert.strictEqual(e.filas('Movimientos')[0].monto, 12);
  assert.throws(() => e.interno('guardarMovimiento', Object.assign({}, m, { id: 'nada' })), /ya no existe/);
  assert.deepStrictEqual(e.llamar('eliminarMovimiento', m.id), { ok: true });
  assert.deepStrictEqual(e.filas('Movimientos'), []);
  assert.throws(() => e.interno('eliminarMovimiento', m.id), /No existe/);
});

test('un movimiento dividido no se edita desde el formulario normal', () => {
  const e = entornoInstalado();
  const m = e.llamar('guardarMovimiento', { fecha: '2026-10-06', tipo: 'gasto', monto: 10, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Supermercado') });
  e.interno('actualizarFila_', 'Movimientos', m.id, { dividido: true });
  assert.throws(() => e.interno('guardarMovimiento', Object.assign({}, m, { monto: 20 })), /dividido/);
});
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Run: `npm test`
Expected: FAIL con `normalizarMovimiento_ is not a function`.

- [ ] **Paso 3: Crear `src/core/movimientos.js`**

```js
// Validación y normalización de movimientos. Función pura: recibe catálogos en `ctx`.

const TIPOS_MOVIMIENTO = ['gasto', 'ingreso', 'transferencia'];

// Busca por id y exige que esté activa, salvo que el movimiento ya la usara (edición).
function buscarActiva_(lista, id, etiqueta, idsPrevios) {
  const item = lista.filter(x => x.id === id)[0];
  if (!item) throw new Error(etiqueta + ' no existe.');
  if (!item.activa && (idsPrevios || []).indexOf(id) < 0) {
    throw new Error(etiqueta + ' "' + item.nombre + '" está desactivada.');
  }
  return item;
}

// ctx = { cuentas, categorias, tcUsd, idsPrevios? }
function normalizarMovimiento_(datos, ctx) {
  const tipo = String(datos.tipo || '');
  if (TIPOS_MOVIMIENTO.indexOf(tipo) < 0) throw new Error('Tipo de movimiento inválido.');
  if (!esFechaIso_(datos.fecha)) throw new Error('La fecha debe tener el formato aaaa-mm-dd.');
  const monto = redondear2_(datos.monto);
  if (!isFinite(monto) || monto === 0) throw new Error('El monto debe ser un número distinto de cero.');
  if (monto < 0 && tipo !== 'gasto') throw new Error('Solo un gasto (reembolso) puede tener monto negativo.');
  const cuenta = buscarActiva_(ctx.cuentas, datos.cuenta_id, 'La cuenta', ctx.idsPrevios);
  const moneda = String(datos.moneda || cuenta.moneda || 'PEN');
  if (MONEDAS.indexOf(moneda) < 0) throw new Error('Moneda no soportada: ' + moneda);
  const tc = moneda === 'PEN' ? 1 : Number(datos.tc || ctx.tcUsd);
  if (!(tc > 0)) throw new Error('Falta el tipo de cambio para ' + moneda + '. Configúralo en Ajustes.');
  const mov = {
    fecha: datos.fecha, tipo: tipo, monto: monto, moneda: moneda, tc: tc, monto_pen: redondear2_(monto * tc),
    cuenta_id: cuenta.id, cuenta_destino_id: '', categoria_id: '',
    comercio: String(datos.comercio || '').trim(), descripcion: String(datos.descripcion || '').trim(),
    origen: datos.origen || 'manual', estado: datos.estado || 'confirmado',
    ref_externa: String(datos.ref_externa || ''), dividido: false,
  };
  if (tipo === 'transferencia') {
    const destino = buscarActiva_(ctx.cuentas, datos.cuenta_destino_id, 'La cuenta destino', ctx.idsPrevios);
    if (destino.id === cuenta.id) throw new Error('La cuenta destino debe ser distinta de la de origen.');
    mov.cuenta_destino_id = destino.id;
  } else {
    const cat = buscarActiva_(ctx.categorias, datos.categoria_id, 'La categoría', ctx.idsPrevios);
    if (cat.tipo !== tipo) throw new Error('La categoría "' + cat.nombre + '" no es de ' + tipo + '.');
    mov.categoria_id = cat.id;
  }
  return mov;
}
```

- [ ] **Paso 4: Agregar al final de `src/web/api.js`**

```js
function contextoMovimientos_() {
  return {
    cuentas: leerTabla_('Cuentas'),
    categorias: leerTabla_('Categorias'),
    tcUsd: Number(leerConfig_().ultimo_tc) || 0,
  };
}

function guardarMovimiento(datos) {
  return conBloqueo_(() => {
    const ctx = contextoMovimientos_();
    if (datos.id) {
      const previo = leerTabla_('Movimientos').filter(m => m.id === datos.id)[0];
      if (!previo) throw new Error('El movimiento ya no existe.');
      if (previo.dividido) throw new Error('Este movimiento está dividido; edítalo desde "Dividir".');
      ctx.idsPrevios = [previo.cuenta_id, previo.cuenta_destino_id, previo.categoria_id];
      const mov = normalizarMovimiento_(Object.assign({}, datos, {
        origen: previo.origen, estado: previo.estado, ref_externa: previo.ref_externa,
      }), ctx);
      actualizarFila_('Movimientos', previo.id, mov);
      return Object.assign({ id: previo.id }, mov, { creado_en: previo.creado_en });
    }
    const nuevo = Object.assign({ id: nuevoId_() }, normalizarMovimiento_(datos, ctx), {
      creado_en: formatearFecha_(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    });
    agregarFilas_('Movimientos', [nuevo]);
    return nuevo;
  });
}

function listarMovimientos(filtro) {
  filtro = filtro || {};
  const mes = validarMes_(filtro.mes);
  return leerTabla_('Movimientos')
    .filter(m => mesDe_(m.fecha) === mes)
    .filter(m => !filtro.cuenta_id || m.cuenta_id === filtro.cuenta_id || m.cuenta_destino_id === filtro.cuenta_id)
    .filter(m => !filtro.categoria_id || m.categoria_id === filtro.categoria_id)
    .sort((a, b) => (b.fecha + b.creado_en).localeCompare(a.fecha + a.creado_en));
}

function eliminarMovimiento(id) {
  conBloqueo_(() => eliminarFila_('Movimientos', id));
  return { ok: true };
}
```

- [ ] **Paso 5: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: todas PASS; lint sin errores.

- [ ] **Paso 6: Commit**

```bash
git add src/core/movimientos.js src/web/api.js tests/movimientos.test.js
git commit -m "feat: validación de movimientos y API para guardar, listar y eliminar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cálculos del dashboard y API

**Archivos:**
- Crear: `src/core/agregados.js`, `tests/agregados.test.js`
- Modificar: `src/web/api.js` (`obtenerCatalogos` agrega `saldos`; agregar `obtenerDashboard` al final)

**Interfaces:**
- Consume: Tareas 1–4.
- Produce:
  - `lineasCategoria_(movs, divisiones) → [{fecha, tipo, categoria_id, monto_pen}]` (sin transferencias; si `dividido`, una línea por división con `monto × tc`).
  - `resumenMes_(movs, mes) → {ingresos, gastos, ahorro, tasaAhorro}` (`tasaAhorro` entero % o `null` sin ingresos).
  - `gastoPorCategoria_(lineas, categorias, mes) → [{categoria_id, nombre, emoji, color, monto, porcentaje}]` orden desc, solo totales > 0.
  - `agruparCategorias_(lista, n)` → primeros `n` + `{categoria_id:'_resto', nombre:'Resto', ...}` si hay más de `n + 1`.
  - `tendencia_(movs, mesFin, n) → [{mes, ingresos, gastos}]` del más antiguo al `mesFin`.
  - `saldosPorCuenta_(movs, cuentas, tcUsd) → [{id, nombre, banco, tipo, saldo_pen}]` solo cuentas activas.
  - `topComercios_(movs, mes, n) → [{comercio, monto, veces}]`.
  - `construirDashboard_({movs, divisiones, categorias, cuentas, tcUsd}, mes) → {mes, resumen, resumenAnterior, categorias, tendencia, saldos, comercios}`.
  - Públicas: `obtenerDashboard(mes)`; `obtenerCatalogos()` ahora incluye `saldos` (mismo formato que `saldosPorCuenta_`).

- [ ] **Paso 1: Escribir la prueba que falla `tests/agregados.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { entornoInstalado } = require('./fixtures');

let n = 0;
function M(o) {
  const tc = o.tc || 1;
  return Object.assign({
    id: 'm' + (++n), tipo: 'gasto', moneda: 'PEN', tc: tc, cuenta_id: 'deb', cuenta_destino_id: '',
    categoria_id: 'super', comercio: '', estado: 'confirmado', dividido: false,
  }, o, { monto_pen: Math.round(o.monto * tc * 100) / 100 });
}
const CATS = [
  { id: 'super', nombre: 'Supermercado', emoji: '🛒', color: '#3ddc97', tipo: 'gasto' },
  { id: 'taxi', nombre: 'Transporte', emoji: '🚕', color: '#7c5cff', tipo: 'gasto' },
  { id: 'aseo', nombre: 'Aseo personal', emoji: '🧴', color: '#4cc9f0', tipo: 'gasto' },
  { id: 'sueldo', nombre: 'Sueldo', emoji: '💼', color: '#3ddc97', tipo: 'ingreso' },
];

test('resumenMes_: ignora transferencias, resta reembolsos y calcula la tasa de ahorro', () => {
  const e = crearEntorno();
  const movs = [
    M({ fecha: '2026-10-01', tipo: 'ingreso', monto: 3000, categoria_id: 'sueldo' }),
    M({ fecha: '2026-10-02', monto: 100 }),
    M({ fecha: '2026-10-03', monto: 50 }),
    M({ fecha: '2026-10-04', monto: -20 }),
    M({ fecha: '2026-10-05', tipo: 'transferencia', monto: 500, cuenta_destino_id: 'visa', categoria_id: '' }),
    M({ fecha: '2026-09-30', monto: 999 }),
  ];
  assert.deepStrictEqual(e.llamar('resumenMes_', movs, '2026-10'), { ingresos: 3000, gastos: 130, ahorro: 2870, tasaAhorro: 96 });
});

test('resumenMes_ sin ingresos: tasa null (nunca NaN ni Infinity)', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('resumenMes_', [M({ fecha: '2026-10-02', monto: 40 })], '2026-10'), { ingresos: 0, gastos: 40, ahorro: -40, tasaAhorro: null });
  assert.deepStrictEqual(e.llamar('resumenMes_', [], '2026-10'), { ingresos: 0, gastos: 0, ahorro: 0, tasaAhorro: null });
});

test('gastoPorCategoria_: suma por categoría, usa divisiones, porcentajes y orden', () => {
  const e = crearEntorno();
  const dividido = M({ id: 'mx', fecha: '2026-10-06', monto: 10, moneda: 'USD', tc: 4, dividido: true });
  const movs = [
    M({ fecha: '2026-10-02', monto: 60 }),
    M({ fecha: '2026-10-03', monto: 20, categoria_id: 'taxi' }),
    M({ fecha: '2026-10-04', monto: 10, categoria_id: 'borrada' }),
    M({ fecha: '2026-10-05', monto: -10, categoria_id: 'aseo' }), // reembolso: deja Aseo en 0
    M({ fecha: '2026-10-01', tipo: 'ingreso', monto: 1000, categoria_id: 'sueldo' }),
    dividido,
  ];
  const divisiones = [
    { id: 'd1', movimiento_id: 'mx', categoria_id: 'super', monto: 7.5 },
    { id: 'd2', movimiento_id: 'mx', categoria_id: 'aseo', monto: 2.5 },
  ];
  const lineas = e.interno('lineasCategoria_', movs, divisiones);
  assert.deepStrictEqual(e.llamar('gastoPorCategoria_', lineas, CATS, '2026-10'), [
    { categoria_id: 'super', nombre: 'Supermercado', emoji: '🛒', color: '#3ddc97', monto: 90, porcentaje: 75 },
    { categoria_id: 'taxi', nombre: 'Transporte', emoji: '🚕', color: '#7c5cff', monto: 20, porcentaje: 17 },
    { categoria_id: 'borrada', nombre: 'Sin categoría', emoji: '❓', color: '#3a3a48', monto: 10, porcentaje: 8 },
  ]);
});

test('agruparCategorias_: deja hasta n+1 tal cual; si hay más agrupa en Resto', () => {
  const e = crearEntorno();
  const lista = [7, 6, 5, 4, 3, 2, 1].map((m, i) => ({ categoria_id: 'c' + i, nombre: 'C' + i, emoji: '', color: '#000000', monto: m, porcentaje: m }));
  assert.strictEqual(e.llamar('agruparCategorias_', lista.slice(0, 6), 5).length, 6);
  const agrupada = e.llamar('agruparCategorias_', lista, 5);
  assert.strictEqual(agrupada.length, 6);
  assert.deepStrictEqual(agrupada[5], { categoria_id: '_resto', nombre: 'Resto', emoji: '•', color: '#3a3a48', monto: 3, porcentaje: 3 });
});

test('tendencia_: n meses terminando en el mes pedido, incluso vacíos', () => {
  const e = crearEntorno();
  const movs = [
    M({ fecha: '2026-10-01', tipo: 'ingreso', monto: 100, categoria_id: 'sueldo' }),
    M({ fecha: '2026-08-15', monto: 30 }),
  ];
  assert.deepStrictEqual(e.llamar('tendencia_', movs, '2026-10', 3), [
    { mes: '2026-08', ingresos: 0, gastos: 30 },
    { mes: '2026-09', ingresos: 0, gastos: 0 },
    { mes: '2026-10', ingresos: 100, gastos: 0 },
  ]);
});

test('saldosPorCuenta_: saldo inicial ± movimientos, tarjeta en negativo, USD convertido, solo activas', () => {
  const e = crearEntorno();
  const cuentas = [
    { id: 'deb', nombre: 'Débito', banco: 'BCP', tipo: 'debito', moneda: 'PEN', saldo_inicial: 1000, activa: true },
    { id: 'visa', nombre: 'VISA', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -200, activa: true },
    { id: 'usd', nombre: 'Ahorro $', banco: 'BCP', tipo: 'ahorro', moneda: 'USD', saldo_inicial: 100, activa: true },
    { id: 'vieja', nombre: 'Vieja', banco: 'Otro', tipo: 'debito', moneda: 'PEN', saldo_inicial: 5, activa: false },
  ];
  const movs = [
    M({ fecha: '2026-10-01', tipo: 'ingreso', monto: 500, categoria_id: 'sueldo' }),
    M({ fecha: '2026-10-02', monto: 50 }),
    M({ fecha: '2026-10-03', monto: 80, cuenta_id: 'visa' }),
    M({ fecha: '2026-10-04', tipo: 'transferencia', monto: 200, cuenta_destino_id: 'visa', categoria_id: '' }),
  ];
  assert.deepStrictEqual(e.llamar('saldosPorCuenta_', movs, cuentas, 3.75), [
    { id: 'deb', nombre: 'Débito', banco: 'BCP', tipo: 'debito', saldo_pen: 1250 },
    { id: 'visa', nombre: 'VISA', banco: 'BCP', tipo: 'credito', saldo_pen: -80 },
    { id: 'usd', nombre: 'Ahorro $', banco: 'BCP', tipo: 'ahorro', saldo_pen: 375 },
  ]);
});

test('topComercios_: agrupa nombres equivalentes, solo gastos del mes, top n', () => {
  const e = crearEntorno();
  const movs = [
    M({ fecha: '2026-10-02', monto: 50, comercio: 'Tottus' }),
    M({ fecha: '2026-10-09', monto: 40, comercio: 'TOTTUS ' }),
    M({ fecha: '2026-10-03', monto: 12, comercio: 'Taxi' }),
    M({ fecha: '2026-10-04', monto: 70, comercio: 'Zara' }),
    M({ fecha: '2026-10-05', monto: 5, comercio: '' }),
    M({ fecha: '2026-09-05', monto: 500, comercio: 'Tottus' }),
    M({ fecha: '2026-10-01', tipo: 'ingreso', monto: 900, comercio: 'Empresa', categoria_id: 'sueldo' }),
  ];
  assert.deepStrictEqual(e.llamar('topComercios_', movs, '2026-10', 2), [
    { comercio: 'Tottus', monto: 90, veces: 2 },
    { comercio: 'Zara', monto: 70, veces: 1 },
  ]);
});

test('obtenerDashboard y obtenerCatalogos.saldos desde la hoja', () => {
  const e = entornoInstalado();
  const deb = e.cuenta('Débito BCP');
  e.llamar('guardarMovimiento', { fecha: '2026-10-01', tipo: 'ingreso', monto: 2000, cuenta_id: deb, categoria_id: e.categoria('Sueldo') });
  e.llamar('guardarMovimiento', { fecha: '2026-10-06', tipo: 'gasto', monto: 89.3, cuenta_id: deb, categoria_id: e.categoria('Supermercado'), comercio: 'Tottus' });
  const d = e.llamar('obtenerDashboard', '2026-10');
  assert.strictEqual(d.mes, '2026-10');
  assert.deepStrictEqual(d.resumen, { ingresos: 2000, gastos: 89.3, ahorro: 1910.7, tasaAhorro: 96 });
  assert.deepStrictEqual(d.resumenAnterior, { ingresos: 0, gastos: 0, ahorro: 0, tasaAhorro: null });
  assert.strictEqual(d.categorias[0].nombre, 'Supermercado');
  assert.strictEqual(d.tendencia.length, 6);
  assert.deepStrictEqual(d.comercios, [{ comercio: 'Tottus', monto: 89.3, veces: 1 }]);
  assert.deepStrictEqual(d.saldos.map(s => s.saldo_pen), [2910.7, -200]);
  assert.deepStrictEqual(e.llamar('obtenerCatalogos').saldos, d.saldos);
  assert.throws(() => e.interno('obtenerDashboard', '2026-1'), /Mes inválido/);
});
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Run: `npm test`
Expected: FAIL con `resumenMes_ is not a function`.

- [ ] **Paso 3: Crear `src/core/agregados.js`**

```js
// Cálculos del dashboard. Funciones puras: reciben las listas ya leídas de la hoja.
// Todo suma en monto_pen; las transferencias no son gasto ni ingreso.

const SIN_CATEGORIA = { nombre: 'Sin categoría', emoji: '❓', color: '#3a3a48' };

function lineasCategoria_(movs, divisiones) {
  const porMovimiento = {};
  divisiones.forEach(d => { (porMovimiento[d.movimiento_id] = porMovimiento[d.movimiento_id] || []).push(d); });
  const lineas = [];
  movs.forEach(m => {
    if (m.tipo === 'transferencia') return;
    const partes = m.dividido ? porMovimiento[m.id] : null;
    if (partes && partes.length) {
      partes.forEach(d => lineas.push({ fecha: m.fecha, tipo: m.tipo, categoria_id: d.categoria_id, monto_pen: redondear2_(d.monto * m.tc) }));
    } else {
      lineas.push({ fecha: m.fecha, tipo: m.tipo, categoria_id: m.categoria_id, monto_pen: m.monto_pen });
    }
  });
  return lineas;
}

function resumenMes_(movs, mes) {
  let ingresos = 0;
  let gastos = 0;
  movs.forEach(m => {
    if (mesDe_(m.fecha) !== mes) return;
    if (m.tipo === 'ingreso') ingresos += m.monto_pen;
    else if (m.tipo === 'gasto') gastos += m.monto_pen;
  });
  ingresos = redondear2_(ingresos);
  gastos = redondear2_(gastos);
  const ahorro = redondear2_(ingresos - gastos);
  return { ingresos: ingresos, gastos: gastos, ahorro: ahorro, tasaAhorro: ingresos > 0 ? Math.round(ahorro / ingresos * 100) : null };
}

function gastoPorCategoria_(lineas, categorias, mes) {
  const totales = {};
  lineas.forEach(l => {
    if (l.tipo !== 'gasto' || mesDe_(l.fecha) !== mes) return;
    totales[l.categoria_id] = (totales[l.categoria_id] || 0) + l.monto_pen;
  });
  const ids = Object.keys(totales).filter(id => redondear2_(totales[id]) > 0);
  const total = ids.reduce((s, id) => s + totales[id], 0);
  return ids.map(id => {
    const c = categorias.filter(x => x.id === id)[0] || SIN_CATEGORIA;
    return {
      categoria_id: id, nombre: c.nombre, emoji: c.emoji, color: c.color,
      monto: redondear2_(totales[id]), porcentaje: Math.round(totales[id] / total * 100),
    };
  }).sort((a, b) => b.monto - a.monto);
}

// Agrupar una sola categoría en "Resto" no aporta: solo se agrupa si sobran 2 o más.
function agruparCategorias_(lista, n) {
  if (lista.length <= n + 1) return lista;
  const resto = lista.slice(n);
  return lista.slice(0, n).concat([{
    categoria_id: '_resto', nombre: 'Resto', emoji: '•', color: '#3a3a48',
    monto: redondear2_(resto.reduce((s, c) => s + c.monto, 0)),
    porcentaje: resto.reduce((s, c) => s + c.porcentaje, 0),
  }]);
}

function tendencia_(movs, mesFin, n) {
  const meses = [];
  for (let i = n - 1; i >= 0; i--) meses.push(sumarMeses_(mesFin, -i));
  return meses.map(mes => {
    const r = resumenMes_(movs, mes);
    return { mes: mes, ingresos: r.ingresos, gastos: r.gastos };
  });
}

function saldosPorCuenta_(movs, cuentas, tcUsd) {
  const saldos = {};
  const tiene = id => Object.prototype.hasOwnProperty.call(saldos, id);
  cuentas.forEach(c => { saldos[c.id] = c.moneda === 'USD' ? c.saldo_inicial * (tcUsd || 0) : c.saldo_inicial; });
  movs.forEach(m => {
    if (m.tipo === 'ingreso' && tiene(m.cuenta_id)) saldos[m.cuenta_id] += m.monto_pen;
    if (m.tipo === 'gasto' && tiene(m.cuenta_id)) saldos[m.cuenta_id] -= m.monto_pen;
    if (m.tipo === 'transferencia') {
      if (tiene(m.cuenta_id)) saldos[m.cuenta_id] -= m.monto_pen;
      if (tiene(m.cuenta_destino_id)) saldos[m.cuenta_destino_id] += m.monto_pen;
    }
  });
  return cuentas.filter(c => c.activa).map(c => ({
    id: c.id, nombre: c.nombre, banco: c.banco, tipo: c.tipo, saldo_pen: redondear2_(saldos[c.id]),
  }));
}

function topComercios_(movs, mes, n) {
  const grupos = {};
  movs.forEach(m => {
    const nombre = String(m.comercio || '').trim();
    if (m.tipo !== 'gasto' || mesDe_(m.fecha) !== mes || !nombre) return;
    const clave = normalizarTexto_(nombre);
    const g = grupos[clave] || (grupos[clave] = { comercio: nombre, monto: 0, veces: 0 });
    g.monto += m.monto_pen;
    g.veces++;
  });
  return Object.keys(grupos).map(k => grupos[k])
    .filter(g => g.monto > 0)
    .map(g => ({ comercio: g.comercio, monto: redondear2_(g.monto), veces: g.veces }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, n);
}

// datos = { movs, divisiones, categorias, cuentas, tcUsd }
function construirDashboard_(datos, mes) {
  const lineas = lineasCategoria_(datos.movs, datos.divisiones);
  return {
    mes: mes,
    resumen: resumenMes_(datos.movs, mes),
    resumenAnterior: resumenMes_(datos.movs, sumarMeses_(mes, -1)),
    categorias: agruparCategorias_(gastoPorCategoria_(lineas, datos.categorias, mes), 5),
    tendencia: tendencia_(datos.movs, mes, 6),
    saldos: saldosPorCuenta_(datos.movs, datos.cuentas, datos.tcUsd),
    comercios: topComercios_(datos.movs, mes, 5),
  };
}
```

- [ ] **Paso 4: Modificar `obtenerCatalogos` en `src/web/api.js`**

Reemplazar la función completa por:

```js
function obtenerCatalogos() {
  const config = leerConfig_();
  const cuentas = leerTabla_('Cuentas');
  const tcUsd = Number(config.ultimo_tc) || 0;
  return {
    cuentas: cuentas,
    categorias: leerTabla_('Categorias'),
    saldos: saldosPorCuenta_(leerTabla_('Movimientos'), cuentas, tcUsd),
    config: {
      nombre: config.nombre || '',
      ultimo_tc: tcUsd,
      moneda_principal: config.moneda_principal || 'PEN',
    },
    opciones: { bancos: BANCOS, tiposCuenta: TIPOS_CUENTA, monedas: MONEDAS },
    modoDemo: PropertiesService.getScriptProperties().getProperty('MODO_DEMO') === 'si',
    urlHoja: abrirLibro_().getUrl(),
  };
}
```

- [ ] **Paso 5: Agregar al final de `src/web/api.js`**

```js
function obtenerDashboard(mes) {
  validarMes_(mes);
  return construirDashboard_({
    movs: leerTabla_('Movimientos'),
    divisiones: leerTabla_('Divisiones'),
    categorias: leerTabla_('Categorias'),
    cuentas: leerTabla_('Cuentas'),
    tcUsd: Number(leerConfig_().ultimo_tc) || 0,
  }, mes);
}
```

- [ ] **Paso 6: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: todas PASS; lint sin errores.

- [ ] **Paso 7: Commit**

```bash
git add src/core/agregados.js src/web/api.js tests/agregados.test.js
git commit -m "feat: cálculos del dashboard y API obtenerDashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Modo demo

**Archivos:**
- Crear: `src/setup/demo.js`, `tests/demo.test.js`

**Interfaces:**
- Consume: Tareas 1–5 (`CATEGORIAS_POR_DEFECTO`, `PALETA`, `crearHojas_`, `agregarFilas_`, `guardarConfig_`, `estadoInstalacion`, `normalizarMovimiento_`).
- Produce:
  - `aleatorio_(semilla) → () => número en [0,1)` determinista.
  - `generarDatosDemo_(hoyIso) → {cuentas, categorias, movimientos}` (3 meses: desde el día 1 de hace 2 meses hasta `hoyIso`; ids `demo-*`).
  - Públicas: `cargarDemo() → estadoInstalacion()` (crea la hoja demo una sola vez, guarda `DEMO_SHEET_ID`, activa `MODO_DEMO='si'`), `salirDemo() → estadoInstalacion()` (`MODO_DEMO='no'`).

- [ ] **Paso 1: Escribir la prueba que falla `tests/demo.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

test('generarDatosDemo_ es determinista, cubre 3 meses y cada movimiento es válido', () => {
  const e = crearEntorno();
  const a = e.llamar('generarDatosDemo_', '2026-10-13');
  const b = e.llamar('generarDatosDemo_', '2026-10-13');
  assert.deepStrictEqual(a, b);
  const fechas = a.movimientos.map(m => m.fecha).sort();
  assert.strictEqual(fechas[0], '2026-08-01');
  assert.ok(fechas[fechas.length - 1] <= '2026-10-13');
  assert.strictEqual(a.movimientos.filter(m => m.tipo === 'ingreso').length, 3);
  assert.ok(a.movimientos.some(m => m.moneda === 'USD' && m.tc === 3.75));
  assert.ok(a.movimientos.some(m => m.tipo === 'transferencia'));
  assert.ok(a.movimientos.length > 60);
  const ctx = { cuentas: a.cuentas, categorias: a.categorias, tcUsd: 3.75 };
  a.movimientos.forEach(m => {
    const n = e.llamar('normalizarMovimiento_', m, ctx);
    assert.strictEqual(n.monto_pen, m.monto_pen, 'monto_pen de ' + m.id);
  });
});

test('cargarDemo crea una hoja aparte, activa el modo demo y no toca la hoja real', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('cargarDemo'), { instalado: true, modoDemo: true });
  assert.strictEqual(e.propiedades.MODO_DEMO, 'si');
  const idDemo = e.propiedades.DEMO_SHEET_ID;
  assert.ok(idDemo && idDemo !== 'libro-principal');
  assert.deepStrictEqual(Object.keys(e.hojas), []);
  const d = e.llamar('obtenerDashboard', '2026-10');
  assert.ok(d.resumen.gastos > 0);
  const total = e.libros[idDemo]._hojas.Movimientos.length;
  e.llamar('cargarDemo');
  assert.strictEqual(e.propiedades.DEMO_SHEET_ID, idDemo);
  assert.strictEqual(e.libros[idDemo]._hojas.Movimientos.length, total);
});

test('salirDemo vuelve a la hoja real', () => {
  const e = crearEntorno();
  e.llamar('cargarDemo');
  assert.deepStrictEqual(e.llamar('salirDemo'), { instalado: false, modoDemo: false });
  assert.strictEqual(e.interno('abrirLibro_'), e.principal);
});

test('cargarDemo recrea la hoja demo si fue borrada', () => {
  const e = crearEntorno({ propiedades: { DEMO_SHEET_ID: 'borrada' } });
  e.llamar('cargarDemo');
  assert.notStrictEqual(e.propiedades.DEMO_SHEET_ID, 'borrada');
  assert.strictEqual(e.llamar('estadoInstalacion').modoDemo, true);
});
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Run: `npm test`
Expected: FAIL con `generarDatosDemo_ is not a function`.

- [ ] **Paso 3: Crear `src/setup/demo.js`**

```js
// Datos ficticios para mostrar la app sin exponer finanzas reales. Se guardan en una
// Google Sheet aparte; la hoja real no se toca. Generación determinista (semilla fija).

function aleatorio_(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generarDatosDemo_(hoyIso) {
  const rnd = aleatorio_(20261013);
  const entre = (min, max) => redondear2_(min + rnd() * (max - min));
  const elegir = lista => lista[Math.floor(rnd() * lista.length)];
  const cuentas = [
    { id: 'demo-debito', nombre: 'Débito', banco: 'BCP', tipo: 'debito', moneda: 'PEN', saldo_inicial: 2500, ultimos4: '1111', activa: true },
    { id: 'demo-visa', nombre: 'VISA', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -350, ultimos4: '2222', activa: true },
    { id: 'demo-efectivo', nombre: 'Efectivo', banco: 'Efectivo', tipo: 'efectivo', moneda: 'PEN', saldo_inicial: 150, ultimos4: '', activa: true },
  ];
  const categorias = CATEGORIAS_POR_DEFECTO.map((c, i) => ({
    id: 'demo-cat-' + (i + 1), nombre: c[0], emoji: c[1], color: PALETA[i % PALETA.length], tipo: c[2], padre_id: '', activa: true,
  }));
  const cat = nombre => categorias.filter(c => c.nombre === nombre)[0].id;
  const movimientos = [];
  const agregar = (fecha, tipo, monto, cuentaId, extra) => {
    const moneda = extra.moneda || 'PEN';
    const tc = moneda === 'USD' ? 3.75 : 1;
    movimientos.push(Object.assign({
      id: 'demo-mov-' + (movimientos.length + 1), fecha: fecha, tipo: tipo, monto: monto,
      cuenta_id: cuentaId, cuenta_destino_id: '', categoria_id: '', comercio: '', descripcion: '',
      origen: 'manual', estado: 'confirmado', ref_externa: '', dividido: false, creado_en: fecha + ' 12:00:00',
    }, extra, { moneda: moneda, tc: tc, monto_pen: redondear2_(monto * tc) }));
  };
  const partes = hoyIso.split('-').map(Number);
  const fin = new Date(partes[0], partes[1] - 1, partes[2]);
  for (let d = new Date(partes[0], partes[1] - 3, 1); d <= fin; d.setDate(d.getDate() + 1)) {
    const fecha = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dia = d.getDate();
    if (dia === 1) agregar(fecha, 'ingreso', 3500, 'demo-debito', { categoria_id: cat('Sueldo'), comercio: 'Empresa Demo SAC', descripcion: 'Sueldo' });
    if (dia === 5) agregar(fecha, 'gasto', 11.9, 'demo-debito', { categoria_id: cat('Suscripciones'), comercio: 'Spotify' });
    if (dia === 8) agregar(fecha, 'gasto', 120, 'demo-debito', { categoria_id: cat('Salud y gym'), comercio: 'Gimnasio Demo' });
    if (dia === 10) agregar(fecha, 'gasto', entre(70, 110), 'demo-debito', { categoria_id: cat('Vivienda y servicios'), comercio: 'Luz del Sur' });
    if (dia === 16) agregar(fecha, 'gasto', 9.99, 'demo-visa', { categoria_id: cat('Suscripciones'), comercio: 'Netflix', moneda: 'USD' });
    if (dia === 20) agregar(fecha, 'transferencia', 600, 'demo-debito', { cuenta_destino_id: 'demo-visa', descripcion: 'Pago tarjeta VISA' });
    if (dia % 7 === 3) agregar(fecha, 'gasto', entre(80, 210), 'demo-debito', { categoria_id: cat('Supermercado'), comercio: elegir(['Tottus', 'Plaza Vea', 'Metro']) });
    if (rnd() < 0.5) agregar(fecha, 'gasto', entre(3, 15), elegir(['demo-efectivo', 'demo-debito']), { categoria_id: cat('Bodega'), comercio: elegir(['Bodega Don Lucho', 'Minimarket La Esquina']) });
    if (rnd() < 0.35) agregar(fecha, 'gasto', entre(8, 16), 'demo-debito', { categoria_id: cat('Transporte'), comercio: 'Taxi', descripcion: 'Yape' });
    if (rnd() < 0.25) agregar(fecha, 'gasto', entre(18, 48), 'demo-visa', { categoria_id: cat('Comida fuera'), comercio: elegir(['Pardos Chicken', 'Sushi Bar', 'Menú El Rincón']) });
    if (rnd() < 0.05) agregar(fecha, 'gasto', entre(60, 160), 'demo-visa', { categoria_id: cat('Ropa'), comercio: elegir(['Saga Falabella', 'Zara']) });
    if (rnd() < 0.06) agregar(fecha, 'gasto', entre(15, 40), 'demo-debito', { categoria_id: cat('Aseo personal'), comercio: 'Inkafarma' });
  }
  return { cuentas: cuentas, categorias: categorias, movimientos: movimientos };
}

function cargarDemo() {
  return conBloqueo_(() => {
    const props = PropertiesService.getScriptProperties();
    let libro = null;
    const id = props.getProperty('DEMO_SHEET_ID');
    if (id) {
      try { libro = SpreadsheetApp.openById(id); } catch { libro = null; }
    }
    const nuevo = !libro;
    if (nuevo) {
      libro = SpreadsheetApp.create('Finanzas — DEMO');
      props.setProperty('DEMO_SHEET_ID', libro.getId());
    }
    props.setProperty('MODO_DEMO', 'si');
    if (nuevo) {
      crearHojas_(libro);
      const datos = generarDatosDemo_(hoyIso_());
      agregarFilas_('Cuentas', datos.cuentas);
      agregarFilas_('Categorias', datos.categorias);
      agregarFilas_('Movimientos', datos.movimientos);
      guardarConfig_({
        nombre: 'Demo', moneda_principal: 'PEN', ultimo_tc: 3.75, modo_bot: 'B', hora_resumen: '21:00',
        version_esquema: VERSION_ESQUEMA, instalado: 'si',
      });
    }
    return estadoInstalacion();
  });
}

function salirDemo() {
  PropertiesService.getScriptProperties().setProperty('MODO_DEMO', 'no');
  return estadoInstalacion();
}
```

- [ ] **Paso 4: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: todas PASS; lint sin errores.

- [ ] **Paso 5: Commit**

```bash
git add src/setup/demo.js tests/demo.test.js
git commit -m "feat: modo demo con datos ficticios en una hoja aparte

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Base de la interfaz (servidor web, esqueleto, estilos, cliente) y herramientas de revisión

**Archivos:**
- Crear: `src/web/servidor.js`, `src/web/Index.html`, `src/web/estilos.html`, `src/web/cliente.html`, `DESIGN.md`, `tests/ui/stub.js`, `tests/ui/ver.js`

**Interfaces:**
- Produce (servidor): `doGet()`, `incluir_(nombre)` (incluye `src/web/<nombre>.html` sin el prefijo `src/`, p. ej. `incluir_('web/estilos')`).
- Produce (navegador, global): `VISTAS` (objeto `{nombre: async (contenedor) => void}`), `estado` (`{vista, mes, catalogos, filtro}`), `api(nombre, ...args) → Promise`, `esc(t)`, `dinero(n, moneda?)`, `nombreMes(mes)`, `sumarMes(mes, n)`, `hoyIso()`, `$(sel, raiz?)`, `aviso(texto, malo?)`, `leerLocal(k)`, `guardarLocal(k, v)`, `selectorMes()`, `enlazarMes(cont)`, `categoria(id)`, `cuenta(id)`, `campo(etiqueta, control)`, `seleccion(id, valores, actual, etiquetas?)`, `cargarCatalogos()`, `mostrar(vista)`, `abrirModal(html) → caja`, `cerrarModal()`, `iniciar()`.
- Produce (herramienta): `node tests/ui/ver.js "<js>" <id> [captura.png] [ancho]` → imprime JSON `{visible, texto, error, llamadas}`.

- [ ] **Paso 1: Crear `src/web/servidor.js`**

```js
// Punto de entrada de la web app.

function doGet() {
  return HtmlService.createTemplateFromFile('web/Index').evaluate()
    .setTitle('Finanzas')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

// Usado desde las plantillas: <?!= incluir_('web/estilos'); ?>
function incluir_(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}
```

- [ ] **Paso 2: Crear `src/web/Index.html`** (las vistas se agregan en las tareas 8–11, cada una con su línea `incluir_`)

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <base target="_top">
  <meta charset="utf-8">
  <?!= incluir_('web/estilos'); ?>
</head>
<body>
  <div id="banner-demo" hidden>Modo demo: estás viendo datos ficticios.</div>
  <header class="barra">
    <span class="marca">💸 Finanzas</span>
    <nav>
      <button class="pestana" data-vista="inicio">Inicio</button>
      <button class="pestana" data-vista="movimientos">Movimientos</button>
      <button class="pestana" data-vista="cuentas">Cuentas</button>
      <button class="pestana" data-vista="ajustes">Ajustes</button>
    </nav>
  </header>
  <main id="vista"></main>
  <nav class="barra-movil">
    <button class="pestana" data-vista="inicio"><span>📊</span>Inicio</button>
    <button class="pestana" data-vista="movimientos"><span>🧾</span>Movimientos</button>
    <button class="pestana" data-vista="cuentas"><span>🏦</span>Cuentas</button>
    <button class="pestana" data-vista="ajustes"><span>⚙️</span>Ajustes</button>
  </nav>
  <button id="fab" title="Nuevo movimiento" aria-label="Nuevo movimiento" hidden>+</button>
  <div id="modal" hidden></div>
  <div id="aviso" role="status" hidden></div>
  <?!= incluir_('web/cliente'); ?>
</body>
</html>
```

- [ ] **Paso 3: Crear `src/web/estilos.html`**

```html
<style>
:root {
  --fondo: #0b0b10; --superficie: #17171f; --superficie-2: #1f1f29; --borde: #23232e;
  --texto: #f2f2f7; --texto-2: #8b8b99; --primario: #7c5cff; --positivo: #3ddc97;
  --alerta: #ffb347; --negativo: #ff6b6b; --info: #4cc9f0;
  --radio: 16px; --radio-s: 10px;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--fondo); color: var(--texto); font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif; font-size: 15px; -webkit-font-smoothing: antialiased; }
button, input, select { font: inherit; color: inherit; }
.num { font-variant-numeric: tabular-nums; }
.tenue { color: var(--texto-2); }
.pos { color: var(--positivo); }
.neg { color: var(--negativo); }
.der { text-align: right; }

/* Navegación */
.barra { display: flex; align-items: center; gap: 20px; padding: 14px 24px; border-bottom: 1px solid var(--borde); position: sticky; top: 0; background: rgba(11, 11, 16, .92); backdrop-filter: blur(8px); z-index: 5; }
.marca { font-weight: 700; }
.barra nav { display: flex; gap: 4px; }
.pestana { background: none; border: 0; color: var(--texto-2); padding: 8px 12px; border-radius: var(--radio-s); cursor: pointer; }
.pestana.activo { color: var(--texto); background: var(--superficie); }
.barra-movil { display: none; }
body.sin-instalar .barra nav, body.sin-instalar .barra-movil, body.sin-instalar #fab { display: none !important; }
#banner-demo { background: rgba(255, 179, 71, .12); color: var(--alerta); text-align: center; font-size: 13px; padding: 6px; }
main { max-width: 1180px; margin: 0 auto; padding: 20px 24px 110px; }

/* Cabecera y mes */
.cabecera { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.cabecera h1 { font-size: 22px; margin: 0; letter-spacing: -.3px; }
.mes { display: flex; align-items: center; gap: 6px; }
.mes button { background: var(--superficie); border: 1px solid var(--borde); border-radius: 8px; width: 32px; height: 32px; cursor: pointer; }
.mes span { min-width: 130px; text-align: center; font-weight: 600; }

/* Tarjetas y dashboard */
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.tarjeta { background: var(--superficie); border: 1px solid var(--borde); border-radius: var(--radio); padding: 16px; min-width: 0; }
.ancho-2 { grid-column: span 2; }
.etiqueta { font-size: 12px; color: var(--texto-2); margin-bottom: 6px; }
.kpi { font-size: 24px; font-weight: 700; letter-spacing: -.4px; }
.dona-fila { display: flex; gap: 16px; align-items: center; }
.dona { width: 120px; height: 120px; flex: none; }
.filas { flex: 1; min-width: 0; }
.fila-barra { display: grid; grid-template-columns: minmax(90px, 150px) 1fr 84px 40px; gap: 10px; align-items: center; font-size: 13px; padding: 5px 4px; }
.fila-barra.cabeza { font-size: 10px; color: var(--texto-2); text-transform: uppercase; letter-spacing: .05em; }
.fila-barra.clic { cursor: pointer; border-radius: 8px; }
.fila-barra.clic:hover { background: var(--superficie-2); }
.fila-barra > span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini { height: 6px; background: var(--borde); border-radius: 99px; overflow: hidden; }
.mini i { display: block; height: 100%; border-radius: 99px; }
.fila-simple { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 7px 0; border-bottom: 1px solid var(--borde); }
.fila-simple:last-child { border-bottom: 0; }

/* Listas */
.lista { display: flex; flex-direction: column; }
.dia { font-size: 12px; color: var(--texto-2); margin: 14px 0 6px; display: flex; justify-content: space-between; }
.item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--superficie); border: 1px solid var(--borde); border-radius: 12px; margin-bottom: 6px; cursor: pointer; }
.item .icono { width: 34px; height: 34px; border-radius: 10px; background: var(--superficie-2); display: flex; align-items: center; justify-content: center; flex: none; }
.item .cuerpo { flex: 1; min-width: 0; }
.item .titulo { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item .sub { font-size: 12px; color: var(--texto-2); }
.filtros { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.filtros .entrada { width: auto; flex: 1; min-width: 150px; }
.vacio, .cargando, .error { padding: 40px 16px; text-align: center; color: var(--texto-2); }
.error { color: var(--negativo); }

/* Formularios */
.campo { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.campo > label { font-size: 12px; color: var(--texto-2); }
.entrada { background: var(--fondo); border: 1px solid var(--borde); border-radius: var(--radio-s); padding: 10px 12px; width: 100%; }
.entrada:focus { outline: 2px solid var(--primario); outline-offset: -1px; }
.monto-grande { font-size: 32px; font-weight: 700; text-align: center; padding: 8px; }
.segmento { display: flex; background: var(--fondo); border-radius: 12px; padding: 4px; gap: 4px; margin-bottom: 14px; }
.segmento button { flex: 1; border: 0; background: none; padding: 8px; border-radius: 9px; color: var(--texto-2); cursor: pointer; }
.segmento button.activo { background: var(--superficie-2); color: var(--texto); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border: 1px solid var(--borde); background: var(--fondo); border-radius: 99px; padding: 7px 11px; font-size: 13px; cursor: pointer; }
.chip.activo { border-color: var(--primario); background: rgba(124, 92, 255, .18); }
.chip.apagado { opacity: .45; text-decoration: line-through; }
.boton { display: inline-block; border: 0; border-radius: 12px; padding: 11px 16px; font-weight: 600; cursor: pointer; background: var(--superficie-2); color: var(--texto); text-decoration: none; text-align: center; }
.boton.primario { background: var(--positivo); color: #0b0b10; }
.boton.peligro { background: rgba(255, 107, 107, .15); color: var(--negativo); }
.boton:disabled { opacity: .5; cursor: default; }
.acciones { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
.acciones .boton { flex: 1; }
.dos-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.check { display: flex; gap: 8px; align-items: center; font-size: 14px; margin: 4px 0 8px; }
.seccion { margin-bottom: 12px; }
.cabecera-seccion { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.titulo-modal { margin: 0 0 14px; font-size: 19px; }
.asistente { max-width: 560px; margin: 20px auto; }
.pasos { display: flex; gap: 6px; margin-bottom: 16px; }
.pasos i { flex: 1; height: 4px; border-radius: 99px; background: var(--borde); }
.pasos i.hecho { background: var(--primario); }

/* Botón flotante, modal y aviso */
#fab { position: fixed; right: 20px; bottom: 24px; width: 56px; height: 56px; border-radius: 50%; border: 0; background: var(--primario); color: #fff; font-size: 28px; box-shadow: 0 8px 24px rgba(124, 92, 255, .35); cursor: pointer; z-index: 6; }
#fab[hidden] { display: none; }
#modal { position: fixed; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; }
#modal[hidden] { display: none; }
.modal-fondo { position: absolute; inset: 0; background: rgba(0, 0, 0, .6); }
.modal-caja { position: relative; background: var(--superficie); border: 1px solid var(--borde); border-radius: 20px; padding: 20px; width: min(480px, calc(100% - 32px)); max-height: calc(100% - 40px); overflow: auto; }
#aviso { position: fixed; left: 50%; transform: translateX(-50%); bottom: 100px; background: var(--superficie-2); border: 1px solid var(--borde); padding: 10px 16px; border-radius: 12px; z-index: 20; max-width: calc(100% - 32px); }
#aviso[hidden] { display: none; }
#aviso.mal { border-color: var(--negativo); color: var(--negativo); }

/* Celular */
@media (max-width: 720px) {
  .barra nav { display: none; }
  .barra { padding: 12px 16px; }
  main { padding: 14px 16px 130px; }
  .grid { grid-template-columns: 1fr 1fr; }
  .dona-fila { flex-direction: column; align-items: stretch; }
  .dona { align-self: center; }
  .fila-barra { grid-template-columns: minmax(80px, 1fr) 56px 78px 34px; gap: 8px; }
  .kpi { font-size: 20px; }
  .barra-movil { display: flex; position: fixed; bottom: 0; left: 0; right: 0; background: rgba(11, 11, 16, .96); border-top: 1px solid var(--borde); padding: 6px 4px calc(6px + env(safe-area-inset-bottom)); justify-content: space-around; z-index: 5; }
  .barra-movil .pestana { display: flex; flex-direction: column; align-items: center; font-size: 11px; gap: 2px; }
  #fab { bottom: calc(76px + env(safe-area-inset-bottom)); }
  #modal { align-items: flex-end; }
  .modal-caja { width: 100%; border-radius: 20px 20px 0 0; max-height: 92%; padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
}
</style>
```

- [ ] **Paso 4: Crear `src/web/cliente.html`**

```html
<script>
'use strict';
// Utilidades del navegador, enrutador de vistas y llamadas al servidor.
const VISTAS = {};
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const estado = { vista: 'inicio', mes: mesActual(), catalogos: null, filtro: {} };

function pad2(n) { return String(n).padStart(2, '0'); }
function mesActual() { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
function hoyIso() { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function sumarMes(mes, n) {
  const p = mes.split('-').map(Number);
  const t = p[0] * 12 + p[1] - 1 + n;
  return Math.floor(t / 12) + '-' + pad2((t % 12) + 1);
}
function nombreMes(mes) { const p = mes.split('-').map(Number); return MESES[p[1] - 1] + ' ' + p[0]; }
function $(sel, raiz) { return (raiz || document).querySelector(sel); }
function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dinero(n, moneda) {
  const v = Number(n) || 0;
  const simbolo = moneda === 'USD' ? '$ ' : 'S/ ';
  return (v < 0 ? '−' : '') + simbolo + Math.abs(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function api(nombre, ...args) {
  return new Promise((ok, falla) => {
    google.script.run
      .withSuccessHandler(ok)
      .withFailureHandler(e => falla(new Error(e && e.message ? e.message : String(e))))[nombre](...args);
  });
}
function aviso(texto, malo) {
  const a = $('#aviso');
  a.textContent = texto;
  a.className = malo ? 'mal' : '';
  a.hidden = false;
  clearTimeout(aviso.temporizador);
  aviso.temporizador = setTimeout(() => { a.hidden = true; }, 3500);
}
function leerLocal(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function guardarLocal(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento: no pasa nada */ } }
function selectorMes() {
  return '<div class="mes"><button data-mes="-1" aria-label="Mes anterior">‹</button><span>' + nombreMes(estado.mes) +
    '</span><button data-mes="1" aria-label="Mes siguiente">›</button></div>';
}
function enlazarMes(cont) {
  cont.querySelectorAll('[data-mes]').forEach(b => {
    b.onclick = () => { estado.mes = sumarMes(estado.mes, Number(b.dataset.mes)); mostrar(estado.vista); };
  });
}
function categoria(id) {
  return estado.catalogos.categorias.find(c => c.id === id) || { id: id, nombre: 'Sin categoría', emoji: '❓', color: '#3a3a48' };
}
function cuenta(id) { return estado.catalogos.cuentas.find(c => c.id === id) || { id: id, nombre: '—', moneda: 'PEN' }; }
function campo(etiqueta, control) { return '<div class="campo"><label>' + esc(etiqueta) + '</label>' + control + '</div>'; }
function seleccion(id, valores, actual, etiquetas) {
  return '<select class="entrada" id="' + id + '">' + valores.map((v, i) =>
    '<option value="' + esc(v) + '"' + (v === actual ? ' selected' : '') + '>' + esc(etiquetas ? etiquetas[i] : v) + '</option>').join('') + '</select>';
}
async function cargarCatalogos() {
  estado.catalogos = await api('obtenerCatalogos');
  return estado.catalogos;
}
async function mostrar(vista) {
  estado.vista = vista;
  document.querySelectorAll('[data-vista]').forEach(b => b.classList.toggle('activo', b.dataset.vista === vista));
  const cont = $('#vista');
  if (!VISTAS[vista]) { cont.innerHTML = '<div class="vacio">Vista no disponible.</div>'; return; }
  cont.innerHTML = '<div class="cargando">Cargando…</div>';
  try {
    await VISTAS[vista](cont);
  } catch (e) {
    cont.innerHTML = '<div class="error">' + esc(e.message) + '</div>';
  }
}
function abrirModal(html) {
  const m = $('#modal');
  m.innerHTML = '<div class="modal-fondo"></div><div class="modal-caja" role="dialog" aria-modal="true">' + html + '</div>';
  m.hidden = false;
  m.querySelector('.modal-fondo').onclick = cerrarModal;
  return m.querySelector('.modal-caja');
}
function cerrarModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }

async function iniciar() {
  document.querySelectorAll('[data-vista]').forEach(b => { b.onclick = () => mostrar(b.dataset.vista); });
  $('#fab').onclick = () => abrirFormMovimiento();
  try {
    const est = await api('estadoInstalacion');
    $('#banner-demo').hidden = !est.modoDemo;
    document.body.classList.toggle('sin-instalar', !est.instalado);
    $('#fab').hidden = !est.instalado;
    if (!est.instalado) return mostrar('asistente');
    await cargarCatalogos();
    return mostrar('inicio');
  } catch (e) {
    $('#vista').innerHTML = '<div class="error">' + esc(e.message) + '</div>';
  }
}
document.addEventListener('DOMContentLoaded', iniciar);
</script>
```

- [ ] **Paso 5: Crear `tests/ui/stub.js`** (datos ficticios para revisar la interfaz sin servidor)

```js
// google.script.run simulado para revisar la interfaz en Chrome. Datos ficticios.
(function () {
  const CATEGORIAS = [
    ['c1', 'Supermercado', '🛒', '#3ddc97', 'gasto'], ['c2', 'Comida fuera', '🍽️', '#ffb347', 'gasto'],
    ['c3', 'Transporte', '🚕', '#7c5cff', 'gasto'], ['c4', 'Suscripciones', '📺', '#4cc9f0', 'gasto'],
    ['c5', 'Bodega', '🏪', '#ff6b6b', 'gasto'], ['c6', 'Sueldo', '💼', '#3ddc97', 'ingreso'],
  ].map(c => ({ id: c[0], nombre: c[1], emoji: c[2], color: c[3], tipo: c[4], padre_id: '', activa: true }));
  const CUENTAS = [
    { id: 'a1', nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', moneda: 'PEN', saldo_inicial: 2000, ultimos4: '1111', activa: true },
    { id: 'a2', nombre: 'VISA BCP', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -300, ultimos4: '2222', activa: true },
    { id: 'a3', nombre: 'Efectivo', banco: 'Efectivo', tipo: 'efectivo', moneda: 'PEN', saldo_inicial: 100, ultimos4: '', activa: true },
  ];
  const SALDOS = [
    { id: 'a1', nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', saldo_pen: 2140.5 },
    { id: 'a2', nombre: 'VISA BCP', banco: 'BCP', tipo: 'credito', saldo_pen: -1326.2 },
    { id: 'a3', nombre: 'Efectivo', banco: 'Efectivo', tipo: 'efectivo', saldo_pen: 64 },
  ];
  const mov = (id, fecha, tipo, monto, cuenta_id, categoria_id, comercio, extra) => Object.assign({
    id, fecha, tipo, monto, moneda: 'PEN', tc: 1, monto_pen: monto, cuenta_id, cuenta_destino_id: '', categoria_id, comercio,
    descripcion: '', origen: 'manual', estado: 'confirmado', ref_externa: '', dividido: false, creado_en: fecha + ' 12:00:00',
  }, extra || {});
  const MOVS = [
    mov('m1', '2026-10-12', 'gasto', 89.3, 'a1', 'c1', 'Tottus'),
    mov('m2', '2026-10-12', 'gasto', 12, 'a1', 'c3', 'Taxi', { descripcion: 'Yape' }),
    mov('m3', '2026-10-11', 'gasto', 38.5, 'a2', 'c2', 'Pardos Chicken'),
    mov('m4', '2026-10-09', 'gasto', 9.99, 'a2', 'c4', 'Netflix', { moneda: 'USD', tc: 3.75, monto_pen: 37.46 }),
    mov('m5', '2026-10-05', 'transferencia', 600, 'a1', '', '', { cuenta_destino_id: 'a2', descripcion: 'Pago tarjeta' }),
    mov('m6', '2026-10-01', 'ingreso', 3500, 'a1', 'c6', 'Empresa Demo SAC'),
  ];
  const DATOS = {
    estadoInstalacion: { instalado: true, modoDemo: false },
    datosAsistente: {
      bancos: ['BCP', 'Interbank', 'BBVA', 'Scotiabank', 'Banco de la Nación', 'Yape', 'Plin', 'Efectivo', 'Otro'],
      tiposCuenta: ['debito', 'credito', 'ahorro', 'billetera', 'efectivo'], monedas: ['PEN', 'USD'],
      categorias: CATEGORIAS.map(c => ({ nombre: c.nombre, emoji: c.emoji, tipo: c.tipo })),
    },
    obtenerCatalogos: {
      cuentas: CUENTAS, categorias: CATEGORIAS, saldos: SALDOS,
      config: { nombre: 'Ana', ultimo_tc: 3.75, moneda_principal: 'PEN' },
      opciones: { bancos: ['BCP', 'Interbank', 'Otro'], tiposCuenta: ['debito', 'credito', 'ahorro', 'billetera', 'efectivo'], monedas: ['PEN', 'USD'] },
      modoDemo: false, urlHoja: 'https://docs.google.com/spreadsheets/d/demo',
    },
    obtenerDashboard: {
      mes: '2026-10',
      resumen: { ingresos: 3500, gastos: 1842.3, ahorro: 1657.7, tasaAhorro: 47 },
      resumenAnterior: { ingresos: 3500, gastos: 2275, ahorro: 1225, tasaAhorro: 35 },
      categorias: [
        { categoria_id: 'c1', nombre: 'Supermercado', emoji: '🛒', color: '#3ddc97', monto: 512, porcentaje: 28 },
        { categoria_id: 'c2', nombre: 'Comida fuera', emoji: '🍽️', color: '#ffb347', monto: 384, porcentaje: 21 },
        { categoria_id: 'c4', nombre: 'Suscripciones', emoji: '📺', color: '#4cc9f0', monto: 310, porcentaje: 17 },
        { categoria_id: 'c3', nombre: 'Transporte', emoji: '🚕', color: '#7c5cff', monto: 196, porcentaje: 11 },
        { categoria_id: 'c5', nombre: 'Bodega', emoji: '🏪', color: '#ff6b6b', monto: 150, porcentaje: 8 },
        { categoria_id: '_resto', nombre: 'Resto', emoji: '•', color: '#3a3a48', monto: 290.3, porcentaje: 15 },
      ],
      tendencia: [
        { mes: '2026-05', ingresos: 3500, gastos: 2500 }, { mes: '2026-06', ingresos: 3300, gastos: 3000 },
        { mes: '2026-07', ingresos: 3600, gastos: 2250 }, { mes: '2026-08', ingresos: 3500, gastos: 2750 },
        { mes: '2026-09', ingresos: 3700, gastos: 2400 }, { mes: '2026-10', ingresos: 3500, gastos: 1842.3 },
      ],
      saldos: SALDOS,
      comercios: [
        { comercio: 'Tottus', monto: 318, veces: 5 }, { comercio: 'Pardos Chicken', monto: 159, veces: 3 },
        { comercio: 'Taxi', monto: 142, veces: 14 },
      ],
    },
    listarMovimientos: MOVS,
    guardarMovimiento: d => Object.assign({ id: 'nuevo' }, d),
    eliminarMovimiento: { ok: true },
    guardarCuenta: d => Object.assign({ id: 'nueva' }, d),
    guardarCategoria: d => Object.assign({ id: 'nueva' }, d),
    guardarAjustes: { nombre: 'Ana', ultimo_tc: 3.75, moneda_principal: 'PEN' },
    completarAsistente: { instalado: true, modoDemo: false },
    cargarDemo: { instalado: true, modoDemo: true },
    salirDemo: { instalado: true, modoDemo: false },
  };
  window.__llamadas = [];
  function corredor(ok, falla) {
    return new Proxy({}, {
      get(_, nombre) {
        if (nombre === 'withSuccessHandler') return f => corredor(f, falla);
        if (nombre === 'withFailureHandler') return f => corredor(ok, f);
        return (...args) => {
          window.__llamadas.push({ nombre, args });
          setTimeout(() => {
            const r = DATOS[nombre];
            if (r === undefined) { if (falla) falla(new Error('stub sin ' + nombre)); return; }
            const valor = typeof r === 'function' ? r(...args) : r;
            if (ok) ok(JSON.parse(JSON.stringify(valor)));
          }, 0);
        };
      },
    });
  }
  window.google = { script: { run: corredor(null, null) } };
})();
```

- [ ] **Paso 6: Crear `tests/ui/ver.js`**

```js
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
```

- [ ] **Paso 7: Crear `DESIGN.md`**

````markdown
# Sistema visual — Estilo B · Fintech oscuro

Fondo casi negro, tarjetas apenas más claras, un acento violeta para acciones y un verde para lo positivo. Los números mandan: tipografía del sistema con cifras tabulares.

## Tokens

| Token | Valor | Uso |
|---|---|---|
| `--fondo` | `#0b0b10` | Fondo de la app, campos de formulario |
| `--superficie` | `#17171f` | Tarjetas, ítems de lista, modal |
| `--superficie-2` | `#1f1f29` | Botón secundario, pestaña activa, hover |
| `--borde` | `#23232e` | Bordes y fondo de barras vacías |
| `--texto` | `#f2f2f7` | Texto principal |
| `--texto-2` | `#8b8b99` | Etiquetas, texto secundario |
| `--primario` | `#7c5cff` | Acento: botón +, foco, gastos en gráficos |
| `--positivo` | `#3ddc97` | Ingresos, ahorro, botón Guardar |
| `--alerta` | `#ffb347` | Cerca del límite, banner demo |
| `--negativo` | `#ff6b6b` | Excedido, deudas, errores |
| `--info` | `#4cc9f0` | Serie adicional en gráficos |

Radios: tarjetas 16px, controles 10px, chips 99px. Paleta de categorías: `#3ddc97 #ffb347 #7c5cff #4cc9f0 #ff6b6b #f72585 #b5e48c #ffd166`.

## Reglas

- Montos con `font-variant-numeric: tabular-nums` (clase `.num`); deudas y negativos en `--negativo` con signo `−`.
- Filas compactas `nombre · barra · monto · %` (`.fila-barra`): el monto siempre junto a su etiqueta, nunca separado por espacio vacío.
- Laptop: barra superior. Celular (≤ 720px): barra inferior fija y botón + flotante encima.
- Modales: centrados en laptop; hoja inferior en celular.
- Sin `alert`/`confirm`: las acciones destructivas piden un segundo toque.
````

- [ ] **Paso 8: Revisar la base en Chrome**

Run: `node tests/ui/ver.js "" vista`
Expected: JSON con `"error": null`, `"texto": "Vista no disponible."` (la vista Inicio llega en la Tarea 8) y `llamadas` que incluye `estadoInstalacion` y `obtenerCatalogos`.

Run: `npm test && npm run lint`
Expected: todo PASS (el lint no revisa `.html`).

- [ ] **Paso 9: Commit**

```bash
git add src/web/servidor.js src/web/Index.html src/web/estilos.html src/web/cliente.html DESIGN.md tests/ui
git commit -m "feat: base de la interfaz en estilo B y herramienta de revisión en Chrome

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Vista Inicio (dashboard: bloques 1, 2, 3, 6, 7)

**Archivos:**
- Crear: `src/web/vista-inicio.html`
- Modificar: `src/web/Index.html` (agregar `<?!= incluir_('web/vista-inicio'); ?>` justo después de la línea de `web/cliente`)

**Interfaces:**
- Consume: `obtenerDashboard(mes)` (Tarea 5) y utilidades de `cliente.html` (Tarea 7).
- Produce: `VISTAS.inicio`. Clic en una fila de categoría → `estado.filtro = {categoria_id}` y `mostrar('movimientos')`.

- [ ] **Paso 1: Crear `src/web/vista-inicio.html`**

```html
<script>
'use strict';
VISTAS.inicio = async function (cont) {
  const d = await api('obtenerDashboard', estado.mes);
  const r = d.resumen;
  const ant = d.resumenAnterior;
  const nota = r.tasaAhorro == null || ant.tasaAhorro == null ? '' : 'vs ' + ant.tasaAhorro + '% el mes anterior';
  cont.innerHTML =
    '<div class="cabecera"><h1>Hola, ' + esc(estado.catalogos.config.nombre) + '</h1>' + selectorMes() + '</div>' +
    '<div class="grid">' +
      kpi('Ingresos', dinero(r.ingresos), 'pos') +
      kpi('Gastos', dinero(r.gastos), '') +
      kpi('Ahorro del mes', dinero(r.ahorro), r.ahorro < 0 ? 'neg' : 'pos') +
      kpi('Tasa de ahorro', r.tasaAhorro == null ? '—' : r.tasaAhorro + '%', '', nota) +
      bloqueCategorias(d.categorias) +
      bloqueTendencia(d.tendencia) +
      bloqueSaldos(d.saldos) +
      bloqueComercios(d.comercios) +
    '</div>';
  enlazarMes(cont);
  cont.querySelectorAll('[data-categoria]').forEach(f => {
    f.onclick = () => { estado.filtro = { categoria_id: f.dataset.categoria }; mostrar('movimientos'); };
  });
};

function kpi(titulo, valor, clase, nota) {
  return '<section class="tarjeta"><div class="etiqueta">' + esc(titulo) + '</div><div class="kpi num ' + clase + '">' + valor + '</div>' +
    (nota ? '<div class="etiqueta" style="margin:4px 0 0">' + esc(nota) + '</div>' : '') + '</section>';
}

// Dona con circunferencia 100 (r = 15.9155): cada arco mide su porcentaje.
function dona(items) {
  let acumulado = 0;
  const arcos = items.map(it => {
    const arco = '<circle cx="21" cy="21" r="15.9155" fill="none" stroke="' + esc(it.color) + '" stroke-width="6" stroke-dasharray="' +
      it.porcentaje + ' ' + (100 - it.porcentaje) + '" stroke-dashoffset="' + (25 - acumulado) + '"/>';
    acumulado += it.porcentaje;
    return arco;
  }).join('');
  return '<svg class="dona" viewBox="0 0 42 42" role="img" aria-label="Gasto por categoría">' +
    '<circle cx="21" cy="21" r="15.9155" fill="none" style="stroke:var(--borde)" stroke-width="6"/>' + arcos + '</svg>';
}

function bloqueCategorias(items) {
  const titulo = '<div class="etiqueta">Gasto por categoría</div>';
  if (!items.length) return '<section class="tarjeta ancho-2">' + titulo + '<div class="vacio">Sin gastos este mes.</div></section>';
  const max = Math.max(...items.map(c => c.monto));
  const filas = items.map(c => {
    const clic = c.categoria_id !== '_resto' ? ' clic" data-categoria="' + esc(c.categoria_id) + '"' : '"';
    return '<div class="fila-barra' + clic + '><span>' + esc(c.emoji) + ' ' + esc(c.nombre) + '</span>' +
      '<span class="mini"><i style="width:' + (c.monto / max * 100) + '%;background:' + esc(c.color) + '"></i></span>' +
      '<span class="der num">' + dinero(c.monto) + '</span><span class="der tenue num">' + c.porcentaje + '%</span></div>';
  }).join('');
  return '<section class="tarjeta ancho-2">' + titulo + '<div class="dona-fila">' + dona(items) + '<div class="filas">' + filas + '</div></div></section>';
}

function bloqueTendencia(meses) {
  const max = Math.max(1, ...meses.map(m => Math.max(m.ingresos, m.gastos)));
  const ancho = 300;
  const alto = 120;
  const paso = ancho / meses.length;
  const barras = meses.map((m, i) => {
    const x = i * paso + paso / 2;
    const hi = m.ingresos / max * (alto - 10);
    const hg = Math.max(0, m.gastos) / max * (alto - 10);
    const etiqueta = MESES[Number(m.mes.slice(5)) - 1].slice(0, 3).toLowerCase();
    return '<rect x="' + (x - 15) + '" y="' + (alto - hi) + '" width="14" height="' + hi + '" rx="3" style="fill:var(--positivo)"><title>Ingresos ' + dinero(m.ingresos) + '</title></rect>' +
      '<rect x="' + (x + 1) + '" y="' + (alto - hg) + '" width="14" height="' + hg + '" rx="3" style="fill:var(--primario)"><title>Gastos ' + dinero(m.gastos) + '</title></rect>' +
      '<text x="' + x + '" y="' + (alto + 16) + '" text-anchor="middle" font-size="11" style="fill:var(--texto-2)">' + etiqueta + '</text>';
  }).join('');
  return '<section class="tarjeta ancho-2"><div class="etiqueta">Últimos 6 meses · <span class="pos">■</span> ingresos <span style="color:var(--primario)">■</span> gastos</div>' +
    '<svg viewBox="0 0 ' + ancho + ' ' + (alto + 22) + '" width="100%" role="img" aria-label="Ingresos y gastos de los últimos 6 meses">' + barras + '</svg></section>';
}

function bloqueSaldos(saldos) {
  const filas = saldos.length ? saldos.map(s =>
    '<div class="fila-simple"><span>' + esc(s.nombre) + ' <span class="tenue">· ' + esc(s.banco) + '</span></span>' +
    '<span class="num ' + (s.saldo_pen < 0 ? 'neg' : '') + '">' + dinero(s.saldo_pen) + '</span></div>').join('') : '<div class="vacio">Sin cuentas activas.</div>';
  return '<section class="tarjeta ancho-2"><div class="etiqueta">Saldos actuales</div>' + filas + '</section>';
}

function bloqueComercios(lista) {
  const titulo = '<div class="etiqueta">Comercios donde más gastas</div>';
  if (!lista.length) return '<section class="tarjeta ancho-2">' + titulo + '<div class="vacio">Sin comercios este mes.</div></section>';
  const max = Math.max(...lista.map(c => c.monto));
  const filas = lista.map(c =>
    '<div class="fila-barra"><span>' + esc(c.comercio) + '</span><span class="mini"><i style="width:' + (c.monto / max * 100) + '%;background:var(--positivo)"></i></span>' +
    '<span class="der num">' + dinero(c.monto) + '</span><span class="der tenue num">' + c.veces + '×</span></div>').join('');
  return '<section class="tarjeta ancho-2">' + titulo +
    '<div class="fila-barra cabeza"><span>Comercio</span><span></span><span class="der">Monto</span><span class="der">Veces</span></div>' + filas + '</section>';
}
</script>
```

- [ ] **Paso 2: Incluir la vista en `src/web/Index.html`**

Después de `<?!= incluir_('web/cliente'); ?>` agregar:

```html
  <?!= incluir_('web/vista-inicio'); ?>
```

- [ ] **Paso 3: Revisar en Chrome (celular y laptop)**

Run: `node tests/ui/ver.js "" vista inicio-movil.png 420`
Expected: `"error": null`; `texto` contiene `Hola, Ana`, `Octubre 2026` (o el mes actual), `Ingresos`, `Supermercado`, `S/ 512.00`, `Saldos actuales`, `−S/ 1,326.20`, `Tottus`, `14×`.

Run: `node tests/ui/ver.js "" vista inicio-laptop.png 1280`
Expected: `"error": null`. Abrir ambas capturas con la herramienta Read y confirmar: 4 indicadores arriba (2×2 en celular), dona con filas compactas al lado (debajo en celular), barras de 6 meses, montos junto a sus nombres sin espacios vacíos grandes.

- [ ] **Paso 4: Revisar el clic en una categoría**

Run: `node tests/ui/ver.js "setTimeout(function(){document.querySelector('[data-categoria]').click()},300)" vista`
Expected: `"error": null` y `"texto": "Vista no disponible."` (Movimientos llega en la Tarea 9) — confirma que el clic navega.

- [ ] **Paso 5: Commit**

```bash
git add src/web/vista-inicio.html src/web/Index.html
git commit -m "feat: dashboard con indicadores, categorías, tendencia, saldos y comercios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Vista Movimientos y formulario rápido

**Archivos:**
- Crear: `src/web/vista-movimientos.html`
- Modificar: `src/web/Index.html` (agregar `<?!= incluir_('web/vista-movimientos'); ?>` después de `web/vista-inicio`)

**Interfaces:**
- Consume: `listarMovimientos`, `guardarMovimiento`, `eliminarMovimiento` (Tarea 4); utilidades de `cliente.html`.
- Produce: `VISTAS.movimientos`; `abrirFormMovimiento(mov?)` (lo usa el botón + de `cliente.html`). Recuerda la última cuenta usada en `localStorage` (`ultimaCuenta`).

- [ ] **Paso 1: Crear `src/web/vista-movimientos.html`**

```html
<script>
'use strict';
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

VISTAS.movimientos = async function (cont) {
  const f = estado.filtro;
  const movs = await api('listarMovimientos', { mes: estado.mes, cuenta_id: f.cuenta_id || '', categoria_id: f.categoria_id || '' });
  const cat = estado.catalogos;
  const opcionesCat = '<option value="">Todas las categorías</option>' + cat.categorias.map(c =>
    '<option value="' + esc(c.id) + '"' + (c.id === f.categoria_id ? ' selected' : '') + '>' + esc(c.emoji + ' ' + c.nombre) + '</option>').join('');
  const opcionesCta = '<option value="">Todas las cuentas</option>' + cat.cuentas.map(c =>
    '<option value="' + esc(c.id) + '"' + (c.id === f.cuenta_id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('');
  cont.innerHTML = '<div class="cabecera"><h1>Movimientos</h1>' + selectorMes() + '</div>' +
    '<div class="filtros"><select class="entrada" id="f-cat">' + opcionesCat + '</select>' +
    '<select class="entrada" id="f-cta">' + opcionesCta + '</select>' +
    '<input class="entrada" id="f-txt" placeholder="Buscar comercio o nota" value="' + esc(f.texto || '') + '"></div>' +
    '<div id="lista" class="lista"></div>';
  enlazarMes(cont);
  $('#f-cat').onchange = e => { estado.filtro.categoria_id = e.target.value; mostrar('movimientos'); };
  $('#f-cta').onchange = e => { estado.filtro.cuenta_id = e.target.value; mostrar('movimientos'); };
  $('#f-txt').oninput = e => { estado.filtro.texto = e.target.value; pintarLista(movs); };
  pintarLista(movs);
};

function normalizar(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

function fechaLarga(iso) {
  const p = iso.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  return DIAS[d.getDay()] + ' ' + p[2] + ' ' + MESES[p[1] - 1].slice(0, 3).toLowerCase();
}

function pintarLista(movs) {
  const texto = normalizar(estado.filtro.texto);
  const visibles = movs.filter(m => !texto || normalizar(m.comercio + ' ' + m.descripcion).indexOf(texto) >= 0);
  const lista = $('#lista');
  if (!visibles.length) { lista.innerHTML = '<div class="vacio">No hay movimientos.</div>'; return; }
  let html = '';
  let dia = '';
  visibles.forEach(m => {
    if (m.fecha !== dia) {
      dia = m.fecha;
      const gastoDia = visibles.filter(x => x.fecha === dia && x.tipo === 'gasto').reduce((s, x) => s + x.monto_pen, 0);
      html += '<div class="dia"><span>' + fechaLarga(dia) + '</span><span class="num">' + (gastoDia ? dinero(gastoDia) : '') + '</span></div>';
    }
    html += itemMovimiento(m);
  });
  lista.innerHTML = html;
  lista.querySelectorAll('[data-id]').forEach(el => {
    el.onclick = () => abrirFormMovimiento(visibles.find(m => m.id === el.dataset.id));
  });
}

function itemMovimiento(m) {
  let icono;
  let titulo;
  let sub;
  let clase = '';
  if (m.tipo === 'transferencia') {
    icono = '🔁';
    titulo = m.descripcion || 'Transferencia';
    sub = cuenta(m.cuenta_id).nombre + ' → ' + cuenta(m.cuenta_destino_id).nombre;
    clase = 'tenue';
  } else {
    const c = categoria(m.categoria_id);
    icono = c.emoji;
    titulo = m.comercio || m.descripcion || c.nombre;
    sub = c.nombre + ' · ' + cuenta(m.cuenta_id).nombre + (m.moneda !== 'PEN' ? ' · ≈ ' + dinero(m.monto_pen) : '');
    clase = m.tipo === 'ingreso' ? 'pos' : '';
  }
  const monto = (m.tipo === 'ingreso' ? '+' : '') + dinero(m.monto, m.moneda);
  return '<div class="item" data-id="' + esc(m.id) + '"><div class="icono">' + esc(icono) + '</div>' +
    '<div class="cuerpo"><div class="titulo">' + esc(titulo) + '</div><div class="sub">' + esc(sub) + '</div></div>' +
    '<div class="num ' + clase + '">' + monto + '</div></div>';
}

function cuentaPorDefecto() {
  const activas = estado.catalogos.cuentas.filter(c => c.activa);
  const ultima = leerLocal('ultimaCuenta');
  return (activas.find(c => c.id === ultima) || activas[0] || { id: '' }).id;
}

function abrirFormMovimiento(mov) {
  const f = mov ? Object.assign({}, mov) : {
    tipo: 'gasto', fecha: hoyIso(), monto: '', moneda: '', cuenta_id: cuentaPorDefecto(),
    cuenta_destino_id: '', categoria_id: '', comercio: '', descripcion: '',
  };
  const caja = abrirModal('<h2 class="titulo-modal">' + (mov ? 'Editar movimiento' : 'Nuevo movimiento') + '</h2><div id="form-mov"></div>');

  function leerForm() {
    const valor = id => { const el = $('#' + id, caja); return el ? el.value : undefined; };
    ['monto', 'moneda', 'fecha', 'comercio', 'descripcion', 'cuenta_id', 'cuenta_destino_id'].forEach(k => {
      const v = valor('mv-' + k);
      if (v !== undefined) f[k] = v;
    });
  }

  function pintar() {
    const cat = estado.catalogos;
    const activas = cat.cuentas.filter(c => c.activa || c.id === f.cuenta_id || c.id === f.cuenta_destino_id);
    const idsCuentas = activas.map(c => c.id);
    const nombresCuentas = activas.map(c => c.nombre);
    const moneda = f.moneda || cuenta(f.cuenta_id).moneda || 'PEN';
    const tipos = [['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['transferencia', 'Transferencia']];
    let html = '<div class="segmento">' + tipos.map(t =>
      '<button type="button" data-tipo="' + t[0] + '" class="' + (f.tipo === t[0] ? 'activo' : '') + '">' + t[1] + '</button>').join('') + '</div>';
    html += '<div class="dos-col" style="grid-template-columns:1fr 92px">' +
      campo('Monto', '<input class="entrada monto-grande num" id="mv-monto" inputmode="decimal" placeholder="0.00" value="' + esc(f.monto) + '">') +
      campo('Moneda', seleccion('mv-moneda', ['PEN', 'USD'], moneda)) + '</div>';
    if (f.tipo === 'transferencia') {
      html += '<div class="dos-col">' + campo('Desde', seleccion('mv-cuenta_id', idsCuentas, f.cuenta_id, nombresCuentas)) +
        campo('Hacia', seleccion('mv-cuenta_destino_id', [''].concat(idsCuentas), f.cuenta_destino_id, ['Elige…'].concat(nombresCuentas))) + '</div>';
    } else {
      const cats = cat.categorias.filter(c => c.tipo === f.tipo && (c.activa || c.id === f.categoria_id));
      html += campo('Categoría', '<div class="chips">' + cats.map(c =>
        '<button type="button" class="chip' + (c.id === f.categoria_id ? ' activo' : '') + '" data-cat="' + esc(c.id) + '">' + esc(c.emoji + ' ' + c.nombre) + '</button>').join('') + '</div>');
      html += campo('Cuenta', seleccion('mv-cuenta_id', idsCuentas, f.cuenta_id, nombresCuentas));
    }
    html += '<div class="dos-col">' + campo('Fecha', '<input class="entrada" type="date" id="mv-fecha" value="' + esc(f.fecha) + '">') +
      campo(f.tipo === 'ingreso' ? 'De quién' : 'Comercio', '<input class="entrada" id="mv-comercio" value="' + esc(f.comercio) + '">') + '</div>';
    html += campo('Nota', '<input class="entrada" id="mv-descripcion" value="' + esc(f.descripcion) + '">');
    html += '<div class="acciones">' + (mov ? '<button type="button" class="boton peligro" id="mv-eliminar">Eliminar</button>' : '') +
      '<button type="button" class="boton" id="mv-cancelar">Cancelar</button><button type="button" class="boton primario" id="mv-guardar">Guardar</button></div>';
    $('#form-mov', caja).innerHTML = html;

    caja.querySelectorAll('[data-tipo]').forEach(b => {
      b.onclick = () => { leerForm(); f.tipo = b.dataset.tipo; f.categoria_id = ''; pintar(); };
    });
    caja.querySelectorAll('[data-cat]').forEach(b => {
      b.onclick = () => {
        f.categoria_id = b.dataset.cat;
        caja.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('activo', x === b));
      };
    });
    $('#mv-cancelar', caja).onclick = cerrarModal;
    $('#mv-guardar', caja).onclick = e => guardar(e.target);
    const eliminar = $('#mv-eliminar', caja);
    if (eliminar) eliminar.onclick = () => borrar(eliminar);
    if (!mov) $('#mv-monto', caja).focus();
  }

  async function guardar(boton) {
    leerForm();
    boton.disabled = true;
    try {
      await api('guardarMovimiento', {
        id: mov ? mov.id : '', tipo: f.tipo, fecha: f.fecha, monto: f.monto,
        moneda: f.moneda || cuenta(f.cuenta_id).moneda || 'PEN', cuenta_id: f.cuenta_id,
        cuenta_destino_id: f.tipo === 'transferencia' ? f.cuenta_destino_id : '',
        categoria_id: f.tipo === 'transferencia' ? '' : f.categoria_id,
        comercio: f.comercio, descripcion: f.descripcion,
      });
      guardarLocal('ultimaCuenta', f.cuenta_id);
      cerrarModal();
      aviso(mov ? 'Movimiento actualizado' : 'Movimiento guardado');
      mostrar(estado.vista);
    } catch (e) {
      aviso(e.message, true);
      boton.disabled = false;
    }
  }

  async function borrar(boton) {
    if (!boton.dataset.seguro) { boton.dataset.seguro = '1'; boton.textContent = '¿Seguro? Toca otra vez'; return; }
    boton.disabled = true;
    try {
      await api('eliminarMovimiento', mov.id);
      cerrarModal();
      aviso('Movimiento eliminado');
      mostrar(estado.vista);
    } catch (e) {
      aviso(e.message, true);
      boton.disabled = false;
    }
  }

  pintar();
}
</script>
```

- [ ] **Paso 2: Incluir la vista en `src/web/Index.html`**

Después de `<?!= incluir_('web/vista-inicio'); ?>` agregar:

```html
  <?!= incluir_('web/vista-movimientos'); ?>
```

- [ ] **Paso 3: Revisar la lista en Chrome**

Run: `node tests/ui/ver.js "mostrar('movimientos')" vista movimientos-movil.png 420`
Expected: `"error": null`; `texto` contiene `Movimientos`, `Tottus`, `Supermercado · Débito BCP`, `$ 9.99`, `≈ S/ 37.46`, `Débito BCP → VISA BCP`, `+S/ 3,500.00`. Abrir la captura con Read y confirmar agrupación por día con total del día a la derecha.

- [ ] **Paso 4: Revisar el formulario rápido y el guardado**

Run: `node tests/ui/ver.js "abrirFormMovimiento(); setTimeout(function(){document.getElementById('mv-monto').value='25'; document.querySelector('[data-cat]').click(); document.getElementById('mv-guardar').click();},300)" vista form-movil.png 420`
Expected: `"error": null`; `llamadas` contiene `guardarMovimiento` seguido de `listarMovimientos` o `obtenerDashboard` (recarga de la vista actual).

Run: `node tests/ui/ver.js "abrirFormMovimiento(); setTimeout(function(){document.querySelector('[data-tipo=transferencia]').click();},300)" modal`
Expected: `"error": null`; `texto` contiene `Desde`, `Hacia` y no contiene `Categoría`.

- [ ] **Paso 5: Revisar el filtro que llega desde el dashboard**

Run: `node tests/ui/ver.js "setTimeout(function(){document.querySelector('[data-categoria]').click()},300)" vista`
Expected: `"error": null`; `texto` contiene `Movimientos`; `llamadas` contiene `listarMovimientos`.

- [ ] **Paso 6: Commit**

```bash
git add src/web/vista-movimientos.html src/web/Index.html
git commit -m "feat: vista de movimientos con filtros y formulario rápido

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Vistas Cuentas y Ajustes

**Archivos:**
- Crear: `src/web/vista-cuentas.html`, `src/web/vista-ajustes.html`
- Modificar: `src/web/Index.html` (agregar `web/vista-cuentas` y `web/vista-ajustes` después de `web/vista-movimientos`)

**Interfaces:**
- Consume: `obtenerCatalogos`, `guardarCuenta`, `guardarCategoria`, `guardarAjustes` (Tareas 3 y 5), `cargarDemo`, `salirDemo` (Tarea 6), `iniciar` (Tarea 7).
- Produce: `VISTAS.cuentas`, `VISTAS.ajustes`, `abrirFormCuenta(cuenta?)`, `abrirFormCategoria(categoria?, tipo)`.

- [ ] **Paso 1: Crear `src/web/vista-cuentas.html`**

```html
<script>
'use strict';
const ICONOS_CUENTA = { debito: '💳', credito: '💳', ahorro: '🏦', billetera: '📱', efectivo: '💵' };

VISTAS.cuentas = async function (cont) {
  const cat = await cargarCatalogos();
  const saldo = id => (cat.saldos.find(s => s.id === id) || { saldo_pen: 0 }).saldo_pen;
  const items = cat.cuentas.map(c =>
    '<div class="item" data-id="' + esc(c.id) + '"><div class="icono">' + (ICONOS_CUENTA[c.tipo] || '🏦') + '</div>' +
    '<div class="cuerpo"><div class="titulo">' + esc(c.nombre) + (c.activa ? '' : ' <span class="tenue">(desactivada)</span>') + '</div>' +
    '<div class="sub">' + esc(c.banco + ' · ' + c.tipo + ' · ' + c.moneda + (c.ultimos4 ? ' · •••• ' + c.ultimos4 : '')) + '</div></div>' +
    (c.activa ? '<div class="num ' + (saldo(c.id) < 0 ? 'neg' : '') + '">' + dinero(saldo(c.id)) + '</div>' : '') + '</div>').join('');
  cont.innerHTML = '<div class="cabecera"><h1>Cuentas</h1><button class="boton" id="nueva-cuenta">+ Nueva cuenta</button></div>' +
    '<div class="lista">' + (items || '<div class="vacio">Aún no tienes cuentas.</div>') + '</div>' +
    '<p class="tenue" style="font-size:13px">Saldos en soles. Las tarjetas de crédito muestran la deuda en negativo.</p>';
  $('#nueva-cuenta').onclick = () => abrirFormCuenta();
  cont.querySelectorAll('[data-id]').forEach(el => {
    el.onclick = () => abrirFormCuenta(cat.cuentas.find(c => c.id === el.dataset.id));
  });
};

function abrirFormCuenta(c) {
  const op = estado.catalogos.opciones;
  const v = c || { nombre: '', banco: 'BCP', tipo: 'debito', moneda: 'PEN', ultimos4: '', saldo_inicial: 0, activa: true };
  const caja = abrirModal('<h2 class="titulo-modal">' + (c ? 'Editar cuenta' : 'Nueva cuenta') + '</h2>' +
    campo('Nombre', '<input class="entrada" id="c-nombre" placeholder="Ej.: Débito BCP" value="' + esc(v.nombre) + '">') +
    '<div class="dos-col">' + campo('Banco', seleccion('c-banco', op.bancos, v.banco)) + campo('Tipo', seleccion('c-tipo', op.tiposCuenta, v.tipo)) + '</div>' +
    '<div class="dos-col">' + campo('Moneda', seleccion('c-moneda', op.monedas, v.moneda)) +
    campo('Últimos 4 dígitos', '<input class="entrada num" id="c-ult" inputmode="numeric" maxlength="4" value="' + esc(v.ultimos4) + '">') + '</div>' +
    campo('Saldo inicial (negativo si es deuda de tarjeta)', '<input class="entrada num" id="c-saldo" inputmode="decimal" value="' + esc(v.saldo_inicial) + '">') +
    (c ? '<label class="check"><input type="checkbox" id="c-activa"' + (v.activa ? ' checked' : '') + '> Cuenta activa</label>' : '') +
    '<div class="acciones"><button type="button" class="boton" id="c-cancelar">Cancelar</button><button type="button" class="boton primario" id="c-guardar">Guardar</button></div>');
  $('#c-cancelar', caja).onclick = cerrarModal;
  $('#c-guardar', caja).onclick = async e => {
    e.target.disabled = true;
    try {
      await api('guardarCuenta', {
        id: c ? c.id : '', nombre: $('#c-nombre', caja).value, banco: $('#c-banco', caja).value,
        tipo: $('#c-tipo', caja).value, moneda: $('#c-moneda', caja).value, ultimos4: $('#c-ult', caja).value,
        saldo_inicial: $('#c-saldo', caja).value, activa: c ? $('#c-activa', caja).checked : true,
      });
      cerrarModal();
      aviso('Cuenta guardada');
      mostrar('cuentas');
    } catch (err) {
      aviso(err.message, true);
      e.target.disabled = false;
    }
  };
}
</script>
```

- [ ] **Paso 2: Crear `src/web/vista-ajustes.html`**

```html
<script>
'use strict';
VISTAS.ajustes = async function (cont) {
  const cat = await cargarCatalogos();
  const chips = tipo => cat.categorias.filter(c => c.tipo === tipo).map(c =>
    '<button type="button" class="chip' + (c.activa ? '' : ' apagado') + '" data-cat="' + esc(c.id) + '">' + esc(c.emoji + ' ' + c.nombre) + '</button>').join('');
  cont.innerHTML = '<div class="cabecera"><h1>Ajustes</h1></div>' +
    '<section class="tarjeta seccion"><div class="etiqueta">General</div><div class="dos-col">' +
      campo('Tu nombre', '<input class="entrada" id="a-nombre" value="' + esc(cat.config.nombre) + '">') +
      campo('Tipo de cambio USD → PEN', '<input class="entrada num" id="a-tc" inputmode="decimal" value="' + esc(cat.config.ultimo_tc) + '">') +
    '</div><button type="button" class="boton primario" id="a-guardar">Guardar</button></section>' +
    '<section class="tarjeta seccion">' +
      '<div class="cabecera-seccion"><div class="etiqueta">Categorías de gasto</div><button type="button" class="boton" data-nueva="gasto">+ Nueva</button></div>' +
      '<div class="chips">' + chips('gasto') + '</div>' +
      '<div class="cabecera-seccion" style="margin-top:16px"><div class="etiqueta">Categorías de ingreso</div><button type="button" class="boton" data-nueva="ingreso">+ Nueva</button></div>' +
      '<div class="chips">' + chips('ingreso') + '</div>' +
    '</section>' +
    '<section class="tarjeta seccion"><div class="etiqueta">Datos</div>' +
      '<p class="tenue" style="margin:0">Todo vive en tu propia Google Sheet, en tu cuenta de Google.</p>' +
      '<div class="acciones"><a class="boton" href="' + esc(cat.urlHoja) + '" target="_blank" rel="noopener">Abrir Google Sheet</a>' +
      '<button type="button" class="boton" id="a-demo">' + (cat.modoDemo ? 'Salir del modo demo' : 'Ver con datos demo') + '</button></div>' +
    '</section>';
  $('#a-guardar').onclick = async e => {
    e.target.disabled = true;
    try {
      await api('guardarAjustes', { nombre: $('#a-nombre').value, ultimo_tc: $('#a-tc').value });
      aviso('Ajustes guardados');
      mostrar('ajustes');
    } catch (err) {
      aviso(err.message, true);
      e.target.disabled = false;
    }
  };
  cont.querySelectorAll('[data-cat]').forEach(b => {
    b.onclick = () => { const c = cat.categorias.find(x => x.id === b.dataset.cat); abrirFormCategoria(c, c.tipo); };
  });
  cont.querySelectorAll('[data-nueva]').forEach(b => { b.onclick = () => abrirFormCategoria(null, b.dataset.nueva); });
  $('#a-demo').onclick = async e => {
    e.target.disabled = true;
    try {
      await api(cat.modoDemo ? 'salirDemo' : 'cargarDemo');
      iniciar();
    } catch (err) {
      aviso(err.message, true);
      e.target.disabled = false;
    }
  };
};

function abrirFormCategoria(c, tipo) {
  const v = c || { nombre: '', emoji: '', color: '#7c5cff', activa: true };
  const caja = abrirModal('<h2 class="titulo-modal">' + (c ? 'Editar categoría' : 'Nueva categoría de ' + tipo) + '</h2>' +
    '<div class="dos-col" style="grid-template-columns:1fr 80px 64px">' +
      campo('Nombre', '<input class="entrada" id="k-nombre" value="' + esc(v.nombre) + '">') +
      campo('Emoji', '<input class="entrada" id="k-emoji" maxlength="4" value="' + esc(v.emoji) + '">') +
      campo('Color', '<input class="entrada" type="color" id="k-color" value="' + esc(v.color) + '" style="padding:4px;height:42px">') +
    '</div>' +
    (c ? '<label class="check"><input type="checkbox" id="k-activa"' + (v.activa ? ' checked' : '') + '> Categoría activa (desactivarla la oculta al registrar, pero conserva el historial)</label>' : '') +
    '<div class="acciones"><button type="button" class="boton" id="k-cancelar">Cancelar</button><button type="button" class="boton primario" id="k-guardar">Guardar</button></div>');
  $('#k-cancelar', caja).onclick = cerrarModal;
  $('#k-guardar', caja).onclick = async e => {
    e.target.disabled = true;
    try {
      await api('guardarCategoria', {
        id: c ? c.id : '', nombre: $('#k-nombre', caja).value, emoji: $('#k-emoji', caja).value,
        color: $('#k-color', caja).value, tipo: tipo, activa: c ? $('#k-activa', caja).checked : true,
      });
      cerrarModal();
      aviso('Categoría guardada');
      mostrar('ajustes');
    } catch (err) {
      aviso(err.message, true);
      e.target.disabled = false;
    }
  };
}
</script>
```

- [ ] **Paso 3: Incluir las vistas en `src/web/Index.html`**

Después de `<?!= incluir_('web/vista-movimientos'); ?>` agregar:

```html
  <?!= incluir_('web/vista-cuentas'); ?>
  <?!= incluir_('web/vista-ajustes'); ?>
```

- [ ] **Paso 4: Revisar en Chrome**

Run: `node tests/ui/ver.js "mostrar('cuentas')" vista cuentas-movil.png 420`
Expected: `"error": null`; `texto` contiene `Débito BCP`, `•••• 1111`, `−S/ 1,326.20`, `+ Nueva cuenta`.

Run: `node tests/ui/ver.js "mostrar('cuentas'); setTimeout(function(){document.getElementById('nueva-cuenta').click()},300)" modal`
Expected: `"error": null`; `texto` contiene `Nueva cuenta`, `Banco`, `Últimos 4 dígitos`, `Saldo inicial`.

Run: `node tests/ui/ver.js "mostrar('ajustes')" vista ajustes-movil.png 420`
Expected: `"error": null`; `texto` contiene `Tipo de cambio USD → PEN`, `Categorías de gasto`, `🛒 Supermercado`, `Ver con datos demo`.

Run: `node tests/ui/ver.js "mostrar('ajustes'); setTimeout(function(){document.getElementById('a-demo').click()},300)" vista`
Expected: `"error": null`; `llamadas` contiene `cargarDemo` seguido de `estadoInstalacion`.

- [ ] **Paso 5: Commit**

```bash
git add src/web/vista-cuentas.html src/web/vista-ajustes.html src/web/Index.html
git commit -m "feat: vistas de cuentas y ajustes con categorías y modo demo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Vista Asistente (primer uso)

**Archivos:**
- Crear: `src/web/vista-asistente.html`
- Modificar: `src/web/Index.html` (agregar `web/vista-asistente` después de `web/vista-ajustes`)

**Interfaces:**
- Consume: `datosAsistente`, `completarAsistente`, `cargarDemo` (Tareas 3 y 6), `iniciar` (Tarea 7).
- Produce: `VISTAS.asistente` (3 pasos: datos básicos → cuentas → categorías).

- [ ] **Paso 1: Crear `src/web/vista-asistente.html`**

```html
<script>
'use strict';
VISTAS.asistente = async function (cont) {
  const op = await api('datosAsistente');
  const datos = {
    nombre: '', tc_usd: '3.75', cuentas: [],
    categorias: op.categorias.map(c => Object.assign({ elegida: true }, c)),
  };
  let paso = 1;

  function barra() {
    return '<div class="pasos">' + [1, 2, 3].map(i => '<i class="' + (i <= paso ? 'hecho' : '') + '"></i>').join('') + '</div>';
  }

  function pintar() {
    if (paso === 1) pintarPaso1();
    else if (paso === 2) pintarPaso2();
    else pintarPaso3();
  }

  function pintarPaso1() {
    cont.innerHTML = '<div class="asistente">' + barra() + '<h1>Bienvenido 👋</h1>' +
      '<p class="tenue">Configuremos tu app de finanzas. Toma 2 minutos y todo queda en tu propia Google Sheet.</p>' +
      campo('¿Cómo te llamas?', '<input class="entrada" id="w-nombre" value="' + esc(datos.nombre) + '">') +
      campo('Tipo de cambio USD → PEN (para gastos en dólares)', '<input class="entrada num" id="w-tc" inputmode="decimal" value="' + esc(datos.tc_usd) + '">') +
      '<div class="acciones"><button type="button" class="boton" id="w-demo">Solo mirar (datos demo)</button>' +
      '<button type="button" class="boton primario" id="w-sig">Siguiente</button></div></div>';
    $('#w-sig').onclick = () => {
      datos.nombre = $('#w-nombre').value.trim();
      datos.tc_usd = $('#w-tc').value;
      if (!datos.nombre) { aviso('Escribe tu nombre.', true); return; }
      paso = 2;
      pintar();
    };
    $('#w-demo').onclick = async e => {
      e.target.disabled = true;
      try { await api('cargarDemo'); iniciar(); } catch (err) { aviso(err.message, true); e.target.disabled = false; }
    };
  }

  function pintarPaso2() {
    const lista = datos.cuentas.map((c, i) =>
      '<div class="item"><div class="icono">🏦</div><div class="cuerpo"><div class="titulo">' + esc(c.nombre) + '</div>' +
      '<div class="sub">' + esc(c.banco + ' · ' + c.tipo + ' · ' + c.moneda + (c.ultimos4 ? ' · •••• ' + c.ultimos4 : '')) + '</div></div>' +
      '<button type="button" class="boton" data-quitar="' + i + '" aria-label="Quitar">✕</button></div>').join('');
    cont.innerHTML = '<div class="asistente">' + barra() + '<h1>Tus cuentas</h1>' +
      '<p class="tenue">Agrega cada tarjeta, cuenta o billetera que usas. Los últimos 4 dígitos sirven para reconocer los correos del banco.</p>' +
      '<div class="lista">' + lista + '</div>' +
      '<section class="tarjeta">' +
        campo('Nombre', '<input class="entrada" id="w-c-nombre" placeholder="Ej.: Débito BCP">') +
        '<div class="dos-col">' + campo('Banco', seleccion('w-c-banco', op.bancos, 'BCP')) + campo('Tipo', seleccion('w-c-tipo', op.tiposCuenta, 'debito')) + '</div>' +
        '<div class="dos-col">' + campo('Moneda', seleccion('w-c-moneda', op.monedas, 'PEN')) +
        campo('Últimos 4 dígitos', '<input class="entrada num" id="w-c-ult" inputmode="numeric" maxlength="4">') + '</div>' +
        campo('Saldo actual (negativo si es deuda de tarjeta)', '<input class="entrada num" id="w-c-saldo" inputmode="decimal" placeholder="0.00">') +
        '<button type="button" class="boton" id="w-c-agregar">+ Agregar cuenta</button>' +
      '</section>' +
      '<div class="acciones"><button type="button" class="boton" id="w-atras">Atrás</button><button type="button" class="boton primario" id="w-sig">Siguiente</button></div></div>';
    $('#w-c-agregar').onclick = () => {
      const nueva = {
        nombre: $('#w-c-nombre').value.trim(), banco: $('#w-c-banco').value, tipo: $('#w-c-tipo').value,
        moneda: $('#w-c-moneda').value, ultimos4: $('#w-c-ult').value.trim(), saldo_inicial: $('#w-c-saldo').value,
      };
      if (!nueva.nombre) { aviso('Ponle un nombre a la cuenta.', true); return; }
      if (nueva.ultimos4 && !/^\d{4}$/.test(nueva.ultimos4)) { aviso('Los últimos 4 dígitos deben ser 4 números.', true); return; }
      datos.cuentas.push(nueva);
      pintar();
    };
    cont.querySelectorAll('[data-quitar]').forEach(b => {
      b.onclick = () => { datos.cuentas.splice(Number(b.dataset.quitar), 1); pintar(); };
    });
    $('#w-atras').onclick = () => { paso = 1; pintar(); };
    $('#w-sig').onclick = () => {
      if (!datos.cuentas.length) { aviso('Agrega al menos una cuenta.', true); return; }
      paso = 3;
      pintar();
    };
  }

  function pintarPaso3() {
    const chips = tipo => datos.categorias.map((c, i) => c.tipo !== tipo ? '' :
      '<button type="button" class="chip' + (c.elegida ? ' activo' : ' apagado') + '" data-i="' + i + '">' + esc(c.emoji + ' ' + c.nombre) + '</button>').join('');
    cont.innerHTML = '<div class="asistente">' + barra() + '<h1>Categorías</h1>' +
      '<p class="tenue">Toca para quitar las que no uses. Podrás cambiarlas luego en Ajustes.</p>' +
      '<div class="etiqueta">Gastos</div><div class="chips">' + chips('gasto') + '</div>' +
      '<div class="etiqueta" style="margin-top:14px">Ingresos</div><div class="chips">' + chips('ingreso') + '</div>' +
      '<section class="tarjeta" style="margin-top:16px"><div class="dos-col" style="grid-template-columns:1fr 70px 110px">' +
        campo('Nueva categoría', '<input class="entrada" id="w-k-nombre">') +
        campo('Emoji', '<input class="entrada" id="w-k-emoji" maxlength="4">') +
        campo('Tipo', seleccion('w-k-tipo', ['gasto', 'ingreso'], 'gasto')) +
      '</div><button type="button" class="boton" id="w-k-agregar">+ Agregar</button></section>' +
      '<div class="acciones"><button type="button" class="boton" id="w-atras">Atrás</button><button type="button" class="boton primario" id="w-fin">Terminar</button></div></div>';
    cont.querySelectorAll('[data-i]').forEach(b => {
      b.onclick = () => { const c = datos.categorias[Number(b.dataset.i)]; c.elegida = !c.elegida; pintar(); };
    });
    $('#w-k-agregar').onclick = () => {
      const nombre = $('#w-k-nombre').value.trim();
      if (!nombre) { aviso('Escribe el nombre de la categoría.', true); return; }
      datos.categorias.push({ nombre: nombre, emoji: $('#w-k-emoji').value.trim(), tipo: $('#w-k-tipo').value, elegida: true });
      pintar();
    };
    $('#w-atras').onclick = () => { paso = 2; pintar(); };
    $('#w-fin').onclick = async e => {
      e.target.disabled = true;
      try {
        await api('completarAsistente', {
          nombre: datos.nombre, tc_usd: datos.tc_usd, cuentas: datos.cuentas,
          categorias: datos.categorias.filter(c => c.elegida).map(c => ({ nombre: c.nombre, emoji: c.emoji, tipo: c.tipo })),
        });
        aviso('¡Listo! Tu app está configurada.');
        iniciar();
      } catch (err) {
        aviso(err.message, true);
        e.target.disabled = false;
      }
    };
  }

  pintar();
};
</script>
```

- [ ] **Paso 2: Incluir la vista en `src/web/Index.html`**

Después de `<?!= incluir_('web/vista-ajustes'); ?>` agregar:

```html
  <?!= incluir_('web/vista-asistente'); ?>
```

- [ ] **Paso 3: Revisar el flujo completo en Chrome**

Run: `node tests/ui/ver.js "document.body.classList.add('sin-instalar'); mostrar('asistente')" vista asistente-1.png 420`
Expected: `"error": null`; `texto` contiene `Bienvenido`, `¿Cómo te llamas?`, `Solo mirar (datos demo)`.

Run (un solo comando; recorre los 3 pasos y termina):

```bash
node tests/ui/ver.js "document.body.classList.add('sin-instalar'); mostrar('asistente'); setTimeout(function(){ document.getElementById('w-nombre').value='Ana'; document.getElementById('w-sig').click(); setTimeout(function(){ document.getElementById('w-c-nombre').value='Débito BCP'; document.getElementById('w-c-ult').value='1234'; document.getElementById('w-c-agregar').click(); document.getElementById('w-sig').click(); setTimeout(function(){ document.querySelector('[data-i]').click(); document.getElementById('w-fin').click(); }, 100); }, 100); }, 300)" vista
```

Expected: `"error": null`; `llamadas` contiene `datosAsistente`, `completarAsistente` y después `estadoInstalacion` (reinicio con la app instalada).

- [ ] **Paso 4: Commit**

```bash
git add src/web/vista-asistente.html src/web/Index.html
git commit -m "feat: asistente de primer uso en 3 pasos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Documentación, despliegue real y versión v0.1.0

**Archivos:**
- Crear: `scripts/desplegar.js`, `README.md`, `CHANGELOG.md`, `docs/instalacion.md`, `docs/arquitectura.md`, `docs/privacidad.md`, `docs/img/dashboard-laptop.png`, `docs/img/dashboard-movil.png`, `docs/img/movimientos-movil.png`

**Interfaces:**
- Consume: todo lo anterior.
- Produce: `npm run deploy` (sube y actualiza siempre el mismo despliegue; el id queda en `.despliegue`, ignorado por git).

- [ ] **Paso 1: Crear `scripts/desplegar.js`**

```js
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
```

- [ ] **Paso 2: Generar capturas con datos ficticios del stub**

```bash
mkdir -p docs/img
node tests/ui/ver.js "" vista docs/img/dashboard-laptop.png 1280
node tests/ui/ver.js "" vista docs/img/dashboard-movil.png 420
node tests/ui/ver.js "mostrar('movimientos')" vista docs/img/movimientos-movil.png 420
```

Expected: tres archivos PNG. Abrir cada uno con Read y confirmar que se ven bien y que solo contienen datos ficticios del stub.

- [ ] **Paso 3: Obtener el usuario de GitHub para los enlaces**

Run: `gh api user --jq .login`
Expected: el usuario de GitHub de Bruno. En los pasos 4 y 5, reemplazar `USUARIO_GITHUB` por ese valor exacto. Si `gh` no está autenticado, preguntarle el usuario a Bruno.

- [ ] **Paso 4: Crear `README.md`**

````markdown
# 💸 Finanzas personales

[![CI](https://github.com/USUARIO_GITHUB/finanzas-personales/actions/workflows/ci.yml/badge.svg)](https://github.com/USUARIO_GITHUB/finanzas-personales/actions/workflows/ci.yml)
![Licencia MIT](https://img.shields.io/badge/licencia-MIT-7c5cff)

> **EN —** Self-hosted personal finance app built on Google Apps Script + Google Sheets. Each person runs their own copy in their own Google account: no servers, no shared data. Roadmap: bank-notification emails parsed automatically, a Telegram bot that only asks about what it doesn't know, and Gemini for voice notes and receipts.

App de finanzas personales que vive en **tu propia cuenta de Google**. Registra gastos, ingresos y transferencias, y muestra en un dashboard en qué se va tu dinero — en el celular y en la laptop.

| Laptop | Celular |
|---|---|
| ![Dashboard en laptop](docs/img/dashboard-laptop.png) | ![Dashboard en celular](docs/img/dashboard-movil.png) |

## Qué hace hoy (v0.1)

- **Dashboard:** ingresos, gastos, ahorro y tasa de ahorro del mes; gasto por categoría; tendencia de 6 meses; saldos por cuenta; comercios donde más gastas.
- **Movimientos:** registro rápido desde el botón **+**, filtros por mes, cuenta, categoría y texto. Gastos en soles y dólares.
- **Cuentas y categorías** configurables; tarjetas de crédito con deuda en negativo.
- **Asistente de instalación** que pregunta tus bancos, cuentas y categorías.
- **Modo demo** con datos ficticios en una hoja aparte.

## Hoja de ruta

| Versión | Qué agrega | Estado |
|---|---|---|
| v0.1 | Núcleo, dashboard, registro manual, asistente, demo | ✅ |
| v0.2 | Lectura automática de correos del banco (BCP, Yape) | ⏳ |
| v0.3 | Bot de Telegram: solo pregunta lo que no conoce, resumen diario | ⏳ |
| v0.4 | Gemini: audios, foto de boleta, dividir compras | ⏳ |
| v0.5 | Presupuestos, próximos pagos, plantilla "Hacer una copia" | ⏳ |

## Instalación

Ver [docs/instalacion.md](docs/instalacion.md). Resumen para desarrolladores:

```bash
git clone https://github.com/USUARIO_GITHUB/finanzas-personales.git
cd finanzas-personales
npm install
npx clasp login
npm run setup      # crea tu Google Sheet y el proyecto de Apps Script
git checkout src/appsscript.json
npm run deploy     # sube el código y publica la web app (solo tú puedes abrirla)
```

## Decisiones técnicas

- **Apps Script + Google Sheets:** gratis, sin servidores, los datos quedan en la cuenta de cada persona y se pueden abrir y exportar como cualquier hoja.
- **Lógica pura separada de Google:** `src/core/` no depende de servicios de Google, así que se prueba en Node con un arnés que simula Sheets (`tests/harness.js`). Solo `src/core/repo.js` toca la hoja.
- **Sin doble conteo:** pagar la tarjeta o mover plata entre tus cuentas es una *transferencia*, no un gasto. El gasto se cuenta una sola vez, cuando compras.
- **Multimoneda simple:** cada movimiento guarda su moneda original y su equivalente en soles con el tipo de cambio; el dashboard suma en soles.
- **Columnas por encabezado:** la app ubica cada columna por su nombre, así que puedes reordenar columnas o agregar las tuyas en la hoja sin romper nada.

Más detalle en [docs/arquitectura.md](docs/arquitectura.md) y el diseño completo en [docs/superpowers/specs](docs/superpowers/specs/2026-10-13-app-finanzas-design.md).

## Desarrollo

```bash
npm test          # pruebas (node:test)
npm run lint      # ESLint
npm run ui -- "mostrar('movimientos')" vista captura.png 420   # revisar la interfaz en Chrome con datos simulados
```

## Privacidad

Tus datos viven solo en tu Google Sheet. Lee [docs/privacidad.md](docs/privacidad.md).

## Licencia

[MIT](LICENSE)
````

- [ ] **Paso 5: Crear `docs/instalacion.md`**

````markdown
# Instalación

Cada persona instala **su propia copia**: su propia Google Sheet y su propio proyecto de Apps Script, en su cuenta de Google. Nadie más ve tus datos.

## Vía desarrollador (clasp) — disponible desde v0.1

Requisitos: Node 20 o superior, una cuenta de Google y la [API de Apps Script activada](https://script.google.com/home/usersettings) (interruptor "Google Apps Script API" en **On**).

1. Clona e instala:

   ```bash
   git clone https://github.com/USUARIO_GITHUB/finanzas-personales.git
   cd finanzas-personales
   npm install
   ```

2. Inicia sesión en Google con clasp (abre el navegador):

   ```bash
   npx clasp login
   ```

3. Crea tu Google Sheet y su proyecto de Apps Script:

   ```bash
   npm run setup
   git checkout src/appsscript.json
   ```

   `npm run setup` crea `.clasp.json` (ignorado por git) y una Sheet llamada "Finanzas personales" en tu Drive. El `git checkout` restaura el manifiesto del repo (zona horaria y acceso "solo yo"), que clasp reemplaza al crear el proyecto.

4. Publica la web app:

   ```bash
   npm run deploy
   ```

   La primera vez crea el despliegue y guarda su id en `.despliegue`; las siguientes veces actualiza **el mismo** despliegue, así que la URL no cambia. Al final imprime la URL.

5. Abre la URL. Google pedirá autorizar el acceso a tus hojas (es tu propio script). Luego aparece el **asistente**: tu nombre, tipo de cambio, tus cuentas y categorías.

6. Guarda la URL en la pantalla de inicio del celular (Chrome → menú → "Agregar a la pantalla principal").

### Actualizar a una versión nueva

```bash
git pull
npm install
npm run deploy
```

Tus datos no se tocan: viven en la Sheet.

## Vía plantilla ("Hacer una copia") — llega en v0.5

Para quien no quiera usar la terminal: una Sheet plantilla con el código incluido, que se copia con un clic.

## Probar sin datos reales

En el asistente toca **"Solo mirar (datos demo)"**, o en **Ajustes → Ver con datos demo**. Se crea una Sheet aparte con 3 meses ficticios; tu hoja real no se toca. Para volver: **Ajustes → Salir del modo demo**.
````

- [ ] **Paso 6: Crear `docs/arquitectura.md`**

````markdown
# Arquitectura

```
Navegador (celular / laptop)
        │  google.script.run
        ▼
src/web/        api.js (funciones públicas) · servidor.js (doGet) · vistas .html
        │
src/setup/      asistente.js · demo.js
        │
src/core/       movimientos.js · agregados.js · catalogos.js · util.js   ← lógica pura
        │
src/core/repo.js   ← única capa que toca SpreadsheetApp
        │
Google Sheet    Movimientos · Divisiones · Cuentas · Categorias · Reglas · Config · Log
```

## Reglas del código

- Apps Script carga todos los archivos en un mismo ámbito global. Las funciones que el navegador puede llamar **no** terminan en `_`; las internas **sí** (Apps Script las oculta al navegador).
- Toda escritura pasa por `conBloqueo_` para evitar choques entre pestañas.
- Las fechas se guardan como texto `yyyy-MM-dd` en columnas con formato texto, y se leen convirtiendo cualquier `Date` que Sheets devuelva.
- Cada columna se ubica por su encabezado: se puede reordenar la hoja o agregar columnas propias.

## Modelo de datos

| Hoja | Para qué |
|---|---|
| Movimientos | Gastos, ingresos y transferencias. `monto` en la moneda original, `monto_pen` en soles. |
| Divisiones | Partes de un movimiento dividido entre categorías (se usa desde v0.2). |
| Cuentas | Débito, crédito (saldo negativo = deuda), ahorro, billetera, efectivo. |
| Categorias | De gasto o de ingreso; desactivar conserva el historial. |
| Reglas | Comercio → categoría (se usa desde v0.2). |
| Config | Nombre, tipo de cambio, versión del esquema. Nunca secretos. |
| Log | Errores de procesos automáticos (desde v0.2). |

## Pruebas

`tests/harness.js` carga `src/**/*.js` en un contexto `vm` de Node con Sheets, Properties, Lock y Utilities simulados. `tests/ui/ver.js` abre la interfaz real en Chrome sin cabeza con `google.script.run` simulado (`tests/ui/stub.js`) para revisarla y tomar capturas.
````

- [ ] **Paso 7: Crear `docs/privacidad.md`**

````markdown
# Privacidad

- **Dónde están tus datos:** solo en tu Google Sheet, en tu cuenta de Google. El repositorio no contiene datos de nadie.
- **Quién puede abrir la app:** la web app se publica con acceso **"Solo yo"**: únicamente tu cuenta de Google puede abrirla.
- **Secretos:** los tokens y claves que lleguen en versiones futuras (Telegram, Gemini) se guardan en *Script Properties* del proyecto, nunca en la hoja ni en el código.
- **Modo demo:** usa datos inventados en una hoja aparte, útil para mostrar la app sin exponer tus finanzas.

## Próximas versiones

- **v0.2 (correos):** la app leerá los correos de notificación de tu banco **dentro de tu propia cuenta**; nada sale de Google.
- **v0.4 (Gemini):** audios, fotos de boletas y algunos textos se enviarán a la API de Gemini con **tu** clave. En el nivel gratuito, Google puede usar ese contenido para mejorar sus productos; para datos reales se recomienda el nivel de pago con un tope de gasto, donde no se usa para entrenar.
````

- [ ] **Paso 8: Crear `CHANGELOG.md`**

```markdown
# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones con [SemVer](https://semver.org/lang/es/).

## [0.1.0] — 2026-10-13

### Agregado
- Asistente de instalación: nombre, tipo de cambio, cuentas y categorías.
- Registro manual de gastos, ingresos y transferencias en soles y dólares.
- Dashboard: indicadores del mes, gasto por categoría, tendencia de 6 meses, saldos por cuenta y top de comercios.
- Gestión de cuentas, categorías y ajustes.
- Modo demo con datos ficticios en una hoja aparte.
- Pruebas en Node con Sheets simulado, ESLint y CI en GitHub Actions.
```

- [ ] **Paso 9: Verificar todo**

Run: `npm test && npm run lint`
Expected: todo PASS; lint sin errores (incluye `scripts/desplegar.js`).

- [ ] **Paso 10: Commit de documentación**

```bash
git add scripts README.md CHANGELOG.md docs/instalacion.md docs/arquitectura.md docs/privacidad.md docs/img
git commit -m "docs: README, instalación, arquitectura, privacidad, capturas y script de despliegue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Paso 11: Despliegue real (requiere a Bruno)**

Pedir a Bruno que, en una terminal en la carpeta del proyecto, ejecute (el login abre su navegador):

```bash
npx clasp login
npm run setup
git checkout src/appsscript.json
npm run deploy
```

Expected: `npm run deploy` imprime `URL: https://script.google.com/macros/s/AKfy…/exec`. Confirmar con `git status` que `.clasp.json` y `.despliegue` **no** aparecen (están ignorados).

- [ ] **Paso 12: Prueba de humo en la app real (con Bruno)**

Bruno abre la URL en la laptop y en el celular y confirma:
1. Aparece el asistente; "Solo mirar (datos demo)" muestra el dashboard con datos ficticios y el banner de modo demo.
2. Ajustes → "Salir del modo demo" vuelve al asistente.
3. Completa el asistente con sus cuentas reales (Débito BCP, VISA BCP, Interbank, Yape/efectivo según prefiera).
4. Registra un gasto con el botón + y lo ve en Movimientos y en el dashboard.
5. Abre la Google Sheet desde Ajustes y ve las hojas creadas.

Anotar cualquier problema; si hay, corregir con su prueba antes de seguir.

- [ ] **Paso 13: Cerrar la rama y etiquetar**

Usar superpowers:finishing-a-development-branch para integrar `fase-1` en `main`. Después de integrar:

```bash
git tag -a v0.1.0 -m "v0.1.0 — núcleo, dashboard, registro manual, asistente y demo"
```

- [ ] **Paso 14: Publicar en GitHub (solo con confirmación explícita de Bruno)**

Preguntar a Bruno si quiere crear ya el repositorio **público** `finanzas-personales` en su GitHub. Solo si dice que sí:

```bash
gh repo create finanzas-personales --public --source . --remote origin --description "App de finanzas personales autoalojada en Google Apps Script + Sheets"
git push -u origin main --tags
```

Expected: el workflow CI corre en GitHub y queda en verde (revisar con `gh run list --limit 1`).
