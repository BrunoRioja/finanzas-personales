// Activar/desactivar la lectura de correos y elegir cada cuánto se revisa.

const FRECUENCIAS_LECTURA = ['5', '15', '30', '60', 'manual', 'apagada'];

function configurarLectura(datos) {
  const frecuencia = String(datos.frecuencia);
  if (FRECUENCIAS_LECTURA.indexOf(frecuencia) < 0) throw new Error('Frecuencia inválida: ' + frecuencia);
  conBloqueo_(() => {
    borrarTriggersLectura_();
    if (/^\d+$/.test(frecuencia)) crearTriggerLectura_(Number(frecuencia));
    const cambios = {
      lectura_activa: frecuencia === 'apagada' ? 'no' : 'si',
      lectura_minutos: frecuencia,
      etiquetar: datos.etiquetar === false ? 'no' : 'si',
    };
    if (!leerConfig_().importar_desde && frecuencia !== 'apagada') cambios.importar_desde = hoyIso_().slice(0, 8) + '01';
    guardarConfig_(cambios);
  });
  return estadoLectura();
}

function estadoLectura() {
  const c = leerConfig_();
  return {
    activa: c.lectura_activa === 'si',
    frecuencia: c.lectura_minutos || 'apagada',
    etiquetar: c.etiquetar !== 'no',
    importar_desde: c.importar_desde || '',
    ultima_revision: c.ultima_revision || '',
    info: c.ultima_revision_info || '',
  };
}

function importarCorreosDesde(fechaIso) {
  if (!esFechaIso_(fechaIso)) throw new Error('Fecha inválida: usa aaaa-mm-dd.');
  if (fechaIso > hoyIso_()) throw new Error('La fecha no puede estar en el futuro.');
  conBloqueo_(() => guardarConfig_({ importar_desde: fechaIso, cursor_lectura: 0 }));
  return revisarCorreos();
}

function crearTriggerLectura_(minutos) {
  const constructor = ScriptApp.newTrigger('revisarCorreos').timeBased();
  (minutos === 60 ? constructor.everyHours(1) : constructor.everyMinutes(minutos)).create();
}

function borrarTriggersLectura_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'revisarCorreos')
    .forEach(t => ScriptApp.deleteTrigger(t));
}
