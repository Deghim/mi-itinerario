import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readTripState } from '../lib/trip-storage.ts'
import { createMapsRouteSegments, MAX_MOBILE_MAP_WAYPOINTS } from '../lib/maps-routes.ts'
import { getMapCatalogPlaces, getMapDirectionChanges, getMapDirections, getMapRouteNeedsReview, getMapSequenceChanged, getMapStopRows, getVisibleMapOptions, getMatchingCachedRoutes } from '../lib/map-itinerary.ts'
import { ITINERARY_OVERRIDES_KEY, readItineraryOverrides, writeItineraryOverrides } from '../lib/itinerary-storage.ts'

const placesFile = new URL('../docs/data/lugares-sao-paulo.json', import.meta.url)
const tripFile = new URL('../docs/data/viaje.json', import.meta.url)

test('el catálogo conserva 36 fichas Atlas y tres complementos con fuente', async () => {
  const data = JSON.parse(await readFile(placesFile, 'utf8'))
  assert.equal(data.places.length, 39)
  assert.deepEqual(new Set(data.places.map((place) => place.id)).size, 39)
  const atlas = data.places.filter((place) => place.catalogType === 'atlas')
  const extras = data.places.filter((place) => place.catalogType === 'complemento')
  assert.equal(atlas.length, 36)
  assert.equal(extras.length, 3)
  assert.ok(atlas.every((place) => place.atlasUrl.startsWith('https://www.atlasobscura.com/places/')))
  assert.ok(extras.every((place) => place.sourceLabel && /^https:\/\//.test(place.atlasUrl)))
  assert.ok(data.places.every((place) => place.verification === 'pendiente'))
  assert.ok(data.places.every((place) => place.operationalStatus === 'por-confirmar'))
  assert.ok(data.places.every((place) => ['por-confirmar', 'aproximada-fuente-atlas', 'aproximada-fuente-oficial'].includes(place.coordinates.confidence)))
  assert.equal(data.places.find((place) => place.id === 6).zone, 'Sur')
  assert.deepEqual(data.places.find((place) => place.id === 6).coordinates, { lat: -23.6162, lon: -46.720104, confidence: 'aproximada-fuente-atlas' })
  assert.deepEqual(data.places.find((place) => place.id === 32).coordinates, { lat: -23.586479, lon: -46.682078, confidence: 'aproximada-fuente-atlas' })
  assert.equal(atlas.filter((place) => place.statusFromDraft === 'marcado-visitables').length, 33)
  assert.equal(atlas.filter((place) => place.statusFromDraft === 'marcado-cerrado-o-historico').length, 3)
  assert.deepEqual(extras.map((place) => place.name), ['Museu de Arte Moderna de São Paulo (MAM)', 'Planetário do Ibirapuera', 'Monumento às Bandeiras'])
})

test('el calendario conserva las fechas recibidas sin convertir las propuestas en reservas', async () => {
  const trip = JSON.parse(await readFile(tripFile, 'utf8'))
  assert.equal(trip.yearIsAssumption, false)
  assert.equal(trip.milestones.find((item) => item.label === 'Llegada a GRU').date, '2026-12-03')
  assert.equal(trip.milestones.find((item) => item.label === 'Encuentro con amigos').status, 'tentative')
  assert.equal(trip.milestones.find((item) => item.label === 'Resto del viaje').status, 'unplanned')
  assert.match(trip.proposedPlan.pacePreference, /Flexible/)
  assert.match(trip.proposedPlan.pacingSummary, /3 dic ligero.*4 intenso.*5 excursión.*6 intermedio.*7 intenso.*8 intermedio/)
  assert.equal(trip.people.count, null)
  assert.ok(trip.privacy.private.includes('boletos con códigos'))
})

test('un año corrupto o fuera del selector vuelve al año seguro', () => {
  const fallback = { favorites: [], placeStates: {}, dayAssignments: {}, travelYear: 2026, updatedAt: '' }
  for (const travelYear of [2026.5, 2025, 2031, '2027']) {
    const storage = { getItem: () => JSON.stringify({ travelYear }) }
    assert.equal(readTripState(storage, 'trip', fallback).travelYear, 2026)
  }
  const validStorage = { getItem: () => JSON.stringify({ travelYear: 2028 }) }
  assert.equal(readTripState(validStorage, 'trip', fallback).travelYear, 2028)
})

test('las rutas de Google Maps se fraccionan al máximo seguro para móvil', () => {
  const names = Array.from({ length: 11 }, (_, index) => `Lugar ${index + 1}`)
  const segments = createMapsRouteSegments(names)
  assert.deepEqual(segments.map((segment) => segment.placeCount), [5, 5, 3])
  for (const segment of segments) {
    const url = new URL(segment.url)
    const waypointCount = url.searchParams.get('waypoints')?.split('|').length ?? 0
    assert.ok(waypointCount <= MAX_MOBILE_MAP_WAYPOINTS)
    assert.equal(url.searchParams.get('api'), '1')
  }
  assert.equal(new URL(segments[0].url).searchParams.get('destination'), new URL(segments[1].url).searchParams.get('origin'))
  assert.equal(new URL(segments[1].url).searchParams.get('destination'), new URL(segments[2].url).searchParams.get('origin'))
})

test('el día compartido actualiza paradas en orden, conserva el hostal externo y separa opciones', async () => {
  const trip = JSON.parse(await readFile(new URL('../docs/data/itinerario.json', import.meta.url), 'utf8'))
  const daySix = getMapStopRows(trip.rows, 6, {}, 2026, 2026)
  assert.deepEqual(daySix.map((row) => row.placeId), [30, 23, 16, 1, 21])
  const options = getVisibleMapOptions(trip.optionalStops, 6, daySix)
  assert.ok(options.some((option) => option.placeId === 12))
  assert.ok(!daySix.some((row) => row.placeId === 12))
  const moved = getMapStopRows(trip.rows, 6, { 16: 7 }, 2026, 2026)
  assert.ok(!moved.some((row) => row.placeId === 16))
  assert.ok(getMapStopRows(trip.rows, 7, { 16: 7 }, 2026, 2026).some((row) => row.placeId === 16))
  assert.ok(getMapStopRows(trip.rows, 6, { 16: 7 }, 2027, 2026).some((row) => row.placeId === 16))
  assert.equal(trip.mapBase.status, 'No reservado')
  assert.match(trip.mapBase.bookingUrl, /^https:\/\//)
  assert.equal(trip.mapEndpoints.cantareira.mapQuery, 'Portão 1, Rua do Horto, 931, Horto Florestal, São Paulo, Brasil')
  assert.equal(trip.mapEndpoints.cantareira.visitationAddress, 'Rua do Horto, 1799')
  assert.match(trip.mapEndpoints.cantareira.trailUrl, /trilha-da-pedra-grande/)
  assert.equal(trip.mapEndpoints.cantareira.coordinates.confidence, 'aproximada-geocoder-osm')
})

test('horarios y asignaciones manuales ordenan paradas efectivas e invalidan geometría incompatible', async () => {
  const trip = JSON.parse(await readFile(new URL('../docs/data/itinerario.json', import.meta.url), 'utf8'))
  const routeData = JSON.parse(await readFile(new URL('../docs/data/map-routes.json', import.meta.url), 'utf8'))
  const schedule = { 16: { startTime: '09:00', durationMinutes: 80, travelMinutes: 0, bufferMinutes: 0 } }
  const reordered = getMapStopRows(trip.rows, 6, {}, 2026, 2026, schedule)
  assert.deepEqual(reordered.map((row) => row.placeId), [16, 30, 23, 1, 21])
  assert.equal(getMapSequenceChanged(trip.rows, 6, {}, 2026, 2026, schedule), true)
  assert.equal(getMatchingCachedRoutes(routeData.routes, 6, reordered.map((row) => row.placeId), 2026, 2026).length, 0)
  assert.deepEqual(getMapDirections(6, reordered.map((row) => ({ id: row.placeId, label: row.placeLabel ?? String(row.placeId) })), 'Hostel Vergueiro', { cantareira: 'Portão 1', botanicGarden: 'Jardim Botânico', afroGate: 'Portão 10', park: 'Ibirapuera' }).at(-1)?.mode, 'transit')
  const moved = getMapStopRows(trip.rows, 7, { 16: 7 }, 2026, 2026)
  assert.ok(moved.some((row) => row.placeId === 16))
  assert.equal(getMapDirectionChanges(trip.rows, {}, { 16: 7 }, 2026, 2026, 7), true)
  assert.equal(getMatchingCachedRoutes(routeData.routes, 7, moved.map((row) => row.placeId), 2026, 2026).length, 1, 'la subruta central aún coincide parcialmente; MapView la oculta al detectar el cambio')
  assert.equal(getMapRouteNeedsReview(trip.rows, {}, { 16: 7 }, 2026, 2026, 7, {}), true)
  assert.equal(getMapDirectionChanges(trip.rows, {}, { 16: 7 }, 2027, 2026, 7), false)
  const maspMoved = { 9: 6 }
  assert.deepEqual(getMapStopRows(trip.rows, 3, maspMoved, 2026, 2026).filter((row) => row.placeId === 9).map((row) => row.id), ['place-09-exterior-day-03'])
  assert.deepEqual(getMapStopRows(trip.rows, 6, maspMoved, 2026, 2026).filter((row) => row.placeId === 9).map((row) => row.id), ['place-09-interior-day-04'])
  assert.equal(getMapStopRows(trip.rows, 3, {}, 2026, 2026).filter((row) => row.placeId === 9).length, 1)
  assert.equal(getMapStopRows(trip.rows, 4, {}, 2026, 2026).filter((row) => row.placeId === 9).length, 1)

  const dayEightSchedule = {
    4: { startTime: '16:45', durationMinutes: 60, travelMinutes: 30, bufferMinutes: 15 },
  }
  const dayEightStops = getMapStopRows(trip.rows, 8, {}, 2026, 2026, dayEightSchedule)
  assert.deepEqual(dayEightStops.map((row) => row.placeId), [13, 4])
  assert.equal(getMapSequenceChanged(trip.rows, 8, {}, 2026, 2026, dayEightSchedule), true)
  assert.equal(getMapRouteNeedsReview(trip.rows, {}, {}, 2026, 2026, 8, dayEightSchedule), true)
  const staleAfroPark = routeData.routes.filter((route) => route.day === 8 && route.subroute)
  assert.equal(getMatchingCachedRoutes(staleAfroPark, 8, dayEightStops.map((row) => row.placeId), 2026, 2026, ['park-ibirapuera']).length, 1,
    'la geometría coincidente de una parte del día aún existe, por eso MapView debe ocultar todas las rutas cuando cambia la secuencia')

  const memory = new Map()
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) }
  const row = trip.rows.find((item) => item.id === 'place-30-day-06')
  writeItineraryOverrides(storage, ITINERARY_OVERRIDES_KEY, { [row.id]: { transport: 'Uber hasta Casa Dona Yayá' } }, trip.rows)
  const actualUiOverride = readItineraryOverrides(storage, ITINERARY_OVERRIDES_KEY, trip.rows)
  assert.equal(actualUiOverride[row.id].transport, 'Uber hasta Casa Dona Yayá')
  assert.equal(getMapDirectionChanges(trip.rows, actualUiOverride, {}, 2026, 2026, 6), true)
})

test('Todos muestra las 39 referencias sin paradas numeradas ni líneas', async () => {
  const catalog = JSON.parse(await readFile(placesFile, 'utf8')).places
  const routeData = JSON.parse(await readFile(new URL('../docs/data/map-routes.json', import.meta.url), 'utf8'))
  assert.equal(getMapCatalogPlaces(catalog, null).length, 39)
  assert.equal(new Set(getMapCatalogPlaces(catalog, null).map((place) => place.id)).size, 39)
  assert.equal(getMapCatalogPlaces(catalog, 6).length, 0)
  assert.equal(getMatchingCachedRoutes(routeData.routes, null, catalog.map((place) => place.id), 2026, 2026).length, 0)
})

test('los enlaces de mapa siguen el transporte previsto y el Portão 10, con tramos móviles cortos', async () => {
  const trip = JSON.parse(await readFile(new URL('../docs/data/itinerario.json', import.meta.url), 'utf8'))
  const places = JSON.parse(await readFile(placesFile, 'utf8')).places
  const rowsFor = (day) => getMapStopRows(trip.rows, day, {}, 2026, 2026).map((row) => ({ id: row.placeId, label: places.find((place) => place.id === row.placeId)?.name ?? String(row.placeId) }))
  const directions = (day, rows) => getMapDirections(day, rows, trip.mapBase.name, {
    cantareira: trip.mapEndpoints.cantareira.mapQuery,
    botanicGarden: 'Jardim Botânico de São Paulo, Avenida Miguel Estéfano 3031',
    afroGate: 'Portão 10, Parque Ibirapuera, São Paulo',
    park: 'Parque Ibirapuera, São Paulo',
  })
  const day6 = directions(6, rowsFor(6))
  assert.ok(day6.length >= 3)
  assert.ok(day6.slice(0, -1).every((link) => link.mode === 'walking'))
  assert.equal(day6.at(-1).mode, 'transit')
  const day7 = directions(7, rowsFor(7))
  assert.deepEqual(rowsFor(7).map((stop) => stop.id), [20, 26, 5, 28, 19, 24])
  assert.deepEqual(day7.map((link) => link.mode), ['transit', 'walking', 'walking', 'walking', 'transit'])
  assert.deepEqual(day7.map((link) => link.title), [
    'Hostal → primera parada · transporte público',
    'Memorial → comida en Largo do Paissandu · a pie',
    'Largo do Paissandu → centro · a pie',
    'Centro · continuación a pie',
    'Regreso · transporte público',
  ])
  assert.equal(day7.at(-1).mode, 'transit')
  const day7Stops = day7.map((link) => {
    const url = new URL(link.url)
    return [url.searchParams.get('origin'), url.searchParams.get('destination')]
  })
  assert.ok(day7Stops.slice(1).every(([origin], index) => origin === day7Stops[index][1]), 'cada enlace empieza donde terminó el anterior')
  const centralWaypoints = new URL(day7[2].url).searchParams.get('waypoints')
  assert.match(centralWaypoints, /Monumento Mãe Preta/)
  assert.match(centralWaypoints, /La Madone/)
  assert.match(centralWaypoints, /Martinelli/)
  assert.match(day7Stops[3][0], /Theatro Municipal/)
  assert.match(day7Stops[3][1], /Imprensa/)
  const day8 = directions(8, rowsFor(8))
  assert.deepEqual(day8.map((link) => link.mode), ['transit', 'driving', 'driving', 'walking', 'walking', 'transit'])
  const gate = new URL(day8.find((link) => link.title.includes('Portão 10 · Uber')).url)
  assert.match(gate.searchParams.get('destination'), /Portão 10/)
  assert.doesNotMatch(gate.searchParams.get('destination'), /Museu Afro/)
  assert.equal((gate.searchParams.get('destination').match(/São Paulo/g) ?? []).length, 1, 'no duplica la ciudad en enlaces de ubicaciones que ya la incluyen')
  for (const link of [...day6, ...day7, ...day8]) {
    const url = new URL(link.url)
    assert.ok((url.searchParams.get('waypoints')?.split('|').length ?? 0) <= MAX_MOBILE_MAP_WAYPOINTS)
  }
  assert.deepEqual(directions(8, rowsFor(8).reverse()), [])
})


test('las geometrías de calles solo aparecen en el día y orden que las generaron', async () => {
  const routeData = JSON.parse(await readFile(new URL('../docs/data/map-routes.json', import.meta.url), 'utf8'))
  const routes = routeData.routes
  assert.equal(getMatchingCachedRoutes(routes, null, [10, 9], 2026, 2026).length, 0)
  assert.equal(getMatchingCachedRoutes(routes, 3, [10, 9], 2026, 2026).length, 1)
  assert.equal(getMatchingCachedRoutes(routes, 3, [10, 17, 9], 2026, 2026).length, 0)
  assert.equal(getMatchingCachedRoutes(routes, 3, [10, 9], 2027, 2026).length, 0)
  assert.equal(getMatchingCachedRoutes(routes, 5, [33], 2026, 2026).length, 1)
  assert.equal(getMatchingCachedRoutes(routes, 6, [30, 23, 16, 1, 21], 2026, 2026).length, 1)
  assert.equal(getMatchingCachedRoutes(routes, 7, [20, 26, 5, 28, 19, 24], 2026, 2026).length, 1)
  assert.equal(getMatchingCachedRoutes(routes, 7, [20, 19, 26, 28, 5, 24], 2026, 2026).length, 0)
  assert.equal(getMatchingCachedRoutes(routes, 8, [4, 13], 2026, 2026, ['park-ibirapuera']).length, 1)
  assert.equal(getMatchingCachedRoutes(routes, 8, [4, 13], 2026, 2026, []).length, 0)
  assert.equal(routes.some((route) => route.day === 8 && route.mode === 'car'), false)
  const day5 = routes.find((route) => route.day === 5)
  assert.equal(day5.mode, 'car')
  assert.equal(day5.placeIds[0], 33)
  assert.ok(day5.coordinates.length > 100)
  const day4Segment = routes.find((route) => route.day === 4)
  assert.deepEqual(day4Segment.placeIds, [18, 25])
  assert.equal(day4Segment.subroute, true)
  assert.ok(day4Segment.coordinates.length > 100)
  assert.ok(routes.every((route) => route.coordinates.length >= 2))
  const day4 = routes.find((route) => route.day === 4)
  assert.ok(day4.coordinates.length > 100)
  assert.equal(day4.coordinates[0].length, 2)
  assert.equal(day4.coordinates.at(-1).length, 2)
  const day7 = routes.find((route) => route.day === 7)
  assert.deepEqual(day7.placeIds, [26, 5, 28, 19, 24])
  assert.ok(day7.coordinates.length > 100)
})
