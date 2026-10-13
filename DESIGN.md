# Sistema visual — Estilo B · Fintech oscuro

Fondo casi negro, tarjetas apenas más claras, un acento violeta para acciones y un verde para lo positivo. Los números mandan: tipografía del sistema con cifras tabulares.

## Tokens

| Token | Valor | Uso |
|---|---|---|
| `--fondo` | `#0b0b10` | Fondo de la app, campos de formulario |
| `--superficie` | `#17171f` | Tarjetas, ítems de lista, modal |
| `--superficie-2` | `#1f1f29` | Botón secundario, pestaña activa, hover |
| `--borde` | `#23232e` | Bordes y fondo de barras vacías |
| `--texto` | `#f2f2f7` | Texto principal |
| `--texto-2` | `#8b8b99` | Etiquetas, texto secundario |
| `--primario` | `#7c5cff` | Acento: botón +, foco, gastos en gráficos |
| `--positivo` | `#3ddc97` | Ingresos, ahorro, botón Guardar |
| `--alerta` | `#ffb347` | Cerca del límite, banner demo |
| `--negativo` | `#ff6b6b` | Excedido, deudas, errores |
| `--info` | `#4cc9f0` | Serie adicional en gráficos |

Radios: tarjetas 16px, controles 10px, chips 99px. Paleta de categorías: `#3ddc97 #ffb347 #7c5cff #4cc9f0 #ff6b6b #f72585 #b5e48c #ffd166`.

## Reglas

- Montos con `font-variant-numeric: tabular-nums` (clase `.num`); deudas y negativos en `--negativo` con signo `−`.
- Filas compactas `nombre · barra · monto · %` (`.fila-barra`): el monto siempre junto a su etiqueta, nunca separado por espacio vacío.
- Laptop: barra superior. Celular (≤ 720px): barra inferior fija y botón + flotante encima.
- Modales: centrados en laptop; hoja inferior en celular.
- Sin `alert`/`confirm`: las acciones destructivas piden un segundo toque.
