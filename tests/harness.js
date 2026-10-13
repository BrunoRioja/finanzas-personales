// Arnés de pruebas: carga todo src/**/*.js en un contexto de Node con los servicios
// de Google simulados (Sheets, Properties, Lock, Utilities, Session).
process.env.TZ = 'America/Lima';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function archivosJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(d => {
      const ruta = path.join(dir, d.name);
      if (d.isDirectory()) return archivosJs(ruta);
      return d.name.endsWith('.js') ? [ruta] : [];
    });
}

function formatear(d, patron) {
  const p = n => String(n).padStart(2, '0');
  return patron.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1))
    .replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes()))
    .replace('ss', p(d.getSeconds()));
}

// Libro simulado. `hojas` = { nombreHoja: [[fila1], [fila2], ...] } (fila 1 = encabezados).
// Como en Sheets real: cada hoja tiene un máximo de filas (1000 al crearla) y escribir
// fuera de ese máximo lanza error; insertRowsAfter lo agranda.
function crearLibro(id, hojas) {
  const formatos = {};
  const aplicados = [];
  const maxFilas = {};
  const maximo = nombre => (nombre in maxFilas ? maxFilas[nombre] : (maxFilas[nombre] = Math.max(1000, hojas[nombre].length)));
  const ancho = nombre => Math.max(0, ...hojas[nombre].map(f => f.length));
  const hoja = nombre => ({
    getName: () => nombre,
    getDataRange: () => ({
      getValues: () => hojas[nombre].map(f => Array.from({ length: ancho(nombre) }, (_, i) => (f[i] === undefined ? '' : f[i]))),
    }),
    getLastRow: () => hojas[nombre].length,
    getLastColumn: () => ancho(nombre),
    getMaxRows: () => maximo(nombre),
    insertRowsAfter: (despues, n) => { maxFilas[nombre] = maximo(nombre) + n; },
    getRange: (r, c, nr = 1, nc = 1) => {
      if (r + nr - 1 > maximo(nombre)) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
        const v = (hojas[nombre][r - 1 + i] || [])[c - 1 + j];
        return v === undefined ? '' : v;
      })),
      setValues: vs => vs.forEach((fila, i) => {
        while (hojas[nombre].length < r + i) hojas[nombre].push([]);
        fila.forEach((x, j) => { hojas[nombre][r - 1 + i][c - 1 + j] = x; });
      }),
      setNumberFormat: f => {
        for (let j = 0; j < nc; j++) formatos[nombre + '!' + (c + j)] = f;
        aplicados.push({ hoja: nombre, fila: r, columna: c, filas: nr, columnas: nc, formato: f });
      },
      setFontWeight: () => {},
      };
    },
    appendRow: fila => { hojas[nombre].push(fila.slice()); },
    deleteRow: n => { hojas[nombre].splice(n - 1, 1); },
    setFrozenRows: () => {},
  });
  return {
    getId: () => id,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id,
    getSheetByName: n => (hojas[n] ? hoja(n) : null),
    insertSheet: n => { hojas[n] = []; maxFilas[n] = 1000; return hoja(n); },
    _hojas: hojas,
    _formatos: formatos,
    _formatosAplicados: aplicados,
    _maxFilas: maxFilas,
  };
}

function crearEntorno(opciones = {}) {
  let ahora = new Date(opciones.ahora || '2026-10-13T10:00:00');
  const principal = crearLibro('libro-principal', opciones.hojas || {});
  const libros = { [principal.getId()]: principal };
  const propiedades = Object.assign({}, opciones.propiedades || {});
  const stats = { locks: 0, aperturas: 0 };
  let contadorId = 0;
  let contadorLibros = 0;

  class FechaFija extends Date {
    constructor(...args) { if (args.length === 0) super(ahora.getTime()); else super(...args); }
    static now() { return ahora.getTime(); }
  }

  const contexto = vm.createContext({
    console, JSON, Math, Object, Number, String, Array, Error, RegExp, isNaN, isFinite, Date: FechaFija,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => { stats.aperturas++; return principal; },
      openById: id => {
        stats.aperturas++;
        if (!libros[id]) throw new Error('No se encontró el documento ' + id);
        return libros[id];
      },
      create: nombre => {
        const libro = crearLibro('libro-' + (++contadorLibros), {});
        libro.nombre = nombre;
        libros[libro.getId()] = libro;
        return libro;
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in propiedades ? propiedades[k] : null),
        getProperties: () => Object.assign({}, propiedades),
        setProperty: (k, v) => { propiedades[k] = String(v); },
        deleteProperty: k => { delete propiedades[k]; },
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => { stats.locks++; }, releaseLock() {} }) },
    Utilities: {
      formatDate: (d, tz, patron) => formatear(d, patron),
      getUuid: () => 'id-' + String(++contadorId).padStart(4, '0'),
    },
    Session: { getScriptTimeZone: () => 'America/Lima' },
    Logger: { log() {} },
  });
  for (const archivo of archivosJs(SRC)) {
    vm.runInContext(fs.readFileSync(archivo, 'utf8'), contexto, { filename: path.relative(SRC, archivo) });
  }

  return {
    principal, libros, propiedades, stats,
    hojas: principal._hojas,
    llamar(nombre, ...args) {
      const salida = contexto[nombre](...args);
      return salida === undefined ? salida : JSON.parse(JSON.stringify(salida));
    },
    interno(nombre, ...args) { return contexto[nombre](...args); },
    fijarAhora(iso) { ahora = new Date(iso); },
  };
}

module.exports = { crearEntorno, crearLibro };
