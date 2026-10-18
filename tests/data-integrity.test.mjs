import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createMapsRouteSegments, MAX_MOBILE_MAP_WAYPOINTS } from '../lib/maps-routes.ts'
import { getMapDirectionChanges, getMapDirections, getMapPendingRows, getMapRouteNeedsReview, getMapSequenceChanged, getMapStopRows, getMatchingCachedRoutes, isMapAttractionRow } from '../lib/map-itinerary.ts'

const spFile = new URL('../docs/data/itinerario.json', import.meta.url)
const rioFile = new URL('../docs/data/itinerario-rio.json', import.meta.url)

test('el catálogo conserva las fichas y mantiene LEGO separado por ciudad', async () => {
  const sp = JSON.parse(await readFile(new URL('../docs/data/lugares-sao-paulo.json', import.meta.url), 'utf8')).places
  const rio = JSON.parse(await readFile(new URL('../docs/data/lugares-rio.json', import.meta.url), 'utf8')).places
  assert.equal(sp.length, 41)
  assert.equal(rio.length, 20)
  assert.equal(sp.find((place) => place.id === 40).name, 'LEGO Store Moema')
  assert.equal(sp.find((place) => place.id === 41).coordinates.confidence, 'aproximada-fuente-oficial')
  assert.equal(rio.find((place) => place.id === 120).name, 'LEGO Store · Shopping Leblon')
  assert.ok(!rio.some((place) => place.id === 40))
})

test('el mapa muestra filas oficiales por fecha, incluidas pendientes, sin aplicar overrides personales', async () => {
  const trip = JSON.parse(await readFile(spFile, 'utf8'))
  assert.deepEqual(getMapStopRows(trip.rows, 5, {}, 2026, 2026).map((row) => row.placeId), [33])
  assert.deepEqual(getMapStopRows(trip.rows, 6, {}, 2026, 2026).map((row) => row.placeId), [30, 23, 16, 1, 21, 41])
  assert.deepEqual(getMapStopRows(trip.rows, 7, { 16: 7 }, 2026, 2026).map((row) => row.placeId), [20, 26, 5, 28, 19, 24])
  assert.deepEqual(getMapStopRows(trip.rows, 8, {}, 2026, 2026).map((row) => row.placeId), [4, 13, 40])
  assert.equal(getMapDirectionChanges(trip.rows, { [trip.rows.find((row) => row.placeId === 16).id]: { transport: 'Uber' } }, { 16: 7 }, 2026, 2026, 7), false)
  assert.equal(getMapSequenceChanged(trip.rows, 6, { 16: 3 }, 2026, 2026, { 16: { startTime: '08:00', durationMinutes: 30, travelMinutes: 0, bufferMinutes: 0 } }), false)
  assert.equal(getMapRouteNeedsReview(trip.rows, {}, { 16: 7 }, 2026, 2026, 7, {}), false)
  assert.deepEqual(getMapStopRows(trip.rows, 5, {}, 2027, 2026).map((row) => row.placeId), [33], 'el año personal legado no oculta el mapa oficial Docs 2026')
})

test('las rutas no inventan un recorrido para el día de metro y aceptan solo secuencias verificadas', async () => {
  const trip = JSON.parse(await readFile(spFile, 'utf8'))
  const endpoints = { cantareira: 'Portão 1, Rua do Horto, 931, São Paulo', botanicGarden: 'Jardim Botânico de São Paulo, Avenida Miguel Estéfano 3031', afroGate: 'Portão 10, Parque Ibirapuera, São Paulo', park: 'Parque Ibirapuera, São Paulo' }
  const rows = (day) => getMapStopRows(trip.rows, day, {}, 2026, 2026).filter((row) => row.placeId).map((row) => ({ id: row.placeId, label: row.placeLabel, transport: row.transport }))
  assert.deepEqual(getMapDirections(3, rows(3), trip.mapBase.name, endpoints), [])
  const dayFourLinks = getMapDirections(4, rows(4), trip.mapBase.name, endpoints)
  assert.ok(dayFourLinks.some((link) => link.mode === 'walking' && new URL(link.url).searchParams.get('destination')?.includes('Vila')))
  assert.ok(dayFourLinks.every((link) => link.mode !== 'driving'))
  assert.ok(getMapDirections(6, rows(6), trip.mapBase.name, endpoints).some((link) => new URL(link.url).searchParams.get('destination')?.includes('Farol Santander')))
  assert.ok(getMapDirections(7, rows(7), trip.mapBase.name, endpoints).length > 0)
  assert.deepEqual(getMapDirections(8, rows(8), trip.mapBase.name, endpoints), [], 'LEGO agrega una parada sin ruta diaria verificada; se conservan sus pines')
  assert.deepEqual(getMapDirections(7, rows(7).reverse(), trip.mapBase.name, endpoints), [])
})

test('las rutas cacheadas solo sobreviven cuando la selección coincide y siguen siendo móviles', async () => {
  const routeData = JSON.parse(await readFile(new URL('../docs/data/map-routes.json', import.meta.url), 'utf8'))
  const trip = JSON.parse(await readFile(spFile, 'utf8'))
  const endpoints = { cantareira: 'Portão 1, Rua do Horto, 931, São Paulo', botanicGarden: 'Jardim Botânico de São Paulo, Avenida Miguel Estéfano 3031', afroGate: 'Portão 10, Parque Ibirapuera, São Paulo', park: 'Parque Ibirapuera, São Paulo' }
  const daySix = getMapStopRows(trip.rows, 6, {}, 2026, 2026).map((row) => row.placeId)
  const context = { rows: trip.rows, baseId: trip.mapBase.id, planningYear: trip.year }
  assert.equal(getMatchingCachedRoutes(routeData.routes, 6, daySix, 2026, 2026, [], context).length, 2, 'la caché actualizada conserva el tramo Docs a pie y el tramo Farol sugerido')
  assert.equal(getMatchingCachedRoutes(routeData.routes, 6, [...daySix].reverse(), 2026, 2026, [], context).length, 0)
  assert.equal(getMatchingCachedRoutes(routeData.routes, 4, [18, 25, 9], 2027, 2026, [], context).filter((route) => route.mode === 'foot').length, 1, 'el tramo regenerado a pie sigue visible aunque mi año personal sea 2027')
  assert.equal(getMatchingCachedRoutes(routeData.routes, 4, [18, 25, 9], 2026, 2026, [], context).some((route) => route.mode === 'car'), false, 'la geometría car heredada del día 4 no vuelve por la caché')
  assert.equal(getMatchingCachedRoutes(routeData.routes, 6, daySix, 2027, 2026, [], context).length, 2, 'día 6 conserva el tramo Docs a pie y el tramo Farol sugerido')
  const vilaUberRows = trip.rows.map((row) => row.placeId === 25 ? { ...row, transport: 'Uber' } : row)
  const vilaUberContext = { ...context, rows: vilaUberRows }
  assert.equal(getMatchingCachedRoutes(routeData.routes, 4, [18, 25, 9], 2026, 2026, [], vilaUberContext).some((route) => route.mode === 'foot'), false, 'cambiar Vila a Uber invalida la caché peatonal aunque conserve IDs y orden')
  const vilaUberLinks = getMapDirections(4, vilaUberRows.filter((row) => row.date.endsWith('-12-04') && row.placeId).map((row) => ({ id: row.placeId, label: row.placeLabel, transport: row.transport })), trip.mapBase.name, endpoints)
  assert.equal(vilaUberLinks.some((link) => link.mode === 'walking' && new URL(link.url).searchParams.get('destination')?.includes('Vila')), false, 'Uber no conserva el enlace a pie según Docs hacia Vila')
  assert.ok(vilaUberLinks.some((link) => link.mode === 'driving' && new URL(link.url).searchParams.get('destination')?.includes('Vila')), 'Uber deriva un enlace vial actual hacia Vila')
  const farolUberRows = trip.rows.map((row) => row.placeId === 41 ? { ...row, transport: 'Uber' } : row)
  const farolUberContext = { ...context, rows: farolUberRows }
  assert.equal(getMatchingCachedRoutes(routeData.routes, 6, daySix, 2026, 2026, [], farolUberContext).some((route) => route.suggested === true), false, 'Uber invalida el tramo Farol sugerido a pie')
  const farolUberLinks = getMapDirections(6, farolUberRows.filter((row) => row.date.endsWith('-12-06') && row.placeId).map((row) => ({ id: row.placeId, label: row.placeLabel, transport: row.transport })), trip.mapBase.name, endpoints)
  assert.equal(farolUberLinks.some((link) => link.mode === 'walking' && new URL(link.url).searchParams.get('destination')?.includes('Farol')), false, 'Uber no conserva el enlace peatonal sugerido hacia Farol')
  for (const route of routeData.routes) {
    const url = new URL(route.sourceUrl ?? 'https://example.test')
    assert.ok(url.protocol === 'https:' || route.sourceUrl === undefined)
    assert.ok(route.coordinates.every(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon)))
  }
  const segments = createMapsRouteSegments(Array.from({ length: 11 }, (_, index) => `Lugar ${index + 1}`))
  assert.deepEqual(segments.map((segment) => segment.placeCount), [5, 5, 3])
  assert.ok(segments.every((segment) => (new URL(segment.url).searchParams.get('waypoints')?.split('|').length ?? 0) <= MAX_MOBILE_MAP_WAYPOINTS))
})

test('la base de Río prioriza Hospedaria Rio pendiente y no presenta Injoy como base', async () => {
  const rio = JSON.parse(await readFile(rioFile, 'utf8'))
  assert.equal(rio.mapBase.id, 'hospedaria-rio')
  assert.match(rio.mapBase.name, /Hospedaria Rio/)
  assert.match(rio.mapBase.status, /No reservado.*pendiente de reservar/)
  assert.match(rio.mapBase.sourceUrl, /hospedariario\.com\.br/)
  assert.ok(rio.optionalItems.some((item) => /Injoy/i.test(item.title)))
  assert.ok(rio.mapDirections.every((day) => day.legs.every((leg) => !/Injoy/i.test(`${leg.from} ${leg.to}`))))
  assert.deepEqual(getMapStopRows(rio.rows, 10, {}, 2026, 2026).map((row) => row.placeId), [119, 102, 109])
  assert.ok(rio.rows.find((row) => row.placeId === 119).cellLinks.Notas.some((url) => /paineirascorcovado/.test(url)))
  const day10 = rio.mapDirections.find((day) => day.day === 10)
  assert.doesNotMatch(JSON.stringify(day10.legs), /Cosme Velho|Corcovado/i)
  assert.doesNotMatch(JSON.stringify(rio.mapDirections.find((day) => day.day === 13).legs), /Pacheco Leão 915|Cachoeiras do Horto/i)
  assert.equal(rio.optionalItems.some((item) => /915/.test(JSON.stringify(item))), false)
  assert.ok(rio.optionalItems.some((item) => /Cosme Velho/.test(item.title) && item.applyToAgenda === false))
  assert.equal(rio.optionalItems.some((item) => /Pacheco Leão 915/.test(item.title)), false)
})

test('las filas oficiales sin placeId se calculan antes del filtro y excluyen logística/comidas', async () => {
  const rio = JSON.parse(await readFile(rioFile, 'utf8'))
  assert.equal(rio.rows.find((row) => row.placeLabel?.startsWith('Mural Etnias'))?.placeId, 106)
  assert.deepEqual(getMapPendingRows(rio.rows, 11, {}, 2027, 2026).filter(isMapAttractionRow).map((row) => row.placeLabel), [])
  const unknown = [{ id: 'unknown', date: '2026-12-11', time: '', placeLabel: 'Atracción nueva', activity: 'Visita', transport: 'A pie', lodging: '', costLabel: '', reservation: '', notes: '', sourceLabel: 'Google Docs', status: 'propuesta', origin: 'docs' }]
  assert.equal(getMapPendingRows(unknown, 11, {}, 2027, 2026)[0].placeLabel, 'Atracción nueva')
  const meal = [{ ...unknown[0], id: 'meal', placeLabel: 'Liberdade', activity: 'Comida y descanso' }]
  assert.equal(isMapAttractionRow(meal[0]), false)
})
