# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones con [SemVer](https://semver.org/lang/es/).

## [0.5.0] — 2026-10-13

### Agregado
- Pestaña Presupuestos: un monto mensual por categoría de gasto, con el gasto del mes pasado y el promedio de 3 meses como referencia, y "Usar lo del mes pasado".
- Bloque "Presupuesto del mes" en el Inicio: gastado vs presupuesto, color de alerta, marca de ritmo, total y gasto sin presupuesto.
- Avisos por Telegram al cruzar el 80 % y el 100 % de una categoría (una vez por umbral y por mes).
- `/mes` muestra las categorías en alerta o pasadas.
- Presupuestos en los datos de demo.

### Cambiado
- Esquema de la hoja v3 (migración automática): hoja nueva `Presupuestos`.
- La v0.4 (Gemini) queda en pausa hasta decidirla con el uso real.

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
- La app pide un permiso nuevo para conectarse a Telegram (`script.external_request`): ejecuta una vez `autorizarPermisos` en el editor de la app y vuelve a desplegar.

## [0.2.0] — 2026-10-13

### Agregado
- Lectura automática de correos del BCP y Yape con trigger configurable (5, 15, 30, 60 minutos o manual) e importación desde una fecha.
- Bandeja "Por revisar" con categorías frecuentes, reglas comercio → categoría que se aplican solas y correos no leídos.
- Dividir un movimiento entre varias categorías.
- Cuentas con varios números (cuenta y tarjeta) y cuenta de Yape.
- Etiqueta `Finanzas/Procesado` en Gmail (desactivable).
- Guía para agregar un banco.
- Horario de lectura automática (por defecto de 7:00 a 24:00); "Revisar ahora" e "Importar" funcionan a cualquier hora.
- Avance y resultado visibles al importar, con continuación automática tanda por tanda.
- "Volver a leer los sin cuenta y los no leídos": tras corregir los números de las cuentas o una mejora de los lectores.

### Cambiado
- Esquema de la hoja v2 (migración automática): `ultimos4` pasa a `numeros`, nueva columna `yape` y hoja `Pendientes`.
- Eliminar un movimiento borra también sus divisiones.

## [0.1.0] — 2026-10-13

### Agregado
- Asistente de instalación: nombre, tipo de cambio, cuentas y categorías.
- Registro manual de gastos, ingresos y transferencias en soles y dólares.
- Dashboard: indicadores del mes, gasto por categoría, tendencia de 6 meses, saldos por cuenta y top de comercios.
- Gestión de cuentas, categorías y ajustes.
- Modo demo con datos ficticios en una hoja aparte.
- Pruebas en Node con Sheets simulado, ESLint y CI en GitHub Actions.
