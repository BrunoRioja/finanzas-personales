// Lector de los correos de Sip: la tarjeta de crédito avisa desde servicioalcliente.sip.pe
// y la app (antes Agora) desde operaciones.agora.pe. Los avisos de la app no traen número
// de cuenta, así que dicen el banco y el tipo de cuenta y el resolver busca la única que calce.

const REMITENTE_SIP_TARJETA = 'no-reply@servicioalcliente.sip.pe';
const REMITENTE_SIP_APP = 'no-reply@operaciones.agora.pe';

// Sip escribe "S/." (con punto) y a veces "US$".
const PATRON_MONTO_SIP = '(S\\/\\.?|US\\$|\\$)\\s*([\\d,]+\\.\\d{2})';

function leerCorreoSip_(correo) {
  const base = { fecha: correo.fecha, ref_externa: 'gmail:' + correo.id };
  if (correo.remitente === REMITENTE_SIP_TARJETA) {
    return /realizaste un consumo/i.test(String(correo.asunto || '')) ? consumoSip_(correo.texto, base) : null;
  }
  if (correo.remitente === REMITENTE_SIP_APP) {
    return /Realizaste una operaci[oó]n/i.test(String(correo.asunto || '')) ? operacionSip_(correo.texto, base) : null;
  }
  return null;
}

function montoSip_(m) {
  return leerMonto_(/\$/.test(m[1]) ? '$' : 'S/', m[2]);
}

function consumoSip_(t, base) {
  const monto = new RegExp('Monto:\\s*' + PATRON_MONTO_SIP).exec(t);
  const tarjeta = /Tarjeta Titular:\s*X*(\d{4})/i.exec(t);
  const comercio = /Establecimiento:\s*(.+?)\s+Monto:/i.exec(t);
  if (!monto || !tarjeta || !comercio) return { pendiente: 'No se pudo leer el consumo de Sip.' };
  return { crudo: Object.assign({ tipo: 'gasto' }, montoSip_(monto), { comercio: comercio[1].trim(), numero_origen: tarjeta[1] }, base) };
}

function operacionSip_(t, base) {
  const operacion = /Operaci[oó]n realizada:\s*(Pago a comercios|Transferencia a mis cuentas)/i.exec(t);
  if (!operacion) return { pendiente: 'Operación de Sip que la app aún no sabe leer.' };
  const monto = new RegExp('Monto\\s+' + PATRON_MONTO_SIP).exec(t);
  if (/^Pago/i.test(operacion[1])) {
    const empresa = /Empresa\s+(.+?)\s+Fecha y Hora/i.exec(t);
    if (!monto || !empresa) return { pendiente: 'No se pudo leer el pago de Sip.' };
    return { crudo: Object.assign({ tipo: 'gasto' }, montoSip_(monto), { comercio: empresa[1].trim(), banco: 'Sip', tipo_origen: 'debito' }, base) };
  }
  const origen = /Origen\s+(.+?)\s+Destino/i.exec(t);
  const destino = /Destino\s+(.+?)\s+Fecha y Hora/i.exec(t);
  if (!monto || !origen || !destino) return { pendiente: 'No se pudo leer la transferencia de Sip.' };
  return { crudo: Object.assign({ tipo: 'transferencia' }, montoSip_(monto), {
    comercio: '', descripcion: 'Transferencia entre mis cuentas', banco: 'Sip',
    tipo_origen: tipoCuentaSip_(origen[1]), tipo_destino: tipoCuentaSip_(destino[1]),
  }, base) };
}

// "Tarjeta de débito Sip" → debito; "Cuenta AhorraMás soles" → ahorro.
function tipoCuentaSip_(nombre) {
  return /ahorra/i.test(nombre) ? 'ahorro' : /cr[eé]dito/i.test(nombre) ? 'credito' : 'debito';
}
