# Fase 3 · Bot de Telegram — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un bot de Telegram (modo B) que pregunta solo por lo desconocido, registra gastos escritos (`taxi 12 yape`), responde comandos y envía el resumen diario, sin abrir la app web a nadie más que al dueño.

**Architecture:** La app principal (Apps Script vinculado a la hoja, web app `MYSELF`) gana `src/telegram/`. Un segundo proyecto mínimo, el **receptor** (`receptor/`, web app anónima), recibe el webhook y llama a `Finanzas.recibirTelegram(...)` usando la app como biblioteca en `developmentMode`, compartiendo Script Properties y LockService. Todo lo que arma texto y teclados, y el lector de gastos escritos, son funciones puras probadas en Node.

**Tech Stack:** Google Apps Script (V8), UrlFetchApp → API HTTP de Telegram, CacheService, clasp 3.4.1, Node 24 `node --test` con el arnés `tests/harness.js`, ESLint 9.

**Spec:** [docs/superpowers/specs/2026-10-13-fase-3-telegram-design.md](../specs/2026-10-13-fase-3-telegram-design.md) (y el general: [2026-10-13-app-finanzas-design.md](../specs/2026-10-13-app-finanzas-design.md) §7).

## Global Constraints

- Nunca datos personales ni secretos en el repo: tokens, ids de chat y URLs de prueba son ficticios; secretos solo en Script Properties.
- Funciones públicas (llamables desde el navegador o la biblioteca) sin guion bajo final; internas con `_`. Apps Script oculta a los usuarios de una biblioteca las funciones que terminan en `_`, así que el receptor solo puede llamar a funciones públicas.
- Toda escritura en la hoja va dentro de `conBloqueo_`, y `conBloqueo_` nunca se anida.
- Nada que se ejecute desde el receptor crea ni borra triggers (`ScriptApp` operaría sobre el proyecto receptor). Los triggers solo se crean en funciones llamadas desde la app web o el editor.
- Nunca `new Date('yyyy-mm-dd')` ni `instanceof Date` (usar `esFecha_`); montos con `redondear2_`; agregados con `monto_pen`.
- Textos para Telegram en modo HTML: todo dato de la hoja pasa por `escaparHtml_`. Nunca se envían números de cuenta o tarjeta, solo el nombre de la cuenta.
- UI: sin `alert/confirm/prompt`; todo dato en HTML pasa por `esc()`.
- `callback_data` de cada botón ≤ 64 bytes.
- Textos al usuario en español con tildes.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Herramientas: al escribir `​` en código desde las herramientas, usar `\\u200B` (no aplica a esta fase salvo que aparezca).

## Review Focus

1. Comercios o nombres con `<`, `>` o `&` en mensajes HTML → Telegram rechaza el mensaje si no se escapan. Probado en Task 3 (`textoMovimiento_`, `textoResumen_`) y Task 7 (`ok` con texto con `<b>`).
2. Telegram reenvía el mismo update (respuesta 302 de Apps Script) → el gasto escrito no se duplica. Probado en Task 5 (comando) y Task 6 (gasto escrito).
3. Botón viejo tocado después de resolver el movimiento en la app, o de borrarlo → mensaje "Ya estaba en …" / "Ese movimiento ya no existe", sin error ni cambio de datos. Probado en Task 7.
4. Telegram caído mientras se leen correos → la lectura termina igual y solo queda un aviso en el Log. Probado en Task 8.
5. Montos con coma decimal, miles con coma y prefijo `S/`, `S/.` → monto correcto. Probado en Task 4.

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `receptor/Receptor.js` | Crear | `doPost` → `Finanzas.recibirTelegram`; `autorizar` para la primera ejecución. |
| `scripts/desplegar-receptor.js` | Crear | Crea/actualiza el proyecto receptor con manifiesto generado y un único despliegue. |
| `package.json`, `.gitignore`, `eslint.config.js` | Modificar | Script `deploy:receptor`, ignorar archivos generados del receptor, lint de `receptor/`. |
| `tests/harness.js` | Modificar | `UrlFetchApp` (Telegram), `CacheService`, `ScriptApp.getService`, triggers `atHour/everyDays`. |
| `tests/telegram.js` | Crear | `entornoBot()` y ayudantes para simular mensajes y botones. |
| `src/telegram/cliente.js` | Crear | Llamadas a la API de Telegram. |
| `src/telegram/mensajes.js` | Crear | Textos y teclados (puro). |
| `src/telegram/escrito.js` | Crear | Lector de gastos escritos (puro). |
| `src/telegram/webhook.js` | Crear | Puerta de entrada, comandos, vinculación por código. |
| `src/telegram/registro.js` | Crear | Guardar el gasto escrito, `/deshacer`, contexto del bot. |
| `src/telegram/acciones.js` | Crear | Botones. |
| `src/telegram/avisos.js` | Crear | Avisos de por revisar y de errores de triggers. |
| `src/telegram/resumen.js` | Crear | Resumen diario, `/hoy`, `/mes`, trigger del resumen. |
| `src/telegram/vinculacion.js` | Crear | API de Ajustes para conectar/desconectar el bot. |
| `src/web/api-revisar.js` | Modificar | Extraer `recordarComercio_`. |
| `src/ingesta/revisar.js` | Modificar | Avisar por revisar al terminar; avisar errores del trigger. |
| `src/appsscript.json` | Modificar | Scope `script.external_request`. |
| `src/web/vista-telegram.html`, `vista-ajustes.html`, `Index.html`, `estilos.html`, `vista-asistente.html` | Crear/Modificar | Sección Telegram en Ajustes. |
| `tests/ui/stub.js` | Modificar | Respuestas simuladas de las funciones nuevas. |
| Docs, `CHANGELOG.md`, `README.md`, `package.json` | Modificar | v0.3.0. |

---

### Task 1: Receptor y verificación con la app real

**Files:**
- Create: `receptor/Receptor.js`, `scripts/desplegar-receptor.js`
- Modify: `package.json` (scripts), `.gitignore`, `eslint.config.js`

**Interfaces:**
- Consumes: la función pública `estadoInstalacion()` (ya existe) y, desde la Task 5, `recibirTelegram(secreto, cuerpo)`.
- Produces: `npm run deploy:receptor` que imprime la URL `https://script.google.com/macros/s/<id>/exec` del receptor; archivos `receptor/.clasp.json` y `receptor/.despliegue` (ignorados por git).

Esta tarea necesita a Bruno para un paso: autorizar el receptor en el editor (consentimiento OAuth). Es una parada legítima: pedirle el paso, esperar y seguir.

- [ ] **Step 1: Crear el receptor**

`receptor/Receptor.js`:

```js
// Receptor público del webhook de Telegram. Solo pasa el mensaje a la app (biblioteca
// "Finanzas"), que valida el secreto de la URL y el chat. No tiene doGet.

function doPost(e) {
  try {
    Finanzas.recibirTelegram(e && e.parameter ? e.parameter.secret : '', e && e.postData ? e.postData.contents : '');
  } catch (err) {
    console.error(err);
  }
  return ContentService.createTextOutput('ok');
}

// Ejecútala una vez desde el editor del receptor para autorizarlo (sin esto, Google
// responde "Acceso denegado" a Telegram).
function autorizar() {
  console.log(JSON.stringify(Finanzas.estadoInstalacion()));
}
```

- [ ] **Step 2: Crear el script de despliegue**

`scripts/desplegar-receptor.js`:

```js
// Crea (la primera vez) y actualiza el proyecto receptor del webhook de Telegram.
// Usa la app como biblioteca en modo desarrollo: siempre corre el último código subido.
// receptor/.clasp.json, receptor/.despliegue y receptor/appsscript.json no se versionan.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DIR = path.join(RAIZ, 'receptor');
const correr = comando => execSync(comando, { cwd: DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const app = JSON.parse(fs.readFileSync(path.join(RAIZ, '.clasp.json'), 'utf8'));
if (!app.scriptId) throw new Error('Falta .clasp.json de la app: instala la app antes que el receptor.');

if (!fs.existsSync(path.join(DIR, '.clasp.json'))) {
  console.log(correr('npx clasp create-script --type standalone --title "Finanzas · receptor de Telegram" --rootDir .'));
}
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
console.log(correr('npx clasp push --force'));

const ARCHIVO = path.join(DIR, '.despliegue');
let id = fs.existsSync(ARCHIVO) ? fs.readFileSync(ARCHIVO, 'utf8').trim() : '';
if (id) {
  console.log(correr('npx clasp create-deployment -i ' + id + ' -d "npm run deploy:receptor"'));
} else {
  const salida = correr('npx clasp create-deployment -d "npm run deploy:receptor"');
  console.log(salida);
  id = (/AKfy[\w-]+/.exec(salida) || [])[0];
  if (!id) throw new Error('No pude leer el id del despliegue en la salida de clasp.');
  fs.writeFileSync(ARCHIVO, id + '\n');
}
const receptor = JSON.parse(fs.readFileSync(path.join(DIR, '.clasp.json'), 'utf8'));
console.log('Editor del receptor (ejecuta "autorizar" una vez): https://script.google.com/d/' + receptor.scriptId + '/edit');
console.log('URL del receptor (pégala en Ajustes → Telegram): https://script.google.com/macros/s/' + id + '/exec');
```

- [ ] **Step 3: Scripts, ignorados y lint**

En `package.json`, dentro de `"scripts"`, después de `"deploy"`:

```json
    "deploy:receptor": "node scripts/desplegar-receptor.js",
```

En `.gitignore`, agregar al final:

```
receptor/appsscript.json
```

(`.clasp.json` y `.despliegue` ya se ignoran en cualquier carpeta.)

En `eslint.config.js`, cambiar `files: ['src/**/*.js'],` por:

```js
    files: ['src/**/*.js', 'receptor/**/*.js'],
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 5: Desplegar el receptor**

Run: `npm run deploy:receptor`
Expected: imprime "Editor del receptor …/edit" y "URL del receptor …/exec". Guardar ambas URLs para los pasos siguientes (no van al repo).

- [ ] **Step 6: Autorización (Bruno)**

Pedir a Bruno: abrir la URL del editor del receptor, elegir la función `autorizar`, tocar **Ejecutar** y aceptar los permisos.
Expected: el registro de ejecución termina sin error y muestra el JSON de `estadoInstalacion` (`"instalado":true`). Eso prueba que un proyecto **vinculado a la hoja** funciona como biblioteca y que el receptor abre la hoja.

Si falla con un error de biblioteca (por ejemplo "Library with identifier Finanzas is missing" o "No se encontró la biblioteca") o la hoja no abre: **detenerse y consultar a Bruno**: el diseño del receptor cambia.

Nota: si `estadoInstalacion` falla con "Falta la hoja", es porque `SHEET_ID` aún no existe en las propiedades (lo guarda la Task 10 al conectar el bot). En ese caso, desde el editor de la **app**, en Configuración del proyecto → Propiedades del script, Bruno puede agregar `SHEET_ID` con el id de su hoja y repetir; o aceptar el error si el mensaje prueba que la biblioteca cargó (el error viene de `hoja_`, dentro de la app).

- [ ] **Step 7: Probar el POST anónimo**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d "{}" "<URL del receptor>?secret=x"`
Expected: `302` (doPost se ejecutó; `recibirTelegram` aún no existe y el error queda en el registro del receptor).

- [ ] **Step 8: Commit**

```bash
git add receptor/Receptor.js scripts/desplegar-receptor.js package.json .gitignore eslint.config.js
git commit -m "feat: receptor del webhook de Telegram y su despliegue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Arnés de Telegram y cliente de la API

**Files:**
- Modify: `tests/harness.js`
- Create: `tests/telegram.js`, `src/telegram/cliente.js`, `tests/telegram-cliente.test.js`

**Interfaces:**
- Produces (arnés): `e.telegram = { llamadas: [{ token, metodo, datos }], falla: null | string, respuestas: { [metodo]: datos => cuerpo }, contador }`, `e.cache` (objeto clave → valor); `ScriptApp.getService().getUrl()` → `'https://script.google.com/macros/s/APP-PRUEBA/exec'`; triggers con `.atHour(h).everyDays(1)` guardan `t.hora = h` y `t.cada = '1 d'`.
- Produces (código): `llamarTelegram_(metodo, datos, token?) → result`, `telegramVinculado_() → boolean`, `enviarMensaje_(texto, teclado?) → result`, `editarMensaje_(messageId, texto, teclado?) → result | null`, `responderBoton_(callbackId, texto?)`. `teclado` = filas de botones `[{ text, callback_data } | { text, url }]`.
- Produces (pruebas): `tests/telegram.js` exporta `{ entornoBot, SECRETO, CHAT, TOKEN }`.

- [ ] **Step 1: Ampliar el arnés**

En `tests/harness.js`, antes de `// ScriptApp simulado: solo triggers de tiempo.`, agregar:

```js
// UrlFetchApp simulado: solo la API de Telegram. Registra cada llamada; `estado.falla`
// hace que Telegram responda error y `estado.respuestas[metodo]` personaliza la respuesta
// ({ __crudo, __codigo } simula una respuesta que no es JSON).
function crearUrlFetch(estado) {
  return {
    fetch: (url, o) => {
      const m = /^https:\/\/api\.telegram\.org\/bot([^/]+)\/(\w+)$/.exec(url);
      if (!m) throw new Error('URL inesperada: ' + url);
      const datos = JSON.parse(o.payload || '{}');
      estado.llamadas.push({ token: m[1], metodo: m[2], datos });
      let cuerpo;
      if (estado.falla) cuerpo = { ok: false, description: estado.falla };
      else if (estado.respuestas[m[2]]) cuerpo = estado.respuestas[m[2]](datos, m[1]);
      else if (m[2] === 'sendMessage') cuerpo = { ok: true, result: { message_id: ++estado.contador } };
      else if (m[2] === 'getMe') cuerpo = { ok: true, result: { id: 42, is_bot: true, username: 'prueba_bot' } };
      else cuerpo = { ok: true, result: true };
      const texto = cuerpo.__crudo !== undefined ? cuerpo.__crudo : JSON.stringify(cuerpo);
      const codigo = cuerpo.__codigo || (cuerpo.ok ? 200 : 400);
      return { getResponseCode: () => codigo, getContentText: () => texto };
    },
  };
}
```

En `crearScriptApp`, reemplazar el objeto devuelto por:

```js
  return {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/APP-PRUEBA/exec' }),
    newTrigger: funcion => ({
      timeBased: () => {
        const t = { funcion: funcion, cada: null, hora: null, getHandlerFunction: () => funcion };
        const b = {
          everyMinutes: n => {
            if ([1, 5, 10, 15, 30].indexOf(n) < 0) throw new Error('Intervalo de minutos inválido: ' + n);
            t.cada = n + ' min';
            return b;
          },
          everyHours: n => { t.cada = n + ' h'; return b; },
          atHour: h => {
            if (!Number.isInteger(h) || h < 0 || h > 23) throw new Error('Hora inválida: ' + h);
            t.hora = h;
            return b;
          },
          everyDays: n => { t.cada = n + ' d'; return b; },
          create: () => { triggers.push(t); return t; },
        };
        return b;
      },
    }),
  };
```

En `crearEntorno`, después de `const triggers = [];`:

```js
  const telegram = { llamadas: [], falla: null, respuestas: {}, contador: 100 };
  const cache = {};
```

En el objeto de `vm.createContext`, después de `Gmail: gmail,`:

```js
    UrlFetchApp: crearUrlFetch(telegram),
    CacheService: {
      getScriptCache: () => ({
        get: k => (k in cache ? cache[k] : null),
        put: (k, v) => { cache[k] = String(v); },
        remove: k => { delete cache[k]; },
      }),
    },
```

En el `return` de `crearEntorno`, cambiar la primera línea por:

```js
    principal, libros, propiedades, stats, gmail, triggers, telegram, cache,
```

- [ ] **Step 2: Ayudante de pruebas del bot**

`tests/telegram.js`:

```js
const { entornoInstalado } = require('./fixtures');

// Datos ficticios del bot (nunca un token, chat o URL reales).
const SECRETO = 'secreto-de-prueba-0123456789abcd';
const CHAT = 555;
const TOKEN = '123456:token-de-prueba-abcdefghijklmnopqrstuvwxyz';

// App instalada con el bot ya conectado y vinculado al chat CHAT.
function entornoBot(opciones) {
  const e = entornoInstalado(opciones);
  Object.assign(e.propiedades, {
    TELEGRAM_TOKEN: TOKEN, WEBHOOK_SECRET: SECRETO, TELEGRAM_CHAT_ID: String(CHAT), TELEGRAM_BOT: 'prueba_bot',
    APP_URL: 'https://script.google.com/macros/s/APP-PRUEBA/exec',
  });
  let ultimoUpdate = 1000;
  e.enviar = u => e.llamar('recibirTelegram', SECRETO, JSON.stringify(u));
  // Mensaje de texto del chat (por defecto el vinculado). Devuelve el update_id usado.
  e.escribir = (texto, chat) => {
    ultimoUpdate++;
    e.enviar({ update_id: ultimoUpdate, message: { message_id: ultimoUpdate, chat: { id: chat || CHAT }, text: texto } });
    return ultimoUpdate;
  };
  // Toque de un botón del mensaje 77; `texto` = texto visible de ese mensaje.
  e.tocar = (data, texto) => {
    ultimoUpdate++;
    e.enviar({ update_id: ultimoUpdate, callback_query: { id: 'cb' + ultimoUpdate, data, message: { message_id: 77, chat: { id: CHAT }, text: texto || 'mensaje anterior' } } });
  };
  e.llamadas = metodo => e.telegram.llamadas.filter(l => l.metodo === metodo).map(l => l.datos);
  e.enviados = () => e.llamadas('sendMessage');
  e.ultimoEnviado = () => e.enviados().slice(-1)[0];
  e.ultimoEditado = () => e.llamadas('editMessageText').slice(-1)[0];
  e.botones = datos => (datos && datos.reply_markup ? datos.reply_markup.inline_keyboard : []);
  e.limpiarTelegram = () => { e.telegram.llamadas.length = 0; };
  return e;
}

module.exports = { entornoBot, SECRETO, CHAT, TOKEN };
```

- [ ] **Step 3: Escribir las pruebas que fallan**

`tests/telegram-cliente.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoBot, TOKEN, CHAT } = require('./telegram');

test('enviarMensaje_ manda HTML al chat vinculado con su teclado', () => {
  const e = entornoBot();
  const r = e.interno('enviarMensaje_', 'Hola <b>Ana</b>', [[{ text: 'A', callback_data: 'x' }]]);
  assert.strictEqual(r.message_id, 101);
  const [l] = e.telegram.llamadas;
  assert.strictEqual(l.token, TOKEN);
  assert.strictEqual(l.metodo, 'sendMessage');
  assert.deepStrictEqual(l.datos, {
    chat_id: String(CHAT), text: 'Hola <b>Ana</b>', parse_mode: 'HTML', disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: 'A', callback_data: 'x' }]] },
  });
});

test('sin teclado no hay reply_markup; editar sin teclado quita los botones', () => {
  const e = entornoBot();
  e.interno('enviarMensaje_', 'solo texto');
  e.interno('editarMensaje_', 77, 'editado', null);
  const [envio, edicion] = e.telegram.llamadas;
  assert.ok(!('reply_markup' in envio.datos));
  assert.strictEqual(edicion.metodo, 'editMessageText');
  assert.deepStrictEqual(edicion.datos, { chat_id: String(CHAT), message_id: 77, text: 'editado', parse_mode: 'HTML', disable_web_page_preview: true });
});

test('un error de Telegram se informa con su descripción y sin el token', () => {
  const e = entornoBot();
  e.telegram.falla = 'Bad Request: chat not found';
  assert.throws(() => e.interno('enviarMensaje_', 'x'),
    err => err.message === 'Telegram respondió: Bad Request: chat not found' && err.message.indexOf(TOKEN) < 0);
});

test('una respuesta que no es JSON se informa con el código HTTP', () => {
  const e = entornoBot();
  e.telegram.respuestas.sendMessage = () => ({ __crudo: '<html>Bad gateway</html>', __codigo: 502 });
  assert.throws(() => e.interno('enviarMensaje_', 'x'), /^Error: Telegram respondió: HTTP 502$/);
});

test('editarMensaje_ ignora "message is not modified" (doble toque) pero no otros errores', () => {
  const e = entornoBot();
  e.telegram.falla = 'Bad Request: message is not modified: specified new message content is the same';
  assert.strictEqual(e.interno('editarMensaje_', 77, 'x', null), null);
  e.telegram.falla = 'Bad Request: message to edit not found';
  assert.throws(() => e.interno('editarMensaje_', 77, 'x', null), /message to edit not found/);
});

test('sin token: "Telegram no está configurado"; telegramVinculado_ exige token y chat', () => {
  const e = entornoBot();
  assert.strictEqual(e.interno('telegramVinculado_'), true);
  delete e.propiedades.TELEGRAM_CHAT_ID;
  assert.strictEqual(e.interno('telegramVinculado_'), false);
  delete e.propiedades.TELEGRAM_TOKEN;
  assert.throws(() => e.interno('enviarMensaje_', 'x'), /Telegram no está configurado/);
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

test('llamarTelegram_ con token explícito (antes de guardarlo) y responderBoton_', () => {
  const e = entornoBot();
  delete e.propiedades.TELEGRAM_TOKEN;
  assert.strictEqual(e.interno('llamarTelegram_', 'getMe', {}, '999:otro-token').username, 'prueba_bot');
  assert.strictEqual(e.telegram.llamadas[0].token, '999:otro-token');
  e.propiedades.TELEGRAM_TOKEN = TOKEN;
  e.interno('responderBoton_', 'cb1');
  e.interno('responderBoton_', 'cb2', 'Listo');
  assert.deepStrictEqual(e.llamadas('answerCallbackQuery'), [{ callback_query_id: 'cb1' }, { callback_query_id: 'cb2', text: 'Listo' }]);
});
```

- [ ] **Step 4: Ver que fallan**

Run: `node --test tests/telegram-cliente.test.js`
Expected: FAIL con "contexto[nombre] is not a function" (no existen las funciones).

- [ ] **Step 5: Implementar el cliente**

`src/telegram/cliente.js`:

```js
// Único archivo que habla con la API de Telegram (UrlFetchApp). El token vive solo en
// las propiedades del script y nunca aparece en los mensajes de error.

const URL_API_TELEGRAM = 'https://api.telegram.org/bot';

// `token` solo se pasa al conectar el bot, antes de guardarlo.
function llamarTelegram_(metodo, datos, token) {
  const clave = token || PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN');
  if (!clave) throw new Error('Telegram no está configurado.');
  const respuesta = UrlFetchApp.fetch(URL_API_TELEGRAM + clave + '/' + metodo, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(datos || {}), muteHttpExceptions: true,
  });
  let cuerpo = {};
  try {
    cuerpo = JSON.parse(respuesta.getContentText());
  } catch {
    // Una página de error en vez de JSON: se informa con el código HTTP.
  }
  if (!cuerpo.ok) throw new Error('Telegram respondió: ' + (cuerpo.description || 'HTTP ' + respuesta.getResponseCode()));
  return cuerpo.result;
}

function telegramVinculado_() {
  const props = PropertiesService.getScriptProperties();
  return !!(props.getProperty('TELEGRAM_TOKEN') && props.getProperty('TELEGRAM_CHAT_ID'));
}

function datosMensaje_(texto, teclado) {
  const datos = {
    chat_id: PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID'),
    text: texto, parse_mode: 'HTML', disable_web_page_preview: true,
  };
  if (teclado && teclado.length) datos.reply_markup = { inline_keyboard: teclado };
  return datos;
}

// teclado = filas de botones [{ text, callback_data } | { text, url }]; sin teclado = sin botones.
function enviarMensaje_(texto, teclado) {
  return llamarTelegram_('sendMessage', datosMensaje_(texto, teclado));
}

function editarMensaje_(messageId, texto, teclado) {
  try {
    return llamarTelegram_('editMessageText', Object.assign({ message_id: messageId }, datosMensaje_(texto, teclado)));
  } catch (e) {
    // Tocar dos veces el mismo botón deja el mensaje igual y Telegram lo reporta como error.
    if (/message is not modified/i.test(e.message)) return null;
    throw e;
  }
}

function responderBoton_(callbackId, texto) {
  return llamarTelegram_('answerCallbackQuery', texto ? { callback_query_id: callbackId, text: texto } : { callback_query_id: callbackId });
}
```

- [ ] **Step 6: Ver que pasan, y la suite completa**

Run: `node --test tests/telegram-cliente.test.js` → Expected: PASS (7 pruebas).
Run: `npm test` → Expected: PASS (ninguna prueba anterior se rompe con el arnés ampliado).

- [ ] **Step 7: Commit**

```bash
git add tests/harness.js tests/telegram.js tests/telegram-cliente.test.js src/telegram/cliente.js
git commit -m "feat: cliente de la API de Telegram y arnés de pruebas del bot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Textos y teclados (puro)

**Files:**
- Create: `src/telegram/mensajes.js`, `tests/mensajes.test.js`

**Interfaces:**
- Consumes: `redondear2_`, `normalizarTexto_` (núcleo).
- Produces (todas puras; `ctx = { cuentas, categorias, urlApp, hoy }`):
  - `escaparHtml_(texto) → string`; `formatoMonto_(monto, moneda) → 'S/ 1,250.00' | 'US$ 23.60' | '−S/ 40.00'`
  - `compactarId_(id) → string` (UUID → 22 caracteres; otro id → `'~' + id`); `expandirId_(compacto) → id | ''`
  - `boton_(texto, datos) → { text, callback_data }`; `botonApp_(urlApp, texto?) → [] | [{ text, url }]`
  - `nombreCategoria_(categorias, id) → '🛒 Supermercado' | 'Sin categoría'`; `nombreCuenta_(cuentas, id) → nombre | 'sin cuenta'`
  - `textoMovimiento_(mov, ctx)`; `tecladoCategorias_(mov, idsFrecuentes, ctx)`; `tecladoTodas_(mov, ctx)`
  - `mensajePorRevisar_(mov, idsFrecuentes, ctx) → { texto, teclado | null }`; `mensajeAgrupado_(cantidad, urlApp) → { texto, teclado | null }`
  - `textoCategorizado_(mov, categoriaId, ctx, extra?)`; `tecladoRecordar_(mov)`; `textoRegistrado_(mov, ctx)`; `tecladoRegistrado_(mov)`
  - `textoResumen_(movsDelDia, ctx, { porRevisar, noLeidos }) → string ('' si no hay movimientos)`; `textoMes_(mes, resumen, porCategoria) → string`
  - Constantes: `MAX_AVISOS_SUELTOS = 5`, `MAX_LINEAS_RESUMEN = 15`, `TEXTO_AYUDA`.
  - Formatos de `callback_data`: `c:<mov>:<cat>`, `o:<mov>`, `v:<mov>`, `r:<mov>`, `s:<mov>`, `d:<mov>`, `k:<mov>`, `ok`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/mensajes.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

const e = crearEntorno();
const f = (nombre, ...args) => e.llamar(nombre, ...args);

const UUID_MOV = '0b6f3c1e-8f7a-4c2d-9e5b-1a2b3c4d5e6f';
const UUID_SUPER = '7d2e9a40-1c3b-4f5e-8a6d-2b3c4d5e6f70';
const UUID_COMIDA = 'c4a1e2f3-5b6c-4d7e-8f90-a1b2c3d4e5f6';
const CATS = [
  { id: UUID_SUPER, nombre: 'Supermercado', emoji: '🛒', tipo: 'gasto', activa: true },
  { id: UUID_COMIDA, nombre: 'Comida fuera', emoji: '🍽️', tipo: 'gasto', activa: true },
  { id: 'cat-trans', nombre: 'Transporte', emoji: '🚕', tipo: 'gasto', activa: true },
  { id: 'cat-ropa', nombre: 'Ropa', emoji: '👕', tipo: 'gasto', activa: true },
  { id: 'cat-vieja', nombre: 'Vieja', emoji: '', tipo: 'gasto', activa: false },
  { id: 'cat-sueldo', nombre: 'Sueldo', emoji: '💼', tipo: 'ingreso', activa: true },
];
const CUENTAS = [{ id: 'cu-visa', nombre: 'VISA <BCP>', numeros: '2222' }, { id: 'cu-deb', nombre: 'Débito BCP', numeros: '1111' }];
const URL_APP = 'https://script.google.com/macros/s/APP/exec';
const CTX = { cuentas: CUENTAS, categorias: CATS, urlApp: URL_APP, hoy: '2026-10-13' };
const MOV = {
  id: UUID_MOV, fecha: '2026-10-13', tipo: 'gasto', monto: 45.9, moneda: 'PEN', monto_pen: 45.9, cuenta_id: 'cu-visa',
  cuenta_destino_id: '', categoria_id: '', comercio: 'TOTTUS & <CIA>', descripcion: '', estado: 'por_revisar', origen: 'gmail',
};
const C = id => f('compactarId_', id);

test('escaparHtml_ y formatoMonto_', () => {
  assert.strictEqual(f('escaparHtml_', 'A & <b>'), 'A &amp; &lt;b&gt;');
  assert.strictEqual(f('escaparHtml_', null), '');
  assert.strictEqual(f('formatoMonto_', 45.9, 'PEN'), 'S/ 45.90');
  assert.strictEqual(f('formatoMonto_', 1250, 'PEN'), 'S/ 1,250.00');
  assert.strictEqual(f('formatoMonto_', 1234567.5, 'PEN'), 'S/ 1,234,567.50');
  assert.strictEqual(f('formatoMonto_', 23.6, 'USD'), 'US$ 23.60');
  assert.strictEqual(f('formatoMonto_', -40, 'PEN'), '−S/ 40.00');
});

test('compactarId_/expandirId_: un UUID cabe en 22 caracteres y vuelve igual; otros ids van con ~', () => {
  const c = C(UUID_MOV);
  assert.match(c, /^[A-Za-z0-9_-]{22}$/);
  assert.strictEqual(f('expandirId_', c), UUID_MOV);
  assert.strictEqual(f('expandirId_', C(UUID_SUPER)), UUID_SUPER);
  assert.strictEqual(C('id-0001'), '~id-0001');
  assert.strictEqual(f('expandirId_', '~id-0001'), 'id-0001');
  assert.strictEqual(C(UUID_MOV.toUpperCase()), '~' + UUID_MOV.toUpperCase());
  assert.strictEqual(f('expandirId_', 'basura'), '');
  assert.strictEqual(f('expandirId_', undefined), '');
});

test('textoMovimiento_ escapa datos, dice "hoy" o la fecha, y nunca muestra números de cuenta', () => {
  assert.strictEqual(f('textoMovimiento_', MOV, CTX), '🛒 <b>S/ 45.90</b> · VISA &lt;BCP&gt;\nTOTTUS &amp; &lt;CIA&gt; · hoy');
  assert.strictEqual(f('textoMovimiento_', Object.assign({}, MOV, { fecha: '2026-10-12' }), CTX).split('\n')[1], 'TOTTUS &amp; &lt;CIA&gt; · 12/10');
  const tr = Object.assign({}, MOV, { tipo: 'transferencia', cuenta_destino_id: 'cu-deb', comercio: '' });
  assert.strictEqual(f('textoMovimiento_', tr, CTX), '🔁 <b>S/ 45.90</b> · VISA &lt;BCP&gt; → Débito BCP\nSin descripción · hoy');
  assert.ok(!/2222|1111/.test(f('textoMovimiento_', tr, CTX)));
});

test('tecladoCategorias_: 3 frecuentes, Otra… y Abrir en la app; todo callback_data ≤ 64 bytes', () => {
  const t = f('tecladoCategorias_', MOV, [UUID_SUPER, UUID_COMIDA, 'cat-trans', 'cat-ropa'], CTX);
  assert.deepStrictEqual(t[0].map(b => b.text), ['🛒 Supermercado', '🍽️ Comida fuera', '🚕 Transporte']);
  assert.strictEqual(t[0][0].callback_data, 'c:' + C(UUID_MOV) + ':' + C(UUID_SUPER));
  assert.deepStrictEqual(t[1], [{ text: 'Otra…', callback_data: 'o:' + C(UUID_MOV) }, { text: 'Abrir en la app', url: URL_APP }]);
  t.flat().filter(b => b.callback_data).forEach(b => assert.ok(Buffer.byteLength(b.callback_data) <= 64, b.callback_data));
  const sinApp = f('tecladoCategorias_', MOV, [UUID_SUPER], Object.assign({}, CTX, { urlApp: '' }));
  assert.deepStrictEqual(sinApp[1], [{ text: 'Otra…', callback_data: 'o:' + C(UUID_MOV) }]);
});

test('tecladoTodas_: categorías activas del tipo, 2 por fila, y ← Volver', () => {
  const t = f('tecladoTodas_', MOV, CTX);
  assert.deepStrictEqual(t.map(fila => fila.map(b => b.text)), [
    ['🛒 Supermercado', '🍽️ Comida fuera'], ['🚕 Transporte', '👕 Ropa'], ['← Volver'],
  ]);
  assert.strictEqual(t[2][0].callback_data, 'v:' + C(UUID_MOV));
  t.flat().forEach(b => assert.ok(Buffer.byteLength(b.callback_data) <= 64));
});

test('mensajePorRevisar_: sin cuenta o transferencia → solo Abrir en la app; si no, categorías', () => {
  const sinCuenta = f('mensajePorRevisar_', Object.assign({}, MOV, { cuenta_id: '' }), [UUID_SUPER], CTX);
  assert.match(sinCuenta.texto, /\n<i>Elige la cuenta en la app\.<\/i>$/);
  assert.deepStrictEqual(sinCuenta.teclado, [[{ text: 'Abrir en la app', url: URL_APP }]]);
  const tr = f('mensajePorRevisar_', Object.assign({}, MOV, { tipo: 'transferencia' }), [], CTX);
  assert.match(tr.texto, /Elige la cuenta destino en la app\./);
  const sinApp = f('mensajePorRevisar_', Object.assign({}, MOV, { cuenta_id: '' }), [], Object.assign({}, CTX, { urlApp: '' }));
  assert.strictEqual(sinApp.teclado, null);
  const normal = f('mensajePorRevisar_', MOV, [UUID_SUPER], CTX);
  assert.strictEqual(normal.texto, f('textoMovimiento_', MOV, CTX));
  assert.strictEqual(normal.teclado[0][0].text, '🛒 Supermercado');
});

test('mensajeAgrupado_, textoCategorizado_, tecladoRecordar_, textoRegistrado_ y tecladoRegistrado_', () => {
  assert.deepStrictEqual(f('mensajeAgrupado_', 7, URL_APP), {
    texto: '📥 <b>7 movimientos nuevos por revisar</b>', teclado: [[{ text: 'Abrir la app', url: URL_APP }]],
  });
  assert.strictEqual(f('mensajeAgrupado_', 7, '').teclado, null);
  assert.strictEqual(f('textoCategorizado_', MOV, UUID_SUPER, CTX, ' · extra'), f('textoMovimiento_', MOV, CTX) + '\n✓ 🛒 Supermercado · extra');
  assert.deepStrictEqual(f('tecladoRecordar_', MOV), [[
    { text: 'Sí, recordar', callback_data: 'r:' + C(UUID_MOV) }, { text: 'Solo esta vez', callback_data: 's:' + C(UUID_MOV) },
  ]]);
  const escrito = Object.assign({}, MOV, { monto: 12, comercio: 'taxi', categoria_id: 'cat-trans', cuenta_id: 'cu-deb' });
  assert.strictEqual(f('textoRegistrado_', escrito, CTX), '✓ <b>S/ 12.00</b> · taxi · 🚕 Transporte · Débito BCP');
  assert.deepStrictEqual(f('tecladoRegistrado_', escrito), [[
    { text: 'Deshacer', callback_data: 'd:' + C(UUID_MOV) }, { text: 'Cambiar categoría', callback_data: 'k:' + C(UUID_MOV) },
  ]]);
});

test('textoResumen_: vacío sin movimientos; totales, líneas escapadas y pie', () => {
  assert.strictEqual(f('textoResumen_', [], CTX, { porRevisar: 3, noLeidos: 0 }), '');
  const movs = [
    { tipo: 'gasto', monto: 45.9, moneda: 'PEN', monto_pen: 45.9, categoria_id: UUID_SUPER, comercio: 'Tottus', estado: 'confirmado' },
    { tipo: 'ingreso', monto: 100, moneda: 'PEN', monto_pen: 100, categoria_id: 'cat-sueldo', comercio: 'Ana <Empresa>', estado: 'confirmado' },
    { tipo: 'gasto', monto: 12, moneda: 'PEN', monto_pen: 12, categoria_id: '', comercio: 'PLIN-X', estado: 'por_revisar' },
  ];
  assert.strictEqual(f('textoResumen_', movs, CTX, { porRevisar: 1, noLeidos: 1 }),
    '📊 <b>Hoy · S/ 57.90 en gastos</b>\n💰 S/ 100.00 en ingresos\n\n' +
    '• S/ 45.90 🛒 Supermercado — Tottus\n• S/ 100.00 💼 Sueldo — Ana &lt;Empresa&gt;\n• S/ 12.00 ⚠ por revisar — PLIN-X\n\n' +
    '1 por revisar · 1 correo no leído');
  const muchos = Array.from({ length: 16 }, () => movs[0]);
  const texto = f('textoResumen_', muchos, CTX, { porRevisar: 0, noLeidos: 2 });
  assert.strictEqual(texto.split('\n').filter(l => l.startsWith('• ')).length, 15);
  assert.match(texto, /\n…y 1 más\n\n2 correos no leídos$/);
});

test('textoMes_', () => {
  assert.strictEqual(f('textoMes_', '2026-10', { ingresos: 3500, gastos: 1200.5, ahorro: 2299.5, tasaAhorro: 66 }, [
    { nombre: 'Supermercado', emoji: '🛒', monto: 800, porcentaje: 67 }, { nombre: 'Ropa & más', emoji: '', monto: 400.5, porcentaje: 33 },
  ]), '📅 <b>Mes 2026-10</b>\n💰 Ingresos: S/ 3,500.00\n🛒 Gastos: S/ 1,200.50\n🐷 Ahorro: S/ 2,299.50 (66 %)\n\n' +
    '<b>Top categorías</b>\n• 🛒 Supermercado — S/ 800.00 (67 %)\n• Ropa &amp; más — S/ 400.50 (33 %)');
  assert.strictEqual(f('textoMes_', '2026-10', { ingresos: 0, gastos: 0, ahorro: 0, tasaAhorro: null }, []),
    '📅 <b>Mes 2026-10</b>\n💰 Ingresos: S/ 0.00\n🛒 Gastos: S/ 0.00\n🐷 Ahorro: S/ 0.00');
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --test tests/mensajes.test.js`
Expected: FAIL ("is not a function").

- [ ] **Step 3: Implementar**

`src/telegram/mensajes.js`:

```js
// Textos y teclados del bot. Funciones puras: reciben los datos ya leídos de la hoja.
// Los textos van en modo HTML de Telegram: todo dato de la hoja pasa por escaparHtml_.
// ctx = { cuentas, categorias, urlApp, hoy }

const ICONO_TIPO = { gasto: '🛒', ingreso: '💰', transferencia: '🔁' };
const SIMBOLO_MONEDA = { PEN: 'S/', USD: 'US$' };
const MAX_AVISOS_SUELTOS = 5;
const MAX_LINEAS_RESUMEN = 15;
const ALFABETO_ID = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const TEXTO_AYUDA = [
  '<b>Registrar un gasto</b>',
  'Escribe: descripción monto [cuenta] [categoría]',
  '• <code>taxi 12 yape</code>',
  '• <code>almuerzo 25.50 efectivo comida</code>',
  '• <code>+ sueldo 3500</code> (ingreso)',
  '',
  '<b>Comandos</b>',
  '/hoy — resumen del día',
  '/mes — resumen del mes',
  '/deshacer — borra lo último que registraste aquí',
  '/ayuda — este mensaje',
].join('\n');

function escaparHtml_(texto) {
  return String(texto == null ? '' : texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatoMonto_(monto, moneda) {
  const n = Math.abs(redondear2_(monto)).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (monto < 0 ? '−' : '') + (SIMBOLO_MONEDA[moneda] || moneda || 'S/') + ' ' + n;
}

// callback_data admite 64 bytes: un UUID (36) se guarda en 22 caracteres (12 bits por
// cada 2 caracteres); cualquier otro id va tal cual con "~" delante.
function compactarId_(id) {
  const texto = String(id);
  if (!PATRON_UUID.test(texto)) return '~' + texto;
  const hex = texto.replace(/-/g, '') + '0';
  let r = '';
  for (let i = 0; i < hex.length; i += 3) {
    const n = parseInt(hex.slice(i, i + 3), 16);
    r += ALFABETO_ID[n >> 6] + ALFABETO_ID[n & 63];
  }
  return r;
}

function expandirId_(compacto) {
  const texto = String(compacto == null ? '' : compacto);
  if (texto[0] === '~') return texto.slice(1);
  if (!/^[A-Za-z0-9_-]{22}$/.test(texto)) return '';
  let hex = '';
  for (let i = 0; i < texto.length; i += 2) {
    const n = ALFABETO_ID.indexOf(texto[i]) * 64 + ALFABETO_ID.indexOf(texto[i + 1]);
    hex += n.toString(16).padStart(3, '0');
  }
  hex = hex.slice(0, 32);
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function boton_(texto, datos) {
  return { text: texto, callback_data: datos };
}

function botonApp_(urlApp, texto) {
  return urlApp ? [{ text: texto || 'Abrir la app', url: urlApp }] : [];
}

function nombreCategoria_(categorias, id) {
  const c = categorias.filter(x => x.id === id)[0];
  return c ? (c.emoji ? c.emoji + ' ' : '') + c.nombre : 'Sin categoría';
}

function nombreCuenta_(cuentas, id) {
  const c = cuentas.filter(x => x.id === id)[0];
  return c ? c.nombre : 'sin cuenta';
}

function textoMovimiento_(mov, ctx) {
  const cuenta = mov.tipo === 'transferencia'
    ? nombreCuenta_(ctx.cuentas, mov.cuenta_id) + ' → ' + nombreCuenta_(ctx.cuentas, mov.cuenta_destino_id)
    : nombreCuenta_(ctx.cuentas, mov.cuenta_id);
  const cuando = mov.fecha === ctx.hoy ? 'hoy' : mov.fecha.slice(8, 10) + '/' + mov.fecha.slice(5, 7);
  return (ICONO_TIPO[mov.tipo] || '•') + ' <b>' + formatoMonto_(mov.monto, mov.moneda) + '</b> · ' + escaparHtml_(cuenta) +
    '\n' + escaparHtml_(mov.comercio || mov.descripcion || 'Sin descripción') + ' · ' + cuando;
}

function botonCategoria_(mov, categoriaId, ctx) {
  return boton_(nombreCategoria_(ctx.categorias, categoriaId), 'c:' + compactarId_(mov.id) + ':' + compactarId_(categoriaId));
}

function tecladoCategorias_(mov, idsFrecuentes, ctx) {
  const id = compactarId_(mov.id);
  const top = idsFrecuentes.slice(0, 3).map(cid => botonCategoria_(mov, cid, ctx));
  return [top, [boton_('Otra…', 'o:' + id)].concat(botonApp_(ctx.urlApp, 'Abrir en la app'))].filter(fila => fila.length);
}

function tecladoTodas_(mov, ctx) {
  const botones = ctx.categorias.filter(c => c.activa && c.tipo === mov.tipo).map(c => botonCategoria_(mov, c.id, ctx));
  const filas = [];
  for (let i = 0; i < botones.length; i += 2) filas.push(botones.slice(i, i + 2));
  filas.push([boton_('← Volver', 'v:' + compactarId_(mov.id))]);
  return filas;
}

// Lo que falta elegir en la app (cuenta o cuenta destino) no se resuelve en el chat.
function mensajePorRevisar_(mov, idsFrecuentes, ctx) {
  const texto = textoMovimiento_(mov, ctx);
  if (!mov.cuenta_id || mov.tipo === 'transferencia') {
    const app = botonApp_(ctx.urlApp, 'Abrir en la app');
    const falta = mov.cuenta_id ? 'Elige la cuenta destino en la app.' : 'Elige la cuenta en la app.';
    return { texto: texto + '\n<i>' + falta + '</i>', teclado: app.length ? [app] : null };
  }
  return { texto: texto, teclado: tecladoCategorias_(mov, idsFrecuentes, ctx) };
}

function mensajeAgrupado_(cantidad, urlApp) {
  const app = botonApp_(urlApp);
  return { texto: '📥 <b>' + cantidad + ' movimientos nuevos por revisar</b>', teclado: app.length ? [app] : null };
}

function textoCategorizado_(mov, categoriaId, ctx, extra) {
  return textoMovimiento_(mov, ctx) + '\n✓ ' + escaparHtml_(nombreCategoria_(ctx.categorias, categoriaId)) + (extra || '');
}

function tecladoRecordar_(mov) {
  const id = compactarId_(mov.id);
  return [[boton_('Sí, recordar', 'r:' + id), boton_('Solo esta vez', 's:' + id)]];
}

function textoRegistrado_(mov, ctx) {
  return '✓ <b>' + formatoMonto_(mov.monto, mov.moneda) + '</b> · ' + escaparHtml_(mov.comercio) + ' · ' +
    escaparHtml_(nombreCategoria_(ctx.categorias, mov.categoria_id)) + ' · ' + escaparHtml_(nombreCuenta_(ctx.cuentas, mov.cuenta_id));
}

function tecladoRegistrado_(mov) {
  const id = compactarId_(mov.id);
  return [[boton_('Deshacer', 'd:' + id), boton_('Cambiar categoría', 'k:' + id)]];
}

// movs = movimientos de un día; extras = { porRevisar, noLeidos } de toda la bandeja.
function textoResumen_(movs, ctx, extras) {
  if (!movs.length) return '';
  const suma = tipo => redondear2_(movs.filter(m => m.tipo === tipo).reduce((s, m) => s + m.monto_pen, 0));
  const ingresos = suma('ingreso');
  const partes = ['📊 <b>Hoy · ' + formatoMonto_(suma('gasto'), 'PEN') + ' en gastos</b>' +
    (ingresos ? '\n💰 ' + formatoMonto_(ingresos, 'PEN') + ' en ingresos' : '')];
  const lineas = movs.slice(0, MAX_LINEAS_RESUMEN).map(m => {
    const que = m.estado === 'por_revisar' ? '⚠ por revisar'
      : m.tipo === 'transferencia' ? '🔁 transferencia' : nombreCategoria_(ctx.categorias, m.categoria_id);
    return '• ' + formatoMonto_(m.monto, m.moneda) + ' ' + escaparHtml_(que) + ' — ' +
      escaparHtml_(m.comercio || m.descripcion || nombreCuenta_(ctx.cuentas, m.cuenta_id));
  });
  if (movs.length > MAX_LINEAS_RESUMEN) lineas.push('…y ' + (movs.length - MAX_LINEAS_RESUMEN) + ' más');
  partes.push(lineas.join('\n'));
  const pie = [];
  if (extras.porRevisar) pie.push(extras.porRevisar + ' por revisar');
  if (extras.noLeidos) pie.push(extras.noLeidos + (extras.noLeidos === 1 ? ' correo no leído' : ' correos no leídos'));
  if (pie.length) partes.push(pie.join(' · '));
  return partes.join('\n\n');
}

// resumen = resumenMes_(…); porCategoria = gastoPorCategoria_(…).
function textoMes_(mes, resumen, porCategoria) {
  const lineas = [
    '📅 <b>Mes ' + escaparHtml_(mes) + '</b>',
    '💰 Ingresos: ' + formatoMonto_(resumen.ingresos, 'PEN'),
    '🛒 Gastos: ' + formatoMonto_(resumen.gastos, 'PEN'),
    '🐷 Ahorro: ' + formatoMonto_(resumen.ahorro, 'PEN') + (resumen.tasaAhorro === null ? '' : ' (' + resumen.tasaAhorro + ' %)'),
  ];
  if (porCategoria.length) {
    lineas.push('', '<b>Top categorías</b>');
    porCategoria.slice(0, 5).forEach(c => lineas.push('• ' + escaparHtml_((c.emoji ? c.emoji + ' ' : '') + c.nombre) +
      ' — ' + formatoMonto_(c.monto, 'PEN') + ' (' + c.porcentaje + ' %)'));
  }
  return lineas.join('\n');
}
```

- [ ] **Step 4: Ver que pasan**

Run: `node --test tests/mensajes.test.js` → Expected: PASS (9 pruebas).
Run: `npm run lint` → Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/mensajes.js tests/mensajes.test.js
git commit -m "feat: textos y teclados del bot de Telegram

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Lector de gastos escritos (puro)

**Files:**
- Create: `src/telegram/escrito.js`, `tests/escrito.test.js`

**Interfaces:**
- Consumes: `normalizarTexto_`, `redondear2_`, `reglaPara_(comercio, reglas)` (ya existen).
- Produces: `leerEscrito_(texto, ctx) → { ok: true, tipo, monto, descripcion, cuenta_id, categoria_id, regla_id } | { ok: false, error }` con `ctx = { cuentas, categorias, reglas, cuentaBot }`; `montoEscrito_(token) → number | null`; constante `TEXTO_NO_ENTENDI` (HTML).

Reglas:
- `+` al inicio = ingreso.
- El monto es el primer número que no está en la primera posición (`2 cafés 8` → 8). Si no hay, sirve el primero (`12 taxi yape`).
- Lo que va antes del monto es la descripción.
- Las palabras de después se comparan con los nombres completos de cuentas y categorías activas (del tipo), más los alias `yape` (cuenta con flag Yape) y `efectivo` (primera cuenta de tipo efectivo).
- Si no hay nombre completo, vale una palabra de ≥ 4 letras que sea inicio único de una palabra del nombre (`comida` → "Comida fuera").
- Lo que no coincide se agrega a la descripción.
- Sin categoría indicada: regla por la descripción; si no hay, el inicio único de alguna palabra de la descripción con una categoría (`sueldo` → Sueldo).
- Sin cuenta indicada: `cuentaBot` si está activa; si no, la de Yape; si no, error.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/escrito.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./harness');

const e = crearEntorno();
const CUENTAS = [
  { id: 'cu-deb', nombre: 'Débito BCP', tipo: 'debito', moneda: 'PEN', activa: true, yape: true },
  { id: 'cu-visa', nombre: 'VISA BCP', tipo: 'credito', moneda: 'PEN', activa: true, yape: false },
  { id: 'cu-bill', nombre: 'Billetera', tipo: 'efectivo', moneda: 'PEN', activa: true, yape: false },
  { id: 'cu-vieja', nombre: 'Ahorro viejo', tipo: 'ahorro', moneda: 'PEN', activa: false, yape: false },
];
const CATEGORIAS = [
  { id: 'ca-super', nombre: 'Supermercado', tipo: 'gasto', activa: true },
  { id: 'ca-comida', nombre: 'Comida fuera', tipo: 'gasto', activa: true },
  { id: 'ca-comis', nombre: 'Comisiones bancarias', tipo: 'gasto', activa: true },
  { id: 'ca-trans', nombre: 'Transporte', tipo: 'gasto', activa: true },
  { id: 'ca-sueldo', nombre: 'Sueldo', tipo: 'ingreso', activa: true },
];
const REGLAS = [{ id: 're-taxi', patron: 'TAXI', categoria_id: 'ca-trans' }];
const leer = (texto, extra) => e.llamar('leerEscrito_', texto, Object.assign({ cuentas: CUENTAS, categorias: CATEGORIAS, reglas: REGLAS, cuentaBot: '' }, extra));

test('"taxi 12 yape": cuenta de Yape y categoría por regla', () => {
  assert.deepStrictEqual(leer('taxi 12 yape'), {
    ok: true, tipo: 'gasto', monto: 12, descripcion: 'taxi', cuenta_id: 'cu-deb', categoria_id: 'ca-trans', regla_id: 're-taxi',
  });
});

test('"almuerzo 25.50 efectivo comida": cuenta de efectivo y categoría por inicio de palabra', () => {
  assert.deepStrictEqual(leer('almuerzo 25.50 efectivo comida'), {
    ok: true, tipo: 'gasto', monto: 25.5, descripcion: 'almuerzo', cuenta_id: 'cu-bill', categoria_id: 'ca-comida', regla_id: '',
  });
});

test('montos: coma decimal, miles con coma y S/ pegado o separado', () => {
  [['pan 12,50', 12.5], ['pan S/12', 12], ['pan s/ 12.50', 12.5], ['pan S/. 7', 7], ['tv 1,250.00', 1250], ['tv 1,250', 1250], ['pan 3.5', 3.5]]
    .forEach(([texto, monto]) => assert.strictEqual(leer(texto).monto, monto, texto));
});

test('"+ sueldo 3500" es ingreso y toma la categoría por la descripción', () => {
  const r = leer('+ sueldo 3500');
  assert.deepStrictEqual([r.tipo, r.monto, r.descripcion, r.categoria_id, r.cuenta_id], ['ingreso', 3500, 'sueldo', 'ca-sueldo', 'cu-deb']);
});

test('cuenta por nombre completo o por inicio único; inactivas no cuentan', () => {
  assert.strictEqual(leer('cena 80 visa bcp').cuenta_id, 'cu-visa');
  assert.strictEqual(leer('cena 80 visa').cuenta_id, 'cu-visa');
  const r = leer('pan 5 ahorro viejo');
  assert.deepStrictEqual([r.cuenta_id, r.descripcion], ['cu-deb', 'pan ahorro viejo']);
});

test('cuenta por defecto: la de Ajustes si está activa, si no la de Yape; sin ninguna, error', () => {
  assert.strictEqual(leer('pan 5', { cuentaBot: 'cu-visa' }).cuenta_id, 'cu-visa');
  assert.strictEqual(leer('pan 5', { cuentaBot: 'cu-vieja' }).cuenta_id, 'cu-deb');
  const sinYape = CUENTAS.map(c => Object.assign({}, c, { yape: false }));
  const r = leer('pan 5', { cuentas: sinYape });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /Ajustes/);
});

test('el monto puede ir primero; el primer número de una cantidad no se toma como monto', () => {
  const a = leer('12 taxi yape');
  assert.deepStrictEqual([a.monto, a.descripcion, a.cuenta_id, a.categoria_id], [12, 'taxi', 'cu-deb', 'ca-trans']);
  const b = leer('2 cafés 8');
  assert.deepStrictEqual([b.monto, b.descripcion], [8, '2 cafés']);
});

test('palabras ambiguas o de otro tipo quedan en la descripción', () => {
  const a = leer('algo 5 comi');
  assert.deepStrictEqual([a.descripcion, a.categoria_id], ['algo comi', '']);
  const b = leer('+ venta 100 supermercado');
  assert.deepStrictEqual([b.tipo, b.descripcion, b.categoria_id], ['ingreso', 'venta supermercado', '']);
});

test('errores: sin monto, monto cero, sin descripción', () => {
  assert.match(leer('hola').error, /No entendí/);
  assert.match(leer('taxi 0').error, /mayor que cero/);
  assert.match(leer('12').error, /Falta la descripción/);
  assert.strictEqual(leer('').ok, false);
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --test tests/escrito.test.js`
Expected: FAIL ("is not a function").

- [ ] **Step 3: Implementar**

`src/telegram/escrito.js`:

```js
// Lee un gasto escrito en el chat: "[+]descripción monto [cuenta] [categoría]". Función pura.

const PATRON_MONTO_ESCRITO = /^(?:s\/\.?)?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)$/i;
const TEXTO_NO_ENTENDI = 'No entendí. Ejemplos: <code>taxi 12 yape</code>, <code>almuerzo 25.50 efectivo comida</code>, ' +
  '<code>+ sueldo 3500</code>. Escribe /ayuda para más.';

function montoEscrito_(token) {
  const m = PATRON_MONTO_ESCRITO.exec(String(token));
  if (!m) return null;
  // "1,250" o "1,250.00" son miles; "12,50" es decimal.
  return Number(/,\d{3}/.test(m[1]) ? m[1].replace(/,/g, '') : m[1].replace(',', '.'));
}

// El único candidato con una palabra que empieza con `palabra` (≥ 4 letras), o null.
function unicoPorPrefijo_(palabra, candidatos) {
  if (palabra.length < 4) return null;
  const vistos = {};
  candidatos.filter(c => c.nombre.split(' ').some(x => x.indexOf(palabra) === 0))
    .forEach(c => { vistos[c.clase + ':' + c.id] = c; });
  const claves = Object.keys(vistos);
  return claves.length === 1 ? vistos[claves[0]] : null;
}

// ctx = { cuentas, categorias, reglas, cuentaBot }
function leerEscrito_(texto, ctx) {
  let t = String(texto || '').trim();
  const tipo = t[0] === '+' ? 'ingreso' : 'gasto';
  if (tipo === 'ingreso') t = t.slice(1).trim();
  const tokens = t.split(/\s+/).filter(x => x && !/^s\/\.?$/i.test(x));
  let i = tokens.findIndex((x, k) => k > 0 && montoEscrito_(x) !== null);
  if (i < 0 && tokens.length && montoEscrito_(tokens[0]) !== null) i = 0;
  if (i < 0) return { ok: false, error: TEXTO_NO_ENTENDI };
  const monto = redondear2_(montoEscrito_(tokens[i]));
  if (!(monto > 0)) return { ok: false, error: 'El monto debe ser mayor que cero.' };

  const cuentas = ctx.cuentas.filter(c => c.activa);
  const categorias = ctx.categorias.filter(c => c.activa && c.tipo === tipo);
  const yape = cuentas.filter(c => c.yape)[0];
  const efectivo = cuentas.filter(c => c.tipo === 'efectivo')[0];
  const candidatos = cuentas.map(c => ({ clase: 'cuenta', id: c.id, nombre: normalizarTexto_(c.nombre) }));
  if (yape) candidatos.push({ clase: 'cuenta', id: yape.id, nombre: 'YAPE' });
  if (efectivo) candidatos.push({ clase: 'cuenta', id: efectivo.id, nombre: 'EFECTIVO' });
  categorias.forEach(c => candidatos.push({ clase: 'categoria', id: c.id, nombre: normalizarTexto_(c.nombre) }));

  // Primero nombres completos (el más largo gana), luego inicios de palabra únicos.
  const palabras = tokens.slice(i + 1).map(p => ({ texto: p, norm: normalizarTexto_(p), usada: false }));
  const elegido = {};
  candidatos.slice().sort((a, b) => b.nombre.length - a.nombre.length).forEach(c => {
    if (elegido[c.clase]) return;
    const partes = c.nombre.split(' ');
    for (let k = 0; k + partes.length <= palabras.length; k++) {
      const tramo = palabras.slice(k, k + partes.length);
      if (tramo.every((p, j) => !p.usada && p.norm === partes[j])) {
        tramo.forEach(p => { p.usada = true; });
        elegido[c.clase] = c.id;
        return;
      }
    }
  });
  palabras.forEach(p => {
    if (p.usada) return;
    const c = unicoPorPrefijo_(p.norm, candidatos.filter(x => !elegido[x.clase]));
    if (c) {
      elegido[c.clase] = c.id;
      p.usada = true;
    }
  });

  const descripcion = tokens.slice(0, i).concat(palabras.filter(p => !p.usada).map(p => p.texto)).join(' ');
  if (!descripcion) return { ok: false, error: 'Falta la descripción. ' + TEXTO_NO_ENTENDI };

  let cuentaId = elegido.cuenta || '';
  if (!cuentaId) {
    const porDefecto = cuentas.filter(c => c.id === ctx.cuentaBot)[0] || yape;
    if (!porDefecto) {
      return { ok: false, error: 'Indica la cuenta (por ejemplo "yape" o "efectivo") o elige una cuenta predeterminada en Ajustes → Telegram.' };
    }
    cuentaId = porDefecto.id;
  }

  let categoriaId = elegido.categoria || '';
  let reglaId = '';
  if (!categoriaId) {
    const regla = reglaPara_(descripcion, ctx.reglas);
    const deRegla = regla ? categorias.filter(c => c.id === regla.categoria_id)[0] : null;
    if (deRegla) {
      categoriaId = deRegla.id;
      reglaId = regla.id;
    } else {
      const deCategoria = candidatos.filter(c => c.clase === 'categoria');
      const palabra = normalizarTexto_(descripcion).split(' ').filter(w => unicoPorPrefijo_(w, deCategoria))[0];
      if (palabra) categoriaId = unicoPorPrefijo_(palabra, deCategoria).id;
    }
  }
  return { ok: true, tipo: tipo, monto: monto, descripcion: descripcion, cuenta_id: cuentaId, categoria_id: categoriaId, regla_id: reglaId };
}
```

- [ ] **Step 4: Ver que pasan**

Run: `node --test tests/escrito.test.js` → Expected: PASS (9 pruebas).
Run: `npm run lint` → Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/escrito.js tests/escrito.test.js
git commit -m "feat: lector de gastos escritos en el chat

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Puerta de entrada, comandos básicos y vinculación por código

**Files:**
- Create: `src/telegram/webhook.js`, `tests/telegram-webhook.test.js`

**Interfaces:**
- Consumes: `enviarMensaje_`, `responderBoton_` (Task 2); `escaparHtml_`, `TEXTO_AYUDA` (Task 3); `conBloqueo_`, `registrarLog_`.
- Produces: `recibirTelegram(secreto, cuerpo)` (pública: la llama el receptor), `secretoValido_(recibido, esperado)`, `atenderTelegram_(updateId, mensaje, boton)`, `manejarComando_(texto)` (switch; las Tasks 6 y 9 le agregan casos), `intentarVincular_(chatId, texto)`.
- Llama a (definidos después): `manejarEscrito_(texto, updateId)` (Task 6) y `manejarBoton_(boton)` (Task 7). Las pruebas de esta tarea no pasan por esas rutas.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/telegram-webhook.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoBot, SECRETO, CHAT } = require('./telegram');

const ayuda = { message_id: 1, chat: { id: CHAT }, text: '/ayuda' };

test('sin el secreto correcto, con JSON inválido o sin update_id no hace nada', () => {
  const e = entornoBot();
  e.llamar('recibirTelegram', 'otro-secreto-de-32-caracteres!!', JSON.stringify({ update_id: 1, message: ayuda }));
  e.llamar('recibirTelegram', '', JSON.stringify({ update_id: 2, message: ayuda }));
  e.llamar('recibirTelegram', SECRETO, '{no es json');
  e.llamar('recibirTelegram', SECRETO, JSON.stringify({ message: ayuda }));
  assert.strictEqual(e.telegram.llamadas.length, 0);
  assert.deepStrictEqual(Object.keys(e.cache), []);
});

test('sin secreto configurado se ignora todo, incluso un secreto vacío', () => {
  const e = entornoBot();
  delete e.propiedades.WEBHOOK_SECRET;
  e.llamar('recibirTelegram', '', JSON.stringify({ update_id: 1, message: ayuda }));
  e.llamar('recibirTelegram', undefined, JSON.stringify({ update_id: 2, message: ayuda }));
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

test('/ayuda responde una vez aunque Telegram reenvíe el mismo update', () => {
  const e = entornoBot();
  const u = { update_id: 50, message: ayuda };
  e.enviar(u);
  e.enviar(u);
  assert.strictEqual(e.enviados().length, 1);
  assert.match(e.ultimoEnviado().text, /Registrar un gasto/);
  assert.strictEqual(e.cache['tg:50'], '1');
});

test('/start y /ayuda@prueba_bot muestran la ayuda; un comando desconocido lo dice', () => {
  const e = entornoBot();
  e.escribir('/start');
  e.escribir('/ayuda@prueba_bot');
  e.escribir('/xyz');
  const textos = e.enviados().map(m => m.text);
  assert.match(textos[0], /Registrar un gasto/);
  assert.match(textos[1], /Registrar un gasto/);
  assert.strictEqual(textos[2], 'Comando desconocido. Escribe /ayuda.');
});

test('mensajes de otro chat se ignoran en silencio', () => {
  const e = entornoBot();
  e.escribir('/ayuda', 999);
  e.enviar({ update_id: 70, callback_query: { id: 'x', data: 'ok', message: { message_id: 1, chat: { id: 999 }, text: 'a' } } });
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

test('foto o audio: por ahora solo texto', () => {
  const e = entornoBot();
  e.enviar({ update_id: 60, message: { message_id: 1, chat: { id: CHAT }, photo: [{ file_id: 'f' }] } });
  assert.strictEqual(e.ultimoEnviado().text, 'Por ahora solo entiendo texto. El audio y las fotos llegan en una próxima versión.');
});

test('modo demo: avisa, responde el botón y no escribe nada', () => {
  const e = entornoBot();
  e.propiedades.MODO_DEMO = 'si';
  const antes = e.hojas.Movimientos.length;
  e.escribir('taxi 12');
  e.tocar('ok');
  assert.strictEqual(e.hojas.Movimientos.length, antes);
  assert.deepStrictEqual(e.enviados().map(m => m.text), [
    'La app está en modo demo; sal del modo demo para usar el bot.', 'La app está en modo demo; sal del modo demo para usar el bot.',
  ]);
  assert.strictEqual(e.llamadas('answerCallbackQuery').length, 1);
});

test('si la respuesta falla, queda en el Log y se intenta avisar en el chat', () => {
  const e = entornoBot();
  let n = 0;
  e.telegram.respuestas.sendMessage = () => (++n === 1 ? { ok: false, description: 'Too Many Requests' } : { ok: true, result: { message_id: 9 } });
  e.escribir('/ayuda');
  const log = e.filas('Log').filter(l => l.origen === 'telegram');
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].nivel, 'error');
  assert.match(log[0].mensaje, /Too Many Requests/);
  assert.strictEqual(e.ultimoEnviado().text, '⚠️ No pude completar eso: Telegram respondió: Too Many Requests');
});

test('sin chat vinculado solo acepta /start con el código vigente, y una sola vez', () => {
  const e = entornoBot();
  delete e.propiedades.TELEGRAM_CHAT_ID;
  Object.assign(e.propiedades, { TELEGRAM_CODIGO: 'AB12CD', TELEGRAM_CODIGO_VENCE: String(Date.parse('2026-10-13T10:15:00')) });
  e.escribir('/ayuda', 777);
  e.escribir('/start ZZZZZZ', 777);
  e.escribir('/start', 777);
  assert.strictEqual(e.telegram.llamadas.length, 0);
  e.escribir('/start ab12cd', 777);
  assert.strictEqual(e.propiedades.TELEGRAM_CHAT_ID, '777');
  assert.ok(!('TELEGRAM_CODIGO' in e.propiedades));
  assert.ok(!('TELEGRAM_CODIGO_VENCE' in e.propiedades));
  assert.strictEqual(e.ultimoEnviado().chat_id, '777');
  assert.match(e.ultimoEnviado().text, /^✓ Vinculado\./);
  e.escribir('/start AB12CD', 888);
  assert.strictEqual(e.enviados().length, 1);
  assert.strictEqual(e.propiedades.TELEGRAM_CHAT_ID, '777');
});

test('un código vencido no vincula', () => {
  const e = entornoBot();
  delete e.propiedades.TELEGRAM_CHAT_ID;
  Object.assign(e.propiedades, { TELEGRAM_CODIGO: 'AB12CD', TELEGRAM_CODIGO_VENCE: String(Date.parse('2026-10-13T10:15:00')) });
  e.fijarAhora('2026-10-13T10:16:00');
  e.escribir('/start AB12CD', 777);
  assert.ok(!('TELEGRAM_CHAT_ID' in e.propiedades));
  assert.strictEqual(e.telegram.llamadas.length, 0);
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --test tests/telegram-webhook.test.js`
Expected: FAIL ("contexto[nombre] is not a function" en `recibirTelegram`).

- [ ] **Step 3: Implementar**

`src/telegram/webhook.js`:

```js
// Puerta de entrada del bot. El receptor público llama a recibirTelegram con el secreto de
// la URL y el cuerpo del POST. Todo lo que no traiga el secreto, o no venga del chat
// vinculado, se ignora en silencio. Nada de aquí crea triggers (se ejecuta en el receptor).

const SEGUNDOS_RECORDAR_UPDATE = 21600; // 6 h: Telegram reintenta mientras no reciba 200

function recibirTelegram(secreto, cuerpo) {
  const props = PropertiesService.getScriptProperties();
  if (!secretoValido_(secreto, props.getProperty('WEBHOOK_SECRET'))) return;
  let update;
  try {
    update = JSON.parse(cuerpo);
  } catch {
    return;
  }
  if (!update || typeof update.update_id !== 'number') return;
  const cache = CacheService.getScriptCache();
  const clave = 'tg:' + update.update_id;
  if (cache.get(clave)) return;
  cache.put(clave, '1', SEGUNDOS_RECORDAR_UPDATE);
  const mensaje = update.message;
  const boton = update.callback_query;
  const chat = mensaje ? mensaje.chat : boton && boton.message ? boton.message.chat : null;
  if (!chat) return;
  const vinculado = props.getProperty('TELEGRAM_CHAT_ID');
  if (!vinculado) {
    if (mensaje) intentarVincular_(String(chat.id), String(mensaje.text || ''));
    return;
  }
  if (String(chat.id) !== vinculado) return;
  atenderTelegram_(update.update_id, mensaje, boton);
}

// Comparación de tiempo constante: no revela cuántos caracteres coinciden.
function secretoValido_(recibido, esperado) {
  const a = String(recibido || '');
  const b = String(esperado || '');
  if (!b || a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

function atenderTelegram_(updateId, mensaje, boton) {
  try {
    if (PropertiesService.getScriptProperties().getProperty('MODO_DEMO') === 'si') {
      if (boton) responderBoton_(boton.id);
      enviarMensaje_('La app está en modo demo; sal del modo demo para usar el bot.');
      return;
    }
    if (boton) {
      try {
        manejarBoton_(boton);
      } finally {
        // Quita el reloj del botón aunque la acción falle.
        try { responderBoton_(boton.id); } catch { /* el mensaje de error de abajo basta */ }
      }
      return;
    }
    const texto = String(mensaje.text || '').trim();
    if (!texto) {
      enviarMensaje_('Por ahora solo entiendo texto. El audio y las fotos llegan en una próxima versión.');
      return;
    }
    if (texto[0] === '/') manejarComando_(texto);
    else manejarEscrito_(texto, updateId);
  } catch (e) {
    try {
      conBloqueo_(() => registrarLog_('error', 'telegram', e.message, e.stack));
    } catch { /* sin hoja no hay dónde registrar */ }
    try {
      enviarMensaje_('⚠️ No pude completar eso: ' + escaparHtml_(e.message));
    } catch { /* Telegram caído: queda en el Log */ }
  }
}

function manejarComando_(texto) {
  const comando = texto.split(/\s+/)[0].toLowerCase().replace(/@\w+$/, '');
  switch (comando) {
    case '/start':
    case '/ayuda':
    case '/help':
      return enviarMensaje_(TEXTO_AYUDA);
    default:
      return enviarMensaje_('Comando desconocido. Escribe /ayuda.');
  }
}

// Solo antes de vincular: el primer "/start <código>" correcto y vigente fija el chat.
function intentarVincular_(chatId, texto) {
  const m = /^\/start\s+([A-Za-z0-9]+)$/.exec(texto.trim());
  if (!m) return;
  const props = PropertiesService.getScriptProperties();
  const codigo = props.getProperty('TELEGRAM_CODIGO');
  const vence = Number(props.getProperty('TELEGRAM_CODIGO_VENCE')) || 0;
  if (!codigo || m[1].toUpperCase() !== codigo || Date.now() > vence) return;
  props.setProperty('TELEGRAM_CHAT_ID', chatId);
  props.deleteProperty('TELEGRAM_CODIGO');
  props.deleteProperty('TELEGRAM_CODIGO_VENCE');
  try {
    enviarMensaje_('✓ Vinculado. Te escribiré cuando haya algo por revisar.\n\n' + TEXTO_AYUDA);
  } catch (e) {
    try {
      conBloqueo_(() => registrarLog_('aviso', 'telegram', e.message, e.stack));
    } catch { /* sin hoja */ }
  }
}
```

- [ ] **Step 4: Ver que pasan**

Run: `node --test tests/telegram-webhook.test.js` → Expected: PASS (10 pruebas).
Run: `npm test && npm run lint` → Expected: PASS, sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/webhook.js tests/telegram-webhook.test.js
git commit -m "feat: puerta de entrada del bot, comandos básicos y vinculación por código

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Gasto escrito de punta a punta y /deshacer

**Files:**
- Create: `src/telegram/registro.js`, `tests/telegram-registro.test.js`
- Modify: `src/telegram/webhook.js` (caso `/deshacer` en `manejarComando_`)

**Interfaces:**
- Consumes: `leerEscrito_` (Task 4); `mensajePorRevisar_`, `textoRegistrado_`, `tecladoRegistrado_`, `formatoMonto_`, `escaparHtml_` (Task 3); `enviarMensaje_` (Task 2); `categoriasFrecuentes_`, `contarUsosReglas_`, `borrarDivisiones_` (ya existen).
- Produces: `contextoBot_() → { cuentas, categorias, urlApp, hoy }`, `registrarEscrito_(texto, updateId) → { mov } | { error }`, `manejarEscrito_(texto, updateId)`, `deshacerUltimo_()`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/telegram-registro.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoBot, CHAT } = require('./telegram');

function entorno() {
  const e = entornoBot();
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1234', yape: true });
  e.interno('guardarRegla_', 'TAXI', e.categoria('Transporte'));
  e.movsBot = () => e.filas('Movimientos').filter(m => m.origen === 'telegram');
  return e;
}

test('"taxi 12 yape" guarda un gasto confirmado y responde con Deshacer y Cambiar categoría', () => {
  const e = entorno();
  const u = e.escribir('taxi 12 yape');
  const movs = e.movsBot();
  assert.strictEqual(movs.length, 1);
  const m = movs[0];
  assert.deepStrictEqual([m.fecha, m.tipo, m.monto, m.moneda, m.monto_pen, m.cuenta_id, m.categoria_id, m.comercio, m.estado, m.ref_externa],
    ['2026-10-13', 'gasto', 12, 'PEN', 12, e.cuenta('Débito BCP'), e.categoria('Transporte'), 'taxi', 'confirmado', 'tg:' + u]);
  assert.strictEqual(e.filas('Reglas')[0].usos, 1);
  const r = e.ultimoEnviado();
  assert.strictEqual(r.text, '✓ <b>S/ 12.00</b> · taxi · 🚕 Transporte · Débito BCP');
  assert.deepStrictEqual(e.botones(r)[0].map(b => b.text), ['Deshacer', 'Cambiar categoría']);
});

test('sin regla ni categoría queda por revisar y pregunta con las categorías', () => {
  const e = entorno();
  e.escribir('cena 30');
  const [m] = e.movsBot();
  assert.deepStrictEqual([m.estado, m.categoria_id], ['por_revisar', '']);
  const r = e.ultimoEnviado();
  assert.match(r.text, /<b>S\/ 30\.00<\/b> · Débito BCP\ncena · hoy/);
  assert.strictEqual(e.botones(r)[0].length, 3);
  assert.strictEqual(e.botones(r)[1][0].text, 'Otra…');
});

test('si no entiende o falta la cuenta, explica y no guarda nada', () => {
  const e = entorno();
  e.escribir('hola');
  assert.match(e.ultimoEnviado().text, /No entendí/);
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1234', yape: false });
  e.escribir('pan 5');
  assert.match(e.ultimoEnviado().text, /Ajustes → Telegram/);
  assert.strictEqual(e.movsBot().length, 0);
});

test('Telegram reenvía el mismo update: el gasto se guarda una sola vez', () => {
  const e = entorno();
  const u = { update_id: 5000, message: { message_id: 1, chat: { id: CHAT }, text: 'taxi 12' } };
  e.enviar(u);
  e.enviar(u);
  assert.strictEqual(e.movsBot().length, 1);
});

test('/deshacer borra el último gasto del bot de las últimas 24 h y nada más', () => {
  const e = entorno();
  e.escribir('taxi 12');
  e.fijarAhora('2026-10-13T10:05:00');
  e.escribir('pan 5');
  e.llamar('guardarMovimiento', { fecha: '2026-10-13', tipo: 'gasto', monto: 9, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Bodega'), comercio: 'manual' });
  e.escribir('/deshacer');
  assert.deepStrictEqual(e.movsBot().map(m => m.comercio), ['taxi']);
  assert.strictEqual(e.ultimoEnviado().text, '↩ Borré S/ 5.00 · pan');
  e.fijarAhora('2026-10-14T10:01:00');
  e.escribir('/deshacer');
  assert.strictEqual(e.ultimoEnviado().text, 'No hay movimientos registrados por el bot en las últimas 24 horas.');
  assert.strictEqual(e.movsBot().length, 1);
  assert.ok(e.filas('Movimientos').some(m => m.comercio === 'manual'));
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --test tests/telegram-registro.test.js`
Expected: FAIL (`manejarEscrito_` no existe: el bot responde "⚠️ No pude completar eso: manejarEscrito_ is not defined" y no hay movimientos).

- [ ] **Step 3: Implementar**

`src/telegram/registro.js`:

```js
// Gastos escritos en el chat: se guardan con origen "telegram" y se pueden deshacer.

function contextoBot_() {
  return {
    cuentas: leerTabla_('Cuentas'),
    categorias: leerTabla_('Categorias'),
    urlApp: PropertiesService.getScriptProperties().getProperty('APP_URL') || '',
    hoy: hoyIso_(),
  };
}

function registrarEscrito_(texto, updateId) {
  return conBloqueo_(() => {
    const config = leerConfig_();
    const cuentas = leerTabla_('Cuentas');
    const reglas = leerTabla_('Reglas');
    const leido = leerEscrito_(texto, { cuentas: cuentas, categorias: leerTabla_('Categorias'), reglas: reglas, cuentaBot: config.cuenta_bot || '' });
    if (!leido.ok) return { error: leido.error };
    const cuenta = cuentas.filter(c => c.id === leido.cuenta_id)[0];
    const tc = cuenta.moneda === 'PEN' ? 1 : Number(config.ultimo_tc) || 0;
    if (!tc) return { error: 'Configura el tipo de cambio en Ajustes para registrar en ' + cuenta.moneda + '.' };
    const mov = {
      id: nuevoId_(), fecha: hoyIso_(), tipo: leido.tipo, monto: leido.monto, moneda: cuenta.moneda, tc: tc,
      monto_pen: redondear2_(leido.monto * tc), cuenta_id: cuenta.id, cuenta_destino_id: '', categoria_id: leido.categoria_id,
      comercio: leido.descripcion, descripcion: '', origen: 'telegram', estado: leido.categoria_id ? 'confirmado' : 'por_revisar',
      ref_externa: 'tg:' + updateId, dividido: false, creado_en: formatearFecha_(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    };
    agregarFilas_('Movimientos', [mov]);
    if (leido.regla_id) contarUsosReglas_([{ regla_id: leido.regla_id }], reglas);
    return { mov: mov };
  });
}

function manejarEscrito_(texto, updateId) {
  const r = registrarEscrito_(texto, updateId);
  if (r.error) return enviarMensaje_(r.error);
  const ctx = contextoBot_();
  if (r.mov.estado === 'por_revisar') {
    const frecuentes = categoriasFrecuentes_(leerTabla_('Movimientos'), ctx.categorias)[r.mov.tipo] || [];
    const m = mensajePorRevisar_(r.mov, frecuentes, ctx);
    return enviarMensaje_(m.texto, m.teclado);
  }
  return enviarMensaje_(textoRegistrado_(r.mov, ctx), tecladoRegistrado_(r.mov));
}

// /deshacer: el movimiento del bot más reciente de las últimas 24 horas.
function deshacerUltimo_() {
  const borrado = conBloqueo_(() => {
    const limite = formatearFecha_(new Date(Date.now() - 86400000), 'yyyy-MM-dd HH:mm:ss');
    const mov = leerTabla_('Movimientos').filter(m => m.origen === 'telegram' && m.creado_en >= limite)
      .sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0];
    if (!mov) return null;
    eliminarFila_('Movimientos', mov.id);
    borrarDivisiones_(mov.id);
    return mov;
  });
  if (!borrado) return enviarMensaje_('No hay movimientos registrados por el bot en las últimas 24 horas.');
  return enviarMensaje_('↩ Borré ' + formatoMonto_(borrado.monto, borrado.moneda) + ' · ' + escaparHtml_(borrado.comercio));
}
```

En `src/telegram/webhook.js`, dentro del `switch` de `manejarComando_`, antes de `default:`:

```js
    case '/deshacer':
      return deshacerUltimo_();
```

- [ ] **Step 4: Ver que pasan**

Run: `node --test tests/telegram-registro.test.js` → Expected: PASS (5 pruebas).
Run: `npm test && npm run lint` → Expected: PASS, sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/registro.js src/telegram/webhook.js tests/telegram-registro.test.js
git commit -m "feat: registrar gastos escribiéndole al bot y /deshacer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Botones

**Files:**
- Create: `src/telegram/acciones.js`, `tests/telegram-botones.test.js`
- Modify: `src/web/api-revisar.js` (extraer `recordarComercio_`), `tests/telegram.js` (ayudantes `porRevisar` y `dato`)

**Interfaces:**
- Consumes: `contextoBot_` (Task 6); funciones de `mensajes.js` (Task 3); `editarMensaje_` (Task 2); `categorizarMovimiento({ id, categoria_id })`, `categoriasFrecuentes_`, `guardarRegla_`, `buscarActiva_`, `borrarDivisiones_`.
- Produces: `manejarBoton_(boton)`, `recordarComercio_(movs, mov, patronTexto, categoriaId) → { regla, confirmados }` (dentro del bloqueo; `confirmados` no cuenta a `mov`), `textoYaEstaba_(mov, ctx)`, `frecuentes_(mov, ctx)`, `elegirCategoria_`, `recordarDesdeBot_`, `deshacerDesdeBot_`.

- [ ] **Step 1: Ayudantes de prueba**

En `tests/telegram.js`, agregar arriba (después de `const TOKEN …`):

```js
const UUIDS = [
  '0b6f3c1e-8f7a-4c2d-9e5b-1a2b3c4d5e6f', '7d2e9a40-1c3b-4f5e-8a6d-2b3c4d5e6f70',
  'c4a1e2f3-5b6c-4d7e-8f90-a1b2c3d4e5f6', '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b',
];
```

y dentro de `entornoBot`, antes de `return e;`:

```js
  let usados = 0;
  // Movimiento importado por revisar (con id UUID real, para probar la compactación).
  e.porRevisar = extra => {
    const mov = Object.assign({
      id: UUIDS[usados++], fecha: '2026-10-13', tipo: 'gasto', monto: 45.9, moneda: 'PEN', tc: 1, monto_pen: 45.9,
      cuenta_id: e.cuenta('VISA BCP'), cuenta_destino_id: '', categoria_id: '', comercio: 'TOTTUS PRIMAVERA', descripcion: '',
      origen: 'gmail', estado: 'por_revisar', ref_externa: 'gmail:x' + usados, dividido: false, creado_en: '2026-10-13 09:00:00',
    }, extra);
    e.interno('agregarFilas_', 'Movimientos', [mov]);
    return mov;
  };
  e.dato = (accion, mov, categoriaId) => accion + ':' + e.interno('compactarId_', mov.id) +
    (categoriaId ? ':' + e.interno('compactarId_', categoriaId) : '');
  e.mov = id => e.filas('Movimientos').find(m => m.id === id);
```

- [ ] **Step 2: Escribir las pruebas que fallan**

`tests/telegram-botones.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoBot } = require('./telegram');

test('elegir categoría confirma, pregunta si recordar y "Sí, recordar" crea la regla y confirma los del mismo comercio', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  const otro = e.porRevisar({ monto: 20, monto_pen: 20 });
  const sup = e.categoria('Supermercado');
  e.tocar(e.dato('c', mov, sup));
  assert.deepStrictEqual([e.mov(mov.id).estado, e.mov(mov.id).categoria_id], ['confirmado', sup]);
  const ed = e.ultimoEditado();
  assert.strictEqual(ed.message_id, 77);
  assert.match(ed.text, /\n✓ 🛒 Supermercado\n¿Recordar para <b>TOTTUS PRIMAVERA<\/b>\?$/);
  assert.deepStrictEqual(e.botones(ed)[0].map(b => b.text), ['Sí, recordar', 'Solo esta vez']);
  assert.strictEqual(e.llamadas('answerCallbackQuery').length, 1);

  e.tocar(e.dato('r', mov));
  assert.deepStrictEqual(e.filas('Reglas').map(r => [r.patron, r.categoria_id]), [['TOTTUS PRIMAVERA', sup]]);
  assert.deepStrictEqual([e.mov(otro.id).estado, e.mov(otro.id).categoria_id], ['confirmado', sup]);
  const final = e.ultimoEditado();
  assert.match(final.text, /✓ 🛒 Supermercado · recordado para <b>TOTTUS PRIMAVERA<\/b> \(\+1 más\)$/);
  assert.ok(!('reply_markup' in final));
});

test('"Solo esta vez" no crea reglas', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  e.tocar(e.dato('c', mov, e.categoria('Supermercado')));
  e.tocar(e.dato('s', mov));
  assert.strictEqual(e.filas('Reglas').length, 0);
  assert.match(e.ultimoEditado().text, /\n✓ 🛒 Supermercado$/);
});

test('"Otra…" muestra todas las categorías del tipo, 2 por fila; "← Volver" regresa a las 3', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  e.tocar(e.dato('o', mov));
  const todas = e.botones(e.ultimoEditado());
  const gastos = e.llamar('obtenerCatalogos').categorias.filter(c => c.tipo === 'gasto' && c.activa).length;
  assert.strictEqual(todas.length, Math.ceil(gastos / 2) + 1);
  assert.deepStrictEqual(todas[todas.length - 1].map(b => b.text), ['← Volver']);
  todas.flat().forEach(b => assert.ok(Buffer.byteLength(b.callback_data) <= 64));
  e.tocar(e.dato('v', mov));
  const tres = e.botones(e.ultimoEditado());
  assert.strictEqual(tres[0].length, 3);
  assert.strictEqual(tres[1][0].text, 'Otra…');
});

test('botón viejo: ya categorizado en la app o borrado → lo dice y no cambia nada', () => {
  const e = entornoBot();
  const sup = e.categoria('Supermercado');
  const listo = e.porRevisar({ estado: 'confirmado', categoria_id: sup });
  e.tocar(e.dato('c', listo, e.categoria('Ropa')));
  assert.strictEqual(e.mov(listo.id).categoria_id, sup);
  assert.match(e.ultimoEditado().text, /\nYa estaba en 🛒 Supermercado$/);
  e.tocar('c:' + e.interno('compactarId_', '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b') + ':~x');
  assert.strictEqual(e.ultimoEditado().text, 'Ese movimiento ya no existe.');
  assert.strictEqual(e.llamadas('answerCallbackQuery').length, 2);
});

test('Deshacer y Cambiar categoría solo para lo registrado por el bot', () => {
  const e = entornoBot();
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '1234', yape: true });
  e.interno('guardarRegla_', 'TAXI', e.categoria('Transporte'));
  e.escribir('taxi 12');
  const escrito = e.filas('Movimientos').find(m => m.origen === 'telegram');
  e.tocar(e.dato('k', escrito));
  assert.ok(e.botones(e.ultimoEditado()).length > 3);
  e.tocar(e.dato('c', escrito, e.categoria('Comida fuera')));
  assert.deepStrictEqual([e.mov(escrito.id).categoria_id, e.mov(escrito.id).estado], [e.categoria('Comida fuera'), 'confirmado']);
  assert.deepStrictEqual(e.botones(e.ultimoEditado())[0].map(b => b.text), ['Deshacer', 'Cambiar categoría']);
  e.tocar(e.dato('d', escrito));
  assert.strictEqual(e.mov(escrito.id), undefined);
  assert.match(e.ultimoEditado().text, /^↩ Deshecho: S\/ 12\.00 · taxi$/);

  const importado = e.porRevisar();
  e.tocar(e.dato('d', importado));
  assert.ok(e.mov(importado.id));
  assert.match(e.ultimoEditado().text, /\nSolo se puede deshacer lo registrado por el bot\.$/);
});

test('"Todo bien" del resumen deja el texto escapado con ✓ Visto y sin botones', () => {
  const e = entornoBot();
  e.tocar('ok', 'Resumen <b> & más');
  const ed = e.ultimoEditado();
  assert.strictEqual(ed.text, 'Resumen &lt;b&gt; &amp; más\n✓ Visto');
  assert.ok(!('reply_markup' in ed));
});

test('una categoría de otro tipo da error en el chat, queda en el Log y no cambia el movimiento', () => {
  const e = entornoBot();
  const mov = e.porRevisar();
  e.tocar(e.dato('c', mov, e.categoria('Sueldo')));
  assert.strictEqual(e.mov(mov.id).estado, 'por_revisar');
  assert.strictEqual(e.ultimoEnviado().text, '⚠️ No pude completar eso: La categoría "Sueldo" no es de gasto.');
  assert.strictEqual(e.filas('Log').filter(l => l.origen === 'telegram' && l.nivel === 'error').length, 1);
  assert.strictEqual(e.llamadas('answerCallbackQuery').length, 1);
});
```

- [ ] **Step 3: Ver que fallan**

Run: `node --test tests/telegram-botones.test.js`
Expected: FAIL (`manejarBoton_ is not defined` en el Log / aserciones de edición fallan).

- [ ] **Step 4: Extraer `recordarComercio_`**

En `src/web/api-revisar.js`, dentro de `categorizarMovimiento`, reemplazar el bloque:

```js
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
```

por:

```js
    if (datos.recordar && mov.tipo !== 'transferencia' && mov.comercio) {
      const r = recordarComercio_(movs, mov, datos.patron, cambios.categoria_id);
      regla = r.regla;
      confirmados += r.confirmados;
    }
```

y agregar después de `categorizarMovimiento`:

```js
// Dentro del bloqueo: crea o actualiza la regla del comercio y confirma los demás
// "por revisar" que coinciden. `confirmados` no cuenta a `mov`. La usan la bandeja y el bot.
function recordarComercio_(movs, mov, patronTexto, categoriaId) {
  const patron = normalizarTexto_(patronTexto || mov.comercio);
  if (!patron) throw new Error('Escribe el texto del comercio a recordar.');
  const regla = guardarRegla_(patron, categoriaId);
  let confirmados = 0;
  movs.filter(m => m.id !== mov.id && m.estado === 'por_revisar' && m.tipo === mov.tipo && m.cuenta_id &&
    (m.moneda === 'PEN' || m.tc > 0) && normalizarTexto_(m.comercio).indexOf(patron) >= 0)
    .forEach(m => {
      actualizarFila_('Movimientos', m.id, { categoria_id: categoriaId, estado: 'confirmado' });
      confirmados++;
    });
  return { regla: regla, confirmados: confirmados };
}
```

Run: `node --test tests/revisar.test.js` → Expected: PASS (la bandeja se comporta igual).

- [ ] **Step 5: Implementar los botones**

`src/telegram/acciones.js`:

```js
// Botones de los mensajes del bot. callback_data = "acción:id[:id]" (ids compactados):
// c categorizar · o otras categorías · v volver · r recordar · s solo esta vez ·
// d deshacer · k cambiar categoría · ok resumen visto.

function manejarBoton_(boton) {
  const partes = String(boton.data || '').split(':');
  const accion = partes[0];
  const messageId = boton.message.message_id;
  if (accion === 'ok') return editarMensaje_(messageId, escaparHtml_(boton.message.text || '') + '\n✓ Visto', null);
  const ctx = contextoBot_();
  const mov = leerTabla_('Movimientos').filter(m => m.id === expandirId_(partes[1]))[0];
  if (!mov) return editarMensaje_(messageId, 'Ese movimiento ya no existe.', null);
  // Un importado ya resuelto (en la app o con otro botón) no se vuelve a tocar desde un mensaje viejo.
  if (mov.estado === 'confirmado' && mov.origen !== 'telegram' && accion !== 'r' && accion !== 's') {
    return editarMensaje_(messageId, textoYaEstaba_(mov, ctx), null);
  }
  if ((accion === 'r' || accion === 's') && (mov.estado !== 'confirmado' || !mov.categoria_id)) {
    return editarMensaje_(messageId, textoMovimiento_(mov, ctx), tecladoCategorias_(mov, frecuentes_(mov, ctx), ctx));
  }
  switch (accion) {
    case 'o':
    case 'k':
      return editarMensaje_(messageId, textoMovimiento_(mov, ctx), tecladoTodas_(mov, ctx));
    case 'v':
      return editarMensaje_(messageId, textoMovimiento_(mov, ctx),
        mov.estado === 'confirmado' ? tecladoRegistrado_(mov) : tecladoCategorias_(mov, frecuentes_(mov, ctx), ctx));
    case 'c':
      return elegirCategoria_(mov, expandirId_(partes[2]), messageId, ctx);
    case 'r':
      return recordarDesdeBot_(mov, messageId, ctx);
    case 's':
      return editarMensaje_(messageId, textoCategorizado_(mov, mov.categoria_id, ctx), null);
    case 'd':
      return deshacerDesdeBot_(mov, messageId, ctx);
    default:
      return null;
  }
}

function frecuentes_(mov, ctx) {
  return categoriasFrecuentes_(leerTabla_('Movimientos'), ctx.categorias)[mov.tipo] || [];
}

function textoYaEstaba_(mov, ctx) {
  return textoMovimiento_(mov, ctx) + (mov.tipo === 'transferencia'
    ? '\nYa estaba revisado.' : '\nYa estaba en ' + escaparHtml_(nombreCategoria_(ctx.categorias, mov.categoria_id)));
}

function elegirCategoria_(mov, categoriaId, messageId, ctx) {
  const estabaPorRevisar = mov.estado === 'por_revisar';
  if (estabaPorRevisar) {
    categorizarMovimiento({ id: mov.id, categoria_id: categoriaId });
  } else {
    // Cambiar la categoría de un gasto escrito que ya estaba confirmado.
    conBloqueo_(() => {
      const categoria = buscarActiva_(leerTabla_('Categorias'), categoriaId, 'La categoría');
      if (categoria.tipo !== mov.tipo) throw new Error('La categoría "' + categoria.nombre + '" no es de ' + mov.tipo + '.');
      actualizarFila_('Movimientos', mov.id, { categoria_id: categoria.id });
    });
  }
  const actualizado = Object.assign({}, mov, { categoria_id: categoriaId, estado: 'confirmado' });
  if (estabaPorRevisar && mov.comercio) {
    const pregunta = '\n¿Recordar para <b>' + escaparHtml_(normalizarTexto_(mov.comercio)) + '</b>?';
    return editarMensaje_(messageId, textoCategorizado_(actualizado, categoriaId, ctx, pregunta), tecladoRecordar_(actualizado));
  }
  return editarMensaje_(messageId, textoCategorizado_(actualizado, categoriaId, ctx),
    mov.origen === 'telegram' ? tecladoRegistrado_(actualizado) : null);
}

function recordarDesdeBot_(mov, messageId, ctx) {
  const r = conBloqueo_(() => recordarComercio_(leerTabla_('Movimientos'), mov, '', mov.categoria_id));
  const extra = ' · recordado para <b>' + escaparHtml_(r.regla.patron) + '</b>' + (r.confirmados ? ' (+' + r.confirmados + ' más)' : '');
  return editarMensaje_(messageId, textoCategorizado_(mov, mov.categoria_id, ctx, extra), null);
}

function deshacerDesdeBot_(mov, messageId, ctx) {
  if (mov.origen !== 'telegram') {
    return editarMensaje_(messageId, textoMovimiento_(mov, ctx) + '\nSolo se puede deshacer lo registrado por el bot.', null);
  }
  conBloqueo_(() => {
    eliminarFila_('Movimientos', mov.id);
    borrarDivisiones_(mov.id);
  });
  return editarMensaje_(messageId, '↩ Deshecho: ' + formatoMonto_(mov.monto, mov.moneda) + ' · ' + escaparHtml_(mov.comercio), null);
}
```

- [ ] **Step 6: Ver que pasan**

Run: `node --test tests/telegram-botones.test.js` → Expected: PASS (7 pruebas).
Run: `npm test && npm run lint` → Expected: PASS, sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/telegram/acciones.js src/web/api-revisar.js tests/telegram.js tests/telegram-botones.test.js
git commit -m "feat: botones del bot para categorizar, recordar, deshacer y cambiar categoría

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Avisos al leer correos y errores de triggers

**Files:**
- Create: `src/telegram/avisos.js`, `tests/telegram-avisos.test.js`
- Modify: `src/ingesta/revisar.js`

**Interfaces:**
- Consumes: `telegramVinculado_`, `enviarMensaje_` (Task 2); `mensajePorRevisar_`, `mensajeAgrupado_`, `MAX_AVISOS_SUELTOS`, `escaparHtml_` (Task 3); `contextoBot_` (Task 6); `categoriasFrecuentes_`.
- Produces: `avisarPorRevisar_(movimientos)` (nunca lanza), `registrarAvisoTelegram_(error)` (Log nivel aviso, nunca lanza), `avisarError_(tarea, error)` (máximo 1 por hora; nunca lanza). `guardarLeidos_` devuelve además `nuevosPorRevisar` (lista de movimientos).

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/telegram-avisos.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoBot } = require('./telegram');
const { ASUNTOS, html } = require('./correos');

const BCP = 'notificaciones@notificacionesbcp.com.pe';
const YAPE = 'notificaciones@yape.pe';
const correo = (id, archivo, asunto, recibido, de) => ({ id, de: de || BCP, asunto, html: html(archivo), recibido });

function entorno(correos, opciones) {
  const e = entornoBot(Object.assign({ correos }, opciones));
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '4444, 1111', yape: true });
  e.llamar('guardarCuenta', { id: e.cuenta('VISA BCP'), nombre: 'VISA BCP', tipo: 'credito', numeros: '2222' });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.limpiarTelegram();
  return e;
}

test('cada movimiento nuevo por revisar llega con sus categorías; nunca se envían números de cuenta', () => {
  const e = entorno([
    correo('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00'),
    correo('g3', 'yape-enviado.html', ASUNTOS.yape, '2026-10-08T19:51:00', YAPE),
  ]);
  const r = e.llamar('revisarCorreos');
  assert.strictEqual(r.porRevisar, 2);
  const enviados = e.enviados();
  assert.strictEqual(enviados.length, 2);
  assert.match(enviados[0].text, /<b>S\/ 89\.30<\/b> · Débito BCP\nTOTTUS PRUEBA SUR/);
  assert.strictEqual(e.botones(enviados[0])[1][0].text, 'Otra…');
  enviados.forEach(m => assert.ok(!/1111|4444|2222/.test(JSON.stringify(m))));
});

test('lo que una regla ya categorizó no genera mensaje', () => {
  const e = entorno([correo('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00')]);
  e.interno('guardarRegla_', 'TOTTUS', e.categoria('Supermercado'));
  e.llamar('revisarCorreos');
  assert.strictEqual(e.enviados().length, 0);
});

test('más de 5 por revisar de golpe: un solo mensaje agrupado', () => {
  const correos = Array.from({ length: 6 }, (_, i) => correo('g' + i, 'debito.html', ASUNTOS.debito, '2026-10-0' + (i + 2) + 'T10:00:00'));
  const e = entorno(correos);
  e.llamar('revisarCorreos');
  assert.deepStrictEqual(e.enviados().map(m => m.text), ['📥 <b>6 movimientos nuevos por revisar</b>']);
});

test('sin cuenta reconocida: el aviso pide abrir la app', () => {
  const e = entorno([correo('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00')]);
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', tipo: 'debito', numeros: '4444', yape: true });
  e.llamar('revisarCorreos');
  const [m] = e.enviados();
  assert.match(m.text, /Elige la cuenta en la app\./);
  assert.deepStrictEqual(e.botones(m), [[{ text: 'Abrir en la app', url: 'https://script.google.com/macros/s/APP-PRUEBA/exec' }]]);
});

test('sin bot vinculado no se llama a Telegram', () => {
  const e = entorno([correo('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00')]);
  delete e.propiedades.TELEGRAM_CHAT_ID;
  e.llamar('revisarCorreos');
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

test('Telegram caído: la lectura de correos termina igual y queda un aviso en el Log', () => {
  const e = entorno([
    correo('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00'),
    correo('g3', 'yape-enviado.html', ASUNTOS.yape, '2026-10-08T19:51:00', YAPE),
  ]);
  e.telegram.falla = 'Bad Gateway';
  const r = e.llamar('revisarCorreos');
  assert.strictEqual(r.creados, 2);
  assert.strictEqual(e.filas('Movimientos').length, 2);
  const log = e.filas('Log').filter(l => l.origen === 'telegram');
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].nivel, 'aviso');
});

test('si el trigger de lectura falla, avisa por el bot como máximo una vez por hora', () => {
  const e = entorno([], { gmailFalla: 'Gmail no responde' });
  assert.throws(() => e.llamar('revisarCorreos', { triggerUid: '1' }), /Gmail no responde/);
  assert.deepStrictEqual(e.enviados().map(m => m.text), ['⚠️ Falló la lectura de correos: Gmail no responde']);
  e.fijarAhora('2026-10-13T10:30:00');
  assert.throws(() => e.llamar('revisarCorreos', { triggerUid: '1' }));
  assert.strictEqual(e.enviados().length, 1);
  e.fijarAhora('2026-10-13T11:01:00');
  assert.throws(() => e.llamar('revisarCorreos', { triggerUid: '1' }));
  assert.strictEqual(e.enviados().length, 2);
  assert.throws(() => e.llamar('revisarCorreos'));
  assert.strictEqual(e.enviados().length, 2);
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --test tests/telegram-avisos.test.js`
Expected: FAIL (no se envía ningún mensaje).

- [ ] **Step 3: Implementar los avisos**

`src/telegram/avisos.js`:

```js
// Avisos que la app manda por el bot: movimientos nuevos por revisar y errores de los
// triggers. Nunca lanzan: si Telegram falla, queda en el Log y la tarea que llamó sigue.

const MS_ENTRE_AVISOS_ERROR = 3600000;

function avisarPorRevisar_(movimientos) {
  if (!movimientos.length || !telegramVinculado_()) return;
  try {
    const ctx = contextoBot_();
    if (movimientos.length > MAX_AVISOS_SUELTOS) {
      const m = mensajeAgrupado_(movimientos.length, ctx.urlApp);
      enviarMensaje_(m.texto, m.teclado);
      return;
    }
    const frecuentes = categoriasFrecuentes_(leerTabla_('Movimientos'), ctx.categorias);
    movimientos.forEach(mov => {
      const m = mensajePorRevisar_(mov, frecuentes[mov.tipo] || [], ctx);
      enviarMensaje_(m.texto, m.teclado);
    });
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}

function registrarAvisoTelegram_(error) {
  try {
    conBloqueo_(() => registrarLog_('aviso', 'telegram', error.message, error.stack));
  } catch { /* sin hoja no hay dónde registrar */ }
}

// `tarea` completa la frase "Falló …" (p. ej. "la lectura de correos").
function avisarError_(tarea, error) {
  if (!telegramVinculado_()) return;
  const props = PropertiesService.getScriptProperties();
  const ultimo = Number(props.getProperty('ULTIMO_AVISO_ERROR')) || 0;
  if (Date.now() - ultimo < MS_ENTRE_AVISOS_ERROR) return;
  props.setProperty('ULTIMO_AVISO_ERROR', String(Date.now()));
  try {
    enviarMensaje_('⚠️ Falló ' + tarea + ': ' + escaparHtml_(error.message));
  } catch (e) {
    registrarAvisoTelegram_(e);
  }
}
```

- [ ] **Step 4: Conectar con la lectura de correos**

En `src/ingesta/revisar.js`:

1. En `revisarCorreos`, en el `catch (e)`, justo antes de `throw e;`:

```js
    if (evento && typeof evento === 'object') avisarError_('la lectura de correos', e);
```

2. En `revisarCorreosSinBloqueo_`, después de la línea `if (avisos.length) conBloqueo_(...)`:

```js
  avisarPorRevisar_(r.nuevosPorRevisar);
```

3. En `guardarLeidos_`, en el objeto del `return`, agregar la propiedad:

```js
    nuevosPorRevisar: movimientos.filter(m => m.estado === 'por_revisar'),
```

- [ ] **Step 5: Ver que pasan**

Run: `node --test tests/telegram-avisos.test.js` → Expected: PASS (7 pruebas).
Run: `npm test && npm run lint` → Expected: PASS, sin errores (las pruebas de `revisar`/`ingesta` siguen iguales: sin bot vinculado no hay llamadas).

- [ ] **Step 6: Commit**

```bash
git add src/telegram/avisos.js src/ingesta/revisar.js tests/telegram-avisos.test.js
git commit -m "feat: avisar por Telegram lo nuevo por revisar y los errores del trigger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Resumen diario, /hoy y /mes

**Files:**
- Create: `src/telegram/resumen.js`, `tests/telegram-resumen.test.js`
- Modify: `src/telegram/webhook.js` (casos `/hoy` y `/mes`)

**Interfaces:**
- Consumes: `textoResumen_`, `textoMes_`, `boton_`, `botonApp_` (Task 3); `contextoBot_` (Task 6); `telegramVinculado_`, `enviarMensaje_` (Task 2); `avisarError_` (Task 8); `resumenMes_`, `gastoPorCategoria_`, `lineasCategoria_`, `mesDe_`.
- Produces: `HORA_RESUMEN_POR_DEFECTO = 21`, `horaResumen_(config?) → 0..23`, `resumenDelDia_(fecha) → string`, `resumenDelMes_(mes) → string`, `enviarResumenDiario()` (pública: la llama el trigger), `configurarResumen_(hora)`, `borrarTriggersResumen_()`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/telegram-resumen.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoBot } = require('./telegram');

function gasto(e, extra) {
  return e.llamar('guardarMovimiento', Object.assign({
    fecha: '2026-10-13', tipo: 'gasto', monto: 45.9, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Supermercado'), comercio: 'Tottus',
  }, extra));
}

test('el resumen diario llega con los movimientos de hoy y los botones', () => {
  const e = entornoBot();
  gasto(e);
  gasto(e, { fecha: '2026-10-12', monto: 99, comercio: 'Ayer' });
  e.llamar('enviarResumenDiario');
  const m = e.ultimoEnviado();
  assert.strictEqual(m.text, '📊 <b>Hoy · S/ 45.90 en gastos</b>\n\n• S/ 45.90 🛒 Supermercado — Tottus');
  assert.deepStrictEqual(e.botones(m), [[
    { text: 'Todo bien ✓', callback_data: 'ok' }, { text: 'Abrir la app', url: 'https://script.google.com/macros/s/APP-PRUEBA/exec' },
  ]]);
});

test('sin movimientos hoy, sin bot vinculado o en modo demo no se envía nada', () => {
  const e = entornoBot();
  gasto(e, { fecha: '2026-10-12' });
  e.llamar('enviarResumenDiario');
  gasto(e);
  delete e.propiedades.TELEGRAM_CHAT_ID;
  e.llamar('enviarResumenDiario');
  e.propiedades.TELEGRAM_CHAT_ID = '555';
  e.propiedades.MODO_DEMO = 'si';
  e.llamar('enviarResumenDiario');
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

test('si Telegram falla, el resumen no rompe el trigger y queda en el Log', () => {
  const e = entornoBot();
  gasto(e);
  e.telegram.falla = 'Bad Gateway';
  e.llamar('enviarResumenDiario');
  const log = e.filas('Log').filter(l => l.origen === 'enviarResumenDiario');
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].nivel, 'error');
});

test('/hoy y /mes', () => {
  const e = entornoBot();
  e.escribir('/hoy');
  assert.strictEqual(e.ultimoEnviado().text, 'Hoy no hay movimientos.');
  gasto(e);
  e.llamar('guardarMovimiento', { fecha: '2026-10-01', tipo: 'ingreso', monto: 3000, cuenta_id: e.cuenta('Débito BCP'), categoria_id: e.categoria('Sueldo') });
  e.escribir('/hoy');
  assert.match(e.ultimoEnviado().text, /^📊 <b>Hoy · S\/ 45\.90 en gastos<\/b>/);
  assert.ok(!('reply_markup' in e.ultimoEnviado()));
  e.escribir('/mes');
  assert.strictEqual(e.ultimoEnviado().text,
    '📅 <b>Mes 2026-10</b>\n💰 Ingresos: S/ 3,000.00\n🛒 Gastos: S/ 45.90\n🐷 Ahorro: S/ 2,954.10 (98 %)\n\n' +
    '<b>Top categorías</b>\n• 🛒 Supermercado — S/ 45.90 (100 %)');
});

test('configurarResumen_ deja un solo trigger diario a la hora pedida; horaResumen_ lee "21:00"', () => {
  const e = entornoBot();
  assert.strictEqual(e.interno('horaResumen_'), 21);
  e.interno('configurarResumen_', 20);
  e.interno('configurarResumen_', 22);
  const t = e.triggers.filter(x => x.funcion === 'enviarResumenDiario');
  assert.strictEqual(t.length, 1);
  assert.deepStrictEqual([t[0].hora, t[0].cada], [22, '1 d']);
  e.interno('borrarTriggersResumen_');
  assert.strictEqual(e.triggers.filter(x => x.funcion === 'enviarResumenDiario').length, 0);
  e.interno('guardarConfig_', { hora_resumen: 'basura' });
  assert.strictEqual(e.interno('horaResumen_'), 21);
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --test tests/telegram-resumen.test.js`
Expected: FAIL ("is not a function" / "Comando desconocido").

- [ ] **Step 3: Implementar**

`src/telegram/resumen.js`:

```js
// Resumen del día (trigger diario y /hoy) y del mes (/mes).

const HORA_RESUMEN_POR_DEFECTO = 21;

// Config.hora_resumen se guarda como "21:00".
function horaResumen_(config) {
  const h = parseInt(String((config || leerConfig_()).hora_resumen || ''), 10);
  return h >= 0 && h <= 23 ? h : HORA_RESUMEN_POR_DEFECTO;
}

function resumenDelDia_(fecha) {
  const ctx = contextoBot_();
  const movs = leerTabla_('Movimientos');
  const delDia = movs.filter(m => m.fecha === fecha).sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  return textoResumen_(delDia, ctx, {
    porRevisar: movs.filter(m => m.estado === 'por_revisar').length,
    noLeidos: leerTabla_('Pendientes').filter(p => p.estado === 'pendiente').length,
  });
}

function resumenDelMes_(mes) {
  const movs = leerTabla_('Movimientos');
  const porCategoria = gastoPorCategoria_(lineasCategoria_(movs, leerTabla_('Divisiones')), leerTabla_('Categorias'), mes);
  return textoMes_(mes, resumenMes_(movs, mes), porCategoria);
}

// La llama el trigger diario. No lanza: un fallo queda en el Log y se avisa (máx. 1 por hora).
function enviarResumenDiario() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MODO_DEMO') === 'si' || !telegramVinculado_()) return;
  try {
    const texto = resumenDelDia_(hoyIso_());
    if (!texto) return;
    enviarMensaje_(texto, [[boton_('Todo bien ✓', 'ok')].concat(botonApp_(props.getProperty('APP_URL') || ''))]);
  } catch (e) {
    try {
      conBloqueo_(() => registrarLog_('error', 'enviarResumenDiario', e.message, e.stack));
    } catch { /* sin hoja */ }
    avisarError_('el resumen diario', e);
  }
}

// Solo desde la app principal (Ajustes): los triggers quedan en el proyecto que los crea.
function configurarResumen_(hora) {
  borrarTriggersResumen_();
  ScriptApp.newTrigger('enviarResumenDiario').timeBased().atHour(hora).everyDays(1).create();
}

function borrarTriggersResumen_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'enviarResumenDiario')
    .forEach(t => ScriptApp.deleteTrigger(t));
}
```

En `src/telegram/webhook.js`, dentro del `switch` de `manejarComando_`, antes de `case '/deshacer':`:

```js
    case '/hoy':
      return enviarMensaje_(resumenDelDia_(hoyIso_()) || 'Hoy no hay movimientos.');
    case '/mes':
      return enviarMensaje_(resumenDelMes_(mesDe_(hoyIso_())));
```

- [ ] **Step 4: Ver que pasan**

Run: `node --test tests/telegram-resumen.test.js` → Expected: PASS (5 pruebas).
Run: `npm test && npm run lint` → Expected: PASS, sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/resumen.js src/telegram/webhook.js tests/telegram-resumen.test.js
git commit -m "feat: resumen diario del bot, /hoy y /mes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Conectar el bot desde Ajustes (API)

**Files:**
- Create: `src/telegram/vinculacion.js`, `tests/telegram-vinculacion.test.js`
- Modify: `src/appsscript.json`

**Interfaces:**
- Consumes: `llamarTelegram_`, `enviarMensaje_`, `telegramVinculado_` (Task 2); `registrarAvisoTelegram_` (Task 8); `horaResumen_`, `configurarResumen_`, `borrarTriggersResumen_` (Task 9); `abrirLibro_`, `buscarActiva_`, `guardarConfig_`, `leerConfig_`.
- Produces (públicas, para el navegador):
  - `configurarTelegram({ token, url_receptor })`, `estadoTelegram()`, `nuevoCodigoTelegram()`, `guardarTelegram({ hora_resumen, cuenta_bot })`, `desvincularTelegram()`: devuelven el estado `{ configurado, vinculado, bot, url_receptor, codigo, enlace, hora_resumen, cuenta_bot }`.
  - `probarTelegram()` → `{ ok: true }`.
- Produces (internas): `PROPIEDADES_TELEGRAM`, `MINUTOS_CODIGO = 15`, `textoAlAzar_(largo)`, `nuevoCodigo_(props)`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/telegram-vinculacion.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');
const { TOKEN } = require('./telegram');

const URL_RECEPTOR = 'https://script.google.com/macros/s/RECEPTOR-PRUEBA_1/exec';
const conectar = (e, extra) => e.llamar('configurarTelegram', Object.assign({ token: TOKEN, url_receptor: URL_RECEPTOR }, extra));
const metodos = e => e.telegram.llamadas.map(l => l.metodo);

test('valida el token y la URL antes de llamar a Telegram', () => {
  const e = entornoInstalado();
  assert.throws(() => conectar(e, { token: 'hola' }), /@BotFather/);
  assert.throws(() => conectar(e, { url_receptor: 'https://ejemplo.com/exec' }), /URL del receptor/);
  assert.throws(() => conectar(e, { url_receptor: 'https://script.google.com/macros/s/APP-PRUEBA/exec' }), /URL de la app/);
  assert.strictEqual(e.telegram.llamadas.length, 0);
});

test('un token rechazado por Telegram no guarda nada', () => {
  const e = entornoInstalado();
  e.telegram.falla = 'Unauthorized';
  assert.throws(() => conectar(e), /Telegram respondió: Unauthorized/);
  assert.ok(!('TELEGRAM_TOKEN' in e.propiedades));
});

test('conectar guarda los secretos, registra el webhook con el secreto, crea el trigger y da un código', () => {
  const e = entornoInstalado();
  const estado = conectar(e);
  const p = e.propiedades;
  assert.strictEqual(p.TELEGRAM_TOKEN, TOKEN);
  assert.strictEqual(p.WEBHOOK_SECRET.length, 32);
  assert.deepStrictEqual([p.RECEPTOR_URL, p.TELEGRAM_BOT, p.APP_URL, p.SHEET_ID],
    [URL_RECEPTOR, 'prueba_bot', 'https://script.google.com/macros/s/APP-PRUEBA/exec', 'libro-principal']);
  assert.ok(!('TELEGRAM_CHAT_ID' in p));
  assert.deepStrictEqual(metodos(e), ['getMe', 'setWebhook']);
  assert.deepStrictEqual(e.telegram.llamadas[1].datos, {
    url: URL_RECEPTOR + '?secret=' + p.WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true,
  });
  assert.match(estado.codigo, /^[0-9A-Z]{6}$/);
  assert.deepStrictEqual(estado, {
    configurado: true, vinculado: false, bot: 'prueba_bot', url_receptor: URL_RECEPTOR, codigo: estado.codigo,
    enlace: 'https://t.me/prueba_bot?start=' + estado.codigo, hora_resumen: 21, cuenta_bot: '',
  });
  const t = e.triggers.filter(x => x.funcion === 'enviarResumenDiario');
  assert.deepStrictEqual(t.map(x => x.hora), [21]);
});

test('flujo completo: el código enviado al bot vincula el chat; vence a los 15 minutos', () => {
  const e = entornoInstalado();
  const { codigo } = conectar(e);
  const secreto = e.propiedades.WEBHOOK_SECRET;
  e.llamar('recibirTelegram', secreto, JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: 4321 }, text: '/start ' + codigo } }));
  const estado = e.llamar('estadoTelegram');
  assert.deepStrictEqual([estado.vinculado, estado.codigo, estado.enlace], [true, '', '']);
  assert.strictEqual(e.propiedades.TELEGRAM_CHAT_ID, '4321');

  const otro = entornoInstalado();
  const r = conectar(otro);
  otro.fijarAhora('2026-10-13T10:16:00');
  assert.strictEqual(otro.llamar('estadoTelegram').codigo, '');
  otro.llamar('recibirTelegram', otro.propiedades.WEBHOOK_SECRET, JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: 1 }, text: '/start ' + r.codigo } }));
  assert.strictEqual(otro.llamar('estadoTelegram').vinculado, false);
  const nuevo = otro.llamar('nuevoCodigoTelegram');
  assert.notStrictEqual(nuevo.codigo, r.codigo);
  assert.match(nuevo.codigo, /^[0-9A-Z]{6}$/);
});

test('nuevoCodigoTelegram exige el bot conectado y sin vincular', () => {
  const e = entornoInstalado();
  assert.throws(() => e.llamar('nuevoCodigoTelegram'), /Primero conecta el bot/);
  conectar(e);
  e.propiedades.TELEGRAM_CHAT_ID = '1';
  assert.throws(() => e.llamar('nuevoCodigoTelegram'), /ya está vinculado/);
});

test('guardarTelegram valida y cambia la hora del resumen y la cuenta predeterminada', () => {
  const e = entornoInstalado();
  conectar(e);
  const estado = e.llamar('guardarTelegram', { hora_resumen: 20, cuenta_bot: e.cuenta('VISA BCP') });
  assert.deepStrictEqual([estado.hora_resumen, estado.cuenta_bot], [20, e.cuenta('VISA BCP')]);
  assert.strictEqual(e.interno('leerConfig_').hora_resumen, '20:00');
  assert.deepStrictEqual(e.triggers.filter(x => x.funcion === 'enviarResumenDiario').map(x => x.hora), [20]);
  assert.throws(() => e.llamar('guardarTelegram', { hora_resumen: 25, cuenta_bot: '' }), /de 0 a 23/);
  e.llamar('guardarCuenta', { id: e.cuenta('VISA BCP'), nombre: 'VISA BCP', tipo: 'credito', numeros: '0042', activa: false });
  assert.throws(() => e.llamar('guardarTelegram', { hora_resumen: 21, cuenta_bot: e.cuenta('VISA BCP') }), /desactivada/);
  assert.strictEqual(e.llamar('guardarTelegram', { hora_resumen: 21, cuenta_bot: '' }).cuenta_bot, '');
});

test('probarTelegram envía un mensaje solo con el bot vinculado', () => {
  const e = entornoInstalado();
  assert.throws(() => e.llamar('probarTelegram'), /aún no está vinculado/);
  conectar(e);
  e.propiedades.TELEGRAM_CHAT_ID = '4321';
  assert.deepStrictEqual(e.llamar('probarTelegram'), { ok: true });
  assert.strictEqual(e.telegram.llamadas.slice(-1)[0].datos.text, '✓ Mensaje de prueba de tu app de finanzas.');
});

test('desvincular borra el webhook, los secretos y el trigger; funciona aunque Telegram falle', () => {
  const e = entornoInstalado();
  conectar(e);
  e.propiedades.TELEGRAM_CHAT_ID = '4321';
  e.telegram.falla = 'Bad Gateway';
  const estado = e.llamar('desvincularTelegram');
  assert.strictEqual(metodos(e).slice(-1)[0], 'deleteWebhook');
  ['TELEGRAM_TOKEN', 'TELEGRAM_CHAT_ID', 'WEBHOOK_SECRET', 'RECEPTOR_URL', 'TELEGRAM_BOT', 'TELEGRAM_CODIGO', 'TELEGRAM_CODIGO_VENCE']
    .forEach(k => assert.ok(!(k in e.propiedades), k));
  assert.strictEqual(e.triggers.filter(x => x.funcion === 'enviarResumenDiario').length, 0);
  assert.deepStrictEqual([estado.configurado, estado.vinculado], [false, false]);
  assert.strictEqual(e.filas('Log').filter(l => l.origen === 'telegram').length, 1);
});

test('en modo demo no se puede conectar', () => {
  const e = entornoInstalado();
  e.propiedades.MODO_DEMO = 'si';
  assert.throws(() => conectar(e), /modo demo/);
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --test tests/telegram-vinculacion.test.js`
Expected: FAIL ("is not a function").

- [ ] **Step 3: Implementar**

`src/telegram/vinculacion.js`:

```js
// Conexión del bot desde Ajustes. Se ejecuta en la app principal (no en el receptor):
// aquí se crea el trigger del resumen y se guardan la URL de la app y el id de la hoja,
// que el receptor no puede obtener por sí mismo.

const PATRON_TOKEN = /^\d+:[\w-]{30,}$/;
const PATRON_URL_RECEPTOR = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
const MINUTOS_CODIGO = 15;
const PROPIEDADES_TELEGRAM = [
  'TELEGRAM_TOKEN', 'TELEGRAM_CHAT_ID', 'WEBHOOK_SECRET', 'RECEPTOR_URL', 'TELEGRAM_BOT',
  'TELEGRAM_CODIGO', 'TELEGRAM_CODIGO_VENCE', 'ULTIMO_AVISO_ERROR',
];

function textoAlAzar_(largo) {
  let t = '';
  while (t.length < largo) t += Utilities.getUuid().replace(/-/g, '');
  return t.slice(0, largo);
}

function nuevoCodigo_(props) {
  props.setProperty('TELEGRAM_CODIGO', textoAlAzar_(6).toUpperCase());
  props.setProperty('TELEGRAM_CODIGO_VENCE', String(Date.now() + MINUTOS_CODIGO * 60000));
}

function configurarTelegram(datos) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MODO_DEMO') === 'si') throw new Error('Sal del modo demo para conectar Telegram.');
  const token = String(datos.token || '').trim();
  const url = String(datos.url_receptor || '').trim();
  if (!PATRON_TOKEN.test(token)) throw new Error('El token no parece de @BotFather: debe verse como 123456789:ABC…');
  if (!PATRON_URL_RECEPTOR.test(url)) throw new Error('La URL del receptor debe verse como https://script.google.com/macros/s/…/exec');
  const urlApp = ScriptApp.getService().getUrl() || '';
  if (url === urlApp) throw new Error('Esa es la URL de la app, no la del receptor. Copia la que imprime npm run deploy:receptor.');
  const bot = llamarTelegram_('getMe', {}, token);
  const secreto = textoAlAzar_(32);
  llamarTelegram_('setWebhook', {
    url: url + '?secret=' + secreto, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true,
  }, token);
  const idHoja = abrirLibro_().getId();
  PROPIEDADES_TELEGRAM.forEach(k => props.deleteProperty(k));
  props.setProperty('TELEGRAM_TOKEN', token);
  props.setProperty('WEBHOOK_SECRET', secreto);
  props.setProperty('RECEPTOR_URL', url);
  props.setProperty('TELEGRAM_BOT', bot.username || '');
  props.setProperty('APP_URL', urlApp);
  if (!props.getProperty('SHEET_ID')) props.setProperty('SHEET_ID', idHoja);
  nuevoCodigo_(props);
  configurarResumen_(horaResumen_());
  return estadoTelegram();
}

function estadoTelegram() {
  const props = PropertiesService.getScriptProperties();
  const config = leerConfig_();
  const bot = props.getProperty('TELEGRAM_BOT') || '';
  const vinculado = !!props.getProperty('TELEGRAM_CHAT_ID');
  const vence = Number(props.getProperty('TELEGRAM_CODIGO_VENCE')) || 0;
  const codigo = !vinculado && vence > Date.now() ? props.getProperty('TELEGRAM_CODIGO') || '' : '';
  return {
    configurado: !!props.getProperty('TELEGRAM_TOKEN'), vinculado: vinculado, bot: bot,
    url_receptor: props.getProperty('RECEPTOR_URL') || '', codigo: codigo,
    enlace: codigo && bot ? 'https://t.me/' + bot + '?start=' + codigo : '',
    hora_resumen: horaResumen_(config), cuenta_bot: config.cuenta_bot || '',
  };
}

function nuevoCodigoTelegram() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TELEGRAM_TOKEN')) throw new Error('Primero conecta el bot.');
  if (props.getProperty('TELEGRAM_CHAT_ID')) throw new Error('El bot ya está vinculado.');
  nuevoCodigo_(props);
  return estadoTelegram();
}

function guardarTelegram(datos) {
  const hora = Number(datos.hora_resumen);
  if (!Number.isInteger(hora) || hora < 0 || hora > 23) throw new Error('La hora del resumen debe ir de 0 a 23.');
  const cuentaId = String(datos.cuenta_bot || '');
  conBloqueo_(() => {
    if (cuentaId) buscarActiva_(leerTabla_('Cuentas'), cuentaId, 'La cuenta');
    guardarConfig_({ hora_resumen: hora + ':00', cuenta_bot: cuentaId });
  });
  if (PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN')) configurarResumen_(hora);
  return estadoTelegram();
}

function probarTelegram() {
  if (!telegramVinculado_()) throw new Error('El bot aún no está vinculado.');
  enviarMensaje_('✓ Mensaje de prueba de tu app de finanzas.');
  return { ok: true };
}

function desvincularTelegram() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TELEGRAM_TOKEN')) {
    try {
      llamarTelegram_('deleteWebhook', { drop_pending_updates: true });
    } catch (e) {
      registrarAvisoTelegram_(e);
    }
  }
  PROPIEDADES_TELEGRAM.forEach(k => props.deleteProperty(k));
  borrarTriggersResumen_();
  return estadoTelegram();
}
```

En `src/appsscript.json`, agregar a `oauthScopes`:

```json
    "https://www.googleapis.com/auth/script.external_request"
```

(no quitar ninguno de los tres que ya están; cuidar las comas del JSON).

- [ ] **Step 4: Ver que pasan**

Run: `node --test tests/telegram-vinculacion.test.js` → Expected: PASS (9 pruebas).
Run: `npm test && npm run lint` → Expected: PASS, sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/vinculacion.js src/appsscript.json tests/telegram-vinculacion.test.js
git commit -m "feat: conectar, vincular y desconectar el bot desde Ajustes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Sección Telegram en Ajustes

**Files:**
- Create: `src/web/vista-telegram.html`
- Modify: `src/web/vista-ajustes.html`, `src/web/Index.html`, `src/web/estilos.html`, `src/web/vista-asistente.html`, `tests/ui/stub.js`

**Interfaces:**
- Consumes: `estadoTelegram`, `configurarTelegram`, `nuevoCodigoTelegram`, `guardarTelegram`, `probarTelegram`, `desvincularTelegram` (Task 10); en el cliente, `api`, `aviso`, `mostrar`, `campo`, `seleccion`, `esc`, `$`.
- Produces: `seccionTelegram(t, cuentas) → html` y `enlazarTelegram()` en el navegador.

- [ ] **Step 1: Respuestas simuladas**

En `tests/ui/stub.js`, dentro del objeto `DATOS`, después de `eliminarRegla: { ok: true },`:

```js
    // window.ESTADO_TELEGRAM permite ver los tres estados de la sección desde ver.js.
    estadoTelegram: () => window.ESTADO_TELEGRAM || { configurado: true, vinculado: true, bot: 'prueba_bot', url_receptor: 'https://script.google.com/macros/s/R/exec', codigo: '', enlace: '', hora_resumen: 21, cuenta_bot: '' },
    configurarTelegram: { configurado: true, vinculado: false, bot: 'prueba_bot', url_receptor: 'https://script.google.com/macros/s/R/exec', codigo: 'A1B2C3', enlace: 'https://t.me/prueba_bot?start=A1B2C3', hora_resumen: 21, cuenta_bot: '' },
    nuevoCodigoTelegram: { configurado: true, vinculado: false, bot: 'prueba_bot', codigo: 'D4E5F6', enlace: 'https://t.me/prueba_bot?start=D4E5F6', hora_resumen: 21, cuenta_bot: '' },
    guardarTelegram: { configurado: true, vinculado: true, bot: 'prueba_bot', codigo: '', enlace: '', hora_resumen: 20, cuenta_bot: '' },
    probarTelegram: { ok: true },
    desvincularTelegram: { configurado: false, vinculado: false, bot: '', codigo: '', enlace: '', hora_resumen: 21, cuenta_bot: '' },
```

- [ ] **Step 2: Ver que falla**

Run: `node tests/ui/ver.js "mostrar('ajustes')" vista`
Expected: el JSON de salida tiene `texto` sin "Telegram" y `llamadas` sin `estadoTelegram`.

- [ ] **Step 3: Vista**

`src/web/vista-telegram.html`:

```html
<script>
'use strict';
// Sección "Telegram" de Ajustes: conectar el bot, vincular el chat con un código y elegir
// la hora del resumen y la cuenta de los gastos escritos.

function seccionTelegram(t, cuentas) {
  let cuerpo;
  if (!t.configurado) {
    cuerpo = '<ol class="pasos-telegram">' +
      '<li>En Telegram, habla con <b>@BotFather</b>, envía <code>/newbot</code> y copia el token.</li>' +
      '<li>En tu computadora, ejecuta <code>npm run deploy:receptor</code> y copia la URL que imprime.</li>' +
      '<li>Abre el editor del receptor (también lo imprime) y ejecuta <code>autorizar</code> una vez.</li></ol>' +
      '<div class="dos-col">' +
        campo('Token del bot', '<input class="entrada" id="t-token" autocomplete="off" spellcheck="false">') +
        campo('URL del receptor', '<input class="entrada" id="t-url" placeholder="https://script.google.com/macros/s/…/exec" spellcheck="false">') +
      '</div><div class="acciones"><button type="button" class="boton primario" id="t-conectar">Conectar</button></div>';
  } else if (!t.vinculado) {
    cuerpo = t.codigo
      ? '<p style="margin:0 0 10px">Envía este mensaje a <b>@' + esc(t.bot) + '</b>:</p>' +
        '<div class="codigo-telegram">/start ' + esc(t.codigo) + '</div>' +
        '<div class="acciones"><a class="boton primario" href="' + esc(t.enlace) + '" target="_blank" rel="noopener">Abrir Telegram</a>' +
        '<button type="button" class="boton" id="t-refrescar">Ya lo envié</button>'
      : '<p class="tenue" style="margin:0 0 10px">El código venció. Genera otro para vincular tu chat.</p><div class="acciones">';
    cuerpo += '<button type="button" class="boton" id="t-codigo">Generar otro código</button>' +
      '<button type="button" class="boton" id="t-desconectar">Desconectar</button></div>';
  } else {
    const horas = ['18', '19', '20', '21', '22', '23'];
    if (horas.indexOf(String(t.hora_resumen)) < 0) horas.unshift(String(t.hora_resumen));
    const activas = cuentas.filter(c => c.activa);
    cuerpo = '<p style="margin:0 0 10px">✓ Conectado a <b>@' + esc(t.bot) + '</b></p><div class="dos-col">' +
      campo('Resumen diario a las', seleccion('t-hora', horas, String(t.hora_resumen), horas.map(h => h + ':00'))) +
      campo('Cuenta de lo que escribas', seleccion('t-cuenta', [''].concat(activas.map(c => c.id)), t.cuenta_bot,
        ['La de Yape'].concat(activas.map(c => c.nombre)))) +
      '</div><div class="acciones"><button type="button" class="boton primario" id="t-guardar">Guardar</button>' +
      '<button type="button" class="boton" id="t-probar">Enviar mensaje de prueba</button>' +
      '<button type="button" class="boton" id="t-desconectar">Desconectar</button></div>';
  }
  return '<section class="tarjeta seccion"><div class="etiqueta">Telegram</div>' + cuerpo + '</section>';
}

function enlazarTelegram() {
  const accion = (id, fn, mensaje) => {
    const b = $('#' + id);
    if (!b) return;
    b.onclick = async () => {
      b.disabled = true;
      try {
        await fn();
        if (mensaje) aviso(mensaje);
        mostrar('ajustes');
      } catch (err) {
        aviso(err.message, true);
        b.disabled = false;
      }
    };
  };
  accion('t-conectar', () => api('configurarTelegram', { token: $('#t-token').value, url_receptor: $('#t-url').value }),
    'Bot conectado: falta vincular tu chat');
  accion('t-refrescar', async () => {
    const t = await api('estadoTelegram');
    if (!t.vinculado) throw new Error('Aún no llega tu mensaje. Envía el código al bot y vuelve a tocar.');
  }, '✓ Telegram vinculado');
  accion('t-codigo', () => api('nuevoCodigoTelegram'));
  accion('t-guardar', () => api('guardarTelegram', { hora_resumen: Number($('#t-hora').value), cuenta_bot: $('#t-cuenta').value }),
    'Telegram guardado');
  accion('t-probar', () => api('probarTelegram'), 'Mensaje de prueba enviado');
  accion('t-desconectar', () => api('desvincularTelegram'), 'Telegram desconectado');
}
</script>
```

- [ ] **Step 4: Integrar en Ajustes, Index, estilos y asistente**

En `src/web/vista-ajustes.html`:
- Primera línea de la función: cambiar
  `const [cat, lectura, reglas] = await Promise.all([cargarCatalogos(), api('estadoLectura'), api('listarReglas')]);`
  por
  `const [cat, lectura, reglas, telegram] = await Promise.all([cargarCatalogos(), api('estadoLectura'), api('listarReglas'), api('estadoTelegram')]);`
- Cambiar `seccionLectura(lectura) + seccionReglas(reglas) +` por `seccionLectura(lectura) + seccionTelegram(telegram, cat.cuentas) + seccionReglas(reglas) +`.
- Después de `enlazarLectura();` agregar `enlazarTelegram();`.

En `src/web/Index.html`, después de `<?!= incluir_('web/vista-ajustes'); ?>`:

```html
  <?!= incluir_('web/vista-telegram'); ?>
```

En `src/web/estilos.html`, al final del bloque de estilos (antes del cierre `</style>`):

```css
.pasos-telegram { margin: 0 0 12px; padding-left: 20px; color: var(--texto-2); font-size: 13px; line-height: 1.6; }
.pasos-telegram code, .codigo-telegram { font-family: ui-monospace, Consolas, monospace; }
.codigo-telegram { background: var(--superficie-2, #1f1f29); border: 1px solid var(--borde); border-radius: 10px; padding: 12px 14px; font-size: 18px; letter-spacing: 1px; margin-bottom: 10px; user-select: all; }
```

(Antes de pegar, revisar en `estilos.html` cómo se llaman las variables de color —`--texto-2`, `--borde`, superficie— y usar los nombres que ya existen.)

En `src/web/vista-asistente.html`, cambiar `aviso('¡Listo! Tu app está configurada.');` por:

```js
        aviso('¡Listo! Tu app está configurada. Puedes conectar Telegram desde Ajustes.');
```

- [ ] **Step 5: Ver los tres estados**

Run:
```bash
node tests/ui/ver.js "mostrar('ajustes')" vista .tmp-tg-vinculado.png 390
node tests/ui/ver.js "window.ESTADO_TELEGRAM={configurado:false,vinculado:false,bot:'',codigo:'',enlace:'',hora_resumen:21,cuenta_bot:''};mostrar('ajustes')" vista .tmp-tg-nuevo.png 390
node tests/ui/ver.js "window.ESTADO_TELEGRAM={configurado:true,vinculado:false,bot:'prueba_bot',codigo:'A1B2C3',enlace:'https://t.me/prueba_bot?start=A1B2C3',hora_resumen:21,cuenta_bot:''};mostrar('ajustes')" vista .tmp-tg-codigo.png 390
```
Expected: en cada salida `error: null`, `llamadas` incluye `estadoTelegram`, y el texto contiene respectivamente "Conectado a @prueba_bot" + "Enviar mensaje de prueba"; "BotFather" + "Conectar"; "/start A1B2C3" + "Ya lo envié". Abrir las capturas `.tmp-tg-*.png` (con Read) y comprobar que a 390 px no hay desborde horizontal y que la sección sigue el estilo de las demás. Repetir el primero a 1280 de ancho.

Run: `npm run lint && npm test` → Expected: sin errores, PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/vista-telegram.html src/web/vista-ajustes.html src/web/Index.html src/web/estilos.html src/web/vista-asistente.html tests/ui/stub.js
git commit -m "feat: sección Telegram en Ajustes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Documentación, v0.3.0, despliegue y prueba real

**Files:**
- Modify: `docs/instalacion.md`, `docs/privacidad.md`, `docs/arquitectura.md`, `README.md`, `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Instalación**

En `docs/instalacion.md`, antes de `## Vía plantilla ("Hacer una copia") — llega en v0.5`, agregar:

```markdown
### Bot de Telegram (opcional, desde v0.3)

1. En Telegram, abre **@BotFather**, envía `/newbot`, elige un nombre y un usuario terminado en `bot`, y copia el **token**.
2. En la carpeta del proyecto: `npm run deploy:receptor`. Crea un segundo proyecto de Apps Script, el *receptor*, que solo recibe los mensajes de Telegram y se los pasa a la app. Imprime dos URLs: la del **editor** del receptor y la **URL del receptor**.
3. Abre la URL del editor, elige la función `autorizar`, toca **Ejecutar** y acepta los permisos. Sin este paso Google responde "Acceso denegado" a Telegram.
4. Actualiza la app (`npm run deploy`) y ábrela: Google pedirá un permiso nuevo ("conectarse a un servicio externo"), que la app usa para escribirle a Telegram.
5. En la app, **Ajustes → Telegram**: pega el token y la URL del receptor y toca **Conectar**.
6. Envía al bot el código que aparece (`/start XXXXXX`, o toca **Abrir Telegram**) y luego **Ya lo envié**. Desde ese momento el bot solo atiende a tu chat.

El receptor usa siempre el último código de la app: después de un `npm run deploy` no hay que volver a desplegarlo.
```

- [ ] **Step 2: Privacidad**

En `docs/privacidad.md`, antes de `## Próximas versiones`, agregar:

```markdown
## Bot de Telegram (v0.3)

- Los mensajes del bot (montos, comercios, categorías y nombres de cuenta) pasan por los servidores de Telegram. Nunca se envían números de cuenta ni de tarjeta.
- El único punto público es el receptor: solo acepta peticiones con el secreto que la app generó al conectar el bot, y la app ignora cualquier chat distinto del tuyo. La app web sigue siendo "solo yo".
- El token del bot, el secreto y tu chat se guardan solo en las propiedades del script de tu app, nunca en la hoja ni en el repositorio.
- **Desconectar** en Ajustes borra el webhook, el token y el chat.
```

- [ ] **Step 3: Arquitectura**

En `docs/arquitectura.md`, antes de `## Reglas del código`, agregar:

````markdown
## Bot de Telegram (receptor + biblioteca)

Telegram entrega los mensajes por POST a una URL pública sin sesión de Google, y la app es "solo yo". Por eso hay un segundo proyecto mínimo, el receptor:

```
Telegram ──POST /exec?secret=…──► Receptor (web app anónima, ejecuta como el dueño)
                                     │ Finanzas.recibirTelegram(secreto, cuerpo)
                                     ▼
                                  App como biblioteca (developmentMode)
                                     │ mismas propiedades del script, mismo bloqueo, misma hoja (SHEET_ID)
                                     ▼
                                  Google Sheet · API de Telegram
```

- `src/telegram/webhook.js` valida el secreto, descarta updates repetidos (CacheService, 6 h) e ignora otros chats.
- Lo que arma textos y teclados (`mensajes.js`) y el lector de gastos escritos (`escrito.js`) son funciones puras.
- Nada que se ejecute desde el receptor crea triggers: el del resumen diario se crea al conectar o guardar en Ajustes.
````

- [ ] **Step 4: README, CHANGELOG y versión**

En `README.md`:
- Cambiar `## Qué hace hoy (v0.2)` por `## Qué hace hoy (v0.3)`.
- Después de la línea de "Bandeja "Por revisar"", agregar:

```markdown
- **Bot de Telegram:** te pregunta solo por las compras que no reconoce (un toque para elegir la categoría y recordarla), registra lo que escribes (`taxi 12 yape`), responde `/hoy`, `/mes` y `/deshacer`, y te manda un resumen a las 21:00 los días con movimientos.
```

- En `## Decisiones técnicas`, agregar al final de la lista:

```markdown
- **Bot sin abrir la app:** un receptor público mínimo recibe el webhook de Telegram y usa la app como biblioteca; la app y los datos siguen siendo "solo yo" ([docs/arquitectura.md](docs/arquitectura.md)).
```

- Si la sección `## Hoja de ruta` marca la fase 3 como pendiente, marcarla como hecha con el mismo formato que la fase 2.

En `CHANGELOG.md`, antes de `## [0.2.0] — 2026-10-13`:

```markdown
## [0.3.0] — 2026-10-13

### Agregado
- Bot de Telegram (modo B): avisa las compras nuevas por revisar con las 3 categorías más probables, "Otra…" y "¿Recordar?"; agrupa los avisos cuando llegan más de 5.
- Gastos escritos en el chat (`taxi 12 yape`, `almuerzo 25.50 efectivo comida`, `+ sueldo 3500`) con [Deshacer] y [Cambiar categoría].
- Comandos `/hoy`, `/mes`, `/deshacer` y `/ayuda`.
- Resumen diario a la hora elegida (por defecto 21:00), solo los días con movimientos.
- Aviso por el bot si falla la lectura automática de correos (máximo uno por hora).
- Sección Telegram en Ajustes: conectar con el token, vincular el chat con un código, hora del resumen, cuenta predeterminada, mensaje de prueba y desconectar.
- Receptor del webhook (`npm run deploy:receptor`).

### Cambiado
- La app pide un permiso nuevo para conectarse a Telegram (`script.external_request`).
```

En `package.json`, cambiar `"version": "0.2.0"` por `"version": "0.3.0"`.

- [ ] **Step 5: Verificar y commit**

Run: `npm test && npm run lint` → Expected: PASS, sin errores.

```bash
git add docs/instalacion.md docs/privacidad.md docs/arquitectura.md README.md CHANGELOG.md package.json
git commit -m "docs: bot de Telegram y versión 0.3.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Desplegar**

Run: `npm run deploy` → Expected: "Despliegue actualizado" con la misma URL de siempre.

- [ ] **Step 7: Prueba real con Bruno**

Pedirle a Bruno, en orden, y verificar cada punto:
1. Abrir la app y aceptar el permiso nuevo.
2. Crear el bot con @BotFather (lo hace él; el token no se pega en el chat con Claude, va directo en Ajustes).
3. Ajustes → Telegram → pegar token y URL del receptor (de la Task 1) → **Conectar**. Expected: aparece el código.
4. Enviar el código al bot → **Ya lo envié**. Expected: "✓ Vinculado" en Telegram y "Conectado a @…" en Ajustes. Comprobar que el botón "Abrir la app" de los mensajes abre la app (valida `APP_URL`; si abre otra URL, registrar como hallazgo).
5. **Enviar mensaje de prueba**. Expected: llega al chat.
6. En el chat: `/ayuda`, `/hoy`, `/mes`. Expected: respuestas con formato.
7. En el chat: `prueba 1 efectivo` (o con una cuenta suya) → aparece en Movimientos con origen telegram → tocar **Deshacer** → desaparece.
8. Esperar (o provocar con "Revisar ahora") un correo de un comercio sin regla → llega el aviso con categorías → elegir una → "Sí, recordar" → en la app queda confirmado y la regla aparece en Ajustes.

Si algo falla, usar superpowers:systematic-debugging; el registro de ejecuciones del receptor y la hoja Log son la primera fuente.
