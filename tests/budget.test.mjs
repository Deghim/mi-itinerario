import test from 'node:test'
import assert from 'node:assert/strict'
import { applyBudgetOverrides, calculateBudgetScenario, calculateBudgetTotals, filterBudgetEntriesByCity, filterBudgetEntriesWithoutCity, getBudgetScenario, getDefaultBudgetState, resolveBudgetEntryCity } from '../lib/budget-model.ts'
import { BUDGET_STORAGE_KEY, readBudgetState, writeBudgetState } from '../lib/budget-storage.ts'
import { readTripState } from '../lib/trip-storage.ts'
import { calculateEndTime, findScheduleConflicts, parseDailyRoutine, parsePlaceScheduleMap, sortAssignedPlaces, timeToMinutes } from '../lib/schedule.ts'

const scenarios = [4, 5]
const lodgingVariants = ['privado-basico', 'privado-ensuite', 'compartido', 'mixto']

test('cada comparación conserva 20 noches y el autobús no aplica ahorro automático', () => {
  for (const rioNights of scenarios) {
    for (const lodgingScenario of lodgingVariants) {
      const base = calculateBudgetScenario({ rioNights, lodgingScenario, rioTransferChoice: 'por-decidir' })
      assert.equal(base.filter((row) => row.category === 'alojamiento').reduce((sum, row) => sum + row.quantity, 0), 20)
      const bus = calculateBudgetScenario({ rioNights, lodgingScenario, rioTransferChoice: 'autobus' })
      assert.equal(bus.filter((row) => row.category === 'alojamiento').reduce((sum, row) => sum + row.quantity, 0), 20)
      assert.equal(bus.filter((row) => row.category === 'alojamiento').length, lodgingScenario === 'mixto' ? 7 : 4)
    }
  }
})

test('la alternativa mixta reparte 10 noches privadas y 10 compartidas, sin sumar las otras alternativas', () => {
  for (const rioNights of scenarios) {
    const rows = calculateBudgetScenario({ rioNights, lodgingScenario: 'mixto', rioTransferChoice: 'por-decidir' })
    const lodging = rows.filter((row) => row.category === 'alojamiento')
    const privateNights = lodging.filter((row) => row.unit === 'cuarto/noche' || row.unit === 'suite/noche').reduce((sum, row) => sum + row.quantity, 0)
    const sharedNights = lodging.filter((row) => row.unit === 'cama/persona/noche').reduce((sum, row) => sum + row.quantity, 0)
    assert.equal(privateNights, 10)
    assert.equal(sharedNights, 10)
    assert.equal(lodging.length, 7)
  }
})

test('el traslado del 9 dic incluye conexiones una sola vez y no usa la búsqueda aérea sin horario', () => {
  const fourNightBus = calculateBudgetScenario({ rioNights: 4, lodgingScenario: 'privado-basico', rioTransferChoice: 'autobus' }).find((row) => row.category === 'traslados')
  const fiveNightBus = calculateBudgetScenario({ rioNights: 5, lodgingScenario: 'privado-basico', rioTransferChoice: 'autobus' }).find((row) => row.category === 'traslados')
  assert.equal(fourNightBus?.amount, 148.29)
  assert.equal(fourNightBus?.status, 'estimado')
  assert.equal(fourNightBus?.removesLodgingNight, undefined)
  assert.match(fourNightBus?.assumption ?? '', /R\$129,99.*R\$18,30.*R\$148,29/)
  assert.equal(fourNightBus?.date, '2026-12-10')
  const fourNightStay = calculateBudgetScenario({ rioNights: 4, lodgingScenario: 'privado-basico', rioTransferChoice: 'autobus' }).find((row) => row.id.endsWith(':sp-initial'))
  assert.equal(fourNightStay?.quantity, 7)
  assert.equal(fourNightStay?.tripLeg, '3–9 dic')
  assert.equal(fiveNightBus?.amount, 198.21)
  assert.equal(fiveNightBus?.unitAmount, 198.21)
  assert.equal(fiveNightBus?.status, 'cotizado')
  assert.equal(fiveNightBus?.date, '2026-12-09')
  assert.equal(fiveNightBus?.removesLodgingNight, undefined)
  assert.match(fiveNightBus?.assumption ?? '', /R\$12,90 ya está incluido/)
  assert.match(fiveNightBus?.assumption ?? '', /R\$148,29/)
  assert.equal(calculateBudgetScenario({ rioNights: 5, lodgingScenario: 'privado-basico', rioTransferChoice: 'autobus' }).filter((row) => row.tripLeg === 'Sao Paulo-Rio').length, 1)
  const fiveNightFlight = calculateBudgetScenario({ rioNights: 5, lodgingScenario: 'privado-basico', rioTransferChoice: 'avion' }).find((row) => row.category === 'traslados')
  assert.equal(fiveNightFlight?.amount, 217)
  assert.equal(fiveNightFlight?.status, 'cotizado')
  assert.equal(fiveNightFlight?.departureTime, '21:15')
  assert.equal(fiveNightFlight?.arrivalTime, '22:15')
  assert.match(fiveNightFlight?.assumption ?? '', /Llega tarde/)
  assert.equal(fiveNightFlight?.date, '2026-12-09')
  assert.equal(getDefaultBudgetState().rioNights, 5)
})

test('el vuelo internacional pagado sin importe no se convierte en cero ni se suma al pendiente', () => {
  const rows = calculateBudgetScenario({ rioNights: 4, lodgingScenario: 'privado-basico', rioTransferChoice: 'por-decidir' })
  const paid = rows.find((row) => row.id === 'paid:international-round-trip')
  assert.equal(paid?.status, 'pagado')
  assert.equal(paid?.amount, null)
  const totals = calculateBudgetTotals(rows, 3.63)
  assert.equal(totals.paidTotalMxn, 0)
  assert.ok(totals.unpricedPending > 0)
  assert.equal(totals.paidKnownCount, 0)
  assert.equal(totals.unpricedPaid, 1)
  assert.equal(totals.pendingKnownMxn, (8 * 135 + 4 * 200 + 8 * 150) * 3.63)
})

test('el filtro de ciudad mantiene el traslado y hospedaje de Río fuera del subtotal de São Paulo', () => {
  const rows = calculateBudgetScenario({ rioNights: 5, lodgingScenario: 'privado-basico', rioTransferChoice: 'autobus' })
  const sp = filterBudgetEntriesByCity(rows, 'sao-paulo')
  const rio = filterBudgetEntriesByCity(rows, 'rio')
  assert.ok(sp.every((row) => row.city === 'sao-paulo'))
  assert.ok(rio.every((row) => row.city === 'rio'))
  assert.equal(sp.some((row) => row.id === 'paid:international-round-trip'), false, 'el vuelo internacional sigue en Sin ciudad / viaje')
  assert.ok(rio.some((row) => row.tripLeg === 'Sao Paulo-Rio'))
  assert.equal(sp.some((row) => row.name.startsWith('Río')), false)
  assert.equal(rio.some((row) => row.name.startsWith('São Paulo')), false)
  assert.equal(sp.some((row) => rio.some((rioRow) => rioRow.id === row.id)), false)
})

test('la cotización Injoy solo aplica a privado ensuite cinco noches, no a compartido ni mixto', () => {
  assert.equal(getBudgetScenario(5).spInitialNights, 6)
  assert.match(getBudgetScenario(5).note, /São Paulo.*3–8.*checkout el 8.*custodia.*no se aplica automáticamente/)
  const rows = calculateBudgetScenario({ rioNights: 5, lodgingScenario: 'privado-ensuite', rioTransferChoice: 'autobus' })
  const rio = filterBudgetEntriesByCity(rows, 'rio')
  const stay = rio.filter((row) => row.category === 'alojamiento' && row.city === 'rio')
  assert.equal(stay.length, 1)
  assert.equal(stay[0].amount, 1822)
  assert.equal(stay[0].quantity, 5)
  assert.equal(stay[0].status, 'cotizado')
  assert.match(stay[0].assumption ?? '', /R\$2\.013/)
  const transfer = rio.filter((row) => row.tripLeg === 'Sao Paulo-Rio')
  assert.equal(transfer.length, 1)
  const saoPauloStay = rows.find((row) => row.name === 'São Paulo · estancia inicial')
  assert.equal(saoPauloStay?.quantity, 6, 'el bus de las 00:05 del 9 no descuenta automáticamente la noche del 8')
  assert.equal(saoPauloStay?.tripLeg, '3–8 dic')
  assert.equal(saoPauloStay?.lodgingAllocation, '6 noches')
  const totals = calculateBudgetTotals(rio, 3.6304)
  assert.equal(Math.round(totals.pendingKnownBrl * 100) / 100, 2020.21)
  const shared = calculateBudgetScenario({ rioNights: 5, lodgingScenario: 'compartido', rioTransferChoice: 'por-decidir' }).find((row) => row.id.endsWith(':rio'))
  assert.equal(shared?.amount, 400)
  assert.equal(shared?.status, 'estimado')
  assert.doesNotMatch(shared?.sourceLabel ?? '', /Injoy/)
  const mixed = calculateBudgetScenario({ rioNights: 5, lodgingScenario: 'mixto', rioTransferChoice: 'por-decidir' }).filter((row) => row.city === 'rio' && row.category === 'alojamiento')
  assert.equal(mixed.length, 2)
  assert.ok(mixed.every((row) => row.status === 'estimado' && !/Injoy/.test(row.sourceLabel ?? '')))
  const basic = calculateBudgetScenario({ rioNights: 5, lodgingScenario: 'privado-basico', rioTransferChoice: 'por-decidir' }).find((row) => row.id.endsWith(':rio'))
  assert.equal(basic?.amount, 1000)
  assert.equal(basic?.status, 'estimado')
})

test('asignación por ciudad y gastos antiguos sin ciudad: viaje completo los conserva y los cuenta una vez', () => {
  const rows = calculateBudgetScenario({ rioNights: 5, lodgingScenario: 'privado-basico', rioTransferChoice: 'por-decidir' })
  assert.equal(rows.find((row) => row.tripLeg === 'Sao Paulo-Rio')?.city, 'rio')
  assert.ok(rows.filter((row) => row.id.startsWith('lodging:') && row.id.includes(':sp-')).every((row) => row.city === 'sao-paulo'))
  assert.equal(rows.find((row) => row.id === 'unknown:food')?.city, undefined)
  assert.equal(rows.find((row) => row.id === 'unknown:local-transport')?.city, undefined)
  const oldFood = { id: 'unknown:food', recordKind: 'override', name: 'Comidas y bebidas', category: 'comida', amount: 240, unitAmount: 80, currency: 'BRL', quantity: 3, unit: 'día', status: 'estimado', city: 'rio' }
  const baseTransfer = rows.find((row) => row.tripLeg === 'Sao Paulo-Rio')
  const oldTransfer = { ...baseTransfer, amount: null, unitAmount: null, currency: null, city: 'sao-paulo' }
  const oldPaid = { id: 'paid:international-round-trip', recordKind: 'override', name: 'Vuelos internacionales · ida y vuelta · pagados', category: 'traslados', amount: null, unitAmount: null, currency: null, quantity: 1, unit: 'gasto agregado', status: 'pagado', city: 'sao-paulo' }
  const oldCustom = { id: 'custom:old', recordKind: 'custom', name: 'Gasto antiguo', category: 'otros', amount: 40, unitAmount: 40, currency: 'BRL', quantity: 1, unit: 'gasto', status: 'estimado' }
  const merged = applyBudgetOverrides(rows, [oldFood, oldTransfer, oldPaid, oldCustom])
  assert.equal(merged.find((row) => row.id === 'unknown:food')?.amount, 240)
  assert.equal(merged.find((row) => row.id === 'unknown:food')?.city, undefined)
  assert.equal(merged.find((row) => row.tripLeg === 'Sao Paulo-Rio')?.city, 'rio')
  assert.equal(merged.find((row) => row.id === 'paid:international-round-trip')?.city, undefined)
  assert.equal(merged.find((row) => row.id === 'custom:old')?.city, undefined)
  assert.equal(resolveBudgetEntryCity('unknown:food', rows, [oldFood], 'rio', false), undefined)
  assert.equal(resolveBudgetEntryCity(baseTransfer.id, rows, [oldTransfer], 'sao-paulo', false), 'rio')
  assert.equal(resolveBudgetEntryCity('custom:old', rows, [oldCustom], 'rio', false), undefined)
  assert.equal(resolveBudgetEntryCity('custom:new', rows, [], 'rio', true), 'rio')
  const sp = filterBudgetEntriesByCity(merged, 'sao-paulo')
  const rio = filterBudgetEntriesByCity(merged, 'rio')
  const global = filterBudgetEntriesWithoutCity(merged)
  assert.ok(global.some((row) => row.id === 'custom:old'))
  assert.ok(global.some((row) => row.id === 'unknown:food'))
  assert.ok(rio.some((row) => row.tripLeg === 'Sao Paulo-Rio'))
  const partition = [...sp, ...rio, ...global]
  assert.equal(partition.length, merged.length)
  assert.equal(new Set(partition.map((row) => row.id)).size, merged.length)
  const sumPartition = partition.reduce((sum, row) => sum + calculateBudgetTotals([row], 3.6304).pendingKnownMxn, 0)
  assert.equal(sumPartition, calculateBudgetTotals(merged, 3.6304).pendingKnownMxn)
})

test('el resumen de pagos distingue monto desconocido, cero real y mezcla de conocidos/desconocidos', () => {
  const unknown = { id: 'u', recordKind: 'override', name: 'Vuelo pagado', category: 'traslados', amount: null, unitAmount: null, currency: null, quantity: 1, unit: 'boleto', status: 'pagado' }
  const zero = { ...unknown, id: 'z', name: 'Pago con costo cero registrado', amount: 0, unitAmount: 0, currency: 'BRL' }
  const known = { ...unknown, id: 'k', name: 'Bus pagado', amount: 40, unitAmount: 40, currency: 'BRL' }
  const onlyUnknown = calculateBudgetTotals([unknown], 3.63)
  assert.equal(onlyUnknown.paidKnownCount, 0)
  assert.equal(onlyUnknown.unpricedPaid, 1)
  assert.equal(onlyUnknown.paidTotalMxn, 0)
  const realZero = calculateBudgetTotals([zero], 3.63)
  assert.equal(realZero.paidKnownCount, 1)
  assert.equal(realZero.unpricedPaid, 0)
  assert.equal(realZero.paidTotalMxn, 0)
  const mixed = calculateBudgetTotals([known, unknown], 3.63)
  assert.equal(mixed.paidKnownCount, 1)
  assert.equal(mixed.unpricedPaid, 1)
  assert.equal(mixed.paidTotalMxn, 145.2)
})

test('convierte BRL una vez y deja importes MXN sin conversión adicional', () => {
  const totals = calculateBudgetTotals([
    { id: 'a', recordKind: 'override', name: 'Bus', category: 'traslados', amount: 100, unitAmount: 100, currency: 'BRL', quantity: 1, unit: 'pasaje', status: 'cotizado' },
    { id: 'b', recordKind: 'custom', name: 'Gasto', category: 'otros', amount: 100, unitAmount: 100, currency: 'MXN', quantity: 1, unit: 'gasto', status: 'estimado' },
  ], 3.63)
  assert.equal(totals.pendingKnownMxn, 463)
  assert.equal(totals.knownTotalMxn, 463)
})

test('el nuevo presupuesto tiene clave separada y preserva los datos locales anteriores', () => {
  const store = new Map([
    ['mi-itinerario:sao-paulo:v1', JSON.stringify({ favorites: [2, 8], placeStates: { 2: 'guardado' }, dayAssignments: { 2: 5 }, travelYear: 2028 })],
  ])
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  }
  const legacyBefore = storage.getItem('mi-itinerario:sao-paulo:v1')
  const trip = readTripState(storage, 'mi-itinerario:sao-paulo:v1', { favorites: [], placeStates: {}, dayAssignments: {}, travelYear: 2026, updatedAt: '' })
  const budget = getDefaultBudgetState()
  budget.entries = [{ id: 'paid:international-round-trip', recordKind: 'override', name: 'Vuelos internacionales ida y regreso', category: 'traslados', amount: null, unitAmount: null, currency: null, quantity: 1, unit: 'boleto redondo', status: 'pagado' }]
  writeBudgetState(storage, BUDGET_STORAGE_KEY, budget)
  assert.notEqual(BUDGET_STORAGE_KEY, 'mi-itinerario:sao-paulo:v1')
  assert.deepEqual(trip.favorites, [2, 8])
  assert.deepEqual(trip.placeStates, { 2: 'guardado' })
  assert.deepEqual(trip.dayAssignments, { 2: 5 })
  assert.equal(storage.getItem('mi-itinerario:sao-paulo:v1'), legacyBefore)
  assert.equal(readBudgetState(storage, BUDGET_STORAGE_KEY, getDefaultBudgetState()).entries[0].status, 'pagado')
})

test('los registros locales corruptos o con precios negativos se descartan', () => {
  const fallback = getDefaultBudgetState()
  const storage = { getItem: () => JSON.stringify({ rioNights: 99, lodgingScenario: 'x', entries: [
    { id: 'bad', recordKind: 'custom', name: 'Precio negativo', category: 'otros', amount: -12, unitAmount: -12, currency: 'BRL', quantity: 1, unit: 'gasto', status: 'estimado' },
    { id: 'ok', recordKind: 'custom', name: 'Sin importe', category: 'otros', amount: null, unitAmount: null, currency: null, quantity: 1, unit: 'gasto', status: 'sin-importe' },
  ] }), setItem() {}, removeItem() {} }
  const state = readBudgetState(storage, BUDGET_STORAGE_KEY, fallback)
  assert.equal(state.rioNights, 4)
  assert.equal(state.lodgingScenario, fallback.lodgingScenario)
  assert.deepEqual(state.entries.map((entry) => entry.id), ['ok'])
})

test('la agenda rechaza horas inválidas y no deja que una visita termine después de medianoche', () => {
  assert.equal(timeToMinutes('24:00'), null)
  assert.equal(timeToMinutes('07:15'), 435)
  assert.equal(calculateEndTime('23:30', 60), null)
  assert.equal(calculateEndTime('23:00', 60), '24:00')
  assert.deepEqual(parsePlaceScheduleMap({ 1: { startTime: '24:00', durationMinutes: 60, travelMinutes: 30, bufferMinutes: 15 } }), {})
})

test('agenda ordena horas y advierte cuando traslado y margen invaden la visita anterior', () => {
  const places = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const assignments = { 1: 4, 2: 4, 3: 4 }
  const schedules = {
    1: { startTime: '09:00', durationMinutes: 90, travelMinutes: 30, bufferMinutes: 15 },
    2: { startTime: '10:50', durationMinutes: 60, travelMinutes: 30, bufferMinutes: 15 },
    3: { startTime: '', durationMinutes: 60, travelMinutes: 30, bufferMinutes: 15 },
  }
  assert.deepEqual(sortAssignedPlaces(places, assignments, schedules, 4).map((place) => place.id), [1, 2, 3])
  assert.deepEqual([...findScheduleConflicts(places, assignments, schedules, 4)], [1, 2])
  assert.deepEqual([...findScheduleConflicts(places, { ...assignments, 2: 5 }, schedules, 4)], [])
})

test('agenda marca todo solapamiento, incluso intervalos no adyacentes y traslados previos largos', () => {
  const places = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const assignments = { 1: 4, 2: 4, 3: 4 }
  const nonAdjacent = {
    1: { startTime: '09:00', durationMinutes: 180, travelMinutes: 0, bufferMinutes: 0 },
    2: { startTime: '10:00', durationMinutes: 30, travelMinutes: 0, bufferMinutes: 0 },
    3: { startTime: '11:00', durationMinutes: 30, travelMinutes: 0, bufferMinutes: 0 },
  }
  assert.deepEqual([...findScheduleConflicts(places, assignments, nonAdjacent, 4)].sort(), [1, 2, 3])

  const longLead = {
    1: { startTime: '11:00', durationMinutes: 60, travelMinutes: 90, bufferMinutes: 30 },
    2: { startTime: '10:00', durationMinutes: 30, travelMinutes: 0, bufferMinutes: 0 },
    3: { startTime: '10:40', durationMinutes: 15, travelMinutes: 0, bufferMinutes: 0 },
  }
  assert.deepEqual([...findScheduleConflicts(places, assignments, longLead, 4)].sort(), [1, 2, 3])

  const touchesAtBoundary = {
    1: { startTime: '09:00', durationMinutes: 60, travelMinutes: 0, bufferMinutes: 0 },
    2: { startTime: '10:15', durationMinutes: 45, travelMinutes: 15, bufferMinutes: 0 },
  }
  assert.deepEqual([...findScheduleConflicts(places.slice(0, 2), assignments, touchesAtBoundary, 4)], [])
})

test('rutina local con bloque posterior a medianoche se descarta sin perder otros datos válidos', () => {
  const valid = {
    wakeTime: '07:00', runStartTime: '07:15', runDurationMinutes: 45,
    breakfastStartTime: '08:00', breakfastDurationMinutes: 60,
    departurePrepStartTime: '09:00', departurePrepDurationMinutes: 30,
    lunchStartTime: '12:30', lunchDurationMinutes: 90,
  }
  assert.deepEqual(parseDailyRoutine(valid), valid)
  assert.equal(parseDailyRoutine({ ...valid, runStartTime: '23:50', runDurationMinutes: 240 }), undefined)
  const state = readTripState({ getItem: () => JSON.stringify({
    favorites: [4], placeStates: { 4: 'guardado' }, dayAssignments: { 4: 5 }, travelYear: 2028,
    placeSchedule: { 4: { startTime: '09:15', durationMinutes: 60, travelMinutes: 30, bufferMinutes: 15 } },
    dailyRoutine: { ...valid, runStartTime: '23:50', runDurationMinutes: 240 },
  }) }, 'trip', { favorites: [], placeStates: {}, dayAssignments: {}, travelYear: 2026, updatedAt: '' })
  assert.equal(state.dailyRoutine, undefined)
  assert.deepEqual(state.favorites, [4])
  assert.deepEqual(state.dayAssignments, { 4: 5 })
  assert.equal(state.placeSchedule[4].startTime, '09:15')
})

test('los favoritos, día asignado, año y horario sobreviven la lectura de estado local antiguo', () => {
  const state = readTripState({ getItem: () => JSON.stringify({
    favorites: [4], placeStates: { 4: 'guardado' }, dayAssignments: { 4: 5, 5: 3, 6: 14, 7: 15 }, travelYear: 2028,
    placeSchedule: { 4: { startTime: '09:15', durationMinutes: 60, travelMinutes: 30, bufferMinutes: 15 } },
  }) }, 'trip', { favorites: [], placeStates: {}, dayAssignments: {}, travelYear: 2026, updatedAt: '' })
  assert.deepEqual(state.favorites, [4])
  assert.deepEqual(state.dayAssignments, { 4: 5, 5: 3, 6: 14, 7: 15 })
  assert.equal(state.travelYear, 2028)
  assert.equal(state.placeSchedule[4].startTime, '09:15')
  const movedAssignments = { ...state.dayAssignments, 4: 7 }
  assert.equal(movedAssignments[4], 7)
  assert.equal(state.placeSchedule[4].startTime, '09:15')
})
