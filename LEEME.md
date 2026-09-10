# Mapping EST PWA v8.1 — EST3 PDF y SAS iO

La app carga directamente el Mapping PDF vectorial original de EST3, reconstruye las conexiones dibujadas y permite guardar el resultado como MD. Conserva el lector SAS iO de la v7.1 que el usuario comprobó en su iPhone.

## Uso

1. Para iO, carga el SAS. El reporte de serial sigue siendo opcional.
2. Para EST3, carga el Mapping PDF original y el reporte de serial PDF. Se pueden seleccionar juntos o en cualquier orden. Si cargas primero el reporte, queda guardado hasta incorporar su Mapping.
3. También admite el MD EST3 generado por MD Híbrido cuando contiene un solo controlador/loop y una tabla con direcciones y seriales verificables. Si ese MD no declara el nombre del proyecto, solo se vincula cuando el reporte identifica un proyecto único con ese gabinete/controlador.
4. Usa el selector de proyecto/controlador/loop. «Solo los del mapping» oculta equipos presentes únicamente en el reporte. Las marcas y notas se conservan al cargar otra vez el mismo archivo.
5. Menú → Guardar Mapping en MD. Cada descarga contiene un solo controlador/loop, sus conexiones y el serial vigente del reporte cuando esté disponible. La columna Serial Mapping conserva el serial original como referencia. El reporte completo y las anotaciones se conservan en la sesión JSON.

## Mapping parcial o de otra revisión

Es posible trabajar con un Mapping antiguo y un reporte reciente. La app distingue:

- La coincidencia de proyecto/gabinete/controlador/loop y dirección vincula el equipo. El serial vigente proviene del reporte aunque difiera del Mapping.
- Dirección con serial diferente: actualiza el serial vigente con el reporte y conserva el original del Mapping como referencia. No cambia su posición, padre, ramas ni T-taps.
- Equipo solo en el reporte: lo incluye después de los equipos del Mapping, sin inventar una conexión.
- Equipo del Mapping ausente del reporte del mismo loop: lo señala como «solo en Mapping».

Los avisos de diferencia no bloquean la carga. Un archivo distinto se conserva como otro origen. Si varios proyectos/revisiones hacen ambiguo un enlace, el reporte queda pendiente. El último reporte cargado sustituye al anterior para los loops que contiene; los demás loops conservan su reporte. Esta prioridad aplica también al reporte iO cuando el panel/loop/dirección se identifican de forma única.

## Instalar o actualizar en iPhone

Publica todos los archivos de esta carpeta juntos en el alojamiento HTTPS que utilizas para la PWA. Abre con conexión, cierra y vuelve a abrir hasta ver «Versión 8.1». Después de la primera carga completa quedan disponibles los lectores PDF/MD/SAS sin conexión; los documentos deben estar descargados en Archivos.

Esta entrega pasó pruebas en Chromium con tamaño de pantalla móvil y sin conexión. La v8.1 todavía necesita tu comprobación en Safari/iPhone físico; la confirmación anterior corresponde a la v7.1.

## Sesiones y originales

La v8 utiliza un almacenamiento distinto. En la misma dirección web puede copiar la sesión v7 al pulsar Reanudar, conservando el original. Si cambia la dirección, guarda la sesión JSON en la app anterior y cárgala en esta. Reiniciar la v8 vacía su propia sesión.

Las carpetas y ZIP originales v6/v7/v7.1, MD Híbrido, BRS y los documentos proporcionados no se modificaron.

## Validación de esta entrega

- Murano PDF: 79 dispositivos, 77 conexiones y 1 T-tap, iguales al conversor de referencia.
- Offizzina PDF: 149 dispositivos, 148 conexiones y 2 T-taps, iguales al conversor de referencia.
- Reportes: Murano 91 filas (incluidas etiquetas sin guion bajo), Offizzina 424 filas y Beachclub 324 filas. Conserva gabinete/controlador/loop y separa columnas aunque la ubicación sea larga.
- Beachclub: el ZIP aportado contiene MD y reporte PDF, sin el PDF original del Mapping. Su MD tiene 146 equipos; 96 seriales coinciden por dirección, 48 difieren y 2 direcciones no aparecen en el reporte. Los 144 equipos presentes usan el serial del reporte; se comprobó que los 146 conservan exactamente el orden de la tabla MD. Una comparación independiente con PyMuPDF confirmó estos resultados. El MD declara 2 T-taps y su tabla deja 97 raíces; no se certifican las conexiones del plano original sin ese PDF.
- Regresión iO: cinco SAS, 1.157 dispositivos y 11 loops; reporte Saratoga, MD, sesiones, anotaciones y modo sin conexión.
- Rechazo de PDF con páginas duplicadas o giradas sin alterar la sesión anterior. Separación de controladores con el mismo número de loop.

## Límites

El nuevo lector vectorial es para EST3 y los diseños de PDF comprobados. No añade reconstrucción avanzada de EST2, EST4 o QuickStart; siguen disponibles sus lectores anteriores. SDU/XDU pueden seleccionarse, pero no se convierten directamente. Para esos archivos usa el Mapping exportado. Un PDF escaneado requiere conversión/OCR externo.

La app limita los archivos a 20 MB, los PDF a 200 páginas y el análisis geométrico EST3 a 1.500 dispositivos por controlador/loop. No sube los documentos a servidores.

## Archivos principales

index.html, sas-mapping.js, sas-ui.js, est3-mapping.js y est3-report.js. JSZip y PDF.js permanecen incluidos localmente; JSZip conserva su licencia adjunta y PDF.js su licencia incrustada. sw.js, manifest.webmanifest e iconos proporcionan la instalación y caché.

Evidencia y pruebas reproducibles en la carpeta hermana AUDITORIA_PWA.

## Verificación v8.1

36 comprobaciones automáticas superadas: 16 EST3 y 20 iO/regresión. Incluyen prioridad del último reporte, serial cambiado al reimportar SAS, orden exacto Beachclub, exportación MD con serial vigente y referencia original, y actualización de sesiones guardadas en v8.
