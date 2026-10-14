// Receptor público del webhook de Telegram. Solo pasa el mensaje a la app (biblioteca
// "Finanzas"), que valida el secreto de la URL y el chat. No tiene doGet.

function doPost(e) {
  try {
    Finanzas.recibirTelegram(e && e.parameter ? e.parameter.secret : '', e && e.postData ? e.postData.contents : '');
  } catch (err) {
    console.error(err);
  }
  // HtmlService responde 200 directo; ContentService responde 302 (redirige a otro dominio)
  // y Telegram toma el 302 como entrega fallida: reintenta y deja en fila los mensajes siguientes.
  return HtmlService.createHtmlOutput('ok');
}

// Ejecútala una vez desde el editor del receptor para autorizarlo (sin esto, Google
// responde "Acceso denegado" a Telegram).
function autorizar() {
  console.log(JSON.stringify(Finanzas.estadoInstalacion()));
}
