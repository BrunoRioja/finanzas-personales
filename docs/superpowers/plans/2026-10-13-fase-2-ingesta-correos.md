# Fase 2 · Lectura automática de correos — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** Que los movimientos del BCP y Yape entren solos leyendo los correos de notificación, con bandeja "Por revisar", reglas comercio → categoría, dividir compras, y lectura configurable desde Ajustes.

**Arquitectura:** Lectores puros por banco (`src/parsers/`) convierten un correo (texto plano obtenido del HTML) en un *movimiento crudo*; `resolverMovimiento_` (`src/ingesta/resolver.js`) lo asigna a una cuenta por número y a una categoría por regla; `revisarCorreos` (`src/ingesta/revisar.js`) orquesta la vuelta usando el único adaptador de Gmail (`src/ingesta/gmail.js`, servicio avanzado Gmail v1). La hoja migra a esquema v2 sin perder datos. La interfaz suma la vista Por revisar, el modal Dividir y la sección de lectura en Ajustes.

**Tecnologías:** Google Apps Script (V8) + Google Sheets + Gmail API (servicio avanzado, permiso `gmail.modify`), Node 24 (`node --test`), ESLint 9, Chrome headless.

**Spec:** [docs/superpowers/specs/2026-10-13-fase-2-ingesta-correos-design.md](../specs/2026-10-13-fase-2-ingesta-correos-design.md) (y la spec general [2026-10-13-app-finanzas-design.md](../specs/2026-10-13-app-finanzas-design.md))

## Restricciones globales

- Rama de trabajo: `fase-2` (ya creada, contiene la spec). Commits convencionales en español terminados con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Pruebas: `npm test` (= `node --test`, sin argumentos). Lint: `npm run lint`.
- Todas las restricciones de la fase 1 siguen: nunca `new Date('yyyy-mm-dd')` ni `instanceof Date` (usar `esFecha_`); en `src/**/*.js` nada de `require`; `const` de nivel superior solo con literales; funciones públicas sin guion bajo final, internas con guion bajo; montos con `redondear2_`; agregados en `monto_pen`; nada de `alert/confirm/prompt`; todo dato a `innerHTML` pasa por `esc()`.
- **Bloqueos:** toda escritura dentro de `conBloqueo_`, nunca anidado. `revisarCorreos` usa `tryLock` propio y todo lo que llama por dentro **no** toma bloqueos. Funciones que pueden correr dentro de un bloqueo devuelven `estadoActual_()` (no `estadoInstalacion()`, que puede migrar y bloquear).
- **Gmail:** solo `src/ingesta/gmail.js` usa el objeto `Gmail`. Remitentes aceptados, comparación exacta en minúsculas: `notificaciones@notificacionesbcp.com.pe`, `notificaciones@yape.pe`. Etiqueta: `Finanzas/Procesado`. La fuente de verdad de "ya leído" es `ref_externa = 'gmail:<id>'` (Movimientos), `gmail_id` (Pendientes) y la propiedad `CORREOS_IGNORADOS`; la etiqueta es solo visual.
- Fecha de un movimiento importado = fecha de recepción del correo en `America/Lima`.
- Máximo 50 correos descargados por vuelta; cursor = `ultima vuelta completa − 2 horas`.
- Frecuencias válidas: `5`, `15`, `30`, `60`, `manual`, `apagada`.
- Fixtures de correos **siempre anonimizados**: nombres "Ana Prueba", tarjetas `1111` (débito) y `2222` (crédito), cuentas `3333` (ahorro) y `4444` (gastos).
- Esquema v2 (`VERSION_ESQUEMA = 2`): Cuentas `id, nombre, banco, tipo, moneda, saldo_inicial, numeros, activa, yape`; nueva hoja Pendientes `id, gmail_id, fecha, remitente, asunto, resumen, estado`.

## Review Focus

- Montos con separador de miles en el correo (`S/ 1,250.00`) → se leen como 1250, no como 1 (prueba en Tarea 2).
- Comercio con entidades HTML o caracteres invisibles (`H&amp;M`, `​` dentro de números) → texto limpio `H&M` (prueba en Tarea 2).
- El usuario elimina un movimiento importado (p. ej. un duplicado) → no vuelve a aparecer en la siguiente lectura (prueba en Tarea 8).
- El mismo número de tarjeta/cuenta en dos cuentas → error claro al guardar, no asignaciones al azar (prueba en Tarea 1).
- Correo de un remitente que imita al banco (`...@notificacionesbcp.com.pe.estafa.com`) → se ignora, no crea movimientos (prueba en Tarea 5).

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/core/esquema.js` (mod) | Esquema v2, `RENOMBRES_ESQUEMA` |
| `src/core/repo.js` (mod) | `migrarEsquema_`, `migrarSiHaceFalta_`, `asegurarEsquema_`, `registrarLog_` |
| `src/core/catalogos.js` (mod) | `numeros` y `yape` en cuentas; `normalizarNumeros_`, `numerosDe_`, `validarNumerosUnicos_` |
| `src/setup/asistente.js`, `src/setup/demo.js` (mod) | `estadoActual_`, migración al abrir, validación de cuentas nuevas, demo con `numeros` |
| `src/parsers/texto.js` | `htmlATexto_`, `leerMonto_`, `PATRON_MONTO` |
| `src/parsers/bcp.js` | Lector BCP (consumos, PLIN, transferencias, pago de tarjeta, servicios, yapeo recibido) |
| `src/parsers/yape.js` | Lector Yape (yapeo enviado) |
| `src/parsers/lectores.js` | Registro de lectores, `REMITENTES_BANCARIOS`, `leerCorreoBancario_` |
| `src/ingesta/resolver.js` | `resolverMovimiento_`, `reglaPara_` |
| `src/ingesta/gmail.js` | Adaptador Gmail: buscar, leer, etiquetar |
| `src/ingesta/revisar.js` | `revisarCorreos`, cursor, tandas, pendientes, ignorados, uso de reglas |
| `src/ingesta/activacion.js` | `configurarLectura`, `estadoLectura`, `importarCorreosDesde`, triggers |
| `src/core/divisiones.js` | `normalizarPartes_` |
| `src/web/api.js` (mod) | Cuentas con números/Yape, dashboard con `porRevisar`, eliminar con divisiones |
| `src/web/api-revisar.js` | Bandeja, reglas, pendientes, dividir |
| `src/web/vista-revisar.html`, `src/web/vista-dividir.html` | Vista Por revisar y modal Dividir |
| `src/web/vista-*.html`, `estilos.html`, `cliente.html`, `Index.html` (mod) | Franja en Inicio, marcas en Movimientos, cuentas con números, Ajustes con lectura y reglas |
| `src/appsscript.json` (mod) | Servicio avanzado Gmail y permisos explícitos |
| `tests/harness.js` (mod) | Gmail, ScriptApp, `tryLock`, base64 simulados |
| `tests/correos.js`, `tests/fixtures/correos/*.html` | Correos de ejemplo anonimizados |
| `tests/*.test.js` | Pruebas por tarea |
| `docs/agregar-un-banco.md` y docs (mod) | Documentación |

---

### Task 1: Esquema v2 — varios números por cuenta, cuenta de Yape y migración

**Archivos:**
- Modificar: `src/core/esquema.js`, `src/core/repo.js`, `src/core/catalogos.js`, `src/setup/asistente.js`, `src/setup/demo.js`, `src/web/api.js`, `src/web/cliente.html`, `src/web/vista-cuentas.html`, `src/web/vista-asistente.html`, `tests/fixtures.js`, `tests/repo.test.js`, `tests/catalogos.test.js`
- Reemplazar: `tests/ui/stub.js`
- Crear: `tests/migracion.test.js`

**Interfaces:**
- Produce: `VERSION_ESQUEMA = 2`; `RENOMBRES_ESQUEMA = { Cuentas: { ultimos4: 'numeros' } }`; `migrarEsquema_(libro)`; `migrarSiHaceFalta_() → bool` (sin bloqueo); `asegurarEsquema_()` (toma bloqueo solo si hay que migrar); `estadoActual_() → {instalado, modoDemo}` (sin migrar); `estadoInstalacion()` (migra y luego `estadoActual_`); `normalizarNumeros_(valor) → '5101, 5202'`; `numerosDe_(cuenta) → ['5101','5202']`; `validarNumerosUnicos_(cuenta, otras)` (lanza `El número N ya está en la cuenta "X".`); `normalizarCuenta_` devuelve `{nombre, banco, tipo, moneda, saldo_inicial, numeros, activa, yape}`. En el navegador: `textoNumeros(numeros) → ' · •••• 5101 · •••• 5202'`.

- [ ] **Paso 1: Actualizar pruebas existentes al esquema v2**

En `tests/repo.test.js`:
- `const HOJAS = ['Categorias', 'Config', 'Cuentas', 'Divisiones', 'Log', 'Movimientos', 'Reglas'];` → `const HOJAS = ['Categorias', 'Config', 'Cuentas', 'Divisiones', 'Log', 'Movimientos', 'Pendientes', 'Reglas'];`
- `assert.deepStrictEqual(e.hojas.Cuentas, [['id', 'nombre', 'banco', 'tipo', 'moneda', 'saldo_inicial', 'ultimos4', 'activa']]);` → `assert.deepStrictEqual(e.hojas.Cuentas, [['id', 'nombre', 'banco', 'tipo', 'moneda', 'saldo_inicial', 'numeros', 'activa', 'yape']]);`
- `assert.strictEqual(e.principal._formatos['Cuentas!7'], '@');   // ultimos4` → `assert.strictEqual(e.principal._formatos['Cuentas!7'], '@');   // numeros`
- `e.interno('agregarFilas_', 'Cuentas', [{ id: 'a', nombre: 'Débito', saldo_inicial: '10.5', ultimos4: '0042', activa: true }]);` → `e.interno('agregarFilas_', 'Cuentas', [{ id: 'a', nombre: 'Débito', saldo_inicial: '10.5', numeros: '0042', activa: true }]);`
- `assert.deepStrictEqual(e.hojas.Cuentas[1], ['a', 'Débito', '', '', '', 10.5, '0042', true]);` → `assert.deepStrictEqual(e.hojas.Cuentas[1], ['a', 'Débito', '', '', '', 10.5, '0042', true, false]);`
- `{ id: 'a', nombre: 'Débito', banco: '', tipo: '', moneda: '', saldo_inicial: 10.5, ultimos4: '0042', activa: true },` → `{ id: 'a', nombre: 'Débito', banco: '', tipo: '', moneda: '', saldo_inicial: 10.5, numeros: '0042', activa: true, yape: false },`

En `tests/catalogos.test.js`:
- `e.llamar('normalizarCuenta_', { nombre: ' VISA ', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: '-120.456', ultimos4: '0042' }),` → `e.llamar('normalizarCuenta_', { nombre: ' VISA ', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: '-120.456', numeros: '0042' }),`
- `{ nombre: 'VISA', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -120.46, ultimos4: '0042', activa: true });` → `{ nombre: 'VISA', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -120.46, numeros: '0042', activa: true, yape: false });`
- `assert.throws(() => e.interno('normalizarCuenta_', { nombre: 'X', tipo: 'debito', ultimos4: '42' }), /4 números/);` → `assert.throws(() => e.interno('normalizarCuenta_', { nombre: 'X', tipo: 'debito', numeros: '42' }), /4 dígitos/);`
- `assert.deepStrictEqual(cat.cuentas.map(c => [c.nombre, c.ultimos4, c.saldo_inicial]), [['Débito BCP', '1234', 1000], ['VISA BCP', '0042', -200]]);` → `assert.deepStrictEqual(cat.cuentas.map(c => [c.nombre, c.numeros, c.saldo_inicial]), [['Débito BCP', '1234', 1000], ['VISA BCP', '0042', -200]]);`

En `tests/fixtures.js`: reemplazar las dos apariciones de `ultimos4:` por `numeros:`.

- [ ] **Paso 2: Escribir la prueba que falla `tests/migracion.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { ASISTENTE, entornoInstalado } = require('./fixtures');

function hojaV1() {
  return crearEntorno({
    hojas: {
      Config: [['clave', 'valor'], ['instalado', 'si'], ['version_esquema', '1'], ['nombre', 'Ana']],
      Cuentas: [['id', 'nombre', 'banco', 'tipo', 'moneda', 'saldo_inicial', 'ultimos4', 'activa'], ['c1', 'Débito', 'BCP', 'debito', 'PEN', 100, '0042', true]],
    },
  });
}

test('estadoInstalacion migra una hoja v1 a v2 sin perder datos', () => {
  const e = hojaV1();
  assert.deepStrictEqual(e.llamar('estadoInstalacion'), { instalado: true, modoDemo: false });
  assert.deepStrictEqual(e.hojas.Cuentas[0], ['id', 'nombre', 'banco', 'tipo', 'moneda', 'saldo_inicial', 'numeros', 'activa', 'yape']);
  const cuenta = e.llamar('leerTabla_', 'Cuentas')[0];
  assert.strictEqual(cuenta.numeros, '0042');
  assert.strictEqual(cuenta.yape, false);
  assert.strictEqual(cuenta.saldo_inicial, 100);
  assert.ok(e.hojas.Pendientes, 'crea la hoja Pendientes');
  assert.strictEqual(e.llamar('leerConfig_').version_esquema, '2');
  assert.strictEqual(e.principal._formatos['Cuentas!9'], undefined, 'yape es booleano: sin formato texto');
});

test('la migración es idempotente y no bloquea si no hace falta', () => {
  const e = hojaV1();
  e.llamar('estadoInstalacion');
  const locks = e.stats.locks;
  const encabezados = e.hojas.Cuentas[0].slice();
  e.llamar('estadoInstalacion');
  assert.deepStrictEqual(e.hojas.Cuentas[0], encabezados);
  assert.strictEqual(e.stats.locks, locks);
});

test('normalizarCuenta_ acepta varios números y marca de Yape', () => {
  const e = crearEntorno();
  const c = e.llamar('normalizarCuenta_', { nombre: 'Gastos', tipo: 'debito', numeros: ' 5101,5202  5101 ', yape: true });
  assert.strictEqual(c.numeros, '5101, 5202');
  assert.strictEqual(c.yape, true);
  assert.strictEqual(e.llamar('normalizarCuenta_', { nombre: 'E', tipo: 'efectivo' }).numeros, '');
  assert.throws(() => e.interno('normalizarCuenta_', { nombre: 'X', tipo: 'debito', numeros: '5101, 73' }), /4 dígitos: "73"/);
  assert.deepStrictEqual(e.llamar('numerosDe_', { numeros: '5101, 5202' }), ['5101', '5202']);
});

test('guardarCuenta rechaza números repetidos entre cuentas y deja una sola cuenta de Yape', () => {
  const e = entornoInstalado();
  const deb = e.cuenta('Débito BCP');
  e.llamar('guardarCuenta', { id: deb, nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', numeros: '5101, 5202', yape: true });
  assert.throws(() => e.interno('guardarCuenta', { nombre: 'Otra', tipo: 'ahorro', numeros: '5202' }), /5202 ya está en la cuenta "Débito BCP"/);
  const ahorro = e.llamar('guardarCuenta', { nombre: 'Ahorro BCP', tipo: 'ahorro', numeros: '5303', yape: true });
  const cuentas = e.filas('Cuentas');
  assert.strictEqual(cuentas.find(c => c.id === deb).yape, false);
  assert.strictEqual(cuentas.find(c => c.id === ahorro.id).yape, true);
  assert.doesNotThrow(() => e.interno('guardarCuenta', { id: deb, nombre: 'Débito BCP', tipo: 'debito', numeros: '5101, 5202' }));
});

test('completarAsistente valida números repetidos y una sola cuenta de Yape', () => {
  const e = crearEntorno();
  const dos = { nombre: 'A', tipo: 'debito', numeros: '1111' };
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { cuentas: [dos, Object.assign({}, dos, { nombre: 'B' })] })), /1111 ya está/);
  assert.throws(() => e.interno('completarAsistente', Object.assign({}, ASISTENTE, { cuentas: [Object.assign({}, dos, { yape: true }), { nombre: 'B', tipo: 'ahorro', yape: true }] })), /Solo una cuenta puede ser la de Yape/);
  assert.deepStrictEqual(Object.keys(e.hojas), []);
});
```

- [ ] **Paso 3: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL en las pruebas nuevas (`numerosDe_ is not a function`, encabezados con `ultimos4`) y en las actualizadas de repo/catalogos.

- [ ] **Paso 4: Actualizar `src/core/esquema.js`**

Reemplazar `const VERSION_ESQUEMA = 1;` por `const VERSION_ESQUEMA = 2;`.

Reemplazar la entrada `Cuentas` por:

```js
  Cuentas: [
    ['id', 'texto'], ['nombre', 'texto'], ['banco', 'texto'], ['tipo', 'texto'], ['moneda', 'texto'],
    ['saldo_inicial', 'numero'], ['numeros', 'texto'], ['activa', 'booleano'], ['yape', 'booleano'],
  ],
```

Agregar antes de `Config:` la hoja:

```js
  Pendientes: [
    ['id', 'texto'], ['gmail_id', 'texto'], ['fecha', 'fecha'], ['remitente', 'texto'], ['asunto', 'texto'],
    ['resumen', 'texto'], ['estado', 'texto'],
  ],
```

Agregar al final del archivo:

```js

// Encabezados renombrados entre versiones del esquema (versión anterior → actual).
const RENOMBRES_ESQUEMA = { Cuentas: { ultimos4: 'numeros' } };
```

- [ ] **Paso 5: Agregar migración y log al final de `src/core/repo.js`**

```js

// Lleva el libro al esquema actual sin borrar datos: crea hojas faltantes, renombra
// encabezados antiguos y agrega al final las columnas nuevas.
function migrarEsquema_(libro) {
  crearHojas_(libro);
  Object.keys(ESQUEMA).forEach(nombre => {
    const hoja = libro.getSheetByName(nombre);
    const renombres = RENOMBRES_ESQUEMA[nombre] || {};
    const encabezados = encabezados_(hoja);
    let renombrado = false;
    const actuales = encabezados.map(h => {
      if (!renombres[h]) return h;
      renombrado = true;
      return renombres[h];
    });
    if (renombrado) hoja.getRange(1, 1, 1, actuales.length).setValues([actuales]);
    ESQUEMA[nombre].forEach(c => {
      if (actuales.indexOf(c[0]) >= 0) return;
      actuales.push(c[0]);
      const col = actuales.length;
      hoja.getRange(1, col, 1, 1).setValues([[c[0]]]);
      if (c[1] === 'texto' || c[1] === 'fecha') hoja.getRange(2, col, hoja.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });
}

// Sin bloqueo: para usar dentro de una función que ya lo tiene.
function migrarSiHaceFalta_() {
  const libro = abrirLibro_();
  if (!libro.getSheetByName('Config')) return false;
  if (Number(leerConfig_().version_esquema) >= VERSION_ESQUEMA) return false;
  migrarEsquema_(libro);
  guardarConfig_({ version_esquema: VERSION_ESQUEMA });
  return true;
}

function asegurarEsquema_() {
  const libro = abrirLibro_();
  if (!libro.getSheetByName('Config')) return;
  if (Number(leerConfig_().version_esquema) >= VERSION_ESQUEMA) return;
  conBloqueo_(migrarSiHaceFalta_);
}

function registrarLog_(nivel, origen, mensaje, detalle) {
  try {
    agregarFilas_('Log', [{
      fecha: formatearFecha_(new Date(), 'yyyy-MM-dd HH:mm:ss'), nivel: nivel, origen: origen,
      mensaje: String(mensaje), detalle: detalle == null ? '' : String(detalle).slice(0, 2000),
    }]);
  } catch {
    // Sin hoja Log no hay dónde escribir: no tapar el error original.
  }
}
```

- [ ] **Paso 6: Números y Yape en `src/core/catalogos.js`**

Reemplazar en `normalizarCuenta_` las dos líneas:

```js
  const ultimos4 = String(datos.ultimos4 == null ? '' : datos.ultimos4).trim();
  if (ultimos4 && !/^\d{4}$/.test(ultimos4)) throw new Error('Los últimos 4 dígitos deben ser 4 números.');
```

por:

```js
  const numeros = normalizarNumeros_(datos.numeros);
```

y en el `return` reemplazar `saldo_inicial: saldo, ultimos4: ultimos4, activa: datos.activa !== false,` por `saldo_inicial: saldo, numeros: numeros, activa: datos.activa !== false, yape: datos.yape === true,`.

Agregar al final del archivo:

```js

// "5101,5202  5101" → "5101, 5202". Cada número: últimos 4 dígitos de una cuenta o tarjeta.
function normalizarNumeros_(valor) {
  const partes = String(valor == null ? '' : valor).split(/[\s,;]+/).filter(Boolean);
  partes.forEach(n => {
    if (!/^\d{4}$/.test(n)) throw new Error('Cada número de cuenta o tarjeta debe tener 4 dígitos: "' + n + '".');
  });
  return partes.filter((n, i) => partes.indexOf(n) === i).join(', ');
}

function numerosDe_(cuenta) {
  return String(cuenta.numeros || '').split(/[\s,;]+/).filter(Boolean);
}

// Un número solo puede pertenecer a una cuenta: si no, un correo no sabría a cuál ir.
function validarNumerosUnicos_(cuenta, otras) {
  const propios = numerosDe_(cuenta);
  otras.forEach(o => numerosDe_(o).forEach(n => {
    if (propios.indexOf(n) >= 0) throw new Error('El número ' + n + ' ya está en la cuenta "' + o.nombre + '".');
  }));
}
```

- [ ] **Paso 7: `src/setup/asistente.js` — estado sin migrar, migración al abrir y validación de cuentas nuevas**

Reemplazar la función `estadoInstalacion` completa por:

```js
// Estado sin migrar: seguro de usar dentro de un bloqueo.
function estadoActual_() {
  const instalado = estaInstalado_(abrirLibro_());
  return {
    instalado: instalado,
    modoDemo: PropertiesService.getScriptProperties().getProperty('MODO_DEMO') === 'si',
  };
}

// Llamada al abrir la app: si la hoja es de una versión anterior, la migra.
function estadoInstalacion() {
  asegurarEsquema_();
  return estadoActual_();
}
```

En `completarAsistente`: después de la línea `if (!cuentas.length) throw new Error('Agrega al menos una cuenta.');` agregar:

```js
    if (cuentas.filter(c => c.yape).length > 1) throw new Error('Solo una cuenta puede ser la de Yape.');
    cuentas.forEach((c, i) => validarNumerosUnicos_(c, cuentas.slice(0, i)));
```

y reemplazar su `return estadoInstalacion();` por `return estadoActual_();`.

- [ ] **Paso 8: `src/setup/demo.js`**

Reemplazar `ultimos4: '1111', activa: true },` por `numeros: '1111', activa: true, yape: true },`; `ultimos4: '2222', activa: true },` por `numeros: '2222', activa: true, yape: false },`; `ultimos4: '', activa: true },` por `numeros: '', activa: true, yape: false },`. En `cargarDemo` reemplazar `return estadoInstalacion();` por `return estadoActual_();` (la de `salirDemo` queda igual).

- [ ] **Paso 9: `guardarCuenta` en `src/web/api.js`**

Reemplazar la función completa por:

```js
function guardarCuenta(datos) {
  return conBloqueo_(() => {
    const cuenta = normalizarCuenta_(datos);
    const todas = leerTabla_('Cuentas');
    if (datos.id && !todas.some(c => c.id === datos.id)) throw new Error('La cuenta ya no existe.');
    const otras = todas.filter(c => c.id !== datos.id);
    validarNumerosUnicos_(cuenta, otras);
    if (cuenta.yape) otras.filter(c => c.yape).forEach(c => actualizarFila_('Cuentas', c.id, { yape: false }));
    if (datos.id) {
      actualizarFila_('Cuentas', datos.id, cuenta);
      return Object.assign({ id: datos.id }, cuenta);
    }
    const nueva = Object.assign({ id: nuevoId_() }, cuenta);
    agregarFilas_('Cuentas', [nueva]);
    return nueva;
  });
}
```

- [ ] **Paso 10: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: todo PASS.

- [ ] **Paso 11: Interfaz de cuentas y asistente**

En `src/web/cliente.html`, antes de `function campo(etiqueta, control)` agregar:

```js
function textoNumeros(numeros) {
  return numeros ? ' · ' + String(numeros).split(/[\s,]+/).filter(Boolean).map(n => '•••• ' + n).join(' · ') : '';
}
```

En `src/web/vista-cuentas.html` reemplazar:
- `esc(c.banco + ' · ' + etiquetaTipo(c.tipo) + ' · ' + c.moneda + (c.ultimos4 ? ' · •••• ' + c.ultimos4 : ''))` → `esc(c.banco + ' · ' + etiquetaTipo(c.tipo) + ' · ' + c.moneda + textoNumeros(c.numeros) + (c.yape ? ' · Yape' : ''))`
- `ultimos4: '', saldo_inicial: 0, activa: true };` → `numeros: '', saldo_inicial: 0, activa: true, yape: false };`
- `campo('Últimos 4 dígitos', '<input class="entrada num" id="c-ult" inputmode="numeric" maxlength="4" value="' + esc(v.ultimos4) + '">') + '</div>' +` → `campo('Números de cuenta o tarjeta', '<input class="entrada num" id="c-num" inputmode="numeric" placeholder="5101, 5202" value="' + esc(v.numeros) + '">') + '</div>' +`
- `(c ? '<label class="check"><input type="checkbox" id="c-activa"` → `'<label class="check"><input type="checkbox" id="c-yape"' + (v.yape ? ' checked' : '') + '> Yape sale y entra de esta cuenta</label>' +\n    (c ? '<label class="check"><input type="checkbox" id="c-activa"`
- `tipo: $('#c-tipo', caja).value, moneda: $('#c-moneda', caja).value, ultimos4: $('#c-ult', caja).value,` → `tipo: $('#c-tipo', caja).value, moneda: $('#c-moneda', caja).value, numeros: $('#c-num', caja).value, yape: $('#c-yape', caja).checked,`

En `src/web/vista-asistente.html` reemplazar:
- `esc(c.banco + ' · ' + etiquetaTipo(c.tipo) + ' · ' + c.moneda + (c.ultimos4 ? ' · •••• ' + c.ultimos4 : ''))` → `esc(c.banco + ' · ' + etiquetaTipo(c.tipo) + ' · ' + c.moneda + textoNumeros(c.numeros) + (c.yape ? ' · Yape' : ''))`
- `campo('Últimos 4 dígitos', '<input class="entrada num" id="w-c-ult" inputmode="numeric" maxlength="4">') + '</div>' +` → `campo('Números de cuenta o tarjeta', '<input class="entrada num" id="w-c-num" inputmode="numeric" placeholder="5101, 5202">') + '</div>' +`
- `campo('Saldo actual (negativo si es deuda de tarjeta)', '<input class="entrada num" id="w-c-saldo" inputmode="decimal" placeholder="0.00">') +` → `campo('Saldo actual (negativo si es deuda de tarjeta)', '<input class="entrada num" id="w-c-saldo" inputmode="decimal" placeholder="0.00">') +\n        '<label class="check"><input type="checkbox" id="w-c-yape"> Yape sale y entra de esta cuenta</label>' +`
- `moneda: $('#w-c-moneda').value, ultimos4: $('#w-c-ult').value.trim(), saldo_inicial: $('#w-c-saldo').value,` → `moneda: $('#w-c-moneda').value, numeros: $('#w-c-num').value.trim(), saldo_inicial: $('#w-c-saldo').value, yape: $('#w-c-yape').checked,`
- `if (nueva.ultimos4 && !/^\d{4}$/.test(nueva.ultimos4)) { aviso('Los últimos 4 dígitos deben ser 4 números.', true); return; }` → `if (nueva.numeros && !/^\d{4}([\s,]+\d{4})*$/.test(nueva.numeros)) { aviso('Cada número debe tener 4 dígitos, separados por coma.', true); return; }\n      if (nueva.yape && datos.cuentas.some(c => c.yape)) { aviso('Solo una cuenta puede ser la de Yape.', true); return; }`

- [ ] **Paso 12: Reemplazar `tests/ui/stub.js`** (incluye ya las llamadas que usarán las tareas 9 y 10)

```js
// google.script.run simulado para revisar la interfaz en Chrome. Datos ficticios.
(function () {
  const CATEGORIAS = [
    ['c1', 'Supermercado', '🛒', '#3ddc97', 'gasto'], ['c2', 'Comida fuera', '🍽️', '#ffb347', 'gasto'],
    ['c3', 'Transporte', '🚕', '#7c5cff', 'gasto'], ['c4', 'Suscripciones', '📺', '#4cc9f0', 'gasto'],
    ['c5', 'Bodega', '🏪', '#ff6b6b', 'gasto'], ['c7', 'Aseo personal', '🧴', '#f72585', 'gasto'],
    ['c6', 'Sueldo', '💼', '#3ddc97', 'ingreso'],
  ].map(c => ({ id: c[0], nombre: c[1], emoji: c[2], color: c[3], tipo: c[4], padre_id: '', activa: true }));
  const CUENTAS = [
    { id: 'a1', nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', moneda: 'PEN', saldo_inicial: 2000, numeros: '4444, 1111', activa: true, yape: true },
    { id: 'a2', nombre: 'VISA BCP', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -300, numeros: '2222', activa: true, yape: false },
    { id: 'a3', nombre: 'Efectivo', banco: 'Efectivo', tipo: 'efectivo', moneda: 'PEN', saldo_inicial: 100, numeros: '', activa: true, yape: false },
    { id: 'a4', nombre: 'Ahorro $', banco: 'BCP', tipo: 'ahorro', moneda: 'USD', saldo_inicial: 200, numeros: '3333', activa: true, yape: false },
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
    mov('m1', '2026-10-12', 'gasto', 89.3, 'a1', 'c1', 'Tottus', { origen: 'gmail', dividido: true }),
    mov('m2', '2026-10-12', 'gasto', 12, 'a1', '', 'BRAYAN G. MUNOZ', { origen: 'gmail', estado: 'por_revisar' }),
    mov('m3', '2026-10-11', 'gasto', 38.5, 'a2', 'c2', 'Pardos Chicken'),
    mov('m4', '2026-10-09', 'gasto', 9.99, 'a2', 'c4', 'Netflix', { moneda: 'USD', tc: 3.75, monto_pen: 37.46, origen: 'gmail' }),
    mov('m5', '2026-10-05', 'transferencia', 600, 'a1', '', '', { cuenta_destino_id: 'a2', descripcion: 'Pago de tarjeta', origen: 'gmail' }),
    mov('m6', '2026-10-01', 'ingreso', 3500, 'a1', 'c6', 'Empresa Demo SAC'),
  ];
  const POR_REVISAR = [
    mov('r1', '2026-10-12', 'gasto', 12, 'a1', '', 'BRAYAN G. MUNOZ', { origen: 'gmail', estado: 'por_revisar' }),
    mov('r2', '2026-10-11', 'gasto', 24.47, '', '', 'CLARO', { origen: 'gmail', estado: 'por_revisar' }),
    mov('r3', '2026-10-10', 'transferencia', 290.26, 'a4', '', '', { origen: 'gmail', estado: 'por_revisar', descripcion: 'Transferencia entre mis cuentas' }),
  ];
  const ESTADO_LECTURA = { activa: true, frecuencia: '5', etiquetar: true, importar_desde: '2026-10-01', ultima_revision: '2026-10-13 10:00:00', info: '12 correos · 10 nuevos · 3 por revisar · 1.4 s' };
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
      mes: '2026-10', porRevisar: 4,
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
    obtenerPorRevisar: {
      movimientos: POR_REVISAR,
      pendientes: [{ id: 'p1', gmail_id: 'gm1', fecha: '2026-10-11', remitente: 'notificaciones@notificacionesbcp.com.pe', asunto: 'Realizaste un consumo con tu Tarjeta de Débito BCP', resumen: 'Hola Ana, hiciste una compra por S/ 15.00 en un comercio…', estado: 'pendiente' }],
      categoriasFrecuentes: { gasto: ['c1', 'c3', 'c2', 'c5', 'c4', 'c7'], ingreso: ['c6'] },
    },
    categorizarMovimiento: { confirmados: 2, regla: { id: 'r1', patron: 'BRAYAN G. MUNOZ', categoria_id: 'c3' } },
    obtenerDivisiones: [
      { id: 'd1', movimiento_id: 'm1', categoria_id: 'c1', monto: 60, nota: '' },
      { id: 'd2', movimiento_id: 'm1', categoria_id: 'c7', monto: 29.3, nota: '' },
    ],
    dividirMovimiento: { ok: true },
    quitarDivision: { ok: true },
    descartarPendiente: { ok: true },
    estadoLectura: ESTADO_LECTURA,
    configurarLectura: ESTADO_LECTURA,
    revisarCorreos: { leidos: 2, creados: 2, porRevisar: 1, pendientes: 0, ignorados: 0, restantes: 0, etiquetados: 2 },
    importarCorreosDesde: { leidos: 12, creados: 10, porRevisar: 3, pendientes: 1, ignorados: 1, restantes: 0, etiquetados: 11 },
    listarReglas: [{ id: 'r1', patron: 'TOTTUS', categoria_id: 'c1', cuenta_id: '', creada_por: 'usuario', usos: 5 }],
    eliminarRegla: { ok: true },
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

- [ ] **Paso 13: Revisar en Chrome**

Run: `node tests/ui/ver.js "mostrar('cuentas')" vista`
Expected: `"error": null`; `texto` contiene `•••• 4444 · •••• 1111 · Yape`.

Run: `node tests/ui/ver.js "mostrar('cuentas'); setTimeout(function(){document.getElementById('nueva-cuenta').click()},300)" modal`
Expected: `"error": null`; `texto` contiene `Números de cuenta o tarjeta` y `Yape sale y entra de esta cuenta`.

Run: `node tests/ui/ver.js "document.body.classList.add('sin-instalar'); mostrar('asistente'); setTimeout(function(){ document.getElementById('w-nombre').value='Ana'; document.getElementById('w-sig').click(); setTimeout(function(){ document.getElementById('w-c-nombre').value='Débito BCP'; document.getElementById('w-c-num').value='5101, 5202'; document.getElementById('w-c-yape').checked=true; document.getElementById('w-c-agregar').click(); },100)},300)" vista`
Expected: `"error": null`; `texto` contiene `•••• 5101 · •••• 5202 · Yape`.

- [ ] **Paso 14: Pruebas, lint y commit**

Run: `npm test && npm run lint` → todo PASS.

```bash
git add src tests
git commit -m "feat: esquema v2 con varios números por cuenta, cuenta de Yape y migración

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Texto de correos y lector del BCP

**Archivos:**
- Crear: `src/parsers/texto.js`, `src/parsers/bcp.js`, `tests/correos.js`, `tests/lector-bcp.test.js`, `tests/fixtures/correos/debito.html`, `credito-soles.html`, `credito-dolares.html`, `plin.html`, `transferencia.html`, `pago-tarjeta-dolares.html`, `pago-tarjeta-soles.html`, `pago-servicio.html`, `yape-recibido.html`, `consumo-roto.html`, `estado-cuenta.html`

**Interfaces:**
- Consume: `redondear2_` (fase 1).
- Produce: `PATRON_MONTO` (string regex `(S\/|\$)\s*([\d,]+\.\d{2})`), `htmlATexto_(html) → string` (una línea, sin etiquetas, entidades decodificadas, sin `​-‍﻿`), `leerMonto_(simbolo, cifra) → {moneda, monto}`, `REMITENTE_BCP`, `leerCorreoBcp_(correo) → {crudo} | {pendiente: motivo} | null`.
- Correo de entrada: `{ id, remitente, asunto, texto, fecha }`. Movimiento crudo: `{ tipo, monto, moneda, fecha, ref_externa: 'gmail:'+id, comercio, numero_origen?, numero_destino?, usa_yape?, descripcion?, tc?, actualiza_tc? }` — **sin** claves con `undefined`.
- Pruebas: `tests/correos.js` exporta `html(nombreArchivo)`, `correo(e, nombreArchivo, extra)`, `ASUNTOS`.

- [ ] **Paso 1: Crear `tests/correos.js`**

```js
// Correos de ejemplo anonimizados (tests/fixtures/correos) y asuntos reales del BCP/Yape.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'fixtures', 'correos');

const ASUNTOS = {
  debito: 'Realizaste un consumo con tu Tarjeta de Débito BCP - Servicio de Notificaciones BCP',
  credito: 'Realizaste un consumo con tu Tarjeta de Crédito BCP - Servicio de Notificaciones BCP',
  transferencia: 'Constancia de Transferencia Entre mis Cuentas - Servicio de Notificaciones BCP',
  pagoTarjeta: 'Constancia de Pago de Tarjeta de Crédito Propia - Servicio de Notificaciones BCP',
  servicio: 'ENVIO AUTOMATICO - CONSTANCIA DE PAGO DE SERVICIO - BANCA MOVIL BCP',
  yapeRecibido: 'Constancia de recepción de Yapeo a celular BCP - Servicio de Notificaciones BCP',
  yape: 'Por tu seguridad, te notificaremos por cada yapeo que realices',
  estadoCuenta: 'Estado de Cuenta de tu Tarjeta VISA',
  comprobante: 'BCP - ¡Te enviamos tu nuevo comprobante electrónico! - FD03-00000001',
};

function html(nombre) {
  return fs.readFileSync(path.join(DIR, nombre), 'utf8');
}

// Correo como lo entrega leerCorreo_ (texto ya convertido a una línea).
function correo(e, nombre, extra) {
  return Object.assign({
    id: nombre.replace('.html', ''),
    remitente: 'notificaciones@notificacionesbcp.com.pe',
    asunto: '',
    fecha: '2026-10-06',
    texto: e.interno('htmlATexto_', html(nombre)),
  }, extra);
}

module.exports = { ASUNTOS, html, correo };
```

- [ ] **Paso 2: Crear `tests/fixtures/correos/debito.html`**

```html
<!DOCTYPE html>
<html>
 <head><title></title><style type="text/css">body {background:white;} a {color: inherit;}</style></head>
 <body>
  <table width="600">
   <tr><td>
    <p>Hola <b>Ana Prueba,</b></p>
    <p>Realizaste un consumo de <b>S/ 89.30</b> con tu <b>Tarjeta de Débito BCP</b> en <b>TOTTUS PRUEBA SUR.</b></p>
    <p>Por tu seguridad, te enviamos los <b>datos de tu operación.</b></p>
   </td></tr>
   <tr><td><p><b>Monto</b></p></td></tr>
   <tr><td><table>
    <tr><td>Total del consumo</td><td><b>S/ 89.30</b></td></tr>
   </table></td></tr>
   <tr><td><p><b>Datos de la operación</b></p></td></tr>
   <tr><td><table>
    <tr><td>Operación realizada</td><td><b>Consumo Tarjeta de Débito</b></td></tr>
    <tr><td>Fecha y hora</td><td><b><a href="">06 de octubre de 2026 - 04:19 PM</a></b></td></tr>
    <tr><td>Número de Tarjeta de Débito</td><td><b>************1111</b></td></tr>
    <tr><td>Empresa</td><td><b>TOTTUS PRUEBA SUR</b></td></tr>
    <tr><td>Número de operación</td><td><b><a href="">100001</a></b></td></tr>
   </table></td></tr>
   <tr><td><p><b>¿No reconoces esta operación?</b></p><p>Comunícate inmediatamente con nosotros al</p>
    <p><span>(01)&#8203; </span> <span>311&#8203;-</span><span>9898</span> anexo *911 para ayudarte a verificarla.</p></td></tr>
   <tr><td><p>Banco de Crédito del Perú S.A. - RUC: <span>20100&#8203;047218</span>.</p></td></tr>
  </table>
 </body>
</html>
```

- [ ] **Paso 3: Crear `tests/fixtures/correos/credito-soles.html`**

```html
<!DOCTYPE html>
<html>
 <head><style>body {background:white;}</style></head>
 <body>
  <table width="600">
   <tr><td>
    <p>Hola <b>Ana Prueba,</b></p>
    <p>Realizaste un consumo de <b>S/ 1,250.00</b> con tu <b>Tarjeta de Crédito BCP</b> en <b>SAGA FALABELLA PRUEBA.</b></p>
    <p>Por tu seguridad, te enviamos los <b>datos de tu operación.</b></p>
   </td></tr>
   <tr><td><table><tr><td>Total del consumo</td><td><b>S/ 1,250.00</b></td></tr></table></td></tr>
   <tr><td><table>
    <tr><td>Operación realizada</td><td><b>Consumo Tarjeta de Crédito</b></td></tr>
    <tr><td>Fecha y hora</td><td><b>26 de agosto de 2026 - 09:55 PM</b></td></tr>
    <tr><td>Número de Tarjeta de Crédito</td><td><b>************2222</b></td></tr>
    <tr><td>Empresa</td><td><b>SAGA FALABELLA PRUEBA</b></td></tr>
    <tr><td>Número de operación</td><td><b>0000100002</b></td></tr>
   </table></td></tr>
  </table>
 </body>
</html>
```

- [ ] **Paso 4: Crear `tests/fixtures/correos/credito-dolares.html`**

```html
<!DOCTYPE html>
<html>
 <head><style>body {background:white;}</style></head>
 <body>
  <table width="600">
   <tr><td>
    <p>Hola <b>Ana Prueba,</b></p>
    <p>Realizaste un consumo de <b>$ 23.60</b> con tu <b>Tarjeta de Crédito BCP</b> en <b>ANTHROPIC* CLAUDE SUB.</b></p>
    <p>Por tu seguridad, te enviamos los <b>datos de tu operación.</b></p>
   </td></tr>
   <tr><td><table><tr><td>Total del consumo</td><td><b>$ 23.60</b></td></tr></table></td></tr>
   <tr><td><table>
    <tr><td>Operación realizada</td><td><b>Consumo Tarjeta de Crédito</b></td></tr>
    <tr><td>Fecha y hora</td><td><b>24 de setiembre de 2026 - 06:43 PM</b></td></tr>
    <tr><td>Número de Tarjeta de Crédito</td><td><b>************2222</b></td></tr>
    <tr><td>Empresa</td><td><b>ANTHROPIC* CLAUDE SUB</b></td></tr>
    <tr><td>Número de operación</td><td><b>0000100003</b></td></tr>
   </table></td></tr>
   <tr><td><p><b>¿Problemas con tus compras?</b></p><p>Si tu compra fue rechazada, cancelada o duplicada, el tiempo estimado de devolución será de 3 a 7 días.</p></td></tr>
  </table>
 </body>
</html>
```

- [ ] **Paso 5: Crear `tests/fixtures/correos/plin.html`**

```html
<!DOCTYPE html>
<html>
 <head><style>body {background:white;}</style></head>
 <body>
  <table width="600">
   <tr><td>
    <p>Hola <b>Ana Prueba,</b></p>
    <p>Realizaste un consumo de <b>S/ 10.00</b> con tu <b>Tarjeta de Débito BCP</b> en <b>PLIN-JUAN PEREZ PRUEB.</b></p>
   </td></tr>
   <tr><td><table><tr><td>Total del consumo</td><td><b>S/ 10.00</b></td></tr></table></td></tr>
   <tr><td><table>
    <tr><td>Operación realizada</td><td><b>Consumo Tarjeta de Débito</b></td></tr>
    <tr><td>Fecha y hora</td><td><b>11 de octubre de 2026 - 05:24 PM</b></td></tr>
    <tr><td>Número de Tarjeta de Débito</td><td><b>************1111</b></td></tr>
    <tr><td>Empresa</td><td><b>PLIN-JUAN PEREZ PRUEB</b></td></tr>
    <tr><td>Número de operación</td><td><b>100004</b></td></tr>
   </table></td></tr>
  </table>
 </body>
</html>
```

- [ ] **Paso 6: Crear `tests/fixtures/correos/transferencia.html`** (la tabla trae dos versiones, móvil y escritorio, como el correo real)

```html
<!DOCTYPE html>
<html>
 <head><style>.movil{display:none}</style></head>
 <body>
  <p>Hola <b>Ana Prueba,</b></p>
  <p>Realizaste una transferencia de <b>S/ 290.26</b> desde tu <b>Clasica.</b></p>
  <p>Por tu seguridad, te enviamos los <b>datos de tu operación.</b></p>
  <p><b>Montos</b></p>
  <table>
   <tr><td>Monto transferido</td><td><b>S/ 290.26</b></td></tr>
   <tr><td>Tipo de cambio</td><td><b></b></td></tr>
   <tr><td>Total cobrado al tipo de cambio</td><td><b></b></td></tr>
  </table>
  <p><b>Datos de la operación</b></p>
  <table>
   <tr><td>Operación realizada</td><td><b>Transferencia entre mis cuentas</b></td></tr>
   <tr><td>Fecha y hora</td><td><b>12 de Octubre de 2026 - 05:58 PM</b></td></tr>
   <tr class="movil"><td>Enviado a</td><td><b></b><br>**** 4444</td></tr>
   <tr class="movil"><td>Desde</td><td><b>Clasica</b><br>**** 3333</td></tr>
   <tr class="escritorio"><td>Desde <b>Clasica</b><br>**** 3333</td><td>Enviado a <b>Clasica</b><br>**** 4444</td></tr>
   <tr><td>Mensaje</td><td><b></b></td></tr>
   <tr><td>Canal</td><td><b>Banca Móvil BCP</b></td></tr>
   <tr><td>Número de operación</td><td><b>04900001</b></td></tr>
  </table>
 </body>
</html>
```

- [ ] **Paso 7: Crear `tests/fixtures/correos/pago-tarjeta-dolares.html`**

```html
<!DOCTYPE html>
<html>
 <head><style>body {background:white;}</style></head>
 <body>
  <table width="600">
   <tr><td><p>Hola Ana Prueba, Realizaste un pago a tu tarjeta de <b>$ 105.52</b> desde tu <b>Cuenta digital.</b> A continuación, te enviamos los datos de tu operación.</p></td></tr>
   <tr><td><p><b>Montos</b></p></td></tr>
   <tr><td><table>
    <tr><td>Monto pagado</td><td><b>$ 105.52</b></td></tr>
    <tr><td>Tipo de cambio</td><td><b>S/ 3.4770</b></td></tr>
    <tr><td>Total cobrado al tipo de cambio</td><td><b>S/ 366.89</b></td></tr>
   </table></td></tr>
   <tr><td><p><b>Datos de la operación</b></p></td></tr>
   <tr><td><table>
    <tr><td>Operación realizada</td><td><b>Pago de tarjeta propia BCP</b></td></tr>
    <tr><td>Fecha y hora</td><td><b>06 de Octubre de 2026 - 01:42 PM</b></td></tr>
    <tr><td>Pagado a</td><td><b>VISA Oro **** 2222</b></td></tr>
    <tr><td>Tipo de pago</td><td><b>Pago total</b></td></tr>
    <tr><td>Desde</td><td><b>Cuenta digital **** 4444</b></td></tr>
    <tr><td>Moneda</td><td><b>Soles</b></td></tr>
    <tr><td>Canal</td><td><b>Banca Móvil BCP</b></td></tr>
    <tr><td>Número de operación</td><td><b>03200001</b><a href="#"></a></td></tr>
   </table></td></tr>
  </table>
 </body>
</html>
```

- [ ] **Paso 8: Crear `tests/fixtures/correos/pago-tarjeta-soles.html`**

```html
<!DOCTYPE html>
<html>
 <head><style>body {background:white;}</style></head>
 <body>
  <table width="600">
   <tr><td><p>Hola Ana Prueba, Realizaste un pago a tu tarjeta de <b>S/ 959.74</b> desde tu <b>Cuenta digital.</b> A continuación, te enviamos los datos de tu operación.</p></td></tr>
   <tr><td><table>
    <tr><td>Monto pagado</td><td><b>S/ 959.74</b></td></tr>
    <tr><td>Tipo de cambio</td><td><b></b></td></tr>
    <tr><td>Total cobrado al tipo de cambio</td><td><b></b></td></tr>
   </table></td></tr>
   <tr><td><table>
    <tr><td>Operación realizada</td><td><b>Pago de tarjeta propia BCP</b></td></tr>
    <tr><td>Pagado a</td><td><b>VISA Oro **** 2222</b></td></tr>
    <tr><td>Desde</td><td><b>Cuenta digital **** 4444</b></td></tr>
    <tr><td>Número de operación</td><td><b>03200002</b></td></tr>
   </table></td></tr>
  </table>
 </body>
</html>
```

- [ ] **Paso 9: Crear `tests/fixtures/correos/pago-servicio.html`**

```html
<!DOCTYPE html>
<html>
 <body>
  <p><b>Hola ANA PRUEBA,</b></p>
  <p>¡Tu operación se realizó con éxito!</p>
  <p>Operación realizada:</p><p><b>Pago de servicios</b></p>
  <p>Número de operación:</p><p><b>03500001</b></p>
  <p>Fecha y hora: <b>Martes, 06 Octubre 2026 - 02:27 P. M.</b> Empresa: <b>CLARO</b> Servicio: <b>02 PAGO POR TELEFONO</b>
   Titular del servicio: <b>ANA*********</b> Código de usuario: <b>900000001</b> Comisión: <b></b>
   Cuenta de origen: <b>Cuenta de ahorros<br>**** 4444<br>ANA PRUEBA</b> Vigencia: <b></b> Valor venta: <b></b> IGV: <b></b>
   Subtotal: <b></b> Monto total: <b>S/ 24.47</b> Tipo de cambio: <b></b> Monto transferido al cambio: <b></b></p>
  <p>Nº 1 Doc. pago: <b>SB02-0000000001</b> Vencimiento: <b>05/10/2026</b> Importe: <b>S/ 24.47</b></p>
 </body>
</html>
```

- [ ] **Paso 10: Crear `tests/fixtures/correos/yape-recibido.html`**

```html
<!DOCTYPE html>
<html>
 <head><style>body {background:white;}</style></head>
 <body>
  <table width="600">
   <tr><td><p>Hola Ana Prueba, Recibiste un yapeo de <b>S/ 200.00</b> de <b>Lopez Prueba Maria Elena</b>. Por tu seguridad te enviamos los datos de tu yapeo.</p></td></tr>
   <tr><td><table>
    <tr><td>Monto recibido</td><td><b>S/ 200.00</b></td></tr>
   </table></td></tr>
   <tr><td><table>
    <tr><td>Operación realizada</td><td><b>Yapeo a celular</b></td></tr>
    <tr><td>Fecha y hora</td><td><b>28 de septiembre de 2026 - 06:40 PM</b></td></tr>
    <tr><td>Enviado por</td><td><b>Lopez Prueba Maria Elena</b></td></tr>
   </table></td></tr>
  </table>
 </body>
</html>
```

- [ ] **Paso 11: Crear `tests/fixtures/correos/consumo-roto.html`** (formato que el lector no entiende)

```html
<!DOCTYPE html>
<html>
 <body>
  <p>Hola <b>Ana Prueba,</b></p>
  <p>Hiciste una compra por <b>S/ 15.00</b> en un comercio con tu tarjeta.</p>
  <table><tr><td>Comercio</td><td><b>BODEGA PRUEBA</b></td></tr></table>
 </body>
</html>
```

- [ ] **Paso 12: Crear `tests/fixtures/correos/estado-cuenta.html`**

```html
<!DOCTYPE html>
<html>
 <body>
  <p>ANA, Conoce a detalle el Estado de Cuenta de tu Tarjeta de Crédito VISA del mes de SEPTIEMBRE.</p>
  <table><tr><td>Pago total del mes:</td><td>959.74</td><td>105.52</td></tr><tr><td>Último día de pago:</td><td>20/10/2026</td></tr></table>
 </body>
</html>
```

- [ ] **Paso 13: Escribir la prueba que falla `tests/lector-bcp.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { ASUNTOS, correo } = require('./correos');

const base = id => ({ fecha: '2026-10-06', ref_externa: 'gmail:' + id });
const leer = (e, archivo, extra) => e.llamar('leerCorreoBcp_', correo(e, archivo, extra));

test('htmlATexto_ quita etiquetas, estilos, comentarios, entidades y caracteres invisibles', () => {
  const e = crearEntorno();
  const html = '<style>p{color:red}</style><!-- x --><p>Hola&nbsp;<b>H&amp;M</b></p><td>(01)​ 311&#8203;-9898 &#x41;</td>';
  assert.strictEqual(e.interno('htmlATexto_', html), 'Hola H&M (01) 311-9898 A');
  assert.strictEqual(e.interno('htmlATexto_', null), '');
});

test('leerMonto_ entiende soles, dólares y miles', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('leerMonto_', 'S/', '1,250.00'), { moneda: 'PEN', monto: 1250 });
  assert.deepStrictEqual(e.llamar('leerMonto_', '$', '23.60'), { moneda: 'USD', monto: 23.6 });
});

test('consumo con débito', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'debito.html', { asunto: ASUNTOS.debito }), {
    crudo: Object.assign({ tipo: 'gasto', monto: 89.3, moneda: 'PEN', comercio: 'TOTTUS PRUEBA SUR', numero_origen: '1111' }, base('debito')),
  });
});

test('consumo con crédito en soles con miles y en dólares', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'credito-soles.html', { asunto: ASUNTOS.credito }).crudo,
    Object.assign({ tipo: 'gasto', monto: 1250, moneda: 'PEN', comercio: 'SAGA FALABELLA PRUEBA', numero_origen: '2222' }, base('credito-soles')));
  assert.deepStrictEqual(leer(e, 'credito-dolares.html', { asunto: ASUNTOS.credito }).crudo,
    Object.assign({ tipo: 'gasto', monto: 23.6, moneda: 'USD', comercio: 'ANTHROPIC* CLAUDE SUB', numero_origen: '2222' }, base('credito-dolares')));
});

test('PLIN: el comercio es la persona, sin el prefijo', () => {
  const e = crearEntorno();
  assert.strictEqual(leer(e, 'plin.html', { asunto: ASUNTOS.debito }).crudo.comercio, 'JUAN PEREZ PRUEB');
});

test('transferencia entre mis cuentas', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'transferencia.html', { asunto: ASUNTOS.transferencia }), {
    crudo: Object.assign({ tipo: 'transferencia', monto: 290.26, moneda: 'PEN', comercio: '', descripcion: 'Transferencia entre mis cuentas', numero_origen: '3333', numero_destino: '4444' }, base('transferencia')),
  });
});

test('pago de tarjeta en dólares trae el tipo de cambio; en soles no', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'pago-tarjeta-dolares.html', { asunto: ASUNTOS.pagoTarjeta }).crudo,
    Object.assign({ tipo: 'transferencia', monto: 105.52, moneda: 'USD', tc: 3.477, actualiza_tc: true, comercio: '', descripcion: 'Pago de tarjeta', numero_origen: '4444', numero_destino: '2222' }, base('pago-tarjeta-dolares')));
  assert.deepStrictEqual(leer(e, 'pago-tarjeta-soles.html', { asunto: ASUNTOS.pagoTarjeta }).crudo,
    Object.assign({ tipo: 'transferencia', monto: 959.74, moneda: 'PEN', comercio: '', descripcion: 'Pago de tarjeta', numero_origen: '4444', numero_destino: '2222' }, base('pago-tarjeta-soles')));
});

test('pago de servicio', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'pago-servicio.html', { asunto: ASUNTOS.servicio }).crudo,
    Object.assign({ tipo: 'gasto', monto: 24.47, moneda: 'PEN', comercio: 'CLARO', numero_origen: '4444' }, base('pago-servicio')));
});

test('yapeo recibido es ingreso de la cuenta de Yape', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'yape-recibido.html', { asunto: ASUNTOS.yapeRecibido }).crudo,
    Object.assign({ tipo: 'ingreso', monto: 200, moneda: 'PEN', comercio: 'Lopez Prueba Maria Elena', usa_yape: true }, base('yape-recibido')));
});

test('operación reconocida pero ilegible → pendiente; otros correos → null', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e, 'consumo-roto.html', { asunto: ASUNTOS.debito }), { pendiente: 'No se pudo leer el consumo.' });
  assert.strictEqual(leer(e, 'estado-cuenta.html', { asunto: ASUNTOS.estadoCuenta, remitente: 'estadodecuenta@notificacionesbcp.com.pe' }), null);
  assert.strictEqual(leer(e, 'debito.html', { asunto: ASUNTOS.comprobante }), null);
  assert.strictEqual(leer(e, 'debito.html', { asunto: ASUNTOS.debito, remitente: 'notificaciones@notificacionesbcp.com.pe.estafa.com' }), null);
});
```

- [ ] **Paso 14: Correr la prueba y verificar que falla**

Run: `npm test`
Expected: FAIL con `htmlATexto_ is not a function` / `leerCorreoBcp_ is not a function`.

- [ ] **Paso 15: Crear `src/parsers/texto.js`**

```js
// Utilidades para leer correos: HTML → texto de una línea y montos.

// Monto con símbolo: "S/ 1,250.00" o "$ 23.60". Grupo 1 = símbolo, grupo 2 = cifra.
const PATRON_MONTO = '(S\\/|\\$)\\s*([\\d,]+\\.\\d{2})';

function htmlATexto_(html) {
  return String(html == null ? '' : html)
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function leerMonto_(simbolo, cifra) {
  return { moneda: simbolo === '$' ? 'USD' : 'PEN', monto: redondear2_(Number(String(cifra).replace(/,/g, ''))) };
}
```

- [ ] **Paso 16: Crear `src/parsers/bcp.js`**

```js
// Lector de los correos de notificaciones@notificacionesbcp.com.pe.
// Devuelve { crudo } si entiende la operación, { pendiente } si es una operación que no
// pudo leer, o null si el correo no es una operación (estados de cuenta, comprobantes…).

const REMITENTE_BCP = 'notificaciones@notificacionesbcp.com.pe';

function leerCorreoBcp_(correo) {
  if (correo.remitente !== REMITENTE_BCP) return null;
  const t = correo.texto;
  const asunto = String(correo.asunto || '');
  const base = { fecha: correo.fecha, ref_externa: 'gmail:' + correo.id };
  if (/Realizaste un consumo con tu Tarjeta/i.test(asunto)) return consumoBcp_(t, base);
  if (/Transferencia Entre mis Cuentas/i.test(asunto)) return transferenciaBcp_(t, base);
  if (/Pago de Tarjeta de Cr[eé]dito Propia/i.test(asunto)) return pagoTarjetaBcp_(t, base);
  if (/PAGO DE SERVICIO/i.test(asunto)) return pagoServicioBcp_(t, base);
  if (/recepci[oó]n de Yapeo/i.test(asunto)) return yapeoRecibidoBcp_(t, base);
  return null;
}

function consumoBcp_(t, base) {
  const monto = new RegExp('Realizaste un consumo de ' + PATRON_MONTO).exec(t);
  const tarjeta = /N[uú]mero de Tarjeta de (?:D[eé]bito|Cr[eé]dito)\s*\*+\s*(\d{4})/i.exec(t);
  const empresa = /Empresa\s+(.+?)\s+N[uú]mero de operaci[oó]n/i.exec(t);
  if (!monto || !tarjeta || !empresa) return { pendiente: 'No se pudo leer el consumo.' };
  let comercio = empresa[1].trim();
  const plin = /^PLIN-(.+)$/i.exec(comercio);
  if (plin) comercio = plin[1].trim();
  return { crudo: Object.assign({ tipo: 'gasto' }, leerMonto_(monto[1], monto[2]), { comercio: comercio, numero_origen: tarjeta[1] }, base) };
}

function transferenciaBcp_(t, base) {
  const monto = new RegExp('Monto transferido\\s+' + PATRON_MONTO).exec(t);
  const destino = /Enviado a\s+[^*]{0,40}?\*{4}\s*(\d{4})/.exec(t);
  const origen = /Desde\s+[^*]{0,40}?\*{4}\s*(\d{4})/.exec(t);
  if (!monto || !destino || !origen) return { pendiente: 'No se pudo leer la transferencia.' };
  return { crudo: Object.assign({ tipo: 'transferencia' }, leerMonto_(monto[1], monto[2]), {
    comercio: '', descripcion: 'Transferencia entre mis cuentas', numero_origen: origen[1], numero_destino: destino[1],
  }, base) };
}

function pagoTarjetaBcp_(t, base) {
  const monto = new RegExp('Monto pagado\\s+' + PATRON_MONTO).exec(t);
  const tc = /Tipo de cambio\s+S\/\s*(\d+\.\d+)/.exec(t);
  const destino = /Pagado a\s+[^*]{0,40}?\*{4}\s*(\d{4})/.exec(t);
  const origen = /Desde\s+[^*]{0,40}?\*{4}\s*(\d{4})/.exec(t);
  if (!monto || !destino || !origen) return { pendiente: 'No se pudo leer el pago de tarjeta.' };
  const crudo = Object.assign({ tipo: 'transferencia' }, leerMonto_(monto[1], monto[2]));
  if (tc && crudo.moneda === 'USD') Object.assign(crudo, { tc: Number(tc[1]), actualiza_tc: true });
  return { crudo: Object.assign(crudo, { comercio: '', descripcion: 'Pago de tarjeta', numero_origen: origen[1], numero_destino: destino[1] }, base) };
}

function pagoServicioBcp_(t, base) {
  const empresa = /Empresa:\s*(.+?)\s+Servicio:/.exec(t);
  const origen = /Cuenta de origen:\s*[^*]{0,40}?\*{4}\s*(\d{4})/.exec(t);
  const monto = new RegExp('Monto total:\\s*' + PATRON_MONTO).exec(t);
  if (!empresa || !origen || !monto) return { pendiente: 'No se pudo leer el pago de servicio.' };
  return { crudo: Object.assign({ tipo: 'gasto' }, leerMonto_(monto[1], monto[2]), { comercio: empresa[1].trim(), numero_origen: origen[1] }, base) };
}

function yapeoRecibidoBcp_(t, base) {
  const m = new RegExp('Recibiste un yapeo de ' + PATRON_MONTO + ' de (.+?)\\.\\s+Por tu seguridad').exec(t);
  if (!m) return { pendiente: 'No se pudo leer el yapeo recibido.' };
  return { crudo: Object.assign({ tipo: 'ingreso' }, leerMonto_(m[1], m[2]), { comercio: m[3].trim(), usa_yape: true }, base) };
}
```

- [ ] **Paso 17: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: todo PASS.

- [ ] **Paso 18: Commit**

```bash
git add src/parsers tests/correos.js tests/lector-bcp.test.js tests/fixtures
git commit -m "feat: lector de correos del BCP con correos de ejemplo anonimizados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lector de Yape y registro de lectores

**Archivos:**
- Crear: `src/parsers/yape.js`, `src/parsers/lectores.js`, `tests/fixtures/correos/yape-enviado.html`, `tests/lector-yape.test.js`

**Interfaces:**
- Consume: `PATRON_MONTO`, `leerMonto_`, `leerCorreoBcp_` (Tarea 2).
- Produce: `REMITENTE_YAPE`, `leerCorreoYape_(correo)`, `REMITENTES_BANCARIOS` (`['notificacionesbcp.com.pe', 'yape.pe']`, para la búsqueda), `lectoresDeCorreo_() → [funciones]`, `leerCorreoBancario_(correo) → {crudo} | {pendiente} | null` (el primer lector que no devuelva null).

- [ ] **Paso 1: Crear `tests/fixtures/correos/yape-enviado.html`**

```html
<!DOCTYPE html>
<html>
 <head><style>@media(min-width:768px){.md_px-4{padding-left:1rem !important}}</style></head>
 <body style="font-family:Arial, sans-serif">
  <table align="center" width="100%"><tbody><tr><td>
   <img alt="Logo Yape" src="https://example.com/logo_yape.png" />
   <p><strong>¡Hola, ANA PRUEBA S.!</strong></p>
   <p><strong>¡Acabas de yapear exitosamente!</strong></p>
  </td></tr></tbody></table>
  <table align="center" width="100%"><tbody><tr><td>
   <p><strong>Monto de yapeo*</strong></p>
   <table><tr><td><table><tr>
    <td style="font-size:1.25rem">S/</td>
    <td style="font-size:50px">11.00</td>
   </tr></table></td></tr></table>
   <table cellSpacing="16px">
    <tr><td>Yapero</td><td>ANA PRUEBA S.</td></tr>
    <tr><td>Tu número de celular</td><td>XXXXXXXXX000</td></tr>
    <tr><td>Fecha y Hora de la operación</td><td>02 octubre 2026 - 07:51 p. m.</td></tr>
    <tr><td>Celular del Beneficiario</td><td>XXXXXXXXX999</td></tr>
    <tr><td>Nombre del Beneficiario</td><td>CARLOS PRUEBA R.</td></tr>
    <tr><td>Nº de operación</td><td>7000001</td></tr>
   </table>
   <p>*Por tu seguridad, te notificaremos por cada <br /> yapeo que realices.</p>
  </td></tr></tbody></table>
 </body>
</html>
```

- [ ] **Paso 2: Escribir la prueba que falla `tests/lector-yape.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { ASUNTOS, correo } = require('./correos');

const YAPE = 'notificaciones@yape.pe';

test('yapeo enviado: gasto de la cuenta de Yape, comercio = beneficiario', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(e.llamar('leerCorreoYape_', correo(e, 'yape-enviado.html', { remitente: YAPE, asunto: ASUNTOS.yape })), {
    crudo: { tipo: 'gasto', monto: 11, moneda: 'PEN', comercio: 'CARLOS PRUEBA R.', usa_yape: true, fecha: '2026-10-06', ref_externa: 'gmail:yape-enviado' },
  });
});

test('Yape: otro remitente o correo sin yapeo → null; yapeo ilegible → pendiente', () => {
  const e = crearEntorno();
  assert.strictEqual(e.llamar('leerCorreoYape_', correo(e, 'yape-enviado.html', { remitente: 'encuestas@postventa.yape.com.pe' })), null);
  assert.strictEqual(e.llamar('leerCorreoYape_', { id: 'x', remitente: YAPE, asunto: 'Encuesta', texto: 'Participa y gana un yapeo de S/40', fecha: '2026-10-06' }), null);
  assert.deepStrictEqual(e.llamar('leerCorreoYape_', { id: 'x', remitente: YAPE, asunto: ASUNTOS.yape, texto: '¡Acabas de yapear exitosamente! sin datos', fecha: '2026-10-06' }), { pendiente: 'No se pudo leer el yapeo.' });
});

test('leerCorreoBancario_ usa el primer lector que reconoce el correo', () => {
  const e = crearEntorno();
  assert.strictEqual(e.llamar('leerCorreoBancario_', correo(e, 'yape-enviado.html', { remitente: YAPE, asunto: ASUNTOS.yape })).crudo.comercio, 'CARLOS PRUEBA R.');
  assert.strictEqual(e.llamar('leerCorreoBancario_', correo(e, 'debito.html', { asunto: ASUNTOS.debito })).crudo.comercio, 'TOTTUS PRUEBA SUR');
  assert.strictEqual(e.llamar('leerCorreoBancario_', correo(e, 'debito.html', { remitente: 'otro@banco.com', asunto: ASUNTOS.debito })), null);
  assert.deepStrictEqual(e.llamar('remitentesBancarios_'), ['notificacionesbcp.com.pe', 'yape.pe']);
});
```

- [ ] **Paso 3: Correr la prueba y verificar que falla**

Run: `npm test`
Expected: FAIL con `leerCorreoYape_ is not a function`.

- [ ] **Paso 4: Crear `src/parsers/yape.js`**

```js
// Lector de los correos de notificaciones@yape.pe (yapeos enviados).
// Los yapeos recibidos llegan del BCP y los lee bcp.js.

const REMITENTE_YAPE = 'notificaciones@yape.pe';

function leerCorreoYape_(correo) {
  if (correo.remitente !== REMITENTE_YAPE) return null;
  const t = correo.texto;
  if (!/Acabas de yapear/i.test(t)) return null; // encuestas, publicidad
  const monto = new RegExp('Monto de yapeo\\*?\\s+' + PATRON_MONTO).exec(t);
  const nombre = /Nombre del Beneficiario\s+(.+?)\s+N[º°o]\.? de operaci[oó]n/i.exec(t);
  if (!monto || !nombre) return { pendiente: 'No se pudo leer el yapeo.' };
  return { crudo: Object.assign({ tipo: 'gasto' }, leerMonto_(monto[1], monto[2]), {
    comercio: nombre[1].trim(), usa_yape: true, fecha: correo.fecha, ref_externa: 'gmail:' + correo.id,
  }) };
}
```

- [ ] **Paso 5: Crear `src/parsers/lectores.js`**

```js
// Registro de lectores de correo. Para agregar un banco: crear su lector en
// src/parsers/, sumarlo aquí y su dominio en REMITENTES_BANCARIOS (ver docs/agregar-un-banco.md).

// Dominios de remitente que se buscan en Gmail (cada lector verifica el remitente exacto).
const REMITENTES_BANCARIOS = ['notificacionesbcp.com.pe', 'yape.pe'];

function remitentesBancarios_() {
  return REMITENTES_BANCARIOS;
}

function lectoresDeCorreo_() {
  return [leerCorreoBcp_, leerCorreoYape_];
}

function leerCorreoBancario_(correo) {
  const lectores = lectoresDeCorreo_();
  for (let i = 0; i < lectores.length; i++) {
    const r = lectores[i](correo);
    if (r) return r;
  }
  return null;
}
```

- [ ] **Paso 6: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: todo PASS.

- [ ] **Paso 7: Commit**

```bash
git add src/parsers tests/lector-yape.test.js tests/fixtures/correos/yape-enviado.html
git commit -m "feat: lector de Yape y registro de lectores de correo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Del correo al movimiento — cuenta por número, Yape, reglas y tipo de cambio

**Archivos:**
- Crear: `src/ingesta/resolver.js`, `tests/resolver.test.js`

**Interfaces:**
- Consume: `numerosDe_` (Tarea 1), `normalizarTexto_`, `redondear2_`.
- Produce: `reglaPara_(comercio, reglas) → regla | null` (el `patron` normalizado contenido en el comercio normalizado; gana el patrón más largo); `resolverMovimiento_(crudo, ctx) → movimiento` con `ctx = {cuentas, categorias, reglas, tcUsd}`. El movimiento tiene todas las columnas de Movimientos excepto `id` y `creado_en`, más `regla_id` (`''` si no hubo regla; no es columna, `agregarFilas_` la ignora). `estado = 'confirmado'` solo si hay cuenta (y destino en transferencias), tipo de cambio y, para gasto/ingreso, categoría por regla; si no, `'por_revisar'`. Sin tipo de cambio: `tc = 0`, `monto_pen = 0`, `descripcion = 'Falta el tipo de cambio de USD'`.

- [ ] **Paso 1: Escribir la prueba que falla `tests/resolver.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

const CTX = {
  cuentas: [
    { id: 'deb', nombre: 'Débito', numeros: '4444, 1111', yape: true, activa: true },
    { id: 'aho', nombre: 'Ahorro', numeros: '3333', yape: false, activa: true },
    { id: 'visa', nombre: 'VISA', numeros: '2222', yape: false, activa: true },
    { id: 'vieja', nombre: 'Vieja', numeros: '9999', yape: false, activa: false },
  ],
  categorias: [
    { id: 'super', tipo: 'gasto', activa: true },
    { id: 'taxi', tipo: 'gasto', activa: true },
    { id: 'sueldo', tipo: 'ingreso', activa: true },
    { id: 'apagada', tipo: 'gasto', activa: false },
  ],
  reglas: [
    { id: 'r1', patron: 'TOTTUS', categoria_id: 'super' },
    { id: 'r2', patron: 'TOTTUS PRUEBA', categoria_id: 'taxi' },
    { id: 'r3', patron: 'APAGADA', categoria_id: 'apagada' },
    { id: 'r4', patron: 'EMPRESA', categoria_id: 'super' },
  ],
  tcUsd: 3.75,
};
const crudo = c => Object.assign({ tipo: 'gasto', monto: 89.3, moneda: 'PEN', comercio: 'Tottus Prueba Sur', numero_origen: '1111', fecha: '2026-10-06', ref_externa: 'gmail:x' }, c);
const resolver = (e, c, ctx) => e.llamar('resolverMovimiento_', crudo(c), Object.assign({}, CTX, ctx));

test('gasto con cuenta por número y regla (gana la más larga) → confirmado', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(resolver(e, {}), {
    fecha: '2026-10-06', tipo: 'gasto', monto: 89.3, moneda: 'PEN', tc: 1, monto_pen: 89.3,
    cuenta_id: 'deb', cuenta_destino_id: '', categoria_id: 'taxi', comercio: 'Tottus Prueba Sur', descripcion: '',
    origen: 'gmail', estado: 'confirmado', ref_externa: 'gmail:x', dividido: false, regla_id: 'r2',
  });
});

test('sin regla, o con regla a categoría desactivada o de otro tipo → por revisar', () => {
  const e = crearEntorno();
  const sinRegla = resolver(e, { comercio: 'CLARO' });
  assert.strictEqual(sinRegla.estado, 'por_revisar');
  assert.strictEqual(sinRegla.categoria_id, '');
  assert.strictEqual(sinRegla.regla_id, '');
  assert.strictEqual(resolver(e, { comercio: 'APAGADA SAC' }).estado, 'por_revisar');
  const ingreso = resolver(e, { tipo: 'ingreso', comercio: 'EMPRESA DEMO' });
  assert.strictEqual(ingreso.categoria_id, '');
  assert.strictEqual(ingreso.estado, 'por_revisar');
});

test('Yape va a la cuenta marcada; números desconocidos o de cuentas desactivadas quedan sin cuenta', () => {
  const e = crearEntorno();
  assert.strictEqual(resolver(e, { usa_yape: true, numero_origen: undefined }).cuenta_id, 'deb');
  const desconocido = resolver(e, { numero_origen: '7777' });
  assert.strictEqual(desconocido.cuenta_id, '');
  assert.strictEqual(desconocido.estado, 'por_revisar');
  assert.strictEqual(resolver(e, { numero_origen: '9999' }).cuenta_id, '');
  assert.strictEqual(resolver(e, { usa_yape: true }, { cuentas: CTX.cuentas.map(c => Object.assign({}, c, { yape: false })) }).cuenta_id, '');
});

test('transferencia: confirmada con ambas cuentas; sin destino queda por revisar', () => {
  const e = crearEntorno();
  const t = resolver(e, { tipo: 'transferencia', comercio: '', descripcion: 'Transferencia entre mis cuentas', numero_origen: '3333', numero_destino: '4444', monto: 290.26 });
  assert.strictEqual(t.cuenta_id, 'aho');
  assert.strictEqual(t.cuenta_destino_id, 'deb');
  assert.strictEqual(t.estado, 'confirmado');
  assert.strictEqual(t.descripcion, 'Transferencia entre mis cuentas');
  assert.strictEqual(resolver(e, { tipo: 'transferencia', numero_origen: '3333', numero_destino: '5555' }).estado, 'por_revisar');
});

test('dólares: usa el tc del correo, si no el último conocido, y si no hay queda por revisar', () => {
  const e = crearEntorno();
  assert.strictEqual(resolver(e, { moneda: 'USD', monto: 23.6 }).monto_pen, 88.5);
  assert.strictEqual(resolver(e, { moneda: 'USD', monto: 105.52, tc: 3.477 }).monto_pen, 366.89);
  const sinTc = resolver(e, { moneda: 'USD', monto: 23.6 }, { tcUsd: 0 });
  assert.strictEqual(sinTc.tc, 0);
  assert.strictEqual(sinTc.monto_pen, 0);
  assert.strictEqual(sinTc.estado, 'por_revisar');
  assert.strictEqual(sinTc.descripcion, 'Falta el tipo de cambio de USD');
});

test('reglaPara_ compara sin tildes ni mayúsculas', () => {
  const e = crearEntorno();
  assert.strictEqual(e.llamar('reglaPara_', 'tóttus plaza', [{ id: 'a', patron: 'TOTTUS' }]).id, 'a');
  assert.strictEqual(e.llamar('reglaPara_', '', [{ id: 'a', patron: 'TOTTUS' }]), null);
  assert.strictEqual(e.llamar('reglaPara_', 'METRO', [{ id: 'a', patron: 'TOTTUS' }]), null);
});
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Run: `npm test`
Expected: FAIL con `resolverMovimiento_ is not a function`.

- [ ] **Paso 3: Crear `src/ingesta/resolver.js`**

```js
// Convierte un movimiento crudo (de un lector de correo) en un movimiento listo para
// guardar: cuenta por número o por Yape, categoría por regla y monto en soles.

// La regla cuyo patrón está contenido en el comercio; si varias, la del patrón más largo.
function reglaPara_(comercio, reglas) {
  const texto = normalizarTexto_(comercio);
  if (!texto) return null;
  return reglas
    .filter(r => r.patron && texto.indexOf(normalizarTexto_(r.patron)) >= 0)
    .sort((a, b) => normalizarTexto_(b.patron).length - normalizarTexto_(a.patron).length)[0] || null;
}

// ctx = { cuentas, categorias, reglas, tcUsd }
function resolverMovimiento_(crudo, ctx) {
  const activas = ctx.cuentas.filter(c => c.activa);
  const porNumero = n => (n ? activas.filter(c => numerosDe_(c).indexOf(n) >= 0)[0] || null : null);
  const origen = crudo.usa_yape ? activas.filter(c => c.yape)[0] || null : porNumero(crudo.numero_origen);
  const destino = crudo.tipo === 'transferencia' ? porNumero(crudo.numero_destino) : null;
  const tc = crudo.moneda === 'PEN' ? 1 : Number(crudo.tc || ctx.tcUsd) || 0;
  const mov = {
    fecha: crudo.fecha, tipo: crudo.tipo, monto: crudo.monto, moneda: crudo.moneda, tc: tc,
    monto_pen: redondear2_(crudo.monto * tc), cuenta_id: origen ? origen.id : '',
    cuenta_destino_id: destino ? destino.id : '', categoria_id: '', comercio: crudo.comercio || '',
    descripcion: crudo.descripcion || '', origen: 'gmail', estado: 'por_revisar',
    ref_externa: crudo.ref_externa, dividido: false, regla_id: '',
  };
  let completo = !!origen && tc > 0;
  if (crudo.tipo === 'transferencia') {
    completo = completo && !!destino;
  } else {
    const regla = reglaPara_(mov.comercio, ctx.reglas);
    const categoria = regla ? ctx.categorias.filter(c => c.id === regla.categoria_id && c.activa && c.tipo === crudo.tipo)[0] : null;
    if (categoria) {
      mov.categoria_id = categoria.id;
      mov.regla_id = regla.id;
    } else {
      completo = false;
    }
  }
  if (!tc) mov.descripcion = 'Falta el tipo de cambio de ' + crudo.moneda;
  if (completo) mov.estado = 'confirmado';
  return mov;
}
```

- [ ] **Paso 4: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: todo PASS.

- [ ] **Paso 5: Commit**

```bash
git add src/ingesta/resolver.js tests/resolver.test.js
git commit -m "feat: asignar cuenta, categoría y tipo de cambio a los movimientos de correo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Lectura de Gmail — adaptador, vuelta de lectura, pendientes y etiqueta

**Archivos:**
- Modificar: `tests/harness.js`, `src/appsscript.json`
- Crear: `src/ingesta/gmail.js`, `src/ingesta/revisar.js`, `tests/ingesta.test.js`

**Interfaces:**
- Consume: `leerCorreoBancario_`, `REMITENTES_BANCARIOS` (Tarea 3), `resolverMovimiento_` (Tarea 4), `migrarSiHaceFalta_`, `registrarLog_` (Tarea 1), `htmlATexto_` (Tarea 2).
- Produce (Gmail): `ETIQUETA_PROCESADO = 'Finanzas/Procesado'`, `buscarIdsCorreos_(desdeMs) → ids del más antiguo al más nuevo`, `leerCorreo_(id) → {id, remitente, asunto, texto, fecha}`, `etiquetarCorreo_(id)`.
- Produce (ingesta): `revisarCorreos() → {leidos, creados, porRevisar, pendientes, ignorados, restantes, etiquetados}` o `{omitida: true, mensaje}`; `recordarIgnorados_(ids)`; `idsConocidos_() → {id: true}`; `MAX_CORREOS_POR_VUELTA = 50`.
- Config que escribe: `ultima_revision` (`yyyy-MM-dd HH:mm:ss`), `ultima_revision_info` (texto), `cursor_lectura` (ms), `ultimo_tc` (si un pago de tarjeta en dólares trae otro).
- Arnés: `crearEntorno({correos: [{id, de, asunto, html, recibido}], lockOcupado, gmailFalla, etiquetaFalla})`; el entorno expone `gmail` (`_etiquetas`, `_etiquetasDe`), `triggers` y `stats.gmailList`, `stats.gmailGet`.

- [ ] **Paso 1: Ampliar `tests/harness.js`**

Agregar antes de `function crearEntorno(`:

```js
// Gmail simulado (servicio avanzado Gmail v1). correos = [{ id, de, asunto, html, recibido }]
function crearGmail(correos, stats, opciones) {
  const etiquetas = [];
  const etiquetasDe = {};
  const b64 = s => Buffer.from(s, 'utf8').toString('base64url');
  return {
    _etiquetas: etiquetas,
    _etiquetasDe: etiquetasDe,
    Users: {
      Messages: {
        list: (usuario, o) => {
          if (opciones.gmailFalla) throw new Error(opciones.gmailFalla);
          stats.gmailList++;
          const despues = Number((/after:(\d+)/.exec(o.q) || [])[1] || 0) * 1000;
          const dominios = ((/from:\(([^)]*)\)/.exec(o.q) || [])[1] || '').split(' OR ').filter(Boolean);
          const todos = correos
            .filter(c => new Date(c.recibido).getTime() >= despues && dominios.some(d => c.de.indexOf(d) >= 0))
            .sort((a, b) => new Date(b.recibido) - new Date(a.recibido));
          const desde = Number(o.pageToken || 0);
          const r = { messages: todos.slice(desde, desde + o.maxResults).map(c => ({ id: c.id, threadId: c.id })) };
          if (desde + o.maxResults < todos.length) r.nextPageToken = String(desde + o.maxResults);
          return r;
        },
        get: (usuario, id) => {
          stats.gmailGet++;
          const c = correos.filter(x => x.id === id)[0];
          return {
            id: id,
            internalDate: String(new Date(c.recibido).getTime()),
            payload: {
              mimeType: 'multipart/alternative',
              headers: [{ name: 'From', value: 'Notificaciones <' + c.de + '>' }, { name: 'Subject', value: c.asunto }],
              parts: [
                { mimeType: 'text/plain', body: { data: b64('versión de texto plano') } },
                { mimeType: 'text/html', body: { data: b64(c.html) } },
              ],
            },
          };
        },
        modify: (recurso, usuario, id) => {
          if (opciones.etiquetaFalla) throw new Error('No se pudo etiquetar');
          recurso.addLabelIds.forEach(l => {
            if (!etiquetas.some(x => x.id === l)) throw new Error('Etiqueta inexistente ' + l);
          });
          (etiquetasDe[id] = etiquetasDe[id] || []).push(...recurso.addLabelIds);
          return {};
        },
      },
      Labels: {
        list: () => ({ labels: etiquetas.slice() }),
        create: recurso => {
          const l = { id: 'Label_' + (etiquetas.length + 1), name: recurso.name };
          etiquetas.push(l);
          return l;
        },
      },
    },
  };
}

// ScriptApp simulado: solo triggers de tiempo.
function crearScriptApp(triggers) {
  return {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger: funcion => ({
      timeBased: () => {
        const t = { funcion: funcion, cada: null, getHandlerFunction: () => funcion };
        const b = {
          everyMinutes: n => {
            if ([1, 5, 10, 15, 30].indexOf(n) < 0) throw new Error('Intervalo de minutos inválido: ' + n);
            t.cada = n + ' min';
            return b;
          },
          everyHours: n => { t.cada = n + ' h'; return b; },
          create: () => { triggers.push(t); return t; },
        };
        return b;
      },
    }),
  };
}
```

Dentro de `crearEntorno`, reemplazar `const stats = { locks: 0, aperturas: 0 };` por:

```js
  const stats = { locks: 0, aperturas: 0, gmailList: 0, gmailGet: 0 };
  const gmail = crearGmail(opciones.correos || [], stats, opciones);
  const triggers = [];
```

En el objeto del contexto, reemplazar la línea de `LockService` por:

```js
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { stats.locks++; },
        tryLock: () => { stats.locks++; return !opciones.lockOcupado; },
        releaseLock() {},
      }),
    },
    Gmail: gmail,
    ScriptApp: crearScriptApp(triggers),
```

y en `Utilities` agregar:

```js
      base64DecodeWebSafe: s => Array.from(Buffer.from(s, 'base64url')),
      newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
```

En el `return` de `crearEntorno` agregar `gmail, triggers,` junto a `principal, libros, propiedades, stats,`.

- [ ] **Paso 2: Escribir la prueba que falla `tests/ingesta.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');
const { ASUNTOS, html } = require('./correos');

const BCP = 'notificaciones@notificacionesbcp.com.pe';
const YAPE = 'notificaciones@yape.pe';
const correoGmail = (id, archivo, asunto, recibido, de) => ({ id, de: de || BCP, asunto, html: html(archivo), recibido });

function correosBase() {
  return [
    correoGmail('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00'),
    correoGmail('g2', 'credito-dolares.html', ASUNTOS.credito, '2026-10-07T10:00:00'),
    correoGmail('g3', 'yape-enviado.html', ASUNTOS.yape, '2026-10-08T19:51:00', YAPE),
    correoGmail('g4', 'transferencia.html', ASUNTOS.transferencia, '2026-10-09T17:58:00'),
    correoGmail('g5', 'pago-tarjeta-dolares.html', ASUNTOS.pagoTarjeta, '2026-10-10T13:42:00'),
    correoGmail('g6', 'consumo-roto.html', ASUNTOS.debito, '2026-10-11T09:00:00'),
    correoGmail('g7', 'estado-cuenta.html', ASUNTOS.estadoCuenta, '2026-10-11T10:00:00', 'estadodecuenta@notificacionesbcp.com.pe'),
    correoGmail('g8', 'debito.html', ASUNTOS.debito, '2026-09-20T10:00:00'),
  ];
}

// Cuentas con los números ficticios de los correos de ejemplo.
function entornoConCorreos(correos, opciones) {
  const e = entornoInstalado(Object.assign({ correos: correos || correosBase() }, opciones));
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', moneda: 'PEN', saldo_inicial: 1000, numeros: '4444, 1111', yape: true });
  e.llamar('guardarCuenta', { id: e.cuenta('VISA BCP'), nombre: 'VISA BCP', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -200, numeros: '2222' });
  e.llamar('guardarCuenta', { nombre: 'Ahorro BCP', banco: 'BCP', tipo: 'ahorro', moneda: 'PEN', saldo_inicial: 3000, numeros: '3333' });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.movDe = gid => e.filas('Movimientos').find(m => m.ref_externa === 'gmail:' + gid);
  return e;
}

test('revisarCorreos importa desde importar_desde: movimientos, pendientes e ignorados', () => {
  const e = entornoConCorreos();
  const r = e.llamar('revisarCorreos');
  assert.deepStrictEqual(r, { leidos: 7, creados: 5, porRevisar: 3, pendientes: 1, ignorados: 1, restantes: 0, etiquetados: 6 });
  assert.strictEqual(e.movDe('g8'), undefined, 'antes de importar_desde');
  const g1 = e.movDe('g1');
  assert.strictEqual(g1.cuenta_id, e.cuenta('Débito BCP'));
  assert.strictEqual(g1.estado, 'por_revisar');
  assert.strictEqual(g1.fecha, '2026-10-06');
  assert.strictEqual(g1.origen, 'gmail');
  assert.strictEqual(e.movDe('g2').monto_pen, 88.5, 'usa el tc conocido antes del pago');
  assert.strictEqual(e.movDe('g3').cuenta_id, e.cuenta('Débito BCP'), 'Yape');
  const g4 = e.movDe('g4');
  assert.strictEqual(g4.tipo, 'transferencia');
  assert.strictEqual(g4.cuenta_id, e.cuenta('Ahorro BCP'));
  assert.strictEqual(g4.estado, 'confirmado');
  const g5 = e.movDe('g5');
  assert.strictEqual(g5.cuenta_destino_id, e.cuenta('VISA BCP'));
  assert.strictEqual(g5.monto_pen, 366.89);
  assert.strictEqual(e.llamar('leerConfig_').ultimo_tc, '3.477');
  const pend = e.filas('Pendientes');
  assert.strictEqual(pend.length, 1);
  assert.strictEqual(pend[0].gmail_id, 'g6');
  assert.strictEqual(pend[0].estado, 'pendiente');
  assert.strictEqual(pend[0].asunto, ASUNTOS.debito);
  const config = e.llamar('leerConfig_');
  assert.strictEqual(config.ultima_revision, '2026-10-13 10:00:00');
  assert.match(config.ultima_revision_info, /^7 correos · 5 movimientos · 3 por revisar · 1 no leído/);
  assert.strictEqual(Number(config.cursor_lectura), new Date('2026-10-13T08:00:00').getTime());
});

test('una regla existente confirma y categoriza, y suma un uso', () => {
  const e = entornoConCorreos();
  const sup = e.categoria('Supermercado');
  e.interno('agregarFilas_', 'Reglas', [{ id: 'r1', patron: 'TOTTUS', categoria_id: sup, cuenta_id: '', creada_por: 'usuario', usos: 0 }]);
  e.llamar('revisarCorreos');
  assert.strictEqual(e.movDe('g1').categoria_id, sup);
  assert.strictEqual(e.movDe('g1').estado, 'confirmado');
  assert.strictEqual(e.filas('Reglas')[0].usos, 1);
});

test('no duplica ni vuelve a descargar correos ya vistos', () => {
  const e = entornoConCorreos();
  e.llamar('revisarCorreos');
  const descargas = e.stats.gmailGet;
  const filas = e.filas('Movimientos').length;
  e.interno('guardarConfig_', { cursor_lectura: 0 });
  assert.strictEqual(e.llamar('revisarCorreos').leidos, 0);
  assert.strictEqual(e.stats.gmailGet, descargas);
  assert.strictEqual(e.filas('Movimientos').length, filas);
});

test('lee en tandas de 50 y solo avanza el cursor al terminar', () => {
  const muchos = Array.from({ length: 60 }, (_, i) => correoGmail('x' + (i + 1), 'debito.html', ASUNTOS.debito, new Date(2026, 9, 2, 8, i).toISOString()));
  const e = entornoConCorreos(muchos);
  const r1 = e.llamar('revisarCorreos');
  assert.strictEqual(r1.leidos, 50);
  assert.strictEqual(r1.restantes, 10);
  assert.strictEqual(e.llamar('leerConfig_').cursor_lectura, undefined);
  const r2 = e.llamar('revisarCorreos');
  assert.strictEqual(r2.leidos, 10);
  assert.strictEqual(r2.restantes, 0);
  assert.ok(e.llamar('leerConfig_').cursor_lectura);
  assert.strictEqual(e.filas('Movimientos').length, 60);
});

test('etiqueta en Gmail los correos con movimiento o pendiente; se puede apagar; si falla no se pierde nada', () => {
  const e = entornoConCorreos();
  e.llamar('revisarCorreos');
  assert.deepStrictEqual(e.gmail._etiquetas.map(l => l.name), ['Finanzas/Procesado']);
  assert.deepStrictEqual(e.gmail._etiquetasDe.g1, ['Label_1']);
  assert.deepStrictEqual(e.gmail._etiquetasDe.g6, ['Label_1']);
  assert.strictEqual(e.gmail._etiquetasDe.g7, undefined, 'el ignorado no se etiqueta');

  const sin = entornoConCorreos();
  sin.interno('guardarConfig_', { etiquetar: 'no' });
  assert.strictEqual(sin.llamar('revisarCorreos').etiquetados, 0);
  assert.deepStrictEqual(sin.gmail._etiquetasDe, {});

  const falla = entornoConCorreos(null, { etiquetaFalla: true });
  const r = falla.llamar('revisarCorreos');
  assert.strictEqual(r.creados, 5);
  assert.strictEqual(r.etiquetados, 0);
  assert.ok(falla.filas('Log').some(l => l.nivel === 'aviso' && l.origen === 'etiquetar'));
});

test('ignora remitentes que imitan al banco', () => {
  const e = entornoConCorreos([correoGmail('f1', 'debito.html', ASUNTOS.debito, '2026-10-05T10:00:00', 'notificaciones@notificacionesbcp.com.pe.estafa.com')]);
  const r = e.llamar('revisarCorreos');
  assert.strictEqual(r.creados, 0);
  assert.strictEqual(r.ignorados, 1);
});

test('si otra revisión está en curso, se salta', () => {
  const e = entornoConCorreos(null, { lockOcupado: true });
  assert.deepStrictEqual(e.llamar('revisarCorreos'), { omitida: true, mensaje: 'Ya hay una revisión en curso.' });
  assert.strictEqual(e.filas('Movimientos').length, 0);
});

test('un error de Gmail queda en el Log y en la info de la última revisión', () => {
  const e = entornoConCorreos(null, { gmailFalla: 'Cuota excedida' });
  assert.throws(() => e.interno('revisarCorreos'), /Cuota excedida/);
  assert.ok(e.filas('Log').some(l => l.nivel === 'error' && l.mensaje === 'Cuota excedida'));
  assert.strictEqual(e.llamar('leerConfig_').ultima_revision_info, 'Error: Cuota excedida');
});
```

- [ ] **Paso 3: Correr la prueba y verificar que falla**

Run: `npm test`
Expected: FAIL con `revisarCorreos is not a function`.

- [ ] **Paso 4: Crear `src/ingesta/gmail.js`**

```js
// Única capa que toca Gmail (servicio avanzado Gmail API v1, permiso gmail.modify).
// La app solo busca, lee y agrega una etiqueta; nunca borra ni envía correos.

const ETIQUETA_PROCESADO = 'Finanzas/Procesado';

// Ids de correos bancarios recibidos desde `desdeMs`, del más antiguo al más nuevo.
function buscarIdsCorreos_(desdeMs) {
  const consulta = 'from:(' + REMITENTES_BANCARIOS.join(' OR ') + ') after:' + Math.floor(desdeMs / 1000);
  const ids = [];
  let pagina;
  do {
    const r = Gmail.Users.Messages.list('me', { q: consulta, maxResults: 500, pageToken: pagina });
    (r.messages || []).forEach(m => ids.push(m.id));
    pagina = r.nextPageToken;
  } while (pagina && ids.length < 2000);
  return ids.reverse();
}

function leerCorreo_(id) {
  const m = Gmail.Users.Messages.get('me', id, { format: 'full' });
  const cabecera = nombre => (((m.payload && m.payload.headers) || []).filter(h => h.name.toLowerCase() === nombre)[0] || {}).value || '';
  const de = cabecera('from');
  const direccion = /<([^>]+)>/.exec(de);
  return {
    id: id,
    remitente: (direccion ? direccion[1] : de).trim().toLowerCase(),
    asunto: cabecera('subject'),
    texto: htmlATexto_(buscarParte_(m.payload, 'text/html') || buscarParte_(m.payload, 'text/plain')),
    fecha: formatearFecha_(new Date(Number(m.internalDate))),
  };
}

function buscarParte_(parte, tipo) {
  if (!parte) return '';
  if (parte.mimeType === tipo && parte.body && parte.body.data) {
    return Utilities.newBlob(Utilities.base64DecodeWebSafe(parte.body.data)).getDataAsString('UTF-8');
  }
  const hijos = parte.parts || [];
  for (let i = 0; i < hijos.length; i++) {
    const encontrado = buscarParte_(hijos[i], tipo);
    if (encontrado) return encontrado;
  }
  return '';
}

function etiquetarCorreo_(id) {
  try {
    Gmail.Users.Messages.modify({ addLabelIds: [idEtiqueta_()] }, 'me', id);
  } catch {
    // La etiqueta guardada pudo ser borrada en Gmail: se vuelve a buscar o crear una vez.
    PropertiesService.getScriptProperties().deleteProperty('ETIQUETA_ID');
    Gmail.Users.Messages.modify({ addLabelIds: [idEtiqueta_()] }, 'me', id);
  }
}

function idEtiqueta_() {
  const props = PropertiesService.getScriptProperties();
  const guardada = props.getProperty('ETIQUETA_ID');
  if (guardada) return guardada;
  const existente = (Gmail.Users.Labels.list('me').labels || []).filter(l => l.name === ETIQUETA_PROCESADO)[0];
  const etiqueta = existente || Gmail.Users.Labels.create({ name: ETIQUETA_PROCESADO, labelListVisibility: 'labelShow', messageListVisibility: 'show' }, 'me');
  props.setProperty('ETIQUETA_ID', etiqueta.id);
  return etiqueta.id;
}
```

- [ ] **Paso 5: Crear `src/ingesta/revisar.js`**

```js
// Vuelta de lectura de correos: la ejecuta el trigger y el botón "Revisar ahora".

const MAX_CORREOS_POR_VUELTA = 50;
const MARGEN_CURSOR_MS = 7200000; // 2 horas: correos que Gmail entrega con demora
const MAX_IGNORADOS = 400; // límite de tamaño de una propiedad del script (~9 KB)

function revisarCorreos() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { omitida: true, mensaje: 'Ya hay una revisión en curso.' };
  const inicio = Date.now();
  try {
    migrarSiHaceFalta_();
    const r = revisarCorreosSinBloqueo_(inicio);
    guardarConfig_({
      ultima_revision: formatearFecha_(new Date(inicio), 'yyyy-MM-dd HH:mm:ss'),
      ultima_revision_info: describirRevision_(r, Date.now() - inicio),
    });
    return r;
  } catch (e) {
    registrarLog_('error', 'revisarCorreos', e.message, e.stack);
    try { guardarConfig_({ ultima_revision_info: 'Error: ' + e.message }); } catch { /* ya está en el Log */ }
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function revisarCorreosSinBloqueo_(ahoraMs) {
  const config = leerConfig_();
  const desde = Math.max(inicioDelDia_(config.importar_desde || hoyIso_()), Number(config.cursor_lectura) || 0);
  const conocidos = idsConocidos_();
  const nuevos = buscarIdsCorreos_(desde).filter(id => !conocidos[id]);
  const tanda = nuevos.slice(0, MAX_CORREOS_POR_VUELTA);
  const ctx = {
    cuentas: leerTabla_('Cuentas'), categorias: leerTabla_('Categorias'), reglas: leerTabla_('Reglas'),
    tcUsd: Number(config.ultimo_tc) || 0,
  };
  const movimientos = [];
  const pendientes = [];
  const ignorados = [];
  const aEtiquetar = [];
  tanda.forEach(id => {
    const correo = leerCorreo_(id);
    const leido = leerCorreoBancario_(correo);
    if (!leido) {
      ignorados.push(id);
      return;
    }
    aEtiquetar.push(id);
    if (leido.pendiente) {
      pendientes.push({
        id: nuevoId_(), gmail_id: id, fecha: correo.fecha, remitente: correo.remitente,
        asunto: correo.asunto, resumen: correo.texto.slice(0, 300), estado: 'pendiente',
      });
      return;
    }
    if (leido.crudo.actualiza_tc) ctx.tcUsd = leido.crudo.tc;
    movimientos.push(Object.assign({ id: nuevoId_() }, resolverMovimiento_(leido.crudo, ctx), {
      creado_en: formatearFecha_(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    }));
  });
  agregarFilas_('Movimientos', movimientos);
  agregarFilas_('Pendientes', pendientes);
  recordarIgnorados_(ignorados);
  contarUsosReglas_(movimientos, ctx.reglas);
  const cambios = {};
  if (ctx.tcUsd !== (Number(config.ultimo_tc) || 0)) cambios.ultimo_tc = ctx.tcUsd;
  if (nuevos.length <= MAX_CORREOS_POR_VUELTA) cambios.cursor_lectura = ahoraMs - MARGEN_CURSOR_MS;
  guardarConfig_(cambios);
  let etiquetados = 0;
  if (config.etiquetar !== 'no') {
    aEtiquetar.forEach(id => {
      try {
        etiquetarCorreo_(id);
        etiquetados++;
      } catch (e) {
        registrarLog_('aviso', 'etiquetar', e.message, id);
      }
    });
  }
  return {
    leidos: tanda.length, creados: movimientos.length,
    porRevisar: movimientos.filter(m => m.estado === 'por_revisar').length,
    pendientes: pendientes.length, ignorados: ignorados.length,
    restantes: nuevos.length - tanda.length, etiquetados: etiquetados,
  };
}

function inicioDelDia_(fechaIso) {
  const p = String(fechaIso).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]).getTime();
}

function idsConocidos_() {
  const conocidos = {};
  leerTabla_('Movimientos').forEach(m => {
    if (m.ref_externa.indexOf('gmail:') === 0) conocidos[m.ref_externa.slice(6)] = true;
  });
  leerTabla_('Pendientes').forEach(p => { conocidos[p.gmail_id] = true; });
  idsIgnorados_().forEach(id => { conocidos[id] = true; });
  return conocidos;
}

function idsIgnorados_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('CORREOS_IGNORADOS') || '[]');
}

// Correos leídos que no son operaciones (o movimientos importados que el usuario borró).
function recordarIgnorados_(ids) {
  if (!ids.length) return;
  const todos = idsIgnorados_().concat(ids).slice(-MAX_IGNORADOS);
  PropertiesService.getScriptProperties().setProperty('CORREOS_IGNORADOS', JSON.stringify(todos));
}

function contarUsosReglas_(movimientos, reglas) {
  const usos = {};
  movimientos.forEach(m => { if (m.regla_id) usos[m.regla_id] = (usos[m.regla_id] || 0) + 1; });
  Object.keys(usos).forEach(id => {
    const regla = reglas.filter(r => r.id === id)[0];
    actualizarFila_('Reglas', id, { usos: (Number(regla.usos) || 0) + usos[id] });
  });
}

function describirRevision_(r, ms) {
  const partes = [r.leidos + ' correos', r.creados + ' movimientos'];
  if (r.porRevisar) partes.push(r.porRevisar + ' por revisar');
  if (r.pendientes) partes.push(r.pendientes + (r.pendientes === 1 ? ' no leído' : ' no leídos'));
  if (r.restantes) partes.push('faltan ' + r.restantes);
  partes.push((ms / 1000).toFixed(1) + ' s');
  return partes.join(' · ');
}
```

- [ ] **Paso 6: Reemplazar `src/appsscript.json`**

```json
{
  "timeZone": "America/Lima",
  "dependencies": {
    "enabledAdvancedServices": [
      { "userSymbol": "Gmail", "serviceId": "gmail", "version": "v1" }
    ]
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/gmail.modify"
  ],
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "MYSELF"
  }
}
```

- [ ] **Paso 7: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: todo PASS. (La prueba de la info de revisión espera `7 correos · 5 movimientos · 3 por revisar · 1 no leído` al inicio.)

- [ ] **Paso 8: Commit**

```bash
git add src tests
git commit -m "feat: lectura automática de correos con pendientes, etiqueta y tandas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Activar la lectura, frecuencia e importar desde una fecha

**Archivos:**
- Crear: `src/ingesta/activacion.js`, `tests/activacion.test.js`

**Interfaces:**
- Consume: `revisarCorreos` (Tarea 5).
- Produce: `FRECUENCIAS_LECTURA = ['5','15','30','60','manual','apagada']`; `configurarLectura({frecuencia, etiquetar}) → estadoLectura()`; `estadoLectura() → {activa, frecuencia, etiquetar, importar_desde, ultima_revision, info}`; `importarCorreosDesde(fechaIso) → resultado de revisarCorreos()`. Config: `lectura_activa`, `lectura_minutos`, `etiquetar`, `importar_desde` (primera vez: día 1 del mes actual), `cursor_lectura`.

- [ ] **Paso 1: Escribir la prueba que falla `tests/activacion.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');
const { ASUNTOS, html } = require('./correos');

test('configurarLectura deja un solo trigger con la frecuencia elegida', () => {
  const e = entornoInstalado();
  assert.deepStrictEqual(e.llamar('configurarLectura', { frecuencia: '5', etiquetar: true }), {
    activa: true, frecuencia: '5', etiquetar: true, importar_desde: '2026-10-01', ultima_revision: '', info: '',
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
  assert.deepStrictEqual(e.llamar('estadoLectura'), { activa: false, frecuencia: 'apagada', etiquetar: true, importar_desde: '', ultima_revision: '', info: '' });
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
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Run: `npm test`
Expected: FAIL con `configurarLectura is not a function`.

- [ ] **Paso 3: Crear `src/ingesta/activacion.js`**

```js
// Activar/desactivar la lectura de correos y elegir cada cuánto se revisa.

const FRECUENCIAS_LECTURA = ['5', '15', '30', '60', 'manual', 'apagada'];

function configurarLectura(datos) {
  const frecuencia = String(datos.frecuencia);
  if (FRECUENCIAS_LECTURA.indexOf(frecuencia) < 0) throw new Error('Frecuencia inválida: ' + frecuencia);
  conBloqueo_(() => {
    borrarTriggersLectura_();
    if (/^\d+$/.test(frecuencia)) crearTriggerLectura_(Number(frecuencia));
    const cambios = {
      lectura_activa: frecuencia === 'apagada' ? 'no' : 'si',
      lectura_minutos: frecuencia,
      etiquetar: datos.etiquetar === false ? 'no' : 'si',
    };
    if (!leerConfig_().importar_desde && frecuencia !== 'apagada') cambios.importar_desde = hoyIso_().slice(0, 8) + '01';
    guardarConfig_(cambios);
  });
  return estadoLectura();
}

function estadoLectura() {
  const c = leerConfig_();
  return {
    activa: c.lectura_activa === 'si',
    frecuencia: c.lectura_minutos || 'apagada',
    etiquetar: c.etiquetar !== 'no',
    importar_desde: c.importar_desde || '',
    ultima_revision: c.ultima_revision || '',
    info: c.ultima_revision_info || '',
  };
}

function importarCorreosDesde(fechaIso) {
  if (!esFechaIso_(fechaIso)) throw new Error('Fecha inválida: usa aaaa-mm-dd.');
  if (fechaIso > hoyIso_()) throw new Error('La fecha no puede estar en el futuro.');
  conBloqueo_(() => guardarConfig_({ importar_desde: fechaIso, cursor_lectura: 0 }));
  return revisarCorreos();
}

function crearTriggerLectura_(minutos) {
  const constructor = ScriptApp.newTrigger('revisarCorreos').timeBased();
  (minutos === 60 ? constructor.everyHours(1) : constructor.everyMinutes(minutos)).create();
}

function borrarTriggersLectura_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'revisarCorreos')
    .forEach(t => ScriptApp.deleteTrigger(t));
}
```

- [ ] **Paso 4: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: todo PASS.

- [ ] **Paso 5: Commit**

```bash
git add src/ingesta/activacion.js tests/activacion.test.js
git commit -m "feat: activar la lectura de correos con frecuencia configurable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Bandeja "Por revisar", reglas y aviso en el dashboard

**Archivos:**
- Crear: `src/web/api-revisar.js`, `tests/revisar.test.js`
- Modificar: `src/web/api.js` (`obtenerDashboard`)

**Interfaces:**
- Consume: `buscarActiva_` (fase 1), `normalizarTexto_`, `revisarCorreos` (Tarea 5).
- Produce: `obtenerPorRevisar() → {movimientos (fecha desc), pendientes (estado 'pendiente'), categoriasFrecuentes: {gasto: [ids ≤6], ingreso: [ids ≤6]}}`; `categorizarMovimiento({id, categoria_id, cuenta_id?, cuenta_destino_id?, recordar, patron?}) → {confirmados, regla}`; `listarReglas() → reglas`; `eliminarRegla(id) → {ok}`; `descartarPendiente(id) → {ok}`; `guardarRegla_(patron, categoria_id) → regla`; `categoriasFrecuentes_(movs, categorias)`. `obtenerDashboard(mes)` agrega `porRevisar` (movimientos por revisar + pendientes).

- [ ] **Paso 1: Escribir la prueba que falla `tests/revisar.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');
const { ASUNTOS, html } = require('./correos');

const BCP = 'notificaciones@notificacionesbcp.com.pe';
const YAPE = 'notificaciones@yape.pe';
const correoGmail = (id, archivo, asunto, recibido, de) => ({ id, de: de || BCP, asunto, html: html(archivo), recibido });

function entorno(numerosDebito) {
  const correos = [
    correoGmail('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00'),
    correoGmail('g2', 'credito-dolares.html', ASUNTOS.credito, '2026-10-07T10:00:00'),
    correoGmail('g3', 'yape-enviado.html', ASUNTOS.yape, '2026-10-08T19:51:00', YAPE),
    correoGmail('g5', 'pago-tarjeta-dolares.html', ASUNTOS.pagoTarjeta, '2026-10-10T13:42:00'),
    correoGmail('g6', 'consumo-roto.html', ASUNTOS.debito, '2026-10-11T09:00:00'),
    correoGmail('g9', 'debito.html', ASUNTOS.debito, '2026-10-12T12:00:00'),
  ];
  const e = entornoInstalado({ correos });
  e.correos = correos;
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: numerosDebito || '4444, 1111', yape: true });
  e.llamar('guardarCuenta', { id: e.cuenta('VISA BCP'), nombre: 'VISA BCP', tipo: 'credito', numeros: '2222' });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.movDe = gid => e.filas('Movimientos').find(m => m.ref_externa === 'gmail:' + gid);
  return e;
}

test('obtenerPorRevisar lista movimientos por revisar, correos no leídos y categorías frecuentes', () => {
  const e = entorno();
  e.llamar('revisarCorreos');
  const d = e.llamar('obtenerPorRevisar');
  assert.deepStrictEqual(d.movimientos.map(m => m.ref_externa), ['gmail:g9', 'gmail:g3', 'gmail:g2', 'gmail:g1']);
  assert.deepStrictEqual(d.pendientes.map(p => p.gmail_id), ['g6']);
  assert.strictEqual(d.categoriasFrecuentes.gasto.length, 6);
  assert.strictEqual(d.categoriasFrecuentes.ingreso.length, 4);
  assert.strictEqual(e.llamar('obtenerDashboard', '2026-10').porRevisar, 5);
});

test('categorizar con "recordar" crea la regla, confirma los del mismo comercio y sirve para los siguientes correos', () => {
  const e = entorno();
  e.llamar('revisarCorreos');
  const sup = e.categoria('Supermercado');
  const r = e.llamar('categorizarMovimiento', { id: e.movDe('g1').id, categoria_id: sup, recordar: true, patron: 'tottus' });
  assert.strictEqual(r.confirmados, 2);
  assert.strictEqual(r.regla.patron, 'TOTTUS');
  assert.strictEqual(e.movDe('g9').estado, 'confirmado');
  assert.strictEqual(e.movDe('g9').categoria_id, sup);
  assert.deepStrictEqual(e.llamar('listarReglas').map(x => [x.patron, x.categoria_id]), [['TOTTUS', sup]]);
  e.correos.push(correoGmail('g10', 'debito.html', ASUNTOS.debito, '2026-10-13T09:30:00'));
  const nueva = e.llamar('revisarCorreos');
  assert.strictEqual(nueva.creados, 1);
  assert.strictEqual(nueva.porRevisar, 0);
  assert.strictEqual(e.filas('Reglas')[0].usos, 1);
});

test('categorizar sin recordar no crea reglas; recordar otra vez el mismo patrón actualiza la regla', () => {
  const e = entorno();
  e.llamar('revisarCorreos');
  e.llamar('categorizarMovimiento', { id: e.movDe('g3').id, categoria_id: e.categoria('Transporte'), recordar: false });
  assert.strictEqual(e.filas('Reglas').length, 0);
  e.llamar('categorizarMovimiento', { id: e.movDe('g1').id, categoria_id: e.categoria('Supermercado'), recordar: true });
  e.llamar('categorizarMovimiento', { id: e.movDe('g9').id, categoria_id: e.categoria('Bodega'), recordar: true });
  assert.deepStrictEqual(e.llamar('listarReglas').map(x => [x.patron, x.categoria_id]), [['TOTTUS PRUEBA SUR', e.categoria('Bodega')]]);
});

test('si el correo traía un número desconocido, pide la cuenta', () => {
  const e = entorno('4444');
  e.llamar('revisarCorreos');
  const g1 = e.movDe('g1');
  assert.strictEqual(g1.cuenta_id, '');
  assert.throws(() => e.interno('categorizarMovimiento', { id: g1.id, categoria_id: e.categoria('Supermercado') }), /Elige la cuenta/);
  e.llamar('categorizarMovimiento', { id: g1.id, categoria_id: e.categoria('Supermercado'), cuenta_id: e.cuenta('Débito BCP') });
  assert.strictEqual(e.movDe('g1').cuenta_id, e.cuenta('Débito BCP'));
  assert.strictEqual(e.movDe('g1').estado, 'confirmado');
});

test('un gasto en dólares sin tipo de cambio lo completa al categorizar', () => {
  const e = entorno();
  e.interno('guardarConfig_', { ultimo_tc: 0 });
  e.llamar('revisarCorreos');
  const g2 = e.movDe('g2');
  assert.strictEqual(g2.monto_pen, 0);
  e.interno('guardarConfig_', { ultimo_tc: 0 });
  assert.throws(() => e.interno('categorizarMovimiento', { id: g2.id, categoria_id: e.categoria('Suscripciones') }), /tipo de cambio/);
  e.interno('guardarConfig_', { ultimo_tc: 3.477 });
  e.llamar('categorizarMovimiento', { id: g2.id, categoria_id: e.categoria('Suscripciones') });
  assert.strictEqual(e.movDe('g2').tc, 3.477);
  assert.strictEqual(e.movDe('g2').monto_pen, 82.06);
  assert.strictEqual(e.movDe('g2').descripcion, '');
});

test('eliminar reglas y descartar correos no leídos', () => {
  const e = entorno();
  e.llamar('revisarCorreos');
  e.llamar('categorizarMovimiento', { id: e.movDe('g1').id, categoria_id: e.categoria('Supermercado'), recordar: true });
  const regla = e.llamar('listarReglas')[0];
  assert.deepStrictEqual(e.llamar('eliminarRegla', regla.id), { ok: true });
  assert.deepStrictEqual(e.llamar('listarReglas'), []);
  const p = e.llamar('obtenerPorRevisar').pendientes[0];
  assert.deepStrictEqual(e.llamar('descartarPendiente', p.id), { ok: true });
  assert.deepStrictEqual(e.llamar('obtenerPorRevisar').pendientes, []);
  assert.throws(() => e.interno('categorizarMovimiento', { id: 'nada', categoria_id: e.categoria('Bodega') }), /ya no existe/);
});
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Run: `npm test`
Expected: FAIL con `obtenerPorRevisar is not a function`.

- [ ] **Paso 3: Crear `src/web/api-revisar.js`**

```js
// Bandeja "Por revisar": movimientos importados sin categoría o sin cuenta, correos
// que no se pudieron leer, y reglas comercio → categoría.

function obtenerPorRevisar() {
  const movs = leerTabla_('Movimientos');
  return {
    movimientos: movs.filter(m => m.estado === 'por_revisar')
      .sort((a, b) => (b.fecha + b.creado_en).localeCompare(a.fecha + a.creado_en)),
    pendientes: leerTabla_('Pendientes').filter(p => p.estado === 'pendiente')
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    categoriasFrecuentes: categoriasFrecuentes_(movs, leerTabla_('Categorias')),
  };
}

// Las 6 categorías activas más usadas en movimientos confirmados, por tipo.
function categoriasFrecuentes_(movs, categorias) {
  const r = {};
  ['gasto', 'ingreso'].forEach(tipo => {
    const usos = {};
    movs.forEach(m => {
      if (m.tipo === tipo && m.estado === 'confirmado' && m.categoria_id) usos[m.categoria_id] = (usos[m.categoria_id] || 0) + 1;
    });
    r[tipo] = categorias.filter(c => c.tipo === tipo && c.activa)
      .sort((a, b) => (usos[b.id] || 0) - (usos[a.id] || 0))
      .slice(0, 6).map(c => c.id);
  });
  return r;
}

function categorizarMovimiento(datos) {
  return conBloqueo_(() => {
    const movs = leerTabla_('Movimientos');
    const mov = movs.filter(m => m.id === datos.id)[0];
    if (!mov) throw new Error('El movimiento ya no existe.');
    const cuentas = leerTabla_('Cuentas');
    const cambios = { estado: 'confirmado' };
    if (mov.tipo !== 'transferencia') {
      const categoria = buscarActiva_(leerTabla_('Categorias'), datos.categoria_id, 'La categoría');
      if (categoria.tipo !== mov.tipo) throw new Error('La categoría "' + categoria.nombre + '" no es de ' + mov.tipo + '.');
      cambios.categoria_id = categoria.id;
    }
    if (datos.cuenta_id) cambios.cuenta_id = buscarActiva_(cuentas, datos.cuenta_id, 'La cuenta').id;
    if (datos.cuenta_destino_id) cambios.cuenta_destino_id = buscarActiva_(cuentas, datos.cuenta_destino_id, 'La cuenta destino').id;
    const final = Object.assign({}, mov, cambios);
    if (!final.cuenta_id) throw new Error('Elige la cuenta del movimiento.');
    if (final.tipo === 'transferencia' && !final.cuenta_destino_id) throw new Error('Elige la cuenta destino.');
    if (final.tipo === 'transferencia' && final.cuenta_id === final.cuenta_destino_id) throw new Error('La cuenta destino debe ser distinta de la de origen.');
    if (final.moneda !== 'PEN' && !(final.tc > 0)) {
      const tc = Number(leerConfig_().ultimo_tc) || 0;
      if (!tc) throw new Error('Configura el tipo de cambio en Ajustes para confirmar un movimiento en ' + final.moneda + '.');
      Object.assign(cambios, { tc: tc, monto_pen: redondear2_(final.monto * tc), descripcion: '' });
    }
    actualizarFila_('Movimientos', mov.id, cambios);
    let confirmados = 1;
    let regla = null;
    if (datos.recordar && mov.tipo !== 'transferencia' && mov.comercio) {
      const patron = normalizarTexto_(datos.patron || mov.comercio);
      if (!patron) throw new Error('Escribe el texto del comercio a recordar.');
      regla = guardarRegla_(patron, cambios.categoria_id);
      movs.filter(m => m.id !== mov.id && m.estado === 'por_revisar' && m.tipo === mov.tipo && m.cuenta_id &&
        (m.moneda === 'PEN' || m.tc > 0) && normalizarTexto_(m.comercio).indexOf(patron) >= 0)
        .forEach(m => {
          actualizarFila_('Movimientos', m.id, { categoria_id: cambios.categoria_id, estado: 'confirmado' });
          confirmados++;
        });
    }
    return { confirmados: confirmados, regla: regla };
  });
}

function guardarRegla_(patron, categoriaId) {
  const existente = leerTabla_('Reglas').filter(r => normalizarTexto_(r.patron) === patron)[0];
  if (existente) {
    actualizarFila_('Reglas', existente.id, { categoria_id: categoriaId });
    return Object.assign({}, existente, { categoria_id: categoriaId });
  }
  const nueva = { id: nuevoId_(), patron: patron, categoria_id: categoriaId, cuenta_id: '', creada_por: 'usuario', usos: 0 };
  agregarFilas_('Reglas', [nueva]);
  return nueva;
}

function listarReglas() {
  return leerTabla_('Reglas').sort((a, b) => a.patron.localeCompare(b.patron));
}

function eliminarRegla(id) {
  conBloqueo_(() => eliminarFila_('Reglas', id));
  return { ok: true };
}

function descartarPendiente(id) {
  conBloqueo_(() => actualizarFila_('Pendientes', id, { estado: 'descartado' }));
  return { ok: true };
}
```

- [ ] **Paso 4: Reemplazar `obtenerDashboard` en `src/web/api.js`**

```js
function obtenerDashboard(mes) {
  validarMes_(mes);
  const movs = leerTabla_('Movimientos');
  const dashboard = construirDashboard_({
    movs: movs,
    divisiones: leerTabla_('Divisiones'),
    categorias: leerTabla_('Categorias'),
    cuentas: leerTabla_('Cuentas'),
    tcUsd: Number(leerConfig_().ultimo_tc) || 0,
  }, mes);
  dashboard.porRevisar = movs.filter(m => m.estado === 'por_revisar').length +
    leerTabla_('Pendientes').filter(p => p.estado === 'pendiente').length;
  return dashboard;
}
```

- [ ] **Paso 5: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: todo PASS.

- [ ] **Paso 6: Commit**

```bash
git add src/web tests/revisar.test.js
git commit -m "feat: bandeja por revisar con reglas que aprenden y aviso en el dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Dividir movimientos y eliminar sin dejar restos

**Archivos:**
- Crear: `src/core/divisiones.js`, `tests/dividir.test.js`
- Modificar: `src/web/api-revisar.js` (agregar al final), `src/web/api.js` (`eliminarMovimiento`)

**Interfaces:**
- Consume: `buscarActiva_`, `recordarIgnorados_` (Tarea 5).
- Produce: `normalizarPartes_(mov, partes, categorias) → [{categoria_id, monto, nota}]` (≥ 2 partes, mismo tipo, mismo signo, suma = monto al céntimo; transferencias no se dividen); `dividirMovimiento({id, partes, cuenta_id?}) → {ok, partes}`; `quitarDivision(id) → {ok}`; `obtenerDivisiones(id) → divisiones`; `borrarDivisiones_(movimientoId)`. Al dividir: `dividido = true`, `estado = 'confirmado'`, `categoria_id` = categoría de la parte de mayor monto absoluto. `eliminarMovimiento` borra divisiones y, si el movimiento vino de Gmail, recuerda su correo como ignorado.

- [ ] **Paso 1: Escribir la prueba que falla `tests/dividir.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');
const { ASUNTOS, html } = require('./correos');

function conGasto() {
  const e = entornoInstalado();
  e.mov = e.llamar('guardarMovimiento', { fecha: '2026-10-06', tipo: 'gasto', monto: 89.3, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Supermercado'), comercio: 'Tottus' });
  return e;
}

test('dividir guarda las partes, marca el movimiento y el dashboard usa las partes', () => {
  const e = conGasto();
  const r = e.llamar('dividirMovimiento', { id: e.mov.id, partes: [
    { categoria_id: e.categoria('Supermercado'), monto: 60 },
    { categoria_id: e.categoria('Aseo personal'), monto: '20' },
    { categoria_id: e.categoria('Ropa'), monto: 9.3 },
  ] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(e.filas('Divisiones').length, 3);
  const mov = e.filas('Movimientos')[0];
  assert.strictEqual(mov.dividido, true);
  assert.strictEqual(mov.categoria_id, e.categoria('Supermercado'));
  const cats = e.llamar('obtenerDashboard', '2026-10').categorias.map(c => [c.nombre, c.monto]);
  assert.deepStrictEqual(cats, [['Supermercado', 60], ['Aseo personal', 20], ['Ropa', 9.3]]);
  e.llamar('dividirMovimiento', { id: e.mov.id, partes: [
    { categoria_id: e.categoria('Supermercado'), monto: 80 },
    { categoria_id: e.categoria('Ropa'), monto: 9.3 },
  ] });
  assert.strictEqual(e.llamar('obtenerDivisiones', e.mov.id).length, 2);
});

test('dividir valida suma, cantidad, tipo de categoría y transferencias', () => {
  const e = conGasto();
  const sup = e.categoria('Supermercado');
  const falla = (partes, patron) => assert.throws(() => e.interno('dividirMovimiento', { id: e.mov.id, partes }), patron);
  falla([{ categoria_id: sup, monto: 60 }, { categoria_id: sup, monto: 20 }], /suman 80.00 y el movimiento es 89.30/);
  falla([{ categoria_id: sup, monto: 89.3 }], /al menos 2 partes/);
  falla([{ categoria_id: sup, monto: 89.3 }, { categoria_id: e.categoria('Sueldo'), monto: 0.01 }], /no es de gasto/);
  falla([{ categoria_id: sup, monto: 100 }, { categoria_id: sup, monto: -10.7 }], /mismo signo/);
  const t = e.llamar('guardarMovimiento', { fecha: '2026-10-06', tipo: 'transferencia', monto: 50, cuenta_id: e.cuenta('Débito BCP'), cuenta_destino_id: e.cuenta('VISA BCP') });
  assert.throws(() => e.interno('dividirMovimiento', { id: t.id, partes: [{ categoria_id: sup, monto: 25 }, { categoria_id: sup, monto: 25 }] }), /transferencia no se puede dividir/);
  assert.strictEqual(e.filas('Divisiones').length, 0);
});

test('quitar la división y eliminar el movimiento no dejan divisiones sueltas', () => {
  const e = conGasto();
  const partes = [{ categoria_id: e.categoria('Supermercado'), monto: 60 }, { categoria_id: e.categoria('Ropa'), monto: 29.3 }];
  e.llamar('dividirMovimiento', { id: e.mov.id, partes });
  assert.deepStrictEqual(e.llamar('quitarDivision', e.mov.id), { ok: true });
  assert.strictEqual(e.filas('Divisiones').length, 0);
  assert.strictEqual(e.filas('Movimientos')[0].dividido, false);
  e.llamar('dividirMovimiento', { id: e.mov.id, partes });
  e.llamar('eliminarMovimiento', e.mov.id);
  assert.strictEqual(e.filas('Divisiones').length, 0);
});

test('un movimiento importado que se elimina no vuelve en la siguiente lectura', () => {
  const correos = [{ id: 'g1', de: 'notificaciones@notificacionesbcp.com.pe', asunto: ASUNTOS.debito, html: html('debito.html'), recibido: '2026-10-06T16:19:00' }];
  const e = entornoInstalado({ correos });
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1111' });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.llamar('revisarCorreos');
  e.llamar('eliminarMovimiento', e.filas('Movimientos')[0].id);
  e.interno('guardarConfig_', { cursor_lectura: 0 });
  assert.strictEqual(e.llamar('revisarCorreos').leidos, 0);
  assert.deepStrictEqual(e.filas('Movimientos'), []);
});

test('dividir un movimiento sin cuenta exige elegirla y la guarda', () => {
  const correos = [{ id: 'g1', de: 'notificaciones@notificacionesbcp.com.pe', asunto: ASUNTOS.debito, html: html('debito.html'), recibido: '2026-10-06T16:19:00' }];
  const e = entornoInstalado({ correos });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.llamar('revisarCorreos');
  const mov = e.filas('Movimientos')[0];
  const partes = [{ categoria_id: e.categoria('Supermercado'), monto: 60 }, { categoria_id: e.categoria('Ropa'), monto: 29.3 }];
  assert.throws(() => e.interno('dividirMovimiento', { id: mov.id, partes }), /Elige la cuenta/);
  e.llamar('dividirMovimiento', { id: mov.id, partes, cuenta_id: e.cuenta('Débito BCP') });
  const final = e.filas('Movimientos')[0];
  assert.strictEqual(final.cuenta_id, e.cuenta('Débito BCP'));
  assert.strictEqual(final.estado, 'confirmado');
});
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Run: `npm test`
Expected: FAIL con `dividirMovimiento is not a function`.

- [ ] **Paso 3: Crear `src/core/divisiones.js`**

```js
// Validación de las partes de un movimiento dividido entre categorías.

function normalizarPartes_(mov, partes, categorias) {
  if (mov.tipo === 'transferencia') throw new Error('Una transferencia no se puede dividir.');
  if (!partes || partes.length < 2) throw new Error('Divide el movimiento en al menos 2 partes.');
  const limpias = partes.map(p => {
    const categoria = buscarActiva_(categorias, p.categoria_id, 'La categoría');
    if (categoria.tipo !== mov.tipo) throw new Error('La categoría "' + categoria.nombre + '" no es de ' + mov.tipo + '.');
    const monto = redondear2_(p.monto);
    if (!isFinite(monto) || monto === 0) throw new Error('Cada parte necesita un monto.');
    if (Math.sign(monto) !== Math.sign(mov.monto)) throw new Error('Las partes deben tener el mismo signo que el movimiento.');
    return { categoria_id: categoria.id, monto: monto, nota: String(p.nota || '').trim() };
  });
  const suma = redondear2_(limpias.reduce((s, p) => s + p.monto, 0));
  if (suma !== redondear2_(mov.monto)) {
    throw new Error('Las partes suman ' + suma.toFixed(2) + ' y el movimiento es ' + redondear2_(mov.monto).toFixed(2) + '.');
  }
  return limpias;
}
```

- [ ] **Paso 4: Agregar al final de `src/web/api-revisar.js`**

```js

function dividirMovimiento(datos) {
  return conBloqueo_(() => {
    const mov = leerTabla_('Movimientos').filter(m => m.id === datos.id)[0];
    if (!mov) throw new Error('El movimiento ya no existe.');
    const partes = normalizarPartes_(mov, datos.partes, leerTabla_('Categorias'));
    const cambios = { dividido: true, estado: 'confirmado' };
    if (!mov.cuenta_id) {
      if (!datos.cuenta_id) throw new Error('Elige la cuenta del movimiento antes de dividirlo.');
      cambios.cuenta_id = buscarActiva_(leerTabla_('Cuentas'), datos.cuenta_id, 'La cuenta').id;
    }
    if (mov.moneda !== 'PEN' && !(mov.tc > 0)) throw new Error('Configura el tipo de cambio en Ajustes antes de dividir.');
    cambios.categoria_id = partes.slice().sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))[0].categoria_id;
    borrarDivisiones_(mov.id);
    agregarFilas_('Divisiones', partes.map(p => Object.assign({ id: nuevoId_(), movimiento_id: mov.id }, p)));
    actualizarFila_('Movimientos', mov.id, cambios);
    return { ok: true, partes: partes };
  });
}

function quitarDivision(id) {
  conBloqueo_(() => {
    if (!leerTabla_('Movimientos').some(m => m.id === id)) throw new Error('El movimiento ya no existe.');
    borrarDivisiones_(id);
    actualizarFila_('Movimientos', id, { dividido: false });
  });
  return { ok: true };
}

function obtenerDivisiones(id) {
  return leerTabla_('Divisiones').filter(d => d.movimiento_id === id);
}

function borrarDivisiones_(movimientoId) {
  leerTabla_('Divisiones').filter(d => d.movimiento_id === movimientoId)
    .forEach(d => eliminarFila_('Divisiones', d.id));
}
```

- [ ] **Paso 5: Reemplazar `eliminarMovimiento` en `src/web/api.js`**

```js
function eliminarMovimiento(id) {
  conBloqueo_(() => {
    const mov = leerTabla_('Movimientos').filter(m => m.id === id)[0];
    eliminarFila_('Movimientos', id); // lanza "No existe" si ya no está
    borrarDivisiones_(id);
    // Un importado que el usuario borra (p. ej. duplicado) no debe volver en la siguiente lectura.
    if (mov && mov.ref_externa.indexOf('gmail:') === 0) recordarIgnorados_([mov.ref_externa.slice(6)]);
  });
  return { ok: true };
}
```

- [ ] **Paso 6: Correr pruebas y lint**

Run: `npm test && npm run lint`
Expected: todo PASS.

- [ ] **Paso 7: Commit**

```bash
git add src tests/dividir.test.js
git commit -m "feat: dividir movimientos entre categorías y eliminar sin restos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Interfaz — franja en Inicio, marcas en Movimientos, vista Por revisar y modal Dividir

**Archivos:**
- Crear: `src/web/vista-revisar.html`, `src/web/vista-dividir.html`
- Modificar: `src/web/vista-inicio.html`, `src/web/vista-movimientos.html`, `src/web/estilos.html`, `src/web/Index.html`

**Interfaces:**
- Consume: `obtenerPorRevisar`, `categorizarMovimiento`, `descartarPendiente`, `obtenerDivisiones`, `dividirMovimiento`, `quitarDivision` (Tareas 7–8); `fechaLarga`, `abrirFormMovimiento` (vista-movimientos).
- Produce: `VISTAS.revisar`; `abrirDividir(mov)`; `abrirFormMovimiento(mov, opciones)` con `opciones.inicial` (valores iniciales de un movimiento nuevo) y `opciones.alGuardar` (async, tras guardar).

- [ ] **Paso 1: Verificar en rojo**

Run: `node tests/ui/ver.js "mostrar('revisar')" vista`
Expected: `"texto": "Vista no disponible."`.

- [ ] **Paso 2: Estilos — agregar en `src/web/estilos.html` antes de `/* Botón flotante, modal y aviso */`**

```css
/* Por revisar y dividir */
.franja { display: flex; justify-content: space-between; align-items: center; width: 100%; background: rgba(124, 92, 255, .14); border: 1px solid rgba(124, 92, 255, .4); color: var(--texto); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; cursor: pointer; text-align: left; }
.etiqueta-mini { font-size: 10px; padding: 1px 6px; border-radius: 99px; background: rgba(255, 179, 71, .15); color: var(--alerta); margin-left: 6px; vertical-align: middle; }
.subtitulo { font-size: 15px; margin: 22px 0 10px; color: var(--texto-2); }
.fila-division { display: grid; grid-template-columns: 1fr 104px 40px; gap: 8px; align-items: center; margin-bottom: 8px; }
.barra-division { display: flex; height: 8px; border-radius: 99px; overflow: hidden; background: var(--borde); margin: 12px 0 8px; }
.barra-division i { display: block; height: 100%; }
```

- [ ] **Paso 3: Franja en `src/web/vista-inicio.html`**

Reemplazar la primera aparición de `'<div class="grid">' +` por:

```js
    (d.porRevisar ? '<button type="button" class="franja" id="ir-revisar"><span>🔔 <b>' + d.porRevisar + '</b> por revisar</span><span>→</span></button>' : '') +
    '<div class="grid">' +
```

y después de la línea `  enlazarMes(cont);` (dentro de `VISTAS.inicio`) agregar:

```js
  const franja = $('#ir-revisar');
  if (franja) franja.onclick = () => mostrar('revisar');
```

- [ ] **Paso 4: Marcas y opciones en `src/web/vista-movimientos.html`**

- `cont.innerHTML = '<div class="cabecera"><h1>Movimientos</h1>' + selectorMes() + '</div>' +` → `cont.innerHTML = '<div class="cabecera"><h1>Movimientos</h1><button type="button" class="boton" id="ir-revisar-mov">Por revisar</button>' + selectorMes() + '</div>' +`
- Después de `  enlazarMes(cont);` dentro de `VISTAS.movimientos` agregar `  $('#ir-revisar-mov').onclick = () => mostrar('revisar');`
- `el.onclick = () => abrirFormMovimiento(visibles.find(m => m.id === el.dataset.id));` → `el.onclick = () => { const m = visibles.find(x => x.id === el.dataset.id); if (m.dividido) abrirDividir(m); else abrirFormMovimiento(m); };`
- En `itemMovimiento`, reemplazar:

```js
    '<div class="cuerpo"><div class="titulo">' + esc(titulo) + '</div><div class="sub">' + esc(sub) + '</div></div>' +
```

por:

```js
    '<div class="cuerpo"><div class="titulo">' + esc(titulo) + (m.dividido ? ' ✂️' : '') +
    (m.estado === 'por_revisar' ? '<span class="etiqueta-mini">por revisar</span>' : '') + '</div>' +
    '<div class="sub">' + (m.origen === 'gmail' ? '📧 ' : '') + esc(sub) + '</div></div>' +
```

- `function abrirFormMovimiento(mov) {` → `function abrirFormMovimiento(mov, opciones) {\n  opciones = opciones || {};`
- Después del bloque que define `f` (la línea `  };` que cierra `cuenta_destino_id: '', categoria_id: '', comercio: '', descripcion: '',`) agregar `  if (!mov) Object.assign(f, opciones.inicial || {});`
- `      guardarLocal('ultimaCuenta', f.cuenta_id);` → `      guardarLocal('ultimaCuenta', f.cuenta_id);\n      if (opciones.alGuardar) await opciones.alGuardar();`

- [ ] **Paso 5: Crear `src/web/vista-revisar.html`**

```html
<script>
'use strict';
VISTAS.revisar = async function (cont) {
  const d = await api('obtenerPorRevisar');
  const tarjetas = d.movimientos.map(m => tarjetaRevisar(m, d.categoriasFrecuentes)).join('');
  const pendientes = d.pendientes.map(tarjetaPendiente).join('');
  cont.innerHTML = '<div class="cabecera"><h1>Por revisar</h1><button type="button" class="boton" id="rv-volver">Ver movimientos</button></div>' +
    (tarjetas || '<div class="vacio">Todo al día: no hay movimientos por revisar. 🎉</div>') +
    (pendientes ? '<h2 class="subtitulo">Correos que no se pudieron leer</h2>' + pendientes : '');
  $('#rv-volver').onclick = () => mostrar('movimientos');
  cont.querySelectorAll('[data-rv]').forEach(t => enlazarTarjetaRevisar(t, d.movimientos.find(m => m.id === t.dataset.rv)));
  cont.querySelectorAll('[data-pend]').forEach(t => enlazarPendiente(t, d.pendientes.find(p => p.id === t.dataset.pend)));
};

function etiquetaTipoMov(tipo) { return { gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transferencia' }[tipo] || tipo; }
function mayusculasSinTildes(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
function chipCategoria(c) { return '<button type="button" class="chip" data-cat="' + esc(c.id) + '">' + esc(c.emoji + ' ' + c.nombre) + '</button>'; }

function tarjetaRevisar(m, frecuentes) {
  const cat = estado.catalogos;
  const activas = cat.cuentas.filter(c => c.activa);
  const ids = [''].concat(activas.map(c => c.id));
  const nombres = ['Elige…'].concat(activas.map(c => c.nombre));
  const titulo = m.comercio || m.descripcion || etiquetaTipoMov(m.tipo);
  let html = '<section class="tarjeta seccion" data-rv="' + esc(m.id) + '">' +
    '<div class="fila-simple" style="border:0;padding-top:0"><b>' + esc(titulo) + '</b><b class="num ' + (m.tipo === 'ingreso' ? 'pos' : '') + '">' +
    (m.tipo === 'ingreso' ? '+' : '') + dinero(m.monto, m.moneda) + '</b></div>' +
    '<div class="tenue" style="font-size:12px;margin-bottom:10px">📧 ' + esc(fechaLarga(m.fecha) + ' · ' + etiquetaTipoMov(m.tipo) + ' · ' +
    (m.cuenta_id ? cuenta(m.cuenta_id).nombre : 'cuenta sin identificar') + (m.descripcion && m.comercio ? ' · ' + m.descripcion : '')) + '</div>';
  if (!m.cuenta_id) html += campo('¿De qué cuenta salió?', seleccion('rv-cta-' + m.id, ids, '', nombres));
  if (m.tipo === 'transferencia') {
    if (!m.cuenta_destino_id) html += campo('¿A qué cuenta llegó?', seleccion('rv-dst-' + m.id, ids, '', nombres));
    return html + '<div class="acciones"><button type="button" class="boton primario" data-confirmar>Confirmar</button></div></section>';
  }
  const deTipo = cat.categorias.filter(c => c.tipo === m.tipo && c.activa);
  const top = (frecuentes[m.tipo] || []).map(id => deTipo.find(c => c.id === id)).filter(Boolean);
  html += '<div class="chips">' + top.map(chipCategoria).join('') + '<button type="button" class="chip" data-otra>Otra…</button></div>' +
    '<div class="chips" data-todas hidden style="margin-top:6px">' + deTipo.filter(c => top.indexOf(c) < 0).map(chipCategoria).join('') + '</div>';
  if (m.comercio) {
    html += '<label class="check" style="margin-top:10px"><input type="checkbox" data-recordar checked> Recordar la categoría para:</label>' +
      '<input class="entrada" data-patron value="' + esc(mayusculasSinTildes(m.comercio)) + '" aria-label="Texto del comercio a recordar">';
  }
  return html + '<div class="acciones"><button type="button" class="boton" data-dividir>✂️ Dividir</button></div></section>';
}

function enlazarTarjetaRevisar(t, m) {
  const otra = t.querySelector('[data-otra]');
  if (otra) otra.onclick = () => { t.querySelector('[data-todas]').hidden = false; otra.hidden = true; };
  const valor = id => { const el = t.querySelector('[id="' + id + '"]'); return el ? el.value : ''; };
  const confirmar = async (boton, categoriaId) => {
    const recordar = t.querySelector('[data-recordar]');
    const patron = t.querySelector('[data-patron]');
    boton.disabled = true;
    try {
      const r = await api('categorizarMovimiento', {
        id: m.id, categoria_id: categoriaId || '', cuenta_id: valor('rv-cta-' + m.id), cuenta_destino_id: valor('rv-dst-' + m.id),
        recordar: !!(recordar && recordar.checked), patron: patron ? patron.value : '',
      });
      aviso(r.confirmados > 1 ? r.confirmados + ' movimientos confirmados' : 'Movimiento confirmado');
      mostrar('revisar');
    } catch (err) {
      aviso(err.message, true);
      boton.disabled = false;
    }
  };
  t.querySelectorAll('[data-cat]').forEach(b => { b.onclick = () => confirmar(b, b.dataset.cat); });
  const boton = t.querySelector('[data-confirmar]');
  if (boton) boton.onclick = () => confirmar(boton, '');
  const dividir = t.querySelector('[data-dividir]');
  if (dividir) dividir.onclick = () => {
    const cuentaElegida = valor('rv-cta-' + m.id);
    if (!m.cuenta_id && !cuentaElegida) { aviso('Primero elige la cuenta.', true); return; }
    abrirDividir(Object.assign({}, m, cuentaElegida ? { cuenta_id: cuentaElegida } : {}));
  };
}

function tarjetaPendiente(p) {
  return '<section class="tarjeta seccion" data-pend="' + esc(p.id) + '">' +
    '<div class="fila-simple" style="border:0;padding-top:0"><b>' + esc(p.asunto) + '</b><span class="tenue">' + esc(fechaLarga(p.fecha)) + '</span></div>' +
    '<p class="tenue" style="font-size:12px;margin:4px 0 0">' + esc(String(p.resumen).slice(0, 160)) + '…</p>' +
    '<div class="acciones"><a class="boton" href="https://mail.google.com/mail/u/0/#all/' + encodeURIComponent(p.gmail_id) + '" target="_blank" rel="noopener">Abrir en Gmail</a>' +
    '<button type="button" class="boton" data-registrar>Registrar a mano</button><button type="button" class="boton" data-descartar>Descartar</button></div></section>';
}

function enlazarPendiente(t, p) {
  const descartar = () => api('descartarPendiente', p.id);
  t.querySelector('[data-registrar]').onclick = () => abrirFormMovimiento(null, { inicial: { fecha: p.fecha }, alGuardar: descartar });
  const boton = t.querySelector('[data-descartar]');
  boton.onclick = async () => {
    boton.disabled = true;
    try {
      await descartar();
      aviso('Correo descartado');
      mostrar('revisar');
    } catch (err) {
      aviso(err.message, true);
      boton.disabled = false;
    }
  };
}
</script>
```

- [ ] **Paso 6: Crear `src/web/vista-dividir.html`**

```html
<script>
'use strict';
// Modal para dividir un movimiento entre categorías. La última parte se completa sola.
async function abrirDividir(mov) {
  const previas = mov.dividido ? await api('obtenerDivisiones', mov.id) : [];
  const cats = estado.catalogos.categorias.filter(c => c.tipo === mov.tipo && (c.activa || previas.some(p => p.categoria_id === c.id)));
  const partes = previas.length
    ? previas.map(p => ({ categoria_id: p.categoria_id, monto: String(p.monto) }))
    : [{ categoria_id: mov.categoria_id || '', monto: '' }, { categoria_id: '', monto: '' }];
  const caja = abrirModal('<h2 class="titulo-modal">✂️ Dividir · ' + esc(mov.comercio || 'movimiento') + ' · <span class="num">' + dinero(mov.monto, mov.moneda) + '</span></h2><div id="dv"></div>');
  const redondear = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const restante = () => redondear(mov.monto - partes.slice(0, -1).reduce((s, p) => s + (Number(p.monto) || 0), 0));

  function leer() {
    caja.querySelectorAll('[data-fila]').forEach(f => {
      const i = Number(f.dataset.fila);
      partes[i].categoria_id = f.querySelector('select').value;
      if (i < partes.length - 1) partes[i].monto = f.querySelector('input').value;
    });
  }

  function pintar() {
    const resto = restante();
    const filas = partes.map((p, i) => {
      const ultima = i === partes.length - 1;
      return '<div class="fila-division" data-fila="' + i + '">' +
        seleccion('dv-cat-' + i, [''].concat(cats.map(c => c.id)), p.categoria_id, ['Categoría…'].concat(cats.map(c => c.emoji + ' ' + c.nombre))) +
        '<input class="entrada num" inputmode="decimal" placeholder="0.00" aria-label="Monto" value="' + esc(ultima ? resto.toFixed(2) : p.monto) + '"' + (ultima ? ' readonly' : '') + '>' +
        (partes.length > 2 ? '<button type="button" class="boton" data-quitar="' + i + '" aria-label="Quitar parte">✕</button>' : '<span></span>') + '</div>';
    }).join('');
    const barra = partes.map((p, i) => {
      const monto = i === partes.length - 1 ? resto : Number(p.monto) || 0;
      const c = cats.find(x => x.id === p.categoria_id);
      return '<i style="width:' + Math.max(0, monto / mov.monto * 100) + '%;background:' + esc(c ? c.color : '#3a3a48') + '"></i>';
    }).join('');
    $('#dv', caja).innerHTML = filas +
      '<button type="button" class="boton" id="dv-agregar">+ Agregar categoría</button>' +
      '<div class="barra-division">' + barra + '</div>' +
      '<div class="etiqueta ' + (resto * Math.sign(mov.monto) <= 0 ? 'neg' : '') + '">La última parte se completa sola: ' + dinero(resto, mov.moneda) + '</div>' +
      '<div class="acciones">' + (mov.dividido ? '<button type="button" class="boton peligro" id="dv-quitar">Quitar división</button>' : '') +
      '<button type="button" class="boton" id="dv-cancelar">Cancelar</button><button type="button" class="boton primario" id="dv-guardar">Guardar</button></div>';

    caja.querySelectorAll('[data-fila] input').forEach(inp => {
      inp.oninput = () => { leer(); caja.querySelector('[data-fila="' + (partes.length - 1) + '"] input').value = restante().toFixed(2); };
      inp.onchange = () => { leer(); pintar(); };
    });
    caja.querySelectorAll('[data-fila] select').forEach(s => { s.onchange = () => { leer(); pintar(); }; });
    caja.querySelectorAll('[data-quitar]').forEach(b => { b.onclick = () => { leer(); partes.splice(Number(b.dataset.quitar), 1); pintar(); }; });
    $('#dv-agregar', caja).onclick = () => { leer(); partes.splice(partes.length - 1, 0, { categoria_id: '', monto: '' }); pintar(); };
    $('#dv-cancelar', caja).onclick = cerrarModal;
    $('#dv-guardar', caja).onclick = async e => {
      leer();
      const enviar = partes.map((p, i) => ({ categoria_id: p.categoria_id, monto: i === partes.length - 1 ? restante() : p.monto }));
      e.target.disabled = true;
      try {
        await api('dividirMovimiento', { id: mov.id, cuenta_id: mov.cuenta_id || '', partes: enviar });
        cerrarModal();
        aviso('Movimiento dividido');
        mostrar(estado.vista);
      } catch (err) {
        aviso(err.message, true);
        e.target.disabled = false;
      }
    };
    const quitar = $('#dv-quitar', caja);
    if (quitar) quitar.onclick = async () => {
      quitar.disabled = true;
      try {
        await api('quitarDivision', mov.id);
        cerrarModal();
        aviso('División quitada');
        mostrar(estado.vista);
      } catch (err) {
        aviso(err.message, true);
        quitar.disabled = false;
      }
    };
  }

  pintar();
}
</script>
```

- [ ] **Paso 7: Incluir las vistas en `src/web/Index.html`**

Después de `<?!= incluir_('web/vista-movimientos'); ?>` agregar:

```html
  <?!= incluir_('web/vista-revisar'); ?>
  <?!= incluir_('web/vista-dividir'); ?>
```

- [ ] **Paso 8: Revisar en Chrome**

Run: `node tests/ui/ver.js "" vista`
Expected: `"error": null`; `texto` empieza con `🔔 4 por revisar`.

Run: `node tests/ui/ver.js "mostrar('revisar')" vista revisar-movil.png 390`
Expected: `"error": null`; `texto` contiene `BRAYAN G. MUNOZ`, `¿De qué cuenta salió?`, `¿A qué cuenta llegó?`, `Otra…`, `Recordar la categoría para:`, `Correos que no se pudieron leer`, `Registrar a mano`. Abrir la captura con Read y confirmar que las tarjetas se leen bien.

Run: `node tests/ui/ver.js "mostrar('revisar'); setTimeout(function(){document.querySelector('[data-cat]').click()},400)" vista`
Expected: `"error": null`; `llamadas` contiene `categorizarMovimiento` y luego otra vez `obtenerPorRevisar`.

Run: `node tests/ui/ver.js "mostrar('revisar'); setTimeout(function(){document.querySelector('[data-dividir]').click()},400)" modal dividir-movil.png 390`
Expected: `"error": null`; `texto` contiene `Dividir · BRAYAN G. MUNOZ`, `La última parte se completa sola`, `+ Agregar categoría`.

Run: `node tests/ui/ver.js "mostrar('movimientos'); setTimeout(function(){document.querySelector('[data-id=m1]').click(); setTimeout(function(){document.getElementById('dv-guardar').click()},300)},400)" vista`
Expected: `"error": null`; `llamadas` contiene `obtenerDivisiones` y `dividirMovimiento`.

Run: `node tests/ui/ver.js "mostrar('movimientos')" vista`
Expected: `texto` contiene `Tottus ✂️`, `por revisar`, `📧`.

- [ ] **Paso 9: Pruebas, lint y commit**

Run: `npm test && npm run lint` → todo PASS.

```bash
git add src/web
git commit -m "feat: vista por revisar, modal dividir y marcas de origen en movimientos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Interfaz — lectura de correos y reglas en Ajustes

**Archivos:**
- Modificar: `src/web/vista-ajustes.html`

**Interfaces:**
- Consume: `estadoLectura`, `configurarLectura`, `revisarCorreos`, `importarCorreosDesde` (Tareas 5–6), `listarReglas`, `eliminarRegla` (Tarea 7).
- Produce: secciones "Lectura de correos" y "Reglas" en `VISTAS.ajustes`.

- [ ] **Paso 1: Verificar en rojo**

Run: `node tests/ui/ver.js "mostrar('ajustes')" vista`
Expected: `texto` **no** contiene `Lectura de correos`.

- [ ] **Paso 2: Modificar `src/web/vista-ajustes.html`**

- `  const cat = await cargarCatalogos();` (dentro de `VISTAS.ajustes`) → `  const [cat, lectura, reglas] = await Promise.all([cargarCatalogos(), api('estadoLectura'), api('listarReglas')]);`
- `    '<section class="tarjeta seccion"><div class="etiqueta">Datos</div>' +` → `    seccionLectura(lectura) + seccionReglas(reglas) +\n    '<section class="tarjeta seccion"><div class="etiqueta">Datos</div>' +`
- `  $('#a-demo').onclick = async e => {` → `  enlazarLectura();\n  enlazarReglas();\n  $('#a-demo').onclick = async e => {`
- Antes de `function abrirFormCategoria(c, tipo) {` agregar:

```js
const FRECUENCIAS = [
  ['apagada', 'Apagada'], ['5', 'Cada 5 minutos'], ['15', 'Cada 15 minutos'], ['30', 'Cada 30 minutos'],
  ['60', 'Cada hora'], ['manual', 'Solo cuando toque "Revisar ahora"'],
];

function seccionLectura(l) {
  const estadoTexto = l.ultima_revision ? 'Última revisión: ' + l.ultima_revision + ' · ' + l.info : 'Aún no se ha revisado ningún correo.';
  return '<section class="tarjeta seccion"><div class="etiqueta">Lectura de correos (BCP y Yape)</div>' +
    '<p class="tenue" style="margin:0 0 10px;font-size:13px">' + esc(estadoTexto) + '</p>' +
    '<div class="dos-col">' +
      campo('Frecuencia', seleccion('l-frec', FRECUENCIAS.map(f => f[0]), String(l.frecuencia), FRECUENCIAS.map(f => f[1]))) +
      campo('Importar correos desde', '<input class="entrada" type="date" id="l-desde" value="' + esc(l.importar_desde) + '">') +
    '</div>' +
    '<label class="check"><input type="checkbox" id="l-etiquetar"' + (l.etiquetar ? ' checked' : '') + '> Etiquetar en Gmail los correos leídos (Finanzas/Procesado)</label>' +
    '<div class="acciones"><button type="button" class="boton primario" id="l-guardar">Guardar</button>' +
    (l.activa ? '<button type="button" class="boton" id="l-revisar">Revisar ahora</button><button type="button" class="boton" id="l-importar">Importar desde la fecha</button>' : '') +
    '</div></section>';
}

function enlazarLectura() {
  $('#l-guardar').onclick = e => accionLectura(e.target, () => api('configurarLectura', { frecuencia: $('#l-frec').value, etiquetar: $('#l-etiquetar').checked }), 'Lectura de correos guardada');
  const revisar = $('#l-revisar');
  if (revisar) revisar.onclick = e => accionLectura(e.target, () => api('revisarCorreos'));
  const importar = $('#l-importar');
  if (importar) importar.onclick = e => accionLectura(e.target, () => api('importarCorreosDesde', $('#l-desde').value));
}

async function accionLectura(boton, llamada, mensaje) {
  boton.disabled = true;
  try {
    const r = await llamada();
    aviso(mensaje || resumenRevision(r));
    mostrar('ajustes');
  } catch (err) {
    aviso(err.message, true);
    boton.disabled = false;
  }
}

function resumenRevision(r) {
  if (r.omitida) return r.mensaje;
  return r.leidos + ' correos leídos · ' + r.creados + ' movimientos' +
    (r.porRevisar ? ' · ' + r.porRevisar + ' por revisar' : '') + (r.restantes ? ' · faltan ' + r.restantes : '');
}

function seccionReglas(reglas) {
  const filas = reglas.length ? reglas.map(r => {
    const c = categoria(r.categoria_id);
    return '<div class="fila-simple"><span>' + esc(r.patron) + ' → ' + esc(c.emoji + ' ' + c.nombre) +
      ' <span class="tenue">· ' + r.usos + ' usos</span></span>' +
      '<button type="button" class="boton" data-regla="' + esc(r.id) + '" aria-label="Borrar regla">✕</button></div>';
  }).join('') : '<p class="tenue" style="margin:0;font-size:13px">Aún no hay reglas. Se crean al categorizar en "Por revisar".</p>';
  return '<section class="tarjeta seccion"><div class="etiqueta">Reglas (comercio → categoría)</div>' + filas + '</section>';
}

function enlazarReglas() {
  document.querySelectorAll('[data-regla]').forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        await api('eliminarRegla', b.dataset.regla);
        aviso('Regla borrada');
        mostrar('ajustes');
      } catch (err) {
        aviso(err.message, true);
        b.disabled = false;
      }
    };
  });
}
```

- [ ] **Paso 3: Revisar en Chrome**

Run: `node tests/ui/ver.js "mostrar('ajustes')" vista ajustes-movil.png 390`
Expected: `"error": null`; `texto` contiene `Lectura de correos (BCP y Yape)`, `Última revisión: 2026-10-13 10:00:00 · 12 correos`, `Cada 5 minutos`, `Etiquetar en Gmail`, `Revisar ahora`, `TOTTUS → 🛒 Supermercado`, `5 usos`.

Run: `node tests/ui/ver.js "mostrar('ajustes'); setTimeout(function(){document.getElementById('l-revisar').click()},400)" vista`
Expected: `"error": null`; `llamadas` contiene `revisarCorreos`.

Run: `node tests/ui/ver.js "mostrar('ajustes'); setTimeout(function(){document.getElementById('l-guardar').click()},400)" vista`
Expected: `llamadas` contiene `configurarLectura`.

- [ ] **Paso 4: Pruebas, lint y commit**

Run: `npm test && npm run lint` → todo PASS.

```bash
git add src/web/vista-ajustes.html
git commit -m "feat: lectura de correos y reglas en Ajustes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Documentación, versión 0.2.0, despliegue y activación real

**Archivos:**
- Crear: `docs/agregar-un-banco.md`
- Modificar: `README.md`, `CHANGELOG.md`, `docs/arquitectura.md`, `docs/privacidad.md`, `docs/instalacion.md`, `package.json`

- [ ] **Paso 1: Crear `docs/agregar-un-banco.md`**

````markdown
# Agregar un banco

Cada banco tiene un **lector**: una función pura que recibe un correo ya convertido a texto y devuelve un movimiento crudo. No toca Gmail ni la hoja, así que se prueba con correos de ejemplo.

## 1. Consigue un correo de ejemplo y anonimízalo

Guarda el HTML de una notificación real en `tests/fixtures/correos/<banco>-<tipo>.html` y **reemplaza** nombres, números de tarjeta y cuenta, números de operación y montos por valores inventados (usa "Ana Prueba", tarjetas `1111`/`2222`, cuentas `3333`/`4444`).

## 2. Escribe la prueba primero

```js
// tests/lector-<banco>.test.js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { correo } = require('./correos');

test('consumo con tarjeta de <banco>', () => {
  const e = crearEntorno();
  const c = correo(e, '<banco>-consumo.html', { remitente: 'alertas@<banco>.pe', asunto: 'Consumo con tu tarjeta' });
  assert.deepStrictEqual(e.llamar('leerCorreo<Banco>_', c).crudo, {
    tipo: 'gasto', monto: 45.5, moneda: 'PEN', comercio: 'COMERCIO PRUEBA', numero_origen: '1111',
    fecha: '2026-10-06', ref_externa: 'gmail:<banco>-consumo',
  });
});
```

## 3. Escribe el lector en `src/parsers/<banco>.js`

```js
const REMITENTE_<BANCO> = 'alertas@<banco>.pe';

function leerCorreo<Banco>_(correo) {
  if (correo.remitente !== REMITENTE_<BANCO>) return null;      // remitente exacto
  const t = correo.texto;                                        // una sola línea de texto
  const monto = new RegExp('Consumo de ' + PATRON_MONTO).exec(t);
  const tarjeta = /Tarjeta\s*\*+\s*(\d{4})/.exec(t);
  const comercio = /Comercio\s+(.+?)\s+Fecha/.exec(t);
  if (!monto || !tarjeta || !comercio) return { pendiente: 'No se pudo leer el consumo.' };
  return { crudo: Object.assign({ tipo: 'gasto' }, leerMonto_(monto[1], monto[2]), {
    comercio: comercio[1].trim(), numero_origen: tarjeta[1], fecha: correo.fecha, ref_externa: 'gmail:' + correo.id,
  }) };
}
```

Reglas del movimiento crudo: `tipo` (`gasto`/`ingreso`/`transferencia`), `monto` positivo, `moneda` (`PEN`/`USD`), `numero_origen` (últimos 4 dígitos), `numero_destino` en transferencias, `usa_yape: true` si el correo no trae número y sale de la cuenta de Yape, `tc` si el correo trae tipo de cambio. Nunca pongas claves con `undefined`.

Devuelve `null` si el correo no es una operación (publicidad, estados de cuenta) y `{ pendiente }` si es una operación que no pudiste leer: así aparece en "Correos que no se pudieron leer" y no se pierde.

## 4. Regístralo en `src/parsers/lectores.js`

Agrega la función a `lectoresDeCorreo_()` y el dominio del remitente a `REMITENTES_BANCARIOS`.

## 5. Corre las pruebas y abre un PR

```bash
npm test && npm run lint
```
````

- [ ] **Paso 2: Actualizar documentación**

En `README.md`:
- En "Qué hace hoy", cambiar el título a `## Qué hace hoy (v0.2)` y agregar al inicio de la lista:

```markdown
- **Lectura automática de correos** del BCP y Yape (consumos con débito y crédito en S/ y $, PLIN, yapeos enviados y recibidos, transferencias entre cuentas, pago de tarjeta, pago de servicios), cada 5 minutos o con la frecuencia que elijas.
- **Bandeja "Por revisar"**: lo que la app no sabe categorizar se resuelve con un toque y queda como regla para la próxima vez.
- **Dividir** una compra entre varias categorías (supermercado + aseo + ropa).
```

- En la tabla de hoja de ruta: `| v0.2 | Lectura automática de correos del banco (BCP, Yape) | ⏳ |` → `| v0.2 | Lectura automática de correos del banco (BCP, Yape), bandeja y dividir | ✅ |`
- En "Decisiones técnicas" agregar:

```markdown
- **Lectores deterministas por banco:** cada banco es una función pura con sus correos de ejemplo anonimizados como pruebas; agregar uno no toca el resto ([docs/agregar-un-banco.md](docs/agregar-un-banco.md)). Un correo que no se entiende queda visible en la bandeja, nunca se pierde.
- **Gmail con el permiso mínimo útil:** `gmail.modify` solo para buscar, leer y etiquetar; la app recuerda qué correos ya leyó por su id, no por la etiqueta.
```

En `docs/arquitectura.md`, reemplazar el diagrama por:

````markdown
```
Navegador (celular / laptop)          Trigger cada 5 min
        │  google.script.run                  │
        ▼                                     ▼
src/web/        api.js · api-revisar.js · vistas .html      src/ingesta/   revisar.js · activacion.js
        │                                                           │  resolver.js (cuenta, regla, tc)
src/setup/      asistente.js · demo.js                              │  gmail.js  ← única capa que toca Gmail
        │                                                    src/parsers/   bcp.js · yape.js · lectores.js (puros)
src/core/       movimientos.js · agregados.js · catalogos.js · divisiones.js · util.js   ← lógica pura
        │
src/core/repo.js   ← única capa que toca SpreadsheetApp (y migra el esquema)
        │
Google Sheet    Movimientos · Divisiones · Cuentas · Categorias · Reglas · Pendientes · Config · Log
```
````

y en la tabla del modelo de datos agregar `| Pendientes | Correos bancarios que ningún lector pudo leer (se registran a mano o se descartan). |` y cambiar Cuentas a `| Cuentas | Débito, crédito (saldo negativo = deuda), ahorro, billetera, efectivo. \`numeros\`: últimos 4 dígitos de cuentas y tarjetas (varios por cuenta); \`yape\`: la cuenta de la que sale Yape. |`.

En `docs/privacidad.md`, reemplazar la sección "Próximas versiones" por:

```markdown
## Lectura de correos (v0.2)

- La app busca **solo** correos de `notificacionesbcp.com.pe` y `yape.pe` (no lee el resto de tu bandeja) y excluye spam y papelera.
- Usa el permiso `gmail.modify`, que Google describe como "ver y modificar, pero no eliminar": lo necesita para poner la etiqueta `Finanzas/Procesado`. Nunca borra ni envía correos. Puedes apagar la etiqueta en Ajustes.
- Todo ocurre dentro de tu cuenta de Google: los correos no salen a ningún servidor.

## Próximas versiones

- **v0.4 (Gemini):** audios, fotos de boletas y algunos textos se enviarán a la API de Gemini con **tu** clave. En el nivel gratuito, Google puede usar ese contenido para mejorar sus productos; para datos reales se recomienda el nivel de pago con un tope de gasto.
```

En `docs/instalacion.md`, después del paso 6 de la vía desarrollador agregar:

```markdown
7. **Lectura de correos (opcional):** en **Cuentas**, pon en cada cuenta los últimos 4 dígitos de su número y de su tarjeta (por ejemplo `5101, 5202`) y marca la cuenta de la que sale Yape. Luego en **Ajustes → Lectura de correos** elige la frecuencia y toca **Guardar**: Google pedirá permiso para leer y etiquetar tus correos.
```

En `CHANGELOG.md`, agregar arriba de `## [0.1.0]`:

```markdown
## [0.2.0] — 2026-10-13

### Agregado
- Lectura automática de correos del BCP y Yape con trigger configurable (5, 15, 30, 60 minutos o manual) e importación desde una fecha.
- Bandeja "Por revisar" con categorías frecuentes, reglas comercio → categoría que se aplican solas y correos no leídos.
- Dividir un movimiento entre varias categorías.
- Cuentas con varios números (cuenta y tarjeta) y cuenta de Yape.
- Etiqueta `Finanzas/Procesado` en Gmail (desactivable).
- Guía para agregar un banco.

### Cambiado
- Esquema de la hoja v2 (migración automática): `ultimos4` pasa a `numeros`, nueva columna `yape` y hoja `Pendientes`.
- Eliminar un movimiento borra también sus divisiones.
```

En `package.json`, `"version": "0.1.0"` → `"version": "0.2.0"`.

- [ ] **Paso 3: Verificar y commit**

Run: `npm test && npm run lint` → todo PASS.

```bash
git add docs README.md CHANGELOG.md package.json
git commit -m "docs: guía para agregar un banco y documentación de la v0.2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Paso 4: Desplegar**

Run: `npm run deploy`
Expected: `Despliegue actualizado: AKfycbyBLby7…` (misma URL).

- [ ] **Paso 5: Activación real con Bruno**

Pedir a Bruno que abra la app (Google pedirá **autorizar de nuevo** por los permisos nuevos de Gmail y triggers) y:
1. **Cuentas:** renombrar y completar: "Débito BCP" (Cuenta digital) → números `5101, 5202`, marcar Yape; "Ahorro BCP" (Clásica) → `5303`, sin Yape; "VISA BCP" → `5404`. Corregir los nombres invertidos de la fase 1 si aplica.
2. **Ajustes → Lectura de correos:** frecuencia "Cada 5 minutos", etiquetar activado, **Guardar**; luego **Importar desde la fecha** con `2026-10-01` (repetir si dice "faltan N").
3. Revisar la franja "por revisar" en Inicio y la bandeja: categorizar algunos con "Recordar", dividir una compra.
4. Confirmar en Gmail que los correos procesados tienen la etiqueta `Finanzas/Procesado`.

Expected: Bruno confirma que los movimientos de octubre aparecen con la cuenta correcta. Si aparecen **correos no leídos** de tipos que deberían leerse, pedir a Bruno el asunto, revisar ese correo real con la herramienta de Gmail (solo lectura), crear su fixture anonimizado, escribir la prueba que falla, corregir el lector, y volver a desplegar.

- [ ] **Paso 6: Revisión final, integrar y etiquetar**

Tras la revisión final de la rama (executing-plans) y con el visto bueno de Bruno: integrar `fase-2` en `main` con superpowers:finishing-a-development-branch, luego:

```bash
git tag -a v0.2.0 -m "v0.2.0 — lectura automática de correos, bandeja por revisar y dividir"
git push origin main --tags
```

Expected: CI en verde en GitHub para `main`.
