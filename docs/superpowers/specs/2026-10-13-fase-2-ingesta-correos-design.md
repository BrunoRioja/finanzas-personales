# Fase 2 · Lectura automática de correos — Diseño

- **Fecha:** 2026-10-13
- **Autor:** Bruno Rioja (con Claude)
- **Estado:** Aprobado en brainstorming, pendiente de revisión escrita
- **Spec general:** [2026-10-13-app-finanzas-design.md](2026-10-13-app-finanzas-design.md) (§5, §8, §11, §14 fase 2)
- **Versión objetivo:** v0.2.0

---

## 1. Objetivo y criterios de éxito

Que los gastos, ingresos y transferencias del BCP y Yape **entren solos** a la app leyendo los correos de notificación, y que lo que la app no sabe categorizar se resuelva en una bandeja con un toque.

Éxito:
- Un consumo con tarjeta o un yapeo aparece en la app en ≤ 5 minutos sin escribir nada.
- Un comercio ya conocido entra confirmado y categorizado; uno nuevo entra "por revisar" y, al categorizarlo una vez, la app lo recuerda.
- Pagar la tarjeta y mover dinero entre cuentas propias **no** cuenta como gasto.
- Ningún correo bancario se pierde: o crea un movimiento o queda visible como "correo no leído".
- La app pide el permiso de Gmail más acotado que permite etiquetar: `gmail.modify` ("ver y modificar, pero no eliminar"). Nunca borra ni envía correos.

Fuera de alcance (fases siguientes): bot de Telegram (3), Gemini como respaldo de lectura y foto de boleta (4), estado de cuenta VISA y próximos pagos (5), otros bancos (Interbank no envía notificaciones de consumo hoy).

---

## 2. Cuentas reales de Bruno (caso de referencia)

| Cuenta en la app | Números que aparecen en los correos | Uso |
|---|---|---|
| Débito BCP (Cuenta digital) | `5101` (cuenta) y `5202` (tarjeta de débito) | Gastos diarios, Yape, pagos virtuales, servicios. Saldo bajo. |
| Ahorro BCP (Clásica) | `5303` | Ahorro; solo transfiere a la digital. |
| VISA BCP | `5404` (VISA Oro) | Consumos en S/ y $. |

Bruno corrige los nombres y números de sus cuentas desde la vista Cuentas tras desplegar la fase 2 (hoy los nombres "Débito BCP"/"Ahorro BCP" están invertidos respecto al uso).

---

## 3. Cambios al modelo de datos (esquema v2)

| Hoja | Cambio |
|---|---|
| Cuentas | `ultimos4` → **`numeros`**: lista de números de 4 dígitos separados por coma (`"5101, 5202"`). Nueva columna **`yape`** (booleano): la cuenta de la que sale/entra Yape; como máximo una. |
| Movimientos | Sin columnas nuevas. `origen = 'gmail'` para lo importado; `estado = 'por_revisar'` cuando falta categoría o cuenta; `ref_externa = 'gmail:<id del mensaje>'`. |
| Reglas | Se usan: `patron` (texto normalizado), `categoria_id`, `creada_por` (`usuario`), `usos`. |
| **Pendientes** (nueva) | Correos bancarios que ningún lector entendió: `id, gmail_id, fecha, remitente, asunto, resumen, estado (pendiente/descartado)`. |
| Config | Nuevas claves: `importar_desde` (`2026-10-01` por defecto en la primera activación), `lectura_activa` (`si/no`), `lectura_minutos` (5), `etiquetar` (`si` por defecto), `ultima_revision` (fecha-hora), `ultima_revision_info` (texto: correos leídos, creados, duración o error). |

### Migración
`VERSION_ESQUEMA` sube a 2. `migrarEsquema_()` se ejecuta al abrir la app (`estadoInstalacion`) y antes de cada lectura si `Config.version_esquema < 2`:
1. Crea hojas faltantes (Pendientes).
2. Renombra el encabezado `ultimos4` → `numeros` (los valores se conservan).
3. Agrega al final las columnas del esquema que falten en cada hoja (`yape`), con formato texto donde corresponda.
4. Guarda `version_esquema = 2`.

Es idempotente y nunca borra columnas ni datos.

---

## 4. Lectores de correo (`src/parsers/`)

Funciones puras. Entrada: `correo = { id, remitente, asunto, texto, fecha }` donde `texto` es el cuerpo HTML convertido a texto plano (etiquetas quitadas, entidades decodificadas, espacios compactados) y `fecha` es la fecha de recepción del correo. Salida: `null` (no es para este lector) o un **movimiento crudo**:

```
{ tipo, monto, moneda, tc?, fecha, comercio, numero_origen?, numero_destino?, usa_yape?, ref_externa }
```

Remitentes aceptados (comparación exacta, en minúsculas): `notificaciones@notificacionesbcp.com.pe`, `notificaciones@yape.pe`. Cualquier otro remitente se ignora.

| Tipo de correo (asunto / frase clave) | Resultado |
|---|---|
| "Realizaste un consumo con tu Tarjeta de Débito/Crédito BCP" — frase `Realizaste un consumo de S/ 89.30 con tu Tarjeta de … BCP en <COMERCIO>.` + `Número de Tarjeta … ****5202` | gasto, `numero_origen` = últimos 4 de la tarjeta, comercio |
| Igual con `$ 23.60` | gasto en USD (tc = último conocido, se aplica al guardar) |
| Comercio `PLIN-<NOMBRE>` | gasto, comercio = `<NOMBRE>` (sin el prefijo) |
| yape.pe "¡Acabas de yapear exitosamente!" — `Monto de yapeo S/ 11.00`, `Nombre del Beneficiario <NOMBRE>` | gasto, `usa_yape`, comercio = beneficiario |
| "Constancia de recepción de Yapeo" — `Recibiste un yapeo de S/ 200.00 de <NOMBRE>.` | ingreso, `usa_yape`, comercio = remitente |
| "Constancia de Transferencia Entre mis Cuentas" — `Monto transferido S/ 290.26`, `Desde … **** 5303`, `Enviado a … **** 5101` | transferencia 5303 → 5101 |
| "Constancia de Pago de Tarjeta de Crédito Propia" — `Monto pagado $ 105.52`, `Tipo de cambio S/ 3.4770`, `Pagado a VISA … **** 5404`, `Desde … **** 5101` | transferencia 5101 → 5404 en la moneda pagada, con `tc` del correo; actualiza `Config.ultimo_tc` |
| "CONSTANCIA DE PAGO DE SERVICIO" — `Empresa: CLARO`, `Cuenta de origen: … **** 5101`, `Monto total: S/ 24.47` | gasto, comercio = empresa |
| Estado de cuenta, encuestas, publicidad, otros asuntos | `null` → se ignora (no es pendiente) |
| Remitente bancario aceptado + asunto de operación reconocido pero la frase/montos no se pudieron leer | va a **Pendientes** |

Montos: `S/` → PEN, `$` → USD; se aceptan miles con coma (`S/ 3,500.00`). Fecha del movimiento = fecha de recepción del correo en `America/Lima` (los textos del banco usan formatos inconsistentes: "setiembre", "P. M.", mayúsculas).

---

## 5. Del movimiento crudo al movimiento guardado (`src/ingesta/`)

`resolverMovimiento_(crudo, ctx)` (puro), `ctx = { cuentas, categorias, reglas, tcUsd }`:
1. **Cuenta:** `numero_origen` → cuenta activa cuyo `numeros` lo contiene; `usa_yape` → cuenta con `yape = true`. Transferencias: también `numero_destino`. Si no se encuentra → `cuenta_id = ''` y `por_revisar`.
2. **Categoría** (gasto/ingreso): primera regla cuyo `patron` está contenido en `normalizarTexto_(comercio)` (la más larga gana si hay varias) → `confirmado`; sin regla → `categoria_id = ''`, `por_revisar`.
3. **Moneda:** `tc` del correo si lo trae; si no, `tcUsd`. `monto_pen` calculado. Sin tc para USD → `por_revisar` con aviso.
4. Transferencia con ambas cuentas encontradas → `confirmado`; si falta alguna → `por_revisar`.

`guardarDesdeCorreo_` guarda sin pasar por la validación estricta de `normalizarMovimiento_` (que exige cuenta y categoría), pero valida tipo, fecha, monto y moneda.

---

## 6. Lectura automática

- **Permiso:** `https://www.googleapis.com/auth/gmail.modify` mediante el servicio avanzado de Gmail (API Gmail v1), declarado en `appsscript.json` (decisión de Bruno: quiere ver en Gmail qué correos ya entraron). Es el permiso más acotado que permite etiquetar; la app **nunca** borra ni envía correos.
- **Etiqueta:** a cada correo que crea un movimiento o un pendiente se le agrega la etiqueta **`Finanzas/Procesado`** (se crea si no existe). Interruptor en Ajustes (`Config.etiquetar`, activo por defecto). Si etiquetar falla, el movimiento igual se guarda y el error va al Log.
- **Cómo sabe qué ya leyó (fuente de verdad):** `ref_externa = gmail:<id>` en Movimientos y `gmail_id` en Pendientes — no la etiqueta, que es solo ayuda visual (borrarla a mano no duplica nada). Cada vuelta busca desde `max(importar_desde, ultima_revision − 2 horas)` para no releer todo.
- **Consulta:** `from:(notificacionesbcp.com.pe OR yape.pe) after:<fecha>` (excluye spam y papelera por defecto). Por remitente, en cualquier pestaña de Gmail (los correos del BCP llegan casi siempre a Notificaciones).
- **Tandas:** como máximo 50 correos nuevos por vuelta; el resto en la siguiente. Correos ya conocidos se saltan sin descargarlos (se compara el id antes de pedir el cuerpo).
- **Frecuencia:** trigger cada 5 minutos por defecto, configurable en Ajustes: 5, 15, 30, 60 minutos o "solo manual". Consumo estimado: 8–12 de los 90 minutos diarios de tareas automáticas de una cuenta personal; sin costo monetario posible.
- **Bloqueo:** la vuelta corre dentro de `conBloqueo_`; si otra está en curso, la nueva se salta (no espera).
- **Ajustes → Lectura de correos:** activar/desactivar, frecuencia, "Revisar ahora", "Importar correos desde…" (fecha), y la línea de estado: "Última revisión: hace 3 min · 2 correos · 1 nuevo · 1.4 s" o el último error.

---

## 7. Bandeja "Por revisar" y reglas

- **Inicio:** si hay pendientes, una franja arriba: "7 por revisar →".
- **Vista Por revisar** (accesible desde la franja y desde Movimientos):
  - Movimientos `por_revisar`: comercio, monto, cuenta, fecha. Chips con las 6 categorías más usadas del tipo + "Otra…". Si falta cuenta, primero un selector de cuenta.
  - Interruptor **"Recordar para <comercio>"** (activo por defecto): al elegir categoría crea la regla y confirma también los demás pendientes del mismo comercio.
  - Botón **Dividir** por movimiento.
  - Sección **"Correos no leídos"** (hoja Pendientes): asunto, fecha, resumen y enlace a Gmail; acciones "Registrar a mano" (abre el formulario con fecha y monto si se pudieron leer) y "Descartar".
- **Ajustes → Reglas:** lista `patrón → categoría · usos`, con borrar.

API nueva: `obtenerPorRevisar()`, `categorizarMovimiento({id, categoria_id, cuenta_id?, recordar})`, `listarReglas()`, `eliminarRegla(id)`, `descartarPendiente(id)`.

---

## 8. Dividir

- Hoja modal desde la bandeja o desde un movimiento: filas `categoría · monto · ✕`, "+ Agregar categoría", barra de proporción, "Falta asignar"; la última fila se autocompleta con el restante.
- Validación en el núcleo: suma de partes = monto del movimiento (al céntimo), al menos 2 partes, categorías del mismo tipo que el movimiento.
- Guardar: reemplaza las filas de Divisiones del movimiento, marca `dividido = true` y `estado = confirmado`. "Quitar división" borra las filas y desmarca.
- Eliminar un movimiento borra sus divisiones.
- API: `dividirMovimiento({id, partes:[{categoria_id, monto, nota?}]})`, `quitarDivision(id)`, `obtenerDivisiones(id)`.

---

## 9. Movimientos y cuentas (cambios de interfaz)

- Movimientos: icono de origen (📧 correo, ✍️ manual), etiqueta "por revisar", icono ✂️ si está dividido; tocar un dividido abre Dividir.
- Cuentas: campo **"Números de cuenta o tarjeta"** (varios, separados por coma) y casilla **"Yape sale/entra de esta cuenta"**. El asistente usa el mismo campo.

---

## 10. Errores

| Caso | Comportamiento |
|---|---|
| Formato de correo no reconocido | Pendientes ("correo no leído"), con enlace a Gmail. Nunca se pierde. |
| Correo ya procesado | Se salta por `ref_externa` / `gmail_id`. |
| Número de cuenta desconocido | Movimiento `por_revisar` sin cuenta; la bandeja pide la cuenta. |
| Dos vueltas a la vez | La segunda se salta. |
| Error inesperado o cuota de Google | Hoja Log + `ultima_revision_info` visible en Ajustes; los correos no procesados se leen en la siguiente vuelta. Google además envía su correo de resumen de fallas. |
| Remitente distinto a los aceptados | Ignorado (protección contra correos falsos). |

---

## 11. Pruebas

- **Fixtures** en `tests/fixtures/correos/`: un HTML por tipo de correo, copiado de correos reales y **anonimizado** (nombres, números de tarjeta y cuenta, operaciones y montos inventados). Tipos: débito, crédito S/, crédito $, PLIN, yapeo enviado, yapeo recibido, transferencia, pago de tarjeta S/, pago de tarjeta $, pago de servicio, estado de cuenta (→ null), correo de formato roto (→ pendiente).
- `htmlATexto_` probado con esos HTML.
- Lectores: cada fixture → movimiento crudo esperado.
- `resolverMovimiento_`: cuentas por número, Yape, reglas (la más larga gana), tc, faltantes → por revisar.
- Ingesta con Gmail simulado en el arnés: consulta y fecha, tandas de 50, duplicados, pendientes, etiqueta (aplicada, desactivable, falla sin perder el movimiento), salto por bloqueo, registro de error en Log y `ultima_revision_info`.
- Migración v1 → v2: renombre, columnas nuevas, idempotencia, datos intactos.
- Bandeja, reglas y dividir: API en Node + revisión en Chrome con el stub.
- Prueba final con Bruno: activar lectura, importar desde 2026-10-01, revisar la bandeja.

---

## 12. Fuera de alcance de esta fase (se mantiene en la hoja de ruta)

Respaldo con Gemini para correos no reconocidos (fase 4), estado de cuenta VISA (fase 5), notificaciones por Telegram (fase 3), lectores de otros bancos (bajo demanda, vía `docs/agregar-un-banco.md`, que se escribe en esta fase).
