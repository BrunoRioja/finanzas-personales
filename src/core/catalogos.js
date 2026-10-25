// Catálogos fijos (bancos, tipos, monedas, categorías sugeridas) y validación de
// cuentas y categorías.

const TIPOS_CUENTA = ['debito', 'credito', 'ahorro', 'billetera', 'efectivo'];
const BANCOS = ['BCP', 'Interbank', 'BBVA', 'Scotiabank', 'Banco de la Nación', 'Sip', 'Yape', 'Plin', 'Efectivo', 'Otro'];
const MONEDAS = ['PEN', 'USD'];
const PALETA = ['#3ddc97', '#ffb347', '#7c5cff', '#4cc9f0', '#ff6b6b', '#f72585', '#b5e48c', '#ffd166'];

const CATEGORIAS_POR_DEFECTO = [
  ['Supermercado', '🛒', 'gasto'], ['Comida fuera', '🍽️', 'gasto'], ['Bodega', '🏪', 'gasto'],
  ['Transporte', '🚕', 'gasto'], ['Vivienda y servicios', '🏠', 'gasto'], ['Suscripciones', '📺', 'gasto'],
  ['Salud y gym', '💪', 'gasto'], ['Suplementos', '💊', 'gasto'], ['Aseo personal', '🧴', 'gasto'],
  ['Ropa', '👕', 'gasto'], ['Entretenimiento', '🎮', 'gasto'], ['Educación', '🎓', 'gasto'],
  ['Viajes', '✈️', 'gasto'], ['Regalos', '🎁', 'gasto'], ['Comisiones bancarias', '💸', 'gasto'],
  ['Préstamos', '🤝', 'gasto', 'prestamo'], ['Otros', '❓', 'gasto'],
  ['Sueldo', '💼', 'ingreso'], ['Freelance / extras', '💰', 'ingreso'], ['Reembolsos', '🔁', 'ingreso', 'reembolso'],
  ['Otros ingresos', '🎁', 'ingreso'],
];

function normalizarCuenta_(datos) {
  const nombre = String(datos.nombre || '').trim();
  if (!nombre) throw new Error('La cuenta necesita un nombre.');
  const tipo = String(datos.tipo || '');
  if (TIPOS_CUENTA.indexOf(tipo) < 0) throw new Error('Tipo de cuenta inválido: ' + tipo);
  const moneda = String(datos.moneda || 'PEN');
  if (MONEDAS.indexOf(moneda) < 0) throw new Error('Moneda no soportada: ' + moneda);
  const numeros = normalizarNumeros_(datos.numeros);
  const vacio = datos.saldo_inicial === '' || datos.saldo_inicial === undefined || datos.saldo_inicial === null;
  const saldo = vacio ? 0 : redondear2_(datos.saldo_inicial);
  if (!isFinite(saldo)) throw new Error('El saldo inicial debe ser un número.');
  return {
    nombre: nombre, banco: String(datos.banco || 'Otro'), tipo: tipo, moneda: moneda,
    saldo_inicial: saldo, numeros: numeros, activa: datos.activa !== false, yape: datos.yape === true,
  };
}

// `existentes` = categorías ya guardadas; `idActual` = id de la que se edita ('' si es nueva).
function normalizarCategoria_(datos, existentes, idActual) {
  const nombre = String(datos.nombre || '').trim();
  if (!nombre) throw new Error('La categoría necesita un nombre.');
  const tipo = String(datos.tipo || '');
  if (tipo !== 'gasto' && tipo !== 'ingreso') throw new Error('La categoría debe ser de gasto o de ingreso.');
  const repetida = existentes.some(c => c.id !== idActual && c.tipo === tipo &&
    normalizarTexto_(c.nombre) === normalizarTexto_(nombre));
  if (repetida) throw new Error('Ya existe la categoría "' + nombre + '".');
  const color = /^#[0-9a-fA-F]{6}$/.test(String(datos.color || '')) ? datos.color : PALETA[existentes.length % PALETA.length];
  const rol = String(datos.rol || '');
  if (rol) {
    if (!ROLES_CATEGORIA[rol]) throw new Error('Rol de categoría inválido: ' + rol);
    if (ROLES_CATEGORIA[rol] !== tipo) throw new Error('La categoría de ' + (rol === 'prestamo' ? 'préstamo' : rol) + ' debe ser de ' + ROLES_CATEGORIA[rol] + '.');
    const otra = existentes.filter(c => c.id !== idActual && c.rol === rol && c.activa !== false)[0];
    if (otra) throw new Error('Ya hay una categoría marcada como ' + rol + ': "' + otra.nombre + '".');
  }
  return {
    nombre: nombre, emoji: String(datos.emoji || '').trim(), color: color, tipo: tipo,
    padre_id: String(datos.padre_id || ''), activa: datos.activa !== false, rol: rol,
  };
}

// "5101,5202  5101" → "5101, 5202". Cada número: últimos 4 dígitos de una cuenta o tarjeta.
function normalizarNumeros_(valor) {
  const partes = String(valor == null ? '' : valor).split(/[\s,;]+/).filter(Boolean);
  partes.forEach(n => {
    if (!/^\d{4}$/.test(n)) throw new Error('Cada número de cuenta o tarjeta debe tener 4 dígitos: "' + n + '".');
  });
  return partes.filter((n, i) => partes.indexOf(n) === i).join(', ');
}

function numerosDe_(cuenta) {
  return String(cuenta.numeros || '').split(/[\s,;]+/).filter(Boolean);
}

// Un número solo puede pertenecer a una cuenta: si no, un correo no sabría a cuál ir.
function validarNumerosUnicos_(cuenta, otras) {
  const propios = numerosDe_(cuenta);
  otras.forEach(o => numerosDe_(o).forEach(n => {
    if (propios.indexOf(n) >= 0) throw new Error('El número ' + n + ' ya está en la cuenta "' + o.nombre + '".');
  }));
}
