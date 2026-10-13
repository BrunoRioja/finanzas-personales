# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones con [SemVer](https://semver.org/lang/es/).

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
- "Volver a leer los que quedaron sin cuenta" tras corregir los números de las cuentas.

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
