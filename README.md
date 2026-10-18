# mi-itinerario

Atlas personal de viaje, en español. La primera etapa organiza São Paulo para diciembre; fechas y lugares se distinguen entre información compartida, propuesta y datos que aún requieren confirmación.

## Abrir en tu computadora

Necesitas Node.js 22 o posterior y npm.

```bash
npm ci
npm run dev
```

La terminal mostrará la dirección local (normalmente `http://localhost:3000`). La página no necesita cuenta ni servidor de datos.

Para probar el export estático ya compilado, ejecuta `npm run build` y luego `npm start`. El servidor local sirve `out/` en `http://localhost:3000/`. Para probar un build de GitHub Pages con el prefijo real, ejecuta `GITHUB_ACTIONS=true GITHUB_REPOSITORY=Deghim/mi-itinerario npm run build` y luego `BASE_PATH=/mi-itinerario npm start`; abre `http://localhost:3000/mi-itinerario/`.

## Datos y privacidad

- La fuente editable de lugares vive en [`docs/data/lugares-sao-paulo.json`](docs/data/lugares-sao-paulo.json); el contexto y calendario del viaje están en [`docs/data/viaje.json`](docs/data/viaje.json).
- Las referencias y escenarios del presupuesto están en [`docs/data/presupuesto.json`](docs/data/presupuesto.json); las reglas y límites se explican en [`docs/PRESUPUESTO.md`](docs/PRESUPUESTO.md).
- La tabla oficial de ocho columnas, las filas vacías del 15–20 de diciembre, las notas fuera de tabla y la cobertura de puntos viven en [`docs/data/itinerario.json`](docs/data/itinerario.json) y [`docs/data/itinerario-rio.json`](docs/data/itinerario-rio.json). El snapshot de Google Docs se importa manualmente cuando el usuario lo pide.
- Favoritos, estados, asignaciones, horarios sugeridos y rutina se guardan en `localStorage` de ese navegador y dispositivo. Las ediciones de transporte, hospedaje, reserva y notas de la tabla usan una clave local propia; las elecciones y gastos del presupuesto usan otra. Nada se sincroniza con el repositorio, Google Docs ni otros dispositivos.
- El botón **Reiniciar cambios** borra favoritos, estados, días, agenda y notas locales de tabla tras pedir confirmación; **Borrar mis cambios de presupuesto** solo limpia el presupuesto local.
- La agenda propone horas, duraciones, traslados y márgenes editables; no confirma reservas ni horarios de apertura. Consulta [`docs/HORARIOS.md`](docs/HORARIOS.md).
- El sitio público contiene el itinerario y enlaces elegidos. No añadas boletos con códigos, datos de pasaporte, localizadores de reserva, direcciones privadas ni documentos personales al repositorio.
- El mapa usa mosaicos externos de OpenStreetMap y enlaces externos de Google Maps y Atlas Obscura. La primera visita necesita conexión a internet para mostrarlos.

La fuente editorial es el Google Doc indicado en [`docs/GOOGLE_DOC_SYNC.md`](docs/GOOGLE_DOC_SYNC.md). No hay cron, live fetch ni Apps Script activo: el comando manual recibe un HTML exportado, valida la tabla y escribe los JSON de forma atómica. Las referencias web anteriores y las notas del Doc se muestran en **Opcionales**, fuera de la agenda oficial.

## Publicar en GitHub Pages

La rama `main` activa el workflow de GitHub Actions. El workflow instala con `npm ci`, ejecuta lint, TypeScript, pruebas, exporta el sitio estático y publica `out/` en Pages. Para habilitarlo en GitHub, en **Settings → Pages → Build and deployment** selecciona **GitHub Actions**.

La compilación de Pages establece `basePath: '/mi-itinerario'` para que funcionen los recursos del repo `Deghim/mi-itinerario`. Las compilaciones locales usan rutas raíz y se ven en `http://localhost:3000`.

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

El mapa incluye coordenadas y líneas simplificadas del borrador. Confirma direcciones, operación, acceso, transporte y horarios con las fuentes antes de salir.
