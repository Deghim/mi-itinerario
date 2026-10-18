import type { ItineraryOverrides, ItineraryRow } from '../types/itinerary.ts'
import type { PlaceSchedule } from '../types/place.ts'
import { createDirectMapsRouteUrl, splitMapsRouteSegments, type MapsRouteSegment, type MapsTravelMode, type RouteStop } from './maps-routes.ts'

export type CachedRouteReference = {
  day: number
  mode: 'foot' | 'car'
  placeIds: number[]
  landmarkIds?: string[]
  subroute?: boolean
  label?: string
  sourceYear?: number
  baseId?: string
  routingProfile?: string
  segmentTransport?: string
  suggested?: boolean
}

type MapRowContext = {
  rows?: ItineraryRow[]
  baseId?: string
  planningYear?: number
}

export type NormalizedTransportMode = 'walking' | 'driving' | 'transit'

function isOfficialRow(row: ItineraryRow) {
  return row.origin === 'docs' || row.applyToAgenda === false
}

function rowYear(row: ItineraryRow, personalYear: number, planningYear: number) {
  return isOfficialRow(row) ? planningYear : personalYear
}

export function effectiveMapDay(row: ItineraryRow, assignments: Record<number, number>, travelYear: number, planningYear: number) {
  if (!isOfficialRow(row) && row.placeId && travelYear === planningYear && assignments[row.placeId]) return assignments[row.placeId]
  return Number(row.date.slice(8, 10))
}

function mapRowsForDay(
  rows: ItineraryRow[],
  selectedDay: number | null,
  assignments: Record<number, number>,
  travelYear: number,
  planningYear: number,
  placeSchedule: Record<number, PlaceSchedule>,
) {
  const timeOf = (row: ItineraryRow) => {
    const schedule = !isOfficialRow(row) && row.placeId && travelYear === planningYear ? placeSchedule[row.placeId] : undefined
    const value = schedule?.startTime ?? row.time.match(/(?:^|\D)([01]\d|2[0-3]):[0-5]\d/)?.[0]?.trim()
    const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/.exec(value ?? '')
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.POSITIVE_INFINITY
  }
  const filtered = rows.map((row, originalIndex) => ({ row, originalIndex }))
    .filter(({ row }) => row.mapBase !== false && Number(row.date.slice(0, 4)) === rowYear(row, travelYear, planningYear) && (selectedDay === null || effectiveMapDay(row, assignments, travelYear, planningYear) === selectedDay))
  const daysWithUnscheduledRows = new Set(filtered.flatMap(({ row }) => timeOf(row) === Number.POSITIVE_INFINITY ? [effectiveMapDay(row, assignments, travelYear, planningYear)] : []))
  return filtered.sort((left, right) => effectiveMapDay(left.row, assignments, travelYear, planningYear) - effectiveMapDay(right.row, assignments, travelYear, planningYear)
      || (daysWithUnscheduledRows.has(effectiveMapDay(left.row, assignments, travelYear, planningYear))
        ? left.originalIndex - right.originalIndex
        : timeOf(left.row) - timeOf(right.row) || left.originalIndex - right.originalIndex))
    .map(({ row }) => row)
}

export function getMapDayRows(
  rows: ItineraryRow[],
  selectedDay: number | null,
  assignments: Record<number, number>,
  travelYear: number,
  planningYear: number,
  placeSchedule: Record<number, PlaceSchedule> = {},
) {
  return mapRowsForDay(rows, selectedDay, assignments, travelYear, planningYear, placeSchedule)
}

export function getMapStopRows(
  rows: ItineraryRow[],
  selectedDay: number | null,
  assignments: Record<number, number>,
  travelYear: number,
  planningYear: number,
  placeSchedule: Record<number, PlaceSchedule> = {},
) {
  return mapRowsForDay(rows, selectedDay, assignments, travelYear, planningYear, placeSchedule).filter((row) => row.placeId !== undefined)
}

export function getMapPendingRows(
  rows: ItineraryRow[],
  selectedDay: number | null,
  assignments: Record<number, number>,
  travelYear: number,
  planningYear: number,
  placeSchedule: Record<number, PlaceSchedule> = {},
) {
  return mapRowsForDay(rows, selectedDay, assignments, travelYear, planningYear, placeSchedule).filter((row) => !row.placeId && row.placeLabel)
}

export function isMapAttractionRow(row: Pick<ItineraryRow, 'placeLabel' | 'activity' | 'transport' | 'notes'>) {
  const text = `${row.placeLabel ?? ''} ${row.activity} ${row.transport} ${row.notes}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
  return Boolean(row.placeLabel) && !/(rutina|4-10k|ducha|desayuno|prepar|salida|llegada|equipaje|check.?in|margen|tarde libre|comida|comer|almuerzo|descanso|bus|autobus|vuelo|vuelos|encuentro|ciudad pendiente)/.test(text)
}

export function getMapCatalogPlaces<T>(places: T[], selectedDay: number | null) {
  return selectedDay === null ? places : []
}

export function getMapDirectionChanges(rows: ItineraryRow[], overrides: ItineraryOverrides, assignments: Record<number, number>, travelYear: number, planningYear: number, selectedDay: number, placeSchedule: Record<number, PlaceSchedule> = {}) {
  return rows.some((row) => {
    if (!row.placeId || row.mapBase === false) return false
    const effectiveDay = effectiveMapDay(row, assignments, travelYear, planningYear)
    if (effectiveDay !== selectedDay && Number(row.date.slice(8, 10)) !== selectedDay) return false
    const personalPlanning = !isOfficialRow(row)
    if (personalPlanning && overrides[row.id]?.transport !== undefined && overrides[row.id].transport !== row.transport) return true
    if (effectiveDay !== Number(row.date.slice(8, 10))) return true
    if (!personalPlanning || travelYear !== planningYear) return false
    const schedule = placeSchedule[row.placeId]
    if (!schedule) return false
    const plannedTime = row.schedule?.startTime ?? row.time.match(/(?:^|\D)([01]\d|2[0-3]):[0-5]\d/)?.[0]?.trim()
    return plannedTime !== schedule.startTime
  })
}

export function getMapSequenceChanged(rows: ItineraryRow[], selectedDay: number, assignments: Record<number, number>, travelYear: number, planningYear: number, placeSchedule: Record<number, PlaceSchedule>) {
  const effective = getMapStopRows(rows, selectedDay, assignments, travelYear, planningYear, placeSchedule).map((row) => row.id)
  const planned = getMapStopRows(rows, selectedDay, {}, planningYear, planningYear).map((row) => row.id)
  return effective.join(',') !== planned.join(',')
}

export function getMapRouteNeedsReview(rows: ItineraryRow[], overrides: ItineraryOverrides, assignments: Record<number, number>, travelYear: number, planningYear: number, selectedDay: number, placeSchedule: Record<number, PlaceSchedule>) {
  return getMapDirectionChanges(rows, overrides, assignments, travelYear, planningYear, selectedDay, placeSchedule)
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
  context: MapRowContext = {},
) {
  if (selectedDay === null || !stopIds.length) return []
  const ids = stopIds
  const landmarks = [...new Set(landmarkIds)].sort()
  const rows = context.rows ?? []
  return routes.filter((route) => route.day === selectedDay
    && (route.sourceYear === undefined || route.sourceYear === (context.planningYear ?? planningYear))
    && (!route.baseId || !context.baseId || route.baseId === context.baseId)
    && (!/injoy/i.test(route.label ?? '') || context.baseId === 'injoy-rio')
    && (!route.routingProfile || (route.mode === 'foot' && route.routingProfile === 'routed-foot') || (route.mode === 'car' && route.routingProfile !== 'routed-foot'))
    && (route.subroute ? route.placeIds.every((id, index) => ids.includes(id) && (!index || ids.indexOf(id) === ids.indexOf(route.placeIds[index - 1]) + 1)) : route.placeIds.join(',') === ids.join(','))
    && (route.landmarkIds ?? []).every((id) => landmarks.includes(id))
    && routeTransportMatchesRows(route, rows, selectedDay))
}

export function normalizeTransportMode(value: string): NormalizedTransportMode | null {
  const normalized = value.normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim()
  if (/^(?:a\s*pie|pie|caminata|sendero|walking|foot)$/.test(normalized)) return 'walking'
  if (/^(?:uber|taxi|coche|auto|carro|driving|car)$/.test(normalized)) return 'driving'
  if (/^(?:metro(?:\s*\+\s*tren)?|metro\s+y\s+tren|transit|transporte\s+publico|bus|autobus|trem|tren)$/.test(normalized)) return 'transit'
  return null
}

function cachedTransportMode(mode: 'foot' | 'car'): NormalizedTransportMode {
  return mode === 'foot' ? 'walking' : 'driving'
}

function routeTransportMatchesRows(route: CachedRouteReference, rows: ItineraryRow[], day: number) {
  const expectedMode = route.segmentTransport ? normalizeTransportMode(route.segmentTransport) : cachedTransportMode(route.mode)
  if (!expectedMode || (route.segmentTransport && expectedMode !== cachedTransportMode(route.mode))) return false
  const destinationIds = route.placeIds.length > 1 ? route.placeIds.slice(1) : route.placeIds
  const expectedDate = `-12-${String(day).padStart(2, '0')}`
  const relatedRows = rows.filter((row) => row.origin === 'docs' && row.date.endsWith(expectedDate) && row.placeId !== undefined && destinationIds.includes(row.placeId))
  return destinationIds.every((placeId) => {
    const destinationRows = relatedRows.filter((row) => row.placeId === placeId)
    if (!destinationRows.length) return false
    return destinationRows.every((row) => {
      const actualMode = normalizeTransportMode(row.transport)
      return actualMode === expectedMode || (route.suggested === true && !row.transport.trim() && actualMode === null)
    })
  })
}

export type MapDirectionsLink = MapsRouteSegment & { title: string }
export type MapDirectionStop = { id: number; label: string; transport?: string }

export type ConfiguredMapDay = { day: number; legs: { from: string; to: string; mode: MapsTravelMode; label: string }[] }

export function getConfiguredMapDirections(days: ConfiguredMapDay[], day: number | null): MapDirectionsLink[] {
  if (day === null) return []
  const selected = days.find((item) => item.day === day)
  return selected?.legs.map((leg) => ({
    title: leg.label,
    url: createDirectMapsRouteUrl(leg.from, leg.to, leg.mode),
    placeCount: 2,
    mode: leg.mode,
  })) ?? []
}

function directions(stops: RouteStop[], mode: MapsTravelMode, title: string): MapDirectionsLink[] {
  return splitMapsRouteSegments(stops, mode).map((segment) => ({ ...segment, title }))
}

function stopById(stops: MapDirectionStop[], id: number) {
  return stops.find((stop) => stop.id === id)
}

function directionLabel(mode: NormalizedTransportMode, from: string, to: string, transport: string | undefined, suggested = false) {
  if (mode === 'walking') return `${from} → ${to} · a pie${suggested ? ' sugerido' : ' según Google Docs'}`
  if (mode === 'driving') return `${from} → ${to} · ${transport?.trim() || 'trayecto vial'}${suggested ? ' sugerido' : ' según agenda actual'}`
  return `${from} → ${to} · transporte público`
}

/** Builds explicit mode-aware links; unknown mixed-mode edits fail closed. */
export function getMapDirections(day: number, stops: MapDirectionStop[], hostel: string, endpoints: { cantareira: string; botanicGarden: string; afroGate: string; park: string }) {
  const names = stops.map(({ label }) => label)
  if (!stops.length || new Set(stops.map(({ id }) => id)).size !== stops.length) return []
  // This day is explicitly metro-based in the source rows; without verified
  // station/transfer details, do not manufacture a walking geometry.
  if (day === 3) return []
  if (day === 4) {
    const canonical = stops.map(({ id }) => id).join(',') === '18,25,9'
    if (!canonical) return []
    const museum = stopById(stops, 18)!
    const vila = stopById(stops, 25)!
    const masp = stopById(stops, 9)!
    const modes = [museum, vila, masp].map((stop) => normalizeTransportMode(stop.transport ?? ''))
    if (modes.some((mode) => mode === null)) return []
    return [
      ...directions([{ label: hostel }, { label: museum.label }], modes[0]!, directionLabel(modes[0]!, hostel, museum.label, museum.transport)),
      ...directions([{ label: museum.label }, { label: vila.label }], modes[1]!, directionLabel(modes[1]!, museum.label, vila.label, vila.transport)),
      ...directions([{ label: vila.label }, { label: masp.label }], modes[2]!, directionLabel(modes[2]!, vila.label, masp.label, masp.transport)),
      ...directions([{ label: masp.label }, { label: hostel }], modes[2]!, directionLabel(modes[2]!, masp.label, hostel, masp.transport)),
    ]
  }
  if (day === 5) return [
    ...directions([{ label: hostel }, { label: endpoints.cantareira }], 'driving', 'Uber al Portão 1'),
    ...directions([{ label: endpoints.cantareira }, { label: hostel }], 'driving', 'Regreso en Uber'),
  ]
  if (day === 6) {
    const docStops = [30, 23, 16, 1, 21].map((id) => stopById(stops, id)).filter((stop): stop is MapDirectionStop => Boolean(stop))
    const farol = stopById(stops, 41)
    if (docStops.length !== 5 || !farol) return []
    const food = stops.find((stop) => stop.id < 0 && /liberdade/i.test(stop.label))
    const centralSequence = [docStops[0], docStops[1], docStops[2], ...(food ? [food] : []), docStops[3], docStops[4]]
    const farolPending = !farol.transport?.trim()
    const farolMode = normalizeTransportMode(farol.transport ?? '') ?? (farolPending ? 'walking' : null)
    return [
      ...directions([{ label: hostel }, { label: docStops[0].label }], 'walking', 'Hostal → Casa Dona Yayá · a pie según Google Docs'),
      ...directions(centralSequence.map(({ label }) => ({ label })), 'walking', 'Centro · recorrido a pie según Google Docs; comida Docs intermedia'),
      ...(farolMode ? directions([{ label: docStops.at(-1)!.label }, { label: farol.label }], farolMode, directionLabel(farolMode, docStops.at(-1)!.label, farol.label, farol.transport, farolPending)) : []),
      ...directions([{ label: farol.label }, { label: hostel }], 'transit', 'Regreso · transporte público'),
    ]
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
