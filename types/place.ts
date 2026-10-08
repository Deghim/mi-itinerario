export type Place = {
  id: number
  name: string
  zone: string
  statusFromDraft: 'marcado-visitables' | 'marcado-cerrado-o-historico'
  operationalStatus: 'por-confirmar'
  coordinates: { lat: number; lon: number; confidence: 'por-confirmar' }
  nearestTransitFromDraft: string
  descriptionFromDraft: string
  addressFromDraft: string
  atlasUrl: string
  verification: 'pendiente'
}

export type SavedPlaceState = 'pendiente' | 'guardado' | 'visitado' | 'descartado'

export type LocalTripState = {
  favorites: number[]
  placeStates: Record<number, SavedPlaceState>
  dayAssignments: Record<number, number>
  travelYear: number
  updatedAt: string
}
