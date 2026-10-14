# Fase 5a · Presupuestos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presupuestos mensuales por categoría con vigencia "desde", bloque "Presupuesto del mes" en el Inicio, pestaña Presupuestos y avisos por Telegram al cruzar el 80 % y el 100 %.

**Architecture:** Cálculo puro en `src/core/presupuestos.js` (vigencia, gasto vs presupuesto, referencia, umbrales). Una hoja nueva `Presupuestos` (esquema v3, migración automática) y la API `obtenerPresupuestos`/`guardarPresupuestos`. Los avisos viven en `src/telegram/presupuestos.js`: se revisan después de cada escritura que puede mover el gasto y guardan en Script Properties qué umbral ya se avisó en el mes.

**Tech Stack:** Google Apps Script (V8), Google Sheets, Node 24 `node --test` con el arnés `tests/harness.js`, ESLint 9, Chrome sin cabeza (`tests/ui/ver.js`).

**Spec:** [docs/superpowers/specs/2026-10-13-fase-5a-presupuestos-design.md](../specs/2026-10-13-fase-5a-presupuestos-design.md)

## Global Constraints

- Nunca datos personales ni secretos en el repo; fixtures y demo ficticios.
- Funciones públicas sin guion bajo final; internas con `_`.
- Toda escritura en la hoja va dentro de `conBloqueo_`, y `conBloqueo_` nunca se anida. Los avisos por Telegram se envían fuera del bloqueo.
- Nunca `new Date('yyyy-mm-dd')` ni `instanceof Date`; montos con `redondear2_`; todo agregado suma `monto_pen`.
- Textos para Telegram en HTML con `escaparHtml_`; en la UI todo dato pasa por `esc()`; sin `alert/confirm/prompt`.
- Los avisos de presupuesto nunca lanzan ni impiden guardar: un fallo queda en el Log como `aviso`.
- Textos al usuario en español con tildes.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Una categoría desactivada o borrada que tiene presupuesto vigente → el bloque la sigue mostrando, sin romperse. Probado en Task 1.
2. Monto escrito con coma decimal (`400,50`), con espacios o vacío → se guarda bien; texto no numérico → error claro y nada se escribe. Probado en Task 2.
3. Guardar dos veces en el mismo mes → actualiza la fila, no la duplica; guardar sin cambios no escribe nada. Probado en Task 2.
4. Telegram caído al cruzar un umbral → el aviso queda pendiente y sale en el siguiente cambio. Probado en Task 3.
5. La barra inferior del celular con 5 pestañas a 390 px → sin desborde. Probado en Task 6 (captura).

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/core/presupuestos.js` | Crear | Cálculo puro: vigentes, vs real, ritmo, umbral, referencia. |
| `src/core/esquema.js` | Modificar | Hoja `Presupuestos`, `VERSION_ESQUEMA = 3`. |
| `src/web/api-presupuestos.js` | Crear | `obtenerPresupuestos`, `guardarPresupuestos`. |
| `src/web/api.js` | Modificar | `obtenerDashboard` agrega `presupuesto`; ganchos de aviso. |
| `src/web/api-revisar.js` | Modificar | Ganchos de aviso en categorizar y dividir. |
| `src/telegram/presupuestos.js` | Crear | `revisarPresupuestos_`, texto del aviso, registro de umbrales. |
| `src/telegram/webhook.js`, `src/ingesta/revisar.js` | Modificar | Ganchos de aviso desde el bot y la lectura de correos. |
| `src/telegram/mensajes.js`, `src/telegram/resumen.js` | Modificar | `/mes` con presupuestos. |
| `src/setup/demo.js` | Modificar | Presupuestos de demo. |
| `src/web/vista-presupuestos.html`, `vista-inicio.html`, `Index.html`, `estilos.html` | Crear/Modificar | Pestaña y bloque. |
| `tests/ui/stub.js` | Modificar | Datos simulados. |
| Docs, `CHANGELOG.md`, `README.md`, `package.json` | Modificar | v0.5.0. |

---

### Task 1: Cálculo de presupuestos (puro)

**Files:**
- Create: `src/core/presupuestos.js`, `tests/presupuestos.test.js`

**Interfaces:**
- Consumes: `redondear2_`, `mesDe_`, `sumarMeses_` (util), `SIN_CATEGORIA` (agregados). Las `lineas` vienen de `lineasCategoria_(movs, divisiones)` → `[{ fecha, tipo, categoria_id, monto_pen }]`.
- Produces:
  - `UMBRAL_ALERTA = 80`
  - `presupuestosVigentes_(filas, mes) → { categoria_id: monto }` (sin los de monto 0)
  - `diasDelMes_(mes) → number`
  - `umbralPresupuesto_(porcentaje) → 0 | 80 | 100`
  - `presupuestoVsReal_(lineas, vigentes, categorias, mes, hoyIso) → { filas: [{ categoria_id, nombre, emoji, color, gastado, presupuesto, porcentaje, queda, estado: 'ok'|'alerta'|'pasado', ritmo }], total: { presupuesto, gastado }, sinPresupuesto }`
  - `referenciaPresupuesto_(lineas, mes) → { categoria_id: { mesPasado, promedio3 } }`

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/presupuestos.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

const e = crearEntorno();
const f = (nombre, ...args) => e.llamar(nombre, ...args);

const CATS = [
  { id: 'super', nombre: 'Supermercado', emoji: '🛒', color: '#3ddc97', tipo: 'gasto', activa: true },
  { id: 'comida', nombre: 'Comida fuera', emoji: '🍽️', color: '#ffb347', tipo: 'gasto', activa: true },
  { id: 'ropa', nombre: 'Ropa', emoji: '👕', color: '#7c5cff', tipo: 'gasto', activa: false },
  { id: 'bodega', nombre: 'Bodega', emoji: '🏪', color: '#ff6b6b', tipo: 'gasto', activa: true },
];
const linea = (fecha, categoria_id, monto_pen, tipo) => ({ fecha, tipo: tipo || 'gasto', categoria_id, monto_pen });

test('presupuestosVigentes_: la fila más reciente que no sea posterior al mes; 0 quita el presupuesto', () => {
  const filas = [
    { id: '1', categoria_id: 'super', monto: 500, desde: '2026-08' },
    { id: '2', categoria_id: 'super', monto: 600, desde: '2026-10' },
    { id: '3', categoria_id: 'comida', monto: 300, desde: '2026-09' },
    { id: '4', categoria_id: 'comida', monto: 0, desde: '2026-11' },
    { id: '5', categoria_id: 'bodega', monto: 80, desde: '2026-12' },
  ];
  assert.deepStrictEqual(f('presupuestosVigentes_', filas, '2026-07'), {});
  assert.deepStrictEqual(f('presupuestosVigentes_', filas, '2026-09'), { super: 500, comida: 300 });
  assert.deepStrictEqual(f('presupuestosVigentes_', filas, '2026-10'), { super: 600, comida: 300 });
  assert.deepStrictEqual(f('presupuestosVigentes_', filas, '2026-11'), { super: 600 });
  assert.deepStrictEqual(f('presupuestosVigentes_', filas, '2027-01'), { super: 600, bodega: 80 });
});

test('presupuestoVsReal_: gastado del mes con reembolsos, estados, orden, total y sin presupuesto', () => {
  const lineas = [
    linea('2026-10-02', 'super', 300), linea('2026-10-05', 'super', 180.5),
    linea('2026-10-03', 'comida', 310), linea('2026-10-09', 'comida', -10),
    linea('2026-10-04', 'bodega', 39.5),
    linea('2026-10-06', 'ropa', 120),
    linea('2026-10-07', '', 45),
    linea('2026-09-30', 'super', 999),
    linea('2026-10-01', 'sueldo', 3500, 'ingreso'),
  ];
  const r = f('presupuestoVsReal_', lineas, { super: 600, comida: 300, bodega: 50 }, CATS, '2026-10', '2026-10-15');
  assert.deepStrictEqual(r.filas.map(x => [x.categoria_id, x.gastado, x.porcentaje, x.queda, x.estado]), [
    ['comida', 300, 100, 0, 'pasado'], ['super', 480.5, 80, 119.5, 'alerta'], ['bodega', 39.5, 79, 10.5, 'ok'],
  ]);
  assert.deepStrictEqual(r.total, { presupuesto: 950, gastado: 820 });
  assert.strictEqual(r.sinPresupuesto, 165);
  assert.deepStrictEqual([r.filas[0].nombre, r.filas[0].emoji, r.filas[0].color, r.filas[0].ritmo], ['Comida fuera', '🍽️', '#ffb347', 48]);
});

test('una categoría desactivada o borrada con presupuesto se sigue mostrando', () => {
  const r = f('presupuestoVsReal_', [linea('2026-10-02', 'ropa', 50)], { ropa: 100, borrada: 40 }, CATS, '2026-10', '2026-10-15');
  assert.deepStrictEqual(r.filas.map(x => [x.nombre, x.porcentaje, x.estado]), [['Ropa', 50, 'ok'], ['Sin categoría', 0, 'ok']]);
});

test('ritmo: proporción del mes transcurrido; 100 en meses pasados y 0 en futuros', () => {
  const ritmo = (mes, hoy) => f('presupuestoVsReal_', [], { super: 100 }, CATS, mes, hoy).filas[0].ritmo;
  assert.strictEqual(ritmo('2026-10', '2026-10-31'), 100);
  assert.strictEqual(ritmo('2026-10', '2026-10-01'), 3);
  assert.strictEqual(ritmo('2026-02', '2026-02-14'), 50);
  assert.strictEqual(ritmo('2026-09', '2026-10-15'), 100);
  assert.strictEqual(ritmo('2026-11', '2026-10-15'), 0);
  assert.strictEqual(f('diasDelMes_', '2028-02'), 29);
});

test('umbralPresupuesto_: 0, 80 o 100', () => {
  assert.deepStrictEqual([0, 79, 80, 99, 100, 140].map(p => f('umbralPresupuesto_', p)), [0, 0, 80, 80, 100, 100]);
});

test('referenciaPresupuesto_: mes pasado y promedio de los 3 anteriores (los meses sin gasto cuentan 0)', () => {
  const lineas = [
    linea('2026-09-10', 'super', 300), linea('2026-09-20', 'super', 100),
    linea('2026-08-10', 'super', 200), linea('2026-07-05', 'super', 300),
    linea('2026-08-15', 'comida', 90), linea('2026-06-01', 'comida', 500),
    linea('2026-10-01', 'super', 999), linea('2026-09-01', 'sueldo', 3000, 'ingreso'), linea('2026-09-02', '', 40),
  ];
  assert.deepStrictEqual(f('referenciaPresupuesto_', lineas, '2026-10'), {
    super: { mesPasado: 400, promedio3: 300 }, comida: { mesPasado: 0, promedio3: 30 },
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --test tests/presupuestos.test.js`
Expected: FAIL ("contexto[nombre] is not a function").

- [ ] **Step 3: Implementar**

`src/core/presupuestos.js`:

```js
// Presupuestos mensuales por categoría con vigencia "desde": cada fila vale desde su mes
// hasta que otra más reciente de la misma categoría la reemplaza. Funciones puras.

const UMBRAL_ALERTA = 80;

function presupuestosVigentes_(filas, mes) {
  const elegidas = {};
  filas.forEach(f => {
    if (!f.categoria_id || !f.desde || f.desde > mes) return;
    const actual = elegidas[f.categoria_id];
    if (!actual || f.desde > actual.desde) elegidas[f.categoria_id] = f;
  });
  const vigentes = {};
  Object.keys(elegidas).forEach(id => {
    const monto = redondear2_(elegidas[id].monto);
    if (monto > 0) vigentes[id] = monto;
  });
  return vigentes;
}

function diasDelMes_(mes) {
  const p = mes.split('-').map(Number);
  return new Date(p[0], p[1], 0).getDate();
}

function umbralPresupuesto_(porcentaje) {
  if (porcentaje >= 100) return 100;
  return porcentaje >= UMBRAL_ALERTA ? UMBRAL_ALERTA : 0;
}

// Porcentaje del mes transcurrido: dónde "debería" ir el gasto a esta fecha.
function ritmoDelMes_(mes, hoyIso) {
  const actual = mesDe_(hoyIso);
  if (mes < actual) return 100;
  if (mes > actual) return 0;
  return Math.round(Number(hoyIso.slice(8, 10)) / diasDelMes_(mes) * 100);
}

// lineas = lineasCategoria_(movs, divisiones); vigentes = presupuestosVigentes_(filas, mes).
function presupuestoVsReal_(lineas, vigentes, categorias, mes, hoyIso) {
  const gastado = {};
  let sinPresupuesto = 0;
  lineas.forEach(l => {
    if (l.tipo !== 'gasto' || mesDe_(l.fecha) !== mes) return;
    if (l.categoria_id && vigentes[l.categoria_id]) gastado[l.categoria_id] = (gastado[l.categoria_id] || 0) + l.monto_pen;
    else sinPresupuesto += l.monto_pen;
  });
  const ritmo = ritmoDelMes_(mes, hoyIso);
  const filas = Object.keys(vigentes).map(id => {
    const c = categorias.filter(x => x.id === id)[0] || SIN_CATEGORIA;
    const presupuesto = vigentes[id];
    const g = redondear2_(gastado[id] || 0);
    const porcentaje = Math.round(g / presupuesto * 100);
    const estado = porcentaje >= 100 ? 'pasado' : porcentaje >= UMBRAL_ALERTA ? 'alerta' : 'ok';
    return {
      categoria_id: id, nombre: c.nombre, emoji: c.emoji, color: c.color, gastado: g, presupuesto: presupuesto,
      porcentaje: porcentaje, queda: redondear2_(presupuesto - g), estado: estado, ritmo: ritmo,
    };
  }).sort((a, b) => b.porcentaje - a.porcentaje || a.nombre.localeCompare(b.nombre));
  return {
    filas: filas,
    total: {
      presupuesto: redondear2_(filas.reduce((s, x) => s + x.presupuesto, 0)),
      gastado: redondear2_(filas.reduce((s, x) => s + x.gastado, 0)),
    },
    sinPresupuesto: redondear2_(sinPresupuesto),
  };
}

// Gasto del mes anterior y promedio de los 3 anteriores, como referencia al presupuestar.
function referenciaPresupuesto_(lineas, mes) {
  const meses = [1, 2, 3].map(n => sumarMeses_(mes, -n));
  const porCategoria = {};
  lineas.forEach(l => {
    if (l.tipo !== 'gasto' || !l.categoria_id) return;
    const i = meses.indexOf(mesDe_(l.fecha));
    if (i < 0) return;
    const sumas = porCategoria[l.categoria_id] = porCategoria[l.categoria_id] || [0, 0, 0];
    sumas[i] += l.monto_pen;
  });
  const referencia = {};
  Object.keys(porCategoria).forEach(id => {
    const s = porCategoria[id];
    referencia[id] = { mesPasado: redondear2_(s[0]), promedio3: redondear2_((s[0] + s[1] + s[2]) / 3) };
  });
  return referencia;
}
```

- [ ] **Step 4: Ver que pasan**

Run: `node --test tests/presupuestos.test.js` → Expected: PASS (6 pruebas).
Run: `npm run lint` → Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/core/presupuestos.js tests/presupuestos.test.js
git commit -m "feat: cálculo de presupuestos por categoría con vigencia desde

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Hoja Presupuestos (esquema v3), API y dashboard

**Files:**
- Modify: `src/core/esquema.js`, `src/web/api.js` (`obtenerDashboard`), `tests/migracion.test.js:24`, `tests/catalogos.test.js:49`
- Create: `src/web/api-presupuestos.js`, `tests/api-presupuestos.test.js`

**Interfaces:**
- Consumes: Task 1 (`presupuestosVigentes_`, `presupuestoVsReal_`, `referenciaPresupuesto_`); `lineasCategoria_`, `buscarActiva_`, `leerTabla_`, `agregarFilas_`, `actualizarFila_`, `conBloqueo_`, `hoyIso_`, `mesDe_`, `nuevoId_`.
- Produces:
  - Hoja `Presupuestos` (`id, categoria_id, monto, desde`); `VERSION_ESQUEMA = 3`.
  - `obtenerPresupuestos() → { mes, montos, referencia, categorias }`.
  - `guardarPresupuestos({ montos: { categoria_id: string|number } }) → { cambiadas: number, mes, montos, referencia, categorias }`.
  - `guardarPresupuestosSinAvisar_(montos, mes) → [categoria_id cambiadas]` (dentro de `guardarPresupuestos`; la Task 3 agrega el ajuste del registro de avisos).
  - `obtenerDashboard(mes).presupuesto` = resultado de `presupuestoVsReal_`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/api-presupuestos.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');

function entorno() {
  const e = entornoInstalado();
  e.sup = e.categoria('Supermercado');
  e.com = e.categoria('Comida fuera');
  e.bod = e.categoria('Bodega');
  e.nombre = id => e.llamar('obtenerCatalogos').categorias.find(c => c.id === id).nombre;
  e.filasPpto = () => e.filas('Presupuestos').map(p => [e.nombre(p.categoria_id), p.monto, p.desde]);
  e.gasto = (fecha, monto, categoria_id) => e.llamar('guardarMovimiento', {
    fecha, tipo: 'gasto', monto, cuenta_id: e.cuenta('Débito BCP'), categoria_id: categoria_id || e.sup, comercio: 'Tottus',
  });
  return e;
}

test('guardar crea filas desde el mes actual y obtenerPresupuestos las devuelve con la referencia', () => {
  const e = entorno();
  e.gasto('2026-09-10', 380);
  const r = e.llamar('guardarPresupuestos', { montos: { [e.sup]: '600', [e.com]: ' 400,50 ', [e.bod]: '' } });
  assert.strictEqual(r.cambiadas, 2);
  assert.strictEqual(r.mes, '2026-10');
  assert.deepStrictEqual(r.montos, { [e.sup]: 600, [e.com]: 400.5 });
  assert.deepStrictEqual(r.referencia[e.sup], { mesPasado: 380, promedio3: 126.67 });
  assert.ok(r.categorias.length > 10 && r.categorias.every(c => c.tipo === 'gasto' && c.activa));
  assert.deepStrictEqual(e.filasPpto(), [['Supermercado', 600, '2026-10'], ['Comida fuera', 400.5, '2026-10']]);
  assert.deepStrictEqual(e.llamar('obtenerPresupuestos').montos, r.montos);
});

test('en el mismo mes actualiza la fila; en un mes nuevo agrega otra y el anterior no cambia; sin cambios no escribe', () => {
  const e = entorno();
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: 600 } });
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: 650 } });
  assert.deepStrictEqual(e.filasPpto(), [['Supermercado', 650, '2026-10']]);
  assert.strictEqual(e.llamar('guardarPresupuestos', { montos: { [e.sup]: '650', [e.com]: '' } }).cambiadas, 0);
  e.fijarAhora('2026-11-05T09:00:00');
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: 700 } });
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: '' } });
  assert.deepStrictEqual(e.filasPpto(), [['Supermercado', 650, '2026-10'], ['Supermercado', 0, '2026-11']]);
  assert.deepStrictEqual(e.llamar('obtenerPresupuestos').montos, {});
  assert.deepStrictEqual(e.llamar('presupuestosVigentes_', e.filas('Presupuestos'), '2026-10'), { [e.sup]: 650 });
});

test('valida antes de escribir: solo gasto, activa, existente y número positivo', () => {
  const e = entorno();
  const intentar = montos => () => e.llamar('guardarPresupuestos', { montos: montos });
  assert.throws(intentar({ [e.sup]: 100, [e.categoria('Sueldo')]: 50 }), /Solo las categorías de gasto/);
  assert.throws(intentar({ [e.sup]: '-5' }), /número positivo/);
  assert.throws(intentar({ [e.sup]: 'mucho' }), /número positivo/);
  assert.throws(intentar({ 'no-existe': 10 }), /no existe/);
  e.llamar('guardarCategoria', { id: e.bod, nombre: 'Bodega', emoji: '🏪', color: '#7c5cff', tipo: 'gasto', activa: false });
  assert.throws(intentar({ [e.sup]: 100, [e.bod]: 30 }), /desactivada/);
  assert.deepStrictEqual(e.filas('Presupuestos'), []);
});

test('obtenerDashboard incluye el presupuesto del mes elegido', () => {
  const e = entorno();
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: 100 } });
  e.gasto('2026-10-02', 85);
  const p = e.llamar('obtenerDashboard', '2026-10').presupuesto;
  assert.deepStrictEqual(p.filas.map(x => [x.categoria_id, x.porcentaje, x.estado]), [[e.sup, 85, 'alerta']]);
  assert.deepStrictEqual(e.llamar('obtenerDashboard', '2026-09').presupuesto.filas, []);
});
```

Agregar al final de `tests/migracion.test.js`:

```js
test('una hoja v2 pasa a v3 con la hoja Presupuestos, sin tocar los datos', () => {
  const e = entornoInstalado();
  delete e.hojas.Presupuestos;
  e.interno('guardarConfig_', { version_esquema: 2 });
  const movimientos = JSON.stringify(e.hojas.Movimientos);
  e.llamar('estadoInstalacion');
  assert.deepStrictEqual(e.hojas.Presupuestos[0], ['id', 'categoria_id', 'monto', 'desde']);
  assert.strictEqual(e.llamar('leerConfig_').version_esquema, '3');
  assert.strictEqual(JSON.stringify(e.hojas.Movimientos), movimientos);
});
```

Cambiar en `tests/migracion.test.js:24` y `tests/catalogos.test.js:49` el valor esperado `'2'` de `version_esquema` por `'3'` (la versión actual del esquema).

- [ ] **Step 2: Ver que fallan**

Run: `node --test tests/api-presupuestos.test.js tests/migracion.test.js tests/catalogos.test.js`
Expected: FAIL (`guardarPresupuestos` no existe; versión `'2'` ≠ `'3'`; falta la hoja).

- [ ] **Step 3: Esquema**

En `src/core/esquema.js`: cambiar `const VERSION_ESQUEMA = 2;` por `const VERSION_ESQUEMA = 3;` y agregar en `ESQUEMA`, después de `Pendientes`:

```js
  Presupuestos: [['id', 'texto'], ['categoria_id', 'texto'], ['monto', 'numero'], ['desde', 'texto']],
```

- [ ] **Step 4: API**

`src/web/api-presupuestos.js`:

```js
// Pestaña Presupuestos: montos vigentes del mes actual con referencias, y guardado que
// rige "desde este mes" sin tocar los meses anteriores.

function obtenerPresupuestos() {
  const mes = mesDe_(hoyIso_());
  return {
    mes: mes,
    montos: presupuestosVigentes_(leerTabla_('Presupuestos'), mes),
    referencia: referenciaPresupuesto_(lineasCategoria_(leerTabla_('Movimientos'), leerTabla_('Divisiones')), mes),
    categorias: leerTabla_('Categorias').filter(c => c.tipo === 'gasto' && c.activa),
  };
}

// datos.montos = { categoria_id: monto } (texto o número; vacío = sin presupuesto).
function guardarPresupuestos(datos) {
  const mes = mesDe_(hoyIso_());
  const cambiadas = conBloqueo_(() => guardarPresupuestosSinAvisar_((datos && datos.montos) || {}, mes));
  return Object.assign({ cambiadas: cambiadas.length }, obtenerPresupuestos());
}

// Dentro del bloqueo. Valida todo antes de escribir; devuelve las categorías que cambiaron.
function guardarPresupuestosSinAvisar_(montos, mes) {
  const categorias = leerTabla_('Categorias');
  const filas = leerTabla_('Presupuestos');
  const vigentes = presupuestosVigentes_(filas, mes);
  const cambios = [];
  Object.keys(montos).forEach(id => {
    const categoria = buscarActiva_(categorias, id, 'La categoría');
    if (categoria.tipo !== 'gasto') throw new Error('Solo las categorías de gasto llevan presupuesto: "' + categoria.nombre + '".');
    const texto = montos[id] === null || montos[id] === undefined ? '' : String(montos[id]).trim().replace(',', '.');
    const monto = texto === '' ? 0 : redondear2_(texto);
    if (!isFinite(monto) || monto < 0) throw new Error('El presupuesto de "' + categoria.nombre + '" debe ser un número positivo.');
    if (monto !== (vigentes[id] || 0)) cambios.push({ categoria_id: id, monto: monto });
  });
  cambios.forEach(c => {
    const fila = filas.filter(f => f.categoria_id === c.categoria_id && f.desde === mes)[0];
    if (fila) actualizarFila_('Presupuestos', fila.id, { monto: c.monto });
    else agregarFilas_('Presupuestos', [{ id: nuevoId_(), categoria_id: c.categoria_id, monto: c.monto, desde: mes }]);
  });
  return cambios.map(c => c.categoria_id);
}
```

En `src/web/api.js`, reemplazar `obtenerDashboard` completa por:

```js
function obtenerDashboard(mes) {
  validarMes_(mes);
  const movs = leerTabla_('Movimientos');
  const divisiones = leerTabla_('Divisiones');
  const categorias = leerTabla_('Categorias');
  const dashboard = construirDashboard_({
    movs: movs,
    divisiones: divisiones,
    categorias: categorias,
    cuentas: leerTabla_('Cuentas'),
    tcUsd: Number(leerConfig_().ultimo_tc) || 0,
  }, mes);
  dashboard.porRevisar = movs.filter(m => m.estado === 'por_revisar').length +
    leerTabla_('Pendientes').filter(p => p.estado === 'pendiente').length;
  dashboard.presupuesto = presupuestoVsReal_(lineasCategoria_(movs, divisiones),
    presupuestosVigentes_(leerTabla_('Presupuestos'), mes), categorias, mes, hoyIso_());
  return dashboard;
}
```

- [ ] **Step 5: Ver que pasan**

Run: `node --test tests/api-presupuestos.test.js tests/migracion.test.js tests/catalogos.test.js` → Expected: PASS.
Run: `npm test && npm run lint` → Expected: PASS, sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/core/esquema.js src/web/api-presupuestos.js src/web/api.js tests/api-presupuestos.test.js tests/migracion.test.js tests/catalogos.test.js
git commit -m "feat: hoja Presupuestos (esquema v3), API y presupuesto en el dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Avisos de presupuesto por Telegram

**Files:**
- Create: `src/telegram/presupuestos.js`, `tests/telegram-presupuestos.test.js`
- Modify: `src/web/api-presupuestos.js` (`guardarPresupuestos` ajusta el registro)

**Interfaces:**
- Consumes: Task 1 (`presupuestoVsReal_`, `presupuestosVigentes_`, `umbralPresupuesto_`, `diasDelMes_`); Task 2 (`guardarPresupuestos`); fase 3 (`telegramVinculado_`, `enviarMensaje_`, `escaparHtml_`, `formatoMonto_`, `botonApp_`, `registrarAvisoTelegram_`).
- Produces:
  - `revisarPresupuestos_()`: nunca lanza; envía un mensaje con las categorías que cruzaron un umbral nuevo en el mes en curso.
  - `ajustarAlertasPresupuesto_(categoriaIds)`: fija sin avisar el umbral actual de esas categorías.
  - `textoAlertaPresupuesto_(filas, diasRestantes) → string`.
  - Script Property `ALERTAS_PRESUPUESTO` = `{ "YYYY-MM": { categoria_id: 0|80|100 } }`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/telegram-presupuestos.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoBot } = require('./telegram');

const URL_APP = 'https://script.google.com/macros/s/APP-PRUEBA/exec';

function entorno() {
  const e = entornoBot();
  e.sup = e.categoria('Supermercado');
  e.com = e.categoria('Comida fuera');
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: '100', [e.com]: '200' } });
  let n = 0;
  e.gasto = (monto, extra) => e.interno('agregarFilas_', 'Movimientos', [Object.assign({
    id: 'g' + (++n), fecha: '2026-10-13', tipo: 'gasto', monto, moneda: 'PEN', tc: 1, monto_pen: monto,
    cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.sup, comercio: 'Tottus', origen: 'manual', estado: 'confirmado',
    dividido: false, creado_en: '2026-10-13 10:00:00',
  }, extra)]);
  e.revisar = () => e.llamar('revisarPresupuestos_');
  e.registro = () => JSON.parse(e.propiedades.ALERTAS_PRESUPUESTO || '{}');
  e.limpiarTelegram();
  return e;
}

test('al cruzar el 80 % avisa una sola vez, con lo que queda y los días restantes', () => {
  const e = entorno();
  e.gasto(85);
  e.revisar();
  e.revisar();
  e.gasto(5);
  e.revisar();
  assert.strictEqual(e.enviados().length, 1);
  const m = e.ultimoEnviado();
  assert.strictEqual(m.text, '⚠️ 🛒 Supermercado: S/ 85.00 de S/ 100.00 (85 %). Te quedan S/ 15.00 para 19 días.');
  assert.deepStrictEqual(e.botones(m), [[{ text: 'Abrir la app', url: URL_APP }]]);
  assert.deepStrictEqual(e.registro(), { '2026-10': { [e.sup]: 80, [e.com]: 0 } });
});

test('pasar del 100 % de golpe avisa solo el 100 %; justo 100 % dice que llegó al tope', () => {
  const e = entorno();
  e.gasto(120);
  e.revisar();
  assert.strictEqual(e.ultimoEnviado().text, '🚨 🛒 Supermercado: S/ 120.00 de S/ 100.00 (120 %). Te pasaste por S/ 20.00.');
  e.gasto(200, { categoria_id: e.com });
  e.revisar();
  assert.strictEqual(e.ultimoEnviado().text, '🚨 🍽️ Comida fuera: S/ 200.00 de S/ 200.00 (100 %). Llegaste al tope.');
  e.revisar();
  assert.strictEqual(e.enviados().length, 2);
});

test('varias categorías que cruzan a la vez van en un solo mensaje, la más alta primero', () => {
  const e = entorno();
  e.gasto(85);
  e.gasto(190, { categoria_id: e.com });
  e.revisar();
  assert.strictEqual(e.enviados().length, 1);
  const lineas = e.ultimoEnviado().text.split('\n');
  assert.strictEqual(lineas.length, 2);
  assert.ok(lineas[0].startsWith('⚠️ 🍽️ Comida fuera: S/ 190.00'), lineas[0]);
  assert.ok(lineas[1].startsWith('⚠️ 🛒 Supermercado: S/ 85.00'), lineas[1]);
});

test('subir el presupuesto vuelve a armar el aviso; bajarlo por debajo de lo gastado no avisa', () => {
  const e = entorno();
  e.gasto(85);
  e.revisar();
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: '200' } });
  assert.deepStrictEqual(e.registro()['2026-10'][e.sup], 0);
  e.gasto(80);
  e.revisar();
  assert.strictEqual(e.enviados().length, 2);
  assert.match(e.ultimoEnviado().text, /S\/ 165\.00 de S\/ 200\.00 \(83 %\)/);
  e.llamar('guardarPresupuestos', { montos: { [e.sup]: '100' } });
  e.revisar();
  assert.strictEqual(e.enviados().length, 2);
  assert.strictEqual(e.registro()['2026-10'][e.sup], 100);
});

test('un mes nuevo empieza de cero y el registro solo guarda el mes en curso', () => {
  const e = entorno();
  e.gasto(85);
  e.revisar();
  e.fijarAhora('2026-11-02T09:00:00');
  e.gasto(90, { fecha: '2026-11-02' });
  e.revisar();
  assert.strictEqual(e.enviados().length, 2);
  assert.match(e.ultimoEnviado().text, /para 29 días\.$/);
  assert.deepStrictEqual(Object.keys(e.registro()), ['2026-11']);
});

test('con Telegram caído el aviso queda pendiente y sale en la siguiente revisión', () => {
  const e = entorno();
  e.gasto(85);
  e.telegram.falla = 'Bad Gateway';
  e.revisar();
  assert.strictEqual(e.registro()['2026-10'][e.sup], 0);
  assert.strictEqual(e.filas('Log').filter(l => l.origen === 'telegram' && l.nivel === 'aviso').length, 1);
  e.telegram.falla = null;
  e.revisar();
  assert.match(e.ultimoEnviado().text, /^⚠️ 🛒 Supermercado/);
});

test('un gasto de un mes pasado, el modo demo o el bot sin vincular no avisan', () => {
  const e = entorno();
  e.gasto(500, { fecha: '2026-09-10' });
  e.revisar();
  e.gasto(95);
  e.propiedades.MODO_DEMO = 'si';
  e.revisar();
  e.propiedades.MODO_DEMO = 'no';
  delete e.propiedades.TELEGRAM_CHAT_ID;
  e.revisar();
  assert.strictEqual(e.telegram.llamadas.length, 0);
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --test tests/telegram-presupuestos.test.js`
Expected: FAIL ("is not a function").

- [ ] **Step 3: Implementar**

`src/telegram/presupuestos.js`:

```js
// Avisos de presupuesto por Telegram: al cruzar el 80 % y el 100 % de una categoría en el
// mes en curso, una sola vez por umbral. Se llaman después de escribir, fuera del bloqueo,
// y nunca lanzan: un fallo queda en el Log y el aviso sale en la siguiente revisión.

function presupuestoDelMesActual_() {
  const hoy = hoyIso_();
  const mes = mesDe_(hoy);
  const vigentes = presupuestosVigentes_(leerTabla_('Presupuestos'), mes);
  if (!Object.keys(vigentes).length) return { mes: mes, hoy: hoy, filas: [] };
  const r = presupuestoVsReal_(lineasCategoria_(leerTabla_('Movimientos'), leerTabla_('Divisiones')),
    vigentes, leerTabla_('Categorias'), mes, hoy);
  return { mes: mes, hoy: hoy, filas: r.filas };
}

function leerAlertasPresupuesto_(mes) {
  const todo = JSON.parse(PropertiesService.getScriptProperties().getProperty('ALERTAS_PRESUPUESTO') || '{}');
  return todo[mes] || {};
}

// Solo se guarda el mes en curso: los meses viejos se descartan.
function guardarAlertasPresupuesto_(mes, registro) {
  const todo = {};
  todo[mes] = registro;
  PropertiesService.getScriptProperties().setProperty('ALERTAS_PRESUPUESTO', JSON.stringify(todo));
}

function textoAlertaPresupuesto_(filas, diasRestantes) {
  return filas.map(f => {
    const base = escaparHtml_((f.emoji ? f.emoji + ' ' : '') + f.nombre) + ': ' + formatoMonto_(f.gastado, 'PEN') +
      ' de ' + formatoMonto_(f.presupuesto, 'PEN') + ' (' + f.porcentaje + ' %).';
    if (f.porcentaje < 100) {
      return '⚠️ ' + base + ' Te quedan ' + formatoMonto_(f.queda, 'PEN') + ' para ' + diasRestantes + (diasRestantes === 1 ? ' día.' : ' días.');
    }
    return '🚨 ' + base + (f.queda < 0 ? ' Te pasaste por ' + formatoMonto_(-f.queda, 'PEN') + '.' : ' Llegaste al tope.');
  }).join('\n');
}

function revisarPresupuestos_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MODO_DEMO') === 'si' || !telegramVinculado_()) return;
  try {
    const actual = presupuestoDelMesActual_();
    const registro = leerAlertasPresupuesto_(actual.mes);
    const nuevas = actual.filas.filter(f => umbralPresupuesto_(f.porcentaje) > (registro[f.categoria_id] || 0));
    if (!nuevas.length) return;
    const diasRestantes = diasDelMes_(actual.mes) - Number(actual.hoy.slice(8, 10)) + 1;
    const app = botonApp_(props.getProperty('APP_URL') || '');
    enviarMensaje_(textoAlertaPresupuesto_(nuevas, diasRestantes), app.length ? [app] : null);
    nuevas.forEach(f => { registro[f.categoria_id] = umbralPresupuesto_(f.porcentaje); });
    guardarAlertasPresupuesto_(actual.mes, registro);
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}

// Al cambiar presupuestos: el registro pasa al umbral que ya alcanzan, sin avisar. Subir un
// presupuesto vuelve a armar el aviso; bajarlo por debajo de lo gastado no avisa.
function ajustarAlertasPresupuesto_(categoriaIds) {
  if (!categoriaIds.length) return;
  try {
    const actual = presupuestoDelMesActual_();
    const registro = leerAlertasPresupuesto_(actual.mes);
    categoriaIds.forEach(id => {
      const fila = actual.filas.filter(f => f.categoria_id === id)[0];
      registro[id] = fila ? umbralPresupuesto_(fila.porcentaje) : 0;
    });
    guardarAlertasPresupuesto_(actual.mes, registro);
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}
```

En `src/web/api-presupuestos.js`, dentro de `guardarPresupuestos`, después de la línea `const cambiadas = conBloqueo_(...)`, agregar:

```js
  ajustarAlertasPresupuesto_(cambiadas);
```

- [ ] **Step 4: Ver que pasan**

Run: `node --test tests/telegram-presupuestos.test.js` → Expected: PASS (7 pruebas).
Run: `npm test && npm run lint` → Expected: PASS, sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/presupuestos.js src/web/api-presupuestos.js tests/telegram-presupuestos.test.js
git commit -m "feat: avisos de presupuesto por Telegram al 80 % y al 100 %

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Revisar los avisos después de cada cambio

**Files:**
- Modify: `src/ingesta/revisar.js`, `src/telegram/webhook.js`, `src/web/api.js`, `src/web/api-revisar.js`
- Test: `tests/telegram-presupuestos.test.js` (agregar)

**Interfaces:**
- Consumes: `revisarPresupuestos_()` (Task 3).
- Produces: avisos disparados desde la lectura de correos, el bot (gasto escrito y botones) y la app (`guardarMovimiento`, `eliminarMovimiento`, `categorizarMovimiento`, `dividirMovimiento`, `quitarDivision`).

Nota: `revisarPresupuestos_` ya calcula solo el mes en curso, así que llamarla después de editar un mes pasado no avisa nada (spec §6). En la lectura de correos se llama solo si la vuelta creó movimientos, para no releer la hoja cada 5 minutos sin motivo.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `tests/telegram-presupuestos.test.js`:

```js
const { ASUNTOS, html } = require('./correos');

test('la lectura de correos avisa si un gasto nuevo cruza el umbral', () => {
  const e = entornoBot({ correos: [{ id: 'g1', de: 'notificaciones@notificacionesbcp.com.pe', asunto: ASUNTOS.debito, html: html('debito.html'), recibido: '2026-10-06T16:19:00' }] });
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '4444, 1111', yape: true });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.interno('guardarRegla_', 'TOTTUS', e.categoria('Supermercado'));
  e.llamar('guardarPresupuestos', { montos: { [e.categoria('Supermercado')]: '100' } });
  e.llamar('revisarCorreos');
  assert.match(e.ultimoEnviado().text, /^⚠️ 🛒 Supermercado: S\/ 89\.30 de S\/ 100\.00 \(89 %\)/);
});

test('un gasto escrito al bot y un gasto guardado en la app avisan', () => {
  const e = entorno();
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1234', yape: true });
  e.escribir('mercado 85 super');
  assert.match(e.ultimoEnviado().text, /^⚠️ 🛒 Supermercado: S\/ 85\.00/);
  e.llamar('guardarMovimiento', { fecha: '2026-10-13', tipo: 'gasto', monto: 190, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.com, comercio: 'Pardos' });
  assert.match(e.ultimoEnviado().text, /^⚠️ 🍽️ Comida fuera: S\/ 190\.00/);
});

test('categorizar un por revisar desde la app o desde un botón, y dividir, avisan', () => {
  const e = entorno();
  const mov = e.porRevisar({ monto: 85, monto_pen: 85 });
  e.llamar('categorizarMovimiento', { id: mov.id, categoria_id: e.sup });
  assert.match(e.ultimoEnviado().text, /^⚠️ 🛒 Supermercado: S\/ 85\.00/);
  const otro = e.porRevisar({ monto: 190, monto_pen: 190, comercio: 'PARDOS' });
  e.tocar(e.dato('c', otro, e.com));
  assert.match(e.ultimoEnviado().text, /^⚠️ 🍽️ Comida fuera: S\/ 190\.00/);
  const mixto = e.porRevisar({ monto: 40, monto_pen: 40, comercio: 'PLAZA VEA' });
  e.llamar('dividirMovimiento', { id: mixto.id, partes: [{ categoria_id: e.sup, monto: 30 }, { categoria_id: e.com, monto: 10 }] });
  assert.match(e.ultimoEnviado().text, /^🚨 🛒 Supermercado: S\/ 115\.00 de S\/ 100\.00 \(115 %\)/);
  assert.strictEqual(e.enviados().length, 3);
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --test tests/telegram-presupuestos.test.js`
Expected: FAIL en las 3 pruebas nuevas (no se envía ningún aviso).

- [ ] **Step 3: Ganchos**

`src/ingesta/revisar.js`, en `revisarCorreosSinBloqueo_`, después de `avisarPorRevisar_(r.nuevosPorRevisar);`:

```js
  if (r.creados) revisarPresupuestos_();
```

`src/telegram/webhook.js`, en `atenderTelegram_`:
- después del bloque `try { manejarBoton_(boton); } finally { ... }` y antes de su `return;`, agregar `revisarPresupuestos_();`;
- reemplazar las dos últimas líneas del `try`:

```js
    if (texto[0] === '/') manejarComando_(texto);
    else manejarEscrito_(texto, updateId);
```

por:

```js
    if (texto[0] === '/') {
      manejarComando_(texto);
    } else {
      manejarEscrito_(texto, updateId);
      revisarPresupuestos_();
    }
```

`src/web/api.js` y `src/web/api-revisar.js`, en `guardarMovimiento`, `categorizarMovimiento` y `dividirMovimiento` (que empiezan con `return conBloqueo_(() => {` y terminan con `  });\n}`):
- cambiar `return conBloqueo_(() => {` por `const resultado = conBloqueo_(() => {`;
- cambiar el cierre `  });\n}` de esa función por:

```js
  });
  revisarPresupuestos_();
  return resultado;
}
```

En `eliminarMovimiento` y `quitarDivision` (que terminan con `  });\n  return { ok: true };\n}`), agregar `  revisarPresupuestos_();` justo antes de `  return { ok: true };`.

- [ ] **Step 4: Ver que pasan**

Run: `node --test tests/telegram-presupuestos.test.js` → Expected: PASS (10 pruebas).
Run: `npm test && npm run lint` → Expected: PASS, sin errores (sin bot vinculado o sin presupuestos, `revisarPresupuestos_` no hace nada).

- [ ] **Step 5: Commit**

```bash
git add src/ingesta/revisar.js src/telegram/webhook.js src/web/api.js src/web/api-revisar.js tests/telegram-presupuestos.test.js
git commit -m "feat: revisar los avisos de presupuesto tras correos, bot y cambios en la app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Presupuestos en /mes y en el modo demo

**Files:**
- Modify: `src/telegram/mensajes.js` (`textoMes_`), `src/telegram/resumen.js` (`resumenDelMes_`), `src/setup/demo.js`
- Test: `tests/mensajes.test.js`, `tests/telegram-resumen.test.js`, `tests/demo.test.js` (agregar)

**Interfaces:**
- Consumes: Task 1 y 2.
- Produces: `textoMes_(mes, resumen, porCategoria, presupuesto?)` con la sección "Presupuestos" si hay categorías en `alerta` o `pasado`; `generarDatosDemo_(hoyIso).presupuestos` (6 filas); `cargarDemo` las guarda.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `tests/mensajes.test.js`:

```js
test('textoMes_ agrega las categorías en alerta o pasadas del presupuesto', () => {
  const resumen = { ingresos: 0, gastos: 0, ahorro: 0, tasaAhorro: null };
  const base = f('textoMes_', '2026-10', resumen, []);
  assert.strictEqual(f('textoMes_', '2026-10', resumen, [], { filas: [
    { nombre: 'Comida fuera', emoji: '🍽️', porcentaje: 81, queda: 75, estado: 'alerta' },
    { nombre: 'Súper & más', emoji: '🛒', porcentaje: 104, queda: -24, estado: 'pasado' },
    { nombre: 'Bodega', emoji: '🏪', porcentaje: 20, queda: 40, estado: 'ok' },
  ] }), base + '\n\n<b>Presupuestos</b>\n• 🍽️ Comida fuera 81 % · quedan S/ 75.00\n• 🛒 Súper &amp; más 104 % · pasado por S/ 24.00');
  assert.strictEqual(f('textoMes_', '2026-10', resumen, [], { filas: [{ nombre: 'Bodega', emoji: '', porcentaje: 20, queda: 40, estado: 'ok' }] }), base);
});
```

Agregar al final de `tests/telegram-resumen.test.js`:

```js
test('/mes muestra los presupuestos en alerta', () => {
  const e = entornoBot();
  e.llamar('guardarPresupuestos', { montos: { [e.categoria('Supermercado')]: '50' } });
  gasto(e);
  e.escribir('/mes');
  assert.match(e.ultimoEnviado().text, /\n\n<b>Presupuestos<\/b>\n• 🛒 Supermercado 92 % · quedan S\/ 4\.10$/);
});
```

Agregar al final de `tests/demo.test.js`:

```js
test('el demo trae 6 presupuestos con alguna categoría en alerta y otra pasada', () => {
  const e = crearEntorno();
  const d = e.llamar('generarDatosDemo_', '2026-10-20');
  assert.strictEqual(d.presupuestos.length, 6);
  assert.ok(d.presupuestos.every(p => p.desde === '2026-08' && p.monto >= 50));
  const r = e.llamar('presupuestoVsReal_', e.llamar('lineasCategoria_', d.movimientos, []),
    e.llamar('presupuestosVigentes_', d.presupuestos, '2026-10'), d.categorias, '2026-10', '2026-10-20');
  const estados = r.filas.map(x => x.estado);
  assert.ok(estados.indexOf('alerta') >= 0 && estados.indexOf('pasado') >= 0, estados.join(', '));
  e.llamar('cargarDemo');
  assert.strictEqual(e.libros[e.propiedades.DEMO_SHEET_ID]._hojas.Presupuestos.length, 7);
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --test tests/mensajes.test.js tests/telegram-resumen.test.js tests/demo.test.js`
Expected: FAIL en las 3 pruebas nuevas.

- [ ] **Step 3: Implementar**

En `src/telegram/mensajes.js`, `textoMes_`: cambiar la firma a `function textoMes_(mes, resumen, porCategoria, presupuesto) {` y, justo antes de `return lineas.join('\n');`, agregar:

```js
  const enAlerta = presupuesto ? presupuesto.filas.filter(f => f.estado !== 'ok') : [];
  if (enAlerta.length) {
    lineas.push('', '<b>Presupuestos</b>');
    enAlerta.forEach(f => lineas.push('• ' + escaparHtml_((f.emoji ? f.emoji + ' ' : '') + f.nombre) + ' ' + f.porcentaje + ' % · ' +
      (f.queda >= 0 ? 'quedan ' + formatoMonto_(f.queda, 'PEN') : 'pasado por ' + formatoMonto_(-f.queda, 'PEN'))));
  }
```

En `src/telegram/resumen.js`, reemplazar `resumenDelMes_` por:

```js
function resumenDelMes_(mes) {
  const movs = leerTabla_('Movimientos');
  const categorias = leerTabla_('Categorias');
  const lineas = lineasCategoria_(movs, leerTabla_('Divisiones'));
  const presupuesto = presupuestoVsReal_(lineas, presupuestosVigentes_(leerTabla_('Presupuestos'), mes), categorias, mes, hoyIso_());
  return textoMes_(mes, resumenMes_(movs, mes), gastoPorCategoria_(lineas, categorias, mes), presupuesto);
}
```

En `src/setup/demo.js`, en `generarDatosDemo_`, reemplazar `return { cuentas: cuentas, categorias: categorias, movimientos: movimientos };` por:

```js
  // Presupuestos sobre lo gastado este mes: factor < 1 queda pasado, ~1.15 en alerta, > 1.3 holgado.
  const mes = hoyIso.slice(0, 7);
  const gastoDelMes = nombre => movimientos
    .filter(m => m.categoria_id === cat(nombre) && m.tipo === 'gasto' && m.fecha.slice(0, 7) === mes)
    .reduce((s, m) => s + m.monto_pen, 0);
  const presupuestos = [['Supermercado', 1.15], ['Comida fuera', 0.8], ['Transporte', 2], ['Bodega', 1.6], ['Suscripciones', 1.4], ['Salud y gym', 1.5]]
    .map((p, i) => ({
      id: 'demo-ppto-' + (i + 1), categoria_id: cat(p[0]),
      monto: Math.max(50, Math.ceil(gastoDelMes(p[0]) * p[1] / 10) * 10), desde: sumarMeses_(mes, -2),
    }));
  return { cuentas: cuentas, categorias: categorias, movimientos: movimientos, presupuestos: presupuestos };
```

En `cargarDemo`, después de `agregarFilas_('Movimientos', datos.movimientos);`:

```js
      agregarFilas_('Presupuestos', datos.presupuestos);
```

- [ ] **Step 4: Ver que pasan**

Run: `node --test tests/mensajes.test.js tests/telegram-resumen.test.js tests/demo.test.js` → Expected: PASS.
Si la prueba del demo falla porque, con la semilla fija, ninguna categoría queda en `alerta` o en `pasado`, ajustar solo los factores de `Supermercado` o `Comida fuera` y registrar el cambio como Ruling.
Run: `npm test && npm run lint` → Expected: PASS, sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/mensajes.js src/telegram/resumen.js src/setup/demo.js tests/mensajes.test.js tests/telegram-resumen.test.js tests/demo.test.js
git commit -m "feat: presupuestos en /mes y en los datos de demo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Pestaña Presupuestos y bloque del Inicio

**Files:**
- Create: `src/web/vista-presupuestos.html`
- Modify: `src/web/Index.html`, `src/web/vista-inicio.html`, `src/web/estilos.html`, `tests/ui/stub.js`

**Interfaces:**
- Consumes: `obtenerPresupuestos`, `guardarPresupuestos` (Task 2), `obtenerDashboard(mes).presupuesto` (Task 2); en el cliente `api`, `aviso`, `mostrar`, `esc`, `dinero`, `nombreMes`, `estado`, `$`.
- Produces: `VISTAS.presupuestos`; `bloquePresupuesto(p)` en vista-inicio.

- [ ] **Step 1: Datos simulados**

En `tests/ui/stub.js`:
- Dentro del objeto `obtenerDashboard`, después de `mes: '2026-10', porRevisar: 4,`, agregar:

```js
      presupuesto: {
        filas: [
          { categoria_id: 'c2', nombre: 'Comida fuera', emoji: '🍽️', color: '#ffb347', gastado: 412, presupuesto: 400, porcentaje: 103, queda: -12, estado: 'pasado', ritmo: 42 },
          { categoria_id: 'c1', nombre: 'Supermercado', emoji: '🛒', color: '#3ddc97', gastado: 512, presupuesto: 600, porcentaje: 85, queda: 88, estado: 'alerta', ritmo: 42 },
          { categoria_id: 'c3', nombre: 'Transporte', emoji: '🚕', color: '#7c5cff', gastado: 96, presupuesto: 250, porcentaje: 38, queda: 154, estado: 'ok', ritmo: 42 },
        ],
        total: { presupuesto: 1250, gastado: 1020 }, sinPresupuesto: 380,
      },
```

- Dentro de `DATOS`, después de `probarTelegram: { ok: true },`:

```js
    obtenerPresupuestos: {
      mes: '2026-10', montos: { c1: 600, c2: 400, c3: 250 },
      referencia: { c1: { mesPasado: 548.2, promedio3: 571.4 }, c2: { mesPasado: 383, promedio3: 402.7 }, c5: { mesPasado: 141.5, promedio3: 150 } },
      categorias: CATEGORIAS.filter(c => c.tipo === 'gasto'),
    },
    guardarPresupuestos: { cambiadas: 1, mes: '2026-10', montos: { c1: 600, c2: 450, c3: 250 }, referencia: {}, categorias: [] },
```

- [ ] **Step 2: Ver que falta**

Run: `node tests/ui/ver.js "mostrar('presupuestos')" vista`
Expected: el texto de la salida es "Vista no disponible.".

- [ ] **Step 3: Vista Presupuestos**

`src/web/vista-presupuestos.html`:

```html
<script>
'use strict';
// Pestaña Presupuestos: un monto por categoría de gasto, que rige desde el mes actual.
VISTAS.presupuestos = async function (cont) {
  const p = await api('obtenerPresupuestos');
  const ref = id => p.referencia[id] || { mesPasado: 0, promedio3: 0 };
  const filas = p.categorias.map(c =>
    '<div class="fila-presupuesto"><span class="nombre">' + esc(c.emoji + ' ' + c.nombre) + '</span>' +
    '<input class="entrada num" inputmode="decimal" data-presupuesto="' + esc(c.id) + '" value="' + (p.montos[c.id] ? esc(p.montos[c.id]) : '') +
    '" placeholder="Sin presupuesto" aria-label="Presupuesto de ' + esc(c.nombre) + '">' +
    '<span class="tenue ref">Mes pasado ' + dinero(ref(c.id).mesPasado) + ' · promedio ' + dinero(ref(c.id).promedio3) + '</span></div>').join('');
  cont.innerHTML = '<div class="cabecera"><h1>Presupuestos</h1></div>' +
    '<section class="tarjeta seccion">' +
      '<div class="cabecera-seccion"><div class="etiqueta">Total presupuestado</div><div class="kpi num" id="p-total"></div></div>' +
      '<p class="tenue" style="margin:0 0 12px;font-size:13px">Los cambios rigen desde ' + esc(nombreMes(p.mes).toLowerCase()) +
        '; los meses anteriores no cambian. Deja vacío lo que no quieras controlar.</p>' +
      filas +
      '<div class="acciones"><button type="button" class="boton" id="p-copiar">Usar lo del mes pasado</button>' +
      '<button type="button" class="boton primario" id="p-guardar">Guardar</button></div>' +
    '</section>';
  const entradas = Array.from(cont.querySelectorAll('[data-presupuesto]'));
  const total = () => {
    $('#p-total').textContent = dinero(entradas.reduce((s, i) => s + (Number(i.value.trim().replace(',', '.')) || 0), 0));
  };
  entradas.forEach(i => { i.oninput = total; });
  total();
  $('#p-copiar').onclick = () => {
    entradas.forEach(i => {
      const m = ref(i.dataset.presupuesto).mesPasado;
      if (!i.value.trim() && m > 0) i.value = String(Math.ceil(m / 10) * 10);
    });
    total();
  };
  $('#p-guardar').onclick = async e => {
    e.target.disabled = true;
    try {
      const montos = {};
      entradas.forEach(i => { montos[i.dataset.presupuesto] = i.value; });
      const r = await api('guardarPresupuestos', { montos: montos });
      aviso(r.cambiadas ? 'Presupuestos guardados' : 'No había cambios');
      mostrar('presupuestos');
    } catch (err) {
      aviso(err.message, true);
      e.target.disabled = false;
    }
  };
};
</script>
```

- [ ] **Step 4: Bloque del Inicio, navegación y estilos**

En `src/web/vista-inicio.html`:
- Dentro de `cont.innerHTML`, entre `kpi('Tasa de ahorro', …) +` y `bloqueCategorias(d.categorias) +`, agregar `bloquePresupuesto(d.presupuesto) +`.
- Después de `if (franja) franja.onclick = () => mostrar('revisar');`, agregar:

```js
  const irPresupuestos = $('#ir-presupuestos');
  if (irPresupuestos) irPresupuestos.onclick = () => mostrar('presupuestos');
```

- Agregar después de la función `kpi`:

```js
function bloquePresupuesto(p) {
  const titulo = '<div class="etiqueta">Presupuesto del mes</div>';
  if (!p || !p.filas.length) {
    return '<section class="tarjeta ancho-2">' + titulo + '<div class="vacio">Aún no defines presupuestos para este mes. ' +
      '<button type="button" class="boton" id="ir-presupuestos">Definir presupuestos</button></div></section>';
  }
  const claseEstado = { ok: 'tenue', alerta: 'alerta', pasado: 'neg' };
  const filas = p.filas.map(f =>
    '<div class="fila-barra ppto clic" data-categoria="' + esc(f.categoria_id) + '"><span>' + esc(f.emoji + ' ' + f.nombre) + '</span>' +
    '<span class="mini ppto"><i class="' + esc(f.estado) + '" style="width:' + Math.min(100, f.porcentaje) + '%"></i>' +
    '<b style="left:' + f.ritmo + '%" title="Dónde deberías ir a esta fecha"></b></span>' +
    '<span class="der num">' + dinero(f.gastado) + '<span class="tenue de-ppto"> de ' + dinero(f.presupuesto) + '</span></span>' +
    '<span class="der num ' + claseEstado[f.estado] + '">' + f.porcentaje + '%</span></div>').join('');
  return '<section class="tarjeta ancho-2">' + titulo + '<div class="filas">' + filas + '</div>' +
    '<div class="pie-ppto"><span>Total: <b class="num">' + dinero(p.total.gastado) + '</b> de ' + dinero(p.total.presupuesto) + '</span>' +
    '<span class="tenue">Sin presupuesto: ' + dinero(p.sinPresupuesto) + '</span></div></section>';
}
```

En `src/web/Index.html`:
- En `<nav>` de la barra superior, después del botón de Movimientos: `<button class="pestana" data-vista="presupuestos">Presupuestos</button>`.
- En `.barra-movil`, después del botón de Movimientos: `<button class="pestana" data-vista="presupuestos"><span>🎯</span>Presupuestos</button>`.
- Después de `<?!= incluir_('web/vista-movimientos'); ?>`: `<?!= incluir_('web/vista-presupuestos'); ?>`.

En `src/web/estilos.html`, antes de la línea `@media` del celular (la que contiene `.barra nav { display: none; }`), agregar:

```css
.alerta { color: var(--alerta); }
.fila-barra.ppto { grid-template-columns: minmax(90px, 150px) 1fr auto 44px; }
.mini.ppto { position: relative; overflow: visible; }
.mini.ppto i.ok { background: var(--positivo); }
.mini.ppto i.alerta { background: var(--alerta); }
.mini.ppto i.pasado { background: var(--negativo); }
.mini.ppto b { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: var(--texto); opacity: .55; border-radius: 1px; }
.pie-ppto { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 13px; padding: 10px 4px 0; margin-top: 6px; border-top: 1px solid var(--borde); }
.fila-presupuesto { display: grid; grid-template-columns: minmax(120px, 1fr) 130px; gap: 4px 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--borde); }
.fila-presupuesto .ref { grid-column: 1 / -1; font-size: 12px; }
```

Y dentro del bloque `@media` del celular:

```css
  .fila-barra.ppto { grid-template-columns: minmax(80px, 1fr) 48px auto 38px; }
  .de-ppto { display: none; }
  .barra-movil .pestana { min-width: 0; }
```

- [ ] **Step 5: Ver las pantallas**

Run:
```bash
node tests/ui/ver.js "mostrar('presupuestos')" vista .tmp-ppto-390.png 390
node tests/ui/ver.js "mostrar('presupuestos')" vista .tmp-ppto-1280.png 1280
node tests/ui/ver.js "mostrar('inicio')" vista .tmp-inicio-390.png 390
node tests/ui/ver.js "mostrar('inicio')" vista .tmp-inicio-1280.png 1280
node tests/ui/ver.js "mostrar('inicio');setTimeout(function(){document.getElementById('vista').innerHTML=bloquePresupuesto(null)},800)" vista .tmp-inicio-vacio.png 390
```
Expected: en cada salida `error: null`.
- La de presupuestos contiene "Total presupuestado", "Usar lo del mes pasado" y "Mes pasado S/ 548.20".
- La del inicio contiene "Presupuesto del mes", "Comida fuera" y "Sin presupuesto: S/ 380.00".
- La vacía contiene "Definir presupuestos".

Abrir las capturas con Read y verificar:
- a 390 px, sin desborde horizontal y con la barra inferior de 5 pestañas legible;
- las barras de color con la marca de ritmo;
- el mismo estilo que los demás bloques.

Borrar las `.tmp-*.png`.
Run: `npm run lint && npm test` → Expected: sin errores, PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/vista-presupuestos.html src/web/vista-inicio.html src/web/Index.html src/web/estilos.html tests/ui/stub.js
git commit -m "feat: pestaña Presupuestos y bloque Presupuesto del mes en el Inicio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Documentación, v0.5.0, despliegue y prueba real

**Files:**
- Modify: `README.md`, `docs/arquitectura.md`, `CHANGELOG.md`, `package.json`

- [ ] **Step 1: README**

- Cambiar `## Qué hace hoy (v0.3)` por `## Qué hace hoy (v0.5)`.
- Después de la línea del **Bot de Telegram**, agregar:

```markdown
- **Presupuestos por categoría:** pones un monto a las categorías que quieres controlar (con lo que gastaste el mes pasado como referencia), el Inicio muestra cuánto llevas contra lo planeado y el bot te avisa al llegar al 80 % y al 100 %.
```

- En la tabla de `## Hoja de ruta`, reemplazar las filas de v0.4 y v0.5 por:

```markdown
| v0.4 | Gemini: foto de boleta para dividir compras (a decidir con el uso real) | ⏸️ |
| v0.5 | Presupuestos por categoría y avisos por Telegram | ✅ |
| v0.6 | Próximos pagos: estado de cuenta de la tarjeta y pagos recurrentes | ⏳ |
| v0.7 | Plantilla "Hacer una copia" y pulido del README | ⏳ |
```

- [ ] **Step 2: Arquitectura**

En `docs/arquitectura.md`, en `## Modelo de datos`, agregar al final de esa sección:

```markdown
- **Presupuestos** (`id, categoria_id, monto, desde`): cada fila vale desde su mes (`desde`, `YYYY-MM`) hasta que otra más reciente de la misma categoría la reemplaza; monto 0 = sin presupuesto. Cambiar un presupuesto agrega o actualiza la fila del mes actual, así que los meses anteriores no cambian. Los avisos ya enviados por mes y categoría se guardan en la propiedad del script `ALERTAS_PRESUPUESTO`.
```

- [ ] **Step 3: CHANGELOG y versión**

En `CHANGELOG.md`, antes de `## [0.3.0] — 2026-10-13`:

```markdown
## [0.5.0] — 2026-10-13

### Agregado
- Pestaña Presupuestos: un monto mensual por categoría de gasto, con el gasto del mes pasado y el promedio de 3 meses como referencia, y "Usar lo del mes pasado".
- Bloque "Presupuesto del mes" en el Inicio: gastado vs presupuesto, color de alerta, marca de ritmo, total y gasto sin presupuesto.
- Avisos por Telegram al cruzar el 80 % y el 100 % de una categoría (una vez por umbral y por mes).
- `/mes` muestra las categorías en alerta o pasadas.
- Presupuestos en los datos de demo.

### Cambiado
- Esquema de la hoja v3 (migración automática): hoja nueva `Presupuestos`.
- La v0.4 (Gemini) queda en pausa hasta decidirla con el uso real.
```

En `package.json`, cambiar `"version": "0.3.0"` por `"version": "0.5.0"`.

- [ ] **Step 4: Verificar y commit**

Run: `npm test && npm run lint` → Expected: PASS, sin errores.

```bash
git add README.md docs/arquitectura.md CHANGELOG.md package.json
git commit -m "docs: presupuestos y versión 0.5.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Desplegar**

Run: `npm run deploy` → Expected: "Despliegue actualizado", con la misma URL. No hay permisos nuevos.

- [ ] **Step 6: Prueba real con Bruno**

Pedirle, en orden:
1. Abrir la app (al abrirla, la hoja migra al esquema v3) y entrar a **Presupuestos**: ver las referencias y poner montos a 3 o 4 categorías → **Guardar**.
2. En el **Inicio**, ver el bloque "Presupuesto del mes" con las barras, el ritmo y "Sin presupuesto".
3. Poner a una categoría un presupuesto apenas por encima de lo gastado (por ejemplo, gastado S/ 85 → presupuesto S/ 100) y luego registrar por el bot un gasto que la cruce (`prueba 10 <categoría>`). Expected: llega el aviso ⚠️ o 🚨. Luego `/deshacer` y restaurar el presupuesto real.
4. `/mes` en el chat: aparece la sección "Presupuestos" si hay alguna en alerta.
