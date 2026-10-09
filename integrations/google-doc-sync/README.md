# Puente de lectura para Google Docs

Este proyecto contiene una implementación preparada; todavía no se ha creado ni desplegado en Apps Script. Al activarse, la aplicación de Apps Script será pública y entregará únicamente las filas de la pestaña titulada exactamente **Itinerario web**. El documento y sus demás pestañas seguirán privados.

`Parser.gs` es la única implementación del parser. Se copia junto con `Code.gs` y `appsscript.json` a un nuevo proyecto de Apps Script. El servicio avanzado Google Docs API debe estar habilitado en ese proyecto. Guarda el ID del documento en Apps Script → **Project Settings → Script properties** con el nombre `GOOGLE_DOC_ID`; no lo pegues en el código. El manifiesto pide solamente `documents.readonly`.

El parser exige los nueve encabezados, reconstruye fechas en celdas fusionadas y acepta tablas continuadas. Rechaza esquema, fechas, horas, enlaces o spans ambiguos. La columna Reserva / boleto se reduce a un estado y nunca publica su texto libre. Las URLs solo se permiten en dominios de fuentes públicas revisadas y no incluyen rutas reservadas ni tokens opacos. Se admiten solo dos parámetros de consulta no personales: fecha de salida de ClickBus y método de consulta de PTAX. No se registran las filas ni los errores originales del documento.

La respuesta del endpoint es pública: cualquiera que conozca su URL puede leer los datos aprobados en esa pestaña. No agregues a esa pestaña localizadores, códigos, boletos, archivos, enlaces privados ni notas personales. Las reglas automáticas reducen riesgos, pero no detectan todos los datos sensibles; revisa manualmente toda la pestaña antes de desplegar el web app y cada vez que cambie.
