// Lector de los correos de notificaciones@notificacionesbcp.com.pe.
// Devuelve { crudo } si entiende la operación, { pendiente } si es una operación que no
// pudo leer, o null si el correo no es una operación (estados de cuenta, comprobantes…).

const REMITENTE_BCP = 'notificaciones@notificacionesbcp.com.pe';

function leerCorreoBcp_(correo) {
  if (correo.remitente !== REMITENTE_BCP) return null;
  const t = correo.texto;
  const asunto = String(correo.asunto || '');
  const base = { fecha: correo.fecha, ref_externa: 'gmail:' + correo.id };
  if (/Realizaste un consumo con tu Tarjeta/i.test(asunto)) return consumoBcp_(t, base);
  if (/Transferencia Entre mis Cuentas/i.test(asunto)) return transferenciaBcp_(t, base);
  if (/Pago de Tarjeta de Cr[eé]dito Propia/i.test(asunto)) return pagoTarjetaBcp_(t, base);
  if (/PAGO DE SERVICIO/i.test(asunto)) return pagoServicioBcp_(t, base);
  if (/recepci[oó]n de Yapeo/i.test(asunto)) return yapeoRecibidoBcp_(t, base);
  if (/Estado de Cuenta/i.test(asunto)) return null;
  // Una operación que aún no sabemos leer (transferencia a terceros, retiro…) no se ignora.
  if (/Constancia|Realizaste|Yapeo|Transferencia|Retiro|Pago/i.test(asunto)) {
    return { pendiente: 'Operación del BCP que la app aún no sabe leer.' };
  }
  return null;
}

function consumoBcp_(t, base) {
  const monto = new RegExp('Realizaste un consumo de ' + PATRON_MONTO).exec(t);
  const tarjeta = /N[uú]mero de Tarjeta de (?:D[eé]bito|Cr[eé]dito)\s*\*+\s*(\d{4})/i.exec(t);
  const empresa = /Empresa\s+(.+?)\s+N[uú]mero de operaci[oó]n/i.exec(t);
  if (!monto || !tarjeta || !empresa) return { pendiente: 'No se pudo leer el consumo.' };
  let comercio = empresa[1].trim();
  const plin = /^PLIN-(.+)$/i.exec(comercio);
  if (plin) comercio = plin[1].trim();
  return { crudo: Object.assign({ tipo: 'gasto' }, leerMonto_(monto[1], monto[2]), { comercio: comercio, numero_origen: tarjeta[1] }, base) };
}

function transferenciaBcp_(t, base) {
  const monto = new RegExp('Monto transferido\\s+' + PATRON_MONTO).exec(t);
  const destino = /Enviado a\s+[^*]{0,40}?\*{4}\s*(\d{4})/.exec(t);
  const origen = /Desde\s+[^*]{0,40}?\*{4}\s*(\d{4})/.exec(t);
  if (!monto || !destino || !origen) return { pendiente: 'No se pudo leer la transferencia.' };
  return { crudo: Object.assign({ tipo: 'transferencia' }, leerMonto_(monto[1], monto[2]), {
    comercio: '', descripcion: 'Transferencia entre mis cuentas', numero_origen: origen[1], numero_destino: destino[1],
  }, base) };
}

function pagoTarjetaBcp_(t, base) {
  const monto = new RegExp('Monto pagado\\s+' + PATRON_MONTO).exec(t);
  const tc = /Tipo de cambio\s+S\/\s*(\d+\.\d+)/.exec(t);
  const destino = /Pagado a\s+[^*]{0,40}?\*{4}\s*(\d{4})/.exec(t);
  const origen = /Desde\s+[^*]{0,40}?\*{4}\s*(\d{4})/.exec(t);
  if (!monto || !destino || !origen) return { pendiente: 'No se pudo leer el pago de tarjeta.' };
  const crudo = Object.assign({ tipo: 'transferencia' }, leerMonto_(monto[1], monto[2]));
  if (tc && crudo.moneda === 'USD') Object.assign(crudo, { tc: Number(tc[1]), actualiza_tc: true });
  return { crudo: Object.assign(crudo, { comercio: '', descripcion: 'Pago de tarjeta', numero_origen: origen[1], numero_destino: destino[1] }, base) };
}

function pagoServicioBcp_(t, base) {
  const empresa = /Empresa:\s*(.+?)\s+Servicio:/.exec(t);
  const origen = /Cuenta de origen:\s*[^*]{0,40}?\*{4}\s*(\d{4})/.exec(t);
  const monto = new RegExp('Monto total:\\s*' + PATRON_MONTO).exec(t);
  if (!empresa || !origen || !monto) return { pendiente: 'No se pudo leer el pago de servicio.' };
  return { crudo: Object.assign({ tipo: 'gasto' }, leerMonto_(monto[1], monto[2]), { comercio: empresa[1].trim(), numero_origen: origen[1] }, base) };
}

function yapeoRecibidoBcp_(t, base) {
  const m = new RegExp('Recibiste un yapeo de ' + PATRON_MONTO + ' de (.+?)\\.\\s+Por tu seguridad').exec(t);
  if (!m) return { pendiente: 'No se pudo leer el yapeo recibido.' };
  return { crudo: Object.assign({ tipo: 'ingreso' }, leerMonto_(m[1], m[2]), { comercio: m[3].trim(), usa_yape: true }, base) };
}
