// Activar/desactivar la lectura de correos y elegir cada cuánto se revisa.

const FRECUENCIAS_LECTURA = ['5', '15', '30', '60', 'manual', 'apagada'];
const HORARIO_INICIO_POR_DEFECTO = 7;
const HORARIO_FIN_POR_DEFECTO = 24;

function horaConfig_(valor, porDefecto) {
  const n = Number(valor);
  return valor === undefined || valor === null || valor === '' || isNaN(n) ? porDefecto : n;
}

function configurarLectura(datos) {
  const frecuencia = String(datos.frecuencia);
  if (FRECUENCIAS_LECTURA.indexOf(frecuencia) < 0) throw new Error('Frecuencia inválida: ' + frecuencia);
  conBloqueo_(() => {
    const actual = leerConfig_();
    const inicio = horaConfig_(datos.horario_inicio, horaConfig_(actual.horario_inicio, HORARIO_INICIO_POR_DEFECTO));
    const fin = horaConfig_(datos.horario_fin, horaConfig_(actual.horario_fin, HORARIO_FIN_POR_DEFECTO));
    if (!Number.isInteger(inicio) || !Number.isInteger(fin) || inicio < 0 || fin > 24 || inicio >= fin) {
      throw new Error('El horario de lectura debe ir de 0 a 24 y empezar antes de terminar.');
    }
    borrarTriggersLectura_();
    if (/^\d+$/.test(frecuencia)) crearTriggerLectura_(Number(frecuencia));
    const cambios = {
      lectura_activa: frecuencia === 'apagada' ? 'no' : 'si',
      lectura_minutos: frecuencia,
      etiquetar: datos.etiquetar === false ? 'no' : 'si',
      horario_inicio: inicio,
      horario_fin: fin,
    };
    if (!actual.importar_desde && frecuencia !== 'apagada') cambios.importar_desde = hoyIso_().slice(0, 8) + '01';
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
    horario_inicio: horaConfig_(c.horario_inicio, HORARIO_INICIO_POR_DEFECTO),
    horario_fin: horaConfig_(c.horario_fin, HORARIO_FIN_POR_DEFECTO),
  };
}

// Borra los importados que siguen sin cuenta (por números que faltaban) y los vuelve a
// leer de Gmail con los números ya corregidos. No toca nada que el usuario haya revisado.
function releerSinCuenta() {
  if (PropertiesService.getScriptProperties().getProperty('MODO_DEMO') === 'si') {
    throw new Error('Sal del modo demo para volver a leer tus correos.');
  }
  const borrados = conBloqueo_(() => {
    const sinCuenta = leerTabla_('Movimientos').filter(m => m.origen === 'gmail' && m.estado === 'por_revisar' &&
      !m.dividido && (!m.cuenta_id || (m.tipo === 'transferencia' && !m.cuenta_destino_id)));
    sinCuenta.forEach(m => eliminarFila_('Movimientos', m.id));
    guardarConfig_({ cursor_lectura: 0 });
    return sinCuenta.length;
  });
  return Object.assign({ borrados: borrados }, revisarCorreos());
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
