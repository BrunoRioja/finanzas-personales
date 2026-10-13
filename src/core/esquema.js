// Hojas y columnas de la base de datos. La fila 1 de cada hoja son estos encabezados.
// La primera columna de cada hoja es su clave. Tipos: texto | numero | fecha (yyyy-MM-dd) | booleano.
const VERSION_ESQUEMA = 1;

const ESQUEMA = {
  Movimientos: [
    ['id', 'texto'], ['fecha', 'fecha'], ['tipo', 'texto'], ['monto', 'numero'], ['moneda', 'texto'],
    ['monto_pen', 'numero'], ['tc', 'numero'], ['cuenta_id', 'texto'], ['cuenta_destino_id', 'texto'],
    ['categoria_id', 'texto'], ['comercio', 'texto'], ['descripcion', 'texto'], ['origen', 'texto'],
    ['estado', 'texto'], ['ref_externa', 'texto'], ['dividido', 'booleano'], ['creado_en', 'texto'],
  ],
  Divisiones: [
    ['id', 'texto'], ['movimiento_id', 'texto'], ['categoria_id', 'texto'], ['monto', 'numero'], ['nota', 'texto'],
  ],
  Cuentas: [
    ['id', 'texto'], ['nombre', 'texto'], ['banco', 'texto'], ['tipo', 'texto'], ['moneda', 'texto'],
    ['saldo_inicial', 'numero'], ['ultimos4', 'texto'], ['activa', 'booleano'],
  ],
  Categorias: [
    ['id', 'texto'], ['nombre', 'texto'], ['emoji', 'texto'], ['color', 'texto'], ['tipo', 'texto'],
    ['padre_id', 'texto'], ['activa', 'booleano'],
  ],
  Reglas: [
    ['id', 'texto'], ['patron', 'texto'], ['categoria_id', 'texto'], ['cuenta_id', 'texto'],
    ['creada_por', 'texto'], ['usos', 'numero'],
  ],
  Config: [['clave', 'texto'], ['valor', 'texto']],
  Log: [['fecha', 'texto'], ['nivel', 'texto'], ['origen', 'texto'], ['mensaje', 'texto'], ['detalle', 'texto']],
};
