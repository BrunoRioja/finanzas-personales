const { crearEntorno } = require('./harness');

// Datos ficticios del asistente (nunca datos reales).
const ASISTENTE = {
  nombre: 'Ana',
  tc_usd: 3.75,
  cuentas: [
    { nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', moneda: 'PEN', saldo_inicial: 1000, numeros: '1234' },
    { nombre: 'VISA BCP', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -200, numeros: '0042' },
  ],
};

function entornoInstalado(opciones) {
  const e = crearEntorno(opciones);
  e.llamar('completarAsistente', ASISTENTE);
  e.cuenta = nombre => e.llamar('obtenerCatalogos').cuentas.find(c => c.nombre === nombre).id;
  e.categoria = nombre => e.llamar('obtenerCatalogos').categorias.find(c => c.nombre === nombre).id;
  e.filas = hoja => e.llamar('leerTabla_', hoja);
  return e;
}

module.exports = { ASISTENTE, entornoInstalado };
