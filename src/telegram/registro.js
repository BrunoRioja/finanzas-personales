// Gastos escritos en el chat: se guardan con origen "telegram" y se pueden deshacer.

function contextoBot_() {
  return {
    cuentas: leerTabla_('Cuentas'),
    categorias: leerTabla_('Categorias'),
    ambitos: leerTabla_('Ambitos'),
    urlApp: PropertiesService.getScriptProperties().getProperty('APP_URL') || '',
    hoy: hoyIso_(),
  };
}

function registrarEscrito_(texto, updateId) {
  return conBloqueo_(() => {
    const config = leerConfig_();
    const cuentas = leerTabla_('Cuentas');
    const reglas = leerTabla_('Reglas');
    const leido = leerEscrito_(texto, { cuentas: cuentas, categorias: leerTabla_('Categorias'), reglas: reglas, ambitos: leerTabla_('Ambitos'), cuentaBot: config.cuenta_bot || '' });
    if (!leido.ok) return { error: leido.error };
    const cuenta = cuentas.filter(c => c.id === leido.cuenta_id)[0];
    const tc = cuenta.moneda === 'PEN' ? 1 : Number(config.ultimo_tc) || 0;
    if (!tc) return { error: 'Configura el tipo de cambio en Ajustes para registrar en ' + cuenta.moneda + '.' };
    const categorias = leerTabla_('Categorias');
    const rol = rolDe_(categorias, leido.categoria_id);
    // Un reembolso necesita saber de qué préstamo es: queda por revisar y se completa con "¿de qué?".
    const categoriaId = rol === 'reembolso' ? '' : leido.categoria_id;
    const mov = {
      id: nuevoId_(), fecha: hoyIso_(), tipo: leido.tipo, monto: leido.monto, moneda: cuenta.moneda, tc: tc,
      monto_pen: redondear2_(leido.monto * tc), cuenta_id: cuenta.id, cuenta_destino_id: '', categoria_id: categoriaId,
      comercio: leido.descripcion, descripcion: '', origen: 'telegram', estado: categoriaId ? 'confirmado' : 'por_revisar',
      ref_externa: 'tg:' + updateId, dividido: false, ambito_id: leido.ambito_id, creado_en: formatearFecha_(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    };
    if (rol === 'prestamo') sincronizarPrestamos_(null, mov);
    agregarFilas_('Movimientos', [mov]);
    if (leido.regla_id) contarUsosReglas_([{ regla_id: leido.regla_id }], reglas);
    return { mov: mov, rol: rol, prestamo: rol === 'prestamo' ? prestamoDeMovimiento_(mov.id) : null };
  });
}

function manejarEscrito_(texto, updateId) {
  const r = registrarEscrito_(texto, updateId);
  if (r.error) return enviarMensaje_(r.error);
  const ctx = contextoBot_();
  if (r.rol === 'reembolso' && r.mov.estado === 'por_revisar' && r.mov.tipo === 'ingreso') {
    const m = mensajeReembolsoDe_(r.mov, ctx);
    return enviarMensaje_(m.texto, m.teclado);
  }
  if (r.prestamo) {
    const m = mensajePrestamo_(Object.assign({}, r.prestamo, { nuevo: true }), r.mov, ctx);
    return enviarMensaje_(m.texto, m.teclado);
  }
  if (r.mov.estado === 'por_revisar') {
    const frecuentes = categoriasFrecuentes_(leerTabla_('Movimientos'), ctx.categorias)[r.mov.tipo] || [];
    const m = mensajePorRevisar_(r.mov, frecuentes, ctx);
    return enviarMensaje_(m.texto, m.teclado);
  }
  return enviarMensaje_(textoRegistrado_(r.mov, ctx), tecladoRegistrado_(r.mov, ctx));
}

// /deshacer: el movimiento del bot más reciente de las últimas 24 horas.
function deshacerUltimo_() {
  const borrado = conBloqueo_(() => {
    const limite = formatearFecha_(new Date(Date.now() - 86400000), 'yyyy-MM-dd HH:mm:ss');
    const mov = leerTabla_('Movimientos').filter(m => m.origen === 'telegram' && m.creado_en >= limite)
      .sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0];
    if (!mov) return null;
    sincronizarPrestamos_(mov, null);
    eliminarFila_('Movimientos', mov.id);
    borrarDivisiones_(mov.id);
    return mov;
  });
  if (!borrado) return enviarMensaje_('No hay movimientos registrados por el bot en las últimas 24 horas.');
  return enviarMensaje_('↩ Borré ' + formatoMonto_(borrado.monto, borrado.moneda) + ' · ' + escaparHtml_(borrado.comercio));
}
