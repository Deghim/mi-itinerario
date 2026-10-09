import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { groupItineraryRows, itinerary, itineraryDayTone, planAgendaApplication, proposedPlaceRows } from '../lib/itinerary-model.ts'
import { ITINERARY_OVERRIDES_KEY, readItineraryOverrides, writeItineraryOverrides } from '../lib/itinerary-storage.ts'

test('la tabla conserva vuelos capturados y distingue pago internacional del tramo doméstico', async () => {
  const raw = JSON.parse(await readFile(new URL('../docs/data/itinerario.json', import.meta.url), 'utf8'))
  const budget = JSON.parse(await readFile(new URL('../docs/data/presupuesto.json', import.meta.url), 'utf8'))
  assert.deepEqual(raw.columns, ['Fecha', 'Hora', 'Lugar', 'Actividad', 'Transporte', 'Hospedaje', 'Costo estimado', 'Reserva / boleto', 'Notas'])
  assert.equal(new Set(raw.rows.map((row) => row.id)).size, raw.rows.length)
  const flights = raw.rows.filter((row) => row.id.startsWith('flight-'))
  assert.equal(flights.length, 3)
  const domestic = raw.rows.find((row) => row.id === 'flight-cuu-mex-2026-12-02')
  assert.equal(domestic?.budgetId, undefined)
  assert.equal(domestic?.costLabel, 'Importe por confirmar')
  assert.match(domestic?.reservation ?? '', /Pago e inclusión.*por confirmar/)
  const international = raw.rows.filter((row) => ['flight-mex-rdom-2026-12-02', 'flight-rdom-sp-2026-12-03', 'international-return-2026-12-23'].includes(row.id))
  assert.equal(international.length, 3)
  assert.ok(international.every((row) => row.budgetId === 'paid:international-round-trip'))
  assert.ok(international.every((row) => row.costLabel === 'Vuelos internacionales pagados · importe por informar'))
  assert.ok(international.every((row) => !/mismo boleto|boleto redondo pagado|un registro/i.test(`${row.reservation} ${row.costLabel}`)))
  const paidFlights = budget.paidItems.find((item) => item.id === 'international-round-trip')
  assert.equal(paidFlights?.status, 'pagado')
  assert.equal(paidFlights?.amount, null)
  assert.equal(budget.paidItems.filter((item) => item.id === 'international-round-trip').length, 1)
  assert.equal(raw.year, 2026)
  assert.equal(raw.yearIsAssumption, true)
  assert.equal(raw.rioNightsPreferred, 5)
})

test('cobertura conserva 36 referencias únicas: 33 borradores visitables y tres históricas', () => {
  assert.equal(itinerary.coverage.length, 36)
  assert.deepEqual(itinerary.coverage.map((item) => item.placeId), Array.from({ length: 36 }, (_, index) => index + 1))
  assert.equal(itinerary.coverage.filter((item) => item.placeId <= 33 && item.state !== 'historico').length, 33)
  assert.deepEqual(itinerary.coverage.filter((item) => item.state === 'historico').map((item) => item.placeId), [34, 35, 36])
  assert.equal(itinerary.coverage.filter((item) => item.placeId === 9).length, 1)
  const scheduledIds = proposedPlaceRows().map((row) => row.placeId)
  assert.equal(new Set(scheduledIds).size, scheduledIds.length)
  assert.ok(!proposedPlaceRows().some((row) => row.id === 'place-09-exterior-day-03'))
})

test('aplicar propuesta respeta asignación/horario manual y deja vuelos y filas exteriores fuera de la agenda', () => {
  const manualSchedule = { startTime: '08:45', durationMinutes: 50, travelMinutes: 10, bufferMinutes: 10 }
  const currentAssignments = { 10: 8 }
  const currentSchedules = { 10: manualSchedule }
  const places = Array.from({ length: 36 }, (_, index) => ({ id: index + 1 }))
  const result = planAgendaApplication(places, itinerary.rows, currentAssignments, currentSchedules)

  assert.ok(result.skippedManual.includes(10))
  assert.equal(result.dayAssignments[10], 8)
  assert.deepEqual(result.placeSchedule[10], manualSchedule)
  assert.ok(result.added.includes(9))
  assert.equal(result.dayAssignments[9], 4)
  assert.equal(itinerary.rows.filter((row) => row.placeId === 9 && row.applyToAgenda === true).length, 1)
  assert.equal(itinerary.rows.find((row) => row.id === 'place-09-exterior-day-03')?.applyToAgenda, false)
  assert.equal(currentAssignments[10], 8)
  assert.deepEqual(currentSchedules[10], manualSchedule)
  assert.ok(result.added.length > 0)

  const secondApply = planAgendaApplication(places, itinerary.rows, result.dayAssignments, result.placeSchedule)
  assert.equal(secondApply.added.length, 0)
  assert.ok(secondApply.skippedManual.length > 0)
})

test('las ventanas de visitas 4–8 respetan carrera opcional o desayuno antes de traslados', () => {
  const toMinutes = (value) => {
    const [hour, minute] = value.split(':').map(Number)
    return hour * 60 + minute
  }
  const morningVisits = itinerary.rows.filter((row) => {
    const day = Number(row.date.slice(8, 10))
    return row.placeId !== undefined && row.schedule && row.applyToAgenda === true && day >= 4 && day <= 8
  })
  assert.ok(morningVisits.length > 0)
  for (const row of morningVisits.filter((item) => item.runMode !== 'skip-proposed')) {
    const earliestDeparture = toMinutes(row.schedule.startTime) - row.schedule.travelMinutes - row.schedule.bufferMinutes
    assert.ok(earliestDeparture >= 9 * 60, `${row.id} reserva traslado antes del fin del desayuno`)
  }
  const cantareira = morningVisits.find((row) => row.placeId === 33)
  assert.equal(cantareira?.schedule.startTime, '09:00')
  assert.equal(cantareira?.runMode, 'skip-proposed')
  assert.equal(toMinutes(cantareira.schedule.startTime) - cantareira.schedule.travelMinutes - cantareira.schedule.bufferMinutes, 7 * 60 + 30)
  assert.match(cantareira.notes, /sustituye la carrera.*opcional/i)
  assert.equal(morningVisits.find((row) => row.placeId === 4)?.schedule.startTime, '10:30')
  assert.equal(morningVisits.find((row) => row.placeId === 13)?.schedule.startTime, '15:00')
})

test('la tabla agrupa y filtra por fecha efectiva sin duplicar filas ni reinterpretar otro año', () => {
  const rows = itinerary.rows
  const moved = rows.find((row) => row.placeId === 33)
  assert.ok(moved)
  const state = { travelYear: 2026, dayAssignments: { 33: 3 } }
  const groups = groupItineraryRows(rows, state, 2026)
  const flattened = groups.flatMap((group) => group.rows)
  assert.equal(flattened.length, rows.length)
  assert.equal(new Set(flattened.map((row) => row.id)).size, rows.length)
  assert.deepEqual(groups.map((group) => group.date), [...groups.map((group) => group.date)].sort())
  const dayThree = groups.find((group) => group.date === '2026-12-03')
  assert.ok(dayThree?.rows.includes(moved))
  assert.equal(groupItineraryRows(rows, state, 2026, 3)[0].rows.length, dayThree.rows.length)
  assert.equal(groupItineraryRows(rows, state, 2026, 5).some((group) => group.rows.includes(moved)), false)
  assert.equal(groupItineraryRows(rows, { ...state, travelYear: 2027 }, 2026).find((group) => group.date === '2026-12-05')?.rows.includes(moved), true)
  assert.equal(itineraryDayTone('2026-12-03'), itineraryDayTone('2026-12-03'))
  assert.equal(new Set(Array.from({ length: 7 }, (_, index) => itineraryDayTone(`2026-12-${String(index + 2).padStart(2, '0')}`))).size, 7)
})

test('los cambios editoriales locales solo aceptan campos y filas conocidas', () => {
  const storage = new Map([
    ['mi-itinerario:sao-paulo:v1', JSON.stringify({ favorites: [2], dayAssignments: { 2: 5 } })],
    ['mi-itinerario:budget:v1', JSON.stringify({ rioNights: 5, entries: [] })],
  ])
  const tripBefore = storage.get('mi-itinerario:sao-paulo:v1')
  const budgetBefore = storage.get('mi-itinerario:budget:v1')
  const adapter = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
  const first = itinerary.rows[0]
  writeItineraryOverrides(adapter, ITINERARY_OVERRIDES_KEY, { [first.id]: { notes: '  Nota local  ', transport: 'Metro', secret: 'no debe guardarse' }, 'unknown-row': { notes: 'Ignorar' } }, itinerary.rows)
  assert.deepEqual(JSON.parse(storage.get(ITINERARY_OVERRIDES_KEY)), { [first.id]: { transport: 'Metro', notes: 'Nota local' } })
  assert.deepEqual(readItineraryOverrides(adapter, ITINERARY_OVERRIDES_KEY, itinerary.rows), { [first.id]: { transport: 'Metro', notes: 'Nota local' } })
  assert.equal(storage.get('mi-itinerario:sao-paulo:v1'), tripBefore)
  assert.equal(storage.get('mi-itinerario:budget:v1'), budgetBefore)
  adapter.setItem(ITINERARY_OVERRIDES_KEY, '{broken')
  assert.deepEqual(readItineraryOverrides(adapter, ITINERARY_OVERRIDES_KEY, itinerary.rows), {})
})
