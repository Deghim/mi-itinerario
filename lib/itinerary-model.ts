import itineraryData from '../docs/data/itinerario.json' with { type: 'json' }
import type { AgendaApplyResult, ItineraryData, ItineraryRow } from '@/types/itinerary'
import type { LocalTripState, Place, PlaceSchedule } from '@/types/place'
import { findScheduleConflicts } from './schedule.ts'

export const itinerary = itineraryData as ItineraryData

export function itineraryDay(row: ItineraryRow): number {
  return Number(row.date.slice(8, 10))
}

export type ItineraryRowGroup = { date: string; rows: ItineraryRow[] }

export function effectiveItineraryDate(row: ItineraryRow, state: Pick<LocalTripState, 'travelYear' | 'dayAssignments'>, planningYear: number): string {
  if (!row.placeId || row.applyToAgenda === false || state.travelYear !== planningYear) return row.date
  const assignedDay = state.dayAssignments[row.placeId]
  if (!assignedDay || assignedDay < 1 || assignedDay > 31) return row.date
  return `${planningYear}-12-${String(assignedDay).padStart(2, '0')}`
}

export function groupItineraryRows(
  rows: ItineraryRow[],
  state: Pick<LocalTripState, 'travelYear' | 'dayAssignments'>,
  planningYear: number,
  dayFilter: number | 'all' = 'all',
): ItineraryRowGroup[] {
  const grouped = new Map<string, ItineraryRow[]>()
  for (const row of rows) {
    const date = effectiveItineraryDate(row, state, planningYear)
    if (dayFilter !== 'all' && Number(date.slice(8, 10)) !== dayFilter) continue
    const dayRows = grouped.get(date) ?? []
    dayRows.push(row)
    grouped.set(date, dayRows)
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, dayRows]) => ({ date, rows: dayRows }))
}

export function itineraryDayTone(iso: string): 'par' | 'impar' {
  return Number(iso.slice(8, 10)) % 2 === 0 ? 'par' : 'impar'
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
