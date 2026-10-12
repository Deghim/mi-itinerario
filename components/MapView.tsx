'use client'

import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { divIcon } from 'leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import placesFile from '@/docs/data/lugares-sao-paulo.json'
import itineraryFile from '@/docs/data/itinerario.json'
import mapRoutesFile from '@/docs/data/map-routes.json'
import type { ItineraryRow } from '@/types/itinerary'
import type { Place, PlaceSchedule } from '@/types/place'
import type { ItineraryOverrides } from '@/types/itinerary'
import { getMapCatalogPlaces, getMapDirections, getMapRouteNeedsReview, getMapStopRows, getMatchingCachedRoutes, getVisibleMapOptions } from '@/lib/map-itinerary'

const places = placesFile.places as Place[]
const rows = itineraryFile.rows as ItineraryRow[]
const hostel = itineraryFile.mapBase
const routeCache = mapRoutesFile.routes as unknown as CachedRoute[]
const landmarks = itineraryFile.mapLandmarks as MapLandmark[]

type CachedRoute = { day: number; mode: 'foot' | 'car'; label: string; coordinates: [number, number][]; attribution: string; placeIds: number[]; landmarkIds?: string[]; subroute?: boolean }
type MapLandmark = { id: string; day: number; label: string; coordinates: { lat: number; lon: number; confidence: string }; sourceUrl: string; note: string }
type Props = {
  selectedId?: number
  onSelect?: (id: number) => void
  selectedDay: number | null
  onDayChange: (day: number | null) => void
  dayAssignments?: Record<number, number>
  placeSchedule?: Record<number, PlaceSchedule>
  itineraryOverrides?: ItineraryOverrides
  travelYear?: number
}

function numberedIcon(number: string, selected: boolean) {
  return divIcon({ className: `route-number-icon${selected ? ' selected' : ''}`, html: `<span>${number}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] })
}

function baseIcon() {
  return divIcon({ className: 'route-base-icon', html: '<span>H</span>', iconSize: [34, 34], iconAnchor: [17, 17] })
}

function optionIcon() {
  return divIcon({ className: 'route-option-icon', html: '<span>＋</span>', iconSize: [27, 27], iconAnchor: [13, 13] })
}

function catalogIcon(historical: boolean) {
  return divIcon({ className: 'catalog-place-icon', html: `<span class="${historical ? 'historical' : ''}"></span>`, iconSize: [17, 17], iconAnchor: [8, 8] })
}

function FitPoints({ points, day }: { points: [number, number][]; day: number | null }) {
  const map = useMap()
  const signature = points.map(([lat, lon]) => `${lat},${lon}`).join('|')
  useEffect(() => {
    const coordinates = signature ? signature.split('|').map((point) => point.split(',').map(Number) as [number, number]) : []
    if (!coordinates.length) return
    if (coordinates.length === 1) map.setView(coordinates[0], 14, { animate: false })
    else map.fitBounds(coordinates as LatLngBoundsExpression, { padding: [32, 32], maxZoom: day === null ? 12 : 14, animate: false })
  }, [day, map, signature])
  return null
}

export default function MapView({ selectedId, onSelect, selectedDay, onDayChange, dayAssignments = {}, placeSchedule = {}, itineraryOverrides = {}, travelYear = itineraryFile.year }: Props) {
  const [showOptions, setShowOptions] = useState(false)
  const dayRows = useMemo(() => getMapStopRows(rows, selectedDay, dayAssignments, travelYear, itineraryFile.year, placeSchedule), [dayAssignments, placeSchedule, selectedDay, travelYear])
  const stops = useMemo(() => {
    return dayRows.flatMap((row) => {
      if (!row.placeId) return []
      const place = places.find((item) => item.id === row.placeId)
      if (!place) return []
      return [{ place, row }]
    })
  }, [dayRows])
  const options = useMemo(() => getVisibleMapOptions(itineraryFile.optionalStops as { placeId: number; suggestedDay: number; title: string; reason: string; status: string }[], selectedDay, dayRows)
    .map((item) => ({ ...item, place: places.find((place) => place.id === item.placeId) }))
    .filter((item) => item.place), [dayRows, selectedDay])
  const visiblePlaces = getMapCatalogPlaces(places, selectedDay)
  const visibleLandmarks = selectedDay === 8 && travelYear === itineraryFile.year ? landmarks.filter((landmark) => rows.some((row) => row.id === 'park-ibirapuera-day-08') && landmark.day === selectedDay) : []
  const isAllPlaces = selectedDay === null
  const points: [number, number][] = [
    [hostel.coordinates.lat, hostel.coordinates.lon],
    ...(isAllPlaces ? visiblePlaces : selectedDay === 5 ? [] : stops.map(({ place }) => place)).map((place) => [place.coordinates.lat, place.coordinates.lon] as [number, number]),
    ...visibleLandmarks.map((landmark) => [landmark.coordinates.lat, landmark.coordinates.lon] as [number, number]),
    ...(showOptions ? options.flatMap((item) => item.place ? [[item.place.coordinates.lat, item.place.coordinates.lon] as [number, number]] : []) : []),
  ]
  const directionChanged = selectedDay !== null && getMapRouteNeedsReview(rows, itineraryOverrides, dayAssignments, travelYear, itineraryFile.year, selectedDay, placeSchedule)
  const cachedRoutes = directionChanged ? [] : getMatchingCachedRoutes(routeCache, selectedDay, stops.map(({ place }) => place.id), travelYear, itineraryFile.year, visibleLandmarks.map((landmark) => landmark.id))
  const endpoint = (itineraryFile.mapEndpoints as { cantareira: { label: string; mapQuery: string; note: string; trailUrl?: string; coordinates?: { lat: number; lon: number; confidence: string }; sourceUrl?: string; visitationAddress?: string; visitationSourceUrl?: string } }).cantareira
  const mapEndpoints = itineraryFile.mapEndpoints as { cantareira: typeof endpoint; botanicGarden?: { mapQuery?: string }; afroGate?: string; park?: string }
  const routeLinks = !directionChanged && selectedDay !== null
    ? getMapDirections(selectedDay, stops.map(({ place }) => ({ id: place.id, label: place.name })), hostel.name, {
      cantareira: endpoint.mapQuery,
      botanicGarden: mapEndpoints.botanicGarden?.mapQuery ?? `${places.find((place) => place.id === 4)?.name ?? 'Jardim Botânico'}, Avenida Miguel Estéfano 3031, São Paulo, Brasil`,
      afroGate: mapEndpoints.afroGate ?? 'Portão 10, Parque Ibirapuera, São Paulo, Brasil',
      park: mapEndpoints.park ?? 'Parque Ibirapuera, São Paulo, Brasil',
    })
    : []
  const countLabel = selectedDay === null ? `${places.length} puntos del catálogo · sin orden de visita` : selectedDay === 2 ? 'Vuelos; sin ruta local planificada' : selectedDay === 3 ? 'Llegada a GRU; trayecto al hostal por confirmar' : selectedDay === 5 ? 'Cantareira · Uber al Portão 1; caminata interna por confirmar' : selectedDay > 8 ? 'Sin paradas locales confirmadas para esta fecha' : `Día ${selectedDay} · puntos propuestos`
  return <section className="route-map-panel" aria-label="Mapa del itinerario">
    <div className="route-map-toolbar">
      <div><span className="tiny-label">MAPA DE RUTA</span><b>{countLabel}</b><small>El hostal es solo una base propuesta; aún no está reservado.</small></div>
      <label>Ver día<select aria-label="Filtrar mapa por día" value={selectedDay ?? 'all'} onChange={(event) => onDayChange(event.target.value === 'all' ? null : Number(event.target.value))}>
        <option value="all">Todos los lugares</option>
        {Array.from({ length: 13 }, (_, index) => index + 2).map((day) => <option key={day} value={day}>{day} dic</option>)}
      </select></label>
    </div>
    {selectedDay === 2 && <p className="map-route-note">El 2 dic es día de vuelos. Este mapa no representa esos tramos aéreos.</p>}
    {selectedDay === 3 && <p className="map-route-note">La llegada compartida es a GRU a las 09:10. Este mapa solo muestra el paseo local propuesto; el traslado al hostal y cualquier conexión de metro requieren confirmación.</p>}
    {selectedDay !== null && selectedDay > 8 && <p className="map-route-note">El hostal de São Paulo permanece como referencia; no hay un recorrido local confirmado para esta fecha.</p>}
    {selectedDay === 4 && <p className="map-route-note">El tramo vial dibujado cubre Museu da Imigração → Vila Maria Zélia. Las conexiones desde el hostal y hacia el MASP se enlazan como transporte público; no se representan como calles.</p>}
    {selectedDay === 5 && <p className="map-route-note">El operador indica Portão 1, Rua do Horto 931, para llegar en vehículo; la ficha estatal publica Rua do Horto 1799 como dirección de visita. Confirma cuál acceso corresponde a tu boleto. Desde Portão 1 continúa a pie hacia Portão 5; la ruta interna de la trilha no está trazada aquí. <a href={endpoint.trailUrl ?? 'https://guiadeareasprotegidas.sp.gov.br/trilha/trilha-da-pedra-grande/'} target="_blank" rel="noreferrer">Ver información oficial de la trilha ↗</a> · <a href={endpoint.visitationSourceUrl} target="_blank" rel="noreferrer">Ficha estatal del parque ↗</a></p>}
    {selectedDay === 8 && <p className="map-route-note">Para el Museu Afro Brasil, el enlace vial termina en el Portão 10; desde ahí continúa a pie. No dibujamos una ruta de auto hasta el museo porque no tenemos un punto vial exacto para el pabellón.</p>}
    {directionChanged && <p className="map-route-note">Cambiaste la hora, el día o el transporte de una parada. El recorrido está pendiente de revisar; los pines siguen disponibles para abrir cada lugar en Maps.</p>}
    {selectedDay !== null && <label className="map-options-toggle"><input type="checkbox" checked={showOptions} onChange={(event) => setShowOptions(event.target.checked)} />Mostrar opciones de este día sin incluirlas en la ruta base</label>}
    <div className="map-frame" aria-label="Mapa interactivo de São Paulo">
      <MapContainer center={[-23.559, -46.646]} zoom={12} scrollWheelZoom className="trip-map">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitPoints points={[...points, ...(selectedDay === 5 && endpoint.coordinates ? [[endpoint.coordinates.lat, endpoint.coordinates.lon] as [number, number]] : [])]} day={selectedDay} />
        {cachedRoutes.map((route) => <Polyline key={`${route.day}-${route.mode}-${route.label}`} positions={route.coordinates} pathOptions={{ color: route.mode === 'foot' ? '#236c55' : '#bd7747', weight: 4, opacity: 0.78, dashArray: route.mode === 'car' ? '9 6' : undefined }}><Popup>{route.label}<br />Trazado vial de referencia calculado desde coordenadas aproximadas; confirma la ruta antes de salir.<br />{route.attribution}</Popup></Polyline>)}
        <Marker position={[hostel.coordinates.lat, hostel.coordinates.lon]} icon={baseIcon()}><Popup><strong>{hostel.name}</strong><br />{hostel.address}<br />No reservado · <a href={hostel.bookingUrl} target="_blank" rel="noreferrer">ver sitio de reservas ↗</a></Popup></Marker>
        {isAllPlaces && visiblePlaces.map((place) => <Marker key={`catalog-${place.id}`} position={[place.coordinates.lat, place.coordinates.lon]} icon={catalogIcon(place.statusFromDraft === 'marcado-cerrado-o-historico')} eventHandlers={{ click: () => onSelect?.(place.id) }}><Popup><strong>{place.name}</strong><br />{place.zone} · referencia de catálogo<br />{place.statusFromDraft === 'marcado-cerrado-o-historico' ? 'El borrador lo marca histórico o cerrado; estado actual sin verificar.' : 'El borrador lo marca visitable; estado actual sin verificar.'}<br />{place.coordinates.confidence.startsWith('aproximada') ? 'Coordenada aproximada; confirma la ubicación.' : 'Ubicación por confirmar.'}<br /><a href={place.sourceUrl ?? place.atlasUrl} target="_blank" rel="noreferrer">{place.sourceLabel ?? 'Atlas Obscura'} ↗</a><br /><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, ${place.addressFromDraft}, São Paulo, Brasil}`)}`} target="_blank" rel="noreferrer">Confirmar en Maps ↗</a></Popup></Marker>)}
        {!isAllPlaces && stops.map(({ place, row }, index) => {
          const gate = selectedDay === 5 && place.id === 33 ? endpoint : null
          const position = gate?.coordinates ?? place.coordinates
          const title = gate?.label ?? place.name
          const address = gate ? 'Rua do Horto, 931 · punto aproximado' : place.addressFromDraft
          return <Marker key={`${row.id}-${place.id}`} position={[position.lat, position.lon]} icon={numberedIcon(String(index + 1), selectedId === place.id)} eventHandlers={{ click: () => onSelect?.(place.id) }}><Popup><strong>{index + 1}. {title}</strong><br />{row.time || 'Hora por definir'} · {row.status === 'propuesta' ? 'Propuesta' : row.status === 'condicional' ? 'Condicional' : 'Por confirmar'}<br />{address}<br />{gate ? 'Dirección indicada por el operador; punto de mapa aproximado. Continúa a pie hacia Portão 5.' : place.coordinates.confidence === 'aproximada-fuente-atlas' || place.coordinates.confidence === 'aproximada-fuente-oficial' ? 'Coordenada aproximada; confirma la dirección.' : 'Ubicación por confirmar.'}<br />{gate?.sourceUrl && <><a href={gate.sourceUrl} target="_blank" rel="noreferrer">Operador del parque ↗</a><br /></>}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gate?.mapQuery ?? `${place.name}, ${place.addressFromDraft}, São Paulo, Brasil}`)}`} target="_blank" rel="noreferrer">Confirmar en Maps ↗</a></Popup></Marker>
        })}
        {visibleLandmarks.map((landmark, index) => <Marker key={landmark.id} position={[landmark.coordinates.lat, landmark.coordinates.lon]} icon={numberedIcon(String(stops.length + index + 1), false)}><Popup><strong>{stops.length + index + 1}. {landmark.label}</strong><br />Parada propuesta · acceso por confirmar.<br />{landmark.note}<br /><a href={landmark.sourceUrl} target="_blank" rel="noreferrer">Fuente pública ↗</a></Popup></Marker>)}
        {showOptions && !isAllPlaces && options.map((item) => item.place && <Marker key={`option-${item.placeId}`} position={[item.place.coordinates.lat, item.place.coordinates.lon]} icon={optionIcon()} eventHandlers={{ click: () => onSelect?.(item.placeId) }}><Popup><strong>Opción · {item.title}</strong><br />{item.reason}<br /><a href={item.place.atlasUrl} target="_blank" rel="noreferrer">{item.place.sourceLabel ?? 'Fuente'} ↗</a></Popup></Marker>)}
      </MapContainer>
    </div>
    <div className="map-legend route-map-legend"><span><i className="legend-base">H</i> Hostal base · pendiente</span>{isAllPlaces ? <span><i className="legend-catalog" /> Referencias del catálogo · sin orden de visita</span> : <><span><i className="legend-number">1</i> Paradas propuestas en orden</span><span><i className="legend-option">＋</i> Opciones excluidas de la ruta base</span>{cachedRoutes.some((route) => route.mode === 'foot') && <span><i className="legend-route-foot" /> Calle a pie</span>}{cachedRoutes.some((route) => route.mode === 'car') && <span><i className="legend-route-car" /> Trayecto vial (Uber/auto)</span>}</>}</div>
    {selectedDay !== null && selectedDay >= 3 && selectedDay <= 8 && routeLinks.length > 0 && <div className="map-route-links"><b>{selectedDay === 5 ? 'Llegar al acceso del parque' : 'Indicaciones por tramo'}</b><small>Google Maps puede cambiar el recorrido y los tiempos. Los enlaces por tramos respetan el límite móvil de 3 paradas intermedias.</small><div>{routeLinks.map((segment, index) => <a key={`${segment.title}-${segment.mode}-${index}`} href={segment.url} target="_blank" rel="noreferrer">{segment.title} ↗</a>)}</div></div>}
    {selectedDay !== null && selectedDay >= 3 && selectedDay <= 8 && stops.length > 0 && cachedRoutes.length === 0 && !directionChanged && <p className="map-route-note">Trayecto por confirmar: el mapa muestra los puntos, pero no hay una línea de calles que corresponda exactamente a la selección actual.</p>}
    {selectedDay === 5 && <p className="map-route-note">Ubicación del Portão 1 por confirmar en este mapa. Usa el enlace a Maps para navegar hasta Rua do Horto 931; desde el acceso sigue las indicaciones oficiales hacia Portão 5.</p>}
    <p className="map-data-note">OpenStreetMap · © colaboradores. Algunas coordenadas de referencia son aproximadas; la línea vial solo se muestra cuando hay geometría precalculada disponible.</p>
  </section>
}
