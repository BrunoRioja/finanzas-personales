// Utilidades para leer correos: HTML → texto de una línea y montos.

// Monto con símbolo: "S/ 1,250.00" o "$ 23.60". Grupo 1 = símbolo, grupo 2 = cifra.
const PATRON_MONTO = '(S\\/|\\$)\\s*([\\d,]+\\.\\d{2})';

// Entidades con nombre que usan los bancos (p. ej. el BCP escribe "m&iacute;nimo").
const ENTIDADES_HTML = {
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó',
  Uacute: 'Ú', ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ndash: '–', mdash: '—', iexcl: '¡', iquest: '¿',
  ordm: 'º', ordf: 'ª', deg: '°',
};

function htmlATexto_(html) {
  return String(html == null ? '' : html)
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n in ENTIDADES_HTML ? ENTIDADES_HTML[n] : m))
    .replace(/&amp;/gi, '&')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function leerMonto_(simbolo, cifra) {
  return { moneda: simbolo === '$' ? 'USD' : 'PEN', monto: redondear2_(Number(String(cifra).replace(/,/g, ''))) };
}
