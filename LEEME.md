# Mapping de Terreno EST — v9.5

## QuickStart (QS)

1. Carga el Mapping en MD revisado contra el diagrama original. Debe identificar el proyecto y una única sección `Card panel:tarjeta`, conservar el orden y declarar todas sus filas. Los MD con advertencias de OCR, direcciones repetidas o conexiones incompletas se rechazan sin modificar la sesión.
2. Carga el PDF original **Signature Series Barcode Report** más reciente. Se conserva cada equipo por panel, tarjeta y dirección; el reporte seleccionado actualiza los seriales, etiquetas y ubicaciones. También se admite cargar primero el reporte.
3. Guarda la sesión JSON para conservar las notas y continuar después, incluso sin conexión.

El XDU es opcional: su lector incorpora el inventario (direcciones, seriales, etiquetas, ubicaciones y modelos identificables de la capa leída). No importa sus conexiones ni sustituye el Mapping del terreno. Un proyecto antiguo puede contener equipos o seriales distintos del reporte. Los modelos no identificables quedan sin asignar; no se deducen del texto de la etiqueta.

Los equipos presentes solo en el reporte o XDU quedan sin encadenar. Los que faltan en el reporte permanecen con aviso y serial anterior de referencia. Reimportar los documentos conserva las notas; cada tarjeta mantiene su propio reporte seleccionado. Para QS se usa un proyecto por sesión.

El Mapping QS en PDF dibujado como imagen requiere conversión y revisión previa; esta versión no añade OCR en el iPhone. La lectura directa XDU se verificó con el esquema Paradox incluido en los archivos de prueba; otros esquemas se rechazan explícitamente. El reporte detallado **Signature Series Report** no forma parte del nuevo lector Barcode validado.

## Flujo de las demás familias

| Familia | Primero | Después |
| --- | --- | --- |
| iO | SAS | Reporte PDF más reciente, si procede |
| EST2 | SDU con Mapping guardado o Mapping PDF | Reporte de seriales PDF reciente |
| EST3 | SDU con Mapping guardado o Mapping PDF | Reporte de seriales PDF reciente |
| EST4 | Mapping PDF exportado desde 4-CU | Reporte de seriales PDF reciente |

El Mapping determina el orden y las conexiones. El reporte seleccionado determina los seriales vigentes. Para los PDF se recomienda **Exportar a PDF** desde el programa de origen.

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
