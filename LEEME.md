# Mapping EST PWA v7.1 — selector de iPhone y SAS iO

Esta copia permite cargar el SAS de iO sin convertirlo antes con BRS. Lee el mapa interno y conserva por separado cada proyecto, panel, loop y dirección.

## Uso
1. Abre la aplicación y selecciona el archivo `.SAS` en «Elegir archivo».
2. La lista incluye orden, T-taps, etiquetas, mensajes y seriales. Usa el selector para elegir panel y loop.
3. Si aparece un aviso de Mapping incompleto o padre ausente, revisa ese caso. No se inventan conexiones.
4. El reporte de serial iO es opcional: cárgalo después del SAS. Solo se vinculan filas con serial completo y dirección coincidentes de forma única. No se reemplaza la topología con el reporte.
5. Para guardar el MD: menú «⋯» → «Guardar Mapping en MD». Si hay varios loops, elige uno. Cada archivo contiene un solo panel/loop para no mezclar direcciones al usarlo en lectores anteriores.
6. Puedes seguir marcando estados, añadiendo notas y guardando/cargando la sesión JSON. Volver a cargar el mismo SAS conserva sus anotaciones.

Un SAS diferente se mantiene como otro origen, aunque comparta nombre de obra; no sustituye silenciosamente el anterior. El selector distingue proyecto, panel y loop. Guarda tu sesión antes de «Reiniciar todo» si quieres comenzar otra obra.

## iPhone y funcionamiento sin conexión
Publicar todos los archivos de esta carpeta juntos en una dirección HTTPS. Abrir esa dirección en Safari y añadirla a la pantalla de inicio. Después de la primera carga completa, la aplicación y su lector SAS quedan disponibles sin conexión; los SAS se seleccionan desde Archivos.

En esta PC también se puede probar mediante un servidor local. Abrir index.html como archivo no instala una PWA ni comprueba su modo sin conexión. Esta entrega todavía requiere prueba en un iPhone físico.

## Sesión anterior
La v7 usa su propio almacenamiento. No borra el de la v6 ni sus cachés.
- Si ambas se abren desde el mismo sitio, puede aparecer «Copiar sesión anterior v6».
- Si cambia la dirección del sitio, guarda la sesión JSON desde la v6 y cárgala en la v7.
- La copia original Mapping_EST_PWA_v6.zip permanece intacta.

## Alcance de esta entrega
Implementado: SAS iO → Mapping de la PWA, MD por loop y enlace del reporte iO aportado.
Los lectores PDF/MD/TXT anteriores permanecen disponibles. Esta versión NO incorpora todavía el motor avanzado de MD Híbrido para reconstruir Mapping PDF EST2/EST3/EST4/QuickStart. Tampoco modifica MD Híbrido ni BRS.

## Comprobaciones realizadas
- Comparación de todos los campos y conexiones con el lector BRS suministrado: cinco SAS, 1.157 dispositivos, 11 loops.
- Saratoga: 65 dispositivos y 3 T-taps; su reporte PDF vincula 65 filas.
- Exportación MD: 65 seriales y relaciones de padre comprobados con el lector de la PWA anterior.
- Multi-loop, anotaciones, reimportación, sesiones JSON, copia de sesión v6 y funcionamiento sin conexión.
- Rechazo sin cambios de SAS incompleto; duplicados, ciclos, XML inválido, entidades y números inválidos.
- Exportación PDF conserva el proyecto y loop seleccionados.
- Navegador Chromium local con pantalla móvil. Sin peticiones a servidores externos en las pruebas.
- Pendiente: prueba real en Safari/iPhone y publicación en el alojamiento del usuario.

## Archivos
index.html, sas-mapping.js y sas-ui.js contienen la aplicación y la nueva función.
jszip.min.js permite leer los ZIP SAS localmente. Licencia en LICENSE-JSZip.md.
sw.js, manifest.webmanifest e iconos permiten instalarla como PWA.

Evidencia detallada de pruebas en la carpeta hermana AUDITORIA_PWA.

## Corrección v7.1: archivos grises en iPhone
Se eliminó el filtro `accept` del selector principal. La extensión y el contenido se validan después de seleccionar el archivo. El selector ya no restringe los tipos disponibles; la comprobación física del selector de iOS queda pendiente.

SAS tiene lector directo. SDU/XDU se pueden seleccionar, pero esta versión no los convierte: muestra un mensaje explícito y conserva la sesión. Para esos paneles se mantiene la carga de Mapping MD.

Se cambió la versión del caché y del script de carga. Al publicar, reemplazar todos los archivos de la carpeta, incluido sw.js. Abrir la aplicación con conexión, cerrarla y volver a abrirla hasta ver «Versión 7.1». No es necesario borrar la PWA ni los datos. Guardar una copia JSON de la sesión antes de actualizar es recomendable.
