import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadSharedParser, fetchPublicItinerary, mapPlaceId, rowStatus, stableRowId, toItineraryData, validateEndpointUrl } from '../scripts/google-doc-sync.mjs'
import { buildGoogleDocsTableCopy } from '../lib/itinerary-copy.ts'

const columns = ['Fecha', 'Hora', 'Lugar', 'Actividad', 'Transporte', 'Hospedaje', 'Costo estimado', 'Reserva / boleto', 'Notas']
const baseline = JSON.parse(readFileSync(new URL('../docs/data/itinerario.json', import.meta.url), 'utf8'))
const places = JSON.parse(readFileSync(new URL('../docs/data/lugares-sao-paulo.json', import.meta.url), 'utf8')).places

function cell(value, style = {}, url) {
  return {
    tableCellStyle: style,
    content: [{ paragraph: { elements: [{ textRun: { content: `${value}\n`, ...(url ? { textStyle: { link: { url } } } : {}) } }] } }],
  }
}

function tableRow(values, styles = []) {
  return { tableCells: values.map((value, index) => cell(value, styles[index] ?? {})) }
}

function docWithTables(tables) {
  return {
    tabs: [
      { tabProperties: { title: 'Notas privadas' }, documentTab: { body: { content: [{ paragraph: { elements: [{ textRun: { content: 'PNR PRIVATE123 jane@example.com' } }] } }] } } },
      { tabProperties: { title: 'Itinerario web', tabId: 'public-tab' }, documentTab: { body: { content: tables.map((table) => ({ table })) } } },
    ],
  }
}

function publicTable(rowCells) {
  return { tableRows: [tableRow(columns), ...rowCells] }
}

test('parser aislado lee solo la pestaña pública y reconstruye fechas fusionadas', async () => {
  const parse = await loadSharedParser()
  const first = ['2026-12-04', '10:15–12:15', 'Museu da Imigração', 'Visita', 'Metro', 'Por definir', 'Entrada por confirmar', 'Propuesta', 'Después del desayuno']
  const second = ['', '14:35–15:20', 'Vila Maria Zélia', 'Paseo exterior', 'Taxi por definir', 'Por definir', '', 'Condicional', 'Acceso por confirmar']
  const data = parse(docWithTables([publicTable([
    tableRow(first, [{ rowSpan: 2 }]),
    tableRow(second.slice(1)),
  ])]), 'Itinerario web')

  assert.equal(data.rows.length, 2)
  assert.equal(data.rows[0].date, '2026-12-04')
  assert.equal(data.rows[1].date, '2026-12-04')
  assert.equal(data.rows[1].place, 'Vila Maria Zélia')
  assert.equal(data.rows[1].reservation, 'Condicional')
  assert.equal(JSON.stringify(data).includes('PRIVATE123'), false)
  assert.equal(JSON.stringify(data).includes('jane@example.com'), false)
})

test('parser concatena tablas continuadas solo con los nueve encabezados y descarta una celda de reserva libre', async () => {
  const parse = await loadSharedParser()
  const rowA = ['2026-12-05', '10:30–14:30', 'Parque Estadual Cantareira', 'Excursión', 'Traslado por confirmar', 'Por definir', '', 'Propuesta', 'Caminata con margen']
  const rowB = ['2026-12-06', '10:00', 'Casa de Dona Yayá', 'Visita', 'Por definir', 'Por definir', '', 'PNR XY123456 · https://private.example/booking/token', 'Acceso sujeto a horario']
  const result = parse(docWithTables([publicTable([tableRow(rowA)]), publicTable([tableRow(rowB)])]), 'Itinerario web')

  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[1].reservation, 'Por confirmar')
  assert.equal(JSON.stringify(result).includes('XY123456'), false)
  assert.equal(JSON.stringify(result).includes('private.example'), false)
})

test('parser falla cerrado con pestaña ambigua, tabla ausente, fechas u horas inválidas y URL privada', async () => {
  const parse = await loadSharedParser()
  const base = ['2026-12-04', '10:15', 'MASP', 'Visita', 'Metro', 'Por definir', '', 'Por confirmar', 'Notas']
  assert.throws(() => parse({ tabs: [] }, 'Itinerario web'), /TAB_NOT_UNIQUE/)
  const duplicateTab = docWithTables([publicTable([tableRow(base)])])
  duplicateTab.tabs.push(duplicateTab.tabs[1])
  assert.throws(() => parse(duplicateTab, 'Itinerario web'), /TAB_NOT_UNIQUE/)
  assert.throws(() => parse(docWithTables([{ tableRows: [tableRow(['Otra', 'tabla'])] }]), 'Itinerario web'), /ITINERARY_TABLE_NOT_FOUND/)
  assert.throws(() => parse(docWithTables([publicTable([tableRow(base)]), { tableRows: [tableRow(['nota'])] }]), 'Itinerario web'), /TABLE_SCHEMA_AMBIGUOUS/)
  assert.throws(() => parse(docWithTables([publicTable([tableRow(['2026-02-31', ...base.slice(1)])])]), 'Itinerario web'), /INVALID_ROW_DATE/)
  assert.throws(() => parse(docWithTables([publicTable([tableRow([...base.slice(0, 1), '25:10', ...base.slice(2)])])]), 'Itinerario web'), /INVALID_ROW_TIME/)
  for (const time of ['25:00hrs', '09:99pm']) {
    assert.throws(() => parse(docWithTables([publicTable([tableRow([...base.slice(0, 1), time, ...base.slice(2)])])]), 'Itinerario web'), /INVALID_ROW_TIME/)
  }
  assert.throws(() => parse(docWithTables([publicTable([tableRow([...base.slice(0, 2), '', ...base.slice(3)])])]), 'Itinerario web'), /ROW_PLACE_OR_ACTIVITY_MISSING/)
  const unsafeLink = base.slice()
  unsafeLink[8] = 'Reserva'
  const linkedRow = tableRow(unsafeLink).tableCells
  linkedRow[8] = cell('reserva privada', {}, 'https://docs.google.com/document/d/private')
  assert.throws(() => parse(docWithTables([{ tableRows: [tableRow(columns), { tableCells: linkedRow }] }]), 'Itinerario web'), /UNSAFE_NOTE_URL/)
})

test('seguridad fail-closed bloquea códigos sin etiqueta y enlaces fuera de fuentes revisadas, sin confundir una fecha ISO', async () => {
  const parse = await loadSharedParser()
  const base = ['2026-12-04', '10:15', 'MASP', 'Visita', 'Metro', 'Por definir', '', 'Propuesta', 'Código por confirmar; fecha 2026-12-05']
  assert.equal(parse(docWithTables([publicTable([tableRow(base)])]), 'Itinerario web').rows[0].notes, base[8])

  for (const token of ['ABC123', 'XZ9K4Q']) {
    const privateNotes = base.slice(); privateNotes[8] = `Salida al museo ${token}`
    assert.throws(() => parse(docWithTables([publicTable([tableRow(privateNotes)])]), 'Itinerario web'), /PRIVATE_MARKER_IN_PUBLIC_FIELD/)
  }

  const publicSource = base.slice(); publicSource[8] = 'Fuente oficial'
  const publicLinkCells = tableRow(publicSource).tableCells
  publicLinkCells[8] = cell('Fuente oficial', {}, 'https://www.atlasobscura.com/places/crypt-of-the-sao-paulo-cathedral')
  assert.equal(parse(docWithTables([{ tableRows: [tableRow(columns), { tableCells: publicLinkCells }] }]), 'Itinerario web').rows[0].sourceUrl, 'https://www.atlasobscura.com/places/crypt-of-the-sao-paulo-cathedral')
  publicLinkCells[8] = cell('Entradas', {}, 'https://www.masp.org.br/ingressos/tickets')
  assert.equal(parse(docWithTables([{ tableRows: [tableRow(columns), { tableCells: publicLinkCells }] }]), 'Itinerario web').rows[0].sourceUrl, 'https://www.masp.org.br/ingressos/tickets')

  for (const [text, url] of [
    ['Información', 'https://booking.example.com/r/A1B2C3'],
    ['Información', 'https://www.atlasobscura.com/places/A1B2C3'],
  ]) {
    const linkedCells = tableRow(base).tableCells
    linkedCells[8] = cell(text, {}, url)
    assert.throws(() => parse(docWithTables([{ tableRows: [tableRow(columns), { tableCells: linkedCells }] }]), 'Itinerario web'), /UNSAFE_NOTE_URL/)
  }

  for (const index of [2, 3, 4, 5, 6, 8]) {
    const literalUrl = base.slice(); literalUrl[index] = `${literalUrl[index] || 'Detalle'} · https://booking.example.com/r/A1B2C3`
    assert.throws(() => parse(docWithTables([publicTable([tableRow(literalUrl)])]), 'Itinerario web'), /UNSAFE_PUBLIC_FIELD_URL/)
  }
})

test('estado de reserva trata negaciones como pendiente y solo normaliza estados, nunca texto libre', async () => {
  const parse = await loadSharedParser()
  const base = ['2026-12-04', '10:15', 'MASP', 'Visita', 'Metro', 'Por definir', '', 'No pagado', 'Código por confirmar']
  const row = (reservation) => parse(docWithTables([publicTable([tableRow([...base.slice(0, 7), reservation, base[8]])])]), 'Itinerario web').rows[0]
  assert.equal(row('No pagado').reservation, 'Por confirmar')
  assert.equal(row('Pago por confirmar; pagado?').reservation, 'Por confirmar')
  assert.equal(row('Sin reserva; pagado?').reservation, 'Sin reserva')
  assert.equal(row('Pagado').reservation, 'Pagado')
  assert.equal(JSON.stringify(row('PNR ABC123')).includes('ABC123'), false)
  assert.equal(rowStatus('No pagado'), 'pendiente')
  assert.equal(rowStatus('Pago por confirmar; pagado?'), 'pendiente')
})

test('el fixture de todas las filas del itinerario actual conserva su allowlist y pasa parser y normalizador', async () => {
  const parse = await loadSharedParser()
  const grouped = []
  baseline.rows.forEach((row) => {
    const date = grouped.at(-1)
    if (!date || date.date !== row.date) grouped.push({ date: row.date, rows: [row] })
    else date.rows.push(row)
  })
  const tableRows = [tableRow(columns)]
  grouped.forEach((group) => group.rows.forEach((row, index) => {
    const values = [row.date, row.time, row.placeLabel ?? (row.placeId ? places.find((place) => place.id === row.placeId)?.name ?? '' : ''), row.activity, row.transport, row.lodging, row.costLabel, row.reservation, row.notes]
    const cells = values.map((value) => cell(value))
    if (row.sourceUrl) cells[8] = cell(row.notes, {}, row.sourceUrl)
    if (index === 0 && group.rows.length > 1) cells[0].tableCellStyle.rowSpan = group.rows.length
    tableRows.push({ tableCells: index === 0 ? cells : cells.slice(1) })
  }))
  const parsed = parse(docWithTables([{ tableRows }]), 'Itinerario web')
  const generated = toItineraryData({ ok: true, data: parsed }, baseline, places, '2026-10-08T18:00:00.000Z')
  assert.equal(generated.rows.length, baseline.rows.length)
  assert.equal(generated.sync.syncedAt, '2026-10-08T18:00:00.000Z')
  assert.equal(generated.rows.filter((row) => row.sourceUrl).length, baseline.rows.filter((row) => row.sourceUrl).length)
  assert.equal(generated.rows.find((row) => row.placeLabel === 'CUU → CDMX')?.status, 'pendiente')
})

test('la barrera CI vuelve a validar tokens horarios, datos sensibles y URLs de filas recibidas', async () => {
  const parse = await loadSharedParser()
  const values = ['2026-12-04', '10:15', 'MASP', 'Visita', 'Metro', 'Por definir', '', 'Propuesta', 'Visita 2026-12-05']
  const parsedRow = parse(docWithTables([publicTable([tableRow(values)])]), 'Itinerario web').rows[0]
  const payloadFor = (changes = {}) => ({ ok: true, data: { schemaVersion: 1, columns, rows: [{ ...parsedRow, ...changes }] } })
  assert.throws(() => toItineraryData(payloadFor({ time: '25:00hrs' }), baseline, places), /GOOGLE_DOC_SYNC_TIME_INVALID/)
  assert.throws(() => toItineraryData(payloadFor({ time: '09:99pm' }), baseline, places), /GOOGLE_DOC_SYNC_TIME_INVALID/)
  assert.throws(() => toItineraryData(payloadFor({ notes: 'Nota privada ABC123' }), baseline, places), /GOOGLE_DOC_SYNC_PRIVATE_MARKER/)
  assert.throws(() => toItineraryData(payloadFor({ transport: 'Reserva: https://booking.example.com/r/A1B2C3' }), baseline, places), /GOOGLE_DOC_SYNC_(?:URL_INVALID|PRIVATE_MARKER)/)
  assert.throws(() => toItineraryData(payloadFor({ sourceUrl: 'https://booking.example.com/r/A1B2C3' }), baseline, places), /GOOGLE_DOC_SYNC_URL_INVALID/)
  assert.equal(toItineraryData(payloadFor({ notes: 'Visita 2026-12-05' }), baseline, places).rows.length, 1)
})

test('el ID de Google Docs solo se obtiene de Script Properties y no queda literal en Code.gs', () => {
  const code = readFileSync(new URL('../integrations/google-doc-sync/Code.gs', import.meta.url), 'utf8')
  assert.match(code, /SOURCE_DOCUMENT_ID_PROPERTY = 'GOOGLE_DOC_ID'/)
  assert.match(code, /getScriptProperties\(\)\.getProperty\(SOURCE_DOCUMENT_ID_PROPERTY\)/)
  assert.doesNotMatch(code, /10JU5qUXjo-tAuudNIkiYDP7uIBwIQqixE3La01J09BM/)
})

test('normalizador genera filas tipadas sin duplicar presupuesto ni exportar reserva libre', async () => {
  const parse = await loadSharedParser()
  const row = ['2026-12-05', '10:30–14:30', 'Cantareira', 'Excursión', 'Bus', 'Por definir', 'R$ 98,99 consultado', 'Pagado · código PNR XYZ12345', 'Salida al parque, entrada por confirmar']
  const payload = { ok: true, data: parse(docWithTables([publicTable([tableRow(row)])]), 'Itinerario web') }
  const base = { year: 2026, yearIsAssumption: true, rioNightsPreferred: 5, rows: [], coverage: [{ placeId: 33, state: 'condicional', note: 'mantener' }, { placeId: 10, state: 'propuesta', note: 'dato eliminado' }, { placeId: 34, state: 'historico', note: 'histórico' }] }
  const places = [{ id: 33, name: 'Parque Estadual Cantareira' }]
  const generated = toItineraryData(payload, base, places, '2026-10-08T12:00:00.000Z')
  assert.equal(generated.rows[0].placeId, 33)
  assert.equal(generated.rows[0].budgetId, undefined)
  assert.equal(generated.rows[0].reservation, 'Pagado')
  assert.equal(generated.rows[0].status, 'confirmado-por-viajero')
  assert.equal(generated.rows[0].applyToAgenda, false)
  assert.deepEqual(generated.coverage, [
    { placeId: 33, state: 'propuesta', note: 'Incluido en la pestaña; confirma acceso y operación antes de planear la visita.' },
    { placeId: 10, state: 'pendiente', note: 'No aparece en la pestaña sincronizada.' },
    { placeId: 34, state: 'historico', note: 'histórico' },
  ])
  assert.deepEqual(generated.sync, { source: 'Google Docs · Itinerario web', syncedAt: '2026-10-08T12:00:00.000Z' })
  assert.equal(JSON.stringify(generated).includes('XYZ12345'), false)
  assert.equal(JSON.stringify(generated).includes('código PNR'), false)
  assert.equal(mapPlaceId('Parque Trianon', places), 10)
  assert.equal(stableRowId(row, 0), stableRowId({ ...row, activity: 'Excursión actualizada', time: '11:00' }, 0))
  assert.throws(() => toItineraryData({ ...payload, data: { ...payload.data, rows: [{ ...payload.data.rows[0], date: '2027-12-05' }] } }, base, places), /GOOGLE_DOC_SYNC_YEAR_MISMATCH/)
})

test('solo hereda referencias existentes con coincidencia única y mantiene el vuelo pagado como monto desconocido', async () => {
  const parse = await loadSharedParser()
  const flight = ['2026-12-03', '00:57–09:10 · captura', 'R. DOM → São Paulo · GRU', 'Vuelo internacional de llegada', 'Vuelo', 'Por definir', 'Vuelos internacionales pagados · importe por informar', 'Vuelo internacional pagado según el viajero', 'Hora local por confirmar']
  const domestic = ['2026-12-02', '10:52–12:54 · captura', 'CUU → CDMX', 'Vuelo de salida', 'Vuelo', 'Por definir', 'Importe por confirmar', 'Pago e inclusión en vuelos internacionales por confirmar', 'Aerolínea pendiente']
  const walk = ['2026-12-05', '10:30–14:30', 'Parque Estadual Cantareira', 'Excursión', 'Traslado por definir', 'Por definir', 'R$ 98,99 consultado', 'Propuesta', 'Entrada por confirmar']
  const payload = { ok: true, data: parse(docWithTables([publicTable([tableRow(flight), tableRow(domestic), tableRow(walk)])]), 'Itinerario web') }
  const base = {
    year: 2026, yearIsAssumption: true, rioNightsPreferred: 5, rows: [
      { id: 'flight-rdom-sp-2026-12-03', date: '2026-12-03', placeLabel: flight[2], activity: flight[3], budgetId: 'paid:international-round-trip', sourceLabel: 'Confirmado por el viajero' },
      { id: 'walk-baseline', date: '2026-12-05', placeLabel: walk[2], activity: walk[3], placeId: 33, budgetId: 'bus:sao-paulo-rio', sourceUrl: 'https://www.clickbus.com.br/onibus/sao-paulo-sp-todos/rio-de-janeiro-rj-todos', sourceLabel: 'ClickBus consulta' },
      { id: 'walk-ambiguous', date: '2026-12-05', placeLabel: walk[2], activity: walk[3], placeId: 33, budgetId: 'do-not-inherit' },
    ], coverage: [{ placeId: 33, state: 'condicional', note: 'mantener' }],
  }
  const places = [{ id: 33, name: 'Parque Estadual Cantareira' }]
  const result = toItineraryData(payload, base, places, '2026-10-08T12:00:00.000Z')
  assert.equal(result.rows[0].budgetId, 'paid:international-round-trip')
  assert.equal(result.rows[1].budgetId, undefined)
  assert.equal(result.rows[1].costLabel, 'Importe por confirmar')
  assert.equal(result.rows[2].budgetId, undefined)
  assert.equal(result.rows[2].sourceUrl, undefined)
  assert.equal(result.rows[2].costLabel, 'R$ 98,99 consultado')
})

test('copia para Google Docs agrupa fechas, conserva nueve columnas y normaliza reservas sin overrides', () => {
  const rows = [
    { id: 'a', date: '2026-12-03', time: '09:10', placeLabel: 'GRU', activity: 'Llegada', transport: 'Vuelo', lodging: 'Pendiente', costLabel: 'Importe por informar', reservation: 'Vuelos internacionales pagados · importe por informar · PNR ABC12345', notes: 'Nota pública' },
    { id: 'b', date: '2026-12-03', time: '15:00', placeLabel: 'Trianon', activity: 'Paseo', transport: 'A pie', lodging: 'Pendiente', costLabel: 'Pendiente', reservation: 'Sin reserva registrada', notes: 'Segundo renglón' },
  ]
  const copied = buildGoogleDocsTableCopy(rows, () => undefined)
  assert.equal((copied.html.match(/<th>/g) ?? []).length, 9)
  assert.match(copied.html, /rowspan="2"/)
  assert.equal((copied.text.match(/2026-12-03/g) ?? []).length, 1)
  assert.equal(copied.text.includes('ABC12345'), false)
  assert.match(copied.text, /\tPagado\t/)
})

test('endpoint y respuestas bloquean login HTML, error Apps Script y redirect externo sin revelar cuerpo', async () => {
  assert.equal(validateEndpointUrl('https://script.google.com/macros/s/abc123/exec'), 'https://script.google.com/macros/s/abc123/exec')
  assert.throws(() => validateEndpointUrl('https://docs.google.com/document/d/private/edit'), /GOOGLE_DOC_SYNC_URL_INVALID/)
  await assert.rejects(fetchPublicItinerary('https://script.google.com/macros/s/abc123/exec', async () => new Response('<html>signin private payload</html>', {
    headers: { 'content-type': 'text/html' },
  })), /GOOGLE_DOC_SYNC_RESPONSE_INVALID/)
  await assert.rejects(fetchPublicItinerary('https://script.google.com/macros/s/abc123/exec', async () => new Response('{"ok":false,"error":"TAB_NOT_UNIQUE"}', {
    headers: { 'content-type': 'application/json' },
  })), /GOOGLE_DOC_SYNC_SOURCE_REJECTED/)
  await assert.rejects(fetchPublicItinerary('https://script.google.com/macros/s/abc123/exec', async () => ({
    ok: true,
    url: 'https://evil.example/private',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => '{"ok":true}',
  })), /GOOGLE_DOC_SYNC_REDIRECT_INVALID/)
})
