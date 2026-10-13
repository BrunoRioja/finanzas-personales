# Fase 3 · Bot de Telegram — Diseño

- **Fecha:** 2026-10-13
- **Autor:** Bruno Rioja (con Claude)
- **Estado:** Aprobado en brainstorming, pendiente de revisión escrita
- **Spec general:** [2026-10-13-app-finanzas-design.md](2026-10-13-app-finanzas-design.md) (§3, §7, §11, §14 fase 3)
- **Versión objetivo:** v0.3.0

---

## 1. Objetivo y criterios de éxito

Resolver desde el chat, con uno o dos toques, lo que la lectura de correos no sabe categorizar, recibir un resumen del día y registrar gastos escribiendo una línea corta (sobre todo efectivo).

Éxito:
- Una compra con comercio desconocido llega al chat en el mismo minuto en que la app lee el correo, con las 3 categorías más probables como botones.
- Elegir categoría y "Sí, recordar" deja el movimiento confirmado y la regla creada, igual que en la bandeja de la app.
- `taxi 12 yape` registra un gasto de S/ 12.00 en la cuenta de Yape con la categoría que diga la regla (o pregunta si no hay).
- A las 21:00 llega el resumen del día, solo si hubo movimientos.
- La app web sigue siendo "solo yo": lo único público es un receptor que solo acepta mensajes de Telegram con el secreto correcto y del chat vinculado.
- Una caída de Telegram nunca rompe ni retrasa la lectura de correos.

Fuera de alcance: texto libre en lenguaje natural, audio y foto de boleta (fase 4, Gemini); dividir desde el chat (fase 4; en la fase 3 se divide en la app); alertas de presupuesto (fase 5).

---

## 2. Arquitectura: app principal + receptor

Telegram entrega los mensajes llamando por POST a una URL pública sin sesión de Google. La app principal está publicada con acceso `MYSELF`, así que no puede recibirlos. Se agrega un segundo proyecto de Apps Script mínimo, el **receptor**:

```
Telegram ──POST /exec?secret=…──► Receptor (web app ANYONE_ANONYMOUS, ejecuta como el dueño)
                                     │ doPost(e) → Finanzas.recibirTelegram(e.parameter.secret, e.postData.contents)
                                     ▼
                                  App principal usada como biblioteca (developmentMode: true)
                                     │ mismas Script Properties, mismo LockService, misma hoja (SHEET_ID)
                                     ▼
                                  Google Sheet  ·  API de Telegram (UrlFetchApp)
```

Hechos verificados con un proyecto de prueba (2026-10-13):
- Una biblioteca llamada desde el receptor lee y escribe las **Script Properties de la biblioteca** (la app principal): secretos y `SHEET_ID` se guardan una sola vez.
- El **bloqueo de script es compartido**: si la app tiene el lock, el receptor espera. Correos y bot no se pisan.
- Con `developmentMode: true` el receptor usa siempre el último código subido de la app: `npm run deploy` basta, el receptor no se vuelve a desplegar.
- El POST anónimo responde **302** (como todo web app de Apps Script) y tarda 2–6 s; `doPost` sí se ejecuta. Telegram puede reintentar: se deduplica por `update_id`.
- Un web app anónimo responde "Acceso denegado" hasta que el dueño ejecuta el proyecto una vez en el editor (autorización inicial). Va en la guía de instalación.
- `ScriptApp` dentro de la biblioteca opera sobre el proyecto que llama: **solo la app principal crea triggers**; nada que se ejecute desde el receptor crea ni borra triggers.
- `getActiveSpreadsheet()` desde el receptor no devuelve la hoja de la app (el proyecto principal está vinculado a la hoja): la vinculación del bot guarda `SHEET_ID` con el id del libro actual si falta.

Por verificar en la primera tarea del plan: que un proyecto **vinculado a una hoja** (el de Bruno) se pueda usar como biblioteca igual que el de prueba (que era independiente).

### Receptor (`receptor/` en el repo)
- `receptor/Receptor.js`: `doPost(e)` llama a `Finanzas.recibirTelegram(...)` dentro de `try/catch` y siempre devuelve `ContentService.createTextOutput('ok')`. Sin `doGet`.
- `receptor/appsscript.json`: biblioteca `Finanzas` (scriptId de la app, `developmentMode: true`), `oauthScopes` = spreadsheets + script.external_request, web app `ANYONE_ANONYMOUS` + `USER_DEPLOYING`.
- El scriptId de la app no se versiona: `scripts/desplegar-receptor.js` genera el manifiesto a partir de `.clasp.json` de la raíz, crea el proyecto receptor si no existe (`receptor/.clasp.json`, ignorado por git), sube y mantiene un único despliegue (`receptor/.despliegue`, ignorado). Comando: `npm run deploy:receptor`; imprime la URL del receptor.

### App principal (`src/telegram/`)
| Archivo | Responsabilidad |
|---|---|
| `cliente.js` | `llamarTelegram_(metodo, datos)` vía `UrlFetchApp` (`muteHttpExceptions`, valida `ok`), `enviarMensaje_`, `editarMensaje_`, `responderBoton_`, `registrarWebhook_`. Único archivo que toca la API de Telegram. |
| `mensajes.js` | Funciones puras: texto (HTML de Telegram, escapado) y teclados de cada mensaje. |
| `escrito.js` | Función pura `leerEscrito_(texto, cuentas, categorias)` → movimiento o error con ejemplo. |
| `webhook.js` | `recibirTelegram(secreto, cuerpo)`: valida secreto, chat, duplicado y modo demo; enruta a comando, texto o botón. |
| `acciones.js` | Manejo de botones (`callback_query`). |
| `resumen.js` | `enviarResumenDiario` (trigger), `/hoy`, `/mes`, aviso de errores de trigger. |
| `vinculacion.js` | API para Ajustes: `configurarTelegram`, `estadoTelegram`, `desvincularTelegram`; vinculación por código. |
| `avisos.js` | `avisarPorRevisar_(movimientos)` llamado por la lectura de correos. |

`appsscript.json` agrega el scope `https://www.googleapis.com/auth/script.external_request` (re-autorización única).

---

## 3. Vinculación (Ajustes → Telegram)

1. El usuario crea el bot con @BotFather, despliega el receptor y pega en Ajustes **el token** y **la URL del receptor**.
2. `configurarTelegram({token, url_receptor})`: valida el token con `getMe` y que la URL sea `https://script.google.com/macros/s/…/exec`; genera `WEBHOOK_SECRET` (32 caracteres al azar); guarda `TELEGRAM_TOKEN`, `WEBHOOK_SECRET`, `RECEPTOR_URL` y `SHEET_ID` (si falta) en Script Properties; registra el webhook (`setWebhook` con `url_receptor?secret=…`, `allowed_updates: ["message","callback_query"]`, `drop_pending_updates: true`); genera un código de 6 caracteres válido 15 min (`TELEGRAM_CODIGO`, `TELEGRAM_CODIGO_VENCE`). Devuelve el nombre del bot y el código.
3. Ajustes muestra: "Envía `/start K7Q2PX` a @tu_bot" y un enlace `https://t.me/<bot>?start=K7Q2PX`.
4. El primer `/start <código>` correcto y vigente guarda `TELEGRAM_CHAT_ID`, borra el código y responde "✓ Vinculado. Te escribiré cuando haya algo por revisar." Cualquier otro `/start` o chat se ignora en silencio.
5. `estadoTelegram()` → `{configurado, vinculado, bot, hora_resumen, cuenta_bot, codigo?}`. `desvincularTelegram()` borra webhook, token, chat y secreto.

El token nunca vuelve al navegador (Ajustes solo muestra "configurado").

---

## 4. Mensajes y flujos

Todo texto que viene de datos (comercio, nombres) se escapa para el modo HTML de Telegram. Nunca se envían números de cuenta o tarjeta, solo el nombre de la cuenta.

### 4.1 Movimiento desconocido
Al terminar `revisarCorreos` (fuera del lock, después de etiquetar), `avisarPorRevisar_` recibe los movimientos nuevos con `estado = por_revisar`:
- Si son **más de 5**: un solo mensaje "📥 N movimientos nuevos por revisar" + [Abrir la app].
- Si no, uno por movimiento:
  ```
  🛒 S/ 45.90 · Crédito BCP
  TOTTUS PRIMAVERA · hoy 13:42
  [Supermercado] [Comida fuera] [Hogar]
  [Otra…] [Abrir en la app]
  ```
  Ícono por tipo: 🛒 gasto, 💰 ingreso, 🔁 transferencia. Las 3 categorías salen de `categoriasFrecuentes_` del tipo del movimiento.
- Movimientos **sin cuenta** o **transferencias sin destino**: solo [Abrir en la app].
- Si el bot no está vinculado, no se hace nada. Si el envío falla: `registrarLog_('aviso','telegram',…)` y se sigue.

### 4.2 Botones (`acciones.js`)
`callback_data` ≤ 64 bytes: los ids (UUID) se compactan a 22 caracteres base64url (`compactarId_`/`expandirId_`). Formatos:

| Datos | Acción |
|---|---|
| `c:<mov>:<cat>` | Categorizar con `categorizarMovimiento({id, categoria_id})`; edita a "✓ <Categoría>. ¿Recordar para <COMERCIO>?" [Sí, recordar] [Solo esta vez]. Sin comercio: edita a "✓ <Categoría>" sin preguntar. |
| `o:<mov>` | Edita el teclado: todas las categorías activas del tipo, 2 por fila, + [← Volver]. |
| `v:<mov>` | Vuelve al teclado de 3 categorías. |
| `r:<mov>` | Recordar: crea la regla con el comercio normalizado y confirma los demás `por_revisar` que coincidan (misma lógica que la bandeja, extraída a `recordarComercio_(mov, categoriaId)`); edita a "✓ <Categoría> · recordado para <COMERCIO> (+N más)". |
| `s:<mov>` | Solo esta vez: edita a "✓ <Categoría>". |
| `d:<mov>` | Deshacer un gasto escrito: borra el movimiento (solo si `origen = telegram`); edita a "↩ Deshecho". |
| `k:<mov>` | Cambiar categoría de un gasto escrito: muestra el teclado completo; al elegir, `c:` actualiza la categoría (permitido también si ya está confirmado y `origen = telegram`). |
| `ok` | Resumen "Todo bien": quita los botones y agrega "✓ Visto". No cambia datos. |

Botones viejos: si el movimiento ya no existe → "Ese movimiento ya no existe" (edita el mensaje); si ya está confirmado y no es de `origen = telegram` → "Ya estaba en <Categoría>" y edita el mensaje. Siempre se llama `answerCallbackQuery` para quitar el reloj del botón.

### 4.3 Gasto escrito (`escrito.js`)
Formato: `[+]descripción monto [palabras…]`.
- Monto: primer token numérico; acepta `12`, `12.5`, `12,50`, `S/12`, `s/ 12.50`, `1,250.00`. Debe ser > 0.
- Descripción: lo anterior al monto (obligatoria).
- Palabras después del monto: se comparan (normalizadas, sin tildes) con nombre de cuenta, la palabra `yape` (cuenta con flag Yape), `efectivo` (cuenta de tipo efectivo) y nombre de categoría; lo que no coincide se agrega a la descripción.
- `+` al inicio = ingreso; si no, gasto.
- Cuenta por defecto: `Config.cuenta_bot`; si no hay, la cuenta Yape; si no hay, error "Configura la cuenta predeterminada en Ajustes".
- Categoría: la indicada; si no, la regla que coincida con la descripción; si no, el movimiento queda `por_revisar` y se responde con el teclado de 4.1.
- Moneda: la de la cuenta (con `ultimo_tc` si es USD).
- Guarda con `origen = telegram`, `ref_externa = tg:<update_id>`, fecha de hoy, `comercio` = descripción.
- Respuesta: "✓ S/ 12.00 · Taxi · Débito BCP" + [Deshacer] [Cambiar categoría].
- No entendido: "No entendí. Ejemplos: `taxi 12 yape`, `almuerzo 25.50 efectivo comida`, `+ sueldo 3500`. Escribe /ayuda para más."

### 4.4 Comandos
- `/start <código>`: vinculación (§3). `/start` sin código desde el chat vinculado = `/ayuda`.
- `/hoy`: mismo texto que el resumen (sin botón "Todo bien"); si no hay movimientos, "Hoy no hay movimientos".
- `/mes`: ingresos, gastos, ahorro del mes y las 5 categorías con más gasto (usa `resumenMes_` y `gastoPorCategoria_`).
- `/deshacer`: borra el movimiento más reciente con `origen = telegram` creado en las últimas 24 h; si no hay, lo dice.
- `/ayuda`: formato de gasto escrito y comandos.
- Otro comando: "Comando desconocido. /ayuda".

### 4.5 Resumen diario (`resumen.js`)
- Trigger diario `enviarResumenDiario` a la hora `Config.hora_resumen` (por defecto 21; `atHour(h).everyDays(1)`; Apps Script lo dispara dentro de esa hora). Se crea/recrea al guardar la hora en Ajustes o al vincular, y se borra al desvincular.
- Si no hubo movimientos con fecha de hoy: no envía nada.
- Texto: "📊 Hoy · S/ X en gastos" (+ ingresos si hubo), lista de movimientos del día (monto, categoría o "⚠ por revisar", comercio; máximo 15 y "…y N más"), línea "N por revisar · M correos no leídos" si aplica; botones [Todo bien ✓] [Abrir la app].

### 4.6 Errores de trigger
Si `revisarCorreos` (llamado por trigger) o `enviarResumenDiario` lanzan, además del Log se envía "⚠️ Falló <tarea>: <mensaje>" como máximo una vez por hora (`ULTIMO_AVISO_ERROR` en Script Properties).

---

## 5. Puerta de entrada (`recibirTelegram`)

Orden, sin excepciones visibles para Telegram:
1. `secreto !== WEBHOOK_SECRET` (comparación de longitud fija) → ignorar.
2. JSON inválido → ignorar.
3. `update_id` visto en las últimas 6 h (`CacheService.getScriptCache()`, clave `tg:<update_id>`) → ignorar; si no, marcarlo.
4. Chat: `message.chat.id` o `callback_query.message.chat.id`. Si no hay chat vinculado, solo se acepta `/start <código>`. Si hay, cualquier otro chat → ignorar.
5. Modo demo activo → responder "La app está en modo demo; sal del modo demo para usar el bot." y no escribir.
6. Enrutar: `callback_query` → acciones; texto que empieza con `/` → comando; otro texto → gasto escrito; otro tipo (foto, audio, sticker) → "Por ahora solo entiendo texto. El audio y las fotos llegan en una próxima versión."
7. Cualquier excepción del paso 6 → `registrarLog_('error','telegram',…)` y respuesta "⚠️ No pude completar eso: <mensaje>".

Las escrituras usan `conBloqueo_` como el resto de la app.

---

## 6. Datos

Sin cambio de esquema de hojas (`VERSION_ESQUEMA` sigue en 2).
- Movimientos del bot: `origen = telegram`, `ref_externa = tg:<update_id>`.
- Config: `hora_resumen` (ya existe, `'21:00'`; se lee la hora entera), `cuenta_bot` (nueva clave, vacía por defecto).
- Script Properties: `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `WEBHOOK_SECRET`, `RECEPTOR_URL`, `TELEGRAM_BOT` (usuario del bot), `TELEGRAM_CODIGO`, `TELEGRAM_CODIGO_VENCE`, `ULTIMO_AVISO_ERROR`, `APP_URL`, `SHEET_ID`.

---

## 7. Interfaz web

- Ajustes, nueva sección "Telegram":
  - Sin configurar: pasos cortos (BotFather, `npm run deploy:receptor`, autorizar el receptor) + campos token y URL del receptor + [Conectar].
  - Configurado sin vincular: código y enlace `t.me`, [Ya lo envié] (refresca estado), [Generar otro código].
  - Vinculado: "✓ Conectado a @bot", hora del resumen (select 18–23), cuenta predeterminada para lo escrito (select), [Guardar], [Enviar mensaje de prueba], [Desconectar].
- Asistente inicial: en la pantalla final, "Puedes conectar Telegram desde Ajustes".
- Botón "Abrir la app" en Telegram usa la URL del web app (`ScriptApp.getService().getUrl()` guardada en `APP_URL` al configurar, porque desde el receptor no se puede obtener).

---

## 8. Pruebas

Arnés: se agregan `UrlFetchApp` simulado (registra cada llamada a `api.telegram.org`, respuestas configurables, opción de fallo) y `CacheService` simulado.

- `escrito`: montos en todos los formatos de §4.3, `+` ingreso, cuenta por nombre/yape/efectivo, categoría por nombre, palabras sobrantes, sin monto, monto 0, sin descripción, sin cuenta por defecto.
- `mensajes`: escapado HTML, `callback_data` ≤ 64 bytes con UUID reales, teclado de 3 + Otra, teclado completo 2 por fila.
- `webhook`: secreto inválido, JSON inválido, `update_id` repetido, chat ajeno, sin vincular (solo `/start código`), código vencido, modo demo, foto/audio, excepción → mensaje de error + Log.
- `acciones`: cada botón; botón viejo (movimiento borrado, ya confirmado); recordar confirma los demás del mismo comercio; deshacer solo `origen = telegram`.
- `avisos`: >5 agrupa; sin cuenta solo "Abrir en la app"; sin vincular no llama a Telegram; Telegram caído no hace fallar `revisarCorreos`.
- `resumen`: no envía sin movimientos; formato; tope 15; trigger recreado al cambiar la hora; aviso de error máximo 1 por hora.
- `vinculacion`: token inválido (`getMe` falla), URL inválida, guarda secretos, registra webhook con secreto, código de un solo uso, desvincular borra todo y el trigger.

---

## 9. Documentación y entrega

- `docs/instalacion.md`: crear el bot con @BotFather; `npm run deploy:receptor`; abrir el receptor en el editor y ejecutar una vez para autorizar; conectar en Ajustes; re-autorizar la app por el permiso nuevo.
- `docs/privacidad.md`: los mensajes del bot (montos, comercios, categorías, nombres de cuenta) pasan por los servidores de Telegram; nunca números de cuenta o tarjeta; el receptor público solo acepta el secreto y el chat vinculado.
- `docs/arquitectura.md`: diagrama de §2.
- `README.md`, `CHANGELOG.md` (0.3.0), `package.json` 0.3.0.
