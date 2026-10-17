# Préstamos, descripción desde el bot y guía para otros bancos — Plan de implementación (v0.9.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar préstamos a familia y amigos (que no cuentan como gasto ni ingreso), restar reembolsos de gastos compartidos, cambiar la descripción de un movimiento desde el bot y documentar cómo adaptar la app a otros bancos con Claude.

**Architecture:** Las categorías ganan un `rol` (`prestamo` | `reembolso`). Un filtro único (`movimientosQueCuentan_`) saca esos movimientos de todos los totales. Dos hojas nuevas (`Prestamos`, `Abonos`) se mantienen en sincronía con Movimientos mediante `sincronizarPrestamos_`, que se llama en cada camino que escribe o borra un movimiento. La lógica pura vive en `src/core/prestamos.js`; la que toca la hoja, en `src/web/api-prestamos.js`; el bot, en `src/telegram/prestamos.js` y `src/telegram/descripcion.js`.

**Tech Stack:** Google Apps Script (V8), Google Sheets, API de bots de Telegram, `node:test` con el arnés `tests/harness.js`, ESLint.

**Spec:** [docs/superpowers/specs/2026-10-16-prestamos-descripcion-bancos-design.md](../specs/2026-10-16-prestamos-descripcion-bancos-design.md)

## Global Constraints

- Versión **0.9.0**: `package.json` y `VERSION_APP` (`src/core/version.js`) juntos (hay prueba). `VERSION_ESQUEMA` pasa de 5 a **6**.
- Lógica pura en `src/core/` sin servicios de Google. Solo `src/core/repo.js` toca la hoja. Toda escritura va dentro de `conBloqueo_`.
- Funciones internas con guion bajo final (`foo_`). Las que llama el navegador (`google.script.run`) van sin guion.
- Textos del bot en HTML de Telegram: todo dato de la hoja pasa por `escaparHtml_`. Cada `callback_data` ocupa ≤ 64 bytes (ids con `compactarId_`).
- Sin datos personales en el repo: fixtures y demo con nombres inventados ("Ana Prueba", "Juan Prueba").
- Préstamos solo en PEN. Se usa `monto_pen` del movimiento.
- Estilo de código y comentarios en español, como el resto del repo. Después de cada tarea, `npm test` y `npm run lint` en verde.
- Cambiar los teclados del bot rompe pruebas existentes que cuentan filas o botones (p. ej. `tests/telegram-botones.test.js`). Se actualizan en la misma tarea, nunca se borran.

## Review Focus

1. **El nombre del correo de devolución no coincide exactamente con el del préstamo** ("JUAN PEREZ G." frente a "Juan Pérez"). La persona espera ver igual su préstamo arriba en "¿de qué?" → prueba en la Tarea 3 (`prestamosSugeridos_`).
2. **Doble toque o mensaje viejo en el botón de abono.** No debe crear dos abonos → prueba en la Tarea 6.
3. **Responder a un mensaje del bot que no es de un movimiento** (resumen, /pagos). Debe tratarse como texto normal y no dar error → prueba en la Tarea 9.
4. **Quitar el rol o desactivar la categoría de préstamos.** Sus movimientos vuelven a contar y sus reglas se reanudan → pruebas en las Tareas 2 y 5.
5. **Importar datos de una versión anterior.** La importación fija `version_esquema` sin migrar, así que los roles no se aplicarían → prueba en la Tarea 11.

---

### Task 1: Roles de categoría y esquema 6

**Files:**
- Modify: `src/core/esquema.js`, `src/core/catalogos.js`, `src/core/repo.js` (`migrarSiHaceFalta_`), `src/setup/asistente.js:8`, `src/setup/demo.js:24`, `src/web/api.js` (`guardarCategoria`)
- Create: `src/core/roles.js`
- Test: `tests/roles.test.js`, `tests/migracion.test.js`, `tests/catalogos.test.js`

**Interfaces:**
- Produces:
  - `ROLES_CATEGORIA = { prestamo: 'gasto', reembolso: 'ingreso' }` (rol → tipo exigido)
  - `rolDe_(categorias, categoriaId) -> '' | 'prestamo' | 'reembolso'`: el rol de una categoría **activa**. Una desactivada da `''`.
  - `categoriaConRol_(categorias, rol) -> categoria | null`: la activa con ese rol.
  - `normalizarCategoria_` devuelve además `rol`.
  - `asegurarRolesPrestamo_()`: dentro del bloqueo, idempotente.
  - Hojas `Prestamos`: `id, persona, monto, fecha, fecha_promesa, movimiento_id, estado, nota, creado_en`. Hojas `Abonos`: `id, prestamo_id, fecha, monto, movimiento_id`. Categorias suma `['rol', 'texto']`.

- [ ] **Step 1: Pruebas que fallan**

```js
test('normalizarCategoria_ valida el rol', () => {
  const e = crearEntorno();
  const n = (d, ex) => e.interno('normalizarCategoria_', d, ex || [], '');
  assert.strictEqual(n({ nombre: 'Préstamos', tipo: 'gasto', rol: 'prestamo' }).rol, 'prestamo');
  assert.strictEqual(n({ nombre: 'Sueldo', tipo: 'ingreso' }).rol, '');
  assert.throws(() => n({ nombre: 'X', tipo: 'ingreso', rol: 'prestamo' }), /préstamo.*gasto/i);
  assert.throws(() => n({ nombre: 'X', tipo: 'gasto', rol: 'otro' }), /rol/i);
  const ya = [{ id: 'a', nombre: 'Préstamos', tipo: 'gasto', rol: 'prestamo', activa: true }];
  assert.throws(() => n({ nombre: 'Fiados', tipo: 'gasto', rol: 'prestamo' }, ya), /Ya hay una categoría.*"Préstamos"/);
});
test('rolDe_ ignora categorías desactivadas', () => { /* activa → 'prestamo'; activa:false → '' */ });
test('migrar a esquema 6 marca "Reembolsos" y "Prestamos" sin tildes, o crea "Préstamos 🤝"', () => {
  // libro v5 con categoría gasto "PRESTAMOS" e ingreso "Reembolsos" → roles asignados, sin crear otra
  // libro v5 sin categoría de préstamos → se crea { nombre: 'Préstamos', emoji: '🤝', tipo: 'gasto', rol: 'prestamo' }
  // segunda migración no duplica; hojas Prestamos y Abonos existen con sus encabezados
});
test('las categorías por defecto traen Préstamos y Reembolsos con su rol', () => { /* asistente */ });
```

- [ ] **Step 2: `npm test`.** Esperado: FAIL (`rol` undefined).
- [ ] **Step 3: Implementar.**
  - Esquema: `VERSION_ESQUEMA = 6`, la columna `rol` y las dos hojas.
  - `CATEGORIAS_POR_DEFECTO`: entradas `[nombre, emoji, tipo, rol?]`. Agregar `['Préstamos', '🤝', 'gasto', 'prestamo']` antes de `'Otros'` y poner `'reembolso'` en `Reembolsos`. El asistente y la demo pasan `rol: c[3] || ''`.
  - `normalizarCategoria_`: el rol es `''` o una clave de `ROLES_CATEGORIA` con su tipo. Es único entre las activas (excepto `idActual`). Mensaje: `Ya hay una categoría marcada como préstamo: "X".` / `… como reembolso: "X".`
  - `asegurarRolesPrestamo_` (en `src/core/roles.js`, como `asegurarAmbitos_`):
    - Por cada rol sin categoría activa que lo tenga, busca una activa de su tipo por `normalizarTexto_(nombre)` en `['PRESTAMO', 'PRESTAMOS']` o `['REEMBOLSO', 'REEMBOLSOS']`.
    - Si la encuentra, le pone el rol. Si no, solo para `prestamo`, crea "Préstamos 🤝". Para `reembolso` no crea nada.
    - Se llama en `migrarSiHaceFalta_` después de `asegurarAmbitos_()`.
- [ ] **Step 4: `npm test`.** Esperado: PASS (incluidas las pruebas viejas de migración y catálogos).
- [ ] **Step 5: Commit** `feat: rol de préstamo y reembolso en categorías (esquema 6)`

---

### Task 2: Los préstamos y reembolsos no cuentan en los totales

**Files:**
- Modify: `src/core/agregados.js`, `src/core/presupuestos.js`, `src/web/api.js` (`obtenerDashboard`), `src/web/api-presupuestos.js`, `src/telegram/resumen.js`, `src/telegram/presupuestos.js`, `src/telegram/mensajes.js` (`textoResumen_`)
- Test: `tests/agregados.test.js`, `tests/presupuestos.test.js`, `tests/telegram-resumen.test.js`

**Interfaces:**
- Consumes: `rolDe_` (Tarea 1).
- Produces: `movimientosQueCuentan_(movs, categorias) -> movs`. Saca gastos con rol `prestamo` e ingresos con rol `reembolso`. Las transferencias y los gastos negativos (reembolsos de gasto) quedan.

- [ ] **Step 1: Pruebas que fallan**

```js
test('préstamo y devolución no cambian gastos, ingresos ni tendencia; sí los saldos', () => {
  // movs: gasto 200 en cat rol prestamo, ingreso 50 en cat rol reembolso, gasto 100 Comida
  const d = e.interno('construirDashboard_', datos, '2026-10');
  assert.deepStrictEqual([d.resumen.gastos, d.resumen.ingresos], [100, 0]);
  assert.ok(!d.categorias.some(c => c.categoria_id === prestamos));
  assert.strictEqual(d.saldos.find(s => s.id === cuenta).saldo_pen, inicial - 200 + 50 - 100);
});
test('un gasto negativo resta de su categoría y del presupuesto', () => {
  // Comida 120 y −40 → gastoPorCategoria 80; presupuestoVsReal gastado 80
});
test('categoría solo con reembolsos: gastado 0 y porcentaje 0, nunca negativo', () => {
  // Comida −40 sin otros gastos, presupuesto 100 → { gastado: 0, porcentaje: 0, estado: 'ok' }
});
test('desactivar la categoría de préstamos hace que sus movimientos vuelvan a contar', () => { /* Review Focus 4 */ });
test('/mes y el resumen diario no suman préstamos', () => { /* textoResumen_: "Hoy · S/ 100.00 en gastos" */ });
```

- [ ] **Step 2: `npm test`.** Esperado: FAIL.
- [ ] **Step 3: Implementar.**
  - `movimientosQueCuentan_` en `agregados.js`. `construirDashboard_` la usa para todo excepto `saldos`.
  - Aplicarla también donde se arma `lineasCategoria_` o `resumenMes_` fuera del dashboard: `obtenerDashboard` (presupuesto), `obtenerPresupuestos` (referencia), `resumenDelMes_`, `presupuestoDelMesActual_`, y los totales de `resumenDelDia_`. En `textoResumen_`, las líneas del día siguen listando todo (con 🤝 en préstamos y devoluciones), pero las sumas usan solo lo que cuenta: pasarle `cuentan` en `extras`.
  - `presupuestoVsReal_`: `gastado = Math.max(0, g)` antes de calcular el porcentaje (arregla el menor de 5a).
- [ ] **Step 4: `npm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: los préstamos y reembolsos no cuentan como gasto ni ingreso`

---

### Task 3: Núcleo puro de préstamos

**Files:**
- Create: `src/core/prestamos.js`
- Test: `tests/prestamos.test.js`

**Interfaces:**
- Produces:
  - `normalizarPrestamo_(datos) -> { persona, monto, fecha, fecha_promesa, nota }`: persona sin espacios de más (1–60 caracteres), monto > 0 (`redondear2_`), `fecha` ISO, `fecha_promesa` ISO o `''`, nota ≤ 200.
  - `normalizarAbono_(datos) -> { fecha, monto }`: monto > 0, fecha ISO.
  - `estadoSegunAbonos_(monto, abonos) -> 'pendiente' | 'pagado'`: pagado si la suma ≥ monto.
  - `listaPrestamos_(prestamos, abonos, hoyIso) -> { pendientes, pagados, total }`. Cada ítem es `{ ...prestamo, abonos: [ordenados por fecha], abonado, falta, vencido, dias }`.
    - `falta = max(0, monto − abonado)`. `dias` = días hasta `fecha_promesa` (`null` si no hay). `vencido = dias < 0`.
    - Pendientes: vencidos primero; luego por `fecha_promesa` ascendente (sin fecha al final); luego por `fecha`.
    - Pagados: por la fecha de su último abono, descendente. `total` = suma de `falta` de los pendientes.
  - `fechaPromesa_(opcion, hoyIso) -> string`:
    - `'manana'` → hoy + 1.
    - `'semana'` → próximo domingo (si hoy es domingo, hoy + 7).
    - `'quincena'` → el 15 si hoy < 15; si no, el último día del mes.
    - `'mes'` → el último día del mes (si hoy lo es, el último del mes siguiente).
    - `'sin'` → `''`.
  - `mismaPersona_(a, b) -> boolean`: normaliza con `normalizarTexto_`, quita puntos y compara las 2 primeras palabras.
  - `prestamosSugeridos_(pendientes, comercio, max) -> pendientes[]`: los de `mismaPersona_` primero, luego el resto por `fecha` descendente, hasta `max`.

- [ ] **Step 1: Pruebas que fallan**

```js
test('listaPrestamos_ calcula falta, vencidos primero y total', () => {
  const p = [
    { id: 'a', persona: 'Juan Prueba', monto: 200, fecha: '2026-10-01', fecha_promesa: '2026-10-20', estado: 'pendiente' },
    { id: 'b', persona: 'Ana Prueba', monto: 100, fecha: '2026-10-02', fecha_promesa: '2026-10-10', estado: 'pendiente' },
    { id: 'c', persona: 'Luis Prueba', monto: 50, fecha: '2026-09-01', fecha_promesa: '', estado: 'pagado' },
  ];
  const ab = [{ id: 'x', prestamo_id: 'a', fecha: '2026-10-05', monto: 50, movimiento_id: '' },
    { id: 'y', prestamo_id: 'c', fecha: '2026-09-03', monto: 50, movimiento_id: '' }];
  const r = e.interno('listaPrestamos_', p, ab, '2026-10-13');
  assert.deepStrictEqual(r.pendientes.map(x => [x.id, x.falta, x.vencido, x.dias]), [['b', 100, true, -3], ['a', 150, false, 7]]);
  assert.deepStrictEqual(r.pagados.map(x => x.id), ['c']);
  assert.strictEqual(r.total, 250);
});
test('fechaPromesa_', () => {
  const f = (o, h) => e.interno('fechaPromesa_', o, h);
  assert.strictEqual(f('manana', '2026-10-31'), '2026-11-01');
  assert.strictEqual(f('semana', '2026-10-13'), '2026-10-18');   // martes → domingo
  assert.strictEqual(f('semana', '2026-10-18'), '2026-10-25');   // domingo → el siguiente
  assert.strictEqual(f('quincena', '2026-10-13'), '2026-10-15');
  assert.strictEqual(f('quincena', '2026-10-15'), '2026-10-31');
  assert.strictEqual(f('mes', '2026-02-10'), '2026-02-28');
  assert.strictEqual(f('mes', '2026-10-31'), '2026-11-30');
  assert.strictEqual(f('sin', '2026-10-13'), '');
});
test('prestamosSugeridos_ pone primero a la misma persona aunque el correo la escriba distinto', () => {
  // pendientes de 'Juan Pérez' y 'Ana Prueba'; comercio 'JUAN PEREZ G.' → Juan primero (Review Focus 1)
});
test('normalizarPrestamo_ y normalizarAbono_ rechazan montos ≤ 0, fechas inválidas y persona vacía', () => {});
test('estadoSegunAbonos_: abonar de más deja pagado', () => {});
```

- [ ] **Step 2: `npm test`.** Esperado: FAIL.
- [ ] **Step 3: Implementar** las funciones en `src/core/prestamos.js`. Usar `sumarDias_`, `diasEntre_` y `fechaDeIso_` de `pagos.js`.
- [ ] **Step 4: `npm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: cálculo de préstamos, abonos y fechas prometidas`

---

### Task 4: Sincronizar préstamos con los movimientos y API web

**Files:**
- Create: `src/web/api-prestamos.js`
- Modify: `src/web/api.js` (`guardarMovimiento`, `eliminarMovimiento`, `obtenerDashboard`), `src/web/api-revisar.js` (`categorizarMovimiento`)
- Test: `tests/api-prestamos.test.js`

**Interfaces:**
- Consumes: Tareas 1–3.
- Produces (todas, salvo las públicas, se llaman dentro de `conBloqueo_`):
  - `sincronizarPrestamos_(previo, actual)`: `previo` y `actual` son movimientos o `null` (borrado). Se llama **antes** de escribir la fila del movimiento: si lanza, no se escribe nada.
    - `actual` con rol `prestamo`: crea el préstamo si no tiene uno vinculado (persona = `comercio || descripcion || 'Sin nombre'`, monto = `monto_pen`, fecha = `fecha`, `fecha_promesa` = `''`). Si ya tiene, sincroniza monto y fecha. Si el monto nuevo queda por debajo de lo abonado, lanza `El préstamo ya tiene abonos por S/ X: el monto no puede ser menor.`
    - `previo` tenía préstamo y `actual` ya no tiene rol `prestamo` (o es `null`): lo borra si no tiene abonos. Si tiene, lanza `Este préstamo ya tiene abonos: bórralos primero en Préstamos.`
    - `previo` tenía abono vinculado y `actual` ya no es ingreso con rol `reembolso` (o es `null`): borra el abono. Si sigue siéndolo: sincroniza monto y fecha.
    - En ambos casos de abono se recalcula el estado del préstamo con `estadoSegunAbonos_`.
  - `prestamoDeMovimiento_(movId) -> prestamo | null`, `abonoDeMovimiento_(movId) -> abono | null`
  - `abonarConMovimiento_(mov, prestamoId) -> { prestamo, falta, pagado }`: exige que `mov` sea un ingreso sin abono previo, que el préstamo exista y esté pendiente, y que haya una categoría con rol `reembolso`. Pone esa categoría, `estado: 'confirmado'` y crea el abono por `monto_pen`.
  - `reembolsoComoGasto_(mov, categoriaId) -> mov`: exige ingreso y una categoría de gasto activa sin rol. Deja `tipo: 'gasto'`, `monto: -|monto|`, `monto_pen: -|monto_pen|`, esa categoría, `ambito_id: ''` y `estado: 'confirmado'`. Llama a `sincronizarPrestamos_` (quita un abono previo).
  - `fijarFechaPromesa_(prestamoId, fechaIso)`.
  - Públicas, cada una con `conBloqueo_`:
    - `obtenerPrestamos() -> listaPrestamos_(…)`.
    - `guardarPrestamo(datos)`: crea un préstamo manual (sin movimiento) o edita persona, `fecha_promesa`, nota y monto. El monto solo se edita si no tiene movimiento, y no puede quedar debajo de lo abonado.
    - `eliminarPrestamo(id)`: solo los manuales; borra también sus abonos.
    - `registrarAbono(datos)`, `saldarPrestamo(id)` (abono en efectivo por lo que falta) y `eliminarAbono(id)` (solo los que no tienen movimiento). Las tres devuelven `obtenerPrestamos()`.
    - `resolverReembolso(datos: { id, prestamo_id? , categoria_id? })`: llama a `revisarPresupuestos_()` al final.
- Cambios en llamadas existentes:
  - `guardarMovimiento` y `eliminarMovimiento` llaman a `sincronizarPrestamos_(previo, actual)`.
  - `guardarMovimiento` con `datos.prestamo_id` en un ingreso con rol `reembolso` crea el abono tras guardar. Uno nuevo, o uno que pasa a ese rol, sin `prestamo_id`, lanza `Elige de qué es el reembolso.` Editar uno que ya era de ese rol no lo exige.
  - `categorizarMovimiento`:
    - Con una categoría de rol `reembolso`, exige `datos.prestamo_id` (→ `abonarConMovimiento_`).
    - `datos.reembolso_de = categoriaGastoId` (→ `reembolsoComoGasto_`).
    - Con rol `prestamo` pasa por `sincronizarPrestamos_`.
    - Un `datos.recordar` hacia una categoría con rol se ignora.
  - `obtenerDashboard` agrega `prestamos: { total, personas: pendientes.slice(0, 3).map(p => ({ persona, falta, vencido })) }`.

- [ ] **Step 1: Pruebas que fallan** (con `entornoInstalado`)

```js
test('categorizar un yapeo como Préstamos crea el préstamo; pasarlo a otra categoría lo borra', () => {
  // por_revisar gasto 200 comercio 'Juan Prueba' → categorizarMovimiento({ id, categoria_id: prestamos })
  // filas('Prestamos') → [{ persona: 'Juan Prueba', monto: 200, estado: 'pendiente', movimiento_id: id, fecha_promesa: '' }]
  // guardarMovimiento({ ...mov, categoria_id: comida }) → filas('Prestamos') vacía
});
test('con abonos, cambiar o borrar el movimiento del préstamo se rechaza y no escribe nada', () => {});
test('abonar con un yapeo recibido y luego borrar ese yapeo devuelve el préstamo a pendiente', () => {});
test('reembolso de cena: resolverReembolso con categoria_id convierte en gasto −40 en Comida', () => {
  // mov: { tipo: 'gasto', monto: -40, monto_pen: -40, categoria_id: comida, estado: 'confirmado' }
});
test('categorizar en Reembolsos sin decir de qué se rechaza', () => {});
test('saldarPrestamo crea el abono por lo que falta y lo marca pagado; eliminarAbono lo reabre', () => {});
test('abonar de más se acepta y queda pagado', () => {});
test('editar el monto del yapeo de un préstamo sincroniza el préstamo', () => {});
test('obtenerDashboard trae prestamos.total y hasta 3 personas, vencidos primero', () => {});
```

- [ ] **Step 2: `npm test`.** Esperado: FAIL.
- [ ] **Step 3: Implementar** según las interfaces.
- [ ] **Step 4: `npm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: préstamos y abonos sincronizados con los movimientos`

---

### Task 5: Reglas en pausa y Dividir

**Files:**
- Modify: `src/ingesta/resolver.js`, `src/telegram/escrito.js`, `src/telegram/registro.js`, `src/web/api-revisar.js` (`recordarComercio_`, `listarReglas`), `src/core/divisiones.js`
- Test: `tests/resolver.test.js`, `tests/escrito.test.js`, `tests/revisar.test.js`, `tests/dividir.test.js`

**Interfaces:**
- Consumes: `rolDe_`, `sincronizarPrestamos_`.
- Produces: `listarReglas()` devuelve cada regla con `en_pausa: boolean`.

- [ ] **Step 1: Pruebas que fallan**

```js
test('una regla hacia la categoría de préstamos no categoriza: el yapeo queda por revisar', () => {});
test('al quitar el rol, la misma regla vuelve a categorizar', () => { /* Review Focus 4 */ });
test('recordarComercio_ hacia una categoría con rol lanza "Los préstamos y reembolsos no se recuerdan."', () => {});
test('listarReglas marca en_pausa las que apuntan a una categoría con rol', () => {});
test('escrito "juan 200 yape prestamos" crea el gasto y el préstamo a "juan"', () => {});
test('escrito "+ juan 50 reembolsos" queda por revisar sin categoría (pasa por "¿de qué?")', () => {});
test('no se puede dividir con una parte en Préstamos o Reembolsos, ni un gasto negativo', () => {
  // mensajes: 'Los préstamos y reembolsos no se dividen.' / 'Un reembolso no se divide.'
});
```

- [ ] **Step 2: `npm test`.** Esperado: FAIL.
- [ ] **Step 3: Implementar.**
  - En `resolverMovimiento_` y `leerEscrito_`, una regla cuya categoría tiene rol se trata como si no hubiera regla.
  - En `registrarEscrito_`:
    - Categoría con rol `prestamo` (elegida por palabra): llama a `sincronizarPrestamos_(null, mov)`.
    - Categoría con rol `reembolso`: guarda con `categoria_id: ''` y `estado: 'por_revisar'`.
  - `deshacerUltimo_` llama a `sincronizarPrestamos_(mov, null)` antes de borrar.
  - `normalizarPartes_` recibe las categorías (ya las tiene) y rechaza los roles y `mov.monto < 0`.
- [ ] **Step 4: `npm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: reglas en pausa para préstamos y reembolsos; no se dividen`

---

### Task 6: Bot — prestar y "¿de qué es este reembolso?"

**Files:**
- Create: `src/telegram/prestamos.js`
- Modify: `src/telegram/acciones.js`, `src/telegram/mensajes.js`, `src/telegram/registro.js` (`manejarEscrito_`, `deshacerDesdeBot_` en acciones)
- Test: `tests/telegram-prestamos.test.js`, `tests/telegram-botones.test.js`

**Interfaces:**
- Consumes: Tareas 3–5.
- Produces:
  - Acciones nuevas en `callback_data` (documentarlas en el comentario de cabecera de `acciones.js`):
    - `f:<prestamoId>:<m|s|q|f|n>`: fecha prometida (mañana, semana, quincena, fin de mes, sin fecha).
    - `p:<movId>:<prestamoId>`: abono.
    - `g:<movId>:<categoriaGastoId>`: reembolso de un gasto.
    - `h:<movId>`: todas las categorías de gasto para el reembolso.
    - `w:<movId>`: volver al selector "¿de qué?".
  - `textoPrestamo_(prestamoEstado, mov, ctx) -> string`: `🤝 Préstamo a <b>Juan Prueba</b> · S/ 200.00`. Le agrega ` · vuelve el vie 23/10` (con `diaSemana_` y `fechaCorta_`) si tiene `fecha_promesa`, o `\n¿Para cuándo te lo devuelve?` si es nuevo.
  - `tecladoFechaPromesa_(prestamo) -> filas`: `[['Mañana', 'Esta semana'], ['Fin de quincena', 'Fin de mes'], ['Sin fecha']]`.
  - `mensajeReembolso_(mov, sugeridos, idsGastoFrecuentes, ctx) -> { texto, teclado }`:
    - Texto: `textoMovimiento_` + `\n¿De qué es este reembolso?`.
    - Botones: un botón por préstamo sugerido (`🤝 Préstamo de Juan Prueba (faltan S/ 200.00)`, uno por fila, máximo 4); luego las 3 categorías de gasto frecuentes sin rol; luego `[Otras categorías… (h), ← Volver (v)]`.
  - `textoAbono_(r) -> string`: `✓ Abono de <b>Juan Prueba</b> · faltan S/ 150.00`, o `✓ Juan Prueba te pagó todo 🎉`.
- Comportamiento de `manejarBoton_`:
  - `c` con categoría de rol `reembolso`: no categoriza; edita a `mensajeReembolso_` (con `prestamosSugeridos_(…, mov.comercio, 4)`).
  - `c` con rol `prestamo`: categoriza (pasa por `sincronizarPrestamos_`) y edita a `textoPrestamo_` + `tecladoFechaPromesa_`. No pregunta "¿Recordar?".
  - `p`: llama a `abonarConMovimiento_` y edita a `textoAbono_`. Un movimiento ya confirmado se responde con `textoYaEstaba_` sin abonar dos veces (la regla actual de `manejarBoton_` ya lo cubre si `p` no está en la lista de excepciones).
  - `g`: llama a `reembolsoComoGasto_` y edita a `textoCategorizado_(…, '')` con `· reembolso` + `tecladoConfirmado_` (Tarea 9; hasta entonces, `filaAmbitos_`).
  - `f`: llama a `fijarFechaPromesa_` y edita a `textoPrestamo_` sin teclado de fechas.
  - `d` (deshacer del bot) sobre un préstamo con abonos: responde el error de `sincronizarPrestamos_` en el mensaje.

- [ ] **Step 1: Pruebas que fallan** (con `entornoBot`)

```js
test('elegir Préstamos crea el préstamo y pregunta la fecha; "Esta semana" fija el domingo', () => {
  const e = entornoBot();
  const mov = e.porRevisar({ comercio: 'Juan Prueba', monto: 200, monto_pen: 200 });
  e.tocar(e.dato('c', mov, e.categoria('Préstamos')));
  assert.match(e.ultimoEditado().text, /🤝 Préstamo a <b>Juan Prueba<\/b> · S\/ 200\.00\n¿Para cuándo te lo devuelve\?$/);
  const p = e.filas('Prestamos')[0];
  e.tocar('f:' + e.interno('compactarId_', p.id) + ':s');
  assert.strictEqual(e.filas('Prestamos')[0].fecha_promesa, '2026-10-18');
  assert.match(e.ultimoEditado().text, /· vuelve el dom 18\/10$/);
});
test('elegir Reembolsos muestra primero el préstamo de la misma persona y abonar descuenta', () => {});
test('tocar dos veces el botón de abono no crea dos abonos', () => { /* Review Focus 2 */ });
test('reembolso de cena desde el bot: g resta de Comida fuera', () => {});
test('todos los callback_data nuevos caben en 64 bytes', () => {});
```

- [ ] **Step 2: `npm test`.** Esperado: FAIL.
- [ ] **Step 3: Implementar.** Las pruebas existentes de botones que cambien por el nuevo flujo se actualizan aquí.
- [ ] **Step 4: `npm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: el bot registra préstamos, su fecha y los abonos`

---

### Task 7: /prestamos y recordatorios

**Files:**
- Modify: `src/telegram/prestamos.js`, `src/telegram/webhook.js` (`manejarComando_`), `src/telegram/mensajes.js` (`TEXTO_AYUDA`), `src/telegram/pagos.js` (`recordarPagos`)
- Test: `tests/telegram-prestamos.test.js`, `tests/telegram-pagos.test.js`

**Interfaces:**
- Produces:
  - `textoPrestamos_(lista) -> string`:
    - Sin pendientes: `Nadie te debe nada 🙌`.
    - Con pendientes: `🤝 <b>Te deben S/ 350.00</b>` y una línea por pendiente: `• Juan Prueba · falta S/ 150.00 · vence vie 23/10`. Los vencidos dicen `⚠ venció dom 11/10`; sin fecha no se pone nada.
  - `textoRecordatorioPrestamos_(hoy, manana) -> string`: `🤝 <b>Préstamos</b>`, `Hoy Juan Prueba quedó en devolverte S/ 150.00`, `Mañana …`.
  - Clave de registro: `'pre:' + id + ':' + fecha_promesa`, en el mismo `PAGOS_RECORDADOS`.
- `recordarPagos`:
  - Calcula pagos y préstamos (pendientes con `dias === 0` o `dias === 1` y `falta > 0`).
  - Si hay ambos, envía **un** mensaje: `textoRecordatorio_` + `\n\n` + `textoRecordatorioPrestamos_`.
  - Sale temprano solo si no hay ninguno de los dos.
- `/prestamos` entra en `TEXTO_AYUDA` como `/prestamos — quién te debe`.

- [ ] **Step 1: Pruebas que fallan**

```js
test('/prestamos lista pendientes con total, vencidos marcados', () => {});
test('recordatorio: un día antes y el mismo día, sin repetir si el trigger corre dos veces', () => {
  // préstamo con fecha_promesa 2026-10-14 y hoy 2026-10-13 → "Mañana Juan Prueba quedó en devolverte S/ 200.00"
  // recordarPagos() otra vez → no envía nada; fijarAhora 14 → "Hoy …"
});
test('pago fijo y préstamo el mismo día van en un solo mensaje', () => {});
test('un préstamo pagado o sin fecha no se recuerda', () => {});
```

- [ ] **Step 2: `npm test`.** Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: `npm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: /prestamos y recordatorio de préstamos un día antes y el mismo día`

---

### Task 8: Web — sección Préstamos, tarjeta del Inicio, selector de reembolso y casilla de rol

**Files:**
- Modify: `src/web/vista-presupuestos.html`, `src/web/vista-inicio.html`, `src/web/vista-revisar.html`, `src/web/vista-movimientos.html` (formulario y lista), `src/web/vista-ajustes.html` (categorías y reglas), `src/web/estilos.html`
- Test: `tests/ui/` con `npm run ui` (capturas a 390 px y 1280 px) y revisión en Chrome

**Interfaces:**
- Consumes: `obtenerPrestamos`, `guardarPrestamo`, `eliminarPrestamo`, `registrarAbono`, `saldarPrestamo`, `eliminarAbono`, `resolverReembolso`, `dashboard.prestamos`, `listarReglas().en_pausa`, `categorizarMovimiento({ prestamo_id | reembolso_de })`, `guardarMovimiento({ prestamo_id })`.

- [ ] **Step 1: Presupuestos → sección "Préstamos"** debajo de "Pagos fijos al mes", con el mismo estilo de `seccionPagosFijos`.
  - Cabecera: "Te deben" y el total.
  - Una fila por pendiente: persona, `falta / monto` y fecha prometida. Si ya pasó, en `var(--alerta)` con "venció".
  - Al tocar una fila se abre un formulario con persona, fecha prometida y nota editables, la lista de abonos (con 🗑 en los de efectivo) y los botones **Registrar abono** (monto y fecha de hoy), **Ya me pagó todo** y, solo en los manuales, **Eliminar**.
  - Botón **Nuevo préstamo** y bloque "Pagados" plegado (`<details>`).
- [ ] **Step 2: Inicio → tarjeta "Te deben S/ X"** con hasta 3 personas (vencidos con ⚠) y enlace "Ver préstamos" a la pestaña Presupuestos. No se pinta si `dashboard.prestamos.total === 0`.
- [ ] **Step 3: Selector "¿De qué es este reembolso?"** en Por revisar y en el formulario de movimiento, al elegir la categoría con rol `reembolso`:
  - Préstamos pendientes (de `obtenerPrestamos`, ordenados igual que `prestamosSugeridos_`; se puede pedir al servidor junto con los catálogos) y categorías de gasto sin rol.
  - En Por revisar envía `categorizarMovimiento({ id, categoria_id, prestamo_id })` o `({ id, reembolso_de })`.
  - En un movimiento manual nuevo, elegir una categoría de gasto lo guarda como gasto con monto negativo.
- [ ] **Step 4: Movimientos.** 🤝 junto a préstamos y abonos (si la categoría tiene rol); los reembolsos de gasto muestran su monto negativo.
- [ ] **Step 5: Ajustes.**
  - En categorías, la casilla "Es préstamo" (gasto) o "Es devolución / reembolso" (ingreso), que envía `rol`.
  - En reglas, la etiqueta "en pausa (préstamos)" si `en_pausa`.
- [ ] **Step 6: Verificar.** Correr `npm run ui` con datos de la demo (Tarea 10) o del arnés y revisar a 390 px y 1280 px: la sección, la tarjeta, el selector y la casilla. Luego `npm test && npm run lint`.
- [ ] **Step 7: Commit** `feat: préstamos en la web, tarjeta del Inicio y selector de reembolso`

---

### Task 9: Descripción desde el bot

**Files:**
- Create: `src/telegram/descripcion.js`
- Modify: `src/core/movimientos.js`, `src/telegram/mensajes.js`, `src/telegram/acciones.js`, `src/telegram/cliente.js`, `src/telegram/webhook.js` (`atenderTelegram_`), `src/telegram/prestamos.js`, `src/web/api.js` (`listarMovimientos`), `src/web/api-revisar.js` (`obtenerPorRevisar`), `src/web/vista-movimientos.html`, `src/web/vista-revisar.html`
- Test: `tests/telegram-descripcion.test.js`, `tests/movimientos.test.js`, `tests/mensajes.test.js`, `tests/telegram-botones.test.js`

**Interfaces:**
- Produces:
  - En `movimientos.js`:
    - `DESCRIPCIONES_AUTOMATICAS = ['Transferencia entre mis cuentas', 'Pago de tarjeta']`.
    - `descripcionPropia_(mov) -> boolean`: hay descripción, no está en esa lista y no empieza con `'Falta el tipo de cambio'`.
    - `tituloMovimiento_(mov) -> string`: la descripción propia, si hay; si no, `comercio || descripcion || ''`.
    - `subtituloMovimiento_(mov) -> string`: el comercio cuando el título es la descripción propia; si no, `''`.
  - `listarMovimientos` y `obtenerPorRevisar` agregan `titulo` y `subtitulo` a cada movimiento.
  - En `mensajes.js`:
    - `textoMovimiento_` muestra `tituloMovimiento_ · cuando` y, si hay subtítulo, una línea `<i>comercio</i>`.
    - `textoRegistrado_` y `textoResumen_` usan `tituloMovimiento_`.
    - `botonDescripcion_(mov) -> [boton_('✏️ Descripción', 'e:' + id)]`.
    - `tecladoConfirmado_(mov, ctx) -> filas`: `filaAmbitos_(mov, ctx, false)` más la fila de `botonDescripcion_`. Reemplaza todos los `tecladoONulo_(filaAmbitos_(…))`.
    - `tecladoCategorias_`, `tecladoRecordar_`, `tecladoRegistrado_`, el mensaje "elige la cuenta en la app", `textoPrestamo_` (con y sin fechas) y `textoAbono_` terminan con la fila ✏️. `tecladoTodas_` y el selector de reembolso no la llevan.
  - En `cliente.js`: `pedirRespuesta_(texto, placeholder) -> result`, con `reply_markup: { force_reply: true, input_field_placeholder }`.
  - En `descripcion.js`:
    - `MAX_DESCRIPCION = 100`.
    - `movimientoDeTeclado_(replyMarkup) -> movId | ''`: primero el botón `e:`; si no hay, el primero cuya acción esté en `c o k v r s a d p g h w`, toma `partes[1]` con `expandirId_`.
    - `pedirDescripcion_(mov, avisoMessageId)`: envía `✏️ Escribe la descripción para <b>S/ 45.90</b> · TOTTUS PRIMAVERA` y guarda en `CacheService.getScriptCache()` la clave `'desc:' + message_id` con `JSON {m: movId, a: avisoMessageId}` por 21600 s.
    - `manejarRespuesta_(mensaje) -> boolean`: resuelve el movimiento desde la caché o desde `reply_to_message.reply_markup`; si no puede, devuelve `false`. Si puede, guarda la descripción (recortada a 100, vacía = borrar) con `conBloqueo_`, edita el aviso con `mensajeActual_` (si hay `messageId` del aviso), envía `✓ Descripción guardada` o `✓ Descripción borrada` y devuelve `true`.
    - `mensajeActual_(mov, ctx) -> { texto, teclado }`:
      - `por_revisar` → `mensajePorRevisar_`.
      - Origen `telegram` → `textoRegistrado_` + `tecladoRegistrado_`.
      - Rol `prestamo` → `textoPrestamo_`.
      - Transferencia → `textoMovimiento_` + `tecladoConfirmado_`.
      - Si no → `textoCategorizado_` + `tecladoConfirmado_`.
  - `atenderTelegram_`: si `mensaje.reply_to_message` existe y `manejarRespuesta_(mensaje)` devuelve `true`, termina; si no, sigue como hoy.
  - Acción `e:<movId>` en `manejarBoton_`: llama a `pedirDescripcion_(mov, messageId)` sin editar el aviso. Va en la lista de acciones que funcionan sobre movimientos ya confirmados.

- [ ] **Step 1: Pruebas que fallan**

```js
test('✏️ pide la descripción y la respuesta la guarda y actualiza el aviso', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  e.tocar(e.dato('e', mov));
  const pedido = e.ultimoEnviado();
  assert.match(pedido.text, /^✏️ Escribe la descripción para <b>S\/ 45\.90<\/b> · TOTTUS PRIMAVERA$/);
  assert.strictEqual(pedido.reply_markup.force_reply, true);
  e.enviar({ update_id: 5000, message: { message_id: 900, chat: { id: CHAT }, text: 'compras de la semana',
    reply_to_message: { message_id: 101 } } });   // 101 = message_id que devolvió el pedido
  assert.strictEqual(e.mov(mov.id).descripcion, 'compras de la semana');
  assert.strictEqual(e.mov(mov.id).comercio, 'TOTTUS PRIMAVERA');
  assert.match(e.ultimoEditado().text, /compras de la semana · 13\/10\n<i>TOTTUS PRIMAVERA<\/i>/);
  assert.strictEqual(e.ultimoEditado().message_id, 77);
  assert.strictEqual(e.ultimoEnviado().text, '✓ Descripción guardada');
});
test('responder al aviso original (con teclado) también cambia la descripción', () => {});
test('responder a un resumen o a /pagos se trata como texto normal', () => { /* Review Focus 3: "taxi 12" registra */ });
test('respuesta vacía borra la descripción; más de 100 caracteres se recorta', () => {});
test('un mensaje que no es respuesta sigue registrando gastos', () => {});
test('tituloMovimiento_: "Pago de tarjeta" no es descripción propia', () => {});
test('listarMovimientos trae titulo y subtitulo', () => {});
```

- [ ] **Step 2: `npm test`.** Esperado: FAIL.
- [ ] **Step 3: Implementar.** Actualizar las pruebas de teclados existentes por la fila ✏️ nueva. Las vistas web muestran `titulo` y, debajo y tenue, `subtitulo`.
- [ ] **Step 4: `npm test && npm run lint`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: cambiar la descripción de un movimiento desde el bot`

---

### Task 10: Demo

**Files:**
- Modify: `src/setup/demo.js`
- Test: `tests/demo.test.js`

- [ ] **Step 1: Prueba que falla.** `generarDatosDemo_(hoy)` trae:
  - Un préstamo a "Juan Prueba" por S/ 200 con un abono de S/ 50 y fecha prometida dentro de 5 días.
  - Uno a "Ana Prueba" por S/ 80, vencido hace 3 días.
  - Cada uno con su yapeo en la categoría de rol `prestamo`. El abono, con un yapeo recibido en la de rol `reembolso`.
  - Un reembolso de cena (−S/ 40 en "Comida fuera").
  - `construirDashboard_` sobre la demo no cuenta ninguno como gasto ni ingreso.
- [ ] **Step 2: `npm test`.** Esperado: FAIL.
- [ ] **Step 3: Implementar.** `cargarDemo` escribe también `Prestamos` y `Abonos`.
- [ ] **Step 4: `npm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: préstamos y reembolso en los datos demo`

---

### Task 11: Importar, aviso de actualización, documentación y versión

**Files:**
- Modify: `src/setup/importar.js`, `src/web/api-version.js`, `src/web/vista-ajustes.html`, `src/core/version.js`, `package.json`, `README.md`, `CHANGELOG.md`, `docs/actualizar.md`, `docs/agregar-un-banco.md` (enlace), `docs/telegram.md` (/prestamos y ✏️)
- Create: `docs/adaptar-con-claude.md`
- Test: `tests/importar.test.js`, `tests/version.test.js`

**Interfaces:**
- Produces: `estadoVersion()` agrega `adaptarBanco: URL_REPO + '/blob/main/docs/adaptar-con-claude.md#antes-de-actualizar'`.

- [ ] **Step 1: Pruebas que fallan**

```js
test('importar una hoja v0.8 aplica los roles de préstamo y reembolso', () => { /* Review Focus 5 */ });
test('importar una hoja v0.9 trae Prestamos y Abonos', () => {});
test('estadoVersion trae el enlace adaptarBanco', () => {});
```

- [ ] **Step 2: `npm test`.** Esperado: FAIL.
- [ ] **Step 3: Implementar.**
  - `TABLAS_IMPORTABLES` suma `'Prestamos', 'Abonos'`, y `importarHojaAnterior` llama a `asegurarRolesPrestamo_()` después de `asegurarAmbitos_()`.
  - En Ajustes, cuando `hayNueva`, el aviso añade el texto exacto del spec con un enlace a `adaptarBanco`: "Si adaptaste la lectura de correos de tu banco, al actualizar se pierde ese cambio: pídele a tu Claude que lo vuelva a aplicar."
- [ ] **Step 4: Escribir `docs/adaptar-con-claude.md`** con las secciones del spec §3.3:
  - "Qué necesitas".
  - "Texto para pegarle a tu Claude" (bloque de código copiable con los pasos 1–5 del spec, incluido guardar el lector aparte).
  - "Antes de actualizar" (ancla `#antes-de-actualizar`), con el texto para reaplicar.
  - "Privacidad".
  - En el README, una sección corta "¿Tu banco no aparece? Adáptalo con Claude" con la advertencia y el enlace. Actualizar "Qué hace (v0.9)" (préstamos, reembolsos, descripción desde el bot) y la hoja de ruta (fila v0.9 ✅).
  - En `actualizar.md`, la misma advertencia.
- [ ] **Step 5: Versión.** `0.9.0` en `package.json` y `VERSION_APP`, y la entrada del CHANGELOG.
- [ ] **Step 6: `npm test && npm run lint`.** Esperado: PASS.
- [ ] **Step 7: Commit** `docs: guía para adaptar la app a tu banco con Claude; versión 0.9.0`

Publicar (`npm run deploy`, `npm run deploy:plantilla`) y fusionar a `main` queda para cuando Bruno lo pruebe. Usar superpowers:finishing-a-development-branch.
