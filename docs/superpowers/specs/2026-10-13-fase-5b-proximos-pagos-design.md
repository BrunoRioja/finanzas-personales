# Fase 5b · Próximos pagos — Diseño

- **Fecha:** 2026-10-13
- **Autor:** Bruno Rioja (con Claude)
- **Estado:** Aprobado en brainstorming, pendiente de revisión escrita
- **Spec general:** [2026-10-13-app-finanzas-design.md](2026-10-13-app-finanzas-design.md) (§4 Recurrentes, §6 bloque 5, §7 estado de cuenta VISA, §14 fase 5)
- **Versión objetivo:** v0.6.0

Segunda de las tres versiones en que se dividió la fase 5: 5a presupuestos (v0.5, publicada), **5b próximos pagos (v0.6)** y 5c plantilla pública y pulido del README (v0.7).

---

## 1. Objetivo y criterios de éxito

Que no se pase ningún pago y saber cuánto dinero ya está comprometido en los próximos días.

Éxito:
- Al llegar el correo "Estado de Cuenta de tu Tarjeta VISA" del BCP, la app guarda el total, el mínimo (en S/ y en $) y el último día de pago, y avisa por Telegram.
- Los pagos de tarjeta registrados después marcan cada moneda como pagada, con el mínimo cubierto o pendiente.
- En la pestaña Presupuestos se registran los pagos fijos (recurrentes) con monto, moneda, día del mes, cuenta y categoría.
- El bloque "Próximos pagos" del Inicio y el comando `/pagos` muestran los pagos de los próximos 30 días ordenados por fecha.
- El bot recuerda cada pago 3 días antes y el mismo día, a las 8:00.

Fuera de alcance:
- Recurrentes que crean movimientos solos.
- Estados de cuenta de otros bancos.
- Leer el PDF adjunto.
- Cuotas o compras en cuotas.
- Pagos anuales o con otra frecuencia que no sea mensual.

---

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Recurrentes | Solo recuerdan; no crean movimientos. El gasto real entra por el correo del banco o se registra a mano (p. ej. Google AI Pro, pagado con el débito de Interbank, que no envía correos). |
| Recordatorios | 3 días antes y el mismo día, en un solo mensaje a las 8:00. |
| Tarjeta pagada | Por moneda: los pagos en S/ se comparan con el total en S/ y los pagos en $ con el total en $. |
| Dónde se editan los recurrentes | Sección "Pagos fijos" en la pestaña Presupuestos. |

---

## 3. Datos

Esquema v4 (`VERSION_ESQUEMA = 4`), con migración automática por `migrarEsquema_`: crea las hojas que faltan sin tocar los datos.

**`Recurrentes`**
- Columnas: `id (texto), nombre (texto), monto (numero), moneda (texto PEN|USD), cuenta_id (texto), categoria_id (texto), dia_mes (numero 1–31), activo (booleano)`.
- Si el mes tiene menos días que `dia_mes`, el pago cae el último día del mes.

**`EstadosCuenta`**
- Columnas: `id (texto), cuenta_id (texto), emitido (fecha), total_pen (numero), total_usd (numero), minimo_pen (numero), minimo_usd (numero), fecha_limite (fecha), ref_externa (texto 'gmail:<id>')`.
- `emitido` es la fecha del correo.
- `ref_externa` evita guardar dos veces el mismo correo.

Script Properties:
- `PAGOS_RECORDADOS` = JSON `{ "YYYY-MM-DD": ["clave", …] }`, con lo ya recordado cada día. Se guardan solo los últimos 7 días.
- Clave de un recurrente: `rec:<id>:<fecha de vencimiento>`. Clave de la tarjeta: `ec:<id>:<fecha de vencimiento>`.

---

## 4. Lectura del estado de cuenta

El dominio `notificacionesbcp.com.pe` ya está en `REMITENTES_BANCARIOS`, así que no cambia la búsqueda de correos.

Lector nuevo `leerEstadoCuentaBcp_(correo)` en `src/parsers/bcp-estado-cuenta.js`, registrado en `lectoresDeCorreo_`:

- **Qué correos toma:** remitente `estadodecuenta@notificacionesbcp.com.pe` y asunto que contiene "Estado de Cuenta de tu Tarjeta".
- **Qué extrae del texto:**
  - `Pago total del mes:` seguido de dos montos: el primero en S/ y el segundo en $.
  - `Pago mínimo del mes:` seguido de dos montos, en el mismo orden.
  - `Último día de pago: dd/mm/aaaa`.
  - Los montos pueden traer coma de miles.
- **Qué devuelve:**
  - Si lo entiende: `{ estadoCuenta: { emitido, total_pen, total_usd, minimo_pen, minimo_usd, fecha_limite, ref_externa } }`.
  - Si el asunto coincide pero faltan datos: `{ pendiente: 'No se pudo leer el estado de cuenta.' }`, y el correo va a la bandeja "Por revisar" con su enlace.
  - Otros correos del mismo remitente ("Información de tu Crédito", etc.): `null`, que se ignora como hoy.

Al guardar (`guardarLeidos_`, dentro del bloqueo):
- **Tarjeta:** el estado de cuenta se asigna a la primera cuenta activa con `tipo = 'credito'` y `banco = 'BCP'`.
  - Si hay más de una, se usa la primera y se registra un `aviso` en el Log.
  - Si no hay ninguna, el correo va a "Por revisar" ("No hay una tarjeta de crédito BCP registrada").
- **Qué se escribe:** una fila en `EstadosCuenta`, y el correo se etiqueta como procesado. No crea movimientos.
- **Aviso:** fuera del bloqueo, después de guardar, se envía un mensaje de Telegram por cada estado de cuenta nuevo:

  `💳 Llegó tu estado de cuenta VISA: S/ 959.74 + $ 105.52 · mínimo S/ 819.74 + $ 10.00 · vence el 20/10.`

  - Se omiten las monedas con total 0.
  - El nombre es el de la cuenta.

---

## 5. Cálculo (funciones puras en `src/core/pagos.js`)

**`estadoTarjeta_(ec, estados, movimientos)`**
- **Qué cuenta como pago:** las transferencias con `cuenta_destino_id = ec.cuenta_id`, sumadas por `moneda`, sin importar si están confirmadas o por revisar (el pago ya ocurrió).
  - Cuentan desde el día siguiente al `fecha_limite` del estado de cuenta anterior de la misma tarjeta. Sin anterior, desde 5 días antes de `emitido` (el vencimiento anterior suele caer una semana antes del correo).
  - No se cuenta desde `emitido` porque es común pagar desde la app del banco antes de que llegue el correo del estado de cuenta.
- **Devuelve:** `{ pen: { total, minimo, pagado, falta, estado }, usd: {…} }`. Una moneda con total 0 vale `null`.
- **Estado de cada moneda:**
  - `pagado`: lo pagado ≥ total.
  - `minimo`: lo pagado ≥ mínimo.
  - `pendiente`: lo pagado < mínimo.

**`fechaRecurrente_(dia_mes, hoyIso)`**
- Devuelve la próxima fecha ≥ hoy: este mes si el día aún no pasó; si no, el mes siguiente.
- Ajusta al último día cuando el mes es más corto.

**`proximosPagos_({ recurrentes, estados, cuentas, categorias, movimientos, tcUsd }, hoyIso)`**
- **Recurrentes:** los activos cuya próxima fecha cae en `[hoy, hoy + 30 días]`.
  - Forma: `{ tipo: 'recurrente', id, nombre, emoji, fecha, dias, monto, moneda, cuenta }`.
- **Tarjeta:** el último estado de cuenta por tarjeta (el de mayor `emitido`), si cumple una de estas condiciones:
  - falta pagar algo de alguna moneda;
  - todo está pagado pero `fecha_limite ≥ hoy` (se muestra atenuado).
  - Forma: `{ tipo: 'tarjeta', id, nombre, fecha: fecha_limite, dias, pen, usd, vencido }`.
  - `vencido` es verdadero si `fecha_limite < hoy` y alguna moneda sigue `pendiente`. La tarjeta vencida sigue en la lista, aunque su fecha sea anterior a hoy.
- **`dias`:** días desde hoy hasta la fecha. Es negativo si está vencido.
- **Orden:** por fecha ascendente.
- **Devuelve:** `{ pagos: [...], porPagar }`.
  - `porPagar`: suma en S/ de lo pendiente. Cuenta los recurrentes y el `falta` de cada moneda de la tarjeta; los dólares se convierten con `tc` (último tipo de cambio) y se redondea con `redondear2_`.

---

## 6. Pantallas

### Bloque 5 del Inicio: "Próximos pagos"
- **Posición:** debajo de "Presupuesto del mes".
- **Visibilidad:** solo si el mes elegido en la cabecera es el actual.
- **Filas compactas:** `emoji nombre · fecha · monto · estado`.
  - La fecha se muestra como "hoy", "mañana" o "vie 17/10".
  - Una fila con `dias ≤ 3` usa el color de alerta.
  - Vencido usa el color negativo.
  - Una tarjeta ya pagada se ve atenuada con ✓.
- **Tarjeta:** muestra cada moneda con su estado, por ejemplo `S/ 959.74 ✓ · $ 105.52 mínimo cubierto`.
- **Pie:** "Por pagar en 30 días: S/ X".
- **Sin recurrentes ni estado de cuenta:** se muestra la tarjeta "Agrega tus pagos fijos" con un botón a la pestaña Presupuestos.
- **Datos:** `obtenerDashboard(mes)` agrega `proximosPagos` (el resultado de `proximosPagos_`) solo para el mes actual.

### Pestaña Presupuestos: sección "Pagos fijos"
- **Posición:** debajo de los presupuestos por categoría.
- **Filas:** `emoji nombre · S/ monto · día N · cuenta`, con un interruptor de activo. Las inactivas se ven atenuadas.
- **Agregar o editar:**
  - Tocar una fila o "+ Agregar pago fijo" abre un formulario con nombre, monto, moneda, día (1–31), cuenta y categoría (solo de gasto).
  - Eliminar pide confirmación dentro de la app, sin `confirm()`.
- **Pie:** "Pagos fijos al mes: S/ X", con solo los activos y los dólares convertidos con el último tipo de cambio.
- **API:**
  - `obtenerRecurrentes() → { recurrentes, cuentas, categorias, tc }`.
  - `guardarRecurrente(datos)`: crea o actualiza.
  - `eliminarRecurrente(id)`.
  - Validaciones:
    - el nombre no puede estar vacío;
    - el monto debe ser mayor que 0, leído con `leerMontoTexto_`;
    - la moneda debe ser PEN o USD;
    - el día debe ser un entero de 1 a 31;
    - la cuenta debe existir y estar activa;
    - la categoría debe ser de gasto y estar activa.

### Telegram
- **`/pagos`:** la misma lista que el bloque, una línea por pago, con "Por pagar en 30 días" al final.
- **Sin pagos:** "No tienes pagos en los próximos 30 días."
- **Ayuda:** se agrega a `/ayuda`.

### Modo demo
`generarDatosDemo_` agrega:
- 4 recurrentes ficticios: streaming, gimnasio, plan de celular y una suscripción en USD.
- Un estado de cuenta de la tarjeta demo, con la parte en S/ pagada y la de $ pendiente.

---

## 7. Recordatorios (`src/telegram/pagos.js`)

**`recordarPagos()`**
- **Cuándo corre:** con un trigger diario a las 8:00.
- **Instalación del trigger:**
  - `configurarRecordatorioPagos_()` lo instala al vincular el bot, junto al resumen.
  - Al abrir la app (`estadoInstalacion`, que solo corre en la app principal), si el bot está conectado y falta el trigger, se instala. Cubre la actualización desde v0.5 y un trigger borrado a mano.
  - Al desvincular el bot, se borra.
- **Qué hace:**
  - No hace nada en modo demo ni si el bot no está vinculado.
  - Calcula `proximosPagos_` de hoy y toma los pagos con `dias === 0` o `dias === 3`.
  - Una tarjeta entra solo si alguna moneda no está `pagado`, y solo se nombran las monedas que faltan.
  - Descarta las claves ya guardadas en `PAGOS_RECORDADOS`.
  - Si queda algo, envía un solo mensaje. Solo si el envío funciona, guarda las claves.
- **Errores:** no lanza; los errores van al Log como `aviso`.

Mensaje:
```
📅 Pagos por venir
Hoy
• 🎵 Spotify · S/ 20.90 · Débito BCP
En 3 días (jue 23/10)
• 💳 VISA · falta $ 105.52 (mínimo $ 10.00)
```

Un estado de cuenta que llega con menos de 3 días de margen no recibe el aviso de 3 días: el mensaje de llegada lo reemplaza.

---

## 8. Pruebas

- **`parsers` (estado de cuenta):**
  - El formato real, con una muestra ficticia: montos inventados y nombre genérico.
  - Montos con coma de miles.
  - Asunto de otro tipo, que devuelve `null`.
  - Formato roto, que devuelve `pendiente`.
- **Ingesta:**
  - Guarda la fila en `EstadosCuenta` sin crear movimientos.
  - No duplica el mismo correo.
  - Sin tarjeta BCP, el correo va a "Por revisar".
  - Con dos tarjetas, usa la primera y deja un aviso en el Log.
  - Envía el aviso de llegada.
- **`pagos` (núcleo):**
  - `fechaRecurrente_` con el día 31 en un mes de 30 días, febrero, un día que ya pasó y el día de hoy.
  - Los estados `pagado`, `minimo`, `pendiente` y `vencido`.
  - Un pago en $ que solo cuenta para la parte en $.
  - Sin estado anterior, un pago de más de 5 días antes de `emitido` no cuenta; con anterior, cuentan desde el día siguiente a su vencimiento.
  - La tarjeta pagada que desaparece después de la fecha límite.
  - El estado de cuenta anterior que se reemplaza por el nuevo.
  - La ventana de 30 días, el orden y `porPagar` con dólares.
- **`api-recurrentes`:** crear, editar, activar y desactivar, eliminar, y cada validación.
- **`telegram-pagos`:**
  - Recuerda 3 días antes y el mismo día, todo en un solo mensaje.
  - No repite un recordatorio.
  - La tarjeta pagada no se recuerda.
  - Solo nombra la moneda que falta.
  - Telegram caído deja el recordatorio pendiente.
  - En modo demo y con el bot sin vincular no envía nada.
  - `/pagos` con datos y sin datos.
  - El trigger se instala al vincular y se borra al desvincular.
- **`migracion`:** de v3 a v4 crea `Recurrentes` y `EstadosCuenta` sin tocar los datos.
- **`demo`:** incluye los recurrentes y el estado de cuenta.
- **Interfaz:** el bloque y la sección a 390 px y 1280 px, con datos y vacíos.

---

## 9. Documentación y entrega

- `README.md`: "Qué hace hoy (v0.6)" con próximos pagos; en la hoja de ruta, v0.6 ✅.
- `docs/arquitectura.md`: las hojas `Recurrentes` y `EstadosCuenta`, y el trigger `recordarPagos`.
- `CHANGELOG.md` 0.6.0 y `package.json` 0.6.0. No hay permisos nuevos.
