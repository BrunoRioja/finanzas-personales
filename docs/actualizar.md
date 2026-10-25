# Actualizar a una versión nueva

Tu copia no cambia sola: así nadie (ni el autor) puede modificar el código que corre en tu cuenta. Para saber si hay una versión nueva, toca **Ajustes → Acerca de → Buscar actualizaciones** (o mira las [novedades](../CHANGELOG.md)).

> **Si adaptaste la lectura de correos de tu banco** (por ejemplo con [Claude](adaptar-con-claude.md)), al actualizar se pierde ese cambio: la copia nueva trae solo los bancos que vienen de fábrica (BCP, Yape, Scotiabank y Sip). Guarda el lector antes y pídele a tu Claude que lo vuelva a aplicar: [Antes de actualizar](adaptar-con-claude.md#antes-de-actualizar). Tus datos sí se conservan.

## Vía plantilla

1. **Copia la plantilla nueva** ([Hacer una copia](https://docs.google.com/spreadsheets/d/12jTo7S7wRd1xs4XMN9ftS2PyDjCArfTAaT6gun2GemE/copy)) y **publícala** como la primera vez (menú **💸 Finanzas → Cómo publicar mi app**).
2. **Abre la app nueva** y, en el asistente, toca **Importar mis datos**. Pega el enlace de tu hoja anterior. Se copian tus cuentas, categorías, movimientos, divisiones, reglas, presupuestos, pagos fijos, estados de cuenta y préstamos con sus abonos, además de tu nombre, tipo de cambio y horarios. Tu hoja anterior no cambia.
3. **Apaga la app anterior:** en ella, **Ajustes → Lectura de correos → Frecuencia: Apagada → Guardar**, y **Ajustes → Telegram → Desconectar**. Si no, las dos apps leerían los mismos correos.
4. **Activa la nueva:** **Ajustes → Lectura de correos** y, si usas el bot, cambia la biblioteca de tu receptor por el ID de la app nueva ([telegram.md](telegram.md), pasos 2 y 4) y vuelve a conectar.

No se copian el registro de errores, los correos "no leídos" ni la conexión del bot. Los correos ya importados no se duplican cuando vuelves a activar la lectura.

## Vía desarrollador

`git pull`, `npm install` y `npm run deploy` (más `autorizarPermisos` si el CHANGELOG pide permisos nuevos).
