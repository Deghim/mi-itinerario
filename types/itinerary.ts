import type { PlaceSchedule } from './place'

export type ItineraryStatus = 'captura-compartida' | 'confirmado-por-viajero' | 'propuesta' | 'condicional' | 'pendiente' | 'tentativo'
export type ItineraryRow = {
  id: string
  date: string
  time: string
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
}

export type ItineraryRowOverride = Partial<Pick<ItineraryRow, 'transport' | 'lodging' | 'reservation' | 'notes'>>
export type ItineraryOverrides = Record<string, ItineraryRowOverride>
export type ItineraryCoverageState = 'propuesta' | 'condicional' | 'pendiente' | 'historico'
export type ItineraryCoverage = { placeId: number; state: ItineraryCoverageState; note: string }

export type ItineraryData = {
  year: number
  yearIsAssumption: boolean
  rioNightsPreferred: number
  rows: ItineraryRow[]
  coverage: ItineraryCoverage[]
}

export type AgendaApplyResult = {
  dayAssignments: Record<number, number>
  placeSchedule: Record<number, PlaceSchedule>
  added: number[]
  skippedManual: number[]
  skippedConflict: number[]
}
