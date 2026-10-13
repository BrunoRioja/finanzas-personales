// Asistente de instalación: primera configuración de cada persona.

function datosAsistente() {
  return {
    bancos: BANCOS,
    tiposCuenta: TIPOS_CUENTA,
    monedas: MONEDAS,
    categorias: CATEGORIAS_POR_DEFECTO.map(c => ({ nombre: c[0], emoji: c[1], tipo: c[2] })),
  };
}

function estaInstalado_(libro) {
  return !!libro.getSheetByName('Config') && leerConfig_().instalado === 'si';
}

function estadoInstalacion() {
  const instalado = estaInstalado_(abrirLibro_());
  return {
    instalado: instalado,
    modoDemo: PropertiesService.getScriptProperties().getProperty('MODO_DEMO') === 'si',
  };
}

// Valida todo antes de crear hojas: si algo falla, el libro queda intacto.
function completarAsistente(datos) {
  return conBloqueo_(() => {
    const libro = abrirLibro_();
    if (estaInstalado_(libro)) throw new Error('La app ya está instalada. Cambia tus datos desde Ajustes.');
    const nombre = String(datos.nombre || '').trim();
    if (!nombre) throw new Error('Escribe tu nombre.');
    const tc = datos.tc_usd === '' || datos.tc_usd == null ? 0 : Number(datos.tc_usd);
    if (!(tc >= 0)) throw new Error('El tipo de cambio debe ser un número positivo.');
    const cuentas = (datos.cuentas || []).map(c => Object.assign({ id: nuevoId_() }, normalizarCuenta_(c)));
    if (!cuentas.length) throw new Error('Agrega al menos una cuenta.');
    const fuente = datos.categorias && datos.categorias.length ? datos.categorias : datosAsistente().categorias;
    const categorias = [];
    fuente.forEach(c => categorias.push(Object.assign({ id: nuevoId_() }, normalizarCategoria_(c, categorias, ''))));
    if (!categorias.some(c => c.tipo === 'gasto') || !categorias.some(c => c.tipo === 'ingreso')) {
      throw new Error('Necesitas al menos una categoría de gasto y una de ingreso.');
    }
    crearHojas_(libro);
    agregarFilas_('Cuentas', cuentas);
    agregarFilas_('Categorias', categorias);
    guardarConfig_({
      nombre: nombre, moneda_principal: 'PEN', ultimo_tc: tc, modo_bot: 'B', hora_resumen: '21:00',
      version_esquema: VERSION_ESQUEMA, instalado: 'si',
    });
    return estadoInstalacion();
  });
}
