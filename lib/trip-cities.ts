import saoPauloPlaces from '../docs/data/lugares-sao-paulo.json' with { type: 'json' }
import rioPlaces from '../docs/data/lugares-rio.json' with { type: 'json' }
import saoPauloItinerary from '../docs/data/itinerario.json' with { type: 'json' }
import rioItinerary from '../docs/data/itinerario-rio.json' with { type: 'json' }
import saoPauloTrip from '../docs/data/viaje.json' with { type: 'json' }
import saoPauloRoutes from '../docs/data/map-routes.json' with { type: 'json' }
import rioRoutes from '../docs/data/map-routes-rio.json' with { type: 'json' }
import type { ItineraryData } from '../types/itinerary'
import type { CityId, Place } from '../types/place'

export type TripCityConfig = {
  id: CityId
  label: string
  stage: string
  places: Place[]
  itinerary: ItineraryData
  tripFile: typeof saoPauloTrip | { travelYear: number; proposedPlan: { pacePreference: string } }
  mapRoutes: { routes: unknown[] }
  storageKey: string
  itineraryOverridesKey: string
  startDay: number
  endDay: number
}

export const tripCities: Record<CityId, TripCityConfig> = {
  'sao-paulo': {
    id: 'sao-paulo',
    label: 'São Paulo',
    stage: 'Etapa 1',
    places: saoPauloPlaces.places as Place[],
    itinerary: saoPauloItinerary as ItineraryData,
    tripFile: saoPauloTrip,
    mapRoutes: saoPauloRoutes as { routes: unknown[] },
    storageKey: 'mi-itinerario:sao-paulo:v1',
    itineraryOverridesKey: 'mi-itinerario:itinerary:v1',
    startDay: 2,
    endDay: 8,
  },
  rio: {
    id: 'rio',
    label: 'Río de Janeiro',
    stage: 'Etapa 2',
    places: rioPlaces.places as Place[],
    itinerary: rioItinerary as ItineraryData,
    tripFile: { travelYear: 2026, proposedPlan: { pacePreference: 'Ritmo flexible: alternar días intensos y ligeros.' } },
    mapRoutes: rioRoutes as { routes: unknown[] },
    storageKey: 'mi-itinerario:rio-de-janeiro:v1',
    itineraryOverridesKey: 'mi-itinerario:itinerary:rio-de-janeiro:v1',
    startDay: 9,
    endDay: 14,
  },
}
