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

// Gmail simulado (servicio avanzado Gmail v1). correos = [{ id, de, asunto, html, recibido }]
function crearGmail(correos, stats, opciones) {
  const etiquetas = [];
  const etiquetasDe = {};
  const b64 = s => Buffer.from(s, 'utf8').toString('base64url');
  return {
    _etiquetas: etiquetas,
    _etiquetasDe: etiquetasDe,
    Users: {
      Messages: {
        list: (usuario, o) => {
          if (opciones.gmailFalla) throw new Error(opciones.gmailFalla);
          stats.gmailList++;
          const despues = Number((/after:(\d+)/.exec(o.q) || [])[1] || 0) * 1000;
          const dominios = ((/from:\(([^)]*)\)/.exec(o.q) || [])[1] || '').split(' OR ').filter(Boolean);
          const todos = correos
            .filter(c => new Date(c.recibido).getTime() >= despues && dominios.some(d => (c.cabeceraDe || c.de).indexOf(d) >= 0))
            .sort((a, b) => new Date(b.recibido) - new Date(a.recibido));
          const desde = Number(o.pageToken || 0);
          const r = { messages: todos.slice(desde, desde + o.maxResults).map(c => ({ id: c.id, threadId: c.id })) };
          if (desde + o.maxResults < todos.length) r.nextPageToken = String(desde + o.maxResults);
          return r;
        },
        get: (usuario, id) => {
          stats.gmailGet++;
          if (stats.enBloqueo) stats.gmailEnBloqueo++;
          const c = correos.filter(x => x.id === id)[0];
          // Como el servicio avanzado real: body.data puede llegar como texto base64url o como bytes.
          const cuerpo = Buffer.from(c.html, c.charset ? 'latin1' : 'utf8');
          const datos = opciones.gmailBytes ? Array.from(cuerpo) : cuerpo.toString('base64url');
          return {
            id: id,
            internalDate: String(new Date(c.recibido).getTime()),
            payload: {
              mimeType: 'multipart/alternative',
              headers: [{ name: 'From', value: c.cabeceraDe || 'Notificaciones <' + c.de + '>' }, { name: 'Subject', value: c.asunto }],
              parts: [
                { mimeType: 'text/plain', body: { data: b64('versión de texto plano') } },
                { mimeType: 'text/html', headers: [{ name: 'Content-Type', value: 'text/html; charset="' + (c.charsetCabecera || c.charset || 'UTF-8') + '"' }], body: { data: datos } },
              ],
            },
          };
        },
        modify: (recurso, usuario, id) => {
          if (stats.enBloqueo) stats.gmailEnBloqueo++;
          if (opciones.etiquetaFalla) throw new Error('No se pudo etiquetar');
          recurso.addLabelIds.forEach(l => {
            if (!etiquetas.some(x => x.id === l)) throw new Error('Etiqueta inexistente ' + l);
          });
          (etiquetasDe[id] = etiquetasDe[id] || []).push(...recurso.addLabelIds);
          return {};
        },
      },
      Labels: {
        list: () => ({ labels: etiquetas.slice() }),
        create: recurso => {
          const l = { id: 'Label_' + (etiquetas.length + 1), name: recurso.name };
          etiquetas.push(l);
          return l;
        },
      },
    },
  };
}

// UrlFetchApp simulado: solo la API de Telegram. Registra cada llamada; `estado.falla`
// hace que Telegram responda error y `estado.respuestas[metodo]` personaliza la respuesta
// ({ __crudo, __codigo } simula una respuesta que no es JSON).
const URL_PAQUETE = 'https://raw.githubusercontent.com/BrunoRioja/finanzas-personales/main/package.json';

function crearUrlFetch(estado, github) {
  return {
    fetch: (url, o) => {
      if (url === URL_PAQUETE) {
        github.llamadas++;
        if (github.falla) throw new Error('Address unavailable: ' + url);
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ name: 'finanzas-personales', version: github.version }) };
      }
      const m = /^https:\/\/api\.telegram\.org\/bot([^/]+)\/(\w+)$/.exec(url);
      if (!m) throw new Error('URL inesperada: ' + url);
      const datos = JSON.parse(o.payload || '{}');
      estado.llamadas.push({ token: m[1], metodo: m[2], datos });
      let cuerpo;
      // Falla de red: Apps Script lanza un error cuyo mensaje incluye la URL completa.
      if (estado.redCaida) throw new Error('Address unavailable: ' + url);
      if (estado.falla) cuerpo = { ok: false, description: estado.falla };
      else if (estado.respuestas[m[2]]) cuerpo = estado.respuestas[m[2]](datos, m[1]);
      else if (m[2] === 'sendMessage') cuerpo = { ok: true, result: { message_id: ++estado.contador } };
      else if (m[2] === 'getMe') cuerpo = { ok: true, result: { id: 42, is_bot: true, username: 'prueba_bot' } };
      else cuerpo = { ok: true, result: true };
      const texto = cuerpo.__crudo !== undefined ? cuerpo.__crudo : JSON.stringify(cuerpo);
      const codigo = cuerpo.__codigo || (cuerpo.ok ? 200 : 400);
      return { getResponseCode: () => codigo, getContentText: () => texto };
    },
  };
}

// ScriptApp simulado: solo triggers de tiempo.
function crearScriptApp(triggers, permisos, servicio) {
  return {
    AuthMode: { FULL: 'FULL' },
    requireAllScopes: modo => { permisos.push(modo); },
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    getService: () => ({ getUrl: () => servicio.url }),
    newTrigger: funcion => ({
      timeBased: () => {
        const t = { funcion: funcion, cada: null, hora: null, getHandlerFunction: () => funcion };
        const b = {
          everyMinutes: n => {
            if ([1, 5, 10, 15, 30].indexOf(n) < 0) throw new Error('Intervalo de minutos inválido: ' + n);
            t.cada = n + ' min';
            return b;
          },
          everyHours: n => { t.cada = n + ' h'; return b; },
          atHour: h => {
            if (!Number.isInteger(h) || h < 0 || h > 23) throw new Error('Hora inválida: ' + h);
            t.hora = h;
            return b;
          },
          everyDays: n => { t.cada = n + ' d'; return b; },
          create: () => { triggers.push(t); return t; },
        };
        return b;
      },
    }),
  };
}

function crearEntorno(opciones = {}) {
  let ahora = new Date(opciones.ahora || '2026-10-13T10:00:00');
  const principal = crearLibro(opciones.idPrincipal || 'libro-principal', opciones.hojas || {});
  const libros = { [principal.getId()]: principal };
  const propiedades = Object.assign({}, opciones.propiedades || {});
  const stats = { locks: 0, aperturas: 0, gmailList: 0, gmailGet: 0, gmailEnBloqueo: 0, enBloqueo: false };
  const gmail = crearGmail(opciones.correos || [], stats, opciones);
  const triggers = [];
  const telegram = { llamadas: [], falla: null, respuestas: {}, contador: 100 };
  const github = { version: '0.0.0', falla: false, llamadas: 0 };
  const servicio = { url: 'https://script.google.com/macros/s/APP-PRUEBA/exec' };
  const ui = {
    menus: [], dialogos: [],
    createMenu: titulo => {
      const menu = { titulo: titulo, items: [] };
      const b = { addItem: (texto, funcion) => { menu.items.push([texto, funcion]); return b; }, addToUi: () => { ui.menus.push(menu); } };
      return b;
    },
    showModalDialog: (salida, titulo) => { ui.dialogos.push({ titulo: titulo, html: salida.getContent() }); },
  };
  const permisosPedidos = [];
  const cache = {};
  let contadorId = 0;
  let contadorLibros = 0;

  class FechaFija extends Date {
    constructor(...args) { if (args.length === 0) super(ahora.getTime()); else super(...args); }
    static now() { return ahora.getTime(); }
  }

  const contexto = vm.createContext({
    console, JSON, Math, Object, Number, String, Array, Error, RegExp, isNaN, isFinite, Date: FechaFija,
    SpreadsheetApp: {
      getUi: () => ui,
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
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { stats.locks++; stats.enBloqueo = true; },
        tryLock: () => { stats.locks++; stats.enBloqueo = true; return true; },
        releaseLock() { stats.enBloqueo = false; },
      }),
      // Bloqueo por usuario: solo evita dos revisiones de correo a la vez.
      getUserLock: () => ({
        tryLock: () => !opciones.lockOcupado,
        releaseLock() {},
      }),
    },
    Gmail: gmail,
    UrlFetchApp: crearUrlFetch(telegram, github),
    CacheService: {
      getScriptCache: () => ({
        get: k => (k in cache ? cache[k] : null),
        put: (k, v) => { cache[k] = String(v); },
        remove: k => { delete cache[k]; },
      }),
    },
    ScriptApp: crearScriptApp(triggers, permisosPedidos, servicio),
    HtmlService: {
      createHtmlOutput: html => {
        const salida = { setWidth: () => salida, setHeight: () => salida, getContent: () => String(html) };
        return salida;
      },
    },
    Utilities: {
      formatDate: (d, tz, patron) => formatear(d, patron),
      getUuid: () => 'id-' + String(++contadorId).padStart(4, '0'),
      base64DecodeWebSafe: s => Array.from(Buffer.from(s, 'base64url')),
      newBlob: bytes => ({ getDataAsString: charset => Buffer.from(bytes).toString(/8859|latin/i.test(charset || '') ? 'latin1' : 'utf8') }),
    },
    Session: { getScriptTimeZone: () => 'America/Lima' },
    Logger: { log() {} },
  });
  for (const archivo of archivosJs(SRC)) {
    vm.runInContext(fs.readFileSync(archivo, 'utf8'), contexto, { filename: path.relative(SRC, archivo) });
  }

  return {
    principal, libros, propiedades, stats, gmail, triggers, telegram, cache, permisosPedidos, github, ui, servicio,
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
