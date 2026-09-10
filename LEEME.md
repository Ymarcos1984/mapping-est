# Mapping de Terreno EST — v9.4

## Carga directa EST4

1. Selecciona el PDF de Mapping exportado desde 4-CU.
2. Selecciona el reporte Signature Barcode Worksheet correspondiente al estado actual del panel.
3. Revisa los avisos y comienza el trabajo. También se admite cargar primero el reporte.

El lector reconstruye los recuadros y sigue las conexiones dibujadas, une el solapamiento entre páginas y conserva el orden de las ramas y T-taps. Admite las dos variantes verificadas: exportación vectorial y PDF impreso con rotación interna, imágenes de recuadros y texto seleccionable. No realiza OCR de escaneos.

El serial vigente procede del reporte cargado. El original del Mapping permanece como referencia. Si el reporte indica que un circuito no imprime serial independiente, la app lo muestra vacío; no copia el serial del equipo siguiente ni sustituye el vacío por un serial antiguo.

Los dispositivos presentes únicamente en el reporte aparecen después del Mapping, sin conexión inventada. Los que están en el Mapping pero faltan en el reporte se conservan con aviso. Los recuadros sin conexión dibujada también se conservan como tales.

La app muestra el nombre y la versión interna del reporte para ayudar a distinguir archivos de diferentes revisiones. No decide cuál representa el estado actual del panel: debes cargar el reporte correcto. Cada sesión admite un diagrama EST4 y el reporte de un controlador/SLC; los casos ambiguos se rechazan sin modificar el trabajo guardado.

## Compatibilidad y conservación del trabajo

Se mantienen los lectores SAS iO, SDU EST2 y EST3, los Mapping PDF EST2/EST3 y las sesiones anteriores. El selector de archivos sigue sin filtros que deshabiliten SAS/SDU en iPhone. El procesamiento es local; no se envían los documentos a un servidor.

Reimportar el mismo Mapping conserva las anotaciones y el reporte seleccionado. Guardar sesión JSON permite conservar el trabajo y trasladarlo entre dispositivos. Guarda tu sesión actual antes de abrir una diferente.

Tras cargar la PWA con conexión, sus lectores quedan disponibles sin internet. Actualiza la aplicación después de publicar esta versión para renovar la caché.

## Publicación

Esta carpeta contiene los archivos estáticos de la aplicación. Para GitHub Pages, publica su contenido en la raíz del sitio; no publiques documentos de clientes, sesiones JSON, pruebas o carpetas de auditoría.

La validación y el estado de publicación de esta entrega se registran fuera de esta carpeta, en AUDITORIA_PWA.
