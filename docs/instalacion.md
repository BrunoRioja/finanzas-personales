# Instalación

Cada persona instala **su propia copia**: su propia Google Sheet y su propio proyecto de Apps Script, en su cuenta de Google. Nadie más ve tus datos.

## Vía desarrollador (clasp) — disponible desde v0.1

Requisitos: Node 20 o superior, una cuenta de Google y la [API de Apps Script activada](https://script.google.com/home/usersettings) (interruptor "Google Apps Script API" en **On**).

1. Clona e instala:

   ```bash
   git clone https://github.com/USUARIO_GITHUB/finanzas-personales.git
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

### Actualizar a una versión nueva

```bash
git pull
npm install
npm run deploy
```

Tus datos no se tocan: viven en la Sheet.

## Vía plantilla ("Hacer una copia") — llega en v0.5

Para quien no quiera usar la terminal: una Sheet plantilla con el código incluido, que se copia con un clic.

## Probar sin datos reales

En el asistente toca **"Solo mirar (datos demo)"**, o en **Ajustes → Ver con datos demo**. Se crea una Sheet aparte con 3 meses ficticios; tu hoja real no se toca. Para volver: **Ajustes → Salir del modo demo**.
