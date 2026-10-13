// Textos y teclados del bot. Funciones puras: reciben los datos ya leídos de la hoja.
// Los textos van en modo HTML de Telegram: todo dato de la hoja pasa por escaparHtml_.
// ctx = { cuentas, categorias, urlApp, hoy }

const ICONO_TIPO = { gasto: '🛒', ingreso: '💰', transferencia: '🔁' };
const SIMBOLO_MONEDA = { PEN: 'S/', USD: 'US$' };
const MAX_AVISOS_SUELTOS = 5;
const MAX_LINEAS_RESUMEN = 15;
const ALFABETO_ID = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const TEXTO_AYUDA = [
  '<b>Registrar un gasto</b>',
  'Escribe: descripción monto [cuenta] [categoría]',
  '• <code>taxi 12 yape</code>',
  '• <code>almuerzo 25.50 efectivo comida</code>',
  '• <code>+ sueldo 3500</code> (ingreso)',
  '',
  '<b>Comandos</b>',
  '/hoy — resumen del día',
  '/mes — resumen del mes',
  '/deshacer — borra lo último que registraste aquí',
  '/ayuda — este mensaje',
].join('\n');

function escaparHtml_(texto) {
  return String(texto == null ? '' : texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatoMonto_(monto, moneda) {
  const n = Math.abs(redondear2_(monto)).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (monto < 0 ? '−' : '') + (SIMBOLO_MONEDA[moneda] || moneda || 'S/') + ' ' + n;
}

// callback_data admite 64 bytes: un UUID (36) se guarda en 22 caracteres (12 bits por
// cada 2 caracteres); cualquier otro id va tal cual con "~" delante.
function compactarId_(id) {
  const texto = String(id);
  if (!PATRON_UUID.test(texto)) return '~' + texto;
  const hex = texto.replace(/-/g, '') + '0';
  let r = '';
  for (let i = 0; i < hex.length; i += 3) {
    const n = parseInt(hex.slice(i, i + 3), 16);
    r += ALFABETO_ID[n >> 6] + ALFABETO_ID[n & 63];
  }
  return r;
}

function expandirId_(compacto) {
  const texto = String(compacto == null ? '' : compacto);
  if (texto[0] === '~') return texto.slice(1);
  if (!/^[A-Za-z0-9_-]{22}$/.test(texto)) return '';
  let hex = '';
  for (let i = 0; i < texto.length; i += 2) {
    const n = ALFABETO_ID.indexOf(texto[i]) * 64 + ALFABETO_ID.indexOf(texto[i + 1]);
    hex += n.toString(16).padStart(3, '0');
  }
  hex = hex.slice(0, 32);
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function boton_(texto, datos) {
  return { text: texto, callback_data: datos };
}

function botonApp_(urlApp, texto) {
  return urlApp ? [{ text: texto || 'Abrir la app', url: urlApp }] : [];
}

function nombreCategoria_(categorias, id) {
  const c = categorias.filter(x => x.id === id)[0];
  return c ? (c.emoji ? c.emoji + ' ' : '') + c.nombre : 'Sin categoría';
}

function nombreCuenta_(cuentas, id) {
  const c = cuentas.filter(x => x.id === id)[0];
  return c ? c.nombre : 'sin cuenta';
}

function textoMovimiento_(mov, ctx) {
  const cuenta = mov.tipo === 'transferencia'
    ? nombreCuenta_(ctx.cuentas, mov.cuenta_id) + ' → ' + nombreCuenta_(ctx.cuentas, mov.cuenta_destino_id)
    : nombreCuenta_(ctx.cuentas, mov.cuenta_id);
  const cuando = mov.fecha === ctx.hoy ? 'hoy' : mov.fecha.slice(8, 10) + '/' + mov.fecha.slice(5, 7);
  return (ICONO_TIPO[mov.tipo] || '•') + ' <b>' + formatoMonto_(mov.monto, mov.moneda) + '</b> · ' + escaparHtml_(cuenta) +
    '\n' + escaparHtml_(mov.comercio || mov.descripcion || 'Sin descripción') + ' · ' + cuando;
}

function botonCategoria_(mov, categoriaId, ctx) {
  return boton_(nombreCategoria_(ctx.categorias, categoriaId), 'c:' + compactarId_(mov.id) + ':' + compactarId_(categoriaId));
}

function tecladoCategorias_(mov, idsFrecuentes, ctx) {
  const id = compactarId_(mov.id);
  const top = idsFrecuentes.slice(0, 3).map(cid => botonCategoria_(mov, cid, ctx));
  return [top, [boton_('Otra…', 'o:' + id)].concat(botonApp_(ctx.urlApp, 'Abrir en la app'))].filter(fila => fila.length);
}

function tecladoTodas_(mov, ctx) {
  const botones = ctx.categorias.filter(c => c.activa && c.tipo === mov.tipo).map(c => botonCategoria_(mov, c.id, ctx));
  const filas = [];
  for (let i = 0; i < botones.length; i += 2) filas.push(botones.slice(i, i + 2));
  filas.push([boton_('← Volver', 'v:' + compactarId_(mov.id))]);
  return filas;
}

// Lo que falta elegir en la app (cuenta o cuenta destino) no se resuelve en el chat.
function mensajePorRevisar_(mov, idsFrecuentes, ctx) {
  const texto = textoMovimiento_(mov, ctx);
  if (!mov.cuenta_id || mov.tipo === 'transferencia') {
    const app = botonApp_(ctx.urlApp, 'Abrir en la app');
    const falta = mov.cuenta_id ? 'Elige la cuenta destino en la app.' : 'Elige la cuenta en la app.';
    return { texto: texto + '\n<i>' + falta + '</i>', teclado: app.length ? [app] : null };
  }
  return { texto: texto, teclado: tecladoCategorias_(mov, idsFrecuentes, ctx) };
}

function mensajeAgrupado_(cantidad, urlApp) {
  const app = botonApp_(urlApp);
  return { texto: '📥 <b>' + cantidad + ' movimientos nuevos por revisar</b>', teclado: app.length ? [app] : null };
}

function textoCategorizado_(mov, categoriaId, ctx, extra) {
  return textoMovimiento_(mov, ctx) + '\n✓ ' + escaparHtml_(nombreCategoria_(ctx.categorias, categoriaId)) + (extra || '');
}

function tecladoRecordar_(mov) {
  const id = compactarId_(mov.id);
  return [[boton_('Sí, recordar', 'r:' + id), boton_('Solo esta vez', 's:' + id)]];
}

function textoRegistrado_(mov, ctx) {
  return '✓ <b>' + formatoMonto_(mov.monto, mov.moneda) + '</b> · ' + escaparHtml_(mov.comercio) + ' · ' +
    escaparHtml_(nombreCategoria_(ctx.categorias, mov.categoria_id)) + ' · ' + escaparHtml_(nombreCuenta_(ctx.cuentas, mov.cuenta_id));
}

function tecladoRegistrado_(mov) {
  const id = compactarId_(mov.id);
  return [[boton_('Deshacer', 'd:' + id), boton_('Cambiar categoría', 'k:' + id)]];
}

// movs = movimientos de un día; extras = { porRevisar, noLeidos } de toda la bandeja.
function textoResumen_(movs, ctx, extras) {
  if (!movs.length) return '';
  const suma = tipo => redondear2_(movs.filter(m => m.tipo === tipo).reduce((s, m) => s + m.monto_pen, 0));
  const ingresos = suma('ingreso');
  const partes = ['📊 <b>Hoy · ' + formatoMonto_(suma('gasto'), 'PEN') + ' en gastos</b>' +
    (ingresos ? '\n💰 ' + formatoMonto_(ingresos, 'PEN') + ' en ingresos' : '')];
  const lineas = movs.slice(0, MAX_LINEAS_RESUMEN).map(m => {
    const que = m.estado === 'por_revisar' ? '⚠ por revisar'
      : m.tipo === 'transferencia' ? '🔁 transferencia' : nombreCategoria_(ctx.categorias, m.categoria_id);
    return '• ' + formatoMonto_(m.monto, m.moneda) + ' ' + escaparHtml_(que) + ' — ' +
      escaparHtml_(m.comercio || m.descripcion || nombreCuenta_(ctx.cuentas, m.cuenta_id));
  });
  if (movs.length > MAX_LINEAS_RESUMEN) lineas.push('…y ' + (movs.length - MAX_LINEAS_RESUMEN) + ' más');
  partes.push(lineas.join('\n'));
  const pie = [];
  if (extras.porRevisar) pie.push(extras.porRevisar + ' por revisar');
  if (extras.noLeidos) pie.push(extras.noLeidos + (extras.noLeidos === 1 ? ' correo no leído' : ' correos no leídos'));
  if (pie.length) partes.push(pie.join(' · '));
  return partes.join('\n\n');
}

// resumen = resumenMes_(…); porCategoria = gastoPorCategoria_(…).
function textoMes_(mes, resumen, porCategoria) {
  const lineas = [
    '📅 <b>Mes ' + escaparHtml_(mes) + '</b>',
    '💰 Ingresos: ' + formatoMonto_(resumen.ingresos, 'PEN'),
    '🛒 Gastos: ' + formatoMonto_(resumen.gastos, 'PEN'),
    '🐷 Ahorro: ' + formatoMonto_(resumen.ahorro, 'PEN') + (resumen.tasaAhorro === null ? '' : ' (' + resumen.tasaAhorro + ' %)'),
  ];
  if (porCategoria.length) {
    lineas.push('', '<b>Top categorías</b>');
    porCategoria.slice(0, 5).forEach(c => lineas.push('• ' + escaparHtml_((c.emoji ? c.emoji + ' ' : '') + c.nombre) +
      ' — ' + formatoMonto_(c.monto, 'PEN') + ' (' + c.porcentaje + ' %)'));
  }
  return lineas.join('\n');
}
