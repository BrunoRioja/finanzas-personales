# Fase 5c · Plantilla "Hacer una copia" y README — Diseño

- **Fecha:** 2026-10-14
- **Autor:** Bruno Rioja (con Claude)
- **Estado:** Aprobado en brainstorming, pendiente de revisión escrita
- **Spec general:** [2026-10-13-app-finanzas-design.md](2026-10-13-app-finanzas-design.md) (§14 fase 5)
- **Versión objetivo:** v0.7.0

Última de las tres versiones de la fase 5: 5a presupuestos (v0.5) y 5b próximos pagos (v0.6) ya están publicadas.

---

## 1. Objetivo y criterios de éxito

Que cualquier persona tenga su propia app sin clonar el repo ni usar la terminal, y que el repo se lea bien como proyecto de portafolio.

Éxito:
- Desde el README, "Hacer una copia" + 4 pasos guiados dejan la app funcionando en la cuenta de otra persona: dashboard, registro, presupuestos, próximos pagos y lectura de correos.
- El bot de Telegram se conecta siguiendo `docs/telegram.md`, sin clasp.
- Ajustes muestra la versión instalada y, con el botón "Buscar actualizaciones", dice si hay una más nueva.
- Quien actualiza copia la plantilla nueva y trae sus datos con "Importar datos de mi hoja anterior".
- El README presenta el proyecto con capturas actuales, un diagrama de arquitectura, las decisiones técnicas y cómo se prueba.

Fuera de alcance:
- Actualización automática de las copias.
- README completo en inglés (se mantiene el resumen corto).
- Plantilla del receptor.
- Gemini.

---

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Alcance de la plantilla | Núcleo y lectura de correos. Telegram va en una guía aparte. |
| Actualizaciones | La copia queda congelada en su versión. En Ajustes, el botón "Buscar actualizaciones" (manual, sin consultas automáticas) dice si hay una versión nueva, y para actualizar se copia la plantilla nueva y se importan los datos de la hoja anterior. No hay biblioteca compartida: el código de cada copia es de su dueño. |
| Idioma | README y guías en español; se mantiene el resumen corto en inglés. |

---

## 3. La plantilla

**Hoja plantilla**
- Es una Google Sheet de Bruno, "Finanzas personales — plantilla", compartida como "cualquiera con el enlace puede ver".
- Su proyecto de Apps Script vinculado tiene el mismo código que `src/`.
- No tiene datos ni Script Properties y nunca se publica ni se usa como app. Al copiar una hoja, Google copia el proyecto vinculado con sus propiedades, así que la plantilla no debe tener ninguna.
- Tiene una sola pestaña, **"Empieza aquí"**, con los 4 pasos (texto de §5) y el enlace a la guía. El asistente crea las demás pestañas al instalar.
- La primera vez, Bruno la arma a mano: renombra "Hoja 1" y pega el texto.

**Enlace de copia**
- `https://docs.google.com/spreadsheets/d/<id de la plantilla>/copy`, publicado en el README como botón "Hacer una copia".
- El id no es secreto: es el mismo del enlace público.

**Mantenimiento**
- `npm run setup:plantilla` crea, una sola vez, la hoja plantilla y su proyecto con clasp.
  - Su configuración queda en `plantilla/.clasp.json`, que no se versiona, como la de la app.
- `npm run deploy:plantilla` sube `src/` al proyecto de la plantilla sin crear despliegues.
  - Se corre al publicar cada versión, después de `npm run deploy`.
  - Igual que con el receptor, usa `-P` con ruta absoluta y verifica que el `scriptId` no sea el de la app ni el del receptor.

**Menú en la hoja (`src/web/menu.js`)**
- `onOpen()` (trigger simple) agrega el menú **💸 Finanzas** con dos opciones: "Abrir mi app" y "Cómo publicar mi app".
- **`abrirMiApp()`:**
  - Si `ScriptApp.getService().getUrl()` devuelve una URL, muestra un diálogo con el enlace.
  - Si no hay URL, muestra los mismos pasos que "Cómo publicar mi app".
  - Es la primera función que corre con permisos, así que Google pide autorizar al tocarla.
- **`comoPublicarMiApp()`** muestra un diálogo HTML con los pasos:
  - Extensiones → Apps Script → Implementar → Nueva implementación → Tipo: App web → Ejecutar como: Yo → Quién tiene acceso: Solo yo → Implementar → Autorizar → copiar la URL.
  - Agrega una nota sobre la pantalla "Google no verificó esta app".
- Los textos de los diálogos se arman con funciones puras (`textoPublicarApp_()`, `htmlEnlaceApp_(url)`), para poder probarlos.
- No requiere permisos nuevos: `SpreadsheetApp.getUi()` usa el scope de spreadsheets que ya existe.

---

## 4. Versión y actualización

**Versión visible**
- `src/core/version.js` define `const VERSION_APP = '0.7.0';`.
- Una prueba exige que sea igual a la `version` de `package.json`.
- En Ajustes se agrega la sección **"Acerca de"**: "Versión 0.7.0", con enlaces al repositorio y al CHANGELOG.

**Buscar actualizaciones (manual)**
- **`compararVersiones_(a, b) → -1 | 0 | 1`:** compara por número cada parte de `x.y.z`, así que `0.10.0 > 0.9.0`. Si un texto no tiene esa forma, se trata como `0.0.0`.
- **`estadoVersion()` (público):** devuelve `{ actual: VERSION_APP, repo, cambios, actualizar }` sin conectarse a nada. Ajustes lo usa para mostrar la versión.
- **`buscarActualizacion()` (público):** solo corre cuando la persona toca **"Buscar actualizaciones"** en Ajustes → Acerca de. No hay consultas automáticas ni caché.
  - Lee `https://raw.githubusercontent.com/BrunoRioja/finanzas-personales/main/package.json` con `UrlFetchApp` (`muteHttpExceptions`).
  - Devuelve lo mismo que `estadoVersion()` más `{ ultima, hayNueva, error }`.
  - Nunca lanza. Si GitHub no responde o la respuesta no trae versión, devuelve `error: true` y `hayNueva: false`.
- **En Ajustes**, bajo el botón:
  - "✓ Tienes la última versión (x.y.z)."
  - "🎉 Hay una versión nueva (x.y.z)", con enlaces a "Novedades" (CHANGELOG) y "Cómo actualizar" (`docs/actualizar.md`).
  - "No pude consultar GitHub. Intenta más tarde."
- **Privacidad:** no se envía ningún dato del usuario; es una lectura pública. No hay permisos nuevos, porque `script.external_request` ya existe.

**Importar datos de la hoja anterior (`src/setup/importar.js`)**
- **Dónde está:** en la primera pantalla del asistente hay un enlace "¿Ya usabas la app? Importa tus datos". Abre un campo para pegar el enlace o el id de la hoja anterior y el botón "Importar".
- **`importarHojaAnterior(enlace)` (público, dentro de `conBloqueo_`):**
  - **Validaciones**, todas antes de escribir:
    - Extrae el id: `/\/d\/([\w-]{20,})/` del enlace, o el texto tal cual si ya parece un id (`^[\w-]{20,}$`). Si no, lanza "Pega el enlace de tu hoja anterior.".
    - Si la copia actual ya está instalada, lanza "Esta app ya está instalada; importa en una copia nueva de la plantilla.".
    - Si es la misma hoja, lanza "Ese enlace es esta misma hoja.".
    - Si `SpreadsheetApp.openById` falla, lanza "No pude abrir esa hoja. ¿Es tuya y el enlace está completo?".
    - Si la hoja no tiene `Config` con `instalado = si`, lanza "Esa hoja no es de la app (o no terminó la instalación).".
  - **Lectura de la hoja anterior:**
    - Lee cada tabla por encabezados, aplicando `RENOMBRES_ESQUEMA` (una hoja v1 trae `ultimos4`).
    - Tablas: Cuentas, Categorias, Movimientos, Divisiones, Reglas, Presupuestos, Recurrentes, EstadosCuenta.
    - Una tabla que no existe en la hoja anterior (esquema viejo) se importa vacía.
    - Las columnas del esquema actual que no existían quedan vacías, con el valor por defecto del tipo.
  - **Escritura:**
    - `crearHojas_` en la hoja nueva, luego `agregarFilas_` de cada tabla con los mismos ids.
    - De `Config` se copian `nombre`, `moneda_principal`, `ultimo_tc`, `hora_resumen`, `horario_inicio`, `horario_fin` y `etiquetar`.
    - Después se guarda `version_esquema = VERSION_ESQUEMA` e `instalado = si`.
  - **No se copia:**
    - Log y Pendientes;
    - `importar_desde`, `cursor_lectura`, `lectura_activa` y `lectura_minutos`: la lectura se vuelve a activar en Ajustes, y los correos ya importados no se duplican porque su id va en `ref_externa`;
    - las Script Properties de la otra copia (token del bot, etc.), que no se pueden leer.
  - **Devuelve:** `{ importado: { cuentas, categorias, movimientos, … }, estado: estadoActual_() }`.
- **En la interfaz:** al terminar se muestra un resumen ("Importaste 1,234 movimientos, 6 cuentas…") y el recordatorio: "En tu app anterior, ve a Ajustes, apaga la lectura de correos y desconecta el bot. Si no, las dos apps leerán los mismos correos." Luego se carga el Inicio.

---

## 5. Documentación

**README.md** (español; se mantiene el resumen corto en inglés, actualizado)
- **Cabecera:** título, badges y el resumen en inglés actualizado (correos, bot, presupuestos y próximos pagos existen; Gemini es "future").
- **Botón "Hacer una copia"**, con el enlace a la plantilla y a `docs/instalacion.md`.
- **"Qué hace (v0.7)":** en este orden: correos → bot → presupuestos → próximos pagos → dashboard y movimientos → instalación por plantilla.
- **Capturas nuevas**, generadas con `tests/ui/ver.js` y datos ficticios:
  - Inicio en laptop con presupuesto y próximos pagos;
  - Inicio en celular;
  - Presupuestos con pagos fijos.
- **"Cómo funciona":** un diagrama Mermaid con Gmail → lectores → Google Sheet; app web ↔ hoja; Telegram → receptor → app (biblioteca) → hoja; triggers (lectura, resumen, recordatorio).
- **Decisiones técnicas:** las actuales, más "copia congelada en vez de biblioteca compartida" e "importación por encabezados".
- **Calidad:** pruebas con `node:test` sobre un arnés que simula Sheets, Gmail, Telegram y triggers; CI en GitHub Actions; ESLint; revisión de la interfaz en Chrome.
- **Instalación:** plantilla (recomendada) y vía desarrollador.
- **Hoja de ruta:** v0.7 ✅; v0.4 Gemini ⏸️.

**Guías**
- **`docs/instalacion.md`:** se reescribe "Vía plantilla" con los 4 pasos.
  1. Hacer una copia.
  2. Publicar la app (menú 💸 Finanzas → "Cómo publicar mi app"), incluida la pantalla "Google no verificó esta app": por qué aparece (el código es tuyo y no pasó por la verificación de Google) y cómo continuar (Configuración avanzada → Ir a…).
  3. Abrir la app y completar el asistente.
  4. Activar la lectura de correos en Ajustes.
- **`docs/telegram.md`** (nueva), para la vía plantilla:
  1. Crear el bot con @BotFather.
  2. En script.new, crear un proyecto "Finanzas · receptor" y pegar el código de `receptor/Receptor.js`.
  3. Bibliotecas → + → pegar el *ID de script* de tu app (Configuración del proyecto) → versión "HEAD (modo de desarrollo)" → identificador `Finanzas`.
  4. Ejecutar `autorizar` una vez.
  5. Implementar → App web → Ejecutar como: Yo → Acceso: Cualquier usuario.
  6. Pegar el token y la URL en Ajustes → Telegram.
  7. Abrir el enlace de vinculación.
- **`docs/actualizar.md`** (nueva):
  1. Copiar la plantilla nueva.
  2. Publicarla.
  3. "Importar datos de mi hoja anterior".
  4. En la app anterior, apagar la lectura y desconectar el bot.
  5. Volver a activar la lectura y conectar el bot en la nueva.
  - Quien usa clasp: `git pull` + `npm run deploy`.
- **`docs/privacidad.md`:** agrega "Buscar actualizaciones" (solo al tocar el botón; qué se lee, que no se envía nada).
- **CHANGELOG 0.7.0**, `package.json` 0.7.0 y `VERSION_APP`.

---

## 6. Pruebas

- **`version`:**
  - `VERSION_APP` igual a la de `package.json`;
  - `compararVersiones_` (0.10.0 > 0.9.0, iguales, texto inválido);
  - `estadoVersion` no consulta GitHub;
  - `buscarActualizacion` consulta cada vez que se pide, con versión nueva, igual y GitHub caído (`error`, sin lanzar).
  - El harness simula `raw.githubusercontent.com` en `UrlFetchApp`.
- **`importar`:**
  - Copia todas las tablas con sus ids y la configuración elegida, y deja la app instalada.
  - Funciona desde una hoja de esquema anterior: sin Presupuestos, Recurrentes ni EstadosCuenta, y con `ultimos4`.
  - Valida un enlace inválido, la misma hoja, una hoja que no se puede abrir, una hoja no instalada y una app ya instalada.
  - Si algo falla, no escribe nada.
  - No copia Log, Pendientes ni la configuración de lectura.
- **`menu`:**
  - `onOpen` agrega el menú;
  - "Abrir mi app" con URL muestra el enlace y sin URL muestra los pasos;
  - los textos escapan la URL.
- **Interfaz:**
  - Ajustes con "Acerca de" y los tres resultados de "Buscar actualizaciones";
  - el asistente con "Importa tus datos" y el resultado;
  - a 390 px y 1280 px.
- **Prueba real (Bruno):**
  1. `npm run setup:plantilla` y armar la pestaña "Empieza aquí".
  2. `npm run deploy:plantilla`.
  3. Desde otra cuenta de Google: copiar, publicar, empezar de cero y además importar desde una hoja de prueba compartida con esa cuenta (por ejemplo, la hoja demo), para no copiar datos reales a otra cuenta, y comprobar el Inicio y la lectura de correos.
