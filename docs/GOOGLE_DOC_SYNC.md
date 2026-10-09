# Conectar el itinerario de Google Docs

La integración prevista es **de una sola vía: Google Docs → sitio**. El documento no se vuelve público y nadie editará el documento desde el sitio. Una pestaña dedicada, `Itinerario web`, es la única fuente que se publicaría; el endpoint que alimenta GitHub Pages sí sería público y contendría únicamente la tabla aprobada de nueve columnas. Otras pestañas, boletos, localizadores, archivos y enlaces privados quedan fuera.

Todavía no está conectada: el Google Doc sigue privado, no se ha autorizado Google, no se ha desplegado Apps Script y no se ha configurado una URL en GitHub. Hasta completar esos pasos, la página usa los datos del repositorio y su botón **Copiar para pegar en Google Docs** solo copia la tabla pública completa; no crea una conexión ni modifica el documento. Copiar no incluye las notas personales guardadas en el navegador.

## Preparación

1. En el Google Doc, crear una pestaña llamada exactamente `Itinerario web` y pegar ahí la tabla con los encabezados `Fecha`, `Hora`, `Lugar`, `Actividad`, `Transporte`, `Hospedaje`, `Costo estimado`, `Reserva / boleto` y `Notas`. Si se usan fechas fusionadas, mantenerlas dentro de la tabla. Solo se publicará el contenido de esta pestaña.
2. Revisar la pestaña para que cada campo sea apto para aparecer en un sitio público. En particular, la columna de reserva debe decir solo su estado; no copies códigos, identificadores, enlaces privados ni información personal. La validación automática bloquea varios patrones conocidos y enlaces fuera de una lista de fuentes revisadas, pero no puede garantizar que encuentre todos los datos privados: la pestaña completa requiere revisión humana antes de publicarse.
3. Con el propietario ya conectado en el navegador compartido, preparar un proyecto Apps Script, habilitar el servicio avanzado Docs API, instalar los archivos de `integrations/google-doc-sync/` y autorizar lectura del documento. El manifiesto limita el scope a `documents.readonly`. Guardar el ID del Doc como propiedad del script `GOOGLE_DOC_ID`; no editar el archivo para pegar el ID.
4. Revisar y desplegar el web app como propietario con acceso anónimo. Esa URL entrega solo las filas admitidas de `Itinerario web`; aun así, la tabla aprobada pasa a ser información pública. No cambia el permiso del documento completo.
5. Guardar la URL del web app como variable del repositorio `GOOGLE_DOC_SYNC_URL`. No se agrega al código del navegador ni al repositorio. La acción de GitHub la consulta cada quince minutos y antes de generar el sitio en los despliegues por `push` o manuales.

Estos pasos aún requieren que el propietario inicie sesión y autorice Google; el asistente no recibió credenciales reutilizables ni ha cambiado permisos. No compartas contraseñas, cookies, tokens, códigos de boleto ni claves en el chat.

## Cómo se comporta la página

- Si la variable todavía no existe, las ejecuciones programadas se omiten y los despliegues normales usan el archivo actual del repositorio.
- Cuando está configurada, la acción descarga el JSON público, valida todas las filas y recién entonces lo aplica al workspace temporal del build. No hace commits automáticos de los datos.
- Si Google pide iniciar sesión, la pestaña no existe, hay una respuesta HTML o la tabla no cumple el esquema, el build falla y el sitio publicado conserva la versión anterior.
- El sitio muestra cuándo se leyó la fuente. Los cambios oficiales se hacen en Docs; favoritos, visitas, días y horarios personales siguen guardados localmente en cada navegador.
- Los identificadores de filas se derivan de fecha, lugar y ocurrencia. Cambiar la hora o actividad conserva la fila; moverla a otra fecha o lugar puede crear otro identificador. Las notas locales anteriores se conservan en su almacenamiento, pero una fila que cambie de identidad puede dejar de mostrarlas. No se usan importes para asociar gastos.
- Una fila se enlaza a un lugar o gasto previo solo cuando el nombre y la actividad coinciden de forma inequívoca con la fuente existente. En los demás casos queda como texto y no se le atribuye un costo ni una reserva.
- El checklist mantiene el catálogo, pero una propuesta solo cuenta si ese `placeId` aparece en la fuente actual; si el Doc quita una fila, el punto vuelve a pendiente.
- Los importes escritos como texto en el itinerario no se suman automáticamente al presupuesto. El enlace a Presupuesto permite revisarlo por separado.

## Fuentes web admitidas

El parser y el sincronizador usan la misma allowlist de dominios de fuentes que ya aparecen en los datos públicos del proyecto. Se rechazan hosts desconocidos, rutas con palabras de reserva y segmentos que parezcan códigos opacos. Las query strings solo se aceptan en dos casos no personales: `departureDate` en ClickBus y `method=ConsultarTodasAsMoedas` en PTAX del Banco Central. Las páginas públicas de entradas en un dominio aprobado no se bloquean solo porque la ruta diga “ticket”. Cuando se apruebe una nueva fuente pública, actualizar la lista compartida en `integrations/google-doc-sync/Parser.gs` y añadir una prueba. La allowlist reduce riesgos; no sustituye la revisión humana de la pestaña pública.

## Pruebas locales

Las pruebas usan fixtures sintéticas; no incluyen contenido del documento. Ejecuta `npm run test:data` antes de sincronizar y `npm run test:export` después del build. `npm test` corre ambas fases (requiere que ya exista `out/`). Para comprobar el normalizador sin acceder a Google, el flujo de Node también valida respuestas guardadas de prueba, pero nunca se debe guardar una respuesta privada real dentro del repositorio.
