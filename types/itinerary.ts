import type { PlaceSchedule } from './place'

export type ItineraryStatus = 'captura-compartida' | 'confirmado-por-viajero' | 'propuesta' | 'condicional' | 'pendiente' | 'tentativo'
export type ItineraryRow = {
  id: string
  date: string
  time: string
  city?: 'sao-paulo' | 'rio'
  status: ItineraryStatus
  placeId?: number
  placeLabel?: string
  activity: string
  transport: string
  lodging: string
  costLabel: string
  budgetId?: string
  budgetTripLeg?: string
  reservation: string
  notes: string
  sourceLabel: string
  sourceUrl?: string
  schedule?: PlaceSchedule
  applyToAgenda?: boolean
  runMode?: 'skip-proposed'
  mapBase?: boolean
}

export type ItineraryRowOverride = Partial<Pick<ItineraryRow, 'transport' | 'lodging' | 'reservation' | 'notes'>>
export type ItineraryOverrides = Record<string, ItineraryRowOverride>
export type ItineraryCoverageState = 'propuesta' | 'condicional' | 'pendiente' | 'historico'
export type ItineraryCoverage = { placeId: number; state: ItineraryCoverageState; note: string }

export type ItineraryData = {
  year: number
  yearIsAssumption: boolean
  rioNightsPreferred: number
  city?: 'sao-paulo' | 'rio'
  columns?: string[]
  rows: ItineraryRow[]
  coverage: ItineraryCoverage[]
  sync?: { source: 'Google Docs · Itinerario web'; syncedAt: string }
  mapBase?: { id: string; name: string; address: string; coordinates: { lat: number; lon: number; confidence: string }; status: string; bookingUrl: string; sourceUrl?: string }
  mapDirections?: { day: number; legs: { from: string; to: string; mode: 'walking' | 'transit' | 'driving'; label: string }[]; note?: string }[]
  optionalStops?: { placeId: number; suggestedDay: number; title: string; reason: string; status: string }[]
  mapLandmarks?: { id: string; day: number; label: string; coordinates: { lat: number; lon: number; confidence: string }; sourceUrl: string; note: string }[]
  mapEndpoints?: Record<string, unknown>
}

export type AgendaApplyResult = {
  dayAssignments: Record<number, number>
  placeSchedule: Record<number, PlaceSchedule>
  added: number[]
  skippedManual: number[]
  skippedConflict: number[]
}
