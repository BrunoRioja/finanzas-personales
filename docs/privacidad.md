# Privacidad

- **Dónde están tus datos:** solo en tu Google Sheet, en tu cuenta de Google. El repositorio no contiene datos de nadie.
- **Quién puede abrir la app:** la web app se publica con acceso **"Solo yo"**: únicamente tu cuenta de Google puede abrirla.
- **Secretos:** los tokens y claves que lleguen en versiones futuras (Telegram, Gemini) se guardan en *Script Properties* del proyecto, nunca en la hoja ni en el código.
- **Modo demo:** usa datos inventados en una hoja aparte, útil para mostrar la app sin exponer tus finanzas.

## Lectura de correos (v0.2)

- La app busca **solo** correos de `notificacionesbcp.com.pe` y `yape.pe` (no lee el resto de tu bandeja) y excluye spam y papelera.
- Usa el permiso `gmail.modify`, que Google describe como "ver y modificar, pero no eliminar": lo necesita para poner la etiqueta `Finanzas/Procesado`. Nunca borra ni envía correos. Puedes apagar la etiqueta en Ajustes.
- Todo ocurre dentro de tu cuenta de Google: los correos no salen a ningún servidor.

## Bot de Telegram (v0.3)

- Los mensajes del bot (montos, comercios, categorías y nombres de cuenta) pasan por los servidores de Telegram. Nunca se envían números de cuenta ni de tarjeta.
- El único punto público es el receptor: solo acepta peticiones con el secreto que la app generó al conectar el bot, y la app ignora cualquier chat distinto del tuyo. La app web sigue siendo "solo yo".
- El token del bot, el secreto y tu chat se guardan solo en las propiedades del script de tu app, nunca en la hoja ni en el repositorio.
- **Desconectar** en Ajustes borra el webhook, el token y el chat.

## Próximas versiones

- **v0.4 (Gemini):** audios, fotos de boletas y algunos textos se enviarán a la API de Gemini con **tu** clave. En el nivel gratuito, Google puede usar ese contenido para mejorar sus productos; para datos reales se recomienda el nivel de pago con un tope de gasto.
