# Bot de Telegram (vía plantilla)

El bot vive en un segundo proyecto pequeño, el **receptor**: recibe los mensajes de Telegram y se los pasa a tu app, que sigue siendo "solo tú". Toma unos 10 minutos. (Con clasp, usa `npm run deploy:receptor`: ver [instalacion.md](instalacion.md).)

1. **Crea el bot.** En Telegram abre **@BotFather**, envía `/newbot`, elige un nombre y un usuario terminado en `bot`, y copia el **token**. No lo compartas con nadie.
2. **Copia el ID de tu app.** En tu hoja: *Extensiones → Apps Script → ⚙ Configuración del proyecto* → copia el **ID de la secuencia de comandos**.
3. **Crea el receptor.** Abre [script.new](https://script.new), ponle de nombre "Finanzas · receptor", borra el contenido de `Código.gs` y pega el de [`receptor/Receptor.js`](../receptor/Receptor.js).
4. **Conecta tu app como biblioteca.** En el receptor: *Bibliotecas → +* → pega el ID del paso 2 → **Buscar** → versión **HEAD (modo de desarrollo)** → identificador `Finanzas` → **Agregar**.
5. **Autoriza.** Elige la función `autorizar` arriba, toca **Ejecutar** y acepta los permisos (verás la misma advertencia de "app no verificada" que al instalar).
6. **Publica el receptor.** *Implementar → Nueva implementación → App web → Ejecutar como: Yo → Quién tiene acceso: **Cualquier usuario*** → Implementar → copia la **URL de la app web**. Es seguro: el receptor no guarda nada y tu app solo acepta mensajes con un secreto que se genera al conectar.
7. **Conecta.** En tu app, **Ajustes → Telegram**: pega el token y la URL del receptor y toca **Conectar**. Envía al bot el código que aparece (o toca **Abrir Telegram**) y luego **Ya lo envié**.

Desde ese momento el bot solo atiende a tu chat. Para desconectarlo: **Ajustes → Telegram → Desconectar**.
