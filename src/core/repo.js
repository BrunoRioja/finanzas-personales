// Única capa que toca SpreadsheetApp. Convierte filas <-> objetos según ESQUEMA,
// ubicando cada columna por su encabezado (el usuario puede reordenar o agregar columnas).

function abrirLibro_() {
  const props = PropertiesService.getScriptProperties();
  const demo = props.getProperty('DEMO_SHEET_ID');
  if (props.getProperty('MODO_DEMO') === 'si' && demo) {
    try {
      return SpreadsheetApp.openById(demo);
    } catch {
      // La hoja demo fue borrada: volver a la real en vez de romper la app.
      props.setProperty('MODO_DEMO', 'no');
    }
  }
  const id = props.getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
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
  if (tipo === 'fecha') return esFecha_(valor) ? formatearFecha_(valor) : String(valor == null ? '' : valor);
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
  const columnas = ESQUEMA[nombre];
  const valores = hoja_(nombre).getDataRange().getValues();
  const encabezados = valores[0] || [];
  const indices = columnas.map(c => encabezados.indexOf(c[0]));
  return valores.slice(1)
    .filter(fila => fila.some(v => v !== '' && v !== null))
    .map(fila => {
      const obj = {};
      columnas.forEach((c, i) => { obj[c[0]] = desdeCelda_(indices[i] < 0 ? '' : fila[indices[i]], c[1]); });
      return obj;
    });
}

function agregarFilas_(nombre, objetos) {
  if (!objetos.length) return;
  const hoja = hoja_(nombre);
  const encabezados = encabezados_(hoja);
  const tipos = tiposDe_(nombre);
  const filas = objetos.map(o => encabezados.map(h => (h in tipos ? haciaCelda_(o[h], tipos[h]) : '')));
  hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, encabezados.length).setValues(filas);
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
