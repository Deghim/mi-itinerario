import itineraryData from '../docs/data/itinerario.json' with { type: 'json' }
import type { AgendaApplyResult, ItineraryData, ItineraryRow } from '@/types/itinerary'
import type { Place, PlaceSchedule } from '@/types/place'
import { findScheduleConflicts } from './schedule.ts'

export const itinerary = itineraryData as ItineraryData

export function itineraryDay(row: ItineraryRow): number {
  return Number(row.date.slice(8, 10))
}

export function proposedPlaceRows(): ItineraryRow[] {
  return itinerary.rows.filter((row) => row.placeId !== undefined && row.schedule && row.applyToAgenda === true)
}

export function planAgendaApplication(
  places: Place[],
  rows: ItineraryRow[],
  currentAssignments: Record<number, number>,
  currentSchedules: Record<number, PlaceSchedule>,
): AgendaApplyResult {
  const assignments = { ...currentAssignments }
  const schedules = { ...currentSchedules }
  const candidates = rows.filter((row) => row.placeId !== undefined && row.schedule && row.applyToAgenda === true)
  const skippedManual: number[] = []
  const eligible = candidates.filter((row) => {
    const id = row.placeId!
    if (currentAssignments[id] !== undefined || currentSchedules[id] !== undefined) {
      skippedManual.push(id)
      return false
    }
    return true
  })

  for (const row of eligible) {
    assignments[row.placeId!] = itineraryDay(row)
    schedules[row.placeId!] = row.schedule!
  }

  const conflictIds = new Set<number>()
  for (const day of new Set(eligible.map(itineraryDay))) {
    const conflicts = findScheduleConflicts(places, assignments, schedules, day)
    for (const id of conflicts) if (eligible.some((row) => row.placeId === id)) conflictIds.add(id)
  }
  const skippedConflict = [...conflictIds]
  for (const id of skippedConflict) {
    delete assignments[id]
    delete schedules[id]
  }
  const added = eligible.map((row) => row.placeId!).filter((id) => !conflictIds.has(id))
  return { dayAssignments: assignments, placeSchedule: schedules, added, skippedManual, skippedConflict }
}
