# App de Finanzas Personales — Diseño

- **Fecha:** 2026-10-13
- **Autor:** Bruno Rioja (con Claude)
- **Estado:** Aprobado en brainstorming, pendiente de revisión escrita
- **Nombre de trabajo del repo:** `finanzas-personales` (renombrable antes de publicar)

---

## 1. Propósito y criterios de éxito

### Objetivo
Una app de finanzas personales, de uso propio y replicable por otras personas, que:

1. **(Prioridad 1)** Muestre en qué se va el dinero: registro con buenas categorías y análisis.
2. **(Prioridad 2)** Permita controlar un presupuesto mensual por categoría.

### Usuarios
- Bruno (usuario principal): BCP (débito "Clásica", "Cuenta digital", tarjeta de crédito VISA con consumos en S/ y $), Yape, Interbank (solo para pagar Google AI Pro), efectivo ocasional.
- Su pareja (ingeniera industrial y de sistemas, sabe programar): instalará su propia copia con sus propios bancos.
- Reclutadores: el repo debe servir como proyecto de portafolio.

### Criterios de éxito
- Registrar un gasto con tarjeta o Yape requiere **cero escritura** en el caso normal (entra solo desde Gmail).
- Lo que no se puede categorizar solo se resuelve con **un toque o un audio** en Telegram.
- El dashboard se ve bien y es usable en celular y laptop.
- Otra persona puede instalarlo siguiendo el README, sin tocar código (vía plantilla) o con clasp (vía desarrollador).
- No hay datos personales ni secretos en el repositorio.

### Fuera de alcance (v1)
- Integración directa con APIs bancarias (no existen abiertas en Perú para este uso).
- Multiusuario en una misma instancia / finanzas compartidas de pareja.
- Inversiones, patrimonio neto histórico, metas de ahorro, préstamos a terceros.
- App nativa / funcionamiento offline.

---

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Plataforma | Google Apps Script (web app con HtmlService) + Google Sheets como base de datos. |
| Acceso a la web app | "Ejecutar como: yo" / "Acceso: solo yo". |
| Modelo de despliegue | Autoalojado: cada persona tiene su propia Sheet, script, bot y clave Gemini en su cuenta Google. |
| Entrada principal | Lectura automática de correos de notificación bancaria (Gmail) con lectores deterministas por banco. |
| Entrada secundaria | Bot de Telegram (texto, audio, foto de boleta, botones). |
| IA | API de Gemini (modelo Flash‑Lite) con clave de Google AI Studio del usuario. Google AI Pro **no** cubre la API. Nivel gratuito durante desarrollo; nivel de pago con tope de gasto para datos reales (privacidad). |
| Modo del bot | **Modo B**: guarda solo lo conocido, pregunta solo lo nuevo, resumen diario a las 21:00. |
| Dividir compras mixtas | Botón "Dividir": a mano en la app, o por audio/texto/foto de boleta en Telegram. |
| Estilo visual | **B · Fintech oscuro**: fondo casi negro, tarjetas `#17171f`, acentos violeta `#7c5cff` y verde `#3ddc97`. |
| Dashboard | Dentro de la app, 8 bloques (ver §6). |
| Presupuesto | Mensual simple por categoría (no base cero). |
| Moneda | PEN principal; USD soportado con conversión al último tipo de cambio conocido. |
| Instalación | Dos vías: plantilla "Hacer una copia" + asistente, y clasp para desarrolladores. |
| Repo | GitHub público, MIT, CI con GitHub Actions, README en español con resumen en inglés. |

---

## 3. Arquitectura

```
Entradas                      Google Apps Script (proyecto del usuario)            Datos / servicios
─────────                     ─────────────────────────────────────────            ─────────────────
Gmail (BCP, Yape…)  ───────►  Ingesta Gmail (trigger 5 min) → lectores por banco ─┐
Telegram (bot)      ───────►  Webhook Telegram (doPost) → comandos/botones/media ─┤
Navegador (cel/PC)  ───────►  Web app (HtmlService): vistas + asistente ──────────┤
                              Servicio Gemini (audio, boleta, fallback, resumen) ─┤──► Google Sheet (hojas §4)
                              Núcleo de dominio (JS puro, testeable en Node) ◄────┘    Script Properties (secretos)
                                                                                      API Gemini · API Telegram
```

### Unidades y responsabilidades

| Unidad | Carpeta | Qué hace | Depende de |
|---|---|---|---|
| Núcleo | `src/core/` | Crear/validar movimientos, divisiones, transferencias, reglas, conversión de moneda, agregados del dashboard, presupuestos. Sin llamadas a servicios de Google. | Nada (puro) |
| Repositorio | `src/core/repo.js` | Leer/escribir hojas (única capa que toca SpreadsheetApp). | SpreadsheetApp |
| Lectores | `src/parsers/` | Un archivo por banco con interfaz común: `coincide(correo) → bool`, `leer(correo) → MovimientoCrudo \| null`. Respaldo con Gemini para remitentes sin lector. | Núcleo, Gemini (solo el respaldo) |
| Ingesta | `src/ingesta/` | Trigger: busca correos no procesados, aplica lector, aplica reglas, guarda, etiqueta `finanzas/procesado`, notifica al bot si hace falta. | Lectores, Núcleo, Repositorio, Telegram |
| Telegram | `src/telegram/` | Webhook, validación, enrutamiento de comandos/botones, envío de mensajes, resumen diario. | Núcleo, Repositorio, Gemini |
| Gemini | `src/gemini/` | Cliente HTTP + prompts con salida JSON validada: audio→gastos, boleta→ítems, correo→movimiento, resumen mensual. | UrlFetchApp |
| Web | `src/web/` | `Index.html`, estilos, vistas y funciones `google.script.run` expuestas. | Núcleo, Repositorio |
| Setup | `src/setup/` | Asistente inicial, creación de hojas, triggers, webhook, modo demo. | Todo lo anterior |

Regla: solo `repo.js`, `ingesta/`, `telegram/`, `gemini/`, `web/` y `setup/` tocan servicios de Google. El núcleo y los lectores son funciones puras que reciben datos y devuelven datos.

---

## 4. Modelo de datos (Google Sheet)

### Movimientos
`id, fecha, tipo, monto, moneda, monto_pen, tc, cuenta_id, cuenta_destino_id, categoria_id, comercio, descripcion, origen, estado, ref_externa, dividido, creado_en`

- `tipo`: `gasto` | `ingreso` | `transferencia`
- `monto`: positivo, salvo reembolsos de gasto (negativo, ver §5.4).
- `origen`: `manual` | `gmail` | `telegram` | `gemini` | `recurrente`
- `estado`: `confirmado` | `por_revisar`
- `ref_externa`: n.º de operación del banco o id de mensaje; **único** (deduplicación).
- `dividido`: `true` si tiene filas en Divisiones; entonces el dashboard usa las divisiones, no `categoria_id`.

### Divisiones
`id, movimiento_id, categoria_id, monto, nota` — la suma de `monto` debe igualar el `monto` del movimiento (validado en el núcleo).

### Cuentas
`id, nombre, banco, tipo, moneda, saldo_inicial, ultimos4, activa`

- `tipo`: `debito` | `credito` | `ahorro` | `billetera` | `efectivo`
- `ultimos4` asocia un correo a la cuenta (p. ej. tarjeta `5202`). Yape se asocia por remitente.
- En cuentas de crédito el saldo es negativo (deuda).

### Categorias
`id, nombre, emoji, color, tipo (gasto|ingreso), padre_id, activa`

Plantilla por defecto:
- Gastos: Supermercado 🛒, Comida fuera 🍽️, Bodega 🏪, Transporte 🚕, Vivienda y servicios 🏠, Suscripciones 📺, Salud y gym 💪, Suplementos 💊, Aseo personal 🧴, Ropa 👕, Entretenimiento 🎮, Educación 🎓, Viajes ✈️, Regalos 🎁, Comisiones bancarias 💸, Otros ❓.
- Ingresos: Sueldo 💼, Freelance / extras 💰, Reembolsos 🔁, Otros ingresos 🎁.

### Reglas
`id, patron, categoria_id, cuenta_id, creada_por (usuario|bot), usos` — `patron` se compara normalizado (mayúsculas, sin tildes, contiene) contra comercio o destinatario.

### Presupuestos (fase 5)
`mes (YYYY-MM), categoria_id, monto`

### Recurrentes (fase 5)
`id, nombre, monto, moneda, cuenta_id, categoria_id, dia_mes, activo`

### Config
Clave→valor: `nombre`, `moneda_principal`, `hora_resumen`, `modo_bot`, `ultimo_tc`, `version_esquema`.

### Log
`fecha, nivel, origen, mensaje, detalle`

### Script Properties (secretos, nunca en la Sheet)
`TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `WEBHOOK_SECRET`, `GEMINI_API_KEY`, `SHEET_ID`.

---

## 5. Reglas de dominio

1. **Transferencias no son gasto ni ingreso**: entre cuentas propias y pagos de tarjeta de crédito (débito → crédito). Evita doble conteo.
2. **Gasto con tarjeta de crédito** cuenta en la fecha de compra y aumenta la deuda de la tarjeta.
3. **Moneda**: se guarda `monto` + `moneda` originales y `monto_pen = monto × tc`. `tc` = tipo de cambio del propio correo si lo trae (pagos de tarjeta en $), si no `Config.ultimo_tc` (editable). Todos los agregados usan `monto_pen`.
4. **Yapeo recibido** = `ingreso` por defecto. Puede marcarse como **reembolso de un gasto**: se convierte en `tipo = gasto` con **monto negativo** en la categoría de gasto elegida (p. ej. −S/ 40 en Comida fuera), de modo que reduce ese gasto en el dashboard. La categoría de ingreso "Reembolsos" queda para devoluciones que no corresponden a un gasto propio.
5. **Categorización**: lector → regla que coincida → si no hay regla, `estado = por_revisar` y el bot pregunta (modo B). Responder "Sí, recordar" crea una regla.
6. **Divisiones**: la última línea se autocompleta con el restante; no se puede guardar si la suma no cuadra.
7. **Deduplicación** por `ref_externa` (correos) y `update_id` (Telegram).

---

## 6. Interfaz

### Estilo B (tokens base)
- Fondo `#0b0b10`, superficie `#17171f`, borde `#23232e`, texto `#f2f2f7`, texto secundario `#8b8b99`.
- Acento primario `#7c5cff`, positivo `#3ddc97`, alerta `#ffb347`, negativo `#ff6b6b`, info `#4cc9f0`.
- Tipografía del sistema (`-apple-system, Inter, system-ui`), números tabulares.
- Se documenta en un `DESIGN.md` propio al implementar la fase 1.

### Navegación
Inicio · Movimientos · Presupuestos · Cuentas · Ajustes (+ asistente inicial en primer uso). Laptop: barra superior; celular: barra inferior.

### Dashboard (Inicio) — 8 bloques
| # | Bloque | Fase |
|---|---|---|
| 1 | Indicadores del mes: ingresos, gastos, ahorro, tasa de ahorro (vs mes anterior) | 1 |
| 2 | Gasto por categoría: dona + filas compactas `nombre · barra · monto · %` (clic → movimientos) | 1 |
| 3 | Tendencia 6 meses ingresos vs gastos | 1 |
| 4 | Presupuesto vs real con colores de alerta | 5 |
| 5 | Próximos pagos: tarjeta (del estado de cuenta) + recurrentes | 5 |
| 6 | Saldos por cuenta (incluye deuda de crédito) | 1 |
| 7 | Top comercios: filas compactas `comercio · barra · monto · veces` | 1 |
| 8 | Resumen con Gemini | 4 |

Selector de mes en la cabecera. En celular los bloques se apilan en una columna.

### Bandeja "Por revisar"
Lista de movimientos `por_revisar` con acciones: confirmar categoría sugerida, cambiar, dividir.

### Dividir (app)
Hoja modal: filas `categoría · monto · ✕`, "+ Agregar categoría", barra de proporción, "Falta asignar", botón "📷 Leer boleta" (fase 4).

---

## 7. Bot de Telegram (modo B)

- **Movimiento conocido** (regla coincide): se guarda confirmado, sin mensaje.
- **Movimiento desconocido**: mensaje con monto, cuenta y destinatario + teclado con las 3 categorías más probables y "Otra…". Al elegir: "¿Recordar para <destinatario>?" [Sí, recordar] [Solo esta vez].
- **Resumen diario** (hora configurable, por defecto 21:00): total del día y lista de movimientos con [Todo bien] [Revisar en la app]; cada ítem permite [Dividir].
- **Entrada libre**: texto ("taxi 12 yape") o audio → Gemini → movimientos → confirmación con [Deshacer].
- **Dividir por voz/foto**: tras [Dividir], el usuario envía audio, texto o foto de boleta → Gemini propone divisiones → [Confirmar] [Corregir].
- **Comandos**: `/start` (vincula chat_id durante setup), `/hoy`, `/mes`, `/deshacer`, `/ayuda`.
- **Seguridad**: URL con `?secret=WEBHOOK_SECRET`; se ignora todo `chat_id` distinto del configurado.

---

## 8. Lectores de correo (fase 2)

Remitentes y tipos observados en el Gmail de Bruno (fixtures anonimizados en `tests/fixtures/correos/`):

| Remitente | Asunto / tipo | Resultado |
|---|---|---|
| `notificaciones@notificacionesbcp.com.pe` | Consumo Tarjeta de Débito | gasto (cuenta por `ultimos4`) |
| ídem | Consumo Tarjeta de Crédito (S/ o $) | gasto en cuenta crédito |
| ídem | Consumo débito con comercio `PLIN-<nombre>` | gasto, destinatario = nombre |
| ídem | Constancia de recepción de Yapeo | ingreso |
| ídem | Constancia de Transferencia Entre mis Cuentas | transferencia |
| ídem | Constancia de Pago de Tarjeta de Crédito Propia (S/ o $ con tipo de cambio) | transferencia; actualiza `ultimo_tc` |
| ídem | Constancia de Pago de Servicio (p. ej. Claro) | gasto, comercio = empresa |
| `estadodecuenta@notificacionesbcp.com.pe` | Estado de Cuenta VISA | **fase 5**: no crea movimiento; guarda pago total/mínimo/fecha límite para bloque 5 |
| `notificaciones@yape.pe` | Yapeo enviado | gasto, destinatario = beneficiario |

- Campos extraídos: monto, moneda, fecha y hora, comercio/destinatario, últimos 4, n.º de operación.
- Remitente bancario sin lector o formato no reconocido → respaldo Gemini → `por_revisar`. Si Gemini falla → entrada en bandeja con enlace al correo.
- Correos procesados reciben la etiqueta `finanzas/procesado`.
- Interbank: sin lector en v1 (no envía notificaciones de consumo); Google AI Pro se cubre con un Recurrente (fase 5).

---

## 9. Integración Gemini (fase 4)

- Modelo: Gemini Flash‑Lite vía `generateContent` con `UrlFetchApp`; salida JSON con esquema; validación estricta en el núcleo antes de guardar.
- Usos: audio (OGG de Telegram) → lista de movimientos; foto de boleta → ítems agrupados por categoría; correo desconocido → movimiento; resumen mensual en texto.
- Gemini nunca escribe directo en la Sheet: propone, el núcleo valida, el usuario confirma cuando aplica.
- Sin clave configurada: estas funciones se ocultan; el resto funciona.

---

## 10. Instalación

### Vía A — Plantilla
1. "Hacer una copia" de la Sheet plantilla (script vinculado incluido).
2. Extensiones → Apps Script → Implementar → Aplicación web (solo yo).
3. Abrir URL → asistente: datos básicos → bancos y cuentas (lista + últimos 4) → categorías → Telegram (guía @BotFather, token, `/start`) → Gemini (opcional) → crea hojas, triggers, webhook → prueba final.
4. Actualizaciones: GitHub Release adjunta código combinado para pegar en Apps Script; los datos no se tocan. `version_esquema` permite migraciones.

### Vía B — Desarrollador
`git clone` → `npm install` → `npm run setup` (clasp create + Sheet) → `npm run deploy` → mismo asistente. Actualizar: `git pull && npm run deploy`.

---

## 11. Errores

| Falla | Comportamiento |
|---|---|
| Formato de correo desconocido | Respaldo Gemini → `por_revisar`; si falla, bandeja con enlace. Nunca se pierde. |
| Duplicados | Ignorados por `ref_externa` / `update_id`. |
| Gemini sin cuota o caído | Mensaje de reintento en el bot; ingesta de correos no se afecta. |
| Telegram caído | Movimiento se guarda; aparece en resumen/app. |
| Excepción en trigger | Registro en hoja Log + aviso al bot (máximo 1 por hora). |
| Webhook con secreto inválido o chat ajeno | Se ignora en silencio. |

---

## 12. Tests y calidad

- `node:test` + arnés `vm` (patrón del sistema del gym) que simula SpreadsheetApp, GmailApp, UrlFetchApp, PropertiesService, CacheService, LockService.
- Núcleo: transferencias, divisiones, moneda, reglas, agregados, presupuestos.
- Lectores: un fixture anonimizado por cada tipo de correo de §8.
- Telegram/Gemini: respuestas simuladas, incluido JSON inválido.
- TDD en todas las fases.
- ESLint + `npm test` en GitHub Actions en cada push/PR; badge en README.
- Commits convencionales, `CHANGELOG.md`, tags `v0.1`…`v0.5` al cerrar cada fase.
- `.gitignore`: `.clasp.json`, `node_modules/`, `.superpowers/`. `.claspignore`: `tests/**`, `docs/**`, `node_modules/**`.

---

## 13. Repositorio

```
src/
  core/        lógica pura + repo.js
  parsers/     bcp.js, yape.js, _gemini-fallback.js
  ingesta/     trigger de Gmail
  telegram/    webhook, teclados, comandos, resumen
  gemini/      cliente + prompts
  web/         Index.html, estilos, vistas
  setup/       asistente, creación de hojas, triggers, demo
tests/         arnés, fixtures/correos, *.test.js
docs/          instalacion.md, arquitectura.md, agregar-un-banco.md, privacidad.md, superpowers/
.github/workflows/ci.yml
README.md  LICENSE (MIT)  CHANGELOG.md  DESIGN.md  appsscript.json  package.json
```

README: resumen en inglés, GIF del bot, capturas con datos demo, diagrama, instalación (A y B), sección "Decisiones técnicas", privacidad.

**Modo demo** (Ajustes): carga 3 meses de datos ficticios en una Sheet aparte para capturas y demostraciones.

---

## 14. Fases

Cada fase tiene su propio plan e implementación y termina con un tag.

| Fase | Alcance | Resultado usable | Tag |
|---|---|---|---|
| 1. Núcleo + repo | Estructura del repo, CI, arnés, modelo de datos, repo.js, asistente (sin Telegram/Gemini), Movimientos/Cuentas/Categorías/Ajustes, registro manual, dashboard bloques 1·2·3·6·7, modo demo, DESIGN.md | Registrar a mano y ver el dashboard | v0.1 |
| 2. Ingesta automática | Lectores BCP y Yape, trigger Gmail, reglas, transferencias/pagos de tarjeta, tipo de cambio, bandeja Por revisar, dividir manual | Los gastos entran solos | v0.2 |
| 3. Bot de Telegram | Webhook, vinculación en asistente, modo B, botones, recordar regla, resumen diario, comandos | Confirmar todo desde el chat | v0.3 |
| 4. Gemini | Cliente, audio, texto libre, foto de boleta, dividir por voz/foto, respaldo de lectores, bloque 8 | Dictar y dividir por voz | v0.4 |
| 5. Presupuestos y pagos | Presupuestos, bloques 4·5, alertas 80 %/100 % por Telegram, recurrentes, estado de cuenta VISA, plantilla pública, pulido README | Controlar presupuesto | v0.5 |

---

## 15. Riesgos

| Riesgo | Mitigación |
|---|---|
| El BCP cambia el formato de sus correos | Tests con fixtures detectan el cambio; respaldo Gemini evita pérdida. |
| Telegram reintenta el webhook (respuesta 302 de Apps Script) | Deduplicación por `update_id`. |
| Límites del nivel gratuito de Gemini cambian | Gemini solo en funciones opcionales; recomendación de nivel de pago con tope. |
| Cuotas de Apps Script (tiempo de triggers) | Trigger de 5 min con búsqueda acotada por etiqueta y fecha. |
| Datos personales filtrados al repo | `.gitignore`, fixtures anonimizados, secretos solo en Script Properties, modo demo para capturas. |
