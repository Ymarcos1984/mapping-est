# Mapping EST PWA v9.2 — SDU EST2 directo y reportes

10 de septiembre de 2026.

## Valencia: carga directa

1. Selecciona `VALENCIA_01_00_00_58.SDU`. Se lee en el dispositivo, sin BRS, OCR ni conversión previa a MD.
2. Para actualizar los seriales, añade `REPORTE LOOP 1.pdf` y `REPORTE LOOP 2.pdf`. Pueden cargarse juntos o en cualquier orden. Si llegan antes del Mapping, quedan pendientes hasta encontrar un origen compatible y único.
3. El reporte más recientemente cargado manda para los equipos que contiene. El Mapping conserva secuencia, conexiones y T-taps. El serial del proyecto queda como referencia.
4. Menú → Guardar Mapping en MD exporta el origen elegido. Serial contiene el valor vigente y Serial Mapping conserva el original. La sesión JSON guarda también los reportes completos y las notas de terreno.

No necesitas MD ni reportes para abrir el SDU. Si tienes un reporte más reciente que el proyecto, cárgalo para trabajar con sus seriales vigentes.

## Resultado comprobado

- Los 65 dispositivos del SDU coinciden en dirección, modelo, etiqueta, mensaje, serial, nivel y padre con el lector BRS suministrado.
- La secuencia completa coincide con la tabla de `VALENCIA_MAPPING.md`, generado el 10 de septiembre. Conserva 60 conexiones identificables y 2 T-taps.
- Las direcciones 107 y 113 están en el programa pero no tienen dirección de mapa en SATODA. Las direcciones 105 y 128 dependen de celdas sin dirección identificable. Se señalan estas cuatro conexiones ausentes, sin inventarlas.
- El Mapping PDF tiene 65 equipos y 64 conexiones. Su lector conserva las conexiones dibujadas. No se rellenan automáticamente los huecos del SDU usando el PDF.
- Reporte 1: 31 filas. Reporte 2: 36 filas, incluidas 34 de dispositivos y dos circuitos MCM-NAC (201 y 202) sin serial. Para completar Valencia se utilizan ambos reportes.
- SDU más ambos reportes: 67 registros. Los MCM-NAC quedan al final, sin serial supuesto ni conexiones inventadas.
- Las nueve columnas de las 67 filas coinciden con una extracción independiente mediante PyMuPDF, incluidas las celdas de varias líneas.

Cada archivo distinto se conserva como otro origen. Si cargas el PDF y el SDU de la misma obra, un reporte puede encontrar dos Mapping compatibles y quedar pendiente. Para trabajar con una sola versión, guarda la sesión anterior y empieza una sesión con el origen que quieras usar.

## Otros lectores

- iO: SAS directo y reporte opcional, conservando la prioridad del serial reciente.
- EST3: Mapping PDF vectorial y reporte PDF; también el MD compatible de un controlador, comprobado con Beachclub.
- EST2: SDU directo o Mapping PDF del diseño Valencia, más los reportes tabulares aportados.
- EST4 y QS: conservan sus lectores anteriores. No se añade SDU EST3 ni XDU directo.

## Actualizar en iPhone

Publica todos los archivos de esta carpeta juntos en el alojamiento HTTPS de tu PWA. Abre con conexión y vuelve a abrir hasta ver «Versión 9.2» en la pantalla de carga. El selector permite elegir SAS/SDU y valida su contenido después.

Tras una carga completa, los lectores y librerías quedan guardados para trabajar sin conexión. Los documentos deben estar descargados en Archivos. No se suben a ningún servidor.

La v9.2 usa la clave de sesión de v9 y puede copiar sesiones v8/v8.1 en el mismo sitio. Si cambias de dirección web, exporta tu sesión JSON y cárgala en la nueva dirección. Se conservaron los ZIP anteriores.

## Validación y límites

55 comprobaciones automáticas en navegador: 11 de SDU/reportes EST2, 8 de Mapping PDF EST2, 16 de EST3 y 20 de iO/regresión. Incluyen trabajo sin conexión, MD, notas, sesiones, serial reciente, archivos dañados y separación de proyectos. La prueba física de v9.2 en Safari/iPhone está pendiente; la confirmación anterior corresponde a v8.1.

El lector SDU admite las tablas Paradox EST2 comprobadas en Valencia y mapas CURMAP/SATODA de 256 celdas. Rechaza esquemas distintos, tablas truncadas, direcciones repetidas, ciclos y punteros que no se pueden resolver de forma única. No se certifica aquí todo el corpus EST2.

Los reportes EST2 añadidos son los PDF tabulares de nueve columnas aportados. Los grupos 01/02 de la dirección identifican sensores/módulos del mismo loop; no se interpretan como dos cables físicos. El enlace exige equipos coincidentes y un único origen. Un reporte de otra estructura o escaneado puede requerir conversión externa.

Límite: 20 MB por archivo y 200 páginas por PDF. El MD contiene los dispositivos de su origen; las filas adicionales del reporte se conservan en la sesión JSON.

Pruebas reproducibles y evidencias: carpeta hermana `AUDITORIA_PWA`. BRS, MD Híbrido y los documentos originales no se modificaron.