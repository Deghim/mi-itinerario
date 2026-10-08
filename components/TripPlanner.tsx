'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import placesFile from '@/docs/data/lugares-sao-paulo.json'
import tripFile from '@/docs/data/viaje.json'
import { clearTripState, readTripState, supportedTravelYears, writeTripState } from '@/lib/trip-storage'
import { createMapsRouteSegments } from '@/lib/maps-routes'
import type { LocalTripState, Place, SavedPlaceState } from '@/types/place'

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => <div className="map-loading">Preparando el mapa de São Paulo…</div>,
})

const places = placesFile.places as Place[]
const STORAGE_KEY = 'mi-itinerario:sao-paulo:v1'
const tabs = [
  { id: 'itinerario', label: 'Itinerario', icon: '◷' },
  { id: 'lugares', label: 'Lugares', icon: '⌖' },
  { id: 'documentos', label: 'Documentos', icon: '▤' },
] as const
type TabId = (typeof tabs)[number]['id']

const emptyState: LocalTripState = { favorites: [], placeStates: {}, dayAssignments: {}, travelYear: tripFile.travelYear, updatedAt: '' }
const draftPlaceCount = places.filter((place) => place.statusFromDraft === 'marcado-visitables').length
const draftHistoricCount = places.length - draftPlaceCount
const startDate = 2
const endDate = 14

function daysForYear(year: number) {
  return Array.from({ length: endDate - startDate + 1 }, (_, index) => {
    const day = startDate + index
    return { day, date: new Date(year, 11, day), iso: `${year}-12-${String(day).padStart(2, '0')}` }
  })
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short' }).format(date).replace('.', '')
}

function createZoneProposal() {
  const eligible = places.filter((place) => place.statusFromDraft === 'marcado-visitables')
  const remaining = [...eligible]
  const groups: Place[][] = []
  for (let day = 0; day < 3 && remaining.length; day += 1) {
    const slots = Math.ceil(remaining.length / (3 - day))
    const seed = remaining.shift()
    if (!seed) continue
    const group = [seed]
    while (group.length < slots && remaining.length) {
      const center = [group.reduce((sum, place) => sum + place.coordinates.lat, 0) / group.length,
        group.reduce((sum, place) => sum + place.coordinates.lon, 0) / group.length]
      let bestIndex = 0
      let bestDistance = Number.POSITIVE_INFINITY
      remaining.forEach((place, index) => {
        const dx = (place.coordinates.lon - center[1]) * Math.cos(center[0] * Math.PI / 180)
        const dy = place.coordinates.lat - center[0]
        const distance = dx * dx + dy * dy
        if (distance < bestDistance) { bestDistance = distance; bestIndex = index }
      })
      const nextPlace = remaining.splice(bestIndex, 1)[0]
      if (nextPlace) group.push(nextPlace)
    }
    groups.push(group)
  }
  return groups
}

export default function TripPlanner() {
  const [activeTab, setActiveTab] = useState<TabId>('itinerario')
  const [state, setState] = useState<LocalTripState>(emptyState)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [zone, setZone] = useState('Todas las zonas')
  const [showHistorical, setShowHistorical] = useState(true)
  const [selectedMapPlace, setSelectedMapPlace] = useState<number>()
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [selectedPlanningDay, setSelectedPlanningDay] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    window.queueMicrotask(() => {
      if (!mounted) return
      try {
        setState(readTripState(window.localStorage, STORAGE_KEY, emptyState))
      } catch {
        setNotice('No se pudieron recuperar los cambios guardados en este navegador.')
      } finally {
        setReady(true)
      }
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      writeTripState(window.localStorage, STORAGE_KEY, state)
    } catch {
      window.queueMicrotask(() => setNotice('El navegador no pudo guardar los cambios locales. Revisa el espacio disponible.'))
    }
  }, [ready, state])

  const calendar = useMemo(() => daysForYear(state.travelYear), [state.travelYear])
  const filteredPlaces = useMemo(() => places.filter((place) => {
    const searchable = `${place.name} ${place.zone} ${place.addressFromDraft} ${place.descriptionFromDraft}`.toLocaleLowerCase('es')
    const statusMatches = showHistorical || place.statusFromDraft !== 'marcado-cerrado-o-historico'
    const zoneMatches = zone === 'Todas las zonas' || place.zone === zone
    const favoriteMatches = !showFavoritesOnly || state.favorites.includes(place.id)
    return statusMatches && zoneMatches && favoriteMatches && searchable.includes(query.toLocaleLowerCase('es').trim())
  }), [query, showFavoritesOnly, showHistorical, state.favorites, zone])

  const proposal = useMemo(() => createZoneProposal(), [])
  const favorites = places.filter((place) => state.favorites.includes(place.id))
  const assignedPlaces = places.filter((place) => Number(state.dayAssignments[place.id]) >= 2 && Number(state.dayAssignments[place.id]) <= 13)

  function toggleFavorite(id: number) {
    setState((current) => ({ ...current, favorites: current.favorites.includes(id) ? current.favorites.filter((item) => item !== id) : [...current.favorites, id] }))
  }

  function setPlaceStatus(id: number, placeStatus: SavedPlaceState) {
    setState((current) => ({ ...current, placeStates: { ...current.placeStates, [id]: placeStatus } }))
  }

  function assignPlace(id: number, day: number | null) {
    setState((current) => {
      const dayAssignments = { ...current.dayAssignments }
      if (day === null) delete dayAssignments[id]
      else dayAssignments[id] = day
      return { ...current, dayAssignments }
    })
  }

  function distributeProposal() {
    setState((current) => {
      const dayAssignments = { ...current.dayAssignments }
      proposal.forEach((group, index) => group.forEach((place) => {
        if (place.id !== undefined) dayAssignments[place.id] = 4 + index
      }))
      return { ...current, dayAssignments }
    })
    setNotice('Propuesta aplicada a los días 4, 5 y 6. Puedes cambiar cada lugar.')
  }

  function resetLocalData() {
    if (!window.confirm('¿Borrar favoritos, estados y días guardados en este navegador?')) return
    try { clearTripState(window.localStorage, STORAGE_KEY) } catch { /* Se reemplazará por el estado vacío de React. */ }
    setState(emptyState)
    setNotice('Se borraron los cambios locales de este navegador.')
  }

  function nav(tab: TabId) {
    setActiveTab(tab)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="wordmark" href="#inicio" onClick={(event) => { event.preventDefault(); nav('itinerario') }} aria-label="Volver al inicio">
          <span className="wordmark-icon">✳</span>
          <span><b>mi itinerario</b><small>ATLAS DE VIAJE · BRASIL</small></span>
        </a>
        <div className="top-actions">
          <span className="sync-state"><i className={ready ? 'sync-dot ready' : 'sync-dot'} />{ready ? 'Guardado en este dispositivo' : 'Cargando tus cambios'}</span>
          <button className="quiet-button" onClick={resetLocalData}>Reiniciar cambios</button>
        </div>
      </header>

      <nav className="main-nav" aria-label="Secciones del itinerario">
        {tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'nav-tab active' : 'nav-tab'} onClick={() => nav(tab.id)}>
          <span aria-hidden="true">{tab.icon}</span>{tab.label}
          {tab.id === 'lugares' && <span className="nav-count">36</span>}
        </button>)}
        <span className="trip-period">BRASIL <b>·</b> 02—23 DIC {state.travelYear}</span>
      </nav>

      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Cerrar aviso">×</button></div>}

      {activeTab === 'itinerario' && <>
        <section className="hero" id="inicio">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> PRIMERA PARADA <span>·</span> SÃO PAULO</div>
            <h1>Una ciudad para<br /><em>perderse bien.</em></h1>
            <p className="hero-description">Lugares curiosos, días por construir y todo lo útil para empezar a recorrer São Paulo.</p>
            <div className="hero-tags"><span>⌖ Brasil</span><span>◷ 2–13 dic · etapa actual</span><span>✳ Año {state.travelYear} por confirmar</span></div>
          </div>
          <div className="hero-stamp" aria-label="São Paulo, Brasil">
            <div className="stamp-ring"><span>23°33′ S</span><b>SP</b><span>46°38′ O</span></div>
            <small>EST. PARA EXPLORAR</small>
          </div>
          <div className="hero-index"><span>ETAPA 01</span><i /></div>
        </section>

        <section className="trip-strip" aria-label="Fechas del viaje">
          <div className="strip-intro"><span className="tiny-label">DICIEMBRE · {state.travelYear}</span><b>Tu viaje, a grandes rasgos</b><small>Fechas recibidas; año y planes todavía editables.</small></div>
          <div className="milestone"><span className="milestone-day">02</span><span><b>Salida</b><small>Vuelo · por agregar</small></span></div>
          <div className="milestone current"><span className="milestone-day">03</span><span><b>Llegada a São Paulo</b><small>Inicio de esta etapa</small></span></div>
          <div className="milestone open"><span className="milestone-day">04—12</span><span><b>Días para planear</b><small>Visitas y ritmo por decidir</small></span></div>
          <div className="milestone"><span className="milestone-day">13 / 14</span><span><b>Encuentro con amigos</b><small>Ciudad y día flexibles</small></span></div>
          <div className="strip-end"><span>VIAJE COMPLETO</span><b>02—23 DIC</b><small>Río y regreso por definir</small></div>
        </section>

        <div className="content-grid">
          <section className="main-column">
            <div className="section-heading"><div><span className="tiny-label">TU CUADERNO DE RUTA</span><h2>Arma tus días</h2></div><span className="section-mark">PLANEACIÓN</span></div>
            <div className="planning-note"><span>✳</span><p><b>Sin reservas registradas.</b> Las fechas son una base de trabajo. Elige un día para cada lugar; puedes moverlo cuando tengas más claro el ritmo.</p></div>
            <div className="date-board">
              <div className="date-board-head"><div><b>Etapa São Paulo</b><span>2–13 diciembre · días 4–12 abiertos para planear</span></div><label className="year-select">AÑO <select value={state.travelYear} onChange={(event) => setState((current) => ({ ...current, travelYear: Number(event.target.value) }))}>{supportedTravelYears.map((year) => <option key={year}>{year}</option>)}</select></label></div>
              <div className="date-row">{calendar.map(({ day, date }) => {
                const isArrival = day === 3
                const isPlanning = day >= 4 && day <= 12
                const hasAssignment = Object.values(state.dayAssignments).includes(day)
                return <button key={day} className={`date-tile ${isArrival ? 'arrive' : ''} ${isPlanning ? 'planning' : ''} ${hasAssignment ? 'has-plan' : ''}`} onClick={() => {
                  setActiveTab(day >= 4 && day <= 12 ? 'lugares' : 'documentos')
                  if (day >= 4 && day <= 12) { setSelectedPlanningDay(day); setNotice(`Día seleccionado: ${day} de diciembre. Asigna los lugares que quieras.`) }
                  else setNotice(day >= 13 ? 'El encuentro con amigos puede ser el 13 o 14; la ciudad sigue pendiente.' : `El ${day} de diciembre está anotado como ${day === 2 ? 'salida' : 'llegada'}.`)
                }}>
                  <small>{formatWeekday(date)}</small><b>{String(day).padStart(2, '0')}</b><i>{isArrival ? 'llegada' : day === 2 ? 'salida' : day >= 13 ? 'encuentro' : isPlanning ? (hasAssignment ? 'con plan' : 'por planear') : '—'}</i>
                </button>
              })}</div>
              <div className="date-board-foot"><span>● Fechas compartidas</span><span>○ {assignedPlaces.length} lugares con día elegido</span><span>Ciudad del encuentro pendiente</span></div>
            </div>

            <div className="section-heading map-heading"><div><span className="tiny-label">36 HALLAZGOS · 5 ZONAS</span><h2>El mapa de la ciudad</h2></div><button className="text-link" onClick={() => nav('lugares')}>Ver lugares <span>↗</span></button></div>
            <MapView places={places} selectedId={selectedMapPlace} onSelect={setSelectedMapPlace} />
            <div className="map-legend"><span><i className="legend-green" /> Marcado visitable en el borrador</span><span><i className="legend-red" /> Marcado histórico/cerrado</span><span>Rutas de transporte ilustrativas</span></div>
            <div className="zone-summary">{Object.entries(places.reduce<Record<string, number>>((counts, place) => { counts[place.zone] = (counts[place.zone] ?? 0) + 1; return counts }, {})).map(([name, count]) => <button key={name} onClick={() => { setZone(name); nav('lugares') }}><b>{String(count).padStart(2, '0')}</b><span>{name}</span><i>↗</i></button>)}</div>

            <section className="suggestion-section">
              <div className="section-heading"><div><span className="tiny-label">AGRUPACIÓN GEOGRÁFICA</span><h2>Una idea para tres días</h2></div><span className="section-mark">NO SON FECHAS FIJAS</span></div>
              <p className="section-lede">El borrador agrupa por cercanía. Úsalo como punto de partida; confirma apertura, horarios y trayectos antes de comprometer cada día.</p>
              <div className="suggestion-grid">{proposal.map((group, index) => <article className="suggestion-card" key={index}>
                <span className="suggestion-number">0{index + 1}</span><div><span className="tiny-label">RUTA SUGERIDA</span><h3>{group.map((place) => place.zone).filter((value, i, all) => all.indexOf(value) === i).join(' + ')}</h3></div>
                <p>{group.slice(0, 4).map((place) => place.name).join(' · ')}{group.length > 4 ? ` y ${group.length - 4} más` : ''}</p>
                <div className="suggestion-links">{createMapsRouteSegments(group.map((place) => place.name)).map((segment, segmentIndex) => <a href={segment.url} key={segmentIndex} target="_blank" rel="noreferrer">Abrir tramo {segmentIndex + 1} · {segment.placeCount} paradas ↗</a>)}</div>
              </article>)}</div>
              <button className="outline-button" onClick={distributeProposal}>Usar propuesta en 4, 5 y 6 de diciembre <span>→</span></button>
            </section>
          </section>

          <aside className="side-column">
            <section className="side-card travel-card"><span className="tiny-label">RESUMEN DEL VIAJE</span><div className="city-title"><span className="city-pin">⌖</span><div><b>São Paulo</b><small>Brasil · etapa 1</small></div></div><div className="summary-stats"><div><b>36</b><small>lugares en la referencia</small></div><div><b>5</b><small>zonas para explorar</small></div></div><p className="verify-callout">{draftPlaceCount} aparecen como visitables y {draftHistoricCount} como históricos/cerrados <b>en el borrador</b>. Estado actual pendiente de verificar.</p><button className="side-action" onClick={() => nav('lugares')}>Explorar los lugares <span>↗</span></button></section>
            <section className="side-card saved-card"><div className="side-title"><span className="tiny-label">TU LISTA</span><span className="favorite-count">{state.favorites.length}</span></div><h3>Lugares guardados</h3>{favorites.length ? <ul className="saved-list">{favorites.slice(0, 4).map((place) => <li key={place.id}><button onClick={() => { setSelectedMapPlace(place.id); nav('lugares') }}>{place.name}<span>↗</span></button></li>)}</ul> : <p>Guarda los sitios que te llamen la atención. Se quedarán en este dispositivo.</p>}<button className="side-action pale" onClick={() => { setShowFavoritesOnly(true); nav('lugares') }}>Ver mi lista <span>→</span></button></section>
            <section className="side-card friends-card"><span className="tiny-label">13 / 14 DICIEMBRE</span><div className="friend-icon">✳</div><h3>Encuentro con amigos</h3><p>La ciudad y el día siguen flexibles. Añade el dato cuando lo tengas; Río queda como opción por desarrollar.</p><button className="quiet-button" onClick={() => nav('documentos')}>Dejar una nota →</button></section>
            <div className="private-note"><span>▣</span><p><b>Tu privacidad</b><br />Los boletos, códigos y archivos personales no se guardan ni publican aquí.</p></div>
          </aside>
        </div>
      </>}

      {activeTab === 'lugares' && <section className="page-section places-page">
        <div className="page-title-row"><div><span className="tiny-label">EL ATLAS DE SÃO PAULO</span><h1>Lugares para descubrir</h1><p>36 sitios del borrador, agrupados por zona. Cada ubicación y estado requiere confirmación.</p></div><span className="large-count">36<small>REFERENCIAS</small></span></div>
        <div className="places-layout"><div className="places-controls">
          <label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="Buscar lugares" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lugar, barrio o tema" /></label>
          <div className="filters-row"><label>Zona <select value={zone} onChange={(event) => setZone(event.target.value)}><option>Todas las zonas</option>{[...new Set(places.map((place) => place.zone))].map((value) => <option key={value}>{value}</option>)}</select></label><label>Estado del borrador <select value={showHistorical ? 'todos' : 'visitables'} onChange={(event) => setShowHistorical(event.target.value === 'todos')}><option value="todos">Todos</option><option value="visitables">Marcados visitables</option></select></label></div>
          {selectedPlanningDay !== null && <div className="selected-day-banner"><span>PLAN DE TRABAJO</span><b>{selectedPlanningDay} de diciembre</b><button onClick={() => setSelectedPlanningDay(null)}>Quitar selección ×</button></div>}
          <div className="filter-chips"><button className={showFavoritesOnly ? 'chip selected' : 'chip'} onClick={() => setShowFavoritesOnly((value) => !value)}>♡ Solo guardados ({state.favorites.length})</button><span>{filteredPlaces.length} resultados · estado actual sin verificar</span></div>
          {filteredPlaces.length ? <div className="place-list">{filteredPlaces.map((place) => {
            const savedState = state.placeStates[place.id] ?? 'pendiente'
            return <article className={`place-card ${place.statusFromDraft === 'marcado-cerrado-o-historico' ? 'historical' : ''} ${selectedMapPlace === place.id ? 'focused' : ''}`} key={place.id}>
              <div className="place-card-top"><span className="place-number">{String(place.id).padStart(2, '0')}</span><span className="place-zone">{place.zone}</span><button className={state.favorites.includes(place.id) ? 'favorite-button on' : 'favorite-button'} onClick={() => toggleFavorite(place.id)} aria-label={state.favorites.includes(place.id) ? 'Quitar de guardados' : 'Guardar lugar'}>{state.favorites.includes(place.id) ? '♥' : '♡'}</button></div>
              <h2>{place.name}</h2><p className="place-description">{place.descriptionFromDraft}</p>
              <div className="place-facts"><span>⌖ {place.addressFromDraft}</span><span>🚇 {place.nearestTransitFromDraft}</span><span className="verification">◌ Datos del borrador · por confirmar</span></div>
              <div className="place-card-bottom"><label>Mi estado <select value={savedState} onChange={(event) => setPlaceStatus(place.id, event.target.value as SavedPlaceState)}><option value="pendiente">Pendiente</option><option value="guardado">En mi lista</option><option value="visitado">Visitado</option><option value="descartado">Descartado</option></select></label><label>Mi día <select value={state.dayAssignments[place.id] ?? ''} onChange={(event) => assignPlace(place.id, event.target.value ? Number(event.target.value) : null)}><option value="">Sin asignar</option>{calendar.filter((date) => date.day >= 4 && date.day <= 12).map(({ day, date }) => <option key={day} value={day}>{formatWeekday(date)} {day} dic</option>)}</select></label></div>
              <div className="place-links"><a href={place.atlasUrl} target="_blank" rel="noreferrer">Ficha Atlas Obscura ↗</a><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.name}, São Paulo, Brasil`)}&travelmode=transit`} target="_blank" rel="noreferrer">Ruta en Maps ↗</a><button onClick={() => setSelectedMapPlace(place.id)}>Ver en mapa ↓</button>{selectedPlanningDay !== null && <button className="assign-link" onClick={() => { assignPlace(place.id, selectedPlanningDay); setNotice(`${place.name} asignado al ${selectedPlanningDay} de diciembre.`) }}>Asignar al {selectedPlanningDay} dic +</button>}</div>
              {place.statusFromDraft === 'marcado-cerrado-o-historico' && <span className="historical-tag">EL BORRADOR LO MARCA HISTÓRICO / CERRADO</span>}
            </article>
          })}</div> : <div className="empty-state"><b>No encontramos lugares con esos filtros.</b><button onClick={() => { setQuery(''); setZone('Todas las zonas'); setShowFavoritesOnly(false); setShowHistorical(true) }}>Limpiar búsqueda</button></div>}
        </div><div className="places-map"><MapView places={filteredPlaces} selectedId={selectedMapPlace} onSelect={setSelectedMapPlace} /><p>El mapa muestra coordenadas aproximadas del borrador. Revisa la ficha Atlas antes de planear el traslado.</p></div></div>
      </section>}

      {activeTab === 'documentos' && <section className="page-section documents-page">
        <div className="page-title-row"><div><span className="tiny-label">FUENTES Y MATERIALES</span><h1>Todo a mano</h1><p>Enlaces para seguir armando el viaje. Los archivos sensibles se quedan fuera de esta página.</p></div><span className="documents-mark">▤</span></div>
        <div className="documents-grid"><article className="document-card featured"><span className="document-icon">G</span><span className="tiny-label">DOCUMENTO DE TRABAJO</span><h2>Itinerario en Google Docs</h2><p>El documento que ya estás usando para reunir las ideas del viaje.</p><a href="https://docs.google.com/document/d/10JU5qUXjo-tAuudNIkiYDP7uIBwIQqixE3La01J09BM/edit?tab=t.0" target="_blank" rel="noreferrer">Abrir Google Docs ↗</a><small>Acceso según los permisos de Google.</small></article>
          <article className="document-card"><span className="document-icon atlas-icon">A</span><span className="tiny-label">FUENTE DE LUGARES</span><h2>Atlas Obscura · São Paulo</h2><p>Listado original usado como referencia para las 36 fichas de esta página.</p><a href="https://www.atlasobscura.com/things-to-do/sao-paulo-brazil/places?page=1" target="_blank" rel="noreferrer">Abrir listado ↗</a><small>Direcciones, operación y horarios por confirmar.</small></article>
          <article className="document-card"><span className="document-icon ticket-icon">⌑</span><span className="tiny-label">VUELOS Y BOLETOS</span><h2>Por agregar</h2><p>Deja aquí referencias de compra o enlaces cuando quieras. No pegues códigos de reserva ni pases personales en la página pública.</p><div className="private-placeholder">Enlaces públicos · pendientes</div></article>
          <article className="document-card"><span className="document-icon notes-icon">✎</span><span className="tiny-label">RESERVAS Y NOTAS</span><h2>Espacio de viaje</h2><p>Alojamiento, encuentro con amigos y notas prácticas. Río sigue como opción sin fechas confirmadas.</p><div className="private-placeholder">Ciudad del encuentro · por definir</div></article></div>
        <div className="privacy-panel"><span>▣</span><div><b>Los archivos personales no se publican desde aquí.</b><p>Boletos con códigos, pasaportes, localizadores de reserva, direcciones privadas y documentos se mantienen fuera del repositorio y del sitio público. Añade solo enlaces o detalles que quieras compartir.</p></div></div>
        <div className="source-list"><span className="tiny-label">FUENTES DEL MAPA</span><p><a href="https://www.metro.sp.gov.br/wp-content/uploads/2025/02/mapaderede.pdf" target="_blank" rel="noreferrer">Mapa oficial de transporte metropolitano ↗</a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap · atribución ↗</a></p></div>
      </section>}

      <footer className="footer"><a className="wordmark small-mark" href="#inicio" onClick={(event) => { event.preventDefault(); nav('itinerario') }}><span className="wordmark-icon">✳</span><span><b>mi itinerario</b><small>BRASIL · DICIEMBRE {state.travelYear}</small></span></a><p>Un plan hecho para cambiar de idea.<br /><span>Los datos prácticos se confirman antes de salir.</span></p><div className="footer-tools"><span>CAMBIOS GUARDADOS EN TU NAVEGADOR</span><button onClick={resetLocalData}>Borrar mis cambios</button></div></footer>
      <div className="mobile-nav" aria-label="Navegación móvil">{tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => nav(tab.id)}><span>{tab.icon}</span>{tab.label}</button>)}</div>
    </main>
  )
}
