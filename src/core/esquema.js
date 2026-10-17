// Hojas y columnas de la base de datos. La fila 1 de cada hoja son estos encabezados.
// La primera columna de cada hoja es su clave. Tipos: texto | numero | fecha (yyyy-MM-dd) | booleano.
const VERSION_ESQUEMA = 6;

const ESQUEMA = {
  Movimientos: [
    ['id', 'texto'], ['fecha', 'fecha'], ['tipo', 'texto'], ['monto', 'numero'], ['moneda', 'texto'],
    ['monto_pen', 'numero'], ['tc', 'numero'], ['cuenta_id', 'texto'], ['cuenta_destino_id', 'texto'],
    ['categoria_id', 'texto'], ['comercio', 'texto'], ['descripcion', 'texto'], ['origen', 'texto'],
    ['estado', 'texto'], ['ref_externa', 'texto'], ['dividido', 'booleano'], ['creado_en', 'texto'], ['ambito_id', 'texto'],
  ],
  Divisiones: [
    ['id', 'texto'], ['movimiento_id', 'texto'], ['categoria_id', 'texto'], ['monto', 'numero'], ['nota', 'texto'], ['ambito_id', 'texto'],
  ],
  Cuentas: [
    ['id', 'texto'], ['nombre', 'texto'], ['banco', 'texto'], ['tipo', 'texto'], ['moneda', 'texto'],
    ['saldo_inicial', 'numero'], ['numeros', 'texto'], ['activa', 'booleano'], ['yape', 'booleano'],
  ],
  Categorias: [
    ['id', 'texto'], ['nombre', 'texto'], ['emoji', 'texto'], ['color', 'texto'], ['tipo', 'texto'],
    ['padre_id', 'texto'], ['activa', 'booleano'], ['rol', 'texto'],
  ],
  Ambitos: [['id', 'texto'], ['nombre', 'texto'], ['emoji', 'texto'], ['orden', 'numero'], ['activo', 'booleano']],
  Reglas: [
    ['id', 'texto'], ['patron', 'texto'], ['categoria_id', 'texto'], ['cuenta_id', 'texto'],
    ['creada_por', 'texto'], ['usos', 'numero'],
  ],
  Pendientes: [
    ['id', 'texto'], ['gmail_id', 'texto'], ['fecha', 'fecha'], ['remitente', 'texto'], ['asunto', 'texto'],
    ['resumen', 'texto'], ['estado', 'texto'],
  ],
  Presupuestos: [['id', 'texto'], ['categoria_id', 'texto'], ['monto', 'numero'], ['desde', 'texto']],
  Recurrentes: [
    ['id', 'texto'], ['nombre', 'texto'], ['monto', 'numero'], ['moneda', 'texto'], ['cuenta_id', 'texto'],
    ['categoria_id', 'texto'], ['dia_mes', 'numero'], ['activo', 'booleano'],
  ],
  EstadosCuenta: [
    ['id', 'texto'], ['cuenta_id', 'texto'], ['emitido', 'fecha'], ['total_pen', 'numero'], ['total_usd', 'numero'],
    ['minimo_pen', 'numero'], ['minimo_usd', 'numero'], ['fecha_limite', 'fecha'], ['ref_externa', 'texto'],
  ],
  Prestamos: [
    ['id', 'texto'], ['persona', 'texto'], ['monto', 'numero'], ['fecha', 'fecha'], ['fecha_promesa', 'fecha'],
    ['movimiento_id', 'texto'], ['estado', 'texto'], ['nota', 'texto'], ['creado_en', 'texto'],
  ],
  Abonos: [['id', 'texto'], ['prestamo_id', 'texto'], ['fecha', 'fecha'], ['monto', 'numero'], ['movimiento_id', 'texto']],
  Config: [['clave', 'texto'], ['valor', 'texto']],
  Log: [['fecha', 'texto'], ['nivel', 'texto'], ['origen', 'texto'], ['mensaje', 'texto'], ['detalle', 'texto']],
};

// Encabezados renombrados entre versiones del esquema (versión anterior → actual).
const RENOMBRES_ESQUEMA = { Cuentas: { ultimos4: 'numeros' } };
