# Fase 5a · Presupuestos — Diseño

- **Fecha:** 2026-10-13
- **Autor:** Bruno Rioja (con Claude)
- **Estado:** Aprobado en brainstorming, pendiente de revisión escrita
- **Spec general:** [2026-10-13-app-finanzas-design.md](2026-10-13-app-finanzas-design.md) (§1 prioridad 2, §4 Presupuestos, §6 bloque 4, §14 fase 5)
- **Versión objetivo:** v0.5.0

La fase 5 del spec general se divide en tres versiones independientes: **5a presupuestos (v0.5)**, 5b próximos pagos: estado de cuenta VISA, recurrentes y bloque 5 (v0.6), y 5c plantilla pública "Hacer una copia" y pulido del README (v0.7). Este documento cubre solo 5a.

---

## 1. Objetivo y criterios de éxito

Controlar el gasto mensual por categoría: saber en cualquier momento cuánto llevas contra lo planeado y recibir un aviso antes de pasarte.

Éxito:
- En la pestaña Presupuestos se pone un monto a las categorías que se quieren controlar, con el gasto del mes pasado y el promedio de 3 meses como referencia.
- El bloque "Presupuesto del mes" del Inicio muestra, por categoría, gastado vs presupuesto, porcentaje, color de alerta y el ritmo esperado; además el total y lo gastado sin presupuesto.
- Al cruzar el 80 % y el 100 % de una categoría en el mes en curso llega un aviso por Telegram en el momento, una sola vez por umbral.
- Cambiar un presupuesto no altera los meses anteriores.

Fuera de alcance: presupuesto total del mes, presupuesto base cero, arrastre de saldo no gastado entre meses, presupuestos de ingresos, subcategorías.

---

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Estructura | Solo por categoría de gasto. El total es la suma. Lo gastado en categorías sin presupuesto se muestra como "Sin presupuesto". |
| Persistencia entre meses | "Vigente desde": cada fila vale desde su mes hasta que otra más reciente la reemplace. Sin copias mensuales ni triggers. |
| Alertas | Al momento, al cruzar 80 % y 100 %, una vez por umbral, categoría y mes. Solo el mes en curso. |
| Navegación | Pestaña nueva "Presupuestos" entre Movimientos y Cuentas (estaba en el spec general §6). |

---

## 3. Datos

Esquema v3 (`VERSION_ESQUEMA = 3`), con migración automática por `migrarEsquema_` (crea la hoja que falta, sin tocar datos).

Hoja nueva **`Presupuestos`**: `id (texto), categoria_id (texto), monto (numero), desde (texto 'YYYY-MM')`.

- **Presupuesto vigente** de una categoría en el mes M: la fila con el mayor `desde` ≤ M. Si su `monto` es 0 o no hay fila, la categoría no tiene presupuesto en M.
- **Guardar** (`guardarPresupuestos({ montos: { categoria_id: monto } })`), siempre para el mes actual M:
  - Valida que cada categoría exista, esté activa, sea de gasto, y que el monto sea un número ≥ 0 (vacío = 0).
  - Solo procesa las categorías cuyo monto difiere del vigente en M.
  - Si existe una fila con `desde = M` para la categoría, la actualiza; si no, agrega una fila nueva con `desde = M`.
  - Los meses anteriores a M nunca cambian.
  - Ajusta el registro de alertas de esas categorías (ver §6) sin enviar mensajes.

Script Properties: `ALERTAS_PRESUPUESTO` = JSON `{ "YYYY-MM": { categoria_id: 0 | 80 | 100 } }`, solo con el mes en curso (los demás se descartan al escribir).

---

## 4. Cálculo (núcleo, funciones puras en `src/core/presupuestos.js`)

- `presupuestosVigentes_(filas, mes) → { categoria_id: monto }`, sin las categorías con monto 0.
- `presupuestoVsReal_(lineas, vigentes, categorias, mes, hoyIso) →`:
  - `filas`: una por categoría con presupuesto: `{ categoria_id, nombre, emoji, color, gastado, presupuesto, porcentaje, queda, estado, ritmo }`.
    - `gastado`: suma de `monto_pen` de las líneas de gasto de esa categoría en el mes. Las líneas vienen de `lineasCategoria_`: respetan divisiones e incluyen reembolsos negativos. Se redondea con `redondear2_`.
    - `porcentaje`: `Math.round(gastado / presupuesto × 100)`.
    - `queda`: `presupuesto − gastado`, que puede ser negativo.
    - `estado`: `'ok'` (< 80 %), `'alerta'` (80–99 %), `'pasado'` (≥ 100 %).
    - `ritmo`: porcentaje del mes transcurrido. En el mes en curso es `día de hoy / días del mes × 100`; en un mes pasado es 100; en un mes futuro es 0.
  - Orden: porcentaje descendente.
  - `total`: `{ presupuesto, gastado }`, solo de las categorías con presupuesto.
  - `sinPresupuesto`: gasto del mes en categorías sin presupuesto, incluidas las líneas sin categoría (por revisar).
- `referenciaPresupuesto_(lineas, mes) → { categoria_id: { mesPasado, promedio3 } }`: gasto del mes anterior y promedio de los 3 meses anteriores (los meses sin gasto cuentan como 0).

---

## 5. Pantallas

### Pestaña Presupuestos (`src/web/vista-presupuestos.html`)
- Cabecera "Presupuestos" con la nota "Los cambios rigen desde <mes actual en palabras>; los meses anteriores no cambian".
- Total presupuestado, que se recalcula mientras se escribe.
- Una fila por categoría de gasto activa: `emoji nombre` · campo de monto · referencia "mes pasado S/ X · promedio S/ Y".
- Botones:
  - **Usar lo del mes pasado:** llena solo los campos vacíos, redondeando hacia arriba a la decena.
  - **Guardar.**
- API: `obtenerPresupuestos() → { mes, montos: { categoria_id: monto }, referencia, categorias }`, `guardarPresupuestos(datos)`.

### Bloque 4 del Inicio: "Presupuesto del mes"
- Debajo de los indicadores del mes. Usa el mes elegido en la cabecera.
- Filas compactas, con el mismo estilo que "Gasto por categoría": `emoji nombre · barra · S/ gastado de S/ presupuesto · %`.
  - Color de la barra: positivo si `ok`, alerta si `alerta`, negativo si `pasado` (tokens de DESIGN.md).
  - El ritmo se dibuja como una marca vertical fina sobre la barra.
- Pie: "Total: S/ X de S/ Y" y "Sin presupuesto: S/ Z".
- Clic en una fila → Movimientos filtrado por categoría y mes.
- Sin presupuestos: tarjeta "Define tus presupuestos" con un botón a la pestaña.
- `obtenerDashboard(mes)` agrega `presupuesto` (el resultado de `presupuestoVsReal_`).

### Telegram
- `/mes` agrega al final, si hay categorías en `alerta` o `pasado`:
  ```
  <b>Presupuestos</b>
  • 🍽️ Comida fuera 81 % · quedan S/ 75
  • 🛒 Supermercado 104 % · pasado por S/ 24
  ```

### Modo demo
- `generarDatosDemo_` agrega presupuestos para unas 6 categorías, con algunas en alerta y una pasada en el mes actual.

### Navegación
- "Presupuestos" en la barra superior (laptop) y en la inferior (celular, 5 íconos), entre Movimientos y Cuentas.

---

## 6. Alertas (`src/telegram/presupuestos.js`)

`revisarPresupuestos_()`:
- Se ejecuta fuera de `conBloqueo_`, después de escribir. Nunca lanza: los errores quedan en el Log con nivel `aviso`.
- No hace nada en modo demo ni si el bot no está vinculado.
- Calcula `presupuestoVsReal_` del mes en curso y, para cada categoría, el umbral alcanzado: 0, 80 o 100.
- Si el umbral es mayor que el registrado en `ALERTAS_PRESUPUESTO[mes][categoria]`, la categoría entra en el aviso.
- Envía un solo mensaje con todas las categorías nuevas. Solo si el envío funciona, guarda los umbrales en el registro.

Mensajes:
- 80 %: `⚠️ 🍽️ Comida fuera: S/ 325 de S/ 400 (81 %). Te quedan S/ 75 para 18 días.` Los días que quedan cuentan el día de hoy.
- 100 %: `🚨 🍽️ Comida fuera: S/ 412 de S/ 400 (103 %). Te pasaste por S/ 12.`
- Si son varias, una línea por categoría en el mismo mensaje. Botón [Abrir la app].

Dónde se llama:
- al final de `revisarCorreos` (después de `avisarPorRevisar_`);
- al final de `manejarEscrito_`;
- después de categorizar o cambiar categoría desde un botón (`elegirCategoria_`, `recordarDesdeBot_`);
- desde la app: `guardarMovimiento`, `categorizarMovimiento`, `dividirMovimiento`, `quitarDivision` y `eliminarMovimiento`.

Si el movimiento tocado no es del mes en curso, no se llama. En `revisarCorreos` se llama siempre, porque el cálculo ya es del mes en curso.

Al guardar presupuestos:
- El registro de cada categoría cambiada pasa a ser el umbral que alcanza hoy con el monto nuevo, sin enviar nada.
- Al subir el presupuesto, el umbral baja y el aviso vuelve a armarse.
- Al bajarlo por debajo de lo gastado, el umbral queda en 100 y no se avisa.

---

## 7. Pruebas

- `presupuestos` (núcleo):
  - vigente por mes, con un cambio a mitad del año y una baja con 0;
  - gasto con divisiones, reembolsos y USD;
  - sin presupuesto, incluidas las líneas sin categoría;
  - estados en los bordes 79/80/99/100;
  - ritmo del mes en curso, pasado y futuro;
  - orden;
  - referencia del mes pasado y promedio de 3 meses.
- `api-presupuestos`:
  - guardar crea una fila nueva o actualiza la del mismo mes;
  - los meses pasados no cambian;
  - validaciones (categoría de ingreso, inactiva, negativa, no numérica);
  - vacío = 0 quita el presupuesto;
  - `obtenerDashboard` incluye el bloque.
- `migracion`: v2 → v3 crea `Presupuestos` sin tocar datos y fija `version_esquema = 3`.
- `telegram-presupuestos`:
  - una sola vez por umbral;
  - 80 y 100 en un mismo cambio;
  - varias categorías en un solo mensaje;
  - subir el presupuesto vuelve a armar el aviso; bajarlo no avisa;
  - mes nuevo desde cero;
  - Telegram caído deja el umbral pendiente;
  - un movimiento de un mes pasado no avisa;
  - modo demo y bot sin vincular no avisan;
  - el aviso se dispara desde `revisarCorreos`, un gasto escrito y `guardarMovimiento`.
- `/mes` incluye la sección de presupuestos.
- UI: la pestaña y el bloque a 390 px y 1280 px, con datos y sin presupuestos.

---

## 8. Documentación y entrega

- `README.md`: "Qué hace hoy (v0.5)" con presupuestos; la hoja de ruta se reparte en v0.5/v0.6/v0.7 según este documento.
- `docs/arquitectura.md`: hoja Presupuestos y "vigente desde".
- `CHANGELOG.md` 0.5.0 y `package.json` 0.5.0. No hay permisos nuevos.
