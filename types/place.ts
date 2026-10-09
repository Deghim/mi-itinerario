export type Place = {
  id: number
  name: string
  zone: string
  statusFromDraft: 'marcado-visitables' | 'marcado-cerrado-o-historico'
  operationalStatus: 'por-confirmar'
  coordinates: { lat: number; lon: number; confidence: 'por-confirmar' | 'aproximada-fuente-atlas' }
  nearestTransitFromDraft: string
  descriptionFromDraft: string
  addressFromDraft: string
  atlasUrl: string
  verification: 'pendiente'
}

export type SavedPlaceState = 'pendiente' | 'guardado' | 'visitado' | 'descartado'

export type PlaceSchedule = {
  startTime: string
  durationMinutes: number
  travelMinutes: number
  bufferMinutes: number
}

export type DailyRoutine = {
  wakeTime: string
  runStartTime: string
  runDurationMinutes: number
  breakfastStartTime: string
  breakfastDurationMinutes: number
  departurePrepStartTime: string
  departurePrepDurationMinutes: number
  lunchStartTime: string
  lunchDurationMinutes: number
}

export type LocalTripState = {
  favorites: number[]
  placeStates: Record<number, SavedPlaceState>
  dayAssignments: Record<number, number>
  travelYear: number
  updatedAt: string
  placeSchedule?: Record<number, PlaceSchedule>
  dailyRoutine?: DailyRoutine
}
