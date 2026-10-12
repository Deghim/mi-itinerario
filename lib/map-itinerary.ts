import type { ItineraryOverrides, ItineraryRow } from '../types/itinerary.ts'
import type { PlaceSchedule } from '../types/place.ts'
import { splitMapsRouteSegments, type MapsRouteSegment, type MapsTravelMode, type RouteStop } from './maps-routes.ts'

export type CachedRouteReference = { day: number; mode: 'foot' | 'car'; placeIds: number[]; landmarkIds?: string[]; subroute?: boolean }

export function effectiveMapDay(row: ItineraryRow, assignments: Record<number, number>, travelYear: number, planningYear: number) {
  if (row.placeId && row.applyToAgenda !== false && travelYear === planningYear && assignments[row.placeId]) return assignments[row.placeId]
  return Number(row.date.slice(8, 10))
}

export function getMapStopRows(
  rows: ItineraryRow[],
  selectedDay: number | null,
  assignments: Record<number, number>,
  travelYear: number,
  planningYear: number,
  placeSchedule: Record<number, PlaceSchedule> = {},
) {
  const timeOf = (row: ItineraryRow) => {
    const schedule = row.placeId && row.applyToAgenda !== false && travelYear === planningYear ? placeSchedule[row.placeId] : undefined
    const value = schedule?.startTime ?? row.time.match(/(?:^|\D)([01]\d|2[0-3]):[0-5]\d/)?.[0]?.trim()
    const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/.exec(value ?? '')
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.POSITIVE_INFINITY
  }
  return rows.map((row, originalIndex) => ({ row, originalIndex }))
    .filter(({ row }) => row.placeId && row.mapBase !== false && row.status !== 'pendiente' && (selectedDay === null || effectiveMapDay(row, assignments, travelYear, planningYear) === selectedDay))
    .sort((left, right) => effectiveMapDay(left.row, assignments, travelYear, planningYear) - effectiveMapDay(right.row, assignments, travelYear, planningYear)
      || timeOf(left.row) - timeOf(right.row)
      || left.originalIndex - right.originalIndex)
    .map(({ row }) => row)
}

export function getMapCatalogPlaces<T>(places: T[], selectedDay: number | null) {
  return selectedDay === null ? places : []
}

export function getMapDirectionChanges(rows: ItineraryRow[], overrides: ItineraryOverrides, assignments: Record<number, number>, travelYear: number, planningYear: number, selectedDay: number) {
  return rows.some((row) => row.placeId && row.mapBase !== false && row.status !== 'pendiente'
    && (effectiveMapDay(row, assignments, travelYear, planningYear) === selectedDay || Number(row.date.slice(8, 10)) === selectedDay)
    && (overrides[row.id]?.transport !== undefined && overrides[row.id].transport !== row.transport
      || effectiveMapDay(row, assignments, travelYear, planningYear) !== Number(row.date.slice(8, 10))))
}

export function getMapSequenceChanged(rows: ItineraryRow[], selectedDay: number, assignments: Record<number, number>, travelYear: number, planningYear: number, placeSchedule: Record<number, PlaceSchedule>) {
  const effective = getMapStopRows(rows, selectedDay, assignments, travelYear, planningYear, placeSchedule).map((row) => row.id)
  const planned = getMapStopRows(rows, selectedDay, {}, planningYear, planningYear).map((row) => row.id)
  return effective.join(',') !== planned.join(',')
}

export function getMapRouteNeedsReview(rows: ItineraryRow[], overrides: ItineraryOverrides, assignments: Record<number, number>, travelYear: number, planningYear: number, selectedDay: number, placeSchedule: Record<number, PlaceSchedule>) {
  return getMapDirectionChanges(rows, overrides, assignments, travelYear, planningYear, selectedDay)
    || getMapSequenceChanged(rows, selectedDay, assignments, travelYear, planningYear, placeSchedule)
}

export function getVisibleMapOptions<T extends { placeId: number; suggestedDay: number }>(options: T[], selectedDay: number | null, baseRows: ItineraryRow[]) {
  const basePlaceIds = new Set(baseRows.flatMap((row) => row.placeId ? [row.placeId] : []))
  return options.filter((option) => (selectedDay === null || option.suggestedDay === selectedDay) && !basePlaceIds.has(option.placeId))
}

/** Cached street geometry is shown only while its stops still match the selected itinerary day. */
export function getMatchingCachedRoutes<T extends CachedRouteReference>(
  routes: T[],
  selectedDay: number | null,
  stopIds: number[],
  travelYear: number,
  planningYear: number,
  landmarkIds: string[] = [],
) {
  if (selectedDay === null || travelYear !== planningYear || !stopIds.length) return []
  const ids = stopIds
  const landmarks = [...new Set(landmarkIds)].sort()
  return routes.filter((route) => route.day === selectedDay
    && (route.subroute ? route.placeIds.every((id, index) => ids.includes(id) && (!index || ids.indexOf(id) === ids.indexOf(route.placeIds[index - 1]) + 1)) : route.placeIds.join(',') === ids.join(','))
    && (route.landmarkIds ?? []).every((id) => landmarks.includes(id)))
}

export type MapDirectionsLink = MapsRouteSegment & { title: string }
export type MapDirectionStop = { id: number; label: string }

function directions(stops: RouteStop[], mode: MapsTravelMode, title: string): MapDirectionsLink[] {
  return splitMapsRouteSegments(stops, mode).map((segment) => ({ ...segment, title }))
}

function stopById(stops: MapDirectionStop[], id: number) {
  return stops.find((stop) => stop.id === id)
}

/** Builds explicit mode-aware links; unknown mixed-mode edits fail closed. */
export function getMapDirections(day: number, stops: MapDirectionStop[], hostel: string, endpoints: { cantareira: string; botanicGarden: string; afroGate: string; park: string }) {
  const names = stops.map(({ label }) => label)
  if (!stops.length || new Set(stops.map(({ id }) => id)).size !== stops.length) return []
  if (day === 3) return directions([{ label: hostel }, ...names.map((label) => ({ label })), { label: hostel }], 'walking', 'Paseo local · a pie')
  if (day === 4) {
    const canonical = stops.map(({ id }) => id).join(',') === '18,25,9'
    if (!canonical) return []
    return [
      ...directions([{ label: hostel }, { label: stopById(stops, 18)!.label }], 'transit', 'Hostal → Museu · transporte público'),
      ...directions([{ label: stopById(stops, 18)!.label }, { label: stopById(stops, 25)!.label }], 'driving', 'Museu → Vila · Uber'),
      ...directions([{ label: stopById(stops, 25)!.label }, { label: stopById(stops, 9)!.label }], 'transit', 'Vila → MASP · transporte público'),
      ...directions([{ label: stopById(stops, 9)!.label }, { label: hostel }], 'transit', 'MASP → hostal · transporte público'),
    ]
  }
  if (day === 5) return [
    ...directions([{ label: hostel }, { label: endpoints.cantareira }], 'driving', 'Uber al Portão 1'),
    ...directions([{ label: endpoints.cantareira }, { label: hostel }], 'driving', 'Regreso en Uber'),
  ]
  if (day === 6) {
    const walking = directions([{ label: hostel }, ...names.map((label) => ({ label }))], 'walking', 'Hostal y recorrido central · a pie')
    const metroReturn = directions([{ label: names.at(-1)! }, { label: hostel }], 'transit', 'Regreso · transporte público')
    return [...walking, ...metroReturn]
  }
  if (day === 7) {
    if (stops.map(({ id }) => id).join(',') !== '20,26,5,28,19,24') return []
    const initialTransit = directions([{ label: hostel }, { label: names[0] }], 'transit', 'Hostal → primera parada · transporte público')
    const lunch = 'Largo do Paissandu, São Paulo, Brasil'
    const walkToLunch = directions([{ label: names[0] }, { label: lunch }], 'walking', 'Memorial → comida en Largo do Paissandu · a pie')
    const cityWalk = directions([{ label: lunch }, ...names.slice(1).map((label) => ({ label }))], 'walking', 'Largo do Paissandu → centro · a pie')
      .map((segment, index) => index ? { ...segment, title: 'Centro · continuación a pie' } : segment)
    const returnTransit = directions([{ label: names.at(-1)! }, { label: hostel }], 'transit', 'Regreso · transporte público')
    return [...initialTransit, ...walkToLunch, ...cityWalk, ...returnTransit]
  }
  if (day === 8) {
    if (stops.map(({ id }) => id).join(',') !== '4,13') return []
    const station = 'Estação São Judas, São Paulo, Brasil'
    const garden = stopById(stops, 4)!.label
    const afro = stopById(stops, 13)!.label
    return [
      ...directions([{ label: hostel }, { label: station }], 'transit', 'Hostal → estación São Judas · transporte público'),
      ...directions([{ label: station }, { label: endpoints.botanicGarden }], 'driving', 'São Judas → Jardim Botânico · Uber'),
      ...directions([{ label: garden }, { label: endpoints.afroGate }], 'driving', 'Jardim Botânico → Portão 10 · Uber'),
      ...directions([{ label: endpoints.afroGate }, { label: afro }], 'walking', 'Portão 10 → Museu Afro Brasil · a pie'),
      ...directions([{ label: afro }, { label: endpoints.park }], 'walking', 'Museu Afro Brasil → parque · a pie'),
      ...directions([{ label: endpoints.park }, { label: hostel }], 'transit', 'Parque → hostal · transporte público'),
    ]
  }
  return []
}
