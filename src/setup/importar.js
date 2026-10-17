// Actualizar = copiar la plantilla nueva + importar los datos de la hoja anterior. Lee por
// encabezados, así que sirve para hojas de versiones anteriores del esquema. No copia el
// Log, los correos no leídos, la configuración de lectura ni los secretos (no están en la hoja).

const TABLAS_IMPORTABLES = ['Cuentas', 'Categorias', 'Ambitos', 'Movimientos', 'Divisiones', 'Reglas', 'Presupuestos', 'Recurrentes', 'EstadosCuenta', 'Prestamos', 'Abonos'];
const CONFIG_IMPORTABLE = ['nombre', 'moneda_principal', 'ultimo_tc', 'hora_resumen', 'horario_inicio', 'horario_fin', 'etiquetar'];

function idDeHoja_(enlace) {
  const texto = String(enlace == null ? '' : enlace).trim();
  const m = /\/d\/([\w-]{20,})/.exec(texto);
  if (m) return m[1];
  if (/^[\w-]{20,}$/.test(texto)) return texto;
  throw new Error('Pega el enlace de tu hoja anterior.');
}

// Una tabla que no existe en la hoja anterior (esquema viejo) se importa vacía.
function leerTablaDe_(libro, nombre) {
  const hoja = libro.getSheetByName(nombre);
  return hoja ? filasDe_(hoja, nombre) : [];
}

function importarHojaAnterior(enlace) {
  const id = idDeHoja_(enlace);
  if (PropertiesService.getScriptProperties().getProperty('MODO_DEMO') === 'si') {
    throw new Error('Sal del modo demo para importar tus datos.');
  }
  return conBloqueo_(() => {
    const libro = abrirLibro_();
    if (estaInstalado_(libro)) throw new Error('Esta app ya está instalada; importa en una copia nueva de la plantilla.');
    if (id === libro.getId()) throw new Error('Ese enlace es esta misma hoja.');
    // Una importación cortada a medias (p. ej. por el límite de 6 minutos) deja filas: repetirla las duplicaría.
    const conDatos = TABLAS_IMPORTABLES.filter(t => libro.getSheetByName(t) && filasDe_(libro.getSheetByName(t), t).length);
    if (conDatos.length) {
      throw new Error('Esta copia ya tiene datos de un intento anterior (' + conDatos.join(', ') + '). Haz una copia nueva de la plantilla e importa ahí.');
    }
    let anterior;
    try {
      anterior = SpreadsheetApp.openById(id);
    } catch {
      throw new Error('No pude abrir esa hoja. ¿Es tuya y el enlace está completo?');
    }
    const config = {};
    leerTablaDe_(anterior, 'Config').forEach(f => { config[f.clave] = f.valor; });
    if (config.instalado !== 'si') throw new Error('Esa hoja no es de la app (o no terminó la instalación).');
    // Se lee todo antes de escribir: si algo falla, la copia nueva queda intacta.
    const datos = {};
    TABLAS_IMPORTABLES.forEach(t => { datos[t] = leerTablaDe_(anterior, t); });
    crearHojas_(libro);
    TABLAS_IMPORTABLES.forEach(t => agregarFilas_(t, datos[t]));
    asegurarAmbitos_();
    asegurarRolesPrestamo_();
    const cambios = {};
    CONFIG_IMPORTABLE.forEach(k => { if (k in config) cambios[k] = config[k]; });
    guardarConfig_(Object.assign(cambios, { version_esquema: VERSION_ESQUEMA, instalado: 'si' }));
    const importado = {};
    TABLAS_IMPORTABLES.forEach(t => { importado[t] = datos[t].length; });
    return { importado: importado, estado: estadoActual_() };
  });
}
