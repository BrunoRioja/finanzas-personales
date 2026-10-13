// La app web corre como su dueño, así que Google nunca muestra ahí la pantalla de permisos.
// Tras instalar o actualizar a una versión que pide permisos nuevos, ejecuta esta función
// una vez desde el editor: pide todos los del manifiesto juntos (con el consentimiento por
// permiso, el editor solo pediría los que use la función que se ejecuta).
function autorizarPermisos() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  return 'Permisos concedidos. Ya puedes volver a la app.';
}
