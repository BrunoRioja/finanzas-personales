// Lector del correo "Estado de Cuenta de tu Tarjeta VISA" del BCP. No crea movimientos:
// guarda cuánto pagar y hasta cuándo, para "Próximos pagos". En el correo los símbolos
// S/ y $ son imágenes: el primer monto es en soles y el segundo en dólares.

const REMITENTE_ESTADO_CUENTA_BCP = 'estadodecuenta@notificacionesbcp.com.pe';
const PATRON_DOS_MONTOS = '([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})';

function leerEstadoCuentaBcp_(correo) {
  if (correo.remitente !== REMITENTE_ESTADO_CUENTA_BCP) return null;
  if (!/Estado de Cuenta de tu Tarjeta/i.test(String(correo.asunto || ''))) return null;
  const t = correo.texto;
  const total = new RegExp('Pago total del mes:\\s*' + PATRON_DOS_MONTOS).exec(t);
  const minimo = new RegExp('Pago m[ií]nimo del mes:\\s*' + PATRON_DOS_MONTOS).exec(t);
  const limite = /[UÚ]ltimo d[ií]a de pago:\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(t);
  const pendiente = { pendiente: 'No se pudo leer el estado de cuenta.' };
  if (!total || !minimo || !limite) return pendiente;
  const fechaLimite = limite[3] + '-' + limite[2] + '-' + limite[1];
  if (!esFechaIso_(fechaLimite)) return pendiente;
  const cifra = c => leerMonto_('S/', c).monto;
  return { estadoCuenta: {
    emitido: correo.fecha, total_pen: cifra(total[1]), total_usd: cifra(total[2]),
    minimo_pen: cifra(minimo[1]), minimo_usd: cifra(minimo[2]), fecha_limite: fechaLimite, ref_externa: 'gmail:' + correo.id,
  } };
}
