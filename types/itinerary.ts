import type { PlaceSchedule } from './place'

export type ItineraryStatus = 'captura-compartida' | 'confirmado-por-viajero' | 'propuesta' | 'condicional' | 'pendiente' | 'tentativo'
export type ItineraryColumn = 'Fecha' | 'Hora' | 'Lugar' | 'Actividad' | 'Transporte' | 'Costo' | 'Reserva/boleto' | 'Notas'
export type ItineraryCellLinks = Partial<Record<ItineraryColumn, string[]>>
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
  cellLinks?: ItineraryCellLinks
  schedule?: PlaceSchedule
  applyToAgenda?: boolean
  runMode?: 'skip-proposed'
  mapBase?: boolean
  origin?: 'docs' | 'web-local'
  docRowIndex?: number
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
  sync?: { source: 'Google Docs'; syncedAt: string; snapshotHash: string; mode: 'manual'; sourceUrl: string }
  mapBase?: { id: string; name: string; address: string; coordinates: { lat: number; lon: number; confidence: string }; status: string; bookingUrl: string; sourceUrl?: string }
  mapDirections?: { day: number; legs: { from: string; to: string; mode: 'walking' | 'transit' | 'driving'; label: string }[]; note?: string }[]
  optionalStops?: { placeId: number; suggestedDay: number; title: string; reason: string; status: string }[]
  mapLandmarks?: { id: string; day: number; label: string; coordinates: { lat: number; lon: number; confidence: string }; sourceUrl: string; note: string }[]
  mapEndpoints?: Record<string, unknown>
  optionalRows?: ItineraryRow[]
  docNotes?: DocSourceNote[]
  optionalItems?: OptionalItem[]
}

export type DocSourceNote = {
  id?: string
  section: 'preamble' | 'postamble'
  kind: 'title' | 'lodging' | 'heading' | 'optional' | 'note'
  text: string
  links: string[]
  source: 'Google Docs'
  applyToAgenda: false
}

export type OptionalItem = {
  id: string
  title: string
  detail?: string
  date?: string
  placeId?: number
  status?: string
  source: 'web-local' | 'Google Docs'
  sourceLabel: string
  sourceUrl?: string
  links?: string[]
  applyToAgenda: false
}

export type AgendaApplyResult = {
  dayAssignments: Record<number, number>
  placeSchedule: Record<number, PlaceSchedule>
  added: number[]
  skippedManual: number[]
  skippedConflict: number[]
}
