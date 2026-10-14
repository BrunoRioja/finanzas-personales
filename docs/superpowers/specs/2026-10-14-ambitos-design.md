# Ámbitos de gasto — Diseño

- **Fecha:** 2026-10-14
- **Autor:** Bruno Rioja (con Claude)
- **Estado:** Aprobado en brainstorming, pendiente de revisión escrita
- **Spec general:** [2026-10-13-app-finanzas-design.md](2026-10-13-app-finanzas-design.md)
- **Versión objetivo:** v0.8.0 (incluye el fix 0.7.2 de "Guardar" en Por revisar)

---

## 1. Objetivo y criterios de éxito

Distinguir **para qué** se gastó, además de **en qué**. Un taxi de S/ 10 a una fiesta y otro de S/ 10 al trabajo son los dos *Transporte*, pero al analizar se quieren ver separados.

Se resuelve con una segunda dimensión independiente de la categoría: el **ámbito** (Personal, Diversión, Familia, Trabajo). No es un árbol de categorías: así "todo lo de Transporte" sigue siendo una sola categoría y los presupuestos no se parten.

Éxito:
- Cada gasto tiene un ámbito; si no se elige, es **Personal**. Lo ya registrado queda como Personal sin reescribir datos.
- En Por revisar, el formulario y el bot se elige el ámbito con botones, sin un toque obligatorio extra.
- Cada parte de un movimiento dividido puede tener su propio ámbito.
- El Inicio muestra el gasto del mes por ámbito y, al tocar uno, sus categorías. Movimientos filtra por ámbito.
- Los ámbitos se editan en Ajustes (son configurables para cada instalación).

Fuera de alcance: presupuestos y avisos por ámbito, ámbito en el resumen diario o en `/mes`, reglas que recuerden el ámbito, ámbito en ingresos y transferencias, restringir qué categorías valen en qué ámbito.

---

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Modelo | Dimensión aparte (`ambito_id`), no subcategorías. La columna `padre_id` de Categorias sigue sin uso. |
| Por defecto | `ambito_id` vacío = Personal. Nada se migra fila por fila. |
| Alcance por tipo | Solo gastos. Ingresos y transferencias guardan `ambito_id` vacío y no muestran el selector. |
| Filtro categoría ↔ ámbito | No hay: los ámbitos son pocos y se muestran todos, siempre, debajo de las categorías. |
| Editables | Sí, en Ajustes. Personal es fijo (id `personal`): se renombra o cambia de emoji, pero no se desactiva. |
| Divisiones | Cada parte tiene su `ambito_id`; en un movimiento dividido se ignora el del movimiento (como pasa con la categoría). |
| Reglas | Solo recuerdan la categoría; el ámbito depende del momento, no del comercio. |
| Análisis | Bloque "Gasto por ámbito" en el Inicio con detalle por categoría, y filtro en Movimientos. Presupuestos no cambia. |

---

## 3. Datos

Esquema v5 (`VERSION_ESQUEMA = 5`), con migración automática por `migrarEsquema_` (crea la hoja y agrega las columnas al final, sin tocar datos).

Hoja nueva **`Ambitos`**: `id` (texto), `nombre` (texto), `emoji` (texto), `orden` (número), `activo` (booleano).

Valores iniciales (`AMBITOS_BASE` en `src/core/catalogos.js`):

| id | nombre | emoji | orden |
|---|---|---|---|
| `personal` | Personal | 🙋 | 1 |
| nuevo uuid | Diversión | 🎉 | 2 |
| nuevo uuid | Familia | 👨‍👩‍👧 | 3 |
| nuevo uuid | Trabajo | 💼 | 4 |

Columnas nuevas:
- `Movimientos.ambito_id` (texto)
- `Divisiones.ambito_id` (texto)

**Siembra:** si la hoja `Ambitos` está vacía tras migrar, se llena con `AMBITOS_BASE`. Aplica a la migración v4 → v5, a `completarAsistente`, a `cargarDemo` y a `importarHojaAnterior` (si la hoja anterior no traía ámbitos). Si la hoja tiene filas pero falta `personal` (alguien la borró a mano), se vuelve a crear.

**Normalización (`ambitoEfectivo_(id, ambitos)`):** devuelve `personal` si el id está vacío o no existe en la hoja. Todos los cálculos y vistas pasan por ella. Al guardar, un gasto con ámbito `personal` se escribe vacío, para que "vacío = Personal" sea la única representación.

**Validación al guardar** (`crearMovimiento`, `actualizarMovimiento`, `categorizarMovimiento`, `dividirMovimiento`): un `ambito_id` no vacío debe existir en `Ambitos` (activo o no, para poder editar movimientos viejos); si no, error "Ámbito inválido". En ingresos y transferencias se fuerza vacío.

---

## 4. Cálculo (`src/core/agregados.js`, funciones puras)

- `lineasCategoria_` agrega `ambito_id` a cada línea: el de la división si el movimiento está dividido, si no el del movimiento; siempre pasado por `ambitoEfectivo_`.
- `gastoPorAmbito_(lineas, ambitos, categorias, mes)` → lista ordenada por monto desc: `{ ambito_id, nombre, emoji, monto, porcentaje, categorias: [{ categoria_id, nombre, emoji, monto }] }`. Solo gastos del mes (mismas reglas que `gastoPorCategoria_`: respeta divisiones, no resta reembolsos). Omite ámbitos con monto 0.
- `construirDashboard_` agrega `ambitos: gastoPorAmbito_(...)`. `obtenerDashboard` lee la hoja `Ambitos`.

---

## 5. Pantallas

### Por revisar (`vista-revisar.html`)
Debajo de los chips de categoría, una fila "Ámbito" con un chip por ámbito activo, en orden, con Personal marcado. Tocar uno lo marca (exclusivo). Guardar envía `ambito_id` a `categorizarMovimiento`. Ingresos y transferencias no muestran la fila.

### Formulario de movimiento (`vista-movimientos.html`)
Si el tipo es Gasto, la misma fila debajo de las categorías; al editar, marcado el ámbito actual (o un ámbito desactivado si es el que tiene). Cambiar a Ingreso/Transferencia oculta la fila y descarta el valor.

### Dividir (`vista-dividir.html`)
Cada parte tiene un selector de ámbito (chips compactos o `<select>`, el que quepa a 390 px) que arranca en el ámbito del movimiento.

### Movimientos
- Filtro nuevo "Todos los ámbitos" junto a cuenta y categoría (`estado.filtro.ambito_id`). `listarMovimientos` filtra por ámbito efectivo; un movimiento dividido aparece si alguna de sus partes es de ese ámbito.
- En la lista, los gastos cuyo ámbito no es Personal llevan una etiqueta chica "🎉 Diversión". Un dividido con partes de varios ámbitos muestra "Varios ámbitos".

### Inicio (`vista-inicio.html`)
Bloque "Gasto por ámbito" debajo del de categorías: una barra por ámbito con monto y %. Al tocar un ámbito se despliegan sus categorías con su monto. Sin datos del mes no se muestra el bloque.

### Ajustes (`vista-ajustes.html`)
Sección "Ámbitos", con el mismo patrón que Categorías: chips con emoji y nombre, "+ Nuevo", y un modal para editar nombre, emoji y la casilla "Ámbito activo". Personal no muestra la casilla. No hay reordenar: los nuevos van al final (`orden` = máximo + 1). Nombre obligatorio y sin repetir (comparando sin tildes ni mayúsculas). API: `guardarAmbito(datos)`; `obtenerCatalogos` incluye `ambitos`.

### Modo demo
`generarDatosDemo_` asigna ámbitos a algunos gastos (p. ej. Comida fuera y Transporte de fin de semana en Diversión, parte del Supermercado en Familia, algunos taxis en Trabajo) para que el bloque nuevo se vea con datos.

---

## 6. Telegram

### Botones (`src/telegram/acciones.js`, `mensajes.js`)
- El toque de categoría (`c`) guarda como hoy, con ámbito vacío (Personal).
- El mensaje de categorizado muestra "🚕 Transporte · 🙋 Personal" y, además de la fila Recordar / Solo esta vez, una fila con los **otros** ámbitos activos.
- Acción nueva `a:<mov>:<ámbito>` (ids compactados): cambia el ámbito y edita el mensaje con el ámbito nuevo, manteniendo las demás filas. `callback_data` debe seguir bajo 64 bytes; `personal` se compacta como cualquier id.
- Un movimiento dividido no muestra la fila de ámbitos.

### Gasto escrito (`src/telegram/escrito.js`)
- Se agrega la clase de candidato `ambito` (solo para `tipo === 'gasto'`), con los ámbitos activos por nombre normalizado.
- Mismas reglas que cuenta y categoría: primero nombres completos y después prefijos únicos de 4 letras o más. Si un prefijo calza con candidatos de dos clases, no se asigna y queda en la descripción.
- Ejemplos: `taxi 15 diversión`, `taxi 15 dive yape`, `almuerzo 30 trabajo comida`.
- `/ayuda` agrega un ejemplo con ámbito.

---

## 7. Pruebas

Node (`node --test`), con el harness actual:
- Migración v4 → v5: crea `Ambitos` con los 4 iniciales, agrega las columnas y no toca movimientos existentes; una segunda migración no duplica ámbitos; si falta `personal`, se recrea.
- `ambitoEfectivo_`: vacío, `personal`, inexistente → `personal`.
- Guardar: gasto con ámbito válido, inválido (error), `personal` (se guarda vacío), ingreso/transferencia (se fuerza vacío), ámbito desactivado (permitido al editar).
- `gastoPorAmbito_`: movimientos sin ámbito suman en Personal; divisiones con ámbitos distintos; ingresos y transferencias excluidos; detalle por categoría correcto; orden por monto.
- `listarMovimientos` con `ambito_id`, incluido un dividido.
- Ajustes: no se puede desactivar Personal; alta (va al final), edición, nombre repetido o vacío (error) y reactivación.
- Escrito: `taxi 15 diversión`, prefijo `dive`, prefijo ambiguo entre categoría y ámbito (queda en descripción), ingreso que ignora ámbitos.
- Bot: acción `a` cambia el ámbito y edita el mensaje; teclado sin fila de ámbitos en un dividido; `callback_data` ≤ 64 bytes.
- Importar hoja anterior sin `Ambitos`: siembra los iniciales.

Visor (`tests/ui/ver.js`, 390 px): Por revisar, formulario (gasto / ingreso), Dividir, Inicio con el bloque nuevo, Movimientos con filtro y etiqueta, Ajustes → Ámbitos.

---

## 8. Documentación y entrega

- `CHANGELOG.md`: v0.8.0 (Agregado: ámbitos). `VERSION_APP` y `package.json` en 0.8.0.
- `README.md` y `docs/arquitectura.md`: mencionar los ámbitos y la hoja nueva.
- Rama `fase-ambitos`, creada desde `fix-revisar-guardar` (0.7.2, sin merge a `main` todavía porque Bruno lo está probando). Al terminar: merge a `main`, `npm run deploy` y `npm run deploy:plantilla`.
