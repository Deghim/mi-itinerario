import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readTripState } from '../lib/trip-storage.ts'
import { createMapsRouteSegments, MAX_MOBILE_MAP_WAYPOINTS } from '../lib/maps-routes.ts'

const placesFile = new URL('../docs/data/lugares-sao-paulo.json', import.meta.url)
const tripFile = new URL('../docs/data/viaje.json', import.meta.url)

test('el catálogo conserva 36 registros únicos y fichas de fuente', async () => {
  const data = JSON.parse(await readFile(placesFile, 'utf8'))
  assert.equal(data.places.length, 36)
  assert.deepEqual(new Set(data.places.map((place) => place.id)).size, 36)
  assert.ok(data.places.every((place) => place.atlasUrl.startsWith('https://www.atlasobscura.com/places/')))
  assert.ok(data.places.every((place) => place.verification === 'pendiente'))
  assert.ok(data.places.every((place) => place.operationalStatus === 'por-confirmar'))
  assert.ok(data.places.every((place) => ['por-confirmar', 'aproximada-fuente-atlas'].includes(place.coordinates.confidence)))
  assert.equal(data.places.find((place) => place.id === 6).zone, 'Sur')
  assert.deepEqual(data.places.find((place) => place.id === 6).coordinates, { lat: -23.6162, lon: -46.720104, confidence: 'aproximada-fuente-atlas' })
  assert.deepEqual(data.places.find((place) => place.id === 32).coordinates, { lat: -23.586479, lon: -46.682078, confidence: 'aproximada-fuente-atlas' })
  assert.equal(data.places.filter((place) => place.statusFromDraft === 'marcado-visitables').length, 33)
  assert.equal(data.places.filter((place) => place.statusFromDraft === 'marcado-cerrado-o-historico').length, 3)
})

test('el calendario conserva las fechas recibidas sin convertir las propuestas en reservas', async () => {
  const trip = JSON.parse(await readFile(tripFile, 'utf8'))
  assert.equal(trip.yearIsAssumption, true)
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
