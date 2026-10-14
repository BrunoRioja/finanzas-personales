# Instalación

Cada persona instala **su propia copia**: su propia Google Sheet y su propio proyecto de Apps Script, en su cuenta de Google. Nadie más ve tus datos.

## Vía desarrollador (clasp) — disponible desde v0.1

Requisitos: Node 20 o superior, una cuenta de Google y la [API de Apps Script activada](https://script.google.com/home/usersettings) (interruptor "Google Apps Script API" en **On**).

1. Clona e instala:

   ```bash
   git clone https://github.com/BrunoRioja/finanzas-personales.git
   cd finanzas-personales
   npm install
   ```

2. Inicia sesión en Google con clasp (abre el navegador):

   ```bash
   npx clasp login
   ```

3. Crea tu Google Sheet y su proyecto de Apps Script:

   ```bash
   npm run setup
   git checkout src/appsscript.json
   ```

   `npm run setup` crea `.clasp.json` (ignorado por git) y una Sheet llamada "Finanzas personales" en tu Drive. El `git checkout` restaura el manifiesto del repo (zona horaria y acceso "solo yo"), que clasp reemplaza al crear el proyecto.

4. Publica la web app:

   ```bash
   npm run deploy
   ```

   La primera vez crea el despliegue y guarda su id en `.despliegue`; las siguientes veces actualiza **el mismo** despliegue, así que la URL no cambia. Al final imprime la URL.

5. Abre la URL. Google pedirá autorizar el acceso a tus hojas (es tu propio script). Luego aparece el **asistente**: tu nombre, tipo de cambio, tus cuentas y categorías.

6. Guarda la URL en la pantalla de inicio del celular (Chrome → menú → "Agregar a la pantalla principal").
7. **Lectura de correos (opcional):** en **Cuentas**, pon en cada cuenta los últimos 4 dígitos de su número y de su tarjeta (por ejemplo `1063, 7373`) y marca la cuenta de la que sale Yape. Luego en **Ajustes → Lectura de correos** elige la frecuencia y toca **Guardar**: Google pedirá permiso para leer y etiquetar tus correos.

### Actualizar a una versión nueva

```bash
git pull
npm install
npm run deploy
```

Tus datos no se tocan: viven en la Sheet.

Si la versión nueva pide permisos nuevos (lo dice el CHANGELOG), ejecuta una vez `autorizarPermisos` en el editor de la app, acepta, y vuelve a ejecutar `npm run deploy`.

### Bot de Telegram (opcional, desde v0.3)

1. En Telegram, abre **@BotFather**, envía `/newbot`, elige un nombre y un usuario terminado en `bot`, y copia el **token**.
2. En la carpeta del proyecto: `npm run deploy:receptor`. Crea un segundo proyecto de Apps Script, el *receptor*, que solo recibe los mensajes de Telegram y se los pasa a la app. Imprime dos URLs: la del **editor** del receptor y la **URL del receptor**.
3. Abre la URL del editor, elige la función `autorizar`, toca **Ejecutar** y acepta los permisos. Sin este paso Google responde "Acceso denegado" a Telegram.
4. Actualiza la app (`npm run deploy`). Luego, en el editor de la app, ejecuta una vez la función `autorizarPermisos` (archivo `setup/permisos`) y acepta el permiso nuevo ("conectarse a un servicio externo"), que la app usa para escribirle a Telegram. La app web no muestra la pantalla de permisos: corre como su dueño. Si aceptas después del despliegue, vuelve a ejecutar `npm run deploy`.
5. En la app, **Ajustes → Telegram**: pega el token y la URL del receptor y toca **Conectar**.
6. Envía al bot el código que aparece (`/start XXXXXX`, o toca **Abrir Telegram**) y luego **Ya lo envié**. Desde ese momento el bot solo atiende a tu chat.

El receptor usa siempre el último código de la app: después de un `npm run deploy` no hay que volver a desplegarlo.

## Vía plantilla ("Hacer una copia") — llega en v0.5

Para quien no quiera usar la terminal: una Sheet plantilla con el código incluido, que se copia con un clic.

## Probar sin datos reales

En el asistente toca **"Solo mirar (datos demo)"**, o en **Ajustes → Ver con datos demo**. Se crea una Sheet aparte con 3 meses ficticios; tu hoja real no se toca. Para volver: **Ajustes → Salir del modo demo**.
