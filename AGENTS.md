# Instrucciones del proyecto — mi-itinerario

## Objetivo
- Crear y mantener un itinerario personal de viaje en español, empezando por São Paulo.
- El proyecto Next.js debe ser sencillo de usar desde teléfono y computadora, legible para una persona que no revisará código y preparado para desplegarse en GitHub Pages.
- Documentar en el repositorio el itinerario, lugares, fuentes, enlaces, reservas, boletos e información práctica que el usuario vaya compartiendo.
- El Google Doc existente también forma parte del flujo editorial del itinerario; coordinar sus cambios con el usuario y conservar aquí la referencia y el historial necesario.

## Forma de trabajo solicitada por el usuario
- El usuario pidió que el asistente principal orqueste y que las acciones de exploración e implementación se ejecuten con Luna 5.6 High (o Luna 6 High si Luna 5.6 no está disponible).
- El usuario pidió una revisión adversarial posterior con Terra 5.6 High.
- El usuario autorizó las acciones necesarias para desarrollar el proyecto y dijo que dará retroalimentación sobre cambios que no le gusten.

## Registro de disponibilidad comprobada en esta sesión
- `codex debug models` mostró `gpt-5.6-luna`, `gpt-6-luna` y `gpt-5.6-terra`, cada uno con nivel de razonamiento `high` disponible en el catálogo local de modelos.
- La exploración inicial se realizó con `gpt-6-luna` High porque el entorno de agentes no ofreció `gpt-5.6-luna` al iniciar la tarea; no se debe afirmar que se usó Luna 5.6.
- La presencia de `gpt-5.6-terra` y el nivel `high` en el catálogo no demuestra cuota restante ni ejecución efectiva. Antes de afirmar una revisión adversarial, confirmar que realmente se lanzó y terminó con Terra 5.6 High.
- Estas instrucciones locales registran el flujo solicitado y los hechos observados; no sustituyen instrucciones globales del usuario ni implican que se haya consultado una cuota.

## Reglas de contenido y privacidad
- No inventar fechas, vuelos, alojamientos, reservas, nombres de viajeros, preferencias ni datos de contacto. Si faltan, mantenerlos como pendientes y pedirlos cuando sean necesarios.
- Fechas compartidas por el viajero: 2–23 de diciembre, llegada a São Paulo el 3; año 2026 provisional. La etapa de trabajo actual cubre 2–13; encuentro con amigos en otra ciudad el 13 o 14, flexible; Río es una opción pendiente de desarrollar. La cantidad de viajeros está pendiente.
- Tratar boletos, documentos, direcciones privadas y datos personales como información sensible. No publicarlos en GitHub Pages ni subirlos al repositorio sin que el usuario decida qué versión quiere compartir.
- Antes de publicar, revisar todo contenido y archivos incluidos en el despliegue; la URL de GitHub Pages puede ser accesible desde cualquier lugar.
- Mantener enlaces de fuentes junto a los datos. Distinguir datos confirmados, propuestas y aspectos por verificar, especialmente horarios, precios, acceso y estado operativo.
- Para lugares con coordenadas aproximadas, avisarlo y enlazar una fuente o mapa para confirmación.

## Arquitectura y publicación
- Usar Next.js con exportación estática compatible con GitHub Pages y GitHub Actions, salvo que el usuario cambie el destino.
- GitHub Pages sirve archivos estáticos; no asumir funciones que requieran un servidor Next.js.
- Para el repositorio de proyecto `mi-itinerario`, configurar las rutas y recursos para su URL bajo `/<nombre-del-repo>/`.
- No publicar ni activar una integración de Sites u otro alojamiento sin una petición explícita que cambie el destino acordado.

## Calidad de la experiencia
- Priorizar una interfaz rápida, adaptable a móvil, con acciones claras y accesibles.
- En las fichas de lugar, organizar nombre, zona/dirección, descripción breve, estado por confirmar, enlace de fuente y mapa/ruta cuando aplique.
- La planificación automática debe presentarse como sugerencia editable, nunca como itinerario confirmado.
- Mantener el contenido principal en archivos estructurados y fáciles de actualizar, separados de la presentación cuando la app esté implementada.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
