// Utilidades puras compartidas. Solo usan Utilities/Session para formatear fechas
// en la zona horaria del script.

function redondear2_(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function normalizarTexto_(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

// No usar instanceof: las fechas de la hoja vienen de otro contexto.
function esFecha_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

function formatearFecha_(fecha, patron) {
  return Utilities.formatDate(fecha, Session.getScriptTimeZone(), patron || 'yyyy-MM-dd');
}

function hoyIso_() {
  return formatearFecha_(new Date());
}

// 'yyyy-MM-dd' con un día que exista en el calendario.
function esFechaIso_(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto));
  if (!m) return false;
  const a = Number(m[1]);
  const me = Number(m[2]);
  const d = Number(m[3]);
  const f = new Date(a, me - 1, d);
  return f.getFullYear() === a && f.getMonth() === me - 1 && f.getDate() === d;
}

function mesDe_(fechaIso) {
  return String(fechaIso).slice(0, 7);
}

// Suma n meses (n puede ser negativo) a 'yyyy-MM'.
function sumarMeses_(mes, n) {
  const partes = mes.split('-').map(Number);
  const total = partes[0] * 12 + (partes[1] - 1) + n;
  return Math.floor(total / 12) + '-' + String((total % 12) + 1).padStart(2, '0');
}

function validarMes_(mes) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes))) throw new Error('Mes inválido: ' + mes);
  return String(mes);
}

function nuevoId_() {
  return Utilities.getUuid();
}

// Monto escrito por el usuario: "1,200" y "1,250.50" llevan coma de miles (así los muestra
// la app); "400,50" lleva coma decimal. Vacío = 0; lo que no es un monto positivo = null.
function leerMontoTexto_(texto) {
  const t = String(texto == null ? '' : texto).trim().replace(/^s\/\.?\s*/i, '');
  if (t === '') return 0;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return redondear2_(t.replace(/,/g, ''));
  if (/^\d+([.,]\d+)?$/.test(t)) return redondear2_(t.replace(',', '.'));
  return null;
}
