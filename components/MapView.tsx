'use client'

import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import type { Place } from '@/types/place'

const lineColors = ['#1676a5', '#27834b', '#d94441', '#c79a25', '#87549a', '#278a83']
const railLines: [string, [number, number][]][] = [
  ['Línea 1 · Azul', [[-23.48, -46.604], [-23.516, -46.625], [-23.55, -46.634], [-23.589, -46.638], [-23.626, -46.639], [-23.646, -46.641]]],
  ['Línea 2 · Verde', [[-23.547, -46.691], [-23.558, -46.66], [-23.563, -46.657], [-23.575, -46.64], [-23.592, -46.63], [-23.603, -46.6]]],
  ['Línea 3 · Roja', [[-23.525, -46.667], [-23.54, -46.645], [-23.548, -46.638], [-23.55, -46.626], [-23.546, -46.594], [-23.535, -46.535]]],
  ['Línea 4 · Amarilla', [[-23.536, -46.635], [-23.551, -46.654], [-23.563, -46.667], [-23.57, -46.701], [-23.586, -46.716]]],
  ['Línea 5 · Lila', [[-23.667, -46.77], [-23.64, -46.735], [-23.626, -46.688], [-23.607, -46.655], [-23.592, -46.63]]],
]

function FitPlaces({ places }: { places: Place[] }) {
  const map = useMap()
  const bounds = useMemo<LatLngBoundsExpression | null>(() => places.length
    ? places.map((place) => [place.coordinates.lat, place.coordinates.lon]) as LatLngBoundsExpression
    : null, [places])
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 })
  }, [bounds, map])
  return null
}

export default function MapView({ places, selectedId, onSelect }: {
  places: Place[]
  selectedId?: number
  onSelect?: (id: number) => void
}) {
  return (
    <div className="map-frame" aria-label="Mapa de los lugares de São Paulo">
      <MapContainer center={[-23.559, -46.646]} zoom={12} scrollWheelZoom className="trip-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitPlaces places={places} />
        {railLines.map(([name, positions], index) => (
          <Polyline key={name} positions={positions} pathOptions={{ color: lineColors[index], weight: 4, opacity: 0.68 }}>
            <Popup>{name} · trazo de referencia</Popup>
          </Polyline>
        ))}
        {places.map((place) => (
          <CircleMarker
            key={place.id}
            center={[place.coordinates.lat, place.coordinates.lon]}
            radius={selectedId === place.id ? 10 : 7}
            pathOptions={{ color: '#fffdf8', weight: 2, fillColor: place.statusFromDraft === 'marcado-cerrado-o-historico' ? '#b55545' : '#236c55', fillOpacity: 1 }}
            eventHandlers={{ click: () => onSelect?.(place.id) }}
          >
            <Popup>
              <strong>{place.name}</strong><br />
              {place.zone}<br />
              <span>Coordenada aproximada del borrador; confirmar antes de ir.</span>
              <br /><a href={place.atlasUrl} target="_blank" rel="noreferrer">Abrir ficha Atlas ↗</a>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="map-disclaimer">Ubicaciones y trazos de transporte aproximados · verifica la dirección antes de salir.</div>
    </div>
  )
}
