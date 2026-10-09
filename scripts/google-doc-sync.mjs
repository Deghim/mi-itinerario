import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const parserPath = resolve(projectRoot, 'integrations/google-doc-sync/Parser.gs')
const itineraryPath = resolve(projectRoot, 'docs/data/itinerario.json')
const placesPath = resolve(projectRoot, 'docs/data/lugares-sao-paulo.json')
const expectedColumns = ['Fecha', 'Hora', 'Lugar', 'Actividad', 'Transporte', 'Hospedaje', 'Costo estimado', 'Reserva / boleto', 'Notas']
const cellLimits = [10, 100, 120, 300, 300, 200, 120, 40, 1000]
const sharedParserContext = {}
runInNewContext(readFileSync(parserPath, 'utf8'), sharedParserContext, { filename: parserPath })

const aliases = new Map([
  ['crypt of the sao paulo cathedral', 1], ['cripta da se', 1], ['cripta da catedral da se', 1],
  ['livraria da vila', 2], ['beco do batman', 3], ['jardim botanico de sao paulo', 4], ['jardim botanico', 4],
  ['la madone de sao paulo', 5], ['la madone', 5], ['casa de pedra', 6], ['hotel unique', 7],
  ['museu da tatuagem de sao paulo', 8], ['museu da tatuagem', 8], ['masp', 9], ['museu de arte de sao paulo', 9],
  ['parque trianon', 10], ['trianon', 10], ['butantan snake institute', 11], ['instituto butantan', 11],
  ['walter galera garden', 12], ['jardim walter galera', 12], ['museu afro brasil', 13],
  ['castelinho da rua apa', 14], ['museu penitenciario paulista', 15], ['museu historico da imigracao japonesa', 16],
  ['museum of japanese immigration in brazil', 16], ['cemiterio da consolacao', 17], ['museu da imigracao', 18],
  ['immigration museum of sao paulo', 18], ['theatro municipal de sao paulo', 19], ['theatro municipal', 19],
  ['memorial da resistencia de sao paulo', 20], ['memorial da resistencia', 20], ['se station mural', 21],
  ['mural da estacao se', 21], ['sao paulo pedestrian signal lights', 22], ['semaforos de sao paulo', 22],
  ['igreja santa cruz das almas dos enforcados', 23], ['igreja dos enforcados', 23], ['imprensa mural', 24],
  ['mural da imprensa', 24], ['vila maria zelia', 25], ['monumento mae preta', 26], ['mae preta', 26],
  ['puppet cabinet at monteiro lobato library', 27], ['gabinete de bonecas da biblioteca monteiro lobato', 27],
  ['martinelli building', 28], ['edificio martinelli', 28], ['the indian and the anteater sculpture', 29],
  ['indian and anteater', 29], ['casa de dona yaya', 30], ['casa da dona yaya', 30], ['loja monstra', 31],
  ['casa bandeirista do itaim', 32], ['parque estadual cantareira', 33], ['cantareira', 33],
  ['caos bar & antiguidades', 34], ["former world's tallest lego tower", 35], ['former worlds tallest lego tower', 35],
  ['ao rei das magicas', 36],
])

export function normalizeLabel(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
    .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function mapPlaceId(label, places) {
  const normalized = normalizeLabel(label)
  if (!normalized) return undefined
  const aliasId = aliases.get(normalized)
  if (aliasId) return aliasId
  return places.find((place) => normalizeLabel(place.name) === normalized)?.id
}

export function validateEndpointUrl(value) {
  let endpoint
  try { endpoint = new URL(value) } catch { throw new Error('GOOGLE_DOC_SYNC_URL_INVALID') }
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname) || endpoint.search || endpoint.hash) {
    throw new Error('GOOGLE_DOC_SYNC_URL_INVALID')
  }
  return endpoint.toString()
}

export async function loadSharedParser() {
  return sharedParserContext.parseGoogleDocItinerary
}

export function rowStatus(reservation) {
  const normalized = sharedParserContext.sanitizeReservationState(reservation)
  if (normalized === 'Confirmado' || normalized === 'Confirmado por el viajero' || normalized === 'Pagado') return 'confirmado-por-viajero'
  if (normalized === 'Propuesta') return 'propuesta'
  if (normalized === 'Condicional') return 'condicional'
  if (normalized === 'Sin reserva') return 'propuesta'
  return 'pendiente'
}

export function stableRowId(row, occurrence = 0) {
  // The nine-column document has no opaque row ID; date + location survive edits to time, activity, or notes.
  const seed = [row.date, normalizeLabel(row.place)].join('|')
  const suffix = createHash('sha256').update(seed).digest('hex').slice(0, 14)
  return `doc-${suffix}${occurrence ? `-${occurrence + 1}` : ''}`
}

export function toItineraryData(payload, baseData, places, syncedAt = new Date().toISOString()) {
  if (!payload || payload.ok !== true || !payload.data || payload.data.schemaVersion !== 1 || !Array.isArray(payload.data.columns) || !sameValues(payload.data.columns, expectedColumns)) {
    throw new Error('GOOGLE_DOC_SYNC_SCHEMA_INVALID')
  }
  if (!Array.isArray(payload.data.rows) || !payload.data.rows.length || payload.data.rows.length > 150) throw new Error('GOOGLE_DOC_SYNC_ROWS_INVALID')
  const occurrences = new Map()
  const rows = payload.data.rows.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('GOOGLE_DOC_SYNC_ROW_INVALID')
    const fields = ['date', 'time', 'place', 'activity', 'transport', 'lodging', 'cost', 'reservation', 'notes']
    const row = {}
    fields.forEach((key, index) => {
      if (typeof raw[key] !== 'string' || raw[key].length > cellLimits[index]) throw new Error('GOOGLE_DOC_SYNC_CELL_INVALID')
      row[key] = raw[key].trim()
    })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !isValidIsoDate(row.date)) throw new Error('GOOGLE_DOC_SYNC_DATE_INVALID')
    if (Number(row.date.slice(0, 4)) !== baseData.year) throw new Error('GOOGLE_DOC_SYNC_YEAR_MISMATCH')
    if (row.time && /\d{1,2}:\d{1,2}/.test(row.time)) {
      const times = row.time.match(/\d{1,2}:\d{1,2}/g) ?? []
      if (times.some((time) => {
        const [hourText, minuteText] = time.split(':')
        return minuteText.length !== 2 || Number(hourText) > 23 || Number(minuteText) > 59
      })) throw new Error('GOOGLE_DOC_SYNC_TIME_INVALID')
    }
    if (row.reservation !== 'Pagado' && row.reservation !== 'Confirmado por el viajero' && row.reservation !== 'Confirmado' && row.reservation !== 'Propuesta' && row.reservation !== 'Condicional' && row.reservation !== 'Sin reserva' && row.reservation !== 'Por confirmar') {
      throw new Error('GOOGLE_DOC_SYNC_RESERVATION_INVALID')
    }
    const publicFields = [row.place, row.activity, row.transport, row.lodging, row.cost, row.notes]
    if (containsPrivateMarker(publicFields.join(' '))) throw new Error('GOOGLE_DOC_SYNC_PRIVATE_MARKER')
    try { sharedParserContext.validatePublicFieldUrls(publicFields) } catch { throw new Error('GOOGLE_DOC_SYNC_URL_INVALID') }
    const reservation = sharedParserContext.sanitizeReservationState(row.reservation)
    let sourceUrl = ''
    if (raw.sourceUrl) {
      if (typeof raw.sourceUrl !== 'string' || raw.sourceUrl.length > 512) throw new Error('GOOGLE_DOC_SYNC_URL_INVALID')
      sourceUrl = sharedParserContext.safePublicUrl(raw.sourceUrl)
      if (!sourceUrl) throw new Error('GOOGLE_DOC_SYNC_URL_INVALID')
    }
    const baselineMatches = baseData.rows.filter((candidate) => candidate.date === row.date &&
      normalizeLabel(candidate.placeLabel ?? (candidate.placeId ? places.find((place) => place.id === candidate.placeId)?.name : '')) === normalizeLabel(row.place) &&
      normalizeLabel(candidate.activity) === normalizeLabel(row.activity))
    const baseline = baselineMatches.length === 1 ? baselineMatches[0] : undefined
    const placeId = mapPlaceId(row.place, places) ?? baseline?.placeId
    const occurrenceKey = `${row.date}|${normalizeLabel(row.place)}`
    const occurrence = occurrences.get(occurrenceKey) ?? 0
    occurrences.set(occurrenceKey, occurrence + 1)
    const effectiveSourceUrl = sourceUrl || baseline?.sourceUrl || ''
    return {
      id: stableRowId(row, occurrence),
      date: row.date,
      time: row.time,
      status: rowStatus(reservation),
      ...(placeId ? { placeId } : {}),
      ...(row.place ? { placeLabel: row.place } : {}),
      activity: row.activity,
      transport: row.transport,
      lodging: row.lodging,
      costLabel: row.cost,
      ...(baseline?.budgetId ? { budgetId: baseline.budgetId } : {}),
      ...(baseline?.budgetTripLeg ? { budgetTripLeg: baseline.budgetTripLeg } : {}),
      reservation,
      notes: row.notes,
      sourceLabel: effectiveSourceUrl && baseline?.sourceLabel ? baseline.sourceLabel : 'Google Docs · Itinerario web',
      ...(effectiveSourceUrl ? { sourceUrl: effectiveSourceUrl } : {}),
      applyToAgenda: false,
    }
  })
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error('GOOGLE_DOC_SYNC_DUPLICATE_IDS')
  const coverage = (baseData.coverage ?? []).map((item) => {
    if (item.state === 'historico') return item
    const placeRows = rows.filter((row) => row.placeId === item.placeId)
    if (!placeRows.length) return { ...item, state: 'pendiente', note: 'No aparece en la pestaña sincronizada.' }
    const statuses = placeRows.map((row) => row.status)
    const state = statuses.includes('condicional') ? 'condicional' :
      statuses.some((status) => status === 'propuesta' || status === 'confirmado-por-viajero' || status === 'captura-compartida') ? 'propuesta' : 'pendiente'
    return { ...item, state, note: 'Incluido en la pestaña; confirma acceso y operación antes de planear la visita.' }
  })
  return {
    ...baseData,
    rows,
    coverage,
    sync: { source: 'Google Docs · Itinerario web', syncedAt },
  }
}

export async function fetchPublicItinerary(endpoint, fetchImpl = fetch) {
  const safeUrl = validateEndpointUrl(endpoint)
  let response
  try {
    response = await fetchImpl(safeUrl, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/json' } })
  } catch {
    throw new Error('GOOGLE_DOC_SYNC_FETCH_FAILED')
  }
  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('GOOGLE_DOC_SYNC_RESPONSE_INVALID')
  if (response.url) {
    let finalUrl
    try { finalUrl = new URL(response.url) } catch { throw new Error('GOOGLE_DOC_SYNC_REDIRECT_INVALID') }
    if (finalUrl.hostname !== 'script.google.com' && finalUrl.hostname !== 'script.googleusercontent.com') throw new Error('GOOGLE_DOC_SYNC_REDIRECT_INVALID')
  }
  const text = await response.text()
  if (text.length > 1_000_000) throw new Error('GOOGLE_DOC_SYNC_RESPONSE_TOO_LARGE')
  let payload
  try { payload = JSON.parse(text) } catch { throw new Error('GOOGLE_DOC_SYNC_JSON_INVALID') }
  if (!payload || payload.ok !== true) throw new Error('GOOGLE_DOC_SYNC_SOURCE_REJECTED')
  return payload
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function isValidIsoDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function containsPrivateMarker(value) {
  const withoutDates = String(value ?? '').replace(/\b\d{4}-\d{2}-\d{2}\b/g, (date) => isValidIsoDate(date) ? ' ' : date)
  return /\b(?:PNR|localizador|c[oó]digo\s+(?:de\s+)?(?:reserva|boleto)|booking\s+(?:code|reference)|e-ticket)\b/i.test(withoutDates) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) ||
    /(?:\+?\d[\d ()-]{8,}\d)/.test(withoutDates) ||
    /\b(?=[A-Z0-9]{6,8}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]+\b/.test(withoutDates)
}

async function run() {
  const endpoint = process.env.GOOGLE_DOC_SYNC_URL
  if (!endpoint) {
    process.stdout.write('Google Docs sync skipped: endpoint variable is not configured.\n')
    return
  }
  const payload = await fetchPublicItinerary(endpoint)
  const baseData = JSON.parse(await readFile(itineraryPath, 'utf8'))
  const placesData = JSON.parse(await readFile(placesPath, 'utf8'))
  const generated = toItineraryData(payload, baseData, placesData.places)
  const serialized = JSON.stringify(generated, null, 2) + '\n'
  if (serialized.length > 2_000_000) throw new Error('GOOGLE_DOC_SYNC_OUTPUT_TOO_LARGE')
  await writeFile(itineraryPath, serialized)
  process.stdout.write(`Google Docs sync ready: ${generated.rows.length} rows, source timestamp ${generated.sync.syncedAt}.\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error && /^[A-Z0-9_]{1,48}$/.test(error.message) ? error.message : 'GOOGLE_DOC_SYNC_FAILED'}\n`)
    process.exitCode = 1
  })
}
