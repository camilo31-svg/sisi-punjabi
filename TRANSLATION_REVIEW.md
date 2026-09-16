# Revisión parcial de traducciones

Base: `252d3a5f08e8902d73da8276cae3bb5764101f1f`.

Se corrigen 91 glosas del vocabulario y 6 combinaciones. Las fuentes y el antes/después figuran en `translation-review.json`. La consulta usa diccionarios en gurmukhi para interpretar las formas existentes, pero **no modifica ningún carácter devanagari**, transliteración, identificador ni orden.

Esta revisión no certifica la totalidad de la aplicación. Las otras 3.607 entradas del vocabulario quedan pendientes de cotejo documentado; conservarlas no equivale a validarlas. Tampoco se certifican las 693 formas verbales, las 83 partículas, las 56 frases ni las otras 294 combinaciones. Las etiquetas de confianza originales se mantienen y no representan una validación nueva.

Las correcciones son equivalencias léxicas y, cuando se indica, interpretaciones de flexión o gramática. Una palabra polisémica puede necesitar otra acepción en una oración concreta. Las fuentes no prueban cuál era la lectura del documento original. Los términos religiosos se interpretan dentro del contexto general de satsang, sin atribuirles automáticamente una doctrina específica.

## Pendiente necesario

El propio conjunto declara que procede de OCR en hindi convertido automáticamente a punjabi mediante IndicTrans2. Para resolver formas dañadas y fragmentos de oración hace falta el PDF o texto de origen, junto con la correspondencia de páginas y, si existe, el texto punjabi generado. Ejemplos pendientes: `w459` (अमूरत) y `c299` (मैं निरयात हां). No se propone reconstruir estas formas por conjetura.

## Comprobación técnica

La validación compara todos los campos con la copia original y permite únicamente los 97 cambios de glosa registrados. Comprueba además que los archivos JavaScript cargan y que se conservan estructura, número de entradas, devanagari y transliteraciones.

El cambio de versión de caché permite que la PWA recargue los datos corregidos cuando se publique la propuesta.
