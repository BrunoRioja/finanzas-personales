// Asistente de instalación: primera configuración de cada persona.

function datosAsistente() {
  return {
    bancos: BANCOS,
    tiposCuenta: TIPOS_CUENTA,
    monedas: MONEDAS,
    categorias: CATEGORIAS_POR_DEFECTO.map(c => ({ nombre: c[0], emoji: c[1], tipo: c[2], rol: c[3] || '' })),
  };
}

function estaInstalado_(libro) {
  return !!libro.getSheetByName('Config') && leerConfig_().instalado === 'si';
}

// Estado sin migrar: seguro de usar dentro de un bloqueo.
function estadoActual_() {
  const instalado = estaInstalado_(abrirLibro_());
  return {
    instalado: instalado,
    modoDemo: PropertiesService.getScriptProperties().getProperty('MODO_DEMO') === 'si',
  };
}

// Llamada al abrir la app: si la hoja es de una versión anterior, la migra.
function estadoInstalacion() {
  asegurarEsquema_();
  asegurarRecordatorioPagos_();
  return estadoActual_();
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
    if (cuentas.filter(c => c.yape).length > 1) throw new Error('Solo una cuenta puede ser la de Yape.');
    cuentas.forEach((c, i) => validarNumerosUnicos_(c, cuentas.slice(0, i)));
    const fuente = datos.categorias && datos.categorias.length ? datos.categorias : datosAsistente().categorias;
    const categorias = [];
    fuente.forEach(c => categorias.push(Object.assign({ id: nuevoId_() }, normalizarCategoria_(c, categorias, ''))));
    if (!categorias.some(c => c.tipo === 'gasto') || !categorias.some(c => c.tipo === 'ingreso')) {
      throw new Error('Necesitas al menos una categoría de gasto y una de ingreso.');
    }
    crearHojas_(libro);
    agregarFilas_('Cuentas', cuentas);
    agregarFilas_('Categorias', categorias);
    asegurarRolesPrestamo_(); // una lista propia (o un cliente que no envía el rol) también queda con sus roles
    asegurarAmbitos_();
    guardarConfig_({
      nombre: nombre, moneda_principal: 'PEN', ultimo_tc: tc, modo_bot: 'B', hora_resumen: '21:00',
      version_esquema: VERSION_ESQUEMA, instalado: 'si',
    });
    return estadoActual_();
  });
}
