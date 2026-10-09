'use client'

import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import itineraryData from '@/docs/data/itinerario.json'
import placesData from '@/docs/data/lugares-sao-paulo.json'
import { groupItineraryRows, itinerary, itineraryDayTone } from '@/lib/itinerary-model'
import type { ItineraryOverrides, ItineraryRow, ItineraryRowOverride, ItineraryStatus } from '@/types/itinerary'
import type { LocalTripState, Place } from '@/types/place'
import { calculateEndTime } from '@/lib/schedule'
import { buildGoogleDocsTableCopy } from '@/lib/itinerary-copy'

type Props = {
  travelYear: number
  state: LocalTripState
  overrides: ItineraryOverrides
  onSaveOverride: (rowId: string, value: ItineraryRowOverride) => void
  onApply: () => void
  onNavigatePlace: (placeId: number) => void
  onNavigateBudget: () => void
}

const places = placesData.places as Place[]
const statuses: Record<ItineraryStatus, string> = {
  'captura-compartida': 'Captura compartida',
  'confirmado-por-viajero': 'Confirmado por el viajero',
  propuesta: 'Propuesta, no reserva',
  condicional: 'Condicional',
  pendiente: 'Pendiente',
  tentativo: 'Tentativo',
}

const shortStatuses: Record<ItineraryStatus, string> = {
  'captura-compartida': 'Captura',
  'confirmado-por-viajero': 'Confirmado',
  propuesta: 'Propuesta',
  condicional: 'Condicional',
  pendiente: 'Pendiente',
  tentativo: 'Tentativo',
}

function displayDate(iso: string) {
  const day = Number(iso.slice(8, 10))
  const weekdays = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const date = new Date(Number(iso.slice(0, 4)), 11, day)
  return `${weekdays[date.getDay()]} ${day} dic`
}

function rowPlaceLabel(row: ItineraryRow) {
  return row.placeLabel ?? (row.placeId ? places.find((place) => place.id === row.placeId)?.name ?? `Lugar ${row.placeId}` : '—')
}

function effectiveTime(row: ItineraryRow, state: LocalTripState, useOfficialTime: boolean) {
  if (useOfficialTime) return { value: row.time, label: statuses[row.status] }
  if (!row.placeId || row.applyToAgenda === false) return { value: row.time, label: statuses[row.status] }
  const assignedDay = state.dayAssignments[row.placeId]
  if (assignedDay === undefined) return { value: row.time, label: statuses[row.status] }
  const schedule = state.placeSchedule?.[row.placeId]
  if (assignedDay !== Number(row.date.slice(8, 10))) {
    const when = schedule?.startTime ? ` · ${schedule.startTime}–${calculateEndTime(schedule.startTime, schedule.durationMinutes) ?? 'fin por corregir'}` : ' · sin hora'
    return { value: `${displayDate(`2026-12-${String(assignedDay).padStart(2, '0')}`)}${when}`, label: 'Mi agenda · movido' }
  }
  if (!schedule?.startTime) return { value: 'Sin hora en mi agenda', label: 'Mi asignación · horario pendiente' }
  return { value: `${schedule.startTime}–${calculateEndTime(schedule.startTime, schedule.durationMinutes) ?? 'fin por corregir'}`, label: 'Horario de mi agenda' }
}

function RowEditor({ row, value, onSave }: { row: ItineraryRow; value: ItineraryRowOverride; onSave: (value: ItineraryRowOverride) => void }) {
  const [form, setForm] = useState<ItineraryRowOverride>({
    transport: value.transport ?? row.transport,
    lodging: value.lodging ?? row.lodging,
    reservation: value.reservation ?? row.reservation,
    notes: value.notes ?? row.notes,
  })
  const [saved, setSaved] = useState(false)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave(form)
    setSaved(true)
  }
  return <details className="itinerary-row-editor"><summary>Editar transporte, hospedaje, reserva o notas en este dispositivo</summary><form onSubmit={submit}>
    <label>Transporte<input maxLength={300} value={form.transport ?? ''} onChange={(event) => setForm((current) => ({ ...current, transport: event.target.value }))} /></label>
    <label>Hospedaje<input maxLength={300} value={form.lodging ?? ''} onChange={(event) => setForm((current) => ({ ...current, lodging: event.target.value }))} /></label>
    <label>Reserva / boleto<textarea maxLength={300} rows={2} value={form.reservation ?? ''} onChange={(event) => setForm((current) => ({ ...current, reservation: event.target.value }))} /></label>
    <label>Notas<textarea maxLength={1000} rows={2} value={form.notes ?? ''} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
    <div><button type="submit" className="itinerary-save-button">Guardar solo en este dispositivo</button>{saved && <small role="status">Guardado localmente.</small>}</div>
  </form></details>
}

function statusClass(status: ItineraryStatus) {
  return `itinerary-status status-${status.replaceAll('-', '_')}`
}

export default function ItineraryTable({ travelYear, state, overrides, onSaveOverride, onApply, onNavigatePlace, onNavigateBudget }: Props) {
  const [dayFilter, setDayFilter] = useState('all')
  const [copyNotice, setCopyNotice] = useState('')
  const [copyFallback, setCopyFallback] = useState('')
  const fallbackRef = useRef<HTMLTextAreaElement>(null)
  const syncedSource = itinerary.sync
  const groupingState = syncedSource ? { travelYear: itinerary.year, dayAssignments: {} } : state
  const groups = groupItineraryRows(itinerary.rows, groupingState, itinerary.year, dayFilter === 'all' ? 'all' : Number(dayFilter))
  const candidates = itinerary.rows.filter((row) => row.placeId !== undefined && row.schedule && row.applyToAgenda === true)
  const coverage = itinerary.coverage
  const visitables = coverage.filter((item) => item.placeId <= 33)
  const historical = coverage.filter((item) => item.state === 'historico').length
  const counts = {
    propuesta: visitables.filter((item) => item.state === 'propuesta').length,
    condicional: visitables.filter((item) => item.state === 'condicional').length,
    pendiente: visitables.filter((item) => item.state === 'pendiente').length,
  }
  const columnWidths = ['7%', '8%', '12%', '15%', '10%', '9%', '10%', '11%', '18%']

  async function copyCanonicalTable() {
    const copy = buildGoogleDocsTableCopy(itinerary.rows, (id) => places.find((place) => place.id === id)?.name)
    setCopyFallback('')
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([copy.html], { type: 'text/html' }),
          'text/plain': new Blob([copy.text], { type: 'text/plain' }),
        })])
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copy.text)
      } else {
        throw new Error('clipboard-unavailable')
      }
      setCopyNotice('Tabla completa copiada. Pégala en Google Docs; esta acción no modifica ni sincroniza el documento.')
    } catch {
      setCopyFallback(copy.text)
      setCopyNotice('No se pudo copiar automáticamente. Selecciona el texto de la tabla y cópialo manualmente.')
    }
  }

  function renderRow(row: ItineraryRow, effectiveDate: string, mobile = false, firstInGroup = false) {
    const override = syncedSource ? {} : overrides[row.id] ?? {}
    const cell = {
      transport: override.transport ?? row.transport,
      lodging: override.lodging ?? row.lodging,
      reservation: override.reservation ?? row.reservation,
      notes: override.notes ?? row.notes,
    }
    const time = effectiveTime(row, state, Boolean(syncedSource))
    const sharedBudget = row.budgetId === 'paid:international-round-trip'
    const tone = itineraryDayTone(effectiveDate)
    return mobile ? <article className={`itinerary-mobile-card day-tone-${tone}`} key={row.id}>
        <div className="itinerary-mobile-place"><b>{rowPlaceLabel(row)}</b><span>{time.value}</span>{time.label !== statuses[row.status] && <small>{time.label}</small>}</div>
        <dl>
          <div><dt>Actividad</dt><dd>{row.activity} <span className={statusClass(row.status)}>{shortStatuses[row.status]}</span></dd></div>
          <div><dt>Transporte</dt><dd>{cell.transport}</dd></div>
          <div><dt>Hospedaje</dt><dd>{cell.lodging}</dd></div>
          <div><dt>Costo estimado</dt><dd>{row.costLabel}</dd></div>
          <div><dt>Reserva / boleto</dt><dd>{cell.reservation}</dd></div>
          <div><dt>Notas</dt><dd>{cell.notes}</dd></div>
          <div><dt>Fuente</dt><dd>{row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer">{row.sourceLabel} ↗</a> : row.sourceLabel}</dd></div>
        </dl>
        <div className="itinerary-row-actions">{row.placeId && <button type="button" onClick={() => onNavigatePlace(row.placeId!)}>Ver lugar {String(row.placeId).padStart(2, '0')}</button>}<button type="button" onClick={onNavigateBudget}>{sharedBudget ? 'Ver vuelos en Presupuesto' : 'Ver Presupuesto'}</button></div>
        {!syncedSource && <RowEditor key={`mobile-${row.id}-${JSON.stringify(override)}`} row={row} value={override} onSave={(value) => onSaveOverride(row.id, value)} />}
      </article> : <tr key={row.id} className={`itinerary-table-row day-tone-${tone}${firstInGroup ? ' day-group-start' : ''}`}>
        {firstInGroup && <th scope="rowgroup" rowSpan={groups.find((group) => group.date === effectiveDate)?.rows.length ?? 1} className={`itinerary-group-date day-tone-${tone}`}>{displayDate(effectiveDate)}</th>}
        <td>{time.value}{time.label !== statuses[row.status] && <small>{time.label}</small>}</td>
        <td>{row.placeId ? <button className="itinerary-inline-link" type="button" onClick={() => onNavigatePlace(row.placeId!)}>{rowPlaceLabel(row)}</button> : rowPlaceLabel(row)}</td>
        <td>{row.activity}<small><span className={statusClass(row.status)}>{shortStatuses[row.status]}</span></small>{row.sourceUrl && <small><a href={row.sourceUrl} target="_blank" rel="noreferrer">Fuente ↗</a></small>}</td>
        <td>{cell.transport}</td><td>{cell.lodging}</td>
        <td>{row.costLabel}<button className="itinerary-budget-link" type="button" onClick={onNavigateBudget}>{sharedBudget ? 'Ver vuelos en Presupuesto ↗' : 'Ver Presupuesto ↗'}</button></td>
        <td>{cell.reservation}</td><td>{cell.notes}{!syncedSource && <RowEditor key={`desktop-${row.id}-${JSON.stringify(override)}`} row={row} value={override} onSave={(value) => onSaveOverride(row.id, value)} />}</td>
      </tr>
  }

  return <section className="itinerary-table-section" aria-labelledby="itinerary-table-title">
    <div className="itinerary-table-heading"><div><span className="tiny-label">{syncedSource ? 'FUENTE OFICIAL · GOOGLE DOCS' : 'VISTA DE TRABAJO · FUENTE LOCAL'}</span><h2 id="itinerary-table-title">Itinerario en tabla</h2><p>Fechas de {itinerary.year}{itinerary.yearIsAssumption ? ', todavía provisionales' : ''}. Las horas son las del itinerario; accesos y horarios operativos se verifican por separado.</p></div><label>Ver fecha<select value={dayFilter} onChange={(event) => setDayFilter(event.target.value)}><option value="all">Todo el itinerario</option>{[...new Set([...itinerary.rows.map((row) => Number(row.date.slice(8, 10))), ...(syncedSource ? [] : Object.values(state.dayAssignments))])].sort((a, b) => a - b).map((day) => <option key={day} value={day}>{displayDate(`${itinerary.year}-12-${String(day).padStart(2, '0')}`)} · {itinerary.year}</option>)}</select></label></div>
    {syncedSource ? <div className="itinerary-table-note"><b>Sincronizado desde Google Docs · Itinerario web.</b> Última actualización: {new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chihuahua' }).format(new Date(syncedSource.syncedAt))}. Los cambios oficiales se hacen en el documento; tu agenda personal y favoritos de este navegador se conservan aparte. Los costos escritos aquí no se suman automáticamente al presupuesto.</div> : <div className="itinerary-table-note"><b>Fuente local de la página.</b> Google Docs todavía no está sincronizado. Esta tabla no cambia tu documento; tu agenda personal y favoritos se guardan en este navegador.</div>}
    {!syncedSource && <div className="itinerary-proposal-controls"><div><b>{candidates.length} visitas con horario sugerido</b><span>Añade los horarios sugeridos sin cambiar los lugares que ya organizaste.</span></div><button type="button" className="budget-primary-button" disabled={travelYear !== itinerary.year} onClick={onApply}>{travelYear !== itinerary.year ? `Propuesta de ${itinerary.year}; vuelve a ese año para aplicarla` : 'Aplicar propuesta a mi agenda'}</button></div>}
    <div className="itinerary-copy-controls"><div><b>Copia la tabla completa</b><span>Incluye las nueve columnas y todas las fechas. No copia cambios personales guardados en este navegador ni actualiza Google Docs.</span></div><button type="button" onClick={copyCanonicalTable}>Copiar para pegar en Google Docs</button></div>
    <p className="itinerary-copy-status" aria-live="polite">{copyNotice}</p>
    {copyFallback && <label className="itinerary-copy-fallback">Texto de la tabla<textarea ref={fallbackRef} readOnly value={copyFallback} onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => { fallbackRef.current?.focus(); fallbackRef.current?.select() }}>Seleccionar texto</button></label>}
    <p className="itinerary-scroll-note">Desplázate horizontalmente para ver todas las columnas.</p>
    <div className="itinerary-mobile-list">{groups.map((group) => <section key={group.date} className={`itinerary-mobile-day-group day-tone-${itineraryDayTone(group.date)}`} aria-label={displayDate(group.date)}><h3>{displayDate(group.date)}</h3>{group.rows.map((row) => renderRow(row, group.date, true))}</section>)}</div>
    <div className="itinerary-desktop-table-wrap" role="region" aria-label="Tabla del itinerario, desplazable horizontalmente" tabIndex={0}><table className="itinerary-desktop-table"><colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup><thead><tr>{itineraryData.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>{groups.map((group) => <tbody key={group.date} className={`day-tone-${itineraryDayTone(group.date)}`}>{group.rows.map((row, index) => renderRow(row, group.date, false, index === 0))}</tbody>)}</table></div>
    <section className="itinerary-coverage" aria-labelledby="coverage-title"><div><span className="tiny-label">LISTA DE COBERTURA DEL BORRADOR ATLAS</span><h3 id="coverage-title">36 referencias · {counts.propuesta} propuestas · {counts.condicional} condicionales · {counts.pendiente} pendientes · {historical} históricas</h3><p>“Propuesta” y “condicional” no significan reservado, abierto ni visitado. El catálogo conserva las tres referencias históricas fuera del conteo de sitios visitables.</p></div><details><summary>Ver estado de los 36 puntos</summary><ul>{coverage.map((item) => {
      const place = places.find((candidate) => candidate.id === item.placeId)
      const stateLabel = item.state === 'historico' ? 'Histórico' : item.state === 'propuesta' ? 'Propuesto' : item.state === 'condicional' ? 'Condicional' : 'Pendiente'
      return <li key={item.placeId}><b>{String(item.placeId).padStart(2, '0')} · {place?.name ?? `Lugar ${item.placeId}`}</b><span>{stateLabel} · {item.note}</span></li>
    })}</ul></details></section>
  </section>
}
