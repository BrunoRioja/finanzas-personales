// Punto de entrada de la web app.

function doGet() {
  return HtmlService.createTemplateFromFile('web/Index').evaluate()
    .setTitle('Finanzas')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

// Usado desde las plantillas: <?!= incluir_('web/estilos'); ?>
function incluir_(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}
