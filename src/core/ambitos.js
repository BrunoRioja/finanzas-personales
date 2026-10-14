// Ámbitos de gasto: para qué se gastó (Personal, Diversión…), independiente de la categoría.
// Vacío = Personal: es la única forma en que se guarda Personal. Solo aplica a gastos.

const AMBITO_PERSONAL = 'personal';
const AMBITOS_POR_DEFECTO = [['Diversión', '🎉'], ['Familia', '👨‍👩‍👧'], ['Trabajo', '💼']];

function ambitoPersonal_() {
  return { id: AMBITO_PERSONAL, nombre: 'Personal', emoji: '🙋', orden: 1, activo: true };
}

function ambitosIniciales_() {
  return [ambitoPersonal_()].concat(AMBITOS_POR_DEFECTO.map((a, i) => ({
    id: nuevoId_(), nombre: a[0], emoji: a[1], orden: i + 2, activo: true,
  })));
}

function ordenarAmbitos_(ambitos) {
  return (ambitos || []).slice().sort((a, b) => a.orden - b.orden);
}

function ambitoEfectivo_(id, ambitos) {
  return id && (ambitos || []).some(a => a.id === id) ? id : AMBITO_PERSONAL;
}

// Lo que se escribe en Movimientos/Divisiones. Un ámbito desactivado solo vale si ya era el previo.
function ambitoParaGuardar_(tipo, ambitoId, ambitos, idsPrevios) {
  const id = String(ambitoId || '');
  if (tipo !== 'gasto' || !id || id === AMBITO_PERSONAL) return '';
  const ambito = (ambitos || []).filter(a => a.id === id)[0];
  if (!ambito) throw new Error('Ámbito inválido.');
  if (!ambito.activo && (idsPrevios || []).indexOf(id) < 0) throw new Error('El ámbito "' + ambito.nombre + '" está desactivado.');
  return id;
}

// Ámbitos efectivos de un movimiento: los de sus partes si está dividido.
function ambitosDeMovimiento_(mov, partes, ambitos) {
  if (mov.tipo !== 'gasto') return [];
  const fuente = mov.dividido && partes && partes.length ? partes : [mov];
  const ids = fuente.map(p => ambitoEfectivo_(p.ambito_id, ambitos));
  return ids.filter((id, i) => ids.indexOf(id) === i);
}

// `existentes` = ámbitos guardados; `idActual` = el que se edita ('' si es nuevo).
function normalizarAmbito_(datos, existentes, idActual) {
  const nombre = String(datos.nombre || '').trim();
  if (!nombre) throw new Error('El ámbito necesita un nombre.');
  const repetido = existentes.some(a => a.id !== idActual && normalizarTexto_(a.nombre) === normalizarTexto_(nombre));
  if (repetido) throw new Error('Ya existe el ámbito "' + nombre + '".');
  const actual = existentes.filter(a => a.id === idActual)[0];
  const orden = actual ? actual.orden : existentes.reduce((m, a) => Math.max(m, Number(a.orden) || 0), 0) + 1;
  return {
    nombre: nombre, emoji: String(datos.emoji || '').trim(), orden: orden,
    activo: idActual === AMBITO_PERSONAL || datos.activo !== false,
  };
}

// Dentro del bloqueo: llena la hoja vacía y repone Personal si alguien lo borró a mano.
function asegurarAmbitos_() {
  const actuales = leerTabla_('Ambitos');
  if (!actuales.length) {
    agregarFilas_('Ambitos', ambitosIniciales_());
  } else if (!actuales.some(a => a.id === AMBITO_PERSONAL)) {
    agregarFilas_('Ambitos', [Object.assign(ambitoPersonal_(), { orden: 0 })]);
  }
}
