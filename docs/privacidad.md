# Privacidad

- **Dónde están tus datos:** solo en tu Google Sheet, en tu cuenta de Google. El repositorio no contiene datos de nadie.
- **Quién puede abrir la app:** la web app se publica con acceso **"Solo yo"**: únicamente tu cuenta de Google puede abrirla.
- **Secretos:** los tokens y claves que lleguen en versiones futuras (Telegram, Gemini) se guardan en *Script Properties* del proyecto, nunca en la hoja ni en el código.
- **Modo demo:** usa datos inventados en una hoja aparte, útil para mostrar la app sin exponer tus finanzas.

## Próximas versiones

- **v0.2 (correos):** la app leerá los correos de notificación de tu banco **dentro de tu propia cuenta**; nada sale de Google.
- **v0.4 (Gemini):** audios, fotos de boletas y algunos textos se enviarán a la API de Gemini con **tu** clave. En el nivel gratuito, Google puede usar ese contenido para mejorar sus productos; para datos reales se recomienda el nivel de pago con un tope de gasto, donde no se usa para entrenar.
