import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildItineraryData, mapPlaceId, parseGoogleDocsHtml } from '../scripts/google-doc-import.mjs'

const header = '<tr><th>Fecha</th><th>Hora</th><th>Lugar</th><th>Actividad</th><th>Transporte</th><th>Costo</th><th>Reserva/boleto</th><th>Notas</th></tr>'

function htmlWithSpans() {
  return `<!doctype html><html><body>
    <p>Itinerario Brasil</p><p>RIO - Hacer reservación hostal: <a href="https://www.hospedariario.com.br/">hospedaria rio</a></p>
    <table>${header}
      <tr><td rowspan="2">5 Dec</td><td rowspan="2">09:00 - 14:00</td><td>Parque Estadual da Cantareira</td><td rowspan="2">Caminata &amp; mirador</td><td rowspan="2">Uber</td><td rowspan="2">R$30-60</td><td rowspan="2">Por comprar</td><td rowspan="2">Entrada &amp; acceso<br><a href="https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fticket%3Fust%3Dvolatile">link</a></td></tr>
      <tr><td>Núcleo Pedra Grande</td></tr>
    </table>
    <p>Puntos que no están en el itinerario:</p><ul><li>Walter Galera Garden</li><li>Hotel Unique</li></ul>
    <p>Nota final con <a href="https://example.com/final?ust=volatile&amp;usg=volatile">enlace</a>.</p>
  </body></html>`
}

test('el importador HTML lee 8 columnas, spans, entidades, enlaces y notas fuera de tabla', () => {
  const parsed = parseGoogleDocsHtml(htmlWithSpans(), { capturedAt: '2026-10-18T04:04:15.000Z' })
  assert.deepEqual(parsed.header, ['Fecha', 'Hora', 'Lugar', 'Actividad', 'Transporte', 'Costo', 'Reserva/boleto', 'Notas'])
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[1].date, '2026-12-05')
  assert.equal(parsed.rows[1].activity, 'Caminata & mirador')
  assert.equal(parsed.rows[1].costLabel, 'R$30-60')
  assert.equal(parsed.rows[1].links.Notas[0], 'https://example.com/ticket')
  assert.equal(parsed.rows[0].notes, 'Entrada & acceso\nlink')
  assert.deepEqual(parsed.docNotes.map((note) => `${note.section}:${note.kind}:${note.text}`), [
    'preamble:title:Itinerario Brasil',
    'preamble:lodging:RIO - Hacer reservación hostal: hospedaria rio',
    'postamble:heading:Puntos que no están en el itinerario:',
    'postamble:optional:Walter Galera Garden',
    'postamble:optional:Hotel Unique',
    'postamble:note:Nota final con enlace.',
  ])
  assert.equal(parsed.docNotes.find((note) => note.text.startsWith('Nota final'))?.links[0], 'https://example.com/final')
})

test('el parser falla cerrado ante esquema, tabla incompleta y URL no pública', () => {
  assert.throws(() => parseGoogleDocsHtml('<html><body><table><tr><td>otra</td></tr></table></body></html>'), /GOOGLE_DOC_IMPORT_SCHEMA_INVALID/)
  assert.throws(() => parseGoogleDocsHtml(`<table>${header}<tr><td>5 Dec</td></tr></table>`), /GOOGLE_DOC_IMPORT_TABLE_SHAPE_INVALID/)
  const unsafe = htmlWithSpans().replace('https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fticket%3Fust%3Dvolatile', 'javascript:alert(1)')
  assert.throws(() => parseGoogleDocsHtml(unsafe), /GOOGLE_DOC_IMPORT_URL_INVALID/)
  assert.throws(() => parseGoogleDocsHtml(htmlWithSpans().replace('Entrada &amp; acceso', 'Código ABC123XYZ')), /GOOGLE_DOC_IMPORT_SENSITIVE_CONTENT/)
  assert.throws(() => parseGoogleDocsHtml(htmlWithSpans().replace('https://example.com/final?ust=volatile&amp;usg=volatile', 'https://example.com/final?token=private-value')), /GOOGLE_DOC_IMPORT_SENSITIVE_URL/)
  assert.doesNotThrow(() => parseGoogleDocsHtml(htmlWithSpans().replace('https://example.com/final?ust=volatile&amp;usg=volatile', 'https://example.com/final?g=983&amp;utm_source=docs')))
})

test('el gate de URLs bloquea claves privadas normalizadas sin bloquear parámetros públicos', () => {
  const privateKeys = ['reservation_code', 'reservation-code', 'reservationCode', 'booking_reference', 'booking-reference', 'bookingReference', 'confirmation_code', 'reserva_codigo', 'localizador', 'pnr', 'record_locator', 'voucher_code', 'ticket_number', 'token', 'jwt', 'signature', 'email', 'document_number']
  for (const key of privateKeys) {
    assert.throws(
      () => parseGoogleDocsHtml(htmlWithSpans().replace('https://example.com/final?ust=volatile&amp;usg=volatile', `https://example.com/final?${key}=TESTABC123`)),
      (error) => error?.message === 'GOOGLE_DOC_IMPORT_SENSITIVE_URL',
      `la clave ${key} debe fallar cerrada`,
    )
  }
  for (const key of ['eventID', 'g', 'utm_source', 'genericid']) {
    assert.doesNotThrow(() => parseGoogleDocsHtml(htmlWithSpans().replace('https://example.com/final?ust=volatile&amp;usg=volatile', `https://example.com/final?${key}=983`)), `la clave pública ${key} debe pasar`)
  }
})

test('los alias son explícitos por ciudad y no cruzan LEGO SP con LEGO Río', () => {
  assert.equal(mapPlaceId('Vila Matria Zélia', 'sao-paulo'), 25)
  assert.equal(mapPlaceId('Mural “Imprensa”', 'sao-paulo'), 24)
  assert.equal(mapPlaceId('Mural Etnias\u00a0(Eduardo Kobra)', 'rio'), 106)
  assert.equal(mapPlaceId('LEGO Store', 'sao-paulo'), 40)
  assert.equal(mapPlaceId('LEGO Store', 'rio'), 120)
  assert.equal(mapPlaceId('40 Moema', 'rio'), undefined)
})

test('el snapshot importado conserva 8 columnas, 59 filas con contenido y 6 fechas vacías', async () => {
  const sp = JSON.parse(await readFile(new URL('../docs/data/itinerario.json', import.meta.url), 'utf8'))
  const rio = JSON.parse(await readFile(new URL('../docs/data/itinerario-rio.json', import.meta.url), 'utf8'))
  assert.deepEqual(sp.columns, ['Fecha', 'Hora', 'Lugar', 'Actividad', 'Transporte', 'Costo', 'Reserva/boleto', 'Notas'])
  assert.equal(sp.rows.length, 39)
  assert.equal(rio.rows.length, 26)
  assert.equal(rio.rows.filter((row) => !row.time && !row.placeLabel && !row.activity && !row.transport && !row.costLabel && !row.reservation && !row.notes).length, 6)
  assert.equal(sp.rows.length + rio.rows.filter((row) => row.activity || row.placeLabel || row.time || row.transport || row.costLabel || row.reservation || row.notes).length, 59)
  assert.equal(sp.sync.snapshotHash, 'e9b5320d3ebf187f4d66a26a8daf697486bcbf85268bc4f4724ee57bb97798f8')
  assert.equal(rio.mapBase.id, 'hospedaria-rio')
  assert.match(rio.mapBase.status, /No reservado/)
  assert.ok(rio.optionalItems.some((item) => item.title.includes('Injoy')))
  assert.equal(rio.mapLandmarks.length, 0)
  assert.ok(rio.optionalItems.some((item) => item.title.includes('Cosme Velho')))
  assert.ok(sp.docNotes.some((note) => note.text.includes('Open Doors')))
  assert.ok(sp.rows.every((row) => row.applyToAgenda === false && row.origin === 'docs' && row.lodging === ''))
  assert.equal(sp.rows.find((row) => row.placeLabel === 'Núcleo Pedra Grande')?.mapBase, false)
})

test('el importador conserva filas 66 y 67 válidas y no usa el tamaño del snapshot como contrato', () => {
  const rows = Array.from({ length: 67 }, (_, index) => `<tr><td>8 Dec</td><td></td><td>Lugar ${index + 1}</td><td>Visita ${index + 1}</td><td>A pie</td><td></td><td>Por comprar</td><td></td></tr>`).join('')
  const parsed = parseGoogleDocsHtml(`<html><body><table>${header}${rows}</table></body></html>`)
  assert.equal(parsed.rows.length, 67)
  const previous = { year: 2026, yearIsAssumption: true, rows: [], coverage: [], optionalStops: [] }
  const data = buildItineraryData(parsed, previous, { city: 'sao-paulo', startDay: 2, endDay: 8 })
  assert.equal(data.rows.length, 67)
  assert.equal(data.rows.at(-1).docRowIndex, 66)
})

test('el normalizador separa filas oficiales de opcionales y no altera datos personales', () => {
  const parsed = parseGoogleDocsHtml(htmlWithSpans(), { capturedAt: '2026-10-18T04:04:15.000Z' })
  const previous = { year: 2026, yearIsAssumption: true, rows: [], coverage: [], optionalStops: [] }
  const data = buildItineraryData(parsed, previous, { city: 'sao-paulo', startDay: 2, endDay: 8 })
  assert.equal(data.rows.length, 2)
  assert.ok(data.rows.every((row) => row.origin === 'docs' && row.applyToAgenda === false))
  assert.ok(data.optionalItems.some((item) => item.text === undefined && item.title === 'Walter Galera Garden'))
  assert.equal(JSON.stringify(data).includes('javascript:'), false)
})
