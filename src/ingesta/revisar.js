// Vuelta de lectura de correos: la ejecuta el trigger y el botón "Revisar ahora".

const MAX_CORREOS_POR_VUELTA = 50;
const MARGEN_CURSOR_MS = 7200000; // 2 horas: correos que Gmail entrega con demora
const MAX_IGNORADOS = 400; // límite de tamaño de una propiedad del script (~9 KB)

// `evento` solo existe cuando la llama el trigger; "Revisar ahora" e "Importar" no lo pasan
// y por eso leen a cualquier hora.
function revisarCorreos(evento) {
  if (PropertiesService.getScriptProperties().getProperty('MODO_DEMO') === 'si') {
    return { omitida: true, mensaje: 'Modo demo activo: la lectura de correos espera a que salgas del modo demo.' };
  }
  if (evento && typeof evento === 'object') {
    const fuera = fueraDeHorario_();
    if (fuera) return fuera;
  }
  // El bloqueo por usuario solo evita dos revisiones a la vez; el de escritura (conBloqueo_)
  // se toma únicamente para guardar, para no frenar a la app mientras se descargan correos.
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { omitida: true, mensaje: 'Ya hay una revisión en curso.' };
  const inicio = Date.now();
  try {
    asegurarEsquema_();
    const r = revisarCorreosSinBloqueo_(inicio);
    conBloqueo_(() => guardarConfig_({
      ultima_revision: formatearFecha_(new Date(inicio), 'yyyy-MM-dd HH:mm:ss'),
      ultima_revision_info: describirRevision_(r, Date.now() - inicio),
    }));
    return r;
  } catch (e) {
    try {
      conBloqueo_(() => {
        registrarLog_('error', 'revisarCorreos', e.message, e.stack);
        guardarConfig_({ ultima_revision_info: 'Error: ' + e.message });
      });
    } catch { /* sin hoja no hay dónde registrar */ }
    if (evento && typeof evento === 'object') avisarError_('la lectura de correos', e);
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
  // Descarga y lectura de correos: fuera del bloqueo de escritura.
  const leidos = nuevos.slice(0, MAX_CORREOS_POR_VUELTA).map(id => {
    const correo = leerCorreo_(id);
    return { id: id, correo: correo, leido: leerCorreoBancario_(correo) };
  });
  const r = conBloqueo_(() => guardarLeidos_(leidos, nuevos.length, ahoraMs));
  let etiquetados = 0;
  const avisos = [];
  if (leerConfig_().etiquetar !== 'no') {
    r.aEtiquetar.forEach(id => {
      try {
        etiquetarCorreo_(id);
        etiquetados++;
      } catch (e) {
        avisos.push([e.message, id]);
      }
    });
  }
  if (avisos.length) conBloqueo_(() => avisos.forEach(a => registrarLog_('aviso', 'etiquetar', a[0], a[1])));
  avisarPorRevisar_(r.nuevosPorRevisar);
  avisarEstadosCuenta_(r.estadosCuenta);
  if (r.creados) revisarPresupuestos_();
  return {
    leidos: leidos.length, creados: r.creados, porRevisar: r.porRevisar, pendientes: r.pendientes,
    ignorados: r.ignorados, restantes: nuevos.length - leidos.length, etiquetados: etiquetados, estadosCuenta: r.estadosCuenta.length,
  };
}

// Dentro del bloqueo: vuelve a mirar qué correos ya se guardaron y escribe los nuevos.
function guardarLeidos_(leidos, totalNuevos, ahoraMs) {
  const config = leerConfig_();
  const conocidos = idsConocidos_();
  const ctx = {
    cuentas: leerTabla_('Cuentas'), categorias: leerTabla_('Categorias'), reglas: leerTabla_('Reglas'),
    tcUsd: Number(config.ultimo_tc) || 0,
  };
  const movimientos = [];
  const pendientes = [];
  const ignorados = [];
  const aEtiquetar = [];
  const estados = [];
  leidos.forEach(l => {
    if (conocidos[l.id]) return;
    if (!l.leido) {
      ignorados.push(l.id);
      return;
    }
    aEtiquetar.push(l.id);
    const tarjetas = l.leido.estadoCuenta ? tarjetasEstadoCuenta_(ctx.cuentas) : [];
    if (l.leido.pendiente || (l.leido.estadoCuenta && !tarjetas.length)) {
      pendientes.push({
        id: nuevoId_(), gmail_id: l.id, fecha: l.correo.fecha, remitente: l.correo.remitente, asunto: l.correo.asunto,
        resumen: (l.leido.pendiente ? '' : 'No hay una tarjeta de crédito BCP activa para este estado de cuenta. ') + l.correo.texto.slice(0, 300),
        estado: 'pendiente',
      });
      return;
    }
    if (l.leido.estadoCuenta) {
      if (tarjetas.length > 1) registrarLog_('aviso', 'estado de cuenta', 'Hay varias tarjetas de crédito BCP; se usó "' + tarjetas[0].nombre + '".', l.id);
      estados.push(Object.assign({ id: nuevoId_(), cuenta_id: tarjetas[0].id }, l.leido.estadoCuenta));
      return;
    }
    if (l.leido.crudo.actualiza_tc) ctx.tcUsd = l.leido.crudo.tc;
    movimientos.push(Object.assign({ id: nuevoId_() }, resolverMovimiento_(l.leido.crudo, ctx), {
      creado_en: formatearFecha_(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    }));
  });
  agregarFilas_('Movimientos', movimientos);
  agregarFilas_('Pendientes', pendientes);
  agregarFilas_('EstadosCuenta', estados);
  recordarIgnorados_(ignorados);
  contarUsosReglas_(movimientos, ctx.reglas);
  const cambios = {};
  if (ctx.tcUsd !== (Number(config.ultimo_tc) || 0)) cambios.ultimo_tc = ctx.tcUsd;
  if (totalNuevos <= MAX_CORREOS_POR_VUELTA) cambios.cursor_lectura = ahoraMs - MARGEN_CURSOR_MS;
  guardarConfig_(cambios);
  return {
    creados: movimientos.length, porRevisar: movimientos.filter(m => m.estado === 'por_revisar').length,
    pendientes: pendientes.length, ignorados: ignorados.length, aEtiquetar: aEtiquetar,
    nuevosPorRevisar: movimientos.filter(m => m.estado === 'por_revisar'),
    estadosCuenta: estados,
  };
}

// El correo del estado de cuenta no trae los últimos 4 dígitos: va a la tarjeta de crédito
// BCP activa (la primera, si hay varias).
function tarjetasEstadoCuenta_(cuentas) {
  return cuentas.filter(c => c.activa && c.tipo === 'credito' && c.banco === 'BCP');
}

// Sin tocar Gmail: de madrugada el trigger termina al instante.
function fueraDeHorario_() {
  const config = leerConfig_();
  const inicio = horaConfig_(config.horario_inicio, HORARIO_INICIO_POR_DEFECTO);
  const fin = horaConfig_(config.horario_fin, HORARIO_FIN_POR_DEFECTO);
  const hora = Number(formatearFecha_(new Date(), 'HH'));
  if (hora >= inicio && hora < fin) return null;
  return { omitida: true, mensaje: 'Fuera del horario de lectura (' + inicio + ':00 a ' + fin + ':00).' };
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
  leerTabla_('EstadosCuenta').forEach(x => {
    if (String(x.ref_externa).indexOf('gmail:') === 0) conocidos[x.ref_externa.slice(6)] = true;
  });
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
  if (r.estadosCuenta) partes.push(r.estadosCuenta + (r.estadosCuenta === 1 ? ' estado de cuenta' : ' estados de cuenta'));
  if (r.restantes) partes.push('faltan ' + r.restantes);
  partes.push((ms / 1000).toFixed(1) + ' s');
  return partes.join(' · ');
}
