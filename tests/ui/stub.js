// google.script.run simulado para revisar la interfaz en Chrome. Datos ficticios.
(function () {
  const CATEGORIAS = [
    ['c1', 'Supermercado', '🛒', '#3ddc97', 'gasto'], ['c2', 'Comida fuera', '🍽️', '#ffb347', 'gasto'],
    ['c3', 'Transporte', '🚕', '#7c5cff', 'gasto'], ['c4', 'Suscripciones', '📺', '#4cc9f0', 'gasto'],
    ['c5', 'Bodega', '🏪', '#ff6b6b', 'gasto'], ['c7', 'Aseo personal', '🧴', '#f72585', 'gasto'],
    ['c6', 'Sueldo', '💼', '#3ddc97', 'ingreso'],
  ].map(c => ({ id: c[0], nombre: c[1], emoji: c[2], color: c[3], tipo: c[4], padre_id: '', activa: true }));
  const CUENTAS = [
    { id: 'a1', nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', moneda: 'PEN', saldo_inicial: 2000, numeros: '4444, 1111', activa: true, yape: true },
    { id: 'a2', nombre: 'VISA BCP', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -300, numeros: '2222', activa: true, yape: false },
    { id: 'a3', nombre: 'Efectivo', banco: 'Efectivo', tipo: 'efectivo', moneda: 'PEN', saldo_inicial: 100, numeros: '', activa: true, yape: false },
    { id: 'a4', nombre: 'Ahorro $', banco: 'BCP', tipo: 'ahorro', moneda: 'USD', saldo_inicial: 200, numeros: '3333', activa: true, yape: false },
  ];
  const SALDOS = [
    { id: 'a1', nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', saldo_pen: 2140.5 },
    { id: 'a2', nombre: 'VISA BCP', banco: 'BCP', tipo: 'credito', saldo_pen: -1326.2 },
    { id: 'a3', nombre: 'Efectivo', banco: 'Efectivo', tipo: 'efectivo', saldo_pen: 64 },
  ];
  const RECURRENTES = {
    recurrentes: [
      { id: 'r2', nombre: 'Gimnasio', monto: 120, moneda: 'PEN', cuenta_id: 'a1', categoria_id: 'c4', dia_mes: 8, activo: true },
      { id: 'r1', nombre: 'Spotify', monto: 20.9, moneda: 'PEN', cuenta_id: 'a1', categoria_id: 'c4', dia_mes: 13, activo: true },
      { id: 'r3', nombre: 'Nube', monto: 2.99, moneda: 'USD', cuenta_id: 'a2', categoria_id: 'c4', dia_mes: 20, activo: false },
    ],
    totalMensual: 140.9, cuentas: CUENTAS, categorias: CATEGORIAS.filter(c => c.tipo === 'gasto'), tc: 3.75,
  };
  const mov = (id, fecha, tipo, monto, cuenta_id, categoria_id, comercio, extra) => Object.assign({
    id, fecha, tipo, monto, moneda: 'PEN', tc: 1, monto_pen: monto, cuenta_id, cuenta_destino_id: '', categoria_id, comercio,
    descripcion: '', origen: 'manual', estado: 'confirmado', ref_externa: '', dividido: false, creado_en: fecha + ' 12:00:00',
  }, extra || {});
  const MOVS = [
    mov('m1', '2026-10-12', 'gasto', 89.3, 'a1', 'c1', 'Tottus', { origen: 'gmail', dividido: true }),
    mov('m2', '2026-10-12', 'gasto', 12, 'a1', '', 'BRAYAN G. MUNOZ', { origen: 'gmail', estado: 'por_revisar' }),
    mov('m3', '2026-10-11', 'gasto', 38.5, 'a2', 'c2', 'Pardos Chicken'),
    mov('m4', '2026-10-09', 'gasto', 9.99, 'a2', 'c4', 'Netflix', { moneda: 'USD', tc: 3.75, monto_pen: 37.46, origen: 'gmail' }),
    mov('m5', '2026-10-05', 'transferencia', 600, 'a1', '', '', { cuenta_destino_id: 'a2', descripcion: 'Pago de tarjeta', origen: 'gmail' }),
    mov('m6', '2026-10-01', 'ingreso', 3500, 'a1', 'c6', 'Empresa Demo SAC'),
  ];
  const POR_REVISAR = [
    mov('r1', '2026-10-12', 'gasto', 12, 'a1', '', 'BRAYAN G. MUNOZ', { origen: 'gmail', estado: 'por_revisar' }),
    mov('r2', '2026-10-11', 'gasto', 24.47, '', '', 'CLARO', { origen: 'gmail', estado: 'por_revisar' }),
    mov('r3', '2026-10-10', 'transferencia', 290.26, 'a4', '', '', { origen: 'gmail', estado: 'por_revisar', descripcion: 'Transferencia entre mis cuentas' }),
  ];
  const ESTADO_LECTURA = { activa: true, frecuencia: '5', etiquetar: true, importar_desde: '2026-10-01', ultima_revision: '2026-10-13 10:00:00', info: '12 correos · 10 nuevos · 3 por revisar · 1.4 s', horario_inicio: 7, horario_fin: 24 };
  const DATOS = {
    estadoInstalacion: { instalado: true, modoDemo: false },
    datosAsistente: {
      bancos: ['BCP', 'Interbank', 'BBVA', 'Scotiabank', 'Banco de la Nación', 'Yape', 'Plin', 'Efectivo', 'Otro'],
      tiposCuenta: ['debito', 'credito', 'ahorro', 'billetera', 'efectivo'], monedas: ['PEN', 'USD'],
      categorias: CATEGORIAS.map(c => ({ nombre: c.nombre, emoji: c.emoji, tipo: c.tipo })),
    },
    obtenerCatalogos: {
      cuentas: CUENTAS, categorias: CATEGORIAS, saldos: SALDOS,
      config: { nombre: 'Ana', ultimo_tc: 3.75, moneda_principal: 'PEN' },
      opciones: { bancos: ['BCP', 'Interbank', 'Otro'], tiposCuenta: ['debito', 'credito', 'ahorro', 'billetera', 'efectivo'], monedas: ['PEN', 'USD'] },
      modoDemo: false, urlHoja: 'https://docs.google.com/spreadsheets/d/demo',
    },
    obtenerDashboard: {
      mes: '2026-10', porRevisar: 4,
      presupuesto: {
        filas: [
          { categoria_id: 'c2', nombre: 'Comida fuera', emoji: '🍽️', color: '#ffb347', gastado: 412, presupuesto: 400, porcentaje: 103, queda: -12, estado: 'pasado', ritmo: 42 },
          { categoria_id: 'c1', nombre: 'Supermercado', emoji: '🛒', color: '#3ddc97', gastado: 512, presupuesto: 600, porcentaje: 85, queda: 88, estado: 'alerta', ritmo: 42 },
          { categoria_id: 'c3', nombre: 'Transporte', emoji: '🚕', color: '#7c5cff', gastado: 96, presupuesto: 250, porcentaje: 38, queda: 154, estado: 'ok', ritmo: 42 },
        ],
        total: { presupuesto: 1250, gastado: 1020 }, sinPresupuesto: 380,
      },
      proximosPagos: {
        pagos: [
          { tipo: 'recurrente', id: 'r1', nombre: 'Spotify', emoji: '📺', fecha: '2026-10-13', dias: 0, monto: 20.9, moneda: 'PEN', cuenta: 'Débito BCP' },
          { tipo: 'recurrente', id: 'r4', nombre: 'Seguro', emoji: '🏠', fecha: '2026-10-15', dias: 2, monto: 75, moneda: 'PEN', cuenta: 'Débito BCP' },
          { tipo: 'tarjeta', id: 'ec1', nombre: 'VISA BCP', emoji: '💳', fecha: '2026-10-20', dias: 7, vencido: false,
            pen: { total: 845.3, minimo: 120, pagado: 845.3, falta: 0, estado: 'pagado' },
            usd: { total: 45.6, minimo: 10, pagado: 0, falta: 45.6, estado: 'pendiente' } },
          { tipo: 'recurrente', id: 'r2', nombre: 'Gimnasio', emoji: '💪', fecha: '2026-11-08', dias: 26, monto: 120, moneda: 'PEN', cuenta: 'Débito BCP' },
        ],
        porPagar: 386.9,
      },
      resumen: { ingresos: 3500, gastos: 1842.3, ahorro: 1657.7, tasaAhorro: 47 },
      resumenAnterior: { ingresos: 3500, gastos: 2275, ahorro: 1225, tasaAhorro: 35 },
      categorias: [
        { categoria_id: 'c1', nombre: 'Supermercado', emoji: '🛒', color: '#3ddc97', monto: 512, porcentaje: 28 },
        { categoria_id: 'c2', nombre: 'Comida fuera', emoji: '🍽️', color: '#ffb347', monto: 384, porcentaje: 21 },
        { categoria_id: 'c4', nombre: 'Suscripciones', emoji: '📺', color: '#4cc9f0', monto: 310, porcentaje: 17 },
        { categoria_id: 'c3', nombre: 'Transporte', emoji: '🚕', color: '#7c5cff', monto: 196, porcentaje: 11 },
        { categoria_id: 'c5', nombre: 'Bodega', emoji: '🏪', color: '#ff6b6b', monto: 150, porcentaje: 8 },
        { categoria_id: '_resto', nombre: 'Resto', emoji: '•', color: '#3a3a48', monto: 290.3, porcentaje: 15 },
      ],
      tendencia: [
        { mes: '2026-05', ingresos: 3500, gastos: 2500 }, { mes: '2026-06', ingresos: 3300, gastos: 3000 },
        { mes: '2026-07', ingresos: 3600, gastos: 2250 }, { mes: '2026-08', ingresos: 3500, gastos: 2750 },
        { mes: '2026-09', ingresos: 3700, gastos: 2400 }, { mes: '2026-10', ingresos: 3500, gastos: 1842.3 },
      ],
      saldos: SALDOS,
      comercios: [
        { comercio: 'Tottus', monto: 318, veces: 5 }, { comercio: 'Pardos Chicken', monto: 159, veces: 3 },
        { comercio: 'Taxi', monto: 142, veces: 14 },
      ],
    },
    listarMovimientos: MOVS,
    guardarMovimiento: d => Object.assign({ id: 'nuevo' }, d),
    eliminarMovimiento: { ok: true },
    guardarCuenta: d => Object.assign({ id: 'nueva' }, d),
    guardarCategoria: d => Object.assign({ id: 'nueva' }, d),
    guardarAjustes: { nombre: 'Ana', ultimo_tc: 3.75, moneda_principal: 'PEN' },
    completarAsistente: { instalado: true, modoDemo: false },
    cargarDemo: { instalado: true, modoDemo: true },
    salirDemo: { instalado: true, modoDemo: false },
    obtenerPorRevisar: {
      movimientos: POR_REVISAR,
      pendientes: [{ id: 'p1', gmail_id: 'gm1', fecha: '2026-10-11', remitente: 'notificaciones@notificacionesbcp.com.pe', asunto: 'Realizaste un consumo con tu Tarjeta de Débito BCP', resumen: 'Hola Ana, hiciste una compra por S/ 15.00 en un comercio…', estado: 'pendiente' }],
      categoriasFrecuentes: { gasto: ['c1', 'c3', 'c2', 'c5', 'c4', 'c7'], ingreso: ['c6'] },
    },
    categorizarMovimiento: { confirmados: 2, regla: { id: 'r1', patron: 'BRAYAN G. MUNOZ', categoria_id: 'c3' } },
    obtenerDivisiones: [
      { id: 'd1', movimiento_id: 'm1', categoria_id: 'c1', monto: 60, nota: '' },
      { id: 'd2', movimiento_id: 'm1', categoria_id: 'c7', monto: 29.3, nota: '' },
    ],
    dividirMovimiento: { ok: true },
    quitarDivision: { ok: true },
    descartarPendiente: { ok: true },
    estadoLectura: ESTADO_LECTURA,
    configurarLectura: ESTADO_LECTURA,
    // Simula una importación en tandas: la segunda llamada termina.
    revisarCorreos: (() => {
      let n = 0;
      return () => (++n === 1
        ? { leidos: 50, creados: 48, porRevisar: 9, pendientes: 1, ignorados: 1, restantes: 12, etiquetados: 49 }
        : { leidos: 12, creados: 12, porRevisar: 2, pendientes: 0, ignorados: 0, restantes: 0, etiquetados: 12 });
    })(),
    volverALeerCorreos: { borrados: 3, leidos: 3, creados: 3, porRevisar: 1, pendientes: 0, ignorados: 0, restantes: 0, etiquetados: 3 },
    importarCorreosDesde: { leidos: 50, creados: 45, porRevisar: 6, pendientes: 1, ignorados: 2, restantes: 62, etiquetados: 46 },
    listarReglas: [{ id: 'r1', patron: 'TOTTUS', categoria_id: 'c1', cuenta_id: '', creada_por: 'usuario', usos: 5 }],
    eliminarRegla: { ok: true },
    // window.ESTADO_TELEGRAM permite ver los tres estados de la sección desde ver.js.
    estadoTelegram: () => window.ESTADO_TELEGRAM || { configurado: true, vinculado: true, bot: 'prueba_bot', url_receptor: 'https://script.google.com/macros/s/R/exec', codigo: '', enlace: '', hora_resumen: 21, cuenta_bot: '' },
    configurarTelegram: { configurado: true, vinculado: false, bot: 'prueba_bot', url_receptor: 'https://script.google.com/macros/s/R/exec', codigo: 'A1B2C3', enlace: 'https://t.me/prueba_bot?start=A1B2C3', hora_resumen: 21, cuenta_bot: '' },
    nuevoCodigoTelegram: { configurado: true, vinculado: false, bot: 'prueba_bot', codigo: 'D4E5F6', enlace: 'https://t.me/prueba_bot?start=D4E5F6', hora_resumen: 21, cuenta_bot: '' },
    guardarTelegram: { configurado: true, vinculado: true, bot: 'prueba_bot', codigo: '', enlace: '', hora_resumen: 20, cuenta_bot: '' },
    probarTelegram: { ok: true },
    obtenerPresupuestos: {
      mes: '2026-10', montos: { c1: 600, c2: 400, c3: 250 },
      referencia: { c1: { mesPasado: 548.2, promedio3: 571.4 }, c2: { mesPasado: 383, promedio3: 402.7 }, c5: { mesPasado: 141.5, promedio3: 150 } },
      categorias: CATEGORIAS.filter(c => c.tipo === 'gasto'),
    },
    obtenerRecurrentes: RECURRENTES,
    guardarRecurrente: RECURRENTES,
    eliminarRecurrente: RECURRENTES,
    guardarPresupuestos: { cambiadas: 1, mes: '2026-10', montos: { c1: 600, c2: 450, c3: 250 }, referencia: {}, categorias: [] },
    desvincularTelegram: { configurado: false, vinculado: false, bot: '', codigo: '', enlace: '', hora_resumen: 21, cuenta_bot: '' },
  };
  window.__llamadas = [];
  function corredor(ok, falla) {
    return new Proxy({}, {
      get(_, nombre) {
        if (nombre === 'withSuccessHandler') return f => corredor(f, falla);
        if (nombre === 'withFailureHandler') return f => corredor(ok, f);
        return (...args) => {
          window.__llamadas.push({ nombre, args });
          setTimeout(() => {
            const r = DATOS[nombre];
            if (r === undefined) { if (falla) falla(new Error('stub sin ' + nombre)); return; }
            const valor = typeof r === 'function' ? r(...args) : r;
            if (ok) ok(JSON.parse(JSON.stringify(valor)));
          }, 0);
        };
      },
    });
  }
  window.google = { script: { run: corredor(null, null) } };
})();
