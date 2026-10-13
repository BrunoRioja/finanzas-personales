// Funciones que llama el navegador con google.script.run (sin guion bajo final).

function obtenerCatalogos() {
  const config = leerConfig_();
  return {
    cuentas: leerTabla_('Cuentas'),
    categorias: leerTabla_('Categorias'),
    config: {
      nombre: config.nombre || '',
      ultimo_tc: Number(config.ultimo_tc) || 0,
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
