# Importar el itinerario de Google Docs

El Google Doc es la fuente de verdad editorial, pero la sincronización es manual y puntual: solo se ejecuta cuando el usuario la pide. No hay cron, live fetch, endpoint Apps Script ni despliegue de Apps Script activo.

## Comando seguro

Exporta el documento desde Google Docs como HTML fuera del repositorio y ejecuta:

```bash
node scripts/google-doc-import.mjs \
  --html ../agent-runs/mi-itinerario/DOCS_WEB_SYNC_20261017/fresh.html \
  --captured-at 2026-10-18T04:04:15.000Z
```

El importador usa `parse5`, valida una tabla de ocho columnas (`Fecha`, `Hora`, `Lugar`, `Actividad`, `Transporte`, `Costo`, `Reserva/boleto`, `Notas`), reconstruye `rowspan`/`colspan`, conserva celdas vacías y normaliza únicamente wrappers volátiles de Google en enlaces públicos. Extrae también el preámbulo y el postámbulo como notas Docs. Primero valida el snapshot completo y luego reemplaza ambos JSON mediante archivos temporales; un fallo no deja una importación parcial.

El año 2026 es provisional y se pasa explícitamente al importador. El export HTML, TXT, headers, tickets y documentos privados se mantienen fuera del repositorio. Antes de publicar hay que revisar los textos y enlaces del snapshot.

## Modelo en la página

- Las filas importadas tienen `origin: docs`, `applyToAgenda: false`, `cellLinks` y metadatos de snapshot (`sync.snapshotHash`). La UI muestra `Fuente: Google Docs · actualizado … · se sincroniza cuando lo pidas`.
- La fuente oficial no es sobreescrita por `dayAssignments`, `placeSchedule` ni overrides locales. Favoritos, estados, agenda personal y gastos siguen en `localStorage` separado.
- Los días 15–20 se conservan como filas vacías del Doc; no se generan actividades. El 22–23 y otras filas web anteriores quedan en **Opcionales**, fuera de agenda.
- Las dos filas de Cantareira se conservan en la tabla; solo la primera participa como parada de mapa y presupuesto no se suma automáticamente.
- La base vigente de Río es `Hospedaria Rio`, candidata y no reservada, con dirección oficial en Rua Vicente de Sousa 29 y coordenada de geocodificación OSM. Injoy se conserva como referencia web local opcional.

## Legado

`integrations/google-doc-sync/` conserva el parser de Apps Script de nueve columnas únicamente como referencia histórica. No se ejecuta en el workflow ni en el runtime. No configurar `GOOGLE_DOC_SYNC_URL` ni desplegar Apps Script para este flujo.

## Validación

```bash
npm run test:data
npm run lint
npm run typecheck
npm run build
npm run test:export
```

Las pruebas deben usar HTML sintético pequeño y no incluir el export completo real.
