import type { LocalTripState, SavedPlaceState } from '@/types/place'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const states = new Set<SavedPlaceState>(['pendiente', 'guardado', 'visitado', 'descartado'])
const knownPlaceIds = new Set(Array.from({ length: 36 }, (_, index) => index + 1))
export const supportedTravelYears = [2026, 2027, 2028, 2029, 2030] as const

export function readTripState(storage: StorageLike, key: string, fallback: LocalTripState): LocalTripState {
  const raw = storage.getItem(key)
  if (!raw) return fallback
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') return fallback
  const record = parsed as Record<string, unknown>
  const favorites = Array.isArray(record.favorites)
    ? [...new Set(record.favorites.filter((id): id is number => typeof id === 'number' && knownPlaceIds.has(id)))]
    : []
  const placeStates: LocalTripState['placeStates'] = {}
  if (record.placeStates && typeof record.placeStates === 'object') {
    for (const [id, value] of Object.entries(record.placeStates)) {
      const numericId = Number(id)
      if (knownPlaceIds.has(numericId) && typeof value === 'string' && states.has(value as SavedPlaceState)) {
        placeStates[numericId] = value as SavedPlaceState
      }
    }
  }
  const dayAssignments: LocalTripState['dayAssignments'] = {}
  if (record.dayAssignments && typeof record.dayAssignments === 'object') {
    for (const [id, value] of Object.entries(record.dayAssignments)) {
      const numericId = Number(id)
      const day = Number(value)
      if (knownPlaceIds.has(numericId) && Number.isInteger(day) && day >= 4 && day <= 12) dayAssignments[numericId] = day
    }
  }
  const travelYear = typeof record.travelYear === 'number' && Number.isInteger(record.travelYear)
    && supportedTravelYears.includes(record.travelYear as (typeof supportedTravelYears)[number])
    ? record.travelYear
    : fallback.travelYear
  return { favorites, placeStates, dayAssignments, travelYear, updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '' }
}

export function writeTripState(storage: StorageLike, key: string, state: LocalTripState, now = new Date()): void {
  storage.setItem(key, JSON.stringify({ ...state, updatedAt: now.toISOString() }))
}

export function clearTripState(storage: StorageLike, key: string): void {
  storage.removeItem(key)
}
