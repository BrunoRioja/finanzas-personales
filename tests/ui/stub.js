// google.script.run simulado para revisar la interfaz en Chrome. Datos ficticios.
(function () {
  const CATEGORIAS = [
    ['c1', 'Supermercado', '🛒', '#3ddc97', 'gasto'], ['c2', 'Comida fuera', '🍽️', '#ffb347', 'gasto'],
    ['c3', 'Transporte', '🚕', '#7c5cff', 'gasto'], ['c4', 'Suscripciones', '📺', '#4cc9f0', 'gasto'],
    ['c5', 'Bodega', '🏪', '#ff6b6b', 'gasto'], ['c6', 'Sueldo', '💼', '#3ddc97', 'ingreso'],
  ].map(c => ({ id: c[0], nombre: c[1], emoji: c[2], color: c[3], tipo: c[4], padre_id: '', activa: true }));
  const CUENTAS = [
    { id: 'a1', nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', moneda: 'PEN', saldo_inicial: 2000, ultimos4: '1111', activa: true },
    { id: 'a2', nombre: 'VISA BCP', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -300, ultimos4: '2222', activa: true },
    { id: 'a3', nombre: 'Efectivo', banco: 'Efectivo', tipo: 'efectivo', moneda: 'PEN', saldo_inicial: 100, ultimos4: '', activa: true },
  ];
  const SALDOS = [
    { id: 'a1', nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', saldo_pen: 2140.5 },
    { id: 'a2', nombre: 'VISA BCP', banco: 'BCP', tipo: 'credito', saldo_pen: -1326.2 },
    { id: 'a3', nombre: 'Efectivo', banco: 'Efectivo', tipo: 'efectivo', saldo_pen: 64 },
  ];
  const mov = (id, fecha, tipo, monto, cuenta_id, categoria_id, comercio, extra) => Object.assign({
    id, fecha, tipo, monto, moneda: 'PEN', tc: 1, monto_pen: monto, cuenta_id, cuenta_destino_id: '', categoria_id, comercio,
    descripcion: '', origen: 'manual', estado: 'confirmado', ref_externa: '', dividido: false, creado_en: fecha + ' 12:00:00',
  }, extra || {});
  const MOVS = [
    mov('m1', '2026-10-12', 'gasto', 89.3, 'a1', 'c1', 'Tottus'),
    mov('m2', '2026-10-12', 'gasto', 12, 'a1', 'c3', 'Taxi', { descripcion: 'Yape' }),
    mov('m3', '2026-10-11', 'gasto', 38.5, 'a2', 'c2', 'Pardos Chicken'),
    mov('m4', '2026-10-09', 'gasto', 9.99, 'a2', 'c4', 'Netflix', { moneda: 'USD', tc: 3.75, monto_pen: 37.46 }),
    mov('m5', '2026-10-05', 'transferencia', 600, 'a1', '', '', { cuenta_destino_id: 'a2', descripcion: 'Pago tarjeta' }),
    mov('m6', '2026-10-01', 'ingreso', 3500, 'a1', 'c6', 'Empresa Demo SAC'),
  ];
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
      mes: '2026-10',
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
