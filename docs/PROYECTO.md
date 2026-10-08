# Proyecto: mi-itinerario

## Alcance

Este repositorio será la guía de viaje personal del usuario. La primera versión será una app Next.js en español, pensada para móvil y computadora, con salida estática para GitHub Pages. Reunirá el itinerario y sus materiales asociados: lugares, enlaces, vuelos, boletos, reservas, mapas y notas prácticas que el usuario decida agregar.

El HTML existente de São Paulo sirve como referencia inicial de interfaz y contenido. El Google Doc existente seguirá siendo un documento de trabajo para el itinerario y se coordinará con la información del repositorio.

## Fuentes iniciales

- Borrador de mapa: archivo de referencia local usado para preparar la primera versión; permanece fuera del repositorio y no se publica.
- Google Doc: [Itinerario de viaje](https://docs.google.com/document/d/10JU5qUXjo-tAuudNIkiYDP7uIBwIQqixE3La01J09BM/edit?tab=t.0). Enlace compartido por el usuario; acceso según los permisos configurados en Google. Su contenido no fue accesible desde la herramienta de lectura web durante la exploración inicial.
- Atlas Obscura: [Lugares de São Paulo](https://www.atlasobscura.com/things-to-do/sao-paulo-brazil/places?page=1). Enlace compartido por el usuario; su contenido no fue accesible desde la herramienta de lectura web durante la exploración inicial.
- Documentación Next.js: [Static Exports](https://nextjs.org/docs/pages/guides/static-exports). Un export estático genera HTML/CSS/JS en `out`; funciones que requieren servidor no están disponibles.
- Referencia de despliegue: [Template oficial Next.js para GitHub Pages](https://github.com/nextjs/deploy-github-pages) y [GitHub Pages con Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Referencia visual y funcional actual

El borrador tiene una paleta clara verde y crema, diseño de dos paneles con lista lateral y mapa, y adaptación a móvil. Muestra 36 sitios Atlas Obscura de São Paulo, búsqueda y filtros por zona/estado, red ferroviaria aproximada, fichas con rutas a Google Maps y un agrupador geográfico que propone distribuir los sitios visitables por número de días. El propio HTML avisa que ciertas ubicaciones son aproximadas y que se deben confirmar horarios y operación.

## Privacidad y publicación

GitHub Pages será accesible desde cualquier lugar. El itinerario público puede contener lugares y enlaces de utilidad, pero documentos de identidad, boletos con códigos, datos de contacto, localizadores de reserva y direcciones privadas requieren tratamiento aparte. Antes de desplegar, revisar qué información se hará pública y conservar en el sitio solo lo que el usuario quiera compartir.

## Datos de viaje recibidos (año provisional)

- Viaje total: 2–23 de diciembre de 2026; el año es un supuesto editable que falta confirmar.
- Llegada a São Paulo: 3 de diciembre.
- Etapa activa: organizar São Paulo del 2 al 13 de diciembre; días 4–12 siguen abiertos.
- Encuentro con amigos: otra ciudad, el 13 o 14 de diciembre, flexible.
- Río de Janeiro: opción por desarrollar; sin fechas confirmadas.
- Cantidad de personas: no confirmada.
- Itinerario y enlaces públicos pueden publicarse. Boletos con códigos, reservas privadas y archivos personales no se añaden al repositorio ni al sitio público.

## Preguntas abiertas

- Confirmar el año del viaje.
- Número de viajeros y ciudad del encuentro con amigos.
- Qué enlaces de vuelos/alojamiento se quieren publicar (nunca códigos ni documentos personales).
- Preferencias de viaje: ritmo diario, presupuesto, intereses, movilidad, restricciones y alojamientos confirmados.
- Si el Google Doc debe editarse directamente por el asistente o si el usuario prefiere recibir contenido listo para pegar.
- Confirmar si el usuario quiere preservar el mapa actual como primera pantalla o convertir el sitio en un panel más amplio para todo el viaje.

## Estado inicial del repositorio

No hay aplicación creada ni publicación hecha. El repositorio tiene solo un README de una línea y su remoto `origin` apunta a `https://github.com/Deghim/mi-itinerario.git`. La implementación y el despliegue quedan para pasos posteriores.
