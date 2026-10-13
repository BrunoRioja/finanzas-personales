// Funciones que llama el navegador con google.script.run (sin guion bajo final).

function obtenerCatalogos() {
  const config = leerConfig_();
  const cuentas = leerTabla_('Cuentas');
  const tcUsd = Number(config.ultimo_tc) || 0;
  return {
    cuentas: cuentas,
    categorias: leerTabla_('Categorias'),
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
    if (datos.id) {
      if (!leerTabla_('Cuentas').some(c => c.id === datos.id)) throw new Error('La cuenta ya no existe.');
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
    const categoria = normalizarCategoria_(datos, existentes, datos.id || '');
    if (datos.id) {
      if (!existentes.some(c => c.id === datos.id)) throw new Error('La categoría ya no existe.');
      actualizarFila_('Categorias', datos.id, categoria);
      return Object.assign({ id: datos.id }, categoria);
    }
    const nueva = Object.assign({ id: nuevoId_() }, categoria);
    agregarFilas_('Categorias', [nueva]);
    return nueva;
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
    tcUsd: Number(leerConfig_().ultimo_tc) || 0,
  };
}

function guardarMovimiento(datos) {
  return conBloqueo_(() => {
    const ctx = contextoMovimientos_();
    if (datos.id) {
      const previo = leerTabla_('Movimientos').filter(m => m.id === datos.id)[0];
      if (!previo) throw new Error('El movimiento ya no existe.');
      if (previo.dividido) throw new Error('Este movimiento está dividido; edítalo desde "Dividir".');
      ctx.idsPrevios = [previo.cuenta_id, previo.cuenta_destino_id, previo.categoria_id];
      const mov = normalizarMovimiento_(Object.assign({}, datos, {
        origen: previo.origen, estado: previo.estado, ref_externa: previo.ref_externa,
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
}

function listarMovimientos(filtro) {
  filtro = filtro || {};
  const mes = validarMes_(filtro.mes);
  return leerTabla_('Movimientos')
    .filter(m => mesDe_(m.fecha) === mes)
    .filter(m => !filtro.cuenta_id || m.cuenta_id === filtro.cuenta_id || m.cuenta_destino_id === filtro.cuenta_id)
    .filter(m => !filtro.categoria_id || m.categoria_id === filtro.categoria_id)
    .sort((a, b) => (b.fecha + b.creado_en).localeCompare(a.fecha + a.creado_en));
}

function eliminarMovimiento(id) {
  conBloqueo_(() => eliminarFila_('Movimientos', id));
  return { ok: true };
}

function obtenerDashboard(mes) {
  validarMes_(mes);
  return construirDashboard_({
    movs: leerTabla_('Movimientos'),
    divisiones: leerTabla_('Divisiones'),
    categorias: leerTabla_('Categorias'),
    cuentas: leerTabla_('Cuentas'),
    tcUsd: Number(leerConfig_().ultimo_tc) || 0,
  }, mes);
}
