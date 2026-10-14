# Fase 5b · Próximos pagos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recordar los pagos del mes —pagos fijos y la tarjeta de crédito según su estado de cuenta— en el Inicio, en `/pagos` y con avisos por Telegram 3 días antes y el mismo día.

**Architecture:**
- **Esquema v4:** dos hojas nuevas, `Recurrentes` y `EstadosCuenta`.
- **Núcleo puro:** `src/core/pagos.js` calcula fechas, el estado de la tarjeta por moneda y la lista de próximos pagos.
- **Lector nuevo:** el estado de cuenta VISA del BCP se guarda en `EstadosCuenta` en lugar de crear un movimiento.
- **API de la app:** `src/web/api-recurrentes.js` edita los pagos fijos y arma la lista del día.
- **Telegram:** `src/telegram/pagos.js` manda el aviso de llegada, el recordatorio de las 8:00 y responde `/pagos`.
- **Interfaz:** bloque 5 del Inicio y sección "Pagos fijos" en la pestaña Presupuestos.

**Tech Stack:** Google Apps Script V8, Google Sheets como base de datos, HtmlService. Pruebas con `node --test` sobre el harness vm de `tests/harness.js`. ESLint 9.

**Spec:** [docs/superpowers/specs/2026-10-13-fase-5b-proximos-pagos-design.md](../specs/2026-10-13-fase-5b-proximos-pagos-design.md)

## Global Constraints

- `VERSION_ESQUEMA = 4`; la migración solo crea las hojas que faltan y nunca toca datos.
- Toda escritura en la hoja va dentro de `conBloqueo_`, sin anidar. Los avisos por Telegram se mandan fuera del bloqueo, después de escribir, y nunca lanzan: los errores van al Log con nivel `aviso` mediante `registrarAvisoTelegram_`.
- Las funciones públicas (las que llama `google.script.run` o un trigger) no llevan `_` al final; las internas sí.
- No usar `new Date('yyyy-mm-dd')` ni `instanceof Date`. Las fechas viajan como texto `yyyy-MM-dd`.
- Los montos se redondean con `redondear2_`. Los montos escritos por la persona se leen con `leerMontoTexto_`.
- Todo dato de la hoja que va a Telegram pasa por `escaparHtml_`, y todo lo que va a la interfaz pasa por `esc()`. No usar `alert`, `confirm` ni `prompt`: borrar se confirma con "¿Seguro? Toca otra vez".
- Nada personal en el repo: correos de ejemplo, montos, nombres y cuentas de las pruebas son ficticios.
- En modo demo (`MODO_DEMO = 'si'`) o con el bot sin vincular no se envía nada por Telegram.
- No hay permisos OAuth nuevos.
- Los recurrentes solo recuerdan: nunca crean movimientos.
- Hora del recordatorio: 8:00. Avisa 3 días antes y el mismo día, en un solo mensaje. La ventana de próximos pagos es de 30 días.
- La tarjeta se controla por moneda: los pagos en S/ cuentan contra el total en S/ y los pagos en $ contra el total en $.

## Review Focus

1. **Pago de la tarjeta hecho antes de que llegue el correo del estado de cuenta.** Pasa en la práctica. Debe contar como pago de ese estado de cuenta, y el del vencimiento anterior no debe contar. → Task 1, `estadoTarjeta_: cada moneda con lo suyo…`.
2. **El mismo correo de estado de cuenta leído dos veces** (cursor reiniciado, "Importar" de nuevo). No debe crear una segunda fila. → Task 2, `el estado de cuenta se guarda…y no se duplica`.
3. **Pago fijo del día 29, 30 o 31 en febrero o en un mes de 30 días.** Debe caer el último día del mes, sin saltarse el mes. → Task 1, `fechaRecurrente_…`.
4. **El trigger de las 8:00 corriendo dos veces el mismo día** (trigger duplicado o reintento). No debe repetir el recordatorio. → Task 4, `a las 8:00 recuerda…sin repetir`.
5. **Pago fijo cuya cuenta o categoría se desactiva después.** Debe seguir mostrándose y poder editarse sin error. Solo un pago nuevo exige que estén activas. → Task 3, `una cuenta desactivada no sirve para un pago nuevo…`.

---

### Task 1: Esquema v4 y núcleo de próximos pagos

**Files:**
- Modify: `src/core/esquema.js`
- Create: `src/core/pagos.js`
- Test: `tests/pagos.test.js` (nuevo), `tests/migracion.test.js`, `tests/catalogos.test.js:49`, `tests/repo.test.js:5`

**Interfaces:**
- Consumes: `diasDelMes_(mes)` (src/core/presupuestos.js), `mesDe_`, `sumarMeses_`, `redondear2_` (src/core/util.js).
- Produces:
  - `sumarDias_(fechaIso, n) → 'yyyy-MM-dd'`
  - `diasEntre_(aIso, bIso) → número` (negativo si b es anterior)
  - `diaSemana_(fechaIso) → 'lun'…'dom'`
  - `fechaCorta_(fechaIso) → 'dd/mm'`
  - `fechaRecurrente_(diaMes, hoyIso) → 'yyyy-MM-dd'`
  - `estadoTarjeta_(ec, estados, movimientos) → { pen, usd }`, donde cada moneda es `null` o `{ total, minimo, pagado, falta, estado: 'pagado'|'minimo'|'pendiente' }`
  - `proximosPagos_({ recurrentes, estados, cuentas, categorias, movimientos, tcUsd }, hoyIso) → { pagos, porPagar }`, con dos formas de pago:
    - recurrente: `{ tipo:'recurrente', id, nombre, emoji, fecha, dias, monto, moneda, cuenta }`
    - tarjeta: `{ tipo:'tarjeta', id, nombre, emoji:'💳', fecha, dias, pen, usd, vencido }`
  - `totalPagosFijos_(recurrentes, tcUsd) → número`
  - Constantes `DIAS_PROXIMOS_PAGOS = 30` y `DIAS_AVISO_PREVIO = 3`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/pagos.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

const e = crearEntorno();
const f = (nombre, ...args) => e.llamar(nombre, ...args);

// Datos ficticios.
const EC_ANTERIOR = { id: 'ec1', cuenta_id: 'visa', emitido: '2026-08-28', total_pen: 600, total_usd: 20, minimo_pen: 90, minimo_usd: 10, fecha_limite: '2026-09-22', ref_externa: '' };
const EC = { id: 'ec2', cuenta_id: 'visa', emitido: '2026-09-30', total_pen: 800, total_usd: 50, minimo_pen: 120, minimo_usd: 10, fecha_limite: '2026-10-20', ref_externa: '' };
const pago = (fecha, monto, moneda, destino) => ({ tipo: 'transferencia', fecha, monto, moneda: moneda || 'PEN', cuenta_destino_id: destino || 'visa', estado: 'confirmado' });
const CUENTAS = [{ id: 'deb', nombre: 'Débito BCP' }, { id: 'visa', nombre: 'VISA BCP' }];
const CATEGORIAS = [{ id: 'sus', nombre: 'Suscripciones', emoji: '📺' }, { id: 'gym', nombre: 'Salud y gym', emoji: '💪' }];
const rec = (id, nombre, monto, dia, extra) => Object.assign({ id, nombre, monto, moneda: 'PEN', cuenta_id: 'deb', categoria_id: 'sus', dia_mes: dia, activo: true }, extra);
const datos = extra => Object.assign({ recurrentes: [], estados: [], cuentas: CUENTAS, categorias: CATEGORIAS, movimientos: [], tcUsd: 3.75 }, extra);

test('sumarDias_, diasEntre_, diaSemana_ y fechaCorta_', () => {
  assert.strictEqual(f('sumarDias_', '2026-10-30', 3), '2026-11-02');
  assert.strictEqual(f('sumarDias_', '2026-03-01', -1), '2026-02-28');
  assert.strictEqual(f('diasEntre_', '2026-10-13', '2026-11-12'), 30);
  assert.strictEqual(f('diasEntre_', '2026-10-13', '2026-10-10'), -3);
  assert.strictEqual(f('diaSemana_', '2026-10-16'), 'vie');
  assert.strictEqual(f('fechaCorta_', '2026-11-05'), '05/11');
});

test('fechaRecurrente_: este mes si aún no pasa, si no el siguiente; en meses cortos el último día', () => {
  assert.strictEqual(f('fechaRecurrente_', 20, '2026-10-13'), '2026-10-20');
  assert.strictEqual(f('fechaRecurrente_', 13, '2026-10-13'), '2026-10-13');
  assert.strictEqual(f('fechaRecurrente_', 5, '2026-10-13'), '2026-11-05');
  assert.strictEqual(f('fechaRecurrente_', 31, '2026-11-10'), '2026-11-30');
  assert.strictEqual(f('fechaRecurrente_', 30, '2027-02-01'), '2027-02-28');
  assert.strictEqual(f('fechaRecurrente_', 29, '2027-01-30'), '2027-02-28');
  assert.strictEqual(f('fechaRecurrente_', 31, '2026-12-31'), '2026-12-31');
});

test('estadoTarjeta_: cada moneda con lo suyo; cuentan los pagos desde el día siguiente al vencimiento anterior', () => {
  const movs = [
    pago('2026-09-22', 500), // último día del estado anterior: no cuenta
    pago('2026-09-27', 800), // antes de que llegue el correo: sí cuenta
    pago('2026-10-06', 4, 'USD'),
    pago('2026-10-07', 100, 'PEN', 'otra'),
    { tipo: 'gasto', fecha: '2026-10-08', monto: 30, moneda: 'USD', cuenta_destino_id: '' },
  ];
  const t = f('estadoTarjeta_', EC, [EC_ANTERIOR, EC], movs);
  assert.deepStrictEqual(t.pen, { total: 800, minimo: 120, pagado: 800, falta: 0, estado: 'pagado' });
  assert.deepStrictEqual(t.usd, { total: 50, minimo: 10, pagado: 4, falta: 46, estado: 'pendiente' });
  const t2 = f('estadoTarjeta_', EC, [EC_ANTERIOR, EC], movs.concat([pago('2026-10-09', 6, 'USD', 'visa')]));
  assert.strictEqual(t2.usd.estado, 'minimo');
  assert.strictEqual(t2.usd.falta, 40);
});

test('estadoTarjeta_: sin estado anterior cuenta desde 10 días antes del correo; una moneda en 0 es null', () => {
  const solo = Object.assign({}, EC, { total_usd: 0, minimo_usd: 0 });
  const t = f('estadoTarjeta_', solo, [solo], [pago('2026-09-19', 50), pago('2026-09-20', 70)]);
  assert.strictEqual(t.pen.pagado, 70);
  assert.strictEqual(t.pen.estado, 'pendiente');
  assert.strictEqual(t.usd, null);
});

test('proximosPagos_: recurrentes activos en 30 días ordenados por fecha, con la tarjeta y lo que falta pagar', () => {
  const r = f('proximosPagos_', datos({
    recurrentes: [rec('r1', 'Streaming', 20.9, 5), rec('r2', 'Gimnasio', 120, 15, { categoria_id: 'gym' }),
      rec('r3', 'Nube', 2, 13, { moneda: 'USD' }), rec('r4', 'Apagado', 50, 14, { activo: false })],
    estados: [EC], movimientos: [pago('2026-10-06', 800)],
  }), '2026-10-13');
  assert.deepStrictEqual(r.pagos.map(p => [p.nombre, p.fecha, p.dias]), [
    ['Nube', '2026-10-13', 0], ['Gimnasio', '2026-10-15', 2], ['VISA BCP', '2026-10-20', 7], ['Streaming', '2026-11-05', 23],
  ]);
  assert.deepStrictEqual(r.pagos[1], { tipo: 'recurrente', id: 'r2', nombre: 'Gimnasio', emoji: '💪', fecha: '2026-10-15', dias: 2, monto: 120, moneda: 'PEN', cuenta: 'Débito BCP' });
  const visa = r.pagos[2];
  assert.strictEqual(visa.tipo, 'tarjeta');
  assert.strictEqual(visa.emoji, '💳');
  assert.strictEqual(visa.pen.estado, 'pagado');
  assert.strictEqual(visa.usd.estado, 'pendiente');
  assert.strictEqual(visa.vencido, false);
  // 2 × 3.75 + 120 + 50 × 3.75 + 20.9
  assert.strictEqual(r.porPagar, 335.9);
});

test('proximosPagos_: la tarjeta pagada se ve hasta su vencimiento; impaga y vencida queda marcada; solo el último estado de cuenta', () => {
  const pagada = [pago('2026-10-06', 800), pago('2026-10-06', 50, 'USD')];
  const conPagada = hoy => f('proximosPagos_', datos({ estados: [EC], movimientos: pagada }), hoy).pagos;
  assert.strictEqual(conPagada('2026-10-20').length, 1);
  assert.strictEqual(conPagada('2026-10-21').length, 0);
  const vencida = f('proximosPagos_', datos({ estados: [EC] }), '2026-10-22');
  assert.strictEqual(vencida.pagos[0].vencido, true);
  assert.strictEqual(vencida.pagos[0].dias, -2);
  assert.strictEqual(vencida.porPagar, 987.5);
  const r = f('proximosPagos_', datos({ estados: [EC_ANTERIOR, EC] }), '2026-10-13');
  assert.deepStrictEqual(r.pagos.map(p => p.id), ['ec2']);
});

test('totalPagosFijos_ suma los activos y pasa los dólares a soles', () => {
  const lista = [rec('a', 'A', 20.9, 1), rec('b', 'B', 2, 1, { moneda: 'USD' }), rec('c', 'C', 50, 1, { activo: false })];
  assert.strictEqual(f('totalPagosFijos_', lista, 3.75), 28.4);
});
```

Agregar al final de `tests/migracion.test.js`:

```js
test('una hoja v3 pasa a v4 con Recurrentes y EstadosCuenta, sin tocar los datos', () => {
  const e = entornoInstalado();
  delete e.hojas.Recurrentes;
  delete e.hojas.EstadosCuenta;
  e.interno('guardarConfig_', { version_esquema: 3 });
  const movimientos = JSON.stringify(e.hojas.Movimientos);
  e.llamar('estadoInstalacion');
  assert.deepStrictEqual(e.hojas.Recurrentes[0], ['id', 'nombre', 'monto', 'moneda', 'cuenta_id', 'categoria_id', 'dia_mes', 'activo']);
  assert.deepStrictEqual(e.hojas.EstadosCuenta[0], ['id', 'cuenta_id', 'emitido', 'total_pen', 'total_usd', 'minimo_pen', 'minimo_usd', 'fecha_limite', 'ref_externa']);
  assert.strictEqual(e.llamar('leerConfig_').version_esquema, '4');
  assert.strictEqual(JSON.stringify(e.hojas.Movimientos), movimientos);
});
```

Cambiar las versiones esperadas de `'3'` a `'4'` en `tests/migracion.test.js:24`, `tests/migracion.test.js:75` y `tests/catalogos.test.js:49`. La migración ahora llega a la versión actual. En `tests/repo.test.js:5`:

```js
const HOJAS = ['Categorias', 'Config', 'Cuentas', 'Divisiones', 'EstadosCuenta', 'Log', 'Movimientos', 'Pendientes', 'Presupuestos', 'Recurrentes', 'Reglas'];
```

- [ ] **Step 2: Verificar que fallan**

Run: `node --test tests/pagos.test.js tests/migracion.test.js tests/repo.test.js tests/catalogos.test.js`
Expected: FAIL. `pagos.test.js` falla con `contexto[nombre] is not a function` (aún no existe `sumarDias_`), y migración, repo y catálogos fallan porque esperan la versión 4 o las hojas nuevas.

- [ ] **Step 3: Implementar**

En `src/core/esquema.js`, cambiar `const VERSION_ESQUEMA = 3;` por `const VERSION_ESQUEMA = 4;` y agregar después de la línea de `Presupuestos`:

```js
  Recurrentes: [
    ['id', 'texto'], ['nombre', 'texto'], ['monto', 'numero'], ['moneda', 'texto'], ['cuenta_id', 'texto'],
    ['categoria_id', 'texto'], ['dia_mes', 'numero'], ['activo', 'booleano'],
  ],
  EstadosCuenta: [
    ['id', 'texto'], ['cuenta_id', 'texto'], ['emitido', 'fecha'], ['total_pen', 'numero'], ['total_usd', 'numero'],
    ['minimo_pen', 'numero'], ['minimo_usd', 'numero'], ['fecha_limite', 'fecha'], ['ref_externa', 'texto'],
  ],
```

Crear `src/core/pagos.js`:

```js
// Próximos pagos: pagos fijos (recurrentes, que solo se recuerdan) y la tarjeta de crédito
// según su último estado de cuenta, controlada por moneda. Funciones puras.

const DIAS_PROXIMOS_PAGOS = 30;
const DIAS_AVISO_PREVIO = 3;
// Sin estado de cuenta anterior, los pagos cuentan desde estos días antes del correo:
// es común pagar desde la app del banco antes de que llegue.
const DIAS_PAGO_ANTICIPADO = 10;
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function fechaDeIso_(fechaIso) {
  const p = String(fechaIso).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function isoDeFecha_(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function sumarDias_(fechaIso, n) {
  const d = fechaDeIso_(fechaIso);
  d.setDate(d.getDate() + n);
  return isoDeFecha_(d);
}

// Con UTC para que un cambio de horario no corra el resultado.
function diasEntre_(aIso, bIso) {
  const utc = iso => { const p = String(iso).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  return Math.round((utc(bIso) - utc(aIso)) / 86400000);
}

function diaSemana_(fechaIso) {
  return DIAS_SEMANA[fechaDeIso_(fechaIso).getDay()];
}

function fechaCorta_(fechaIso) {
  return String(fechaIso).slice(8, 10) + '/' + String(fechaIso).slice(5, 7);
}

// Próxima fecha ≥ hoy de un pago del día `diaMes` (1–31); en meses cortos, el último día.
function fechaRecurrente_(diaMes, hoyIso) {
  const enMes = mes => mes + '-' + String(Math.min(Number(diaMes), diasDelMes_(mes))).padStart(2, '0');
  const mes = mesDe_(hoyIso);
  const esteMes = enMes(mes);
  return esteMes >= hoyIso ? esteMes : enMes(sumarMeses_(mes, 1));
}

// Desde el día siguiente al vencimiento del estado de cuenta anterior de la misma tarjeta.
function inicioPagosTarjeta_(ec, estados) {
  const previos = estados
    .filter(x => x.cuenta_id === ec.cuenta_id && x.emitido < ec.emitido)
    .sort((a, b) => (a.emitido < b.emitido ? 1 : -1));
  return previos.length ? sumarDias_(previos[0].fecha_limite, 1) : sumarDias_(ec.emitido, -DIAS_PAGO_ANTICIPADO);
}

// Pagos por moneda: los de S/ cuentan contra el total en S/, y los de $ contra el total en $.
// Se cuentan también los pagos por revisar: el pago ya ocurrió.
function estadoTarjeta_(ec, estados, movimientos) {
  const desde = inicioPagosTarjeta_(ec, estados);
  const pagado = { PEN: 0, USD: 0 };
  movimientos.forEach(m => {
    if (m.tipo !== 'transferencia' || m.cuenta_destino_id !== ec.cuenta_id || m.fecha < desde) return;
    if (m.moneda in pagado) pagado[m.moneda] += Number(m.monto) || 0;
  });
  const parte = (total, minimo, abonado) => {
    const t = redondear2_(total);
    if (!(t > 0)) return null;
    const p = redondear2_(abonado);
    const min = redondear2_(minimo);
    return { total: t, minimo: min, pagado: p, falta: redondear2_(Math.max(0, t - p)), estado: p >= t ? 'pagado' : p >= min ? 'minimo' : 'pendiente' };
  };
  return { pen: parte(ec.total_pen, ec.minimo_pen, pagado.PEN), usd: parte(ec.total_usd, ec.minimo_usd, pagado.USD) };
}

function ultimosEstadosCuenta_(estados) {
  const ultimo = {};
  estados.forEach(ec => {
    if (!ec.cuenta_id) return;
    const actual = ultimo[ec.cuenta_id];
    if (!actual || ec.emitido > actual.emitido) ultimo[ec.cuenta_id] = ec;
  });
  return Object.keys(ultimo).map(k => ultimo[k]);
}

// datos = { recurrentes, estados, cuentas, categorias, movimientos, tcUsd }
function proximosPagos_(datos, hoyIso) {
  const limite = sumarDias_(hoyIso, DIAS_PROXIMOS_PAGOS);
  const cuenta = id => datos.cuentas.filter(c => c.id === id)[0];
  const categoria = id => datos.categorias.filter(c => c.id === id)[0];
  const tc = Number(datos.tcUsd) || 0;
  const pagos = [];
  datos.recurrentes.forEach(r => {
    if (!r.activo) return;
    const fecha = fechaRecurrente_(r.dia_mes, hoyIso);
    if (fecha > limite) return;
    pagos.push({
      tipo: 'recurrente', id: r.id, nombre: r.nombre, emoji: (categoria(r.categoria_id) || {}).emoji || '', fecha: fecha,
      dias: diasEntre_(hoyIso, fecha), monto: redondear2_(r.monto), moneda: r.moneda, cuenta: (cuenta(r.cuenta_id) || {}).nombre || '',
    });
  });
  ultimosEstadosCuenta_(datos.estados).forEach(ec => {
    const t = estadoTarjeta_(ec, datos.estados, datos.movimientos);
    const partes = [t.pen, t.usd].filter(Boolean);
    if (!partes.length || ec.fecha_limite > limite) return;
    const debe = partes.some(p => p.estado !== 'pagado');
    if (!debe && ec.fecha_limite < hoyIso) return;
    pagos.push({
      tipo: 'tarjeta', id: ec.id, nombre: (cuenta(ec.cuenta_id) || {}).nombre || 'Tarjeta', emoji: '💳', fecha: ec.fecha_limite,
      dias: diasEntre_(hoyIso, ec.fecha_limite), pen: t.pen, usd: t.usd,
      vencido: ec.fecha_limite < hoyIso && partes.some(p => p.estado === 'pendiente'),
    });
  });
  pagos.sort((a, b) => (a.fecha === b.fecha ? a.nombre.localeCompare(b.nombre) : a.fecha < b.fecha ? -1 : 1));
  const enSoles = (monto, moneda) => (moneda === 'USD' ? monto * tc : monto);
  const porPagar = pagos.reduce((s, p) => {
    if (p.tipo === 'recurrente') return s + enSoles(p.monto, p.moneda);
    return s + (p.pen ? p.pen.falta : 0) + (p.usd ? enSoles(p.usd.falta, 'USD') : 0);
  }, 0);
  return { pagos: pagos, porPagar: redondear2_(porPagar) };
}

function totalPagosFijos_(recurrentes, tcUsd) {
  return redondear2_(recurrentes
    .filter(r => r.activo)
    .reduce((s, r) => s + (r.moneda === 'USD' ? Number(r.monto) * (Number(tcUsd) || 0) : Number(r.monto)), 0));
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `node --test tests/pagos.test.js tests/migracion.test.js tests/repo.test.js tests/catalogos.test.js`
Expected: PASS, todas.

- [ ] **Step 5: Suite completa, lint y commit**

Run: `npm test && npm run lint`
Expected: todo en verde y lint limpio.

```bash
git add src/core/esquema.js src/core/pagos.js tests/pagos.test.js tests/migracion.test.js tests/catalogos.test.js tests/repo.test.js
git commit -m "feat: esquema v4 y cálculo de próximos pagos (recurrentes y tarjeta por moneda)"
```

---

### Task 2: Lector del estado de cuenta, ingesta y aviso de llegada

**Files:**
- Create: `src/parsers/bcp-estado-cuenta.js`, `src/telegram/pagos.js`
- Modify: `src/parsers/lectores.js` (`lectoresDeCorreo_`), `src/ingesta/revisar.js` (`revisarCorreosSinBloqueo_`, `guardarLeidos_`, `idsConocidos_`, `describirRevision_`), `tests/fixtures/correos/estado-cuenta.html`
- Test: `tests/lector-estado-cuenta.test.js` (nuevo), `tests/ingesta.test.js`, `tests/telegram-pagos.test.js` (nuevo)

**Interfaces:**
- Consumes: `esFechaIso_`, `leerMonto_`, `fechaCorta_` (Task 1), `formatoMonto_`, `escaparHtml_`, `nombreCuenta_`, `enviarMensaje_`, `telegramVinculado_`, `registrarAvisoTelegram_`.
- Produces:
  - `leerEstadoCuentaBcp_(correo)` devuelve uno de tres resultados:
    - `{ estadoCuenta: { emitido, total_pen, total_usd, minimo_pen, minimo_usd, fecha_limite, ref_externa } }`
    - `{ pendiente }`
    - `null`
  - `montosPorMoneda_(pen, usd) → 'S/ 1.00 + US$ 2.00'` (omite los ceros)
  - `textoLlegoEstadoCuenta_(ec, nombreTarjeta)`
  - `avisarEstadosCuenta_(estados)`
  - `revisarCorreos()` devuelve además `estadosCuenta: número`.

- [ ] **Step 1: Reemplazar el correo de ejemplo por uno completo y ficticio**

El ejemplo actual no tiene el mínimo. Reemplazar `tests/fixtures/correos/estado-cuenta.html`. En el correo real del BCP los símbolos S/ y $ son imágenes, así que el texto solo trae las cifras: primero soles y después dólares.

```html
<!DOCTYPE html>
<html>
 <body>
  <p>ANA, Conoce a detalle el Estado de Cuenta de tu Tarjeta de Crédito VISA del mes de SEPTIEMBRE. Pago total del mes:</p>
  <table><tr><td><img src="cid:soles01.jpg" alt=""></td><td>1,234.50</td><td><img src="cid:dolares01.jpg" alt=""></td><td>45.60</td></tr></table>
  <p>Pago mínimo del mes:</p>
  <table><tr><td><img src="cid:soles01.jpg" alt=""></td><td>150.00</td><td><img src="cid:dolares01.jpg" alt=""></td><td>10.00</td></tr></table>
  <table><tr><td>Último día de pago: 05/11/2026</td></tr></table>
  <table><tr><td>Millas acumuladas en el mes: 1,000</td></tr></table>
  <p>Para revisar el documento adjunto, descarga el archivo ingresando como CONTRASEÑA tu número de documento de identidad.</p>
 </body>
</html>
```

- [ ] **Step 2: Escribir las pruebas que fallan**

Crear `tests/lector-estado-cuenta.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');
const { ASUNTOS, correo } = require('./correos');

const REMITENTE = 'estadodecuenta@notificacionesbcp.com.pe';
const leer = (e, extra) => e.llamar('leerCorreoBancario_',
  correo(e, 'estado-cuenta.html', Object.assign({ remitente: REMITENTE, asunto: ASUNTOS.estadoCuenta }, extra)));

test('lee totales y mínimos en soles y dólares (con coma de miles) y el último día de pago', () => {
  const e = crearEntorno();
  assert.deepStrictEqual(leer(e), { estadoCuenta: {
    emitido: '2026-10-06', total_pen: 1234.5, total_usd: 45.6, minimo_pen: 150, minimo_usd: 10,
    fecha_limite: '2026-11-05', ref_externa: 'gmail:estado-cuenta',
  } });
});

test('otros correos del mismo remitente y el mismo asunto desde otro remitente se ignoran', () => {
  const e = crearEntorno();
  assert.strictEqual(leer(e, { asunto: 'Informacion de tu Credito' }), null);
  assert.strictEqual(e.llamar('leerEstadoCuentaBcp_', correo(e, 'estado-cuenta.html', { asunto: ASUNTOS.estadoCuenta })), null);
});

test('un estado de cuenta con otro formato o una fecha imposible queda pendiente', () => {
  const e = crearEntorno();
  const base = { id: 'x', remitente: REMITENTE, asunto: ASUNTOS.estadoCuenta, fecha: '2026-10-06' };
  const pendiente = { pendiente: 'No se pudo leer el estado de cuenta.' };
  assert.deepStrictEqual(e.llamar('leerEstadoCuentaBcp_', Object.assign({ texto: 'Pago total del mes: 959 Último día de pago: 20/10/2026' }, base)), pendiente);
  const fechaMala = 'Pago total del mes: 10.00 0.00 Pago mínimo del mes: 5.00 0.00 Último día de pago: 31/02/2026';
  assert.deepStrictEqual(e.llamar('leerEstadoCuentaBcp_', Object.assign({ texto: fechaMala }, base)), pendiente);
});
```

En `tests/ingesta.test.js`, cambiar el resultado esperado del primer test: ahora g7 ya no se ignora. Se guarda como estado de cuenta y se etiqueta.

```js
  assert.deepStrictEqual(r, { leidos: 7, creados: 5, porRevisar: 3, pendientes: 1, ignorados: 0, restantes: 0, etiquetados: 7, estadosCuenta: 1 });
```

y agregar al final de `tests/ingesta.test.js`:

```js
const DE_ESTADO = 'estadodecuenta@notificacionesbcp.com.pe';

test('el estado de cuenta se guarda para la tarjeta BCP sin crear movimientos y no se duplica', () => {
  const e = entornoConCorreos();
  e.llamar('revisarCorreos');
  const ec = e.filas('EstadosCuenta');
  assert.strictEqual(ec.length, 1);
  assert.strictEqual(ec[0].cuenta_id, e.cuenta('VISA BCP'));
  assert.strictEqual(ec[0].emitido, '2026-10-11');
  assert.strictEqual(ec[0].total_pen, 1234.5);
  assert.strictEqual(ec[0].minimo_usd, 10);
  assert.strictEqual(ec[0].fecha_limite, '2026-11-05');
  assert.strictEqual(ec[0].ref_externa, 'gmail:g7');
  assert.strictEqual(e.movDe('g7'), undefined);
  e.interno('guardarConfig_', { cursor_lectura: 0 });
  e.llamar('revisarCorreos');
  assert.strictEqual(e.filas('EstadosCuenta').length, 1);
});

test('sin tarjeta de crédito BCP activa el estado de cuenta va a Por revisar; con dos usa la primera y lo anota', () => {
  const solo = () => [correoGmail('g7', 'estado-cuenta.html', ASUNTOS.estadoCuenta, '2026-10-11T10:00:00', DE_ESTADO)];
  const sin = entornoConCorreos(solo());
  sin.interno('actualizarFila_', 'Cuentas', sin.cuenta('VISA BCP'), { activa: false });
  sin.llamar('revisarCorreos');
  assert.strictEqual(sin.filas('EstadosCuenta').length, 0);
  const pend = sin.filas('Pendientes');
  assert.strictEqual(pend.length, 1);
  assert.match(pend[0].resumen, /^No hay una tarjeta de crédito BCP activa/);
  const dos = entornoConCorreos(solo());
  dos.llamar('guardarCuenta', { nombre: 'VISA 2', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: 0, numeros: '5555' });
  dos.llamar('revisarCorreos');
  assert.strictEqual(dos.filas('EstadosCuenta')[0].cuenta_id, dos.cuenta('VISA BCP'));
  assert.ok(dos.filas('Log').some(l => l.nivel === 'aviso' && l.origen === 'estado de cuenta'));
});
```

Crear `tests/telegram-pagos.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoBot } = require('./telegram');
const { ASUNTOS, html } = require('./correos');

test('al llegar el estado de cuenta avisa por Telegram con totales, mínimos y vencimiento', () => {
  const e = entornoBot({ correos: [{ id: 'g7', de: 'estadodecuenta@notificacionesbcp.com.pe', asunto: ASUNTOS.estadoCuenta, html: html('estado-cuenta.html'), recibido: '2026-10-11T10:00:00' }] });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.limpiarTelegram();
  e.llamar('revisarCorreos');
  assert.strictEqual(e.enviados().length, 1);
  assert.strictEqual(e.ultimoEnviado().text,
    '💳 Llegó tu estado de cuenta VISA BCP: S/ 1,234.50 + US$ 45.60 · mínimo S/ 150.00 + US$ 10.00 · vence el 05/11.');
});

test('textoLlegoEstadoCuenta_ omite la moneda sin deuda y escapa el nombre', () => {
  const e = entornoBot();
  const ec = { total_pen: 300, total_usd: 0, minimo_pen: 40, minimo_usd: 0, fecha_limite: '2026-11-05' };
  assert.strictEqual(e.llamar('textoLlegoEstadoCuenta_', ec, 'Visa <A&B>'),
    '💳 Llegó tu estado de cuenta Visa &lt;A&amp;B&gt;: S/ 300.00 · mínimo S/ 40.00 · vence el 05/11.');
});
```

- [ ] **Step 3: Verificar que fallan**

Run: `node --test tests/lector-estado-cuenta.test.js tests/ingesta.test.js tests/telegram-pagos.test.js`
Expected: FAIL. `leerCorreoBancario_` devuelve `null` para el estado de cuenta, la ingesta no tiene `estadosCuenta`, y `textoLlegoEstadoCuenta_` no existe.

- [ ] **Step 4: Implementar el lector**

Crear `src/parsers/bcp-estado-cuenta.js`:

```js
// Lector del correo "Estado de Cuenta de tu Tarjeta VISA" del BCP. No crea movimientos:
// guarda cuánto pagar y hasta cuándo, para "Próximos pagos". En el correo los símbolos
// S/ y $ son imágenes: el primer monto es en soles y el segundo en dólares.

const REMITENTE_ESTADO_CUENTA_BCP = 'estadodecuenta@notificacionesbcp.com.pe';
const PATRON_DOS_MONTOS = '([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})';

function leerEstadoCuentaBcp_(correo) {
  if (correo.remitente !== REMITENTE_ESTADO_CUENTA_BCP) return null;
  if (!/Estado de Cuenta de tu Tarjeta/i.test(String(correo.asunto || ''))) return null;
  const t = correo.texto;
  const total = new RegExp('Pago total del mes:\\s*' + PATRON_DOS_MONTOS).exec(t);
  const minimo = new RegExp('Pago m[ií]nimo del mes:\\s*' + PATRON_DOS_MONTOS).exec(t);
  const limite = /[UÚ]ltimo d[ií]a de pago:\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(t);
  const pendiente = { pendiente: 'No se pudo leer el estado de cuenta.' };
  if (!total || !minimo || !limite) return pendiente;
  const fechaLimite = limite[3] + '-' + limite[2] + '-' + limite[1];
  if (!esFechaIso_(fechaLimite)) return pendiente;
  const cifra = c => leerMonto_('S/', c).monto;
  return { estadoCuenta: {
    emitido: correo.fecha, total_pen: cifra(total[1]), total_usd: cifra(total[2]),
    minimo_pen: cifra(minimo[1]), minimo_usd: cifra(minimo[2]), fecha_limite: fechaLimite, ref_externa: 'gmail:' + correo.id,
  } };
}
```

En `src/parsers/lectores.js`:

```js
function lectoresDeCorreo_() {
  return [leerCorreoBcp_, leerEstadoCuentaBcp_, leerCorreoYape_];
}
```

- [ ] **Step 5: Implementar la ingesta**

En `src/ingesta/revisar.js`, dentro de `guardarLeidos_`:
- Declarar `const estados = [];` junto a `movimientos`, `pendientes` e `ignorados`.
- Reemplazar el bloque `if (l.leido.pendiente) { … }` por:

```js
    const tarjetas = l.leido.estadoCuenta ? tarjetasEstadoCuenta_(ctx.cuentas) : [];
    if (l.leido.pendiente || (l.leido.estadoCuenta && !tarjetas.length)) {
      pendientes.push({
        id: nuevoId_(), gmail_id: l.id, fecha: l.correo.fecha, remitente: l.correo.remitente, asunto: l.correo.asunto,
        resumen: (l.leido.pendiente ? '' : 'No hay una tarjeta de crédito BCP activa para este estado de cuenta. ') + l.correo.texto.slice(0, 300),
        estado: 'pendiente',
      });
      return;
    }
    if (l.leido.estadoCuenta) {
      if (tarjetas.length > 1) registrarLog_('aviso', 'estado de cuenta', 'Hay varias tarjetas de crédito BCP; se usó "' + tarjetas[0].nombre + '".', l.id);
      estados.push(Object.assign({ id: nuevoId_(), cuenta_id: tarjetas[0].id }, l.leido.estadoCuenta));
      return;
    }
```

- Después de `agregarFilas_('Pendientes', pendientes);`, agregar `agregarFilas_('EstadosCuenta', estados);`.
- Agregar `estadosCuenta: estados,` al objeto que devuelve `guardarLeidos_`.

Agregar debajo de `guardarLeidos_`:

```js
// El correo del estado de cuenta no trae los últimos 4 dígitos: va a la tarjeta de crédito
// BCP activa (la primera, si hay varias).
function tarjetasEstadoCuenta_(cuentas) {
  return cuentas.filter(c => c.activa && c.tipo === 'credito' && c.banco === 'BCP');
}
```

En `revisarCorreosSinBloqueo_`:
- Después de `avisarPorRevisar_(r.nuevosPorRevisar);`, agregar `avisarEstadosCuenta_(r.estadosCuenta);`.
- En el objeto que devuelve, agregar `estadosCuenta: r.estadosCuenta.length` después de `etiquetados: etiquetados`.

En `idsConocidos_`, después de la línea de `Pendientes`:

```js
  leerTabla_('EstadosCuenta').forEach(x => {
    if (String(x.ref_externa).indexOf('gmail:') === 0) conocidos[x.ref_externa.slice(6)] = true;
  });
```

En `describirRevision_`, después de la línea de `r.pendientes`:

```js
  if (r.estadosCuenta) partes.push(r.estadosCuenta + (r.estadosCuenta === 1 ? ' estado de cuenta' : ' estados de cuenta'));
```

- [ ] **Step 6: Implementar el aviso de llegada**

Crear `src/telegram/pagos.js`:

```js
// Próximos pagos por Telegram: aviso al llegar el estado de cuenta, recordatorio diario a
// las 8:00 (3 días antes y el mismo día) y el comando /pagos. Nunca lanzan: un fallo queda
// en el Log.

function montosPorMoneda_(pen, usd) {
  return [pen > 0 ? formatoMonto_(pen, 'PEN') : '', usd > 0 ? formatoMonto_(usd, 'USD') : ''].filter(Boolean).join(' + ');
}

function textoLlegoEstadoCuenta_(ec, nombreTarjeta) {
  const minimo = montosPorMoneda_(ec.minimo_pen, ec.minimo_usd);
  return '💳 Llegó tu estado de cuenta ' + escaparHtml_(nombreTarjeta) + ': ' + montosPorMoneda_(ec.total_pen, ec.total_usd) +
    (minimo ? ' · mínimo ' + minimo : '') + ' · vence el ' + fechaCorta_(ec.fecha_limite) + '.';
}

function avisarEstadosCuenta_(estados) {
  const props = PropertiesService.getScriptProperties();
  if (!estados.length || props.getProperty('MODO_DEMO') === 'si' || !telegramVinculado_()) return;
  try {
    const cuentas = leerTabla_('Cuentas');
    estados.forEach(ec => enviarMensaje_(textoLlegoEstadoCuenta_(ec, nombreCuenta_(cuentas, ec.cuenta_id))));
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}
```

- [ ] **Step 7: Verificar que pasan**

Run: `node --test tests/lector-estado-cuenta.test.js tests/ingesta.test.js tests/telegram-pagos.test.js tests/lector-bcp.test.js`
Expected: PASS. `lector-bcp.test.js` sigue pasando porque prueba `leerCorreoBcp_` directamente, y ese lector sigue devolviendo `null` para el estado de cuenta.

- [ ] **Step 8: Suite completa, lint y commit**

Run: `npm test && npm run lint`
Expected: verde y lint limpio.

```bash
git add src/parsers/bcp-estado-cuenta.js src/parsers/lectores.js src/ingesta/revisar.js src/telegram/pagos.js tests/fixtures/correos/estado-cuenta.html tests/lector-estado-cuenta.test.js tests/ingesta.test.js tests/telegram-pagos.test.js
git commit -m "feat: leer el estado de cuenta VISA del BCP y avisar por Telegram al llegar"
```

---

### Task 3: API de pagos fijos y próximos pagos en el Inicio

**Files:**
- Create: `src/web/api-recurrentes.js`
- Modify: `src/core/pagos.js` (agregar `normalizarRecurrente_`), `src/web/api.js` (`obtenerDashboard`)
- Test: `tests/api-recurrentes.test.js` (nuevo)

**Interfaces:**
- Consumes: `proximosPagos_`, `totalPagosFijos_` (Task 1), `buscarActiva_`, `leerMontoTexto_`, `MONEDAS`, `conBloqueo_`, `leerTabla_`, `agregarFilas_`, `actualizarFila_`, `eliminarFila_`.
- Produces:
  - `normalizarRecurrente_(datos, cuentas, categorias, previo?) → { nombre, monto, moneda, cuenta_id, categoria_id, dia_mes, activo }`
  - `obtenerRecurrentes() → { recurrentes, totalMensual, cuentas, categorias, tc }`
  - `guardarRecurrente(datos) → obtenerRecurrentes()`
  - `eliminarRecurrente(id) → obtenerRecurrentes()`
  - `proximosPagosDeHoy_(movs?) → { pagos, porPagar }`
  - `obtenerDashboard(mes).proximosPagos`: el objeto anterior para el mes actual, o `null` para otro mes.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/api-recurrentes.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');

function entorno() {
  const e = entornoInstalado();
  e.sus = e.categoria('Suscripciones');
  e.deb = e.cuenta('Débito BCP');
  e.fijo = extra => Object.assign({ nombre: 'Streaming', monto: '20.90', moneda: 'PEN', dia_mes: '5', cuenta_id: e.deb, categoria_id: e.sus }, extra);
  return e;
}

test('guardarRecurrente crea, edita, activa y desactiva; eliminarRecurrente borra', () => {
  const e = entorno();
  let r = e.llamar('guardarRecurrente', e.fijo());
  assert.strictEqual(r.recurrentes.length, 1);
  const id = r.recurrentes[0].id;
  assert.deepStrictEqual(r.recurrentes[0], { id, nombre: 'Streaming', monto: 20.9, moneda: 'PEN', cuenta_id: e.deb, categoria_id: e.sus, dia_mes: 5, activo: true });
  e.llamar('guardarRecurrente', e.fijo({ nombre: 'Nube', monto: '2', moneda: 'USD', dia_mes: 20 }));
  assert.strictEqual(e.llamar('obtenerRecurrentes').totalMensual, 28.4);
  r = e.llamar('guardarRecurrente', e.fijo({ id, monto: '1,200', dia_mes: 31 }));
  const editado = r.recurrentes.find(x => x.id === id);
  assert.strictEqual(editado.monto, 1200);
  assert.strictEqual(editado.dia_mes, 31);
  r = e.llamar('guardarRecurrente', e.fijo({ id, activo: false }));
  assert.strictEqual(r.recurrentes.find(x => x.id === id).activo, false);
  assert.strictEqual(r.totalMensual, 7.5);
  r = e.llamar('eliminarRecurrente', id);
  assert.deepStrictEqual(r.recurrentes.map(x => x.nombre), ['Nube']);
  assert.throws(() => e.llamar('eliminarRecurrente', id), /ya no existe/);
  assert.throws(() => e.llamar('guardarRecurrente', e.fijo({ id })), /ya no existe/);
});

test('guardarRecurrente valida nombre, monto, moneda, día, cuenta y categoría sin escribir nada', () => {
  const e = entorno();
  const casos = [
    [{ nombre: '  ' }, /nombre/],
    [{ monto: '0' }, /mayor que 0/],
    [{ monto: 'abc' }, /mayor que 0/],
    [{ moneda: 'EUR' }, /moneda/],
    [{ dia_mes: '0' }, /del 1 al 31/],
    [{ dia_mes: '32' }, /del 1 al 31/],
    [{ dia_mes: '5.5' }, /del 1 al 31/],
    [{ dia_mes: '' }, /del 1 al 31/],
    [{ cuenta_id: 'no-existe' }, /La cuenta no existe/],
    [{ categoria_id: '' }, /Elige una categoría/],
    [{ categoria_id: e.categoria('Sueldo') }, /de gasto/],
  ];
  casos.forEach(([cambio, error]) => assert.throws(() => e.llamar('guardarRecurrente', e.fijo(cambio)), error, JSON.stringify(cambio)));
  assert.deepStrictEqual(e.filas('Recurrentes'), []);
});

test('una cuenta desactivada no sirve para un pago nuevo, pero sí al editar uno que ya la usaba', () => {
  const e = entorno();
  const id = e.llamar('guardarRecurrente', e.fijo()).recurrentes[0].id;
  e.interno('actualizarFila_', 'Cuentas', e.deb, { activa: false });
  assert.throws(() => e.llamar('guardarRecurrente', e.fijo()), /desactivada/);
  const r = e.llamar('guardarRecurrente', e.fijo({ id, monto: '25' }));
  assert.strictEqual(r.recurrentes[0].monto, 25);
  assert.ok(!r.cuentas.some(c => c.id === e.deb), 'la lista para elegir solo trae cuentas activas');
});

test('obtenerDashboard trae los próximos pagos solo para el mes actual', () => {
  const e = entorno();
  e.llamar('guardarRecurrente', e.fijo({ dia_mes: '20' }));
  const d = e.llamar('obtenerDashboard', '2026-10');
  assert.deepStrictEqual(d.proximosPagos.pagos.map(p => [p.nombre, p.fecha, p.dias]), [['Streaming', '2026-10-20', 7]]);
  assert.strictEqual(d.proximosPagos.porPagar, 20.9);
  assert.strictEqual(e.llamar('obtenerDashboard', '2026-09').proximosPagos, null);
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `node --test tests/api-recurrentes.test.js`
Expected: FAIL con `contexto[nombre] is not a function` (`guardarRecurrente` no existe).

- [ ] **Step 3: Implementar**

Agregar al final de `src/core/pagos.js`:

```js
// Valida un pago fijo. Al editar (previo), la cuenta y la categoría que ya usaba sirven
// aunque después se hayan desactivado.
function normalizarRecurrente_(datos, cuentas, categorias, previo) {
  const nombre = String(datos.nombre || '').trim();
  if (!nombre) throw new Error('Ponle un nombre al pago fijo.');
  const monto = leerMontoTexto_(datos.monto);
  if (!(monto > 0)) throw new Error('El monto del pago fijo debe ser mayor que 0.');
  const moneda = String(datos.moneda || 'PEN');
  if (MONEDAS.indexOf(moneda) < 0) throw new Error('La moneda debe ser PEN o USD.');
  const dia = String(datos.dia_mes == null ? '' : datos.dia_mes).trim() === '' ? NaN : Number(datos.dia_mes);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) throw new Error('El día del mes debe ser un número del 1 al 31.');
  if (!datos.categoria_id) throw new Error('Elige una categoría para el pago fijo.');
  const previos = previo ? [previo.cuenta_id, previo.categoria_id] : [];
  buscarActiva_(cuentas, datos.cuenta_id, 'La cuenta', previos);
  const categoria = buscarActiva_(categorias, datos.categoria_id, 'La categoría', previos);
  if (categoria.tipo !== 'gasto') throw new Error('La categoría de un pago fijo debe ser de gasto.');
  return {
    nombre: nombre, monto: monto, moneda: moneda, cuenta_id: datos.cuenta_id, categoria_id: datos.categoria_id,
    dia_mes: dia, activo: datos.activo !== false,
  };
}
```

Crear `src/web/api-recurrentes.js`:

```js
// Pestaña Presupuestos, sección "Pagos fijos": pagos mensuales que solo se recuerdan
// (no crean movimientos). También arma la lista de próximos pagos de hoy.

function obtenerRecurrentes() {
  const tcUsd = Number(leerConfig_().ultimo_tc) || 0;
  const recurrentes = leerTabla_('Recurrentes')
    .sort((a, b) => a.dia_mes - b.dia_mes || a.nombre.localeCompare(b.nombre));
  return {
    recurrentes: recurrentes,
    totalMensual: totalPagosFijos_(recurrentes, tcUsd),
    cuentas: leerTabla_('Cuentas').filter(c => c.activa),
    categorias: leerTabla_('Categorias').filter(c => c.tipo === 'gasto' && c.activa),
    tc: tcUsd,
  };
}

function guardarRecurrente(datos) {
  conBloqueo_(() => {
    const d = datos || {};
    const previo = d.id ? leerTabla_('Recurrentes').filter(x => x.id === d.id)[0] : null;
    if (d.id && !previo) throw new Error('Ese pago fijo ya no existe.');
    const r = normalizarRecurrente_(d, leerTabla_('Cuentas'), leerTabla_('Categorias'), previo);
    if (previo) actualizarFila_('Recurrentes', previo.id, r);
    else agregarFilas_('Recurrentes', [Object.assign({ id: nuevoId_() }, r)]);
  });
  return obtenerRecurrentes();
}

function eliminarRecurrente(id) {
  conBloqueo_(() => {
    if (!leerTabla_('Recurrentes').some(x => x.id === id)) throw new Error('Ese pago fijo ya no existe.');
    eliminarFila_('Recurrentes', id);
  });
  return obtenerRecurrentes();
}

// Lista de los próximos 30 días desde hoy (Inicio, /pagos y el recordatorio de las 8:00).
function proximosPagosDeHoy_(movs) {
  return proximosPagos_({
    recurrentes: leerTabla_('Recurrentes'), estados: leerTabla_('EstadosCuenta'), cuentas: leerTabla_('Cuentas'),
    categorias: leerTabla_('Categorias'), movimientos: movs || leerTabla_('Movimientos'),
    tcUsd: Number(leerConfig_().ultimo_tc) || 0,
  }, hoyIso_());
}
```

En `src/web/api.js` (`obtenerDashboard`), antes de `return dashboard;`:

```js
  dashboard.proximosPagos = mes === mesDe_(hoyIso_()) ? proximosPagosDeHoy_(movs) : null;
```

- [ ] **Step 4: Verificar que pasan**

Run: `node --test tests/api-recurrentes.test.js`
Expected: PASS, 4/4.

- [ ] **Step 5: Suite completa, lint y commit**

Run: `npm test && npm run lint`
Expected: verde y lint limpio.

```bash
git add src/core/pagos.js src/web/api-recurrentes.js src/web/api.js tests/api-recurrentes.test.js
git commit -m "feat: API de pagos fijos y próximos pagos en el dashboard"
```

---

### Task 4: Recordatorio de las 8:00, /pagos y trigger

**Files:**
- Modify: `src/telegram/pagos.js`, `src/telegram/webhook.js` (`manejarComando_`), `src/telegram/mensajes.js` (`TEXTO_AYUDA`), `src/telegram/vinculacion.js` (`configurarTelegram`, `desvincularTelegram`), `src/setup/asistente.js` (`estadoInstalacion`)
- Test: `tests/telegram-pagos.test.js`, `tests/telegram-vinculacion.test.js`

**Interfaces:**
- Consumes:
  - `proximosPagosDeHoy_` (Task 3);
  - `sumarDias_`, `diaSemana_`, `fechaCorta_`, `DIAS_AVISO_PREVIO`, `DIAS_PROXIMOS_PAGOS` (Task 1);
  - `formatoMonto_`, `escaparHtml_`, `botonApp_`, `enviarMensaje_`, `asegurarEsquema_`.
- Produces:
  - `recordarPagos()`: función del trigger.
  - `textoPagos_(r)`, `textoRecordatorio_(hoy, enTres)`.
  - `configurarRecordatorioPagos_()`, `borrarTriggersRecordatorio_()`, `asegurarRecordatorioPagos_()`.
  - Script Property `PAGOS_RECORDADOS`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar a `tests/telegram-pagos.test.js` (hoy en el harness es mar 13/10/2026; +3 días es vie 16/10):

```js
function entornoPagos() {
  const e = entornoBot();
  e.sus = e.categoria('Suscripciones');
  e.visa = e.cuenta('VISA BCP');
  e.fijo = (nombre, monto, dia, extra) => e.llamar('guardarRecurrente', Object.assign({
    nombre, monto, moneda: 'PEN', dia_mes: dia, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.sus,
  }, extra));
  e.estado = extra => e.interno('agregarFilas_', 'EstadosCuenta', [Object.assign({
    id: 'ec1', cuenta_id: e.visa, emitido: '2026-10-01', total_pen: 800, total_usd: 50, minimo_pen: 120, minimo_usd: 10,
    fecha_limite: '2026-10-16', ref_externa: '',
  }, extra)]);
  e.pagar = (monto, moneda) => e.interno('agregarFilas_', 'Movimientos', [{
    id: 'p-' + monto + moneda, fecha: '2026-10-10', tipo: 'transferencia', monto, moneda, tc: moneda === 'USD' ? 3.75 : 1,
    monto_pen: moneda === 'USD' ? monto * 3.75 : monto, cuenta_id: e.cuenta('Débito BCP'), cuenta_destino_id: e.visa,
    categoria_id: '', comercio: '', descripcion: '', origen: 'gmail', estado: 'confirmado', ref_externa: '', dividido: false,
    creado_en: '2026-10-10 10:00:00',
  }]);
  e.recordar = () => e.llamar('recordarPagos');
  e.limpiarTelegram();
  return e;
}

test('a las 8:00 recuerda lo de hoy y lo de dentro de 3 días en un solo mensaje, sin repetir', () => {
  const e = entornoPagos();
  e.fijo('Streaming', '20.90', 13);
  e.fijo('Gimnasio', '120', 16);
  e.fijo('Alquiler', '900', 14);
  e.estado();
  e.recordar();
  e.recordar();
  assert.strictEqual(e.enviados().length, 1);
  assert.strictEqual(e.ultimoEnviado().text, [
    '📅 <b>Pagos por venir</b>',
    '<b>Hoy</b>',
    '• 📺 Streaming · S/ 20.90 · Débito BCP',
    '<b>En 3 días (vie 16/10)</b>',
    '• 📺 Gimnasio · S/ 120.00 · Débito BCP',
    '• 💳 VISA BCP · falta S/ 800.00 (mínimo S/ 120.00) + US$ 50.00 (mínimo US$ 10.00)',
  ].join('\n'));
  assert.deepStrictEqual(e.botones(e.ultimoEnviado()), [[{ text: 'Abrir la app', url: 'https://script.google.com/macros/s/APP-PRUEBA/exec' }]]);
});

test('la tarjeta pagada no se recuerda y, si falta una moneda, solo nombra esa', () => {
  const e = entornoPagos();
  e.estado();
  e.pagar(800, 'PEN');
  e.recordar();
  assert.strictEqual(e.ultimoEnviado().text.split('\n').slice(-1)[0], '• 💳 VISA BCP · falta US$ 50.00 (mínimo US$ 10.00)');
  const e2 = entornoPagos();
  e2.estado();
  e2.pagar(800, 'PEN');
  e2.pagar(50, 'USD');
  e2.recordar();
  assert.strictEqual(e2.enviados().length, 0);
});

test('si Telegram falla no marca nada y lo envía en la siguiente vuelta; en demo o sin bot no envía', () => {
  const e = entornoPagos();
  e.fijo('Streaming', '20.90', 13);
  e.telegram.falla = 'Bad Gateway';
  e.recordar();
  assert.strictEqual(e.propiedades.PAGOS_RECORDADOS, undefined);
  assert.ok(e.filas('Log').some(l => l.nivel === 'aviso'));
  e.telegram.falla = null;
  e.recordar();
  assert.strictEqual(e.enviados().length, 2);
  assert.ok(e.propiedades.PAGOS_RECORDADOS);
  const demo = entornoPagos();
  demo.fijo('Streaming', '20.90', 13);
  demo.propiedades.MODO_DEMO = 'si';
  demo.recordar();
  const sinBot = entornoPagos();
  sinBot.fijo('Streaming', '20.90', 13);
  delete sinBot.propiedades.TELEGRAM_CHAT_ID;
  sinBot.recordar();
  assert.strictEqual(demo.enviados().length + sinBot.enviados().length, 0);
});

test('el registro de recordados guarda solo la última semana', () => {
  const e = entornoPagos();
  e.propiedades.PAGOS_RECORDADOS = JSON.stringify({ '2026-10-01': ['rec:x:2026-10-01'], '2026-10-07': ['rec:y:2026-10-07'] });
  e.fijo('Streaming', '20.90', 13);
  e.recordar();
  assert.deepStrictEqual(Object.keys(JSON.parse(e.propiedades.PAGOS_RECORDADOS)).sort(), ['2026-10-07', '2026-10-13']);
});

test('/pagos lista los próximos 30 días con lo que falta; sin pagos lo dice; la tarjeta vencida se marca', () => {
  const e = entornoPagos();
  e.escribir('/pagos');
  assert.strictEqual(e.ultimoEnviado().text, 'No tienes pagos en los próximos 30 días.');
  e.fijo('Streaming', '20.90', 13);
  e.fijo('Nube', '2', 14, { moneda: 'USD' });
  e.estado();
  e.pagar(800, 'PEN');
  e.escribir('/pagos');
  assert.strictEqual(e.ultimoEnviado().text, [
    '📅 <b>Próximos pagos</b>',
    '• 📺 Streaming · hoy · S/ 20.90 · Débito BCP',
    '• 📺 Nube · mañana · US$ 2.00 · Débito BCP',
    '• 💳 VISA BCP · vie 16/10 · S/ 800.00 ✓ · US$ 50.00 pendiente',
    '',
    'Por pagar en 30 días: S/ 215.90',
  ].join('\n'));
  e.fijarAhora('2026-10-18T10:00:00');
  e.escribir('/pagos');
  assert.ok(e.ultimoEnviado().text.split('\n').includes('• 💳 VISA BCP · ⚠️ venció el 16/10 · S/ 800.00 ✓ · US$ 50.00 pendiente'));
});

test('el recordatorio de las 8:00 se instala al abrir la app con el bot conectado y se borra al desvincular', () => {
  const e = entornoPagos();
  const recordatorios = () => e.triggers.filter(t => t.funcion === 'recordarPagos');
  assert.strictEqual(recordatorios().length, 0);
  e.llamar('estadoInstalacion');
  e.llamar('estadoInstalacion');
  assert.deepStrictEqual(recordatorios().map(t => [t.hora, t.cada]), [[8, '1 d']]);
  e.llamar('desvincularTelegram');
  assert.strictEqual(recordatorios().length, 0);
  e.llamar('estadoInstalacion');
  assert.strictEqual(recordatorios().length, 0);
});

test('/ayuda menciona /pagos', () => {
  const e = entornoPagos();
  e.escribir('/ayuda');
  assert.match(e.ultimoEnviado().text, /\/pagos — próximos pagos/);
});
```

En `tests/telegram-vinculacion.test.js`, en el test que termina con `assert.deepStrictEqual(t.map(x => x.hora), [21]);` (cerca de la línea 44), agregar después:

```js
  assert.deepStrictEqual(e.triggers.filter(x => x.funcion === 'recordarPagos').map(x => x.hora), [8]);
```

- [ ] **Step 2: Verificar que fallan**

Run: `node --test tests/telegram-pagos.test.js tests/telegram-vinculacion.test.js`
Expected: FAIL. `recordarPagos` no existe, `/pagos` responde "Comando desconocido" y no hay trigger `recordarPagos`.

- [ ] **Step 3: Implementar**

Agregar a `src/telegram/pagos.js`:

```js
const HORA_RECORDATORIO_PAGOS = 8;
const DIAS_REGISTRO_RECORDADOS = 7;
const ESTADO_TARJETA_TEXTO = { pagado: '✓', minimo: 'mínimo cubierto', pendiente: 'pendiente' };

function nombrePago_(p) {
  return escaparHtml_((p.emoji ? p.emoji + ' ' : '') + p.nombre);
}

function monedasTarjeta_(p) {
  return [[p.pen, 'PEN'], [p.usd, 'USD']].filter(x => x[0]);
}

function cuandoPago_(p) {
  if (p.vencido) return '⚠️ venció el ' + fechaCorta_(p.fecha);
  if (p.dias === 0) return 'hoy';
  if (p.dias === 1) return 'mañana';
  return diaSemana_(p.fecha) + ' ' + fechaCorta_(p.fecha);
}

function lineaPago_(p) {
  if (p.tipo === 'recurrente') {
    return '• ' + nombrePago_(p) + ' · ' + cuandoPago_(p) + ' · ' + formatoMonto_(p.monto, p.moneda) + (p.cuenta ? ' · ' + escaparHtml_(p.cuenta) : '');
  }
  return '• ' + nombrePago_(p) + ' · ' + cuandoPago_(p) + ' · ' +
    monedasTarjeta_(p).map(x => formatoMonto_(x[0].total, x[1]) + ' ' + ESTADO_TARJETA_TEXTO[x[0].estado]).join(' · ');
}

// r = proximosPagos_(…)
function textoPagos_(r) {
  if (!r.pagos.length) return 'No tienes pagos en los próximos ' + DIAS_PROXIMOS_PAGOS + ' días.';
  return ['📅 <b>Próximos pagos</b>'].concat(r.pagos.map(lineaPago_),
    ['', 'Por pagar en ' + DIAS_PROXIMOS_PAGOS + ' días: ' + formatoMonto_(r.porPagar, 'PEN')]).join('\n');
}

// De la tarjeta solo se nombra lo que falta; el mínimo, mientras no esté cubierto.
function lineaRecordatorio_(p) {
  if (p.tipo === 'recurrente') {
    return '• ' + nombrePago_(p) + ' · ' + formatoMonto_(p.monto, p.moneda) + (p.cuenta ? ' · ' + escaparHtml_(p.cuenta) : '');
  }
  const faltan = monedasTarjeta_(p).filter(x => x[0].estado !== 'pagado').map(x => formatoMonto_(x[0].falta, x[1]) +
    (x[0].estado === 'pendiente' ? ' (mínimo ' + formatoMonto_(redondear2_(x[0].minimo - x[0].pagado), x[1]) + ')' : ''));
  return '• ' + nombrePago_(p) + ' · falta ' + faltan.join(' + ');
}

function textoRecordatorio_(hoy, enTres) {
  const lineas = ['📅 <b>Pagos por venir</b>'];
  if (hoy.length) lineas.push('<b>Hoy</b>', ...hoy.map(lineaRecordatorio_));
  if (enTres.length) {
    const f = enTres[0].fecha;
    lineas.push('<b>En ' + DIAS_AVISO_PREVIO + ' días (' + diaSemana_(f) + ' ' + fechaCorta_(f) + ')</b>', ...enTres.map(lineaRecordatorio_));
  }
  return lineas.join('\n');
}

function clavePago_(p) {
  return (p.tipo === 'recurrente' ? 'rec:' : 'ec:') + p.id + ':' + p.fecha;
}

function leerPagosRecordados_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('PAGOS_RECORDADOS') || '{}');
}

// Solo se guarda la última semana: los días viejos se descartan.
function guardarPagosRecordados_(registro, hoy, claves) {
  const limite = sumarDias_(hoy, -DIAS_REGISTRO_RECORDADOS);
  const nuevo = {};
  Object.keys(registro).forEach(d => { if (d > limite) nuevo[d] = registro[d]; });
  nuevo[hoy] = claves;
  PropertiesService.getScriptProperties().setProperty('PAGOS_RECORDADOS', JSON.stringify(nuevo));
}

// La llama el trigger diario de las 8:00. Lo ya recordado no se repite aunque corra dos veces.
function recordarPagos() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MODO_DEMO') === 'si' || !telegramVinculado_()) return;
  try {
    asegurarEsquema_();
    const hoy = hoyIso_();
    const registro = leerPagosRecordados_();
    const yaRecordados = registro[hoy] || [];
    const elegidos = proximosPagosDeHoy_().pagos.filter(p =>
      (p.dias === 0 || p.dias === DIAS_AVISO_PREVIO) && yaRecordados.indexOf(clavePago_(p)) < 0 &&
      (p.tipo === 'recurrente' || monedasTarjeta_(p).some(x => x[0].estado !== 'pagado')));
    if (!elegidos.length) return;
    const app = botonApp_(props.getProperty('APP_URL') || '');
    enviarMensaje_(textoRecordatorio_(elegidos.filter(p => p.dias === 0), elegidos.filter(p => p.dias === DIAS_AVISO_PREVIO)),
      app.length ? [app] : null);
    guardarPagosRecordados_(registro, hoy, yaRecordados.concat(elegidos.map(clavePago_)));
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}

// Solo desde la app principal: los triggers quedan en el proyecto que los crea.
function configurarRecordatorioPagos_() {
  borrarTriggersRecordatorio_();
  ScriptApp.newTrigger('recordarPagos').timeBased().atHour(HORA_RECORDATORIO_PAGOS).everyDays(1).create();
}

function borrarTriggersRecordatorio_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'recordarPagos')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

// Al abrir la app: instala el recordatorio si el bot está conectado y falta el trigger
// (actualización desde v0.5 o trigger borrado a mano). Nunca lanza.
function asegurarRecordatorioPagos_() {
  try {
    if (!PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN')) return;
    if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'recordarPagos')) return;
    configurarRecordatorioPagos_();
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}
```

En `src/telegram/webhook.js` (`manejarComando_`), antes de `case '/deshacer':`:

```js
    case '/pagos':
      return enviarMensaje_(textoPagos_(proximosPagosDeHoy_()));
```

En `src/telegram/mensajes.js`, dentro de `TEXTO_AYUDA`, después de `'/mes — resumen del mes',`:

```js
  '/pagos — próximos pagos (30 días)',
```

En `src/telegram/vinculacion.js`:
- En `configurarTelegram`, después de `configurarResumen_(horaResumen_());`, agregar `configurarRecordatorioPagos_();`.
- En `desvincularTelegram`, después de `borrarTriggersResumen_();`, agregar `borrarTriggersRecordatorio_();`.

En `src/setup/asistente.js`:

```js
// Llamada al abrir la app: si la hoja es de una versión anterior, la migra.
function estadoInstalacion() {
  asegurarEsquema_();
  asegurarRecordatorioPagos_();
  return estadoActual_();
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `node --test tests/telegram-pagos.test.js tests/telegram-vinculacion.test.js tests/telegram-webhook.test.js`
Expected: PASS.

- [ ] **Step 5: Suite completa, lint y commit**

Run: `npm test && npm run lint`
Expected: verde y lint limpio.

```bash
git add src/telegram/pagos.js src/telegram/webhook.js src/telegram/mensajes.js src/telegram/vinculacion.js src/setup/asistente.js tests/telegram-pagos.test.js tests/telegram-vinculacion.test.js
git commit -m "feat: recordatorio de pagos a las 8:00 y comando /pagos"
```

---

### Task 5: Pagos fijos y estado de cuenta en la demo

**Files:**
- Modify: `src/setup/demo.js` (`generarDatosDemo_`, `cargarDemo`)
- Test: `tests/demo.test.js`

**Interfaces:**
- Consumes: `sumarDias_`, `normalizarRecurrente_`, `estadoTarjeta_`.
- Produces: `generarDatosDemo_(hoyIso)` devuelve además `recurrentes` (4) y `estadosCuenta` (1).

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar a `tests/demo.test.js`:

```js
test('la demo trae 4 pagos fijos válidos y un estado de cuenta con soles pagados y dólares pendientes', () => {
  const e = crearEntorno();
  const a = e.llamar('generarDatosDemo_', '2026-10-13');
  assert.strictEqual(a.recurrentes.length, 4);
  assert.ok(a.recurrentes.some(r => r.moneda === 'USD'));
  a.recurrentes.forEach(r => e.llamar('normalizarRecurrente_', r, a.cuentas, a.categorias));
  assert.strictEqual(a.estadosCuenta.length, 1);
  const t = e.llamar('estadoTarjeta_', a.estadosCuenta[0], a.estadosCuenta, a.movimientos);
  assert.strictEqual(t.pen.estado, 'pagado');
  assert.strictEqual(t.usd.estado, 'pendiente');
});
```

En el test `cargarDemo crea una hoja aparte…`, después de `assert.ok(d.resumen.gastos > 0);`, agregar:

```js
  assert.strictEqual(d.proximosPagos.pagos.length, 5);
```

- [ ] **Step 2: Verificar que fallan**

Run: `node --test tests/demo.test.js`
Expected: FAIL. `a.recurrentes` es `undefined` y `proximosPagos.pagos` llega vacío.

- [ ] **Step 3: Implementar**

En `src/setup/demo.js`, en `generarDatosDemo_`, después del bloque de `presupuestos` y antes del `return`:

```js
  // Pagos fijos ficticios y un estado de cuenta con la parte en soles ya pagada.
  const recurrentes = [
    ['Spotify', 11.9, 'PEN', 'demo-debito', 'Suscripciones', 5],
    ['Gimnasio', 120, 'PEN', 'demo-debito', 'Salud y gym', 8],
    ['Plan de celular', 49.9, 'PEN', 'demo-debito', 'Vivienda y servicios', 22],
    ['Netflix', 9.99, 'USD', 'demo-visa', 'Suscripciones', 16],
  ].map((r, i) => ({
    id: 'demo-rec-' + (i + 1), nombre: r[0], monto: r[1], moneda: r[2], cuenta_id: r[3], categoria_id: cat(r[4]), dia_mes: r[5], activo: true,
  }));
  const estadosCuenta = [{
    id: 'demo-ec-1', cuenta_id: 'demo-visa', emitido: sumarDias_(hoyIso, -6), total_pen: 845.3, total_usd: 9.99,
    minimo_pen: 120, minimo_usd: 9.99, fecha_limite: sumarDias_(hoyIso, 12), ref_externa: '',
  }];
  agregar(sumarDias_(hoyIso, -1), 'transferencia', 845.3, 'demo-debito', { cuenta_destino_id: 'demo-visa', descripcion: 'Pago tarjeta VISA' });
```

Cambiar el `return` por:

```js
  return { cuentas: cuentas, categorias: categorias, movimientos: movimientos, presupuestos: presupuestos, recurrentes: recurrentes, estadosCuenta: estadosCuenta };
```

En `cargarDemo`, después de `agregarFilas_('Presupuestos', datos.presupuestos);`:

```js
      agregarFilas_('Recurrentes', datos.recurrentes);
      agregarFilas_('EstadosCuenta', datos.estadosCuenta);
```

- [ ] **Step 4: Verificar que pasan**

Run: `node --test tests/demo.test.js`
Expected: PASS. El primer test de la demo sigue pasando: la transferencia nueva es válida y sigue habiendo 3 ingresos.

- [ ] **Step 5: Suite completa, lint y commit**

Run: `npm test && npm run lint`
Expected: verde y lint limpio.

```bash
git add src/setup/demo.js tests/demo.test.js
git commit -m "feat: pagos fijos y estado de cuenta en los datos de demo"
```

---

### Task 6: Interfaz — bloque "Próximos pagos" y sección "Pagos fijos"

**Files:**
- Modify: `src/web/vista-inicio.html`, `src/web/vista-presupuestos.html`, `src/web/estilos.html`, `tests/ui/stub.js`

**Interfaces:**
- Consumes:
  - `obtenerDashboard(mes).proximosPagos` y `obtenerRecurrentes()`, `guardarRecurrente(datos)`, `eliminarRecurrente(id)` (Task 3);
  - helpers del cliente `esc`, `dinero`, `$`, `api`, `aviso`, `mostrar`, `abrirModal`, `cerrarModal`, `campo`, `seleccion`, `categoria`, `cuenta`.
- Produces:
  - funciones del cliente `bloqueProximosPagos(r)`, `cuandoPago(p)`, `fechaCorta(iso)`, `seccionPagosFijos(rec)`, `enlazarPagosFijos(cont, rec)`, `abrirFormFijo(r, rec)`;
  - clases CSS `.fila-pago`, `.fila-fijo`, `.abrir-fijo`, `.atenuada`.

- [ ] **Step 1: Datos de prueba en el stub**

En `tests/ui/stub.js`:
- Agregar después de `SALDOS`:

```js
  const RECURRENTES = {
    recurrentes: [
      { id: 'r2', nombre: 'Gimnasio', monto: 120, moneda: 'PEN', cuenta_id: 'a1', categoria_id: 'c4', dia_mes: 8, activo: true },
      { id: 'r1', nombre: 'Spotify', monto: 20.9, moneda: 'PEN', cuenta_id: 'a1', categoria_id: 'c4', dia_mes: 13, activo: true },
      { id: 'r3', nombre: 'Nube', monto: 2.99, moneda: 'USD', cuenta_id: 'a2', categoria_id: 'c4', dia_mes: 20, activo: false },
    ],
    totalMensual: 140.9, cuentas: CUENTAS, categorias: CATEGORIAS.filter(c => c.tipo === 'gasto'), tc: 3.75,
  };
```

- Dentro de `obtenerDashboard`, después de `presupuesto: {…},`:

```js
      proximosPagos: {
        pagos: [
          { tipo: 'recurrente', id: 'r1', nombre: 'Spotify', emoji: '📺', fecha: '2026-10-13', dias: 0, monto: 20.9, moneda: 'PEN', cuenta: 'Débito BCP' },
          { tipo: 'recurrente', id: 'r4', nombre: 'Seguro', emoji: '🏠', fecha: '2026-10-15', dias: 2, monto: 75, moneda: 'PEN', cuenta: 'Débito BCP' },
          { tipo: 'tarjeta', id: 'ec1', nombre: 'VISA BCP', emoji: '💳', fecha: '2026-10-20', dias: 7, vencido: false,
            pen: { total: 845.3, minimo: 120, pagado: 845.3, falta: 0, estado: 'pagado' },
            usd: { total: 45.6, minimo: 10, pagado: 0, falta: 45.6, estado: 'pendiente' } },
          { tipo: 'recurrente', id: 'r2', nombre: 'Gimnasio', emoji: '💪', fecha: '2026-11-08', dias: 26, monto: 120, moneda: 'PEN', cuenta: 'Débito BCP' },
        ],
        porPagar: 386.9,
      },
```

- Junto a `obtenerPresupuestos`:

```js
    obtenerRecurrentes: RECURRENTES,
    guardarRecurrente: RECURRENTES,
    eliminarRecurrente: RECURRENTES,
```

- [ ] **Step 2: Bloque del Inicio**

En `src/web/vista-inicio.html`:
- Después de `bloquePresupuesto(d.presupuesto) +`, agregar `bloqueProximosPagos(d.proximosPagos) +`.
- Después del enlace de `#ir-presupuestos`, agregar:

```js
  const irFijos = $('#ir-pagos-fijos');
  if (irFijos) irFijos.onclick = () => mostrar('presupuestos');
```

- Agregar después de `bloquePresupuesto`:

```js
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const ESTADO_PAGO = { pagado: ['✓', 'pos'], minimo: ['mínimo cubierto', 'alerta'], pendiente: ['pendiente', 'tenue'] };

function fechaCorta(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7); }

function cuandoPago(p) {
  if (p.vencido) return 'venció el ' + fechaCorta(p.fecha);
  if (p.dias === 0) return 'hoy';
  if (p.dias === 1) return 'mañana';
  const f = p.fecha.split('-').map(Number);
  return DIAS_CORTOS[new Date(f[0], f[1] - 1, f[2]).getDay()] + ' ' + fechaCorta(p.fecha);
}

// Solo llega para el mes actual (null en otros meses): mirar pagos futuros desde un mes pasado no tiene sentido.
function bloqueProximosPagos(r) {
  if (!r) return '';
  const titulo = '<div class="etiqueta">Próximos pagos</div>';
  if (!r.pagos.length) {
    return '<section class="tarjeta ancho-2">' + titulo + '<div class="vacio">Agrega tus pagos fijos (alquiler, suscripciones, gimnasio) ' +
      'para verlos aquí antes de que venzan. <button type="button" class="boton" id="ir-pagos-fijos">Agregar pagos fijos</button></div></section>';
  }
  const filas = r.pagos.map(p => {
    const tarjeta = p.tipo === 'tarjeta';
    const monedas = tarjeta ? [[p.pen, 'PEN'], [p.usd, 'USD']].filter(x => x[0]) : [];
    const pagada = tarjeta && monedas.every(x => x[0].estado === 'pagado');
    const clase = p.vencido ? 'neg' : pagada ? '' : p.dias <= 3 ? 'alerta' : '';
    const monto = tarjeta
      ? monedas.map(x => dinero(x[0].total, x[1]) + ' <span class="' + ESTADO_PAGO[x[0].estado][1] + '">' + ESTADO_PAGO[x[0].estado][0] + '</span>').join(' · ')
      : dinero(p.monto, p.moneda);
    return '<div class="fila-pago' + (pagada ? ' atenuada' : '') + '"><span>' + esc(p.emoji + ' ' + p.nombre) + '</span>' +
      '<span class="cuando ' + clase + '">' + esc(cuandoPago(p)) + '</span><span class="der num">' + monto + '</span></div>';
  }).join('');
  return '<section class="tarjeta ancho-2">' + titulo + '<div class="filas">' + filas + '</div>' +
    '<div class="pie-ppto"><span>Por pagar en 30 días: <b class="num">' + dinero(r.porPagar) + '</b></span></div></section>';
}
```

- [ ] **Step 3: Sección "Pagos fijos" en la pestaña Presupuestos**

En `src/web/vista-presupuestos.html`:
- Reemplazar `const p = await api('obtenerPresupuestos');` por:

```js
  const [p, rec] = await Promise.all([api('obtenerPresupuestos'), api('obtenerRecurrentes')]);
```

- En el armado de `cont.innerHTML`, después del cierre `'</section>'` de la sección de presupuestos, agregar `+ seccionPagosFijos(rec)` antes del `;`.
- Al final de `VISTAS.presupuestos` (después del handler de `#p-guardar`), agregar `enlazarPagosFijos(cont, rec);`.
- Agregar estas funciones antes de `</script>`:

```js
// Pagos fijos: solo se recuerdan (Telegram e Inicio); no crean movimientos.
function seccionPagosFijos(rec) {
  const filas = rec.recurrentes.map(r =>
    '<div class="fila-fijo' + (r.activo ? '' : ' atenuada') + '">' +
    '<button type="button" class="abrir-fijo" data-fijo="' + esc(r.id) + '"><span>' + esc(categoria(r.categoria_id).emoji + ' ' + r.nombre) + '</span>' +
    '<span class="tenue detalle">Día ' + r.dia_mes + ' · ' + esc(cuenta(r.cuenta_id).nombre) + '</span></button>' +
    '<span class="der num">' + dinero(r.monto, r.moneda) + '</span>' +
    '<label class="check"><input type="checkbox" data-activo="' + esc(r.id) + '"' + (r.activo ? ' checked' : '') +
    ' aria-label="' + esc(r.nombre) + ' activo"></label></div>').join('');
  return '<section class="tarjeta seccion">' +
    '<div class="cabecera-seccion"><div class="etiqueta">Pagos fijos al mes</div><div class="kpi num">' + dinero(rec.totalMensual) + '</div></div>' +
    '<p class="tenue" style="margin:0 0 12px;font-size:13px">Te los recuerdo por Telegram 3 días antes y el mismo día. ' +
      'No se registran solos: el gasto entra por el correo del banco o lo anotas tú.</p>' +
    (filas || '<div class="vacio">Aún no tienes pagos fijos.</div>') +
    '<div class="acciones"><button type="button" class="boton" id="pf-agregar">+ Agregar pago fijo</button></div></section>';
}

function enlazarPagosFijos(cont, rec) {
  $('#pf-agregar', cont).onclick = () => abrirFormFijo(null, rec);
  cont.querySelectorAll('[data-fijo]').forEach(b => {
    b.onclick = () => abrirFormFijo(rec.recurrentes.find(r => r.id === b.dataset.fijo), rec);
  });
  cont.querySelectorAll('[data-activo]').forEach(i => {
    i.onchange = async () => {
      const r = rec.recurrentes.find(x => x.id === i.dataset.activo);
      i.disabled = true;
      try {
        await api('guardarRecurrente', Object.assign({}, r, { activo: i.checked }));
        aviso(i.checked ? 'Pago fijo activado' : 'Pago fijo pausado');
        mostrar('presupuestos');
      } catch (err) {
        aviso(err.message, true);
        i.checked = !i.checked;
        i.disabled = false;
      }
    };
  });
}

function abrirFormFijo(r, rec) {
  const v = r || { nombre: '', monto: '', moneda: 'PEN', dia_mes: '', cuenta_id: rec.cuentas.length ? rec.cuentas[0].id : '', categoria_id: '', activo: true };
  // Al editar, la cuenta y la categoría actuales aparecen aunque estén desactivadas.
  const cuentas = rec.cuentas.concat(r && !rec.cuentas.some(c => c.id === r.cuenta_id) ? [cuenta(r.cuenta_id)] : []);
  const cats = rec.categorias.concat(r && !rec.categorias.some(c => c.id === r.categoria_id) ? [categoria(r.categoria_id)] : []);
  const caja = abrirModal('<h2 class="titulo-modal">' + (r ? 'Editar pago fijo' : 'Nuevo pago fijo') + '</h2>' +
    campo('Nombre', '<input class="entrada" id="pf-nombre" value="' + esc(v.nombre) + '" placeholder="Spotify, gimnasio, alquiler…">') +
    '<div class="dos-col" style="grid-template-columns:1fr 92px">' +
      campo('Monto', '<input class="entrada num" id="pf-monto" inputmode="decimal" placeholder="0.00" value="' + esc(v.monto) + '">') +
      campo('Moneda', seleccion('pf-moneda', ['PEN', 'USD'], v.moneda)) + '</div>' +
    '<div class="dos-col">' +
      campo('Día del mes', '<input class="entrada num" id="pf-dia" inputmode="numeric" placeholder="1 a 31" value="' + esc(v.dia_mes) + '">') +
      campo('Cuenta', seleccion('pf-cuenta', cuentas.map(c => c.id), v.cuenta_id, cuentas.map(c => c.nombre))) + '</div>' +
    campo('Categoría', seleccion('pf-categoria', [''].concat(cats.map(c => c.id)), v.categoria_id, ['Elige…'].concat(cats.map(c => c.emoji + ' ' + c.nombre)))) +
    '<div class="acciones">' + (r ? '<button type="button" class="boton peligro" id="pf-eliminar">Eliminar</button>' : '') +
    '<button type="button" class="boton" id="pf-cancelar">Cancelar</button><button type="button" class="boton primario" id="pf-guardar">Guardar</button></div>');
  $('#pf-cancelar', caja).onclick = cerrarModal;
  $('#pf-guardar', caja).onclick = async e => {
    e.target.disabled = true;
    try {
      await api('guardarRecurrente', {
        id: r ? r.id : '', nombre: $('#pf-nombre', caja).value, monto: $('#pf-monto', caja).value, moneda: $('#pf-moneda', caja).value,
        dia_mes: $('#pf-dia', caja).value, cuenta_id: $('#pf-cuenta', caja).value, categoria_id: $('#pf-categoria', caja).value, activo: v.activo,
      });
      cerrarModal();
      aviso(r ? 'Pago fijo actualizado' : 'Pago fijo guardado');
      mostrar('presupuestos');
    } catch (err) {
      aviso(err.message, true);
      e.target.disabled = false;
    }
  };
  const eliminar = $('#pf-eliminar', caja);
  if (eliminar) {
    eliminar.onclick = async () => {
      if (!eliminar.dataset.seguro) { eliminar.dataset.seguro = '1'; eliminar.textContent = '¿Seguro? Toca otra vez'; return; }
      eliminar.disabled = true;
      try {
        await api('eliminarRecurrente', r.id);
        cerrarModal();
        aviso('Pago fijo eliminado');
        mostrar('presupuestos');
      } catch (err) {
        aviso(err.message, true);
        eliminar.disabled = false;
      }
    };
  }
  if (!r) $('#pf-nombre', caja).focus();
}
```

- [ ] **Step 4: Estilos**

En `src/web/estilos.html`, después de `.fila-presupuesto .ref {…}`:

```css
.atenuada { opacity: .5; }
.fila-pago { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 4px 12px; align-items: center; padding: 9px 4px; border-bottom: 1px solid var(--borde); font-size: 14px; }
.fila-pago .cuando { font-size: 13px; color: var(--texto-2); }
.fila-pago .cuando.alerta { color: var(--alerta); }
.fila-pago .cuando.neg { color: var(--negativo); }
.fila-fijo { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--borde); }
.abrir-fijo { all: unset; cursor: pointer; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.abrir-fijo .detalle { font-size: 12px; }
.abrir-fijo:focus-visible { outline: 2px solid var(--primario); outline-offset: 2px; border-radius: 6px; }
```

y dentro de `@media (max-width: 720px) {`:

```css
  .fila-pago { grid-template-columns: minmax(0, 1fr) auto; }
  .fila-pago .der { grid-column: 1 / -1; text-align: left; }
```

- [ ] **Step 5: Revisar en Chrome a 390 px y 1280 px**

Run, uno por uno, y mirar cada captura en el scratchpad:
- `node tests/ui/ver.js "mostrar('inicio')" vista inicio-390.png 390`
- `node tests/ui/ver.js "mostrar('inicio')" vista inicio-1280.png 1280`
- `node tests/ui/ver.js "mostrar('presupuestos')" vista ppto-390.png 390`
- `node tests/ui/ver.js "mostrar('presupuestos')" vista ppto-1280.png 1280`
- `node tests/ui/ver.js "mostrar('presupuestos');setTimeout(()=>document.querySelector('[data-fijo]').click(),300)" modal fijo-390.png 390`
- `node tests/ui/ver.js "document.getElementById('vista').innerHTML='<div class=grid>'+bloqueProximosPagos({pagos:[],porPagar:0})+'</div>'" vista vacio-390.png 390`

Expected:
- No hay errores de JS y la página no tiene scroll horizontal.
- El bloque "Próximos pagos" está debajo de "Presupuesto del mes": "hoy" y "jue 15/10" en color de alerta, la VISA con "S/ 845.30 ✓ · $ 45.60 pendiente", y el pie "Por pagar en 30 días: S/ 386.90".
- La sección "Pagos fijos" muestra 3 filas, con "Nube" atenuada, y "Pagos fijos al mes S/ 140.90".
- El modal de edición abre con los datos de "Gimnasio" y el botón Eliminar.
- El vacío muestra el botón "Agregar pagos fijos".

- [ ] **Step 6: Suite, lint y commit**

Run: `npm test && npm run lint`
Expected: verde y lint limpio.

```bash
git add src/web/vista-inicio.html src/web/vista-presupuestos.html src/web/estilos.html tests/ui/stub.js
git commit -m "feat: bloque Próximos pagos en el Inicio y sección Pagos fijos"
```

---

### Task 7: Documentación y versión 0.6.0

**Files:**
- Modify: `README.md`, `docs/arquitectura.md`, `CHANGELOG.md`, `package.json`

- [ ] **Step 1: README**

Leer la sección "Qué hace hoy (v0.5)" y la hoja de ruta de `README.md`:
- Cambiar el título a "Qué hace hoy (v0.6)".
- Agregar este punto después del de presupuestos:

```markdown
- **Próximos pagos**: lee el correo del estado de cuenta VISA del BCP (total, mínimo y último día de pago en S/ y $), sabe qué parte ya pagaste y te recuerda por Telegram 3 días antes y el mismo día, junto con tus pagos fijos (suscripciones, gimnasio, alquiler). Bloque en el Inicio y comando `/pagos`.
```

- En la hoja de ruta, marcar v0.6 como ✅.

- [ ] **Step 2: Arquitectura**

En `docs/arquitectura.md`, en la tabla del modelo de datos, agregar después de la fila de `Presupuestos`:

```markdown
| `Recurrentes` | Pagos fijos mensuales (`dia_mes` 1–31; en meses cortos, el último día). Solo se recuerdan, no crean movimientos. |
| `EstadosCuenta` | Lo que pide pagar cada estado de cuenta de la tarjeta (total y mínimo en S/ y $, último día). Los pagos cuentan desde el día siguiente al vencimiento anterior. |
```

Si el documento tiene una lista de triggers, agregar `recordarPagos` (diario, 8:00, se instala al conectar el bot o al abrir la app).

- [ ] **Step 3: CHANGELOG y versión**

En `CHANGELOG.md`, arriba de 0.5.0:

```markdown
## [0.6.0] - 2026-10-13

### Agregado
- Próximos pagos: bloque en el Inicio con los pagos de los próximos 30 días y lo que falta pagar.
- Pagos fijos (recurrentes) en la pestaña Presupuestos: solo se recuerdan, no crean movimientos.
- Lectura del correo "Estado de Cuenta de tu Tarjeta VISA" del BCP: total, mínimo y último día de pago en S/ y $, con aviso por Telegram al llegar.
- Estado de la tarjeta por moneda: pagado, mínimo cubierto, pendiente o vencido.
- Recordatorio por Telegram a las 8:00, 3 días antes y el mismo día, y comando `/pagos`.
- Esquema v4: hojas `Recurrentes` y `EstadosCuenta` (migración automática).
```

En `package.json`: `"version": "0.6.0"`.

- [ ] **Step 4: Suite, lint y commit**

Run: `npm test && npm run lint`
Expected: verde y lint limpio.

```bash
git add README.md docs/arquitectura.md CHANGELOG.md package.json
git commit -m "docs: próximos pagos y versión 0.6.0"
```

- [ ] **Step 5: Desplegar para la prueba real**

Run: `npm run deploy` (misma implementación de la app) y `npm run deploy:receptor` (el receptor usa la app como biblioteca en developmentMode, así que toma `/pagos` sin cambios propios).
Expected: las dos terminan sin error. La prueba real es de Bruno:
1. Abrir la app; esto migra a v4 e instala el recordatorio.
2. Cargar sus pagos fijos.
3. "Revisar ahora" o "Importar" desde el 30/09 para leer su último estado de cuenta.
4. Escribir `/pagos` en Telegram.
