import { createHash } from 'node:crypto'
import { readFile, rename, writeFile, mkdtemp } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import * as parse5 from 'parse5'

const projectRoot = resolve(new URL('..', import.meta.url).pathname)
const defaultDocumentUrl = 'https://docs.google.com/document/d/10JU5qUXjo-tAuudNIkiYDP7uIBwIQqixE3La01J09BM/edit?tab=t.0'
const columns = ['Fecha', 'Hora', 'Lugar', 'Actividad', 'Transporte', 'Costo', 'Reserva/boleto', 'Notas']
const dateMonths = new Map([['ene', 1], ['feb', 2], ['mar', 3], ['abr', 4], ['may', 5], ['jun', 6], ['jul', 7], ['ago', 8], ['sep', 9], ['oct', 10], ['nov', 11], ['dic', 12], ['dec', 12]])
const sourceLabel = 'Google Docs · agenda oficial'

function cleanText(value) {
  return value.normalize('NFKC').replace(/[\u00A0\u202F]/g, ' ').replaceAll('\uFEFF', '').replaceAll('\u200B', '').replaceAll('\u200C', '').replaceAll('\u200D', '').replaceAll('\r\n', '\n').replaceAll('\r', '\n')
    .split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n').trim()
}

function descendants(node, predicate, result = []) {
  if (predicate(node)) result.push(node)
  for (const child of node.childNodes ?? []) descendants(child, predicate, result)
  return result
}

function directChildren(node, tagName) {
  return (node.childNodes ?? []).filter((child) => child.tagName === tagName)
}

function nodeText(node) {
  if (node.nodeName === '#text') return node.value
  const chunks = []
  for (const child of node.childNodes ?? []) {
    const value = nodeText(child)
    if (value) chunks.push(value)
    if (child.tagName === 'br' || child.tagName === 'p' || child.tagName === 'div' || child.tagName === 'li') chunks.push('\n')
  }
  return chunks.join('')
}

function attr(node, name) {
  return node.attrs?.find((item) => item.name === name)?.value ?? ''
}

function normalizeUrl(raw, baseUrl = 'https://docs.google.com/') {
  let value
  try { value = new URL(raw, baseUrl) } catch { throw new Error('GOOGLE_DOC_IMPORT_URL_INVALID') }
  if (!['http:', 'https:'].includes(value.protocol)) throw new Error('GOOGLE_DOC_IMPORT_URL_INVALID')
  if (value.hostname === 'www.google.com' && value.pathname === '/url' && value.searchParams.get('q')) return normalizeUrl(value.searchParams.get('q'), baseUrl)
  value.searchParams.delete('ust')
  value.searchParams.delete('usg')
  return value.toString()
}

function cellLinks(node) {
  const links = []
  for (const anchor of descendants(node, (candidate) => candidate.tagName === 'a')) {
    const href = attr(anchor, 'href')
    if (!href) continue
    const normalized = normalizeUrl(href)
    if (!links.includes(normalized)) links.push(normalized)
  }
  return links
}

function parseTable(table) {
  const trNodes = descendants(table, (node) => node.tagName === 'tr')
  const grid = []
  const physical = []
  for (let rowIndex = 0; rowIndex < trNodes.length; rowIndex += 1) {
    const tr = trNodes[rowIndex]
    const cells = [...(tr.childNodes ?? [])].filter((node) => node.tagName === 'td' || node.tagName === 'th')
    const physicalCells = cells.map((cell, cellIndex) => ({
      cellIndex,
      text: cleanText(nodeText(cell)),
      links: cellLinks(cell),
      rowSpan: Math.max(1, Number(attr(cell, 'rowspan')) || 1),
      colSpan: Math.max(1, Number(attr(cell, 'colspan')) || 1),
    }))
    physical.push({ rowIndex, cells: physicalCells })
    grid[rowIndex] ??= []
    let column = 0
    for (const cell of physicalCells) {
      while (grid[rowIndex][column]) column += 1
      const value = { ...cell, sourceCellIndex: cell.cellIndex, inherited: false }
      for (let rowOffset = 0; rowOffset < cell.rowSpan; rowOffset += 1) {
        const targetRow = rowIndex + rowOffset
        grid[targetRow] ??= []
        for (let colOffset = 0; colOffset < cell.colSpan; colOffset += 1) {
          const targetCol = column + colOffset
          if (grid[targetRow][targetCol]) throw new Error('GOOGLE_DOC_IMPORT_TABLE_SPAN_AMBIGUOUS')
          grid[targetRow][targetCol] = { ...value, inherited: rowOffset > 0 || colOffset > 0 }
        }
      }
      column += cell.colSpan
    }
  }
  const header = grid[0]?.slice(0, columns.length).map((cell) => cell?.text ?? '')
  if (JSON.stringify(header) !== JSON.stringify(columns)) throw new Error('GOOGLE_DOC_IMPORT_SCHEMA_INVALID')
  if (grid.some((row) => row.length !== columns.length || row.some((cell) => !cell))) throw new Error('GOOGLE_DOC_IMPORT_TABLE_SHAPE_INVALID')
  const logicalRows = grid.slice(1).map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])))
  return { header, physicalRows: physical, logicalRows, rows: logicalRows }
}

function parseDate(value, year) {
  const match = /^(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3,})$/.exec(cleanText(value))
  if (!match) throw new Error('GOOGLE_DOC_IMPORT_DATE_INVALID')
  const month = dateMonths.get(match[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3).toLowerCase())
  const day = Number(match[1])
  if (month !== 12 || !Number.isInteger(day) || day < 1 || day > 31) throw new Error('GOOGLE_DOC_IMPORT_DATE_INVALID')
  return `${year}-12-${String(day).padStart(2, '0')}`
}

function containsNode(root, target) {
  return root === target || (root.childNodes ?? []).some((child) => containsNode(child, target))
}

function outsideBlocks(body, table) {
  const blocks = []
  let tableSeen = false
  function addTextNode(node, section) {
    const text = cleanText(nodeText(node))
    if (!text) return
    const kind = /^itinerario brasil$/i.test(text) ? 'title' : /hacer reservaci[oó]n hostal/i.test(text) ? 'lodging' : /puntos que no est[aá]n/i.test(text) ? 'heading' : 'note'
    blocks.push({ section, kind, text, links: cellLinks(node), applyToAgenda: false, source: 'Google Docs' })
  }
  function visit(node) {
    if (node === table) { tableSeen = true; return }
    if (node.tagName === 'style' || node.tagName === 'script') return
    const section = tableSeen ? 'postamble' : 'preamble'
    if (node.tagName === 'ul' || node.tagName === 'ol') {
      if (containsNode(node, table)) {
        for (const child of node.childNodes ?? []) visit(child)
      } else {
        for (const item of directChildren(node, 'li')) {
          const text = cleanText(nodeText(item))
          if (text) blocks.push({ section, kind: 'optional', text, links: cellLinks(item), applyToAgenda: false, source: 'Google Docs' })
        }
      }
      return
    }
    if (node.tagName === 'table') return
    if (containsNode(node, table)) {
      for (const child of node.childNodes ?? []) visit(child)
      return
    }
    if (['p', 'h1', 'h2', 'h3'].includes(node.tagName)) {
      addTextNode(node, section)
      return
    }
    if (node.tagName === 'div') {
      const hasBlockChild = (node.childNodes ?? []).some((child) => ['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'div'].includes(child.tagName))
      if (hasBlockChild) {
        for (const child of node.childNodes ?? []) visit(child)
      } else addTextNode(node, section)
      return
    }
    for (const child of node.childNodes ?? []) visit(child)
  }
  visit(body)
  return blocks
}

function findBody(document) {
  return descendants(document, (node) => node.tagName === 'body')[0]
}

export function parseGoogleDocsHtml(html, { year = 2026, sourceUrl = defaultDocumentUrl, capturedAt = undefined } = {}) {
  if (typeof html !== 'string' || !html.trim()) throw new Error('GOOGLE_DOC_IMPORT_HTML_EMPTY')
  const safeSourceUrl = normalizeUrl(sourceUrl)
  const document = parse5.parse(html)
  const body = findBody(document)
  const tables = descendants(body, (node) => node.tagName === 'table')
  if (tables.length !== 1) throw new Error('GOOGLE_DOC_IMPORT_TABLE_COUNT_INVALID')
  const table = tables[0]
  const parsedTable = parseTable(table)
  const outside = outsideBlocks(body, table)
  const preamble = outside.filter((block) => block.section === 'preamble')
  const postamble = outside.filter((block) => block.section === 'postamble')
  const rows = parsedTable.rows.map((row, index) => {
    const date = parseDate(row.Fecha.text, year)
    const links = Object.fromEntries(columns.map((column) => [column, row[column].links]))
    return {
      index,
      date,
      time: row.Hora.text,
      placeLabel: row.Lugar.text,
      activity: row.Actividad.text,
      transport: row.Transporte.text,
      costLabel: row.Costo.text,
      reservation: row['Reserva/boleto'].text,
      notes: row.Notas.text,
      links,
      spans: Object.fromEntries(columns.map((column) => [column, { inherited: row[column].inherited, sourceRowSpan: row[column].rowSpan, sourceCellIndex: row[column].sourceCellIndex }])),
    }
  })
  assertPublicContent([...rows.flatMap((row) => [row.placeLabel, row.activity, row.transport, row.costLabel, row.reservation, row.notes]), ...[...preamble, ...postamble].flatMap((note) => [note.text])])
  assertPublicUrls([safeSourceUrl, ...rows.flatMap((row) => Object.values(row.links).flat()), ...[...preamble, ...postamble].flatMap((note) => note.links)])
  const snapshotHash = createHash('sha256').update(html).digest('hex')
  return {
    schemaVersion: 2,
    sourceUrl: safeSourceUrl,
    capturedAt,
    snapshotHash,
    columns,
    header: parsedTable.header,
    physicalRows: parsedTable.physicalRows,
    logicalRows: parsedTable.logicalRows,
    rows,
    docNotes: [...preamble, ...postamble],
  }
}

const sensitiveTextPatterns = [
  /(?:c[oó]digo|localizador|pnr|booking\s*(?:reference|code)|reservation\s*(?:code|number)|n[uú]mero\s+(?:de\s+)?(?:boleto|billete|ticket|reserva))\s*(?:[:#=-]|\s)+[A-Z0-9][A-Z0-9-]{5,}/i,
]

function normalizeUrlKey(key) {
  return key.normalize('NFKC').toLocaleLowerCase('en').replace(/[_-]/g, '')
}

function isSensitiveUrlKey(key) {
  const normalized = normalizeUrlKey(key)
  return /^(?:token|accesstoken|auth|authorization|signature|sig|secret|password|passcode|privatetoken|session|jwt|apikey|email|emailaddress)$/.test(normalized)
    || /^(?:reservation(?:code|id|number)?|booking(?:code|reference|id|number)?|confirmation(?:code|id|number)?|reservacodigo|reservaid|reservanumero|localizador|pnr|recordlocator|voucher(?:code|id|number)?|ticket(?:number|id|code)?|document(?:number|id|code|actual)?|documento(?:numero|id|codigo|actual)?|passport(?:number|id)?|pasaporte(?:numero|id)?|identificacion(?:numero|id)?)$/.test(normalized)
}

function assertPublicContent(values) {
  if (values.some((value) => typeof value === 'string' && sensitiveTextPatterns.some((pattern) => pattern.test(value)))) throw new Error('GOOGLE_DOC_IMPORT_SENSITIVE_CONTENT')
}

function assertPublicUrls(urls) {
  if (urls.some((raw) => [...new URL(raw).searchParams.keys()].some(isSensitiveUrlKey))) throw new Error('GOOGLE_DOC_IMPORT_SENSITIVE_URL')
}

const aliases = {
  'sao-paulo': new Map([
    ['cemitério da consolação', 17], ['parque trianon', 10], ['masp', 9], ['museu da imigração', 18], ['vila matria zélia', 25], ['vila maria zélia', 25], ['parque estadual da cantareira', 33], ['núcleo pedra grande', 33], ['casa de dona yayá', 30], ['igreja santa cruz das almas dos enforcados', 23], ['museu histórico da imigração japonesa', 16], ['cripta da catedral da sé', 1], ['mural da estação sé', 21], ['memorial da resistência', 20], ['monumento mãe preta', 26], ['la madone', 5], ['edifício martinelli', 28], ['theatro municipal', 19], ['mural “imprensa”', 24], ['mural "imprensa"', 24], ['mural &ldquo;imprensa&rdquo;', 24], ['jardim botânico de são paulo', 4], ['museu afro brasil', 13], ['lego store', 40], ['mirador del farol santander', 41], ['farol santander são paulo', 41],
  ]),
  rio: new Map([
    ['real gabinete português de leitura', 101], ['biblioteca nacional', 105], ['cristo redentor', 119], ['largo do boticário', 102], ['cemitério são joão batista', 109], ['catedral metropolitana', 104], ['escadaria selarón', 108], ['mural etnias', 106], ['mural etnias (eduardo kobra)', 106], ['ilha fiscal', 111], ['museu de imagens do inconsciente (mii)', 107], ['praça hans klussmann', 117], ['museu de astronomia e cincias afins (mast)', 110], ['parque lage', 103], ['cachoeiras do horto', 115], ['lego store', 120],
  ]),
}

function normalizeName(value) {
  return cleanText(value).normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
    .replace(/[“”„‟«»]/g, '"').replace(/[‘’‚‛]/g, "'").replace(/\s*([()\[\],.;:])\s*/g, '$1').replace(/\s+/g, ' ').trim()
}

export function mapPlaceId(label, city) {
  if (!label) return undefined
  const key = normalizeName(label)
  return [...aliases[city].entries()].find(([name]) => normalizeName(name) === key)?.[1]
}

function rowStatus(row) {
  const text = `${row.reservation} ${row.notes}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
  if (!row.placeLabel && !row.activity && !row.time) return 'pendiente'
  if (/condicional|acceso por confirmar/.test(text)) return 'condicional'
  if (/por comprar|pendiente de coordinar/.test(text)) return 'pendiente'
  return 'propuesta'
}

function stableId(row, city, index) {
  const slug = normalizeName(`${city}-${row.date}-${row.placeLabel || row.activity || 'fila'}-${index}`).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `docs-${slug}`
}

function officialRows(parsed, city, startDay, endDay) {
  return parsed.rows.filter((row) => {
    const day = Number(row.date.slice(8, 10))
    return day >= startDay && day <= endDay
  }).map((row, index) => {
    const placeId = mapPlaceId(row.placeLabel, city)
    const isSecondCantareira = city === 'sao-paulo' && normalizeName(row.placeLabel) === 'nucleo pedra grande'
    const links = Object.fromEntries(Object.entries(row.links).filter(([, values]) => values.length))
    return {
      id: stableId(row, city, index),
      date: row.date,
      time: row.time,
      city,
      status: rowStatus(row),
      ...(placeId === undefined ? {} : { placeId }),
      ...(row.placeLabel ? { placeLabel: row.placeLabel } : {}),
      activity: row.activity,
      transport: row.transport,
      lodging: '',
      costLabel: row.costLabel,
      reservation: row.reservation,
      notes: row.notes,
      sourceLabel,
      origin: 'docs',
      ...(Object.keys(links).length ? { cellLinks: links, sourceUrl: Object.values(links).flat()[0] } : {}),
      applyToAgenda: false,
      ...(isSecondCantareira ? { mapBase: false } : {}),
      docRowIndex: row.index,
    }
  })
}

function sameOfficialRow(row, official) {
  if (row.date !== official.date) return false
  if (row.placeId !== undefined && official.placeId !== undefined) return row.placeId === official.placeId
  return Boolean(row.placeLabel && official.placeLabel && normalizeName(row.placeLabel) === normalizeName(official.placeLabel))
}

function legacyRows(previous, officialRowsForCity, city) {
  const candidates = [...(previous.rows ?? []), ...(previous.optionalRows ?? [])]
  const unique = [...new Map(candidates.map((row) => [row.id, row])).values()]
  return unique.filter((row) => row.origin !== 'docs').filter((row) => row.city === city || (!row.city && city === 'sao-paulo')).filter((row) => !officialRowsForCity.some((official) => sameOfficialRow(row, official))).map((row) => ({
    ...row,
    city,
    origin: 'web-local',
    sourceLabel: row.sourceLabel ? `Referencia web local · ${row.sourceLabel}` : 'Referencia web local',
    applyToAgenda: false,
  }))
}

function docNoteId(note, index) {
  return `docs-note-${note.section}-${index + 1}`
}

function optionalItems(previous, parsed, city) {
  const mapItems = (previous.optionalStops ?? []).map((item) => ({
    id: `web-option-${city}-${item.placeId}-${item.suggestedDay}`,
    title: item.title,
    detail: item.reason,
    date: `2026-12-${String(item.suggestedDay).padStart(2, '0')}`,
    placeId: item.placeId,
    status: item.status,
    source: 'web-local',
    sourceLabel: 'Catálogo web local',
    applyToAgenda: false,
  }))
  const notes = parsed.docNotes.map((note, index) => ({
    id: docNoteId(note, index),
    title: note.text,
    detail: note.kind === 'heading' ? 'Lista de referencias que el Doc deja fuera del itinerario.' : undefined,
    links: note.links,
    ...(note.links[0] ? { sourceUrl: note.links[0] } : {}),
    source: 'Google Docs',
    sourceLabel: 'Google Docs · nota fuera de tabla',
    applyToAgenda: false,
    status: 'opcional',
  }))
  const legacyBase = previous.mapBase?.id === 'injoy-rio' ? previous.mapBase : previous.optionalItems?.find((item) => item.id === 'web-lodging-injoy-rio')
  const oldBase = city === 'rio' ? [{
    id: 'web-lodging-injoy-rio',
    title: legacyBase?.name ?? 'Injoy Botafogo · base propuesta',
    detail: `${legacyBase?.address ?? 'Botafogo, Rio de Janeiro · dirección a reconfirmar al reservar'}. Referencia web anterior; no es la base indicada por el Doc actual.`,
    source: 'web-local',
    sourceLabel: 'Referencia web local anterior',
    ...(legacyBase?.sourceUrl ? { sourceUrl: legacyBase.sourceUrl } : { sourceUrl: 'https://www.booking.com/hotel/br/injoy-hostel-design.pt-br.html' }),
    applyToAgenda: false,
  }] : []
  const legacyLandmarks = city === 'rio' ? (previous.mapLandmarks ?? []).map((landmark) => ({
    id: `web-landmark-${landmark.id}`,
    title: landmark.label,
    detail: `${landmark.note} Se conserva como referencia opcional; no forma parte de la ruta oficial del Doc.`,
    source: 'web-local',
    sourceLabel: 'Referencia web local · landmark anterior',
    sourceUrl: landmark.sourceUrl,
    applyToAgenda: false,
  })) : []
  const legacyLandmarkFallbacks = city === 'rio' ? [
    {
      id: 'web-landmark-cosme-velho-station',
      title: 'Estação do Trem do Corcovado · Rua Cosme Velho 513',
      detail: 'Referencia web local del tren; no es el acceso VAN/Paineiras elegido por el Doc actual.',
      source: 'web-local',
      sourceLabel: 'Referencia web local · landmark anterior',
      sourceUrl: 'https://www.openstreetmap.org/node/4476763090',
      applyToAgenda: false,
    },
  ] : []
  const preservedWeb = (previous.optionalItems ?? []).filter((item) => item.source === 'web-local' && item.id !== 'web-landmark-horto-dropoff-915')
  return [...new Map([...preservedWeb, ...mapItems, ...notes, ...oldBase, ...legacyLandmarks, ...legacyLandmarkFallbacks].map((item) => [item.id, item])).values()]
}

function updateRioBase(previous) {
  if (!previous.mapBase || previous.mapBase.id !== 'injoy-rio') return previous.mapBase
  return {
    id: 'hospedaria-rio',
    name: 'Hospedaria Rio · candidata',
    address: 'Rua Vicente de Sousa, 29 · Botafogo · Rio de Janeiro · CEP 22251-070',
    coordinates: { lat: -22.9471365, lon: -43.1852663, confidence: 'aproximada-geocoder-osm · dirección oficial verificada' },
    status: 'No reservado · pendiente de reservar',
    bookingUrl: 'https://www.hospedariario.com.br/',
    sourceUrl: 'https://www.hospedariario.com.br/',
    note: 'Dirección publicada por Hospedaria Rio y geocodificada en OpenStreetMap; confirma la ubicación y disponibilidad antes de reservar.',
  }
}

function replaceBaseNames(value) {
  if (typeof value === 'string') return value.replaceAll('Injoy Botafogo', 'Hospedaria Rio').replaceAll('Injoy Suítes & Aparts', 'Hospedaria Rio')
  if (Array.isArray(value)) return value.map(replaceBaseNames)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceBaseNames(item)]))
  return value
}

function updateRioMapDirections(previous, parsed) {
  const directions = replaceBaseNames(previous.mapDirections ?? [])
  const hasCristo = parsed.rows.some((row) => normalizeName(row.placeLabel ?? '').includes('cristo redentor'))
  const hasHorto = parsed.rows.some((row) => normalizeName(row.placeLabel ?? '').includes('cachoeiras do horto'))
  return directions.map((day) => {
    if (day.day === 10 && hasCristo) return {
      ...day,
      legs: day.legs.filter((leg) => !/Cosme Velho|Cristo|Corcovado/i.test(`${leg.from} ${leg.to} ${leg.label}`)),
      note: 'El Doc elige el acceso VAN/Paineiras para Cristo y conserva su enlace de mapa en la fila oficial. No se inventa el origen de la van ni se usa Cosme Velho como destino automático; la referencia del tren queda en Opcionales.',
    }
    if (day.day === 13 && hasHorto) return {
      ...day,
      legs: day.legs.filter((leg) => !/Pacheco Leão 915|Horto|Cachoeiras/i.test(`${leg.from} ${leg.to} ${leg.label}`)),
      note: 'El Doc conserva el enlace de entrada de Cachoeiras do Horto en Lugar/Notas. Se invalida la referencia web antigua de Rua Pacheco Leão 915 hasta verificar que coincida con esa entrada.',
    }
    return day
  })
}

export function buildItineraryData(parsed, previous, { city, startDay, endDay, capturedAt = parsed.capturedAt ?? '2026-10-18T04:04:15.000Z' }) {
  const official = officialRows(parsed, city, startDay, endDay)
  const data = {
    ...previous,
    year: 2026,
    yearIsAssumption: true,
    city,
    columns,
    rows: official,
    optionalRows: legacyRows(previous, official, city),
    optionalItems: optionalItems(previous, parsed, city),
    docNotes: parsed.docNotes,
    sync: { source: 'Google Docs', syncedAt: capturedAt, snapshotHash: parsed.snapshotHash, mode: 'manual', sourceUrl: parsed.sourceUrl },
    mapBase: city === 'rio' ? updateRioBase(previous) : previous.mapBase,
    mapDirections: city === 'rio' ? updateRioMapDirections(previous, parsed) : previous.mapDirections,
    mapLandmarks: city === 'rio' ? (previous.mapLandmarks ?? []).filter((landmark) => !['cosme-velho-station', 'horto-dropoff-915'].includes(landmark.id)) : previous.mapLandmarks,
  }
  return data
}

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')) }

function argValue(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

async function writeAtomically(path, value, tempDir) {
  const tempPath = resolve(tempDir, `${basename(path)}.tmp`)
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tempPath, path)
}

async function main() {
  const args = process.argv.slice(2)
  const htmlPath = argValue(args, '--html')
  if (!htmlPath || args.includes('--help')) {
    console.error('Uso: node scripts/google-doc-import.mjs --html /ruta/export.html [--captured-at ISO]')
    process.exitCode = htmlPath ? 0 : 2
    return
  }
  const html = await readFile(resolve(htmlPath), 'utf8')
  const capturedAt = argValue(args, '--captured-at') ?? '2026-10-18T04:04:15.000Z'
  if (Number.isNaN(Date.parse(capturedAt))) throw new Error('GOOGLE_DOC_IMPORT_CAPTURED_AT_INVALID')
  const parsed = parseGoogleDocsHtml(html, { capturedAt })
  if (parsed.rows.some((row) => Number(row.date.slice(8, 10)) < 2 || Number(row.date.slice(8, 10)) > 23)) throw new Error('GOOGLE_DOC_IMPORT_DAY_UNSUPPORTED')
  const spPath = resolve(projectRoot, 'docs/data/itinerario.json')
  const rioPath = resolve(projectRoot, 'docs/data/itinerario-rio.json')
  const previousSp = await readJson(spPath)
  const previousRio = await readJson(rioPath)
  const nextSp = buildItineraryData(parsed, previousSp, { city: 'sao-paulo', startDay: 2, endDay: 8, capturedAt })
  const nextRio = buildItineraryData(parsed, previousRio, { city: 'rio', startDay: 9, endDay: 23, capturedAt })
  const tempDir = await mkdtemp(resolve(tmpdir(), 'mi-itinerario-docs-'))
  await writeAtomically(spPath, nextSp, tempDir)
  await writeAtomically(rioPath, nextRio, tempDir)
  console.log(`Importación manual completada: ${nextSp.rows.length} filas SP, ${nextRio.rows.length} filas Río (incluye ${nextRio.rows.filter((row) => !row.placeLabel && !row.activity && !row.time).length} fechas vacías), snapshot ${parsed.snapshotHash}.`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error instanceof Error ? error.message : 'GOOGLE_DOC_IMPORT_FAILED'); process.exitCode = 1 })
