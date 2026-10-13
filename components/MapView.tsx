'use client'

import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { divIcon } from 'leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import type { ItineraryData, ItineraryOverrides } from '@/types/itinerary'
import type { CityId, Place, PlaceSchedule } from '@/types/place'
import { getConfiguredMapDirections, getMapCatalogPlaces, getMapDirections, getMapRouteNeedsReview, getMapStopRows, getMatchingCachedRoutes, getVisibleMapOptions } from '@/lib/map-itinerary'

type CachedRoute = { day: number; mode: 'foot' | 'car'; label: string; coordinates: [number, number][]; attribution: string; placeIds: number[]; landmarkIds?: string[]; subroute?: boolean }
type Props = {
  city: CityId
  cityLabel: string
  places: Place[]
  itinerary: ItineraryData
  routeData: { routes: unknown[] }
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

export default function MapView({ city, cityLabel, places, itinerary: itineraryFile, routeData, selectedId, onSelect, selectedDay, onDayChange, dayAssignments = {}, placeSchedule = {}, itineraryOverrides = {}, travelYear = itineraryFile.year }: Props) {
  const [showOptions, setShowOptions] = useState(false)
  const rows = itineraryFile.rows
  const hostel = itineraryFile.mapBase
  const routeCache = routeData.routes as CachedRoute[]
  const landmarks = itineraryFile.mapLandmarks ?? []
  const mapEndpoints = (itineraryFile.mapEndpoints ?? {}) as { cantareira?: { label: string; mapQuery: string; note: string; trailUrl?: string; coordinates?: { lat: number; lon: number; confidence: string }; sourceUrl?: string; visitationAddress?: string; visitationSourceUrl?: string }; botanicGarden?: { mapQuery?: string }; afroGate?: string; park?: string }
  const dayRows = useMemo(() => getMapStopRows(rows, selectedDay, dayAssignments, travelYear, itineraryFile.year, placeSchedule), [dayAssignments, itineraryFile.year, placeSchedule, rows, selectedDay, travelYear])
  const stops = useMemo(() => {
    return dayRows.flatMap((row) => {
      if (!row.placeId) return []
      const place = places.find((item) => item.id === row.placeId)
      if (!place) return []
      return [{ place, row }]
    })
  }, [dayRows, places])
  const options = useMemo(() => getVisibleMapOptions(itineraryFile.optionalStops ?? [], selectedDay, dayRows)
    .map((item) => ({ ...item, place: places.find((place) => place.id === item.placeId) }))
    .filter((item) => item.place), [dayRows, itineraryFile.optionalStops, places, selectedDay])
  const visiblePlaces = getMapCatalogPlaces(places, selectedDay)
  const visibleLandmarks = selectedDay !== null && travelYear === itineraryFile.year ? landmarks.filter((landmark) => landmark.day === selectedDay) : []
  const isAllPlaces = selectedDay === null
  const points: [number, number][] = [
    ...(hostel ? [[hostel.coordinates.lat, hostel.coordinates.lon] as [number, number]] : []),
    ...(isAllPlaces ? visiblePlaces : selectedDay === 5 ? [] : stops.map(({ place }) => place)).map((place) => [place.coordinates.lat, place.coordinates.lon] as [number, number]),
    ...visibleLandmarks.map((landmark) => [landmark.coordinates.lat, landmark.coordinates.lon] as [number, number]),
    ...(showOptions ? options.flatMap((item) => item.place ? [[item.place.coordinates.lat, item.place.coordinates.lon] as [number, number]] : []) : []),
  ]
  const directionChanged = selectedDay !== null && getMapRouteNeedsReview(rows, itineraryOverrides, dayAssignments, travelYear, itineraryFile.year, selectedDay, placeSchedule)
  const cachedRoutes = directionChanged ? [] : getMatchingCachedRoutes(routeCache, selectedDay, stops.map(({ place }) => place.id), travelYear, itineraryFile.year, visibleLandmarks.map((landmark) => landmark.id))
  const endpoint = mapEndpoints.cantareira
  const spRouteLinks = !directionChanged && selectedDay !== null && city === 'sao-paulo'
    ? getMapDirections(selectedDay, stops.map(({ place }) => ({ id: place.id, label: place.name })), hostel?.name ?? 'Hostel Vergueiro', {
      cantareira: endpoint?.mapQuery ?? 'Portão 1, Rua do Horto 931, São Paulo, Brasil',
      botanicGarden: mapEndpoints.botanicGarden?.mapQuery ?? `${places.find((place) => place.id === 4)?.name ?? 'Jardim Botânico'}, Avenida Miguel Estéfano 3031, São Paulo, Brasil`,
      afroGate: mapEndpoints.afroGate ?? 'Portão 10, Parque Ibirapuera, São Paulo, Brasil',
      park: mapEndpoints.park ?? 'Parque Ibirapuera, São Paulo, Brasil',
    })
    : []
  const configuredLinks = !directionChanged && city === 'rio' ? getConfiguredMapDirections(itineraryFile.mapDirections ?? [], selectedDay) : []
  const routeLinks = [...spRouteLinks, ...configuredLinks]
  const countLabel = selectedDay === null ? `${places.length} referencias del catálogo · sin orden de visita` : stops.length === 0 ? `Día ${selectedDay} · sin paradas locales con mapa` : `${cityLabel} · ${stops.length} paradas propuestas`
  const dateDays = [...new Set(rows.map((row) => Number(row.date.slice(8, 10))))].sort((a, b) => a - b)
  const fallbackCenter: [number, number] = places.length
    ? [places[0].coordinates.lat, places[0].coordinates.lon]
    : city === 'rio' ? [-22.9068, -43.1729] : [-23.5505, -46.6333]
  return <section className="route-map-panel" aria-label="Mapa del itinerario">
    <div className="route-map-toolbar">
      <div><span className="tiny-label">MAPA DE RUTA</span><b>{countLabel}</b><small>{hostel ? 'El hostal es solo una base propuesta; aún no está reservado.' : `La base de hospedaje de ${cityLabel} sigue pendiente de definir.`}</small></div>
      <label>Ver día<select aria-label="Filtrar mapa por día" value={selectedDay ?? 'all'} onChange={(event) => onDayChange(event.target.value === 'all' ? null : Number(event.target.value))}>
        <option value="all">Todos los lugares</option>
        {dateDays.map((day) => <option key={day} value={day}>{day} dic</option>)}
      </select></label>
    </div>
    {selectedDay === 2 && <p className="map-route-note">El 2 dic es día de vuelos. Este mapa no representa esos tramos aéreos.</p>}
    {city === 'sao-paulo' && selectedDay === 3 && <p className="map-route-note">La llegada a GRU está indicada para las 09:10. El traslado al hostal requiere margen y confirmación; el mapa no dibuja ese tramo aéreo o terrestre.</p>}
    {city === 'sao-paulo' && selectedDay !== null && selectedDay > 8 && <p className="map-route-note">El hostal de São Paulo queda como referencia; no hay un recorrido local planificado en esta etapa.</p>}
    {selectedDay === 4 && <p className="map-route-note">El tramo vial dibujado cubre Museu da Imigração → Vila Maria Zélia. Las conexiones desde el hostal y hacia el MASP se enlazan como transporte público; no se representan como calles.</p>}
    {city === 'sao-paulo' && selectedDay === 5 && <p className="map-route-note">El operador indica Rua do Horto 931, Portão 1, para llegar en vehículo; desde ahí continúa a pie hacia Portão 5. La ruta interna de la trilha no está trazada aquí. <a href={endpoint?.trailUrl ?? 'https://guiadeareasprotegidas.sp.gov.br/trilha/trilha-da-pedra-grande/'} target="_blank" rel="noreferrer">Ver información oficial de la trilha ↗</a> · {endpoint?.visitationSourceUrl && <a href={endpoint.visitationSourceUrl} target="_blank" rel="noreferrer">Ficha estatal del parque ↗</a>}</p>}
    {city === 'sao-paulo' && selectedDay === 8 && <p className="map-route-note">Para el Museu Afro Brasil, el enlace vial termina en el Portão 10; desde ahí continúa a pie. No dibujamos una ruta de auto hasta el pabellón.</p>}
    {city === 'rio' && selectedDay !== null && selectedDay !== 14 && <p className="map-route-note">Los tramos viales disponibles muestran geometrías de calles; los trayectos de transporte público, barco y accesos interiores se abren como indicaciones externas. Verifica horarios y accesos antes de salir.</p>}
    {city === 'rio' && selectedDay === 9 && <p className="map-route-note">Pago de conexiones (revisar de nuevo antes de diciembre): el VLT usa Jaé; el Jaézinho físico se compra en máquinas de BRT/VLT con depósito de R$5. En MetrôRio, una persona visitante puede comprar el bilhete unitário en estación o usar contactless Visa, Mastercard o Elo; el operador publica Jaé en todas sus estaciones. No asumir una tarjeta universal ni extenderlo a SuperVia. <a href="https://jae.com.br/faq/cartao-jae-4/" target="_blank" rel="noreferrer">FAQ Jaé ↗</a> · <a href="https://www.metrorio.com.br/como-pagar/meios-e-tarifas" target="_blank" rel="noreferrer">MetrôRio · medios de pago ↗</a></p>}
    {city === 'rio' && selectedDay === 13 && <p className="map-route-note">Horto: el parque describe aproximaciones por Rua Pacheco Leão o Estrada Dona Castorina, sin fijar aquí una entrada ni estacionamiento exactos. La línea termina en Rua Pacheco Leão 915 solo como referencia urbana geocodificada; no valida el acceso al sendero. Confirma el punto con el parque antes de ir y retírate si no se valida. <a href="https://parquenacionaldatijuca.rio/locais/cachoeiras-do-horto/" target="_blank" rel="noreferrer">Cómo llegar · Parque Nacional da Tijuca ↗</a></p>}
    {directionChanged && <p className="map-route-note">Cambiaste la hora, el día o el transporte de una parada. El recorrido está pendiente de revisar; los pines siguen disponibles para abrir cada lugar en Maps.</p>}
    {selectedDay !== null && <label className="map-options-toggle"><input type="checkbox" checked={showOptions} onChange={(event) => setShowOptions(event.target.checked)} />Mostrar opciones de este día sin incluirlas en la ruta base</label>}
    <div className="map-frame" aria-label={`Mapa interactivo de ${cityLabel}`}>
      <MapContainer key={city} center={hostel ? [hostel.coordinates.lat, hostel.coordinates.lon] : fallbackCenter} zoom={12} scrollWheelZoom className="trip-map">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitPoints points={[...points, ...(city === 'sao-paulo' && selectedDay === 5 && endpoint?.coordinates ? [[endpoint.coordinates.lat, endpoint.coordinates.lon] as [number, number]] : [])]} day={selectedDay} />
        {cachedRoutes.map((route) => <Polyline key={`${route.day}-${route.mode}-${route.label}`} positions={route.coordinates} pathOptions={{ color: route.mode === 'foot' ? '#236c55' : '#bd7747', weight: 4, opacity: 0.78, dashArray: route.mode === 'car' ? '9 6' : undefined }}><Popup>{route.label}<br />Trazado vial de referencia calculado desde coordenadas aproximadas; confirma la ruta antes de salir.<br />{route.attribution}</Popup></Polyline>)}
        {hostel && <Marker position={[hostel.coordinates.lat, hostel.coordinates.lon]} icon={baseIcon()}><Popup><strong>{hostel.name}</strong><br />{hostel.address}<br />No reservado · <a href={hostel.bookingUrl} target="_blank" rel="noreferrer">ver sitio de reservas ↗</a></Popup></Marker>}
        {isAllPlaces && visiblePlaces.map((place) => <Marker key={`catalog-${city}-${place.id}`} position={[place.coordinates.lat, place.coordinates.lon]} icon={catalogIcon(place.statusFromDraft === 'marcado-cerrado-o-historico')} eventHandlers={{ click: () => onSelect?.(place.id) }}><Popup><strong>{place.name}</strong><br />{place.zone} · referencia de catálogo<br />{place.statusFromDraft === 'marcado-cerrado-o-historico' ? 'El borrador lo marca histórico o cerrado; estado actual sin verificar.' : 'El borrador lo marca visitable; estado actual sin verificar.'}<br />{place.coordinates.confidence.startsWith('aproximada') ? 'Coordenada aproximada; confirma la ubicación.' : 'Ubicación por confirmar.'}<br /><a href={place.sourceUrl ?? place.atlasUrl} target="_blank" rel="noreferrer">{place.sourceLabel ?? 'Atlas Obscura'} ↗</a><br /><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, ${place.addressFromDraft}, ${cityLabel}, Brasil`)}`} target="_blank" rel="noreferrer">Confirmar en Maps ↗</a></Popup></Marker>)}
        {!isAllPlaces && stops.map(({ place, row }, index) => {
          const gate = city === 'sao-paulo' && selectedDay === 5 && place.id === 33 ? endpoint : null
          const position = gate?.coordinates ?? place.coordinates
          const title = gate?.label ?? place.name
          const address = gate ? 'Rua do Horto, 931 · punto indicado por el operador' : place.addressFromDraft
          return <Marker key={`${row.id}-${place.id}`} position={[position.lat, position.lon]} icon={numberedIcon(String(index + 1), selectedId === place.id)} eventHandlers={{ click: () => onSelect?.(place.id) }}><Popup><strong>{index + 1}. {title}</strong><br />{row.time || 'Hora por definir'} · {row.status === 'propuesta' ? 'Propuesta' : row.status === 'condicional' ? 'Condicional' : 'Por confirmar'}<br />{address}<br />{gate ? 'Punto de referencia para el acceso; confirma ubicación. Continúa a pie hacia Portão 5.' : place.coordinates.confidence === 'aproximada-fuente-atlas' || place.coordinates.confidence === 'aproximada-fuente-oficial' ? 'Coordenada aproximada; confirma la dirección.' : 'Ubicación por confirmar.'}<br />{gate?.sourceUrl && <><a href={gate.sourceUrl} target="_blank" rel="noreferrer">Operador del parque ↗</a><br /></>}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gate?.mapQuery ?? `${place.name}, ${place.addressFromDraft}, ${cityLabel}, Brasil}`)}`} target="_blank" rel="noreferrer">Confirmar en Maps ↗</a></Popup></Marker>
        })}
        {visibleLandmarks.map((landmark, index) => <Marker key={landmark.id} position={[landmark.coordinates.lat, landmark.coordinates.lon]} icon={numberedIcon(String(stops.length + index + 1), false)}><Popup><strong>{stops.length + index + 1}. {landmark.label}</strong><br />Parada propuesta · acceso por confirmar.<br />{landmark.note}<br /><a href={landmark.sourceUrl} target="_blank" rel="noreferrer">Fuente pública ↗</a></Popup></Marker>)}
        {showOptions && !isAllPlaces && options.map((item) => item.place && <Marker key={`option-${item.placeId}`} position={[item.place.coordinates.lat, item.place.coordinates.lon]} icon={optionIcon()} eventHandlers={{ click: () => onSelect?.(item.placeId) }}><Popup><strong>Opción · {item.title}</strong><br />{item.reason}<br /><a href={item.place.atlasUrl} target="_blank" rel="noreferrer">{item.place.sourceLabel ?? 'Fuente'} ↗</a></Popup></Marker>)}
      </MapContainer>
    </div>
    <div className="map-legend route-map-legend">{hostel && <span><i className="legend-base">H</i> Hostal base · pendiente</span>}{isAllPlaces ? <span><i className="legend-catalog" /> Referencias del catálogo · sin orden de visita</span> : <><span><i className="legend-number">1</i> Paradas propuestas en orden</span><span><i className="legend-option">＋</i> Opciones excluidas de la ruta base</span>{cachedRoutes.some((route) => route.mode === 'foot') && <span><i className="legend-route-foot" /> Calle a pie</span>}{cachedRoutes.some((route) => route.mode === 'car') && <span><i className="legend-route-car" /> Trayecto vial (Uber/auto)</span>}</>}</div>
    {selectedDay !== null && routeLinks.length > 0 && <div className="map-route-links"><b>{city === 'sao-paulo' && selectedDay === 5 ? 'Llegar al acceso del parque' : 'Indicaciones por tramo'}</b><small>Los enlaces abren Google Maps con el modo indicado. Confirma recorrido y tiempos antes de salir.</small><div>{routeLinks.map((segment, index) => <a key={`${segment.title}-${segment.mode}-${index}`} href={segment.url} target="_blank" rel="noreferrer">{segment.title} ↗</a>)}</div></div>}
    {selectedDay !== null && stops.length > 0 && cachedRoutes.length === 0 && !directionChanged && <p className="map-route-note">{city === 'rio' ? 'No hay una línea de calles cacheada para esta selección; conserva los pines y usa los enlaces por tramo.' : 'Trayecto por confirmar: el mapa muestra los puntos, pero no hay una línea de calles que corresponda exactamente a la selección actual.'}</p>}
    {city === 'sao-paulo' && selectedDay === 5 && <p className="map-route-note">Usa el enlace del operador para llegar a Rua do Horto 931, Portão 1; desde ahí continúa a pie hacia Portão 5.</p>}
    <p className="map-data-note">OpenStreetMap · © colaboradores. Algunas coordenadas de referencia son aproximadas; la línea vial solo se muestra cuando hay geometría precalculada disponible.</p>
  </section>
}
