// Sección "Acerca de" de Ajustes: versión instalada y botón "Buscar actualizaciones". La
// consulta a GitHub es manual (solo al tocar el botón): lee el package.json público del
// repositorio y no envía ningún dato de la persona.

const URL_PAQUETE_PUBLICADO = 'https://raw.githubusercontent.com/BrunoRioja/finanzas-personales/main/package.json';

function estadoVersion() {
  return {
    actual: VERSION_APP, repo: URL_REPO,
    cambios: URL_REPO + '/blob/main/CHANGELOG.md', actualizar: URL_REPO + '/blob/main/docs/actualizar.md',
  };
}

// Versión publicada en GitHub, o null si no se pudo consultar. Nunca lanza.
function ultimaVersionPublicada_() {
  try {
    const r = UrlFetchApp.fetch(URL_PAQUETE_PUBLICADO, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return null;
    return String(JSON.parse(r.getContentText()).version || '') || null;
  } catch {
    return null;
  }
}

function buscarActualizacion() {
  const ultima = ultimaVersionPublicada_();
  return Object.assign(estadoVersion(), {
    ultima: ultima || '', hayNueva: !!ultima && compararVersiones_(ultima, VERSION_APP) > 0, error: !ultima,
  });
}
