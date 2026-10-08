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
- Favoritos, estados y asignaciones de días se guardan solo en `localStorage` de ese navegador y dispositivo. No se sincronizan con el repositorio, con Google Docs ni con otros dispositivos.
- El botón **Reiniciar cambios** borra esos datos locales tras pedir confirmación.
- El sitio público contiene el itinerario y enlaces elegidos. No añadas boletos con códigos, datos de pasaporte, localizadores de reserva, direcciones privadas ni documentos personales al repositorio.
- El mapa usa mosaicos externos de OpenStreetMap y enlaces externos de Google Maps y Atlas Obscura. La primera visita necesita conexión a internet para mostrarlos.

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
