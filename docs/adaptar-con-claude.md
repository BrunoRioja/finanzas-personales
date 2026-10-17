# Adaptar la app a tu banco con Claude

La app viene preparada para los correos de **BCP y Yape**. Si usas otro banco (o el formato de tus correos es distinto), no necesitas esperar a nadie: puedes pedirle a **tu propio Claude** que revise tus correos y adapte **tu copia** de la app. No hace falta saber programar, y no tienes que compartir nada con el autor ni subir nada a GitHub.

> **Ojo con las actualizaciones.** Lo que Claude adapte vive solo en tu copia. Cuando [actualices a una versión nueva](actualizar.md) se reemplaza la copia por la plantilla nueva: tus **datos no se pierden** (se importan), pero **el lector de tu banco sí**. Por eso el texto de abajo le pide a Claude que lo guarde aparte. Mira la sección [Antes de actualizar](#antes-de-actualizar).

## Qué necesitas

- Un **Claude con acceso a tu Gmail** (por ejemplo, con el conector de Gmail activado). Si no puedes dárselo, copia tú mismo 2 o 3 correos de cada tipo de operación y pégaselos en el chat.
- Que ese Claude pueda **llegar a tu copia de la app**: o bien te guía paso a paso en el editor de Apps Script (en tu hoja: *Extensiones → Apps Script*), o bien trabaja con [clasp](https://github.com/google/clasp) si tienes la copia en tu computadora.
- Tu copia ya instalada y funcionando ([instalacion.md](instalacion.md)).

## Texto para pegarle a tu Claude

Copia todo el bloque, cambia **[TU BANCO]** por el nombre de tu banco y pégalo en una conversación con tu Claude.

```text
Quiero que adaptes mi copia de la app "Finanzas personales" (Google Apps Script + Google Sheets,
código abierto en https://github.com/BrunoRioja/finanzas-personales) para que lea los correos de
notificación de mi banco: [TU BANCO]. La app hoy solo entiende BCP y Yape.

Haz esto, en orden:

1. Busca en MI Gmail 2 o 3 correos de notificación de CADA tipo de operación de mi banco
   (consumo con tarjeta, transferencia enviada, transferencia recibida, pago de servicios,
   retiro, etc.). Si no puedes acceder a mi Gmail, pídeme que te pegue los correos.
   Dime qué tipos encontraste y cuáles no.

2. Lee la guía docs/agregar-un-banco.md del repositorio y sigue sus pasos al pie de la letra:
   - Escribe primero las pruebas y después el lector en src/parsers/<banco>.js.
   - Las pruebas se hacen con versiones ANONIMIZADAS de mis correos: reemplaza mi nombre,
     números de tarjeta y de cuenta, números de operación y montos por valores inventados.
     Nunca dejes datos reales en las pruebas ni en el código.
   - Un correo de operación que no puedas leer debe devolver { pendiente: '...' } para que
     aparezca en "Correos que no se pudieron leer", y un correo que no es una operación
     (publicidad) debe devolver null.

3. Registra el lector en src/parsers/lectores.js (la función en lectoresDeCorreo_() y el
   dominio del remitente en REMITENTES_BANCARIOS).

4. Corre las pruebas (npm test) si trabajas con el código en mi computadora. Luego sube los
   cambios a MI copia de la app: pegándolos en el editor de Apps Script (hoja -> Extensiones ->
   Apps Script, guiándome paso a paso) o con clasp. No publiques nada en GitHub.

5. Guarda el lector y todos tus cambios en un ARCHIVO APARTE que yo conserve: un Google Doc
   o un archivo .js en mi Google Drive, con:
   - el código completo del lector (y las líneas que añadiste en lectores.js),
   - qué versión de la app tengo (Ajustes -> Acerca de),
   - instrucciones claras para volver a aplicarlo en una copia nueva de la app después de
     actualizar. Esto es importante: al actualizar, mi copia se reemplaza y el lector se pierde.
   El archivo debe tener solo código e instrucciones: nunca el contenido de mis correos reales
   (ni montos, ni nombres, ni números de cuenta). Si usaste un ejemplo, que sea inventado.

Al terminar, dime dónde quedó guardado el archivo y cómo probar que funciona
(Ajustes -> Lectura de correos -> Revisar ahora).
```

Después de que Claude termine, entra a **Ajustes → Lectura de correos → Revisar ahora** y mira que tus movimientos aparezcan. Lo que no se entienda queda en **Por revisar** o en "Correos que no se pudieron leer": nunca se pierde.

## Antes de actualizar

Cuando toques **Ajustes → Acerca de → Buscar actualizaciones** y haya una versión nueva, recuerda:

- **Se conserva:** todos tus datos (cuentas, movimientos, presupuestos, préstamos…), porque se importan a la copia nueva.
- **Se pierde:** cualquier cambio que hayas hecho al código de tu copia, incluido el lector de tu banco. La app no puede saber si cambiaste algo, por eso el aviso aparece siempre.

El orden recomendado:

1. Ten a mano el **archivo aparte** que te dejó tu Claude con el lector (Google Doc o `.js` en tu Drive).
2. Sigue [actualizar.md](actualizar.md): copia la plantilla nueva, importa tus datos y apaga la app anterior.
3. Con la copia nueva ya instalada, pégale esto a tu Claude:

```text
Acabo de actualizar mi app "Finanzas personales" a una versión nueva (copia nueva de la
plantilla, con mis datos importados). Antes yo había adaptado la lectura de correos de mi
banco: [TU BANCO]. Te paso el archivo donde guardaste el lector y las instrucciones para
reaplicarlo: [PEGA AQUÍ EL ARCHIVO O EL ENLACE A TU DRIVE].

Reaplícalo en mi copia NUEVA:
1. Revisa que el código nuevo de src/parsers/lectores.js no haya cambiado de forma que
   choque con el lector guardado; si cambió, adáptalo y dime qué ajustaste.
2. Agrega el lector y regístralo en lectores.js (función y dominio del remitente).
3. Si puedes, corre las pruebas; luego súbelo a mi copia nueva (editor de Apps Script o clasp).
4. Actualiza el archivo guardado con la versión nueva de la app y cualquier ajuste.
5. Dime cómo comprobar que funciona (Ajustes -> Lectura de correos -> Revisar ahora).
```

## Privacidad

- Tus correos reales **no se suben a ningún repositorio**. Se quedan en tu Gmail y en la conversación con tu Claude.
- Las pruebas del lector usan solo correos **anonimizados** (nombres, números y montos inventados).
- Si algún día quieres compartir tu banco para que otros lo usen, es opcional: la guía [agregar-un-banco.md](agregar-un-banco.md) explica cómo abrir un PR, siempre con correos anonimizados.
