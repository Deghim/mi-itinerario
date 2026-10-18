import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { groupItineraryRows, itinerary, itineraryDayTone, planAgendaApplication } from '../lib/itinerary-model.ts'
import { ITINERARY_OVERRIDES_KEY, readItineraryOverrides, writeItineraryOverrides } from '../lib/itinerary-storage.ts'
import { readTripState } from '../lib/trip-storage.ts'

test('la fuente Docs conserva las 8 columnas, filas vacías y estado provisional', async () => {
  const raw = JSON.parse(await readFile(new URL('../docs/data/itinerario.json', import.meta.url), 'utf8'))
  const rio = JSON.parse(await readFile(new URL('../docs/data/itinerario-rio.json', import.meta.url), 'utf8'))
  assert.deepEqual(raw.columns, ['Fecha', 'Hora', 'Lugar', 'Actividad', 'Transporte', 'Costo', 'Reserva/boleto', 'Notas'])
  assert.equal(raw.rows.length + rio.rows.length, 65)
  assert.equal(rio.rows.filter((row) => !row.time && !row.placeLabel && !row.activity && !row.transport && !row.costLabel && !row.reservation && !row.notes).length, 6)
  assert.ok(raw.rows.every((row) => row.origin === 'docs' && row.applyToAgenda === false && row.lodging === ''))
  assert.ok(raw.rows.some((row) => row.costLabel === 'R$23-45'))
  const cantareira = raw.rows.filter((row) => row.placeId === 33)
  assert.equal(cantareira.length, 2)
  assert.ok(cantareira.every((row) => row.time === '09:00 - 14:00' && row.costLabel === 'R$30-60'))
  const farol = raw.rows.find((row) => row.placeLabel === 'Mirador del Farol Santander')
  assert.equal(farol?.time, '16:30 - 17:30')
  assert.equal(farol?.placeId, 41)
  assert.equal(farol?.status, 'pendiente')
  assert.equal(raw.year, 2026)
  assert.equal(raw.yearIsAssumption, true)
  assert.equal(raw.sync.mode, 'manual')
  assert.ok(raw.sync.snapshotHash)
})

test('las notas fuera de tabla son opcionales, conservan enlaces y no entran en agenda', async () => {
  const raw = JSON.parse(await readFile(new URL('../docs/data/itinerario.json', import.meta.url), 'utf8'))
  const rio = JSON.parse(await readFile(new URL('../docs/data/itinerario-rio.json', import.meta.url), 'utf8'))
  const notes = raw.docNotes.filter((note) => note.section === 'postamble')
  assert.ok(notes.some((note) => note.text.includes('Walter Galera')))
  assert.ok(notes.some((note) => note.text.includes('Open Doors') && note.links.length === 1))
  assert.ok(raw.optionalItems.some((item) => item.title.includes('Martinelli')))
  assert.ok(raw.optionalItems.every((item) => item.applyToAgenda === false))
  assert.equal(rio.mapBase.id, 'hospedaria-rio')
  assert.match(rio.mapBase.status, /pendiente de reservar/)
  assert.ok(rio.optionalItems.some((item) => item.title.includes('Injoy')))
})

test('la agenda no aplica automáticamente filas oficiales ni deja que overrides muevan sus fechas', () => {
  const places = Array.from({ length: 40 }, (_, index) => ({ id: index + 1 }))
  const result = planAgendaApplication(places, itinerary.rows, { 16: 8 }, { 16: { startTime: '08:45', durationMinutes: 50, travelMinutes: 10, bufferMinutes: 10 } })
  assert.deepEqual(result.added, [])
  assert.equal(result.dayAssignments[16], 8)
  assert.equal(itinerary.rows.every((row) => row.applyToAgenda === false), true)
  const grouped = groupItineraryRows(itinerary.rows, { travelYear: 2026, dayAssignments: { 16: 3 } }, 2026)
  assert.ok(grouped.find((group) => group.date === '2026-12-06')?.rows.some((row) => row.placeId === 16))
  assert.equal(grouped.find((group) => group.date === '2026-12-03')?.rows.some((row) => row.placeId === 16), false)
})

test('la agrupación conserva cada fila y las fechas 15–20 sin inventar actividades', async () => {
  const rows = JSON.parse(await readFile(new URL('../docs/data/itinerario-rio.json', import.meta.url), 'utf8')).rows
  const groups = groupItineraryRows(rows, { travelYear: 2026, dayAssignments: {} }, 2026)
  const flattened = groups.flatMap((group) => group.rows)
  assert.equal(flattened.length, rows.length)
  assert.equal(new Set(flattened.map((row) => row.id)).size, rows.length)
  for (let day = 15; day <= 20; day += 1) {
    const group = groups.find((item) => item.date === `2026-12-${day}`)
    assert.equal(group?.rows.length, 1)
    assert.equal(group.rows[0].activity, '')
  }
  assert.equal(new Set(Array.from({ length: 7 }, (_, index) => itineraryDayTone(`2026-12-${String(index + 2).padStart(2, '0')}`))).size, 7)
})

test('la persistencia local valida filas conocidas y no borra otros estados', () => {
  const storage = new Map([['mi-itinerario:budget:v1', JSON.stringify({ entries: [] })]])
  const adapter = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
  const first = itinerary.rows[0]
  writeItineraryOverrides(adapter, ITINERARY_OVERRIDES_KEY, { [first.id]: { notes: '  Nota local  ', transport: 'Metro', secret: 'no debe guardarse' }, 'unknown-row': { notes: 'Ignorar' } }, itinerary.rows)
  assert.deepEqual(readItineraryOverrides(adapter, ITINERARY_OVERRIDES_KEY, itinerary.rows), { [first.id]: { transport: 'Metro', notes: 'Nota local' } })
  assert.ok(storage.has('mi-itinerario:budget:v1'))
  adapter.setItem(ITINERARY_OVERRIDES_KEY, '{broken')
  assert.deepEqual(readItineraryOverrides(adapter, ITINERARY_OVERRIDES_KEY, itinerary.rows), {})
})

test('el estado personal legado conserva favoritos, asignaciones y año sin sustituir la fuente Docs', () => {
  const storage = new Map([['mi-itinerario:sao-paulo:v1', JSON.stringify({ favorites: [41], placeStates: { 41: 'guardado' }, dayAssignments: { 41: 7 }, travelYear: 2027, updatedAt: 'legacy' })]])
  const adapter = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
  const state = readTripState(adapter, 'mi-itinerario:sao-paulo:v1', { favorites: [], placeStates: {}, dayAssignments: {}, travelYear: 2026, updatedAt: '' }, [41])
  assert.deepEqual(state.favorites, [41])
  assert.equal(state.placeStates[41], 'guardado')
  assert.equal(state.dayAssignments[41], 7)
  assert.equal(state.travelYear, 2027)
})
