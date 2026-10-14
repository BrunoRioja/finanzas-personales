// Menú "💸 Finanzas" de la Google Sheet: lleva a la app o explica cómo publicarla. En una
// copia recién hecha de la plantilla, "Abrir mi app" es lo primero que pide permisos.

const TITULO_MENU = '💸 Finanzas';

// Trigger simple: corre al abrir la hoja, sin permisos, así que solo arma el menú.
function onOpen() {
  SpreadsheetApp.getUi().createMenu(TITULO_MENU)
    .addItem('Abrir mi app', 'abrirMiApp')
    .addItem('Cómo publicar mi app', 'comoPublicarMiApp')
    .addToUi();
}

function abrirMiApp() {
  const url = ScriptApp.getService().getUrl() || '';
  if (!url) return comoPublicarMiApp();
  return mostrarDialogo_(htmlEnlaceApp_(url), 'Tu app');
}

function comoPublicarMiApp() {
  return mostrarDialogo_(textoPublicarApp_(), 'Cómo publicar tu app');
}

function mostrarDialogo_(html, titulo) {
  const salida = HtmlService.createHtmlOutput('<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' + html + '</div>')
    .setWidth(460).setHeight(440);
  SpreadsheetApp.getUi().showModalDialog(salida, titulo);
}

function escaparAtributo_(texto) {
  return String(texto == null ? '' : texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function htmlEnlaceApp_(url) {
  const u = escaparAtributo_(url);
  return '<p>Tu app está publicada. Ábrela y guárdala en favoritos (o en la pantalla de inicio del celular):</p>' +
    '<p><a href="' + u + '" target="_blank" rel="noopener">Abrir mi app</a></p>' +
    '<p style="word-break:break-all;color:#555">' + u + '</p>';
}

function textoPublicarApp_() {
  return '<p>Tu copia ya tiene todo el código; falta publicarla como app web (solo una vez):</p><ol>' +
    '<li>Menú <b>Extensiones → Apps Script</b>.</li>' +
    '<li>Arriba a la derecha: <b>Implementar → Nueva implementación</b>.</li>' +
    '<li>En el engranaje de "Seleccionar tipo", elige <b>App web</b>.</li>' +
    '<li><b>Ejecutar como:</b> Yo. <b>Quién tiene acceso:</b> Solo yo.</li>' +
    '<li>Toca <b>Implementar</b> y luego <b>Autorizar acceso</b> con tu cuenta.</li>' +
    '<li>Copia la <b>URL de la app web</b> y ábrela. También la verás aquí, en <b>💸 Finanzas → Abrir mi app</b>.</li></ol>' +
    '<p style="color:#555">Si Google muestra "Google no verificó esta app", es porque el código es tuyo y no pasó por su ' +
    'verificación: toca <b>Configuración avanzada</b> y luego <b>Ir a …</b>. Nadie más puede abrir tu app ni ver tus datos.</p>';
}
