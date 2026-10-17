// Roles de categoría: marcan la categoría de préstamos (gasto) y la de reembolsos (ingreso).
// Cada rol vive en una sola categoría activa; el valor es el tipo que la categoría debe tener.

const ROLES_CATEGORIA = { prestamo: 'gasto', reembolso: 'ingreso' };
const NOMBRES_ROL = { prestamo: ['PRESTAMO', 'PRESTAMOS'], reembolso: ['REEMBOLSO', 'REEMBOLSOS'] };

// Rol de una categoría activa; una desactivada o inexistente no tiene rol.
function rolDe_(categorias, categoriaId) {
  const c = (categorias || []).filter(x => x.id === categoriaId)[0];
  return c && c.activa !== false && c.rol ? c.rol : '';
}

function categoriaConRol_(categorias, rol) {
  return (categorias || []).filter(c => c.activa !== false && c.rol === rol)[0] || null;
}

// Dentro del bloqueo: marca las categorías existentes por su nombre o crea la de préstamos. Idempotente.
function asegurarRolesPrestamo_() {
  const categorias = leerTabla_('Categorias');
  Object.keys(ROLES_CATEGORIA).forEach(rol => {
    if (categoriaConRol_(categorias, rol)) return;
    const tipo = ROLES_CATEGORIA[rol];
    const candidata = categorias.filter(c => c.activa !== false && c.tipo === tipo &&
      NOMBRES_ROL[rol].indexOf(normalizarTexto_(c.nombre)) >= 0)[0];
    if (candidata) {
      actualizarFila_('Categorias', candidata.id, { rol: rol });
      candidata.rol = rol;
    } else if (rol === 'prestamo') {
      const nueva = Object.assign({ id: nuevoId_() }, normalizarCategoria_(
        { nombre: 'Préstamos', emoji: '🤝', tipo: 'gasto', rol: 'prestamo' }, categorias, ''));
      agregarFilas_('Categorias', [nueva]);
      categorias.push(nueva);
    }
  });
}
