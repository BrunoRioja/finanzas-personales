# Préstamos, descripción desde el bot y guía para otros bancos — Diseño

- **Fecha:** 2026-10-16
- **Autor:** Bruno Rioja (con Claude)
- **Estado:** Aprobado en brainstorming, pendiente de revisión escrita
- **Spec general:** [2026-10-13-app-finanzas-design.md](2026-10-13-app-finanzas-design.md)
- **Versión objetivo:** v0.9.0 (esquema 5 → 6)

Tres cambios independientes que salen del uso real de la app. Se publican juntos.

---

## 1. Préstamos a familia y amigos

### 1.1 Por qué

Bruno presta montos chicos (hasta unos S/ 350) a familia y amigos cercanos. No cobra intereses: es un apoyo, no un negocio. Se lo devuelven a los pocos días o cuando pueden, a veces en partes. Hoy lo lleva de memoria.

Además, los números salen mal. El yapeo del préstamo entra como **gasto** (categoría "Préstamos", que creó él) y la devolución como **ingreso** (categoría "Reembolsos"). Prestar S/ 200 infla los gastos del mes, y la devolución infla los ingresos y la tasa de ahorro.

El mismo problema aparece con los gastos compartidos. Si paga una cena de S/ 120 y un amigo le yapea S/ 40, hoy "Comida fuera" queda en S/ 120 y hay S/ 40 de ingreso. Lo real es S/ 80 de gasto y nada de ingreso.

### 1.2 Éxito

- Prestar y que te devuelvan **no cambia** gastos, ingresos, tasa de ahorro, tendencia ni presupuestos. Sí cambia los saldos de las cuentas, porque la plata salió y volvió.
- Un reembolso de un gasto compartido **resta** del gasto de la categoría elegida.
- Bruno ve quién le debe, cuánto le falta y para cuándo quedó. Anota abonos parciales y marca un préstamo como pagado.
- El bot recuerda un día antes y el mismo día de la fecha prometida.
- Casi todo pasa desde el aviso del bot que ya existe, sin pantallas nuevas. Lo único manual es lo poco que se devuelve en efectivo.

Fuera de alcance: intereses, cuotas fijas, préstamos que Bruno **recibe** (deber él), préstamos en USD, avisos al deudor, borrar el historial.

### 1.3 Las categorías marcan el comportamiento, no el nombre

Las categorías ganan un **rol** opcional. No se usa el nombre, porque "Préstamos" no viene por defecto y cada persona puede renombrar sus categorías.

| Rol | Tipo de categoría | Efecto |
|---|---|---|
| `prestamo` | gasto | Lo categorizado aquí es un préstamo dado: no cuenta como gasto y crea una línea de préstamo. |
| `reembolso` | ingreso | Lo categorizado aquí pregunta "¿de qué?": un préstamo pendiente (abono) o una categoría de gasto (resta de ese gasto). No cuenta como ingreso. |
| (vacío) | cualquiera | Como hoy. |

- En la edición de categorías (Ajustes) hay una casilla según el tipo: "Es préstamo" en las de gasto y "Es devolución / reembolso" en las de ingreso. Como máximo **una** categoría activa por rol.
- **Migración a esquema 6:** "Reembolsos" (ingreso) recibe el rol `reembolso` si existe. Una categoría de gasto que se llame "Préstamo(s)" (sin importar mayúsculas ni tildes) recibe `prestamo`. Si no existe, se crea "Préstamos 🤝" de gasto con ese rol. Las instalaciones nuevas la traen en las categorías por defecto.
- **Lo ya registrado antes de la v0.9** en esas categorías deja de contar como gasto o ingreso, aunque no tenga una línea de préstamo. No se crean líneas hacia atrás. *Decisión de Claude:* es lo coherente con la regla y evita inventar préstamos viejos que quizá ya se pagaron.

### 1.4 Datos nuevos

Hojas nuevas (los nombres de columnas quedan a criterio del builder, siguiendo el estilo del esquema):

- **Prestamos:** id, persona, monto (PEN), fecha (cuando se prestó), fecha_promesa (puede ir vacía), movimiento_id (el yapeo de origen, vacío si se anotó a mano), estado (`pendiente` | `pagado`), nota, creado_en.
- **Abonos:** id, prestamo_id, fecha, monto, movimiento_id (vacío si fue en efectivo).

Lo que falta = monto − suma de abonos. Llega a 0 → `pagado` solo. "Ya me pagó todo" crea el abono por lo que falta (en efectivo, sin movimiento) y lo marca `pagado`. Nada se borra: un préstamo pagado pasa al historial.

### 1.5 Cómo se cuenta (agregados)

- Un **gasto** en una categoría con rol `prestamo` no entra en gastos del mes, gasto por categoría, gasto por ámbito, tendencia, presupuestos ni proyección.
- Un **ingreso** en una categoría con rol `reembolso` no entra en ingresos ni en la tasa de ahorro.
- Un **reembolso de un gasto compartido** se guarda como **gasto con monto negativo** en la categoría elegida. El modelo ya lo permite (`movimientos.js`: "Solo un gasto (reembolso) puede tener monto negativo"). Así resta de esa categoría, de su presupuesto y del total de gastos. El saldo de la cuenta sube igual que con un ingreso. Conserva el comercio original del correo (el nombre de quien yapeó).
- Saldos por cuenta: sin cambios. Todo movimiento sigue moviendo su cuenta.
- Topes: el gasto de una categoría en un mes no se muestra por debajo de 0 en las barras. Ojo con el menor diferido de 5a ("categoría solo con reembolsos dibuja barra llena"), que aquí deja de ser raro y **se arregla**.

### 1.6 Flujo en el bot

**Prestar.** Llega el yapeo y el bot pregunta la categoría como siempre. Se elige la de rol `prestamo`.
1. Se categoriza y se crea el préstamo: persona = comercio del movimiento (el nombre que trae el correo de Yape), monto = monto_pen, fecha = fecha del movimiento.
2. El mensaje se edita: "🤝 Préstamo a Juan Pérez · S/ 200. ¿Para cuándo te lo devuelve?" con los botones **Mañana · Esta semana (domingo) · Fin de quincena (15 o último día del mes) · Fin de mes · Sin fecha**.
3. Al elegir, el mensaje queda "🤝 Préstamo a Juan Pérez · S/ 200 · vuelve el vie 23/10". La fecha exacta se cambia en la web.
- No se ofrece "¿Recordar para Juan Pérez?". Recordar préstamos como regla automática no tiene sentido: a la misma persona se le yapea por otras cosas.
- Si el movimiento cambia después de categoría o se deshace, el préstamo vinculado **se borra si no tiene abonos**. Con abonos, el cambio se rechaza con un mensaje claro.

**Te devuelven / te reembolsan.** Llega un ingreso y se elige la categoría de rol `reembolso`. El mensaje se edita a "¿De qué es este reembolso?" con botones:
1. Primero, los préstamos **pendientes** de la misma persona (comparación normalizada del comercio con la persona): "🤝 Préstamo de Juan Pérez (faltan S/ 200)". Después, los demás pendientes, como máximo 4 en total, más recientes primero.
2. Luego, las categorías de gasto frecuentes (las mismas que ya usa el bot) y "Otras categorías".
3. **Préstamo elegido:** se crea el abono por el monto del movimiento (si pasa lo que falta, se registra igual y el préstamo queda pagado; *decisión de Claude:* no se bloquea por centavos de más). El movimiento queda ingreso en la categoría `reembolso`. Mensaje: "✓ Abono de Juan Pérez · faltan S/ 150" o "✓ Juan Pérez te pagó todo 🎉".
4. **Categoría de gasto elegida:** el movimiento pasa a `tipo: gasto`, `monto` negativo, en esa categoría. Mensaje: "✓ Reembolso de Comida fuera · −S/ 40".
- Sin "¿Recordar?" en reembolsos, por la misma razón.
- Ámbito: un reembolso convertido en gasto negativo muestra los botones de ámbito como cualquier gasto, para que reste del ámbito correcto.

**Recordatorios.** Igual que los de pagos (trigger de las 8:00, `recordarPagos`): un día antes, "🤝 Mañana Juan Pérez quedó en devolverte S/ 150", y el mismo día, "🤝 Hoy …". Solo pendientes con fecha. Usa el mismo registro de "ya avisado" para no repetir, y van en el mismo mensaje que los pagos si coinciden.

**/prestamos:** lista de pendientes con lo que falta y la fecha prometida (vencidos primero, marcados), y el total "Te deben S/ 350". Se agrega a `/ayuda`.

### 1.7 Web

**Presupuestos → sección "Préstamos"**, debajo de lo que ya hay:
- Total "Te deben S/ X" y una fila por pendiente: persona, falta / monto, fecha prometida (resaltada si ya pasó).
- Al tocar una fila: abonos con fecha, **Registrar abono** (monto y fecha; en efectivo, sin movimiento), **Ya me pagó todo**, cambiar fecha prometida, persona y nota.
- **Nuevo préstamo** a mano (persona, monto, fecha, fecha prometida). Es para el caso raro sin yapeo: no crea movimiento.
- "Pagados" plegado con el historial.

**Inicio:** una tarjeta "Te deben S/ X" con hasta 3 personas (vencidos primero) y un enlace a la sección. Si no hay pendientes, no aparece.

**Por revisar y formulario de movimiento:** el mismo comportamiento que el bot. Elegir la categoría `prestamo` crea el préstamo (la fecha prometida se puede dejar vacía y completar luego). Elegir la categoría `reembolso` muestra el mismo selector "¿de qué?" antes de guardar.

**Movimientos:** un préstamo y un abono muestran un distintivo 🤝. Un reembolso de gasto se ve como monto negativo en su categoría.

### 1.8 Casos límite (decisiones de Claude tras la revisión)

- **Reglas "Recordar" y roles.** Una regla cuya categoría tiene rol `prestamo` o `reembolso` **se ignora** al leer correos: el movimiento queda en Por revisar para que pase por el flujo (fecha prometida o "¿de qué?"). Las reglas no se borran en la migración, porque si se quita el rol vuelven a funcionar. La web y el bot no ofrecen crear reglas hacia esas categorías. En Ajustes → Reglas, las afectadas se ven marcadas como "en pausa (préstamos)".
- **Cambiar o borrar el movimiento de un abono** (cambiar de categoría, borrarlo en la web o con /deshacer): se borra el abono y el préstamo vuelve a calcular lo que falta. Si estaba `pagado` y ahora falta algo, vuelve a `pendiente`. Es el espejo de lo que pasa con el préstamo, pero aquí no se rechaza: un abono equivocado se tiene que poder corregir.
- **Cambiar o borrar el movimiento de un préstamo:** si el préstamo no tiene abonos, se borra. Si tiene, el cambio se rechaza con "Este préstamo ya tiene abonos: bórralos primero en Préstamos".
- **Un reembolso convertido en gasto negativo** es un gasto más. Si se cambia a otra categoría de gasto, sigue negativo. Si se pasa a una de ingreso, vuelve a ser ingreso positivo (y con la categoría `reembolso`, pregunta "¿de qué?" otra vez).
- **Dividir:** no se permite que una parte sea de una categoría con rol `prestamo` o `reembolso`, ni dividir un gasto negativo. Es una validación en `divisiones.js`. El caso "S/ 300 = 200 de préstamo + 100 de comida" es raro y se resuelve con dos registros.
- **Editar en la web el yapeo de un préstamo o de un abono:** monto y fecha se **sincronizan** al préstamo o al abono (se guardan como copia, para que los abonos en efectivo y los préstamos manuales funcionen igual). Bajar el monto de un préstamo por debajo de lo ya abonado se rechaza. Cambiar el comercio **no** cambia la persona del préstamo, que se edita en la sección Préstamos.

### 1.9 Demo

La hoja demo incluye 2 préstamos (uno con abono parcial y otro vencido) y un reembolso de cena, para que la sección y la tarjeta se vean.

---

## 2. Cambiar la descripción desde el bot

### 2.1 Por qué

Lo que lee el correo es el **comercio**: "TOTTUS", el nombre de quien yapeó. Bruno quiere poner su propia descripción ("compras de la semana", "pasaje de mamá") sin abrir la web.

### 2.2 Decisiones

- Se edita la columna `descripcion`, que ya existe. **El comercio no se toca**, porque las reglas de "Recordar" y los préstamos dependen de él.
- Dónde se muestra: si hay descripción, va como título y el comercio va debajo, más tenue. Aplica en los mensajes del bot, los resúmenes (/hoy, /mes, diario), la lista de Movimientos y Por revisar. Hoy el bot muestra `comercio || descripcion`. Se invierte la prioridad solo cuando la descripción fue puesta por la persona. *Decisión de Claude:* las descripciones automáticas del lector ("Pago de tarjeta", "Falta el tipo de cambio de USD") se siguen viendo como hoy. El builder elige cómo distinguirlas (p. ej. que esos textos fijos no cuenten como descripción propia).
- **Botón "✏️ Descripción"** en los avisos de movimientos (por revisar y ya categorizados) y en los registrados por el bot. Al tocarlo, el bot envía "Escribe la descripción para S/ 45.90 · TOTTUS" con `force_reply`.
- **Responder** (reply) a cualquier mensaje del bot que corresponda a un movimiento, sea el aviso original o el pedido del botón, con un texto: ese texto pasa a ser la descripción. Sirve también para mensajes viejos.
- Tras guardar, el aviso original se edita para mostrar la descripción nueva y conserva sus botones. El bot confirma brevemente: "✓ Descripción guardada".
- Un mensaje **que no es respuesta** sigue funcionando como hoy (registrar un gasto escrito, comandos). No se adivina intención.
- Respuesta vacía o solo espacios: borra la descripción. Largo máximo: 100 caracteres (se recorta).
- Para saber a qué movimiento corresponde una respuesta se necesita guardar la relación entre mensaje e id del movimiento. El builder decide cómo (p. ej. caché o propiedades con vencimiento, o leer el id del teclado del mensaje respondido, que Telegram incluye en `reply_to_message.reply_markup`).
- La web ya permite editar la descripción en el formulario. Solo cambia cómo se muestra.

---

## 3. Guía para adaptar la app a otros bancos con Claude

### 3.1 Por qué

Los lectores solo entienden BCP y Yape. Otras personas (con "Hacer una copia") tienen otros bancos u otros formatos de correo. En vez de pedirle cada banco a Bruno, cada quien le pide a **su propio Claude** que revise sus correos y adapte su copia.

### 3.2 Decisiones (Bruno)

- Se **recomienda** adaptar la copia propia con Claude. No se exige PR al repo ni fork. Si alguien quiere contribuir su banco, la guía existente ([agregar-un-banco.md](../../agregar-un-banco.md)) lo cubre.
- Se deja **muy claro** qué pasa al actualizar: la copia se reemplaza por la plantilla nueva, **se pierde lo que Claude adaptó**, los datos no se pierden (se importan), y hay que pedirle a Claude que lo vuelva a aplicar.

### 3.3 Qué se escribe

- **README:** sección "¿Tu banco no aparece? Adáptalo con Claude", corta, con la advertencia de actualización y un enlace a la guía.
- **Guía nueva `docs/adaptar-con-claude.md`:**
  - Qué necesita: Claude con acceso a su Gmail (o pegar 2 o 3 correos), y acceso a su copia (editor de Apps Script o clasp).
  - Un **texto para copiar y pegar** a su Claude, que pida: buscar 2 o 3 correos de cada tipo de operación de su banco; escribir el lector siguiendo `agregar-un-banco.md`, con pruebas sobre correos **anonimizados**; registrarlo en `lectores.js`; subirlo a su copia; y **guardar el lector y sus cambios en un archivo aparte** (p. ej. un Google Doc o un `.js` en su Drive) junto con instrucciones para reaplicarlo.
  - Sección "Antes de actualizar": lo que se pierde y el texto para pedirle a Claude que reaplique el lector guardado en la copia nueva.
  - Privacidad: los correos reales no se suben a ningún repo. Solo los anonimizados, y solo si contribuye.
- **En la app:** cuando "Buscar actualizaciones" encuentra una versión nueva, el aviso en Ajustes añade siempre: "Si adaptaste la lectura de correos de tu banco, al actualizar se pierde ese cambio: pídele a tu Claude que lo vuelva a aplicar." Va con un enlace a la sección de la guía. Se muestra siempre, porque la app no puede saber si alguien cambió su código. Lo mismo en [actualizar.md](../../actualizar.md).

---

## 4. Restricciones

- Lógica pura en `src/core/` con pruebas en el arnés (`tests/harness.js`), como el resto. El bot y la web solo orquestan.
- Esquema 6 con migración automática, como las anteriores (la corren la web, el bot y los triggers). La importación de datos de versiones anteriores trae las hojas nuevas vacías y aplica los roles.
- Sin datos personales en el repo (fixtures y demo con nombres inventados).
- Subir `VERSION_APP` junto con `package.json` (hay prueba), CHANGELOG, README (sección "Qué hace" y hoja de ruta) y `npm run deploy:plantilla` al publicar.
- Montos de préstamo solo en PEN. Un yapeo es siempre en soles. Si un movimiento en USD se categoriza como préstamo, se usa monto_pen.

## 5. Queda a criterio del builder

Nombres de funciones y columnas, estructura de archivos nuevos, cómo relacionar una respuesta de Telegram con su movimiento, el diseño visual de la sección y la tarjeta (dentro del estilo actual), y el orden de implementación.
