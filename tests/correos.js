// Correos de ejemplo anonimizados (tests/fixtures/correos) y asuntos reales del BCP/Yape.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'fixtures', 'correos');

const ASUNTOS = {
  debito: 'Realizaste un consumo con tu Tarjeta de Débito BCP - Servicio de Notificaciones BCP',
  credito: 'Realizaste un consumo con tu Tarjeta de Crédito BCP - Servicio de Notificaciones BCP',
  transferencia: 'Constancia de Transferencia Entre mis Cuentas - Servicio de Notificaciones BCP',
  pagoTarjeta: 'Constancia de Pago de Tarjeta de Crédito Propia - Servicio de Notificaciones BCP',
  servicio: 'ENVIO AUTOMATICO - CONSTANCIA DE PAGO DE SERVICIO - BANCA MOVIL BCP',
  yapeRecibido: 'Constancia de recepción de Yapeo a celular BCP - Servicio de Notificaciones BCP',
  yape: 'Por tu seguridad, te notificaremos por cada yapeo que realices',
  estadoCuenta: 'Estado de Cuenta de tu Tarjeta VISA',
  comprobante: 'BCP - ¡Te enviamos tu nuevo comprobante electrónico! - FD03-00000001',
};

function html(nombre) {
  return fs.readFileSync(path.join(DIR, nombre), 'utf8');
}

// Correo como lo entrega leerCorreo_ (texto ya convertido a una línea).
function correo(e, nombre, extra) {
  return Object.assign({
    id: nombre.replace('.html', ''),
    remitente: 'notificaciones@notificacionesbcp.com.pe',
    asunto: '',
    fecha: '2026-10-06',
    texto: e.interno('htmlATexto_', html(nombre)),
  }, extra);
}

module.exports = { ASUNTOS, html, correo };
