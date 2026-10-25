// Lector de los correos de notificaciones@yape.pe (yapeos enviados y pagos de servicio).
// Los yapeos recibidos llegan del BCP y los lee bcp.js.

const REMITENTE_YAPE = 'notificaciones@yape.pe';

function leerCorreoYape_(correo) {
  if (correo.remitente !== REMITENTE_YAPE) return null;
  const t = correo.texto;
  if (/Tu servicio fue yapeado/i.test(t)) return servicioYape_(correo);
  if (!/Acabas de yapear/i.test(t)) return null; // encuestas, publicidad
  const monto = new RegExp('Monto de yapeo\\*?\\s+' + PATRON_MONTO).exec(t);
  const nombre = /Nombre del Beneficiario\s+(.+?)\s+N[º°o]\.? de operaci[oó]n/i.exec(t);
  if (!monto || !nombre) return { pendiente: 'No se pudo leer el yapeo.' };
  return { crudo: Object.assign({ tipo: 'gasto' }, leerMonto_(monto[1], monto[2]), {
    comercio: nombre[1].trim(), usa_yape: true, fecha: correo.fecha, ref_externa: 'gmail:' + correo.id,
  }) };
}

function servicioYape_(correo) {
  const t = correo.texto;
  const monto = new RegExp('Monto total\\s+' + PATRON_MONTO).exec(t);
  const empresa = /Empresa:\s*(.+?)\s+Servicio:/.exec(t);
  if (!monto || !empresa) return { pendiente: 'No se pudo leer el pago de servicio con Yape.' };
  return { crudo: Object.assign({ tipo: 'gasto' }, leerMonto_(monto[1], monto[2]), {
    comercio: empresa[1].trim(), usa_yape: true, fecha: correo.fecha, ref_externa: 'gmail:' + correo.id,
  }) };
}
