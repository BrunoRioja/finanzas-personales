// Única capa que toca Gmail (servicio avanzado Gmail API v1, permiso gmail.modify).
// La app solo busca, lee y agrega una etiqueta; nunca borra ni envía correos.

const ETIQUETA_PROCESADO = 'Finanzas/Procesado';

// Ids de correos bancarios recibidos desde `desdeMs`, del más antiguo al más nuevo.
function buscarIdsCorreos_(desdeMs) {
  const consulta = 'from:(' + REMITENTES_BANCARIOS.join(' OR ') + ') after:' + Math.floor(desdeMs / 1000);
  const ids = [];
  let pagina;
  do {
    const r = Gmail.Users.Messages.list('me', { q: consulta, maxResults: 500, pageToken: pagina });
    (r.messages || []).forEach(m => ids.push(m.id));
    pagina = r.nextPageToken;
  } while (pagina && ids.length < 2000);
  return ids.reverse();
}

function leerCorreo_(id) {
  const m = Gmail.Users.Messages.get('me', id, { format: 'full' });
  const cabecera = nombre => (((m.payload && m.payload.headers) || []).filter(h => h.name.toLowerCase() === nombre)[0] || {}).value || '';
  const de = cabecera('from');
  // La dirección real es el último <...>: el nombre visible puede imitar otra dirección.
  const direccion = /<([^<>]+)>\s*$/.exec(de);
  return {
    id: id,
    remitente: (direccion ? direccion[1] : de).trim().toLowerCase(),
    asunto: cabecera('subject'),
    texto: htmlATexto_(buscarParte_(m.payload, 'text/html') || buscarParte_(m.payload, 'text/plain')),
    fecha: formatearFecha_(new Date(Number(m.internalDate))),
  };
}

function buscarParte_(parte, tipo) {
  if (!parte) return '';
  if (parte.mimeType === tipo && parte.body && parte.body.data) {
    // El servicio avanzado puede entregar body.data como texto base64url o como bytes.
    const datos = parte.body.data;
    const bytes = typeof datos === 'string' ? Utilities.base64DecodeWebSafe(datos) : datos;
    return Utilities.newBlob(bytes).getDataAsString(charsetDe_(parte));
  }
  const hijos = parte.parts || [];
  for (let i = 0; i < hijos.length; i++) {
    const encontrado = buscarParte_(hijos[i], tipo);
    if (encontrado) return encontrado;
  }
  return '';
}

function charsetDe_(parte) {
  const tipo = ((parte.headers || []).filter(h => h.name.toLowerCase() === 'content-type')[0] || {}).value || '';
  const m = /charset="?([\w-]+)"?/i.exec(tipo);
  return m ? m[1] : 'UTF-8';
}

function etiquetarCorreo_(id) {
  try {
    Gmail.Users.Messages.modify({ addLabelIds: [idEtiqueta_()] }, 'me', id);
  } catch {
    // La etiqueta guardada pudo ser borrada en Gmail: se vuelve a buscar o crear una vez.
    PropertiesService.getScriptProperties().deleteProperty('ETIQUETA_ID');
    Gmail.Users.Messages.modify({ addLabelIds: [idEtiqueta_()] }, 'me', id);
  }
}

function idEtiqueta_() {
  const props = PropertiesService.getScriptProperties();
  const guardada = props.getProperty('ETIQUETA_ID');
  if (guardada) return guardada;
  const existente = (Gmail.Users.Labels.list('me').labels || []).filter(l => l.name === ETIQUETA_PROCESADO)[0];
  const etiqueta = existente || Gmail.Users.Labels.create({ name: ETIQUETA_PROCESADO, labelListVisibility: 'labelShow', messageListVisibility: 'show' }, 'me');
  props.setProperty('ETIQUETA_ID', etiqueta.id);
  return etiqueta.id;
}
