'use client'

import { useMemo, useState } from 'react'
import type { ItineraryRow, OptionalItem } from '@/types/itinerary'
import type { CityId, Place } from '@/types/place'

type Props = {
  city: CityId
  rows: ItineraryRow[]
  items: OptionalItem[]
  places: Place[]
}

function formatDate(value?: string) {
  if (!value) return ''
  return `${Number(value.slice(8, 10))} dic`
}

export default function OptionalSection({ city, rows, items, places }: Props) {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<'all' | 'Google Docs' | 'web-local'>('all')
  const normalizedQuery = query.trim().toLocaleLowerCase('es')
  const filteredItems = useMemo(() => items.filter((item) => {
    const searchable = `${item.title} ${item.detail ?? ''} ${item.status ?? ''}`.toLocaleLowerCase('es')
    return (source === 'all' || item.source === source) && searchable.includes(normalizedQuery)
  }), [items, normalizedQuery, source])
  const filteredRows = useMemo(() => rows.filter((row) => {
    if (source === 'Google Docs') return false
    const searchable = `${row.date} ${row.placeLabel ?? ''} ${row.activity} ${row.transport} ${row.notes}`.toLocaleLowerCase('es')
    return searchable.includes(normalizedQuery)
  }), [normalizedQuery, rows, source])
  return <section className="optional-section" aria-labelledby={`optional-title-${city}`}>
    <div className="optional-heading"><div><span className="tiny-label">FUERA DE LA AGENDA OFICIAL</span><h2 id={`optional-title-${city}`}>Opcionales</h2><p>Referencias web locales y notas del Google Docs. No cambian las filas oficiales, el mapa base ni tus gastos personales.</p></div><span className="large-count">{filteredItems.length + filteredRows.length}<small>REFERENCIAS</small></span></div>
    <div className="optional-controls"><label>Buscar<input aria-label="Buscar opcionales" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nota, lugar o alternativa" /></label><label>Fuente<select value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="all">Todas</option><option value="Google Docs">Google Docs</option><option value="web-local">Web local</option></select></label></div>
    {filteredItems.length > 0 && <div className="optional-card-grid">{filteredItems.map((item) => <article className="optional-card" key={item.id}><div className="optional-card-meta"><span>{item.source === 'Google Docs' ? 'Google Docs' : 'Web local'}</span>{item.date && <span>{formatDate(item.date)}</span>}</div><h3>{item.title}</h3>{item.detail && <p>{item.detail}</p>}{item.placeId && <small>Lugar de catálogo: {places.find((place) => place.id === item.placeId)?.name ?? `#${item.placeId}`}</small>}{item.status && <small>Estado: {item.status} · no aplicado a la agenda</small>}<div className="optional-links">{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Fuente ↗</a>}{(item.links ?? []).map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">Enlace {index + 1} ↗</a>)}</div></article>)}</div>}
    {filteredRows.length > 0 && <details className="optional-legacy"><summary>Ver {filteredRows.length} filas web locales conservadas</summary><div className="optional-row-list">{filteredRows.map((row) => <article key={row.id}><div><b>{formatDate(row.date)} · {row.placeLabel ?? (row.activity || 'Fila logística')}</b><small>{row.time || 'Hora por definir'} · Web local · fuera de agenda</small></div><p>{row.activity}{row.notes ? ` · ${row.notes}` : ''}</p>{row.sourceUrl && <a href={row.sourceUrl} target="_blank" rel="noreferrer">Fuente ↗</a>}</article>)}</div></details>}
    {!filteredItems.length && !filteredRows.length && <p className="optional-empty">No hay opcionales con esos filtros.</p>}
  </section>
}
