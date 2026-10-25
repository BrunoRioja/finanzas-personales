// Lector de las constancias de bancadigital@scotiabank.com.pe (transferencias a otro banco
// y por Plin). Van como gasto: si el destino era una cuenta propia, se corrige en Por revisar.

const REMITENTE_SCOTIABANK = 'bancadigital@scotiabank.com.pe';

function leerCorreoScotiabank_(correo) {
  if (correo.remitente !== REMITENTE_SCOTIABANK) return null;
  const asunto = String(correo.asunto || '');
  if (!/Constancia/i.test(asunto)) return null; // publicidad
  if (!/Transferencia (a otro banco|Plin)/i.test(asunto)) {
    return { pendiente: 'Operación de Scotiabank que la app aún no sabe leer.' };
  }
  const t = correo.texto;
  const monto = new RegExp('Total cargado:\\s*' + PATRON_MONTO).exec(t) || new RegExp('Monto enviado:\\s*' + PATRON_MONTO).exec(t);
  const origen = /Cuenta de origen:\s*[^*]{0,40}?[*\s]+(\d{4})\b/.exec(t);
  const destino = /Cuenta de destino:\s*(.+?)\s+[\d-]{10,}/.exec(t) || /Enviado a:\s*(.+?)\s+Con Plin/.exec(t);
  if (!monto || !origen || !destino) return { pendiente: 'No se pudo leer la transferencia de Scotiabank.' };
  // "Carlos Pru*** *** *** 999" → "Carlos Pru*** 999"
  const comercio = destino[1].replace(/(^|\s)\*+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  return { crudo: Object.assign({ tipo: 'gasto' }, leerMonto_(monto[1], monto[2]), {
    comercio: comercio, numero_origen: origen[1], fecha: correo.fecha, ref_externa: 'gmail:' + correo.id,
  }) };
}
