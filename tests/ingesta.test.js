const test = require('node:test');
const assert = require('node:assert');
const { entornoInstalado } = require('./fixtures');
const { ASUNTOS, html } = require('./correos');

const BCP = 'notificaciones@notificacionesbcp.com.pe';
const YAPE = 'notificaciones@yape.pe';
const correoGmail = (id, archivo, asunto, recibido, de) => ({ id, de: de || BCP, asunto, html: html(archivo), recibido });

function correosBase() {
  return [
    correoGmail('g1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00'),
    correoGmail('g2', 'credito-dolares.html', ASUNTOS.credito, '2026-10-07T10:00:00'),
    correoGmail('g3', 'yape-enviado.html', ASUNTOS.yape, '2026-10-08T19:51:00', YAPE),
    correoGmail('g4', 'transferencia.html', ASUNTOS.transferencia, '2026-10-09T17:58:00'),
    correoGmail('g5', 'pago-tarjeta-dolares.html', ASUNTOS.pagoTarjeta, '2026-10-10T13:42:00'),
    correoGmail('g6', 'consumo-roto.html', ASUNTOS.debito, '2026-10-11T09:00:00'),
    correoGmail('g7', 'estado-cuenta.html', ASUNTOS.estadoCuenta, '2026-10-11T10:00:00', 'estadodecuenta@notificacionesbcp.com.pe'),
    correoGmail('g8', 'debito.html', ASUNTOS.debito, '2026-09-20T10:00:00'),
  ];
}

// Cuentas con los números ficticios de los correos de ejemplo.
function entornoConCorreos(correos, opciones) {
  const e = entornoInstalado(Object.assign({ correos: correos || correosBase() }, opciones));
  e.llamar('guardarCuenta', { id: e.cuenta('Débito BCP'), nombre: 'Débito BCP', banco: 'BCP', tipo: 'debito', moneda: 'PEN', saldo_inicial: 1000, numeros: '4444, 1111', yape: true });
  e.llamar('guardarCuenta', { id: e.cuenta('VISA BCP'), nombre: 'VISA BCP', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: -200, numeros: '2222' });
  e.llamar('guardarCuenta', { nombre: 'Ahorro BCP', banco: 'BCP', tipo: 'ahorro', moneda: 'PEN', saldo_inicial: 3000, numeros: '3333' });
  e.interno('guardarConfig_', { importar_desde: '2026-10-01' });
  e.movDe = gid => e.filas('Movimientos').find(m => m.ref_externa === 'gmail:' + gid);
  return e;
}

test('revisarCorreos importa desde importar_desde: movimientos, pendientes e ignorados', () => {
  const e = entornoConCorreos();
  const r = e.llamar('revisarCorreos');
  assert.deepStrictEqual(r, { leidos: 7, creados: 5, porRevisar: 3, pendientes: 1, ignorados: 0, restantes: 0, etiquetados: 7, estadosCuenta: 1 });
  assert.strictEqual(e.movDe('g8'), undefined, 'antes de importar_desde');
  const g1 = e.movDe('g1');
  assert.strictEqual(g1.cuenta_id, e.cuenta('Débito BCP'));
  assert.strictEqual(g1.estado, 'por_revisar');
  assert.strictEqual(g1.fecha, '2026-10-06');
  assert.strictEqual(g1.origen, 'gmail');
  assert.strictEqual(e.movDe('g2').monto_pen, 88.5, 'usa el tc conocido antes del pago');
  assert.strictEqual(e.movDe('g3').cuenta_id, e.cuenta('Débito BCP'), 'Yape');
  const g4 = e.movDe('g4');
  assert.strictEqual(g4.tipo, 'transferencia');
  assert.strictEqual(g4.cuenta_id, e.cuenta('Ahorro BCP'));
  assert.strictEqual(g4.estado, 'confirmado');
  const g5 = e.movDe('g5');
  assert.strictEqual(g5.cuenta_destino_id, e.cuenta('VISA BCP'));
  assert.strictEqual(g5.monto_pen, 366.89);
  assert.strictEqual(e.llamar('leerConfig_').ultimo_tc, '3.477');
  const pend = e.filas('Pendientes');
  assert.strictEqual(pend.length, 1);
  assert.strictEqual(pend[0].gmail_id, 'g6');
  assert.strictEqual(pend[0].estado, 'pendiente');
  assert.strictEqual(pend[0].asunto, ASUNTOS.debito);
  const config = e.llamar('leerConfig_');
  assert.strictEqual(config.ultima_revision, '2026-10-13 10:00:00');
  assert.match(config.ultima_revision_info, /^7 correos · 5 movimientos · 3 por revisar · 1 no leído/);
  assert.strictEqual(Number(config.cursor_lectura), new Date('2026-10-13T08:00:00').getTime());
});

test('una regla existente confirma y categoriza, y suma un uso', () => {
  const e = entornoConCorreos();
  const sup = e.categoria('Supermercado');
  e.interno('agregarFilas_', 'Reglas', [{ id: 'r1', patron: 'TOTTUS', categoria_id: sup, cuenta_id: '', creada_por: 'usuario', usos: 0 }]);
  e.llamar('revisarCorreos');
  assert.strictEqual(e.movDe('g1').categoria_id, sup);
  assert.strictEqual(e.movDe('g1').estado, 'confirmado');
  assert.strictEqual(e.filas('Reglas')[0].usos, 1);
});

test('no duplica ni vuelve a descargar correos ya vistos', () => {
  const e = entornoConCorreos();
  e.llamar('revisarCorreos');
  const descargas = e.stats.gmailGet;
  const filas = e.filas('Movimientos').length;
  e.interno('guardarConfig_', { cursor_lectura: 0 });
  assert.strictEqual(e.llamar('revisarCorreos').leidos, 0);
  assert.strictEqual(e.stats.gmailGet, descargas);
  assert.strictEqual(e.filas('Movimientos').length, filas);
});

test('lee en tandas de 50 y solo avanza el cursor al terminar', () => {
  const muchos = Array.from({ length: 60 }, (_, i) => correoGmail('x' + (i + 1), 'debito.html', ASUNTOS.debito, new Date(2026, 9, 2, 8, i).toISOString()));
  const e = entornoConCorreos(muchos);
  const r1 = e.llamar('revisarCorreos');
  assert.strictEqual(r1.leidos, 50);
  assert.strictEqual(r1.restantes, 10);
  assert.strictEqual(e.llamar('leerConfig_').cursor_lectura, undefined);
  const r2 = e.llamar('revisarCorreos');
  assert.strictEqual(r2.leidos, 10);
  assert.strictEqual(r2.restantes, 0);
  assert.ok(e.llamar('leerConfig_').cursor_lectura);
  assert.strictEqual(e.filas('Movimientos').length, 60);
});

test('etiqueta en Gmail los correos con movimiento o pendiente; se puede apagar; si falla no se pierde nada', () => {
  const e = entornoConCorreos();
  e.llamar('revisarCorreos');
  assert.deepStrictEqual(e.gmail._etiquetas.map(l => l.name), ['Finanzas/Procesado']);
  assert.deepStrictEqual(e.gmail._etiquetasDe.g1, ['Label_1']);
  assert.deepStrictEqual(e.gmail._etiquetasDe.g6, ['Label_1']);
  assert.deepStrictEqual(e.gmail._etiquetasDe.g7, ['Label_1'], 'el estado de cuenta guardado también se etiqueta');

  const sin = entornoConCorreos();
  sin.interno('guardarConfig_', { etiquetar: 'no' });
  assert.strictEqual(sin.llamar('revisarCorreos').etiquetados, 0);
  assert.deepStrictEqual(sin.gmail._etiquetasDe, {});

  const falla = entornoConCorreos(null, { etiquetaFalla: true });
  const r = falla.llamar('revisarCorreos');
  assert.strictEqual(r.creados, 5);
  assert.strictEqual(r.etiquetados, 0);
  assert.ok(falla.filas('Log').some(l => l.nivel === 'aviso' && l.origen === 'etiquetar'));
});

test('ignora remitentes que imitan al banco', () => {
  const e = entornoConCorreos([correoGmail('f1', 'debito.html', ASUNTOS.debito, '2026-10-05T10:00:00', 'notificaciones@notificacionesbcp.com.pe.estafa.com')]);
  const r = e.llamar('revisarCorreos');
  assert.strictEqual(r.creados, 0);
  assert.strictEqual(r.ignorados, 1);
});

test('si otra revisión está en curso, se salta', () => {
  const e = entornoConCorreos(null, { lockOcupado: true });
  assert.deepStrictEqual(e.llamar('revisarCorreos'), { omitida: true, mensaje: 'Ya hay una revisión en curso.' });
  assert.strictEqual(e.filas('Movimientos').length, 0);
});

test('un error de Gmail queda en el Log y en la info de la última revisión', () => {
  const e = entornoConCorreos(null, { gmailFalla: 'Cuota excedida' });
  assert.throws(() => e.interno('revisarCorreos'), /Cuota excedida/);
  assert.ok(e.filas('Log').some(l => l.nivel === 'error' && l.mensaje === 'Cuota excedida'));
  assert.strictEqual(e.llamar('leerConfig_').ultima_revision_info, 'Error: Cuota excedida');
});

// --- Hallazgos de la revisión final ---

test('I1: lee el cuerpo aunque Gmail lo entregue como bytes y respeta el charset del correo', () => {
  const bytes = entornoConCorreos(null, { gmailBytes: true });
  assert.strictEqual(bytes.llamar('revisarCorreos').creados, 5);
  const latin = entornoConCorreos([Object.assign(correoGmail('l1', 'debito.html', ASUNTOS.debito, '2026-10-06T16:19:00'), { charset: 'ISO-8859-1' })]);
  const r = latin.llamar('revisarCorreos');
  assert.strictEqual(r.creados, 1);
  assert.strictEqual(r.pendientes, 0);
});

test('I2: el nombre visible no puede hacerse pasar por el banco', () => {
  const falso = Object.assign(correoGmail('f2', 'debito.html', ASUNTOS.debito, '2026-10-05T10:00:00', 'x@estafa.com'),
    { cabeceraDe: '"<notificaciones@notificacionesbcp.com.pe>" <x@estafa.com>' });
  const e = entornoConCorreos([falso]);
  const r = e.llamar('revisarCorreos');
  assert.strictEqual(r.creados, 0);
  assert.strictEqual(r.ignorados, 1);
});

test('I3: con el modo demo activo no se leen correos (no se mezclan datos reales en la demo)', () => {
  const e = entornoConCorreos();
  e.llamar('cargarDemo');
  const r = e.llamar('revisarCorreos');
  assert.strictEqual(r.omitida, true);
  assert.match(r.mensaje, /modo demo/i);
  assert.strictEqual(e.stats.gmailGet, 0);
});

test('I4: las llamadas a Gmail ocurren fuera del bloqueo de escritura', () => {
  const e = entornoConCorreos();
  e.llamar('revisarCorreos');
  assert.ok(e.stats.gmailGet > 0);
  assert.strictEqual(e.stats.gmailEnBloqueo, 0);
});

test('I5: completar un importado desde el formulario lo confirma', () => {
  const e = entornoConCorreos();
  e.llamar('revisarCorreos');
  const g1 = e.movDe('g1');
  const editado = e.llamar('guardarMovimiento', Object.assign({}, g1, { categoria_id: e.categoria('Supermercado') }));
  assert.strictEqual(editado.estado, 'confirmado');
  assert.strictEqual(e.movDe('g1').estado, 'confirmado');
});

test('I7: un importado borrado no revive aunque haya muchos correos ignorados', () => {
  const e = entornoConCorreos();
  e.llamar('revisarCorreos');
  e.llamar('eliminarMovimiento', e.movDe('g1').id);
  e.interno('recordarIgnorados_', Array.from({ length: 500 }, (_, i) => 'relleno' + i));
  e.interno('guardarConfig_', { cursor_lectura: 0 });
  e.llamar('revisarCorreos');
  assert.strictEqual(e.movDe('g1'), undefined);
  assert.deepStrictEqual(e.llamar('obtenerPorRevisar').pendientes.map(p => p.gmail_id), ['g6']);
});

// --- Horario de lectura y volver a leer los que quedaron sin cuenta ---

const EVENTO_TRIGGER = { triggerUid: '123', authMode: 'FULL' };

test('el trigger fuera del horario termina sin tocar Gmail; dentro del horario lee', () => {
  const e = entornoConCorreos(null, { ahora: '2026-10-13T03:00:00' });
  const fuera = e.llamar('revisarCorreos', EVENTO_TRIGGER);
  assert.deepStrictEqual(fuera, { omitida: true, mensaje: 'Fuera del horario de lectura (7:00 a 24:00).' });
  assert.strictEqual(e.stats.gmailList, 0);
  assert.strictEqual(e.llamar('leerConfig_').ultima_revision, undefined);
  e.fijarAhora('2026-10-13T23:30:00');
  assert.strictEqual(e.llamar('revisarCorreos', EVENTO_TRIGGER).leidos, 7);
});

test('el horario configurado se respeta y "Revisar ahora" lee a cualquier hora', () => {
  const e = entornoConCorreos(null, { ahora: '2026-10-13T22:30:00' });
  e.interno('guardarConfig_', { horario_inicio: 8, horario_fin: 22 });
  assert.strictEqual(e.llamar('revisarCorreos', EVENTO_TRIGGER).omitida, true);
  e.fijarAhora('2026-10-13T03:00:00');
  assert.strictEqual(e.llamar('revisarCorreos').leidos, 7);
});

test('volverALeerCorreos vuelve a leer los importados que quedaron sin cuenta, con los números corregidos', () => {
  const e = entornoConCorreos();
  const deb = e.cuenta('Débito BCP');
  e.llamar('guardarCuenta', { id: deb, nombre: 'Débito BCP', tipo: 'debito', numeros: '4444', yape: true });
  e.llamar('revisarCorreos');
  assert.strictEqual(e.movDe('g1').cuenta_id, '');
  const confirmados = e.filas('Movimientos').filter(m => m.estado === 'confirmado').map(m => m.id).sort();
  e.llamar('guardarCuenta', { id: deb, nombre: 'Débito BCP', tipo: 'debito', numeros: '4444, 1111', yape: true });
  const r = e.llamar('volverALeerCorreos');
  assert.strictEqual(r.borrados, 2, 'g1 sin cuenta y el pendiente g6');
  assert.strictEqual(r.creados, 1);
  assert.strictEqual(r.pendientes, 1, 'g6 sigue sin poder leerse');
  assert.strictEqual(e.movDe('g1').cuenta_id, deb);
  assert.deepStrictEqual(e.filas('Movimientos').filter(m => m.estado === 'confirmado').map(m => m.id).sort(), confirmados);
  assert.strictEqual(e.filas('Movimientos').length, 5);
});

test('volverALeerCorreos no hace nada en modo demo', () => {
  const e = entornoConCorreos();
  e.llamar('cargarDemo');
  assert.throws(() => e.interno('volverALeerCorreos'), /modo demo/i);
});

test('correo en UTF-8 con cabecera que declara latin-1 (Yape) se lee bien', () => {
  const yape = Object.assign(correoGmail('y1', 'yape-enviado.html', ASUNTOS.yape, '2026-10-02T19:51:00', YAPE), { charsetCabecera: 'ISO-8859-1' });
  const e = entornoConCorreos([yape]);
  const r = e.llamar('revisarCorreos');
  assert.strictEqual(r.creados, 1);
  assert.strictEqual(r.pendientes, 0);
  assert.strictEqual(e.movDe('y1').comercio, 'CARLOS PRUEBA R.');
});

test('volverALeerCorreos también reintenta los correos que no se pudieron leer', () => {
  const e = entornoConCorreos();
  e.llamar('revisarCorreos');
  const g1 = e.movDe('g1');
  e.interno('eliminarFila_', 'Movimientos', g1.id);
  e.interno('agregarFilas_', 'Pendientes', [{ id: 'p-g1', gmail_id: 'g1', fecha: '2026-10-06', remitente: 'x', asunto: 'x', resumen: 'x', estado: 'pendiente' }]);
  const r = e.llamar('volverALeerCorreos');
  assert.strictEqual(r.borrados, 2, 'pendientes de g1 y g6');
  assert.ok(e.movDe('g1'), 'g1 vuelve como movimiento');
  assert.deepStrictEqual(e.filas('Pendientes').filter(p => p.estado === 'pendiente').map(p => p.gmail_id), ['g6'], 'g6 sigue sin poder leerse');
});

const DE_ESTADO = 'estadodecuenta@notificacionesbcp.com.pe';

test('el estado de cuenta se guarda para la tarjeta BCP sin crear movimientos y no se duplica', () => {
  const e = entornoConCorreos();
  e.llamar('revisarCorreos');
  const ec = e.filas('EstadosCuenta');
  assert.strictEqual(ec.length, 1);
  assert.strictEqual(ec[0].cuenta_id, e.cuenta('VISA BCP'));
  assert.strictEqual(ec[0].emitido, '2026-10-11');
  assert.strictEqual(ec[0].total_pen, 1234.5);
  assert.strictEqual(ec[0].minimo_usd, 10);
  assert.strictEqual(ec[0].fecha_limite, '2026-11-05');
  assert.strictEqual(ec[0].ref_externa, 'gmail:g7');
  assert.strictEqual(e.movDe('g7'), undefined);
  e.interno('guardarConfig_', { cursor_lectura: 0 });
  e.llamar('revisarCorreos');
  assert.strictEqual(e.filas('EstadosCuenta').length, 1);
});

test('sin tarjeta de crédito BCP activa el estado de cuenta va a Por revisar; con dos usa la primera y lo anota', () => {
  const solo = () => [correoGmail('g7', 'estado-cuenta.html', ASUNTOS.estadoCuenta, '2026-10-11T10:00:00', DE_ESTADO)];
  const sin = entornoConCorreos(solo());
  sin.interno('actualizarFila_', 'Cuentas', sin.cuenta('VISA BCP'), { activa: false });
  sin.llamar('revisarCorreos');
  assert.strictEqual(sin.filas('EstadosCuenta').length, 0);
  const pend = sin.filas('Pendientes');
  assert.strictEqual(pend.length, 1);
  assert.match(pend[0].resumen, /^No hay una tarjeta de crédito BCP activa/);
  const dos = entornoConCorreos(solo());
  dos.llamar('guardarCuenta', { nombre: 'VISA 2', banco: 'BCP', tipo: 'credito', moneda: 'PEN', saldo_inicial: 0, numeros: '5555' });
  dos.llamar('revisarCorreos');
  assert.strictEqual(dos.filas('EstadosCuenta')[0].cuenta_id, dos.cuenta('VISA BCP'));
  assert.ok(dos.filas('Log').some(l => l.nivel === 'aviso' && l.origen === 'estado de cuenta'));
});
