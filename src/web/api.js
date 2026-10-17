// Funciones que llama el navegador con google.script.run (sin guion bajo final).

function obtenerCatalogos() {
  const config = leerConfig_();
  const cuentas = leerTabla_('Cuentas');
  const tcUsd = Number(config.ultimo_tc) || 0;
  return {
    cuentas: cuentas,
    categorias: leerTabla_('Categorias'),
    ambitos: ordenarAmbitos_(leerTabla_('Ambitos')),
    saldos: saldosPorCuenta_(leerTabla_('Movimientos'), cuentas, tcUsd),
    config: {
      nombre: config.nombre || '',
      ultimo_tc: tcUsd,
      moneda_principal: config.moneda_principal || 'PEN',
    },
    opciones: { bancos: BANCOS, tiposCuenta: TIPOS_CUENTA, monedas: MONEDAS },
    modoDemo: PropertiesService.getScriptProperties().getProperty('MODO_DEMO') === 'si',
    urlHoja: abrirLibro_().getUrl(),
  };
}

function guardarCuenta(datos) {
  return conBloqueo_(() => {
    const cuenta = normalizarCuenta_(datos);
    const todas = leerTabla_('Cuentas');
    if (datos.id && !todas.some(c => c.id === datos.id)) throw new Error('La cuenta ya no existe.');
    const otras = todas.filter(c => c.id !== datos.id);
    validarNumerosUnicos_(cuenta, otras);
    if (cuenta.yape) otras.filter(c => c.yape).forEach(c => actualizarFila_('Cuentas', c.id, { yape: false }));
    if (datos.id) {
      actualizarFila_('Cuentas', datos.id, cuenta);
      return Object.assign({ id: datos.id }, cuenta);
    }
    const nueva = Object.assign({ id: nuevoId_() }, cuenta);
    agregarFilas_('Cuentas', [nueva]);
    return nueva;
  });
}

function guardarCategoria(datos) {
  return conBloqueo_(() => {
    const existentes = leerTabla_('Categorias');
    const previa = datos.id ? existentes.filter(c => c.id === datos.id)[0] : null;
    if (datos.id && !previa) throw new Error('La categoría ya no existe.');
    // El editor no envía el rol: sin él se conserva el que ya tenía.
    if (previa && datos.rol === undefined) datos = Object.assign({}, datos, { rol: previa.rol || '' });
    const categoria = normalizarCategoria_(datos, existentes, datos.id || '');
    if (datos.id) {
      actualizarFila_('Categorias', datos.id, categoria);
      return Object.assign({ id: datos.id }, categoria);
    }
    const nueva = Object.assign({ id: nuevoId_() }, categoria);
    agregarFilas_('Categorias', [nueva]);
    return nueva;
  });
}

function guardarAmbito(datos) {
  return conBloqueo_(() => {
    const existentes = leerTabla_('Ambitos');
    const ambito = normalizarAmbito_(datos, existentes, datos.id || '');
    if (datos.id) {
      if (!existentes.some(a => a.id === datos.id)) throw new Error('El ámbito ya no existe.');
      actualizarFila_('Ambitos', datos.id, ambito);
      return Object.assign({ id: datos.id }, ambito);
    }
    const nuevo = Object.assign({ id: nuevoId_() }, ambito);
    agregarFilas_('Ambitos', [nuevo]);
    return nuevo;
  });
}

function guardarAjustes(datos) {
  conBloqueo_(() => {
    const nombre = String(datos.nombre || '').trim();
    if (!nombre) throw new Error('Escribe tu nombre.');
    const tc = Number(datos.ultimo_tc);
    if (!(tc >= 0)) throw new Error('El tipo de cambio debe ser un número positivo.');
    guardarConfig_({ nombre: nombre, ultimo_tc: tc });
  });
  return obtenerCatalogos().config;
}

function contextoMovimientos_() {
  return {
    cuentas: leerTabla_('Cuentas'),
    categorias: leerTabla_('Categorias'),
    ambitos: leerTabla_('Ambitos'),
    tcUsd: Number(leerConfig_().ultimo_tc) || 0,
  };
}

function guardarMovimiento(datos) {
  const resultado = conBloqueo_(() => {
    const ctx = contextoMovimientos_();
    if (datos.id) {
      const previo = leerTabla_('Movimientos').filter(m => m.id === datos.id)[0];
      if (!previo) throw new Error('El movimiento ya no existe.');
      if (previo.dividido) throw new Error('Este movimiento está dividido; edítalo desde "Dividir".');
      ctx.idsPrevios = [previo.cuenta_id, previo.cuenta_destino_id, previo.categoria_id, previo.ambito_id];
      // Si la moneda no cambia se conserva el tipo de cambio original: editar una nota
      // no debe recalcular en silencio el monto en soles de un gasto pasado.
      const mismaMoneda = (datos.moneda || previo.moneda) === previo.moneda;
      const tc = datos.tc || (mismaMoneda ? previo.tc : undefined);
      const mov = normalizarMovimiento_(Object.assign({}, datos, {
        // Completar un "por revisar" desde el formulario lo confirma (normalizar exige cuenta y categoría).
        tc: tc, origen: previo.origen, estado: previo.estado === 'por_revisar' ? 'confirmado' : previo.estado,
        ref_externa: previo.ref_externa,
      }), ctx);
      actualizarFila_('Movimientos', previo.id, mov);
      return Object.assign({ id: previo.id }, mov, { creado_en: previo.creado_en });
    }
    const nuevo = Object.assign({ id: nuevoId_() }, normalizarMovimiento_(datos, ctx), {
      creado_en: formatearFecha_(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    });
    agregarFilas_('Movimientos', [nuevo]);
    return nuevo;
  });
  revisarPresupuestos_();
  return resultado;
}

function listarMovimientos(filtro) {
  filtro = filtro || {};
  const mes = validarMes_(filtro.mes);
  const ambitos = leerTabla_('Ambitos');
  const partes = {};
  leerTabla_('Divisiones').forEach(d => { (partes[d.movimiento_id] = partes[d.movimiento_id] || []).push(d); });
  return leerTabla_('Movimientos')
    .filter(m => mesDe_(m.fecha) === mes)
    .map(m => Object.assign(m, { ambitos: ambitosDeMovimiento_(m, partes[m.id], ambitos) }))
    .filter(m => !filtro.cuenta_id || m.cuenta_id === filtro.cuenta_id || m.cuenta_destino_id === filtro.cuenta_id)
    .filter(m => !filtro.categoria_id || m.categoria_id === filtro.categoria_id)
    .filter(m => !filtro.ambito_id || m.ambitos.indexOf(filtro.ambito_id) >= 0)
    .sort((a, b) => (b.fecha + b.creado_en).localeCompare(a.fecha + a.creado_en));
}

function eliminarMovimiento(id) {
  conBloqueo_(() => {
    const mov = leerTabla_('Movimientos').filter(m => m.id === id)[0];
    eliminarFila_('Movimientos', id); // lanza "No existe" si ya no está
    borrarDivisiones_(id);
    // Un importado que el usuario borra (p. ej. duplicado) no debe volver en la siguiente lectura.
    // Se guarda en Pendientes (sin tope de tamaño) como "eliminado", no en la lista de ignorados.
    if (mov && mov.ref_externa.indexOf('gmail:') === 0) {
      agregarFilas_('Pendientes', [{
        id: nuevoId_(), gmail_id: mov.ref_externa.slice(6), fecha: mov.fecha, remitente: '',
        asunto: '(movimiento eliminado)', resumen: mov.comercio, estado: 'eliminado',
      }]);
    }
  });
  revisarPresupuestos_();
  return { ok: true };
}

function obtenerDashboard(mes) {
  validarMes_(mes);
  const movs = leerTabla_('Movimientos');
  const divisiones = leerTabla_('Divisiones');
  const categorias = leerTabla_('Categorias');
  const dashboard = construirDashboard_({
    movs: movs,
    divisiones: divisiones,
    categorias: categorias,
    ambitos: leerTabla_('Ambitos'),
    cuentas: leerTabla_('Cuentas'),
    tcUsd: Number(leerConfig_().ultimo_tc) || 0,
  }, mes);
  dashboard.porRevisar = movs.filter(m => m.estado === 'por_revisar').length +
    leerTabla_('Pendientes').filter(p => p.estado === 'pendiente').length;
  dashboard.presupuesto = presupuestoVsReal_(lineasCategoria_(movs, divisiones),
    presupuestosVigentes_(leerTabla_('Presupuestos'), mes), categorias, mes, hoyIso_());
  dashboard.proximosPagos = mes === mesDe_(hoyIso_()) ? proximosPagosDeHoy_(movs) : null;
  return dashboard;
}
