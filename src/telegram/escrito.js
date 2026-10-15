// Lee un gasto escrito en el chat: "[+]descripción monto [cuenta] [categoría] [ámbito]". Función pura.

const PATRON_MONTO_ESCRITO = /^(?:s\/\.?)?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)$/i;
const TEXTO_NO_ENTENDI = 'No entendí. Ejemplos: <code>taxi 12 yape</code>, <code>almuerzo 25.50 efectivo comida</code>, ' +
  '<code>+ sueldo 3500</code>. Escribe /ayuda para más.';

function montoEscrito_(token) {
  const m = PATRON_MONTO_ESCRITO.exec(String(token));
  if (!m) return null;
  // "1,250" o "1,250.00" son miles; "12,50" es decimal.
  return Number(/,\d{3}/.test(m[1]) ? m[1].replace(/,/g, '') : m[1].replace(',', '.'));
}

// El único candidato con una palabra que empieza con `palabra` (≥ 4 letras), o null.
function unicoPorPrefijo_(palabra, candidatos) {
  if (palabra.length < 4) return null;
  const vistos = {};
  candidatos.filter(c => c.nombre.split(' ').some(x => x.indexOf(palabra) === 0))
    .forEach(c => { vistos[c.clase + ':' + c.id] = c; });
  const claves = Object.keys(vistos);
  return claves.length === 1 ? vistos[claves[0]] : null;
}

// ctx = { cuentas, categorias, reglas, ambitos?, cuentaBot }
function leerEscrito_(texto, ctx) {
  let t = String(texto || '').trim();
  const tipo = t[0] === '+' ? 'ingreso' : 'gasto';
  if (tipo === 'ingreso') t = t.slice(1).trim();
  const tokens = t.split(/\s+/).filter(x => x && !/^s\/\.?$/i.test(x));
  let i = tokens.findIndex((x, k) => k > 0 && montoEscrito_(x) !== null);
  if (i < 0 && tokens.length && montoEscrito_(tokens[0]) !== null) i = 0;
  if (i < 0) return { ok: false, error: TEXTO_NO_ENTENDI };
  const monto = redondear2_(montoEscrito_(tokens[i]));
  if (!(monto > 0)) return { ok: false, error: 'El monto debe ser mayor que cero.' };

  const cuentas = ctx.cuentas.filter(c => c.activa);
  const categorias = ctx.categorias.filter(c => c.activa && c.tipo === tipo);
  const yape = cuentas.filter(c => c.yape)[0];
  const efectivo = cuentas.filter(c => c.tipo === 'efectivo')[0];
  const candidatos = cuentas.map(c => ({ clase: 'cuenta', id: c.id, nombre: normalizarTexto_(c.nombre) }));
  if (yape) candidatos.push({ clase: 'cuenta', id: yape.id, nombre: 'YAPE' });
  if (efectivo) candidatos.push({ clase: 'cuenta', id: efectivo.id, nombre: 'EFECTIVO' });
  categorias.forEach(c => candidatos.push({ clase: 'categoria', id: c.id, nombre: normalizarTexto_(c.nombre) }));
  if (tipo === 'gasto') {
    (ctx.ambitos || []).filter(a => a.activo)
      .forEach(a => candidatos.push({ clase: 'ambito', id: a.id, nombre: normalizarTexto_(a.nombre) }));
  }

  // Primero nombres completos (el más largo gana), luego inicios de palabra únicos.
  const palabras = tokens.slice(i + 1).map(p => ({ texto: p, norm: normalizarTexto_(p), usada: false }));
  const elegido = {};
  candidatos.slice().sort((a, b) => b.nombre.length - a.nombre.length).forEach(c => {
    if (elegido[c.clase]) return;
    const partes = c.nombre.split(' ');
    for (let k = 0; k + partes.length <= palabras.length; k++) {
      const tramo = palabras.slice(k, k + partes.length);
      if (tramo.every((p, j) => !p.usada && p.norm === partes[j])) {
        tramo.forEach(p => { p.usada = true; });
        elegido[c.clase] = c.id;
        return;
      }
    }
  });
  palabras.forEach(p => {
    if (p.usada) return;
    const c = unicoPorPrefijo_(p.norm, candidatos.filter(x => !elegido[x.clase]));
    if (c) {
      elegido[c.clase] = c.id;
      p.usada = true;
    }
  });

  const descripcion = tokens.slice(0, i).concat(palabras.filter(p => !p.usada).map(p => p.texto)).join(' ');
  if (!descripcion) return { ok: false, error: 'Falta la descripción. ' + TEXTO_NO_ENTENDI };

  let cuentaId = elegido.cuenta || '';
  if (!cuentaId) {
    const porDefecto = cuentas.filter(c => c.id === ctx.cuentaBot)[0] || yape;
    if (!porDefecto) {
      return { ok: false, error: 'Indica la cuenta (por ejemplo "yape" o "efectivo") o elige una cuenta predeterminada en Ajustes → Telegram.' };
    }
    cuentaId = porDefecto.id;
  }

  let categoriaId = elegido.categoria || '';
  let reglaId = '';
  if (!categoriaId) {
    const regla = reglaPara_(descripcion, ctx.reglas);
    const deRegla = regla ? categorias.filter(c => c.id === regla.categoria_id)[0] : null;
    if (deRegla) {
      categoriaId = deRegla.id;
      reglaId = regla.id;
    } else {
      const deCategoria = candidatos.filter(c => c.clase === 'categoria');
      const palabra = normalizarTexto_(descripcion).split(' ').filter(w => unicoPorPrefijo_(w, deCategoria))[0];
      if (palabra) categoriaId = unicoPorPrefijo_(palabra, deCategoria).id;
    }
  }
  return { ok: true, tipo: tipo, monto: monto, descripcion: descripcion, cuenta_id: cuentaId, categoria_id: categoriaId, regla_id: reglaId,
    ambito_id: elegido.ambito && elegido.ambito !== AMBITO_PERSONAL ? elegido.ambito : '',
  };
}
