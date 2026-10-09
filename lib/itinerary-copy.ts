import type { ItineraryRow } from '@/types/itinerary'

const headers = ['Fecha', 'Hora', 'Lugar', 'Actividad', 'Transporte', 'Hospedaje', 'Costo estimado', 'Reserva / boleto', 'Notas']

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function plainCell(value: string) {
  return value.replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

function safeReservationState(value: string) {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX')
  if (/\b(?:no\s+pagad[oa]|sin\s+pago|pago\s+(?:por confirmar|pendiente|por definir)|por confirmar.{0,24}(?:pago|reserva)|(?:pago|reserva).{0,24}(?:por confirmar|pendiente|por definir))\b/.test(normalized)) return 'Por confirmar'
  if (/\b(?:sin\s+reserva|no\s+reservad[oa]|no\s+comprad[oa]|no\s+aplica|sin\s+boleto)\b/.test(normalized)) return 'Sin reserva'
  const hasPending = /\b(?:pendiente|por confirmar|por definir|por informar)\b/.test(normalized)
  const pendingAmount = /\b(?:importe|costo|precio|monto)\b.{0,24}\b(?:pendiente|por confirmar|por definir|por informar)\b/.test(normalized)
  const hasPaid = /\bpagad[oa]s?\b/.test(normalized)
  if (hasPending && (!hasPaid || !pendingAmount)) return 'Por confirmar'
  if (/\bpagad[oa]s?\b/.test(normalized)) return 'Pagado'
  if (/\bconfirmado por el viajero\b/.test(normalized)) return 'Confirmado por el viajero'
  if (/\b(?:reserva|boleto|entrada) confirmad[oa]\b/.test(normalized)) return 'Confirmado'
  if (/\bcondicional\b/.test(normalized)) return 'Condicional'
  if (/\bpropuesta\b/.test(normalized)) return 'Propuesta'
  if (/\b(?:sin reserva|no reservado|no comprado|no aplica)\b/.test(normalized)) return 'Sin reserva'
  return 'Por confirmar'
}

function displayPlace(row: ItineraryRow, placeName: (id: number) => string | undefined) {
  return row.placeLabel ?? (row.placeId ? placeName(row.placeId) ?? `Lugar ${row.placeId}` : '—')
}

export function buildGoogleDocsTableCopy(rows: ItineraryRow[], placeName: (id: number) => string | undefined) {
  const grouped = new Map<string, ItineraryRow[]>()
  rows.forEach((row) => {
    const current = grouped.get(row.date) ?? []
    current.push(row)
    grouped.set(row.date, current)
  })
  const ordered = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
  const htmlRows: string[] = []
  const textRows: string[] = [headers.join('\t')]
  for (const [date, group] of ordered) {
    group.forEach((row, index) => {
      const values = [
        index === 0 ? date : '',
        row.time,
        displayPlace(row, placeName),
        row.activity,
        row.transport,
        row.lodging,
        row.costLabel,
        safeReservationState(row.reservation),
        row.notes,
      ]
      const dateCell = index === 0 ? `<td rowspan="${group.length}">${escapeHtml(date)}</td>` : ''
      htmlRows.push(`<tr>${dateCell}${values.slice(1).map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`)
      textRows.push(values.map(plainCell).join('\t'))
    })
  }
  const html = `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${htmlRows.join('')}</tbody></table>`
  return { html, text: textRows.join('\n') }
}
