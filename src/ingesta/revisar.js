// Vuelta de lectura de correos: la ejecuta el trigger y el botón "Revisar ahora".

const MAX_CORREOS_POR_VUELTA = 50;
const MARGEN_CURSOR_MS = 7200000; // 2 horas: correos que Gmail entrega con demora
const MAX_IGNORADOS = 400; // límite de tamaño de una propiedad del script (~9 KB)

function revisarCorreos() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { omitida: true, mensaje: 'Ya hay una revisión en curso.' };
  const inicio = Date.now();
  try {
    migrarSiHaceFalta_();
    const r = revisarCorreosSinBloqueo_(inicio);
    guardarConfig_({
      ultima_revision: formatearFecha_(new Date(inicio), 'yyyy-MM-dd HH:mm:ss'),
      ultima_revision_info: describirRevision_(r, Date.now() - inicio),
    });
    return r;
  } catch (e) {
    registrarLog_('error', 'revisarCorreos', e.message, e.stack);
    try { guardarConfig_({ ultima_revision_info: 'Error: ' + e.message }); } catch { /* ya está en el Log */ }
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function revisarCorreosSinBloqueo_(ahoraMs) {
  const config = leerConfig_();
  const desde = Math.max(inicioDelDia_(config.importar_desde || hoyIso_()), Number(config.cursor_lectura) || 0);
  const conocidos = idsConocidos_();
  const nuevos = buscarIdsCorreos_(desde).filter(id => !conocidos[id]);
  const tanda = nuevos.slice(0, MAX_CORREOS_POR_VUELTA);
  const ctx = {
    cuentas: leerTabla_('Cuentas'), categorias: leerTabla_('Categorias'), reglas: leerTabla_('Reglas'),
    tcUsd: Number(config.ultimo_tc) || 0,
  };
  const movimientos = [];
  const pendientes = [];
  const ignorados = [];
  const aEtiquetar = [];
  tanda.forEach(id => {
    const correo = leerCorreo_(id);
    const leido = leerCorreoBancario_(correo);
    if (!leido) {
      ignorados.push(id);
      return;
    }
    aEtiquetar.push(id);
    if (leido.pendiente) {
      pendientes.push({
        id: nuevoId_(), gmail_id: id, fecha: correo.fecha, remitente: correo.remitente,
        asunto: correo.asunto, resumen: correo.texto.slice(0, 300), estado: 'pendiente',
      });
      return;
    }
    if (leido.crudo.actualiza_tc) ctx.tcUsd = leido.crudo.tc;
    movimientos.push(Object.assign({ id: nuevoId_() }, resolverMovimiento_(leido.crudo, ctx), {
      creado_en: formatearFecha_(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    }));
  });
  agregarFilas_('Movimientos', movimientos);
  agregarFilas_('Pendientes', pendientes);
  recordarIgnorados_(ignorados);
  contarUsosReglas_(movimientos, ctx.reglas);
  const cambios = {};
  if (ctx.tcUsd !== (Number(config.ultimo_tc) || 0)) cambios.ultimo_tc = ctx.tcUsd;
  if (nuevos.length <= MAX_CORREOS_POR_VUELTA) cambios.cursor_lectura = ahoraMs - MARGEN_CURSOR_MS;
  guardarConfig_(cambios);
  let etiquetados = 0;
  if (config.etiquetar !== 'no') {
    aEtiquetar.forEach(id => {
      try {
        etiquetarCorreo_(id);
        etiquetados++;
      } catch (e) {
        registrarLog_('aviso', 'etiquetar', e.message, id);
      }
    });
  }
  return {
    leidos: tanda.length, creados: movimientos.length,
    porRevisar: movimientos.filter(m => m.estado === 'por_revisar').length,
    pendientes: pendientes.length, ignorados: ignorados.length,
    restantes: nuevos.length - tanda.length, etiquetados: etiquetados,
  };
}

function inicioDelDia_(fechaIso) {
  const p = String(fechaIso).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]).getTime();
}

function idsConocidos_() {
  const conocidos = {};
  leerTabla_('Movimientos').forEach(m => {
    if (m.ref_externa.indexOf('gmail:') === 0) conocidos[m.ref_externa.slice(6)] = true;
  });
  leerTabla_('Pendientes').forEach(p => { conocidos[p.gmail_id] = true; });
  idsIgnorados_().forEach(id => { conocidos[id] = true; });
  return conocidos;
}

function idsIgnorados_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('CORREOS_IGNORADOS') || '[]');
}

// Correos leídos que no son operaciones (o movimientos importados que el usuario borró).
function recordarIgnorados_(ids) {
  if (!ids.length) return;
  const todos = idsIgnorados_().concat(ids).slice(-MAX_IGNORADOS);
  PropertiesService.getScriptProperties().setProperty('CORREOS_IGNORADOS', JSON.stringify(todos));
}

function contarUsosReglas_(movimientos, reglas) {
  const usos = {};
  movimientos.forEach(m => { if (m.regla_id) usos[m.regla_id] = (usos[m.regla_id] || 0) + 1; });
  Object.keys(usos).forEach(id => {
    const regla = reglas.filter(r => r.id === id)[0];
    actualizarFila_('Reglas', id, { usos: (Number(regla.usos) || 0) + usos[id] });
  });
}

function describirRevision_(r, ms) {
  const partes = [r.leidos + ' correos', r.creados + ' movimientos'];
  if (r.porRevisar) partes.push(r.porRevisar + ' por revisar');
  if (r.pendientes) partes.push(r.pendientes + (r.pendientes === 1 ? ' no leído' : ' no leídos'));
  if (r.restantes) partes.push('faltan ' + r.restantes);
  partes.push((ms / 1000).toFixed(1) + ' s');
  return partes.join(' · ');
}
