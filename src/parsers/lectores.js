// Registro de lectores de correo. Para agregar un banco: crear su lector en
// src/parsers/, sumarlo aquí y su dominio en REMITENTES_BANCARIOS (ver docs/agregar-un-banco.md).

// Dominios de remitente que se buscan en Gmail (cada lector verifica el remitente exacto).
const REMITENTES_BANCARIOS = ['notificacionesbcp.com.pe', 'yape.pe', 'servicioalcliente.sip.pe', 'operaciones.agora.pe', 'scotiabank.com.pe'];

function remitentesBancarios_() {
  return REMITENTES_BANCARIOS;
}

function lectoresDeCorreo_() {
  return [leerCorreoBcp_, leerEstadoCuentaBcp_, leerCorreoYape_, leerCorreoSip_, leerCorreoScotiabank_];
}

function leerCorreoBancario_(correo) {
  const lectores = lectoresDeCorreo_();
  for (let i = 0; i < lectores.length; i++) {
    const r = lectores[i](correo);
    if (r) return r;
  }
  return null;
}
