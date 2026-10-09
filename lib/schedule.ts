import type { DailyRoutine, Place, PlaceSchedule } from '@/types/place'

export const DEFAULT_DAILY_ROUTINE: DailyRoutine = {
  wakeTime: '07:00',
  runStartTime: '07:15',
  runDurationMinutes: 45,
  breakfastStartTime: '08:00',
  breakfastDurationMinutes: 60,
  departurePrepStartTime: '09:00',
  departurePrepDurationMinutes: 30,
  lunchStartTime: '12:30',
  lunchDurationMinutes: 90,
}

export function timeToMinutes(value: string): number | null {
  const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export function minutesToTime(value: number): string | null {
  if (!Number.isInteger(value) || value < 0 || value > 1440) return null
  if (value === 1440) return '24:00'
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

export function calculateEndTime(startTime: string, durationMinutes: number): string | null {
  const start = timeToMinutes(startTime)
  if (start === null || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) return null
  return minutesToTime(start + durationMinutes)
}

export function isValidPlaceSchedule(value: unknown): value is PlaceSchedule {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const startTime = typeof item.startTime === 'string' ? item.startTime : ''
  const hasTime = startTime === '' || timeToMinutes(startTime) !== null
  const validDuration = Number.isInteger(item.durationMinutes) && Number(item.durationMinutes) >= 15 && Number(item.durationMinutes) <= 600
  const validTravel = Number.isInteger(item.travelMinutes) && Number(item.travelMinutes) >= 0 && Number(item.travelMinutes) <= 360
  const validBuffer = Number.isInteger(item.bufferMinutes) && Number(item.bufferMinutes) >= 0 && Number(item.bufferMinutes) <= 360
  if (!hasTime || !validDuration || !validTravel || !validBuffer) return false
  if (startTime && calculateEndTime(startTime, Number(item.durationMinutes)) === null) return false
  if (startTime && timeToMinutes(startTime)! < Number(item.travelMinutes) + Number(item.bufferMinutes)) return false
  return true
}

export function parsePlaceScheduleMap(value: unknown): Record<number, PlaceSchedule> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const result: Record<number, PlaceSchedule> = {}
  for (const [id, entry] of Object.entries(value)) {
    const placeId = Number(id)
    if (Number.isInteger(placeId) && placeId >= 1 && placeId <= 36 && isValidPlaceSchedule(entry)) result[placeId] = entry
  }
  return result
}

export function parseDailyRoutine(value: unknown): DailyRoutine | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const item = value as Record<string, unknown>
  const times = ['wakeTime', 'runStartTime', 'breakfastStartTime', 'departurePrepStartTime', 'lunchStartTime'] as const
  const durations = ['runDurationMinutes', 'breakfastDurationMinutes', 'departurePrepDurationMinutes', 'lunchDurationMinutes'] as const
  if (!times.every((key) => typeof item[key] === 'string' && timeToMinutes(item[key]) !== null)) return undefined
  if (!durations.every((key) => Number.isInteger(item[key]) && Number(item[key]) >= 10 && Number(item[key]) <= 240)) return undefined
  const timedBlocks = [
    ['runStartTime', 'runDurationMinutes'],
    ['breakfastStartTime', 'breakfastDurationMinutes'],
    ['departurePrepStartTime', 'departurePrepDurationMinutes'],
    ['lunchStartTime', 'lunchDurationMinutes'],
  ] as const
  if (timedBlocks.some(([startKey, durationKey]) => calculateEndTime(item[startKey] as string, item[durationKey] as number) === null)) return undefined
  return {
    wakeTime: item.wakeTime as string,
    runStartTime: item.runStartTime as string,
    runDurationMinutes: item.runDurationMinutes as number,
    breakfastStartTime: item.breakfastStartTime as string,
    breakfastDurationMinutes: item.breakfastDurationMinutes as number,
    departurePrepStartTime: item.departurePrepStartTime as string,
    departurePrepDurationMinutes: item.departurePrepDurationMinutes as number,
    lunchStartTime: item.lunchStartTime as string,
    lunchDurationMinutes: item.lunchDurationMinutes as number,
  }
}

export function sortAssignedPlaces(places: Place[], dayAssignments: Record<number, number>, placeSchedule: Record<number, PlaceSchedule> = {}, day: number): Place[] {
  return places.filter((place) => dayAssignments[place.id] === day).sort((left, right) => {
    const leftTime = timeToMinutes(placeSchedule[left.id]?.startTime ?? '')
    const rightTime = timeToMinutes(placeSchedule[right.id]?.startTime ?? '')
    if (leftTime === null && rightTime === null) return left.id - right.id
    if (leftTime === null) return 1
    if (rightTime === null) return -1
    return leftTime - rightTime || left.id - right.id
  })
}

export function findScheduleConflicts(places: Place[], dayAssignments: Record<number, number>, schedules: Record<number, PlaceSchedule>, day: number): Set<number> {
  const timed = sortAssignedPlaces(places, dayAssignments, schedules, day).flatMap((place) => {
    const schedule = schedules[place.id]
    if (!schedule) return []
    const start = timeToMinutes(schedule.startTime)
    const endTime = calculateEndTime(schedule.startTime, schedule.durationMinutes)
    const end = endTime === '24:00' ? 1440 : endTime ? timeToMinutes(endTime) : null
    if (start === null || end === null) return []
    return [{ id: place.id, occupiedStart: start - schedule.travelMinutes - schedule.bufferMinutes, end }]
  })
  const conflicts = new Set<number>()
  for (let leftIndex = 0; leftIndex < timed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < timed.length; rightIndex += 1) {
      const left = timed[leftIndex]
      const right = timed[rightIndex]
      if (left.occupiedStart < right.end && right.occupiedStart < left.end) {
        conflicts.add(left.id)
        conflicts.add(right.id)
      }
    }
  }
  return conflicts
}
