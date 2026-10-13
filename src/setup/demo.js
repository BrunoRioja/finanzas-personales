// Datos ficticios para mostrar la app sin exponer finanzas reales. Se guardan en una
// Google Sheet aparte; la hoja real no se toca. Generación determinista (semilla fija).

function aleatorio_(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generarDatosDemo_(hoyIso) {
  const rnd = aleatorio_(20261013);
  const entre = (min, max) => redondear2_(min + rnd() * (max - min));
  const elegir = lista => lista[Math.floor(rnd() * lista.length)];
  const cuentas = [
    { id: 'demo-debito', nombre: 'Débito', banco: 'BCP', tipo: 'debito', moneda: 'PEN', saldo_inicial: 2500, numeros: '1111', activa: true, yape: true },
    { id: 'demo-visa', nombre: 'VISA', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -350, numeros: '2222', activa: true, yape: false },
    { id: 'demo-efectivo', nombre: 'Efectivo', banco: 'Efectivo', tipo: 'efectivo', moneda: 'PEN', saldo_inicial: 150, numeros: '', activa: true, yape: false },
  ];
  const categorias = CATEGORIAS_POR_DEFECTO.map((c, i) => ({
    id: 'demo-cat-' + (i + 1), nombre: c[0], emoji: c[1], color: PALETA[i % PALETA.length], tipo: c[2], padre_id: '', activa: true,
  }));
  const cat = nombre => categorias.filter(c => c.nombre === nombre)[0].id;
  const movimientos = [];
  const agregar = (fecha, tipo, monto, cuentaId, extra) => {
    const moneda = extra.moneda || 'PEN';
    const tc = moneda === 'USD' ? 3.75 : 1;
    movimientos.push(Object.assign({
      id: 'demo-mov-' + (movimientos.length + 1), fecha: fecha, tipo: tipo, monto: monto,
      cuenta_id: cuentaId, cuenta_destino_id: '', categoria_id: '', comercio: '', descripcion: '',
      origen: 'manual', estado: 'confirmado', ref_externa: '', dividido: false, creado_en: fecha + ' 12:00:00',
    }, extra, { moneda: moneda, tc: tc, monto_pen: redondear2_(monto * tc) }));
  };
  const partes = hoyIso.split('-').map(Number);
  const fin = new Date(partes[0], partes[1] - 1, partes[2]);
  for (let d = new Date(partes[0], partes[1] - 3, 1); d <= fin; d.setDate(d.getDate() + 1)) {
    const fecha = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dia = d.getDate();
    if (dia === 1) agregar(fecha, 'ingreso', 3500, 'demo-debito', { categoria_id: cat('Sueldo'), comercio: 'Empresa Demo SAC', descripcion: 'Sueldo' });
    if (dia === 5) agregar(fecha, 'gasto', 11.9, 'demo-debito', { categoria_id: cat('Suscripciones'), comercio: 'Spotify' });
    if (dia === 8) agregar(fecha, 'gasto', 120, 'demo-debito', { categoria_id: cat('Salud y gym'), comercio: 'Gimnasio Demo' });
    if (dia === 10) agregar(fecha, 'gasto', entre(70, 110), 'demo-debito', { categoria_id: cat('Vivienda y servicios'), comercio: 'Luz del Sur' });
    if (dia === 16) agregar(fecha, 'gasto', 9.99, 'demo-visa', { categoria_id: cat('Suscripciones'), comercio: 'Netflix', moneda: 'USD' });
    if (dia === 20) agregar(fecha, 'transferencia', 600, 'demo-debito', { cuenta_destino_id: 'demo-visa', descripcion: 'Pago tarjeta VISA' });
    if (dia % 7 === 3) agregar(fecha, 'gasto', entre(80, 210), 'demo-debito', { categoria_id: cat('Supermercado'), comercio: elegir(['Tottus', 'Plaza Vea', 'Metro']) });
    if (rnd() < 0.5) agregar(fecha, 'gasto', entre(3, 15), elegir(['demo-efectivo', 'demo-debito']), { categoria_id: cat('Bodega'), comercio: elegir(['Bodega Don Lucho', 'Minimarket La Esquina']) });
    if (rnd() < 0.35) agregar(fecha, 'gasto', entre(8, 16), 'demo-debito', { categoria_id: cat('Transporte'), comercio: 'Taxi', descripcion: 'Yape' });
    if (rnd() < 0.25) agregar(fecha, 'gasto', entre(18, 48), 'demo-visa', { categoria_id: cat('Comida fuera'), comercio: elegir(['Pardos Chicken', 'Sushi Bar', 'Menú El Rincón']) });
    if (rnd() < 0.05) agregar(fecha, 'gasto', entre(60, 160), 'demo-visa', { categoria_id: cat('Ropa'), comercio: elegir(['Saga Falabella', 'Zara']) });
    if (rnd() < 0.06) agregar(fecha, 'gasto', entre(15, 40), 'demo-debito', { categoria_id: cat('Aseo personal'), comercio: 'Inkafarma' });
  }
  return { cuentas: cuentas, categorias: categorias, movimientos: movimientos };
}

function cargarDemo() {
  return conBloqueo_(() => {
    const props = PropertiesService.getScriptProperties();
    let libro = null;
    const id = props.getProperty('DEMO_SHEET_ID');
    if (id) {
      try { libro = SpreadsheetApp.openById(id); } catch { libro = null; }
    }
    const nuevo = !libro;
    if (nuevo) {
      libro = SpreadsheetApp.create('Finanzas — DEMO');
      props.setProperty('DEMO_SHEET_ID', libro.getId());
    }
    props.setProperty('MODO_DEMO', 'si');
    if (nuevo) {
      crearHojas_(libro);
      const datos = generarDatosDemo_(hoyIso_());
      agregarFilas_('Cuentas', datos.cuentas);
      agregarFilas_('Categorias', datos.categorias);
      agregarFilas_('Movimientos', datos.movimientos);
      guardarConfig_({
        nombre: 'Demo', moneda_principal: 'PEN', ultimo_tc: 3.75, modo_bot: 'B', hora_resumen: '21:00',
        version_esquema: VERSION_ESQUEMA, instalado: 'si',
      });
    }
    return estadoActual_();
  });
}

function salirDemo() {
  PropertiesService.getScriptProperties().setProperty('MODO_DEMO', 'no');
  return estadoInstalacion();
}
