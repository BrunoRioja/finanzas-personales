// Única capa que toca SpreadsheetApp. Convierte filas <-> objetos según ESQUEMA,
// ubicando cada columna por su encabezado (el usuario puede reordenar o agregar columnas).

// Libro ya abierto en esta ejecución (Apps Script reinicia el estado global en cada
// llamada del navegador). Abrir un libro cuesta cientos de ms: se abre una vez por clave.
const LIBRO_ABIERTO = { clave: null, libro: null };

function abrirLibro_() {
  const scriptProps = PropertiesService.getScriptProperties();
  const props = scriptProps.getProperties();
  const demo = props.DEMO_SHEET_ID;
  if (props.MODO_DEMO === 'si' && demo) {
    if (LIBRO_ABIERTO.clave === 'demo:' + demo) return LIBRO_ABIERTO.libro;
    try {
      return recordarLibro_('demo:' + demo, SpreadsheetApp.openById(demo));
    } catch {
      // La hoja demo fue borrada: volver a la real en vez de romper la app.
      scriptProps.setProperty('MODO_DEMO', 'no');
    }
  }
  const id = props.SHEET_ID || '';
  if (LIBRO_ABIERTO.clave === 'real:' + id) return LIBRO_ABIERTO.libro;
  return recordarLibro_('real:' + id, id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet());
}

function recordarLibro_(clave, libro) {
  LIBRO_ABIERTO.clave = clave;
  LIBRO_ABIERTO.libro = libro;
  return libro;
}

// Crea las hojas que falten con encabezados en negrita, fila congelada y formato
// texto (@) en columnas texto/fecha para que Sheets no convierta '0042' ni fechas.
function crearHojas_(libro) {
  Object.keys(ESQUEMA).forEach(nombre => {
    if (libro.getSheetByName(nombre)) return;
    const hoja = libro.insertSheet(nombre);
    const columnas = ESQUEMA[nombre];
    hoja.getRange(1, 1, 1, columnas.length).setValues([columnas.map(c => c[0])]);
    hoja.getRange(1, 1, 1, columnas.length).setFontWeight('bold');
    hoja.setFrozenRows(1);
    columnas.forEach((c, i) => {
      if (c[1] === 'texto' || c[1] === 'fecha') hoja.getRange(2, i + 1, hoja.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });
}

function hoja_(nombre) {
  const hoja = abrirLibro_().getSheetByName(nombre);
  if (!hoja) throw new Error('Falta la hoja "' + nombre + '". Abre la app para completar el asistente de instalación.');
  return hoja;
}

function tiposDe_(nombre) {
  const tipos = {};
  ESQUEMA[nombre].forEach(c => { tipos[c[0]] = c[1]; });
  return tipos;
}

function desdeCelda_(valor, tipo) {
  if (tipo === 'numero') {
    const n = Number(valor);
    return valor === '' || valor === null || isNaN(n) ? 0 : n;
  }
  if (tipo === 'booleano') return valor === true || String(valor).toUpperCase() === 'TRUE';
  if (tipo === 'fecha') {
    if (esFecha_(valor)) return formatearFecha_(valor);
    // Fecha escrita a mano en formato peruano (dd/mm/aaaa) en una columna de texto.
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(valor == null ? '' : valor).trim());
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return String(valor == null ? '' : valor);
  }
  return valor == null ? '' : String(valor);
}

function haciaCelda_(valor, tipo) {
  if (valor === undefined || valor === null) return tipo === 'booleano' ? false : '';
  if (tipo === 'numero') return valor === '' ? '' : Number(valor);
  if (tipo === 'booleano') return valor === true;
  return String(valor);
}

function encabezados_(hoja) {
  return hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
}

function leerTabla_(nombre) {
  return filasDe_(hoja_(nombre), nombre);
}

// Filas de una hoja como objetos del ESQUEMA, ubicando cada columna por su encabezado
// (con los renombres de versiones anteriores). También lee hojas de otro libro (importar).
function filasDe_(hoja, nombre) {
  const columnas = ESQUEMA[nombre];
  const renombres = RENOMBRES_ESQUEMA[nombre] || {};
  const valores = hoja.getDataRange().getValues();
  const encabezados = (valores[0] || []).map(h => renombres[h] || h);
  const indices = columnas.map(c => encabezados.indexOf(c[0]));
  const colClave = encabezados.indexOf(columnas[0][0]);
  return valores.slice(1)
    .filter(fila => tieneClave_(fila, colClave))
    .map(fila => {
      const obj = {};
      columnas.forEach((c, i) => { obj[c[0]] = desdeCelda_(indices[i] < 0 ? '' : fila[indices[i]], c[1]); });
      return obj;
    });
}

// Una fila es un dato solo si tiene clave: casillas o fórmulas que el usuario
// arrastre en una columna propia no crean filas fantasma.
function tieneClave_(fila, colClave) {
  if (colClave < 0) return fila.some(v => v !== '' && v !== null);
  return fila[colClave] !== '' && fila[colClave] !== null;
}

// Filas que se agregan al llenarse la hoja (Sheets no deja escribir fuera de getMaxRows).
const FILAS_POR_AMPLIACION = 500;

function agregarFilas_(nombre, objetos) {
  if (!objetos.length) return;
  const hoja = hoja_(nombre);
  const valores = hoja.getDataRange().getValues();
  const encabezados = valores[0];
  const tipos = tiposDe_(nombre);
  const colClave = encabezados.indexOf(ESQUEMA[nombre][0][0]);
  let ultima = 1;
  valores.forEach((fila, i) => { if (i > 0 && tieneClave_(fila, colClave)) ultima = i + 1; });
  const inicio = ultima + 1;
  const fin = inicio + objetos.length - 1;
  const maximo = hoja.getMaxRows();
  if (fin > maximo) {
    const agregar = Math.max(fin - maximo, FILAS_POR_AMPLIACION);
    hoja.insertRowsAfter(maximo, agregar);
    encabezados.forEach((h, i) => {
      if (tipos[h] === 'texto' || tipos[h] === 'fecha') hoja.getRange(maximo + 1, i + 1, agregar, 1).setNumberFormat('@');
    });
  }
  // Las columnas propias del usuario conservan lo que ya tenían en esas filas.
  const filas = objetos.map((o, k) => {
    const previa = valores[inicio - 1 + k] || [];
    return encabezados.map((h, i) => (h in tipos ? haciaCelda_(o[h], tipos[h]) : (previa[i] === undefined ? '' : previa[i])));
  });
  hoja.getRange(inicio, 1, filas.length, encabezados.length).setValues(filas);
}

// Número de fila (1-based) cuya clave (primera columna del esquema) es `id`, o -1.
function buscarFila_(hoja, nombre, id) {
  const clave = ESQUEMA[nombre][0][0];
  const valores = hoja.getDataRange().getValues();
  const col = valores[0].indexOf(clave);
  for (let i = 1; i < valores.length; i++) {
    if (String(valores[i][col]) === String(id)) return i + 1;
  }
  return -1;
}

function actualizarFila_(nombre, id, cambios) {
  const hoja = hoja_(nombre);
  const fila = buscarFila_(hoja, nombre, id);
  if (fila < 0) throw new Error('No existe ' + nombre + ' con id ' + id);
  const encabezados = encabezados_(hoja);
  const tipos = tiposDe_(nombre);
  const actual = hoja.getRange(fila, 1, 1, encabezados.length).getValues()[0];
  const nueva = encabezados.map((h, i) => {
    if (!(h in tipos)) return actual[i]; // columna agregada por el usuario: no se toca
    const valor = h in cambios ? cambios[h] : desdeCelda_(actual[i], tipos[h]);
    return haciaCelda_(valor, tipos[h]);
  });
  hoja.getRange(fila, 1, 1, encabezados.length).setValues([nueva]);
}

function eliminarFila_(nombre, id) {
  const hoja = hoja_(nombre);
  const fila = buscarFila_(hoja, nombre, id);
  if (fila < 0) throw new Error('No existe ' + nombre + ' con id ' + id);
  hoja.deleteRow(fila);
}

function leerConfig_() {
  const config = {};
  leerTabla_('Config').forEach(f => { config[f.clave] = f.valor; });
  return config;
}

function guardarConfig_(cambios) {
  const actual = leerConfig_();
  Object.keys(cambios).forEach(clave => {
    if (clave in actual) actualizarFila_('Config', clave, { valor: cambios[clave] });
    else agregarFilas_('Config', [{ clave: clave, valor: cambios[clave] }]);
  });
}

function conBloqueo_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// Lleva el libro al esquema actual sin borrar datos: crea hojas faltantes, renombra
// encabezados antiguos y agrega al final las columnas nuevas.
function migrarEsquema_(libro) {
  crearHojas_(libro);
  Object.keys(ESQUEMA).forEach(nombre => {
    const hoja = libro.getSheetByName(nombre);
    const renombres = RENOMBRES_ESQUEMA[nombre] || {};
    const encabezados = encabezados_(hoja);
    let renombrado = false;
    const actuales = encabezados.map(h => {
      if (!renombres[h]) return h;
      renombrado = true;
      return renombres[h];
    });
    if (renombrado) hoja.getRange(1, 1, 1, actuales.length).setValues([actuales]);
    ESQUEMA[nombre].forEach(c => {
      if (actuales.indexOf(c[0]) >= 0) return;
      actuales.push(c[0]);
      const col = actuales.length;
      hoja.getRange(1, col, 1, 1).setValues([[c[0]]]);
      if (c[1] === 'texto' || c[1] === 'fecha') hoja.getRange(2, col, hoja.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });
}

// Sin bloqueo: para usar dentro de una función que ya lo tiene.
function migrarSiHaceFalta_() {
  const libro = abrirLibro_();
  if (!libro.getSheetByName('Config')) return false;
  if (Number(leerConfig_().version_esquema) >= VERSION_ESQUEMA) return false;
  migrarEsquema_(libro);
  asegurarAmbitos_();
  asegurarRolesPrestamo_();
  guardarConfig_({ version_esquema: VERSION_ESQUEMA });
  return true;
}

function asegurarEsquema_() {
  const libro = abrirLibro_();
  if (!libro.getSheetByName('Config')) return;
  if (Number(leerConfig_().version_esquema) >= VERSION_ESQUEMA) return;
  conBloqueo_(migrarSiHaceFalta_);
}

function registrarLog_(nivel, origen, mensaje, detalle) {
  try {
    agregarFilas_('Log', [{
      fecha: formatearFecha_(new Date(), 'yyyy-MM-dd HH:mm:ss'), nivel: nivel, origen: origen,
      mensaje: String(mensaje), detalle: detalle == null ? '' : String(detalle).slice(0, 2000),
    }]);
  } catch {
    // Sin hoja Log no hay dónde escribir: no tapar el error original.
  }
}
