import type { ItineraryOverrides, ItineraryRow } from '@/types/itinerary'

export const ITINERARY_OVERRIDES_KEY = 'mi-itinerario:itinerary:v1'
const editableFields = ['transport', 'lodging', 'reservation', 'notes'] as const

export interface ItineraryStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function normalizeOverrides(rows: ItineraryRow[], candidate: unknown): ItineraryOverrides {
  try {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return {}
    const rowIds = new Set(rows.map((row) => row.id))
    const result: ItineraryOverrides = {}
    for (const [id, value] of Object.entries(candidate)) {
      if (!rowIds.has(id) || typeof value !== 'object' || value === null || Array.isArray(value)) continue
      const override: ItineraryOverrides[string] = {}
      for (const field of editableFields) {
        const fieldValue = (value as Record<string, unknown>)[field]
        if (typeof fieldValue === 'string') override[field] = fieldValue.trim().slice(0, field === 'notes' ? 1000 : 300)
      }
      if (Object.keys(override).length) result[id] = override
    }
    return result
  } catch {
    return {}
  }
}

export function readItineraryOverrides(storage: ItineraryStorageLike, key: string, rows: ItineraryRow[]): ItineraryOverrides {
  try {
    const raw = storage.getItem(key)
    if (!raw) return {}
    return normalizeOverrides(rows, JSON.parse(raw))
  } catch {
    return {}
  }
}

export function writeItineraryOverrides(storage: ItineraryStorageLike, key: string, overrides: unknown, rows: ItineraryRow[]): void {
  storage.setItem(key, JSON.stringify(normalizeOverrides(rows, overrides)))
}

export function clearItineraryOverrides(storage: ItineraryStorageLike, key: string): void {
  storage.removeItem(key)
}
