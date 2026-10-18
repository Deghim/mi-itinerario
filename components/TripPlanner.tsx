'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { clearTripState, readTripState, supportedTravelYears, writeTripState } from '@/lib/trip-storage'
import { planAgendaApplication } from '@/lib/itinerary-model'
import { clearItineraryOverrides, readItineraryOverrides, writeItineraryOverrides } from '@/lib/itinerary-storage'
import type { ItineraryOverrides, ItineraryRowOverride } from '@/types/itinerary'
import BudgetSection from './BudgetSection'
import DaySchedule from './DaySchedule'
import ItineraryTable from './ItineraryTable'
import OptionalSection from './OptionalSection'
import { DEFAULT_DAILY_ROUTINE } from '@/lib/schedule'
import type { LocalTripState, SavedPlaceState } from '@/types/place'
import type { CityId } from '@/types/place'
import { tripCities } from '@/lib/trip-cities'

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => <div className="map-loading">Preparando el mapa…</div>,
})

const EMPTY_STATE: LocalTripState = { favorites: [], placeStates: {}, dayAssignments: {}, travelYear: 2026, updatedAt: '' }
const tabs = [
  { id: 'itinerario', label: 'Itinerario', icon: '◷' },
  { id: 'lugares', label: 'Lugares', icon: '⌖' },
  { id: 'presupuesto', label: 'Presupuesto', icon: '＄' },
  { id: 'documentos', label: 'Documentos', icon: '▤' },
] as const
type TabId = (typeof tabs)[number]['id']

const startDate = 2
const endDate = 23

function daysForYear(year: number) {
  return Array.from({ length: endDate - startDate + 1 }, (_, index) => {
    const day = startDate + index
    return { day, date: new Date(year, 11, day), iso: `${year}-12-${String(day).padStart(2, '0')}` }
  })
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short' }).format(date).replace('.', '')
}

export default function TripPlanner() {
  const [activeCity, setActiveCity] = useState<CityId>('sao-paulo')
  const city = tripCities[activeCity]
  const places = city.places
  const itineraryData = city.itinerary
  const tripFile = city.tripFile
  const itinerary = city.itinerary
  const TABLE_STORAGE_KEY = city.itineraryOverridesKey
  const emptyState = useMemo(() => ({ ...EMPTY_STATE, travelYear: city.tripFile.travelYear }), [city])
  const atlasPlaces = places.filter((place) => place.catalogType !== 'complemento')
  const draftPlaceCount = atlasPlaces.filter((place) => place.statusFromDraft === 'marcado-visitables').length
  const draftHistoricCount = atlasPlaces.filter((place) => place.statusFromDraft === 'marcado-cerrado-o-historico').length
  const [activeTab, setActiveTab] = useState<TabId>('itinerario')
  const [state, setState] = useState<LocalTripState>({ ...EMPTY_STATE, travelYear: tripCities['sao-paulo'].tripFile.travelYear })
  const [itineraryOverrides, setItineraryOverrides] = useState<ItineraryOverrides>({})
  const [tableReady, setTableReady] = useState(false)
  const [ready, setReady] = useState(false)
  const [loadedCity, setLoadedCity] = useState<CityId | null>(null)
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [zone, setZone] = useState('Todas las zonas')
  const [showHistorical, setShowHistorical] = useState(true)
  const [selectedMapPlace, setSelectedMapPlace] = useState<number>()
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [selectedPlanningDay, setSelectedPlanningDay] = useState<number | null>(null)
  const [selectedAgendaDay, setSelectedAgendaDay] = useState(4)

  useEffect(() => {
    let mounted = true
    window.queueMicrotask(() => {
      if (!mounted) return
      try {
        setState(readTripState(window.localStorage, city.storageKey, emptyState, places.map((place) => place.id)))
        setItineraryOverrides(readItineraryOverrides(window.localStorage, TABLE_STORAGE_KEY, itinerary.rows))
      } catch {
        setNotice('No se pudieron recuperar los cambios guardados en este navegador.')
      } finally {
        setTableReady(true)
        setReady(true)
        setLoadedCity(activeCity)
      }
    })
    return () => { mounted = false }
  }, [activeCity, city, emptyState, itinerary.rows, places, TABLE_STORAGE_KEY])

  useEffect(() => {
    if (!ready || loadedCity !== activeCity) return
    try {
      writeTripState(window.localStorage, city.storageKey, state)
    } catch {
      window.queueMicrotask(() => setNotice('El navegador no pudo guardar los cambios locales. Revisa el espacio disponible.'))
    }
  }, [activeCity, city.storageKey, loadedCity, ready, state])

  useEffect(() => {
    if (!tableReady || loadedCity !== activeCity || itinerary.sync) return
    try { writeItineraryOverrides(window.localStorage, TABLE_STORAGE_KEY, itineraryOverrides, itinerary.rows) }
    catch { window.queueMicrotask(() => setNotice('No se pudieron guardar las notas de la tabla en este dispositivo.')) }
  }, [activeCity, itinerary.sync, itinerary.rows, loadedCity, tableReady, TABLE_STORAGE_KEY, itineraryOverrides])

  const calendar = useMemo(() => daysForYear(state.travelYear), [state.travelYear])
  const filteredPlaces = useMemo(() => places.filter((place) => {
    const searchable = `${place.name} ${place.zone} ${place.addressFromDraft} ${place.descriptionFromDraft}`.toLocaleLowerCase('es')
    const statusMatches = showHistorical || place.statusFromDraft !== 'marcado-cerrado-o-historico'
    const zoneMatches = zone === 'Todas las zonas' || place.zone === zone
    const favoriteMatches = !showFavoritesOnly || state.favorites.includes(place.id)
    return statusMatches && zoneMatches && favoriteMatches && searchable.includes(query.toLocaleLowerCase('es').trim())
  }), [places, query, showFavoritesOnly, showHistorical, state.favorites, zone])

  const favorites = places.filter((place) => state.favorites.includes(place.id))
  const assignedPlaces = places.filter((place) => Number(state.dayAssignments[place.id]) >= 2 && Number(state.dayAssignments[place.id]) <= 23)

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

  function savePlaceSchedule(placeId: number, schedule: NonNullable<LocalTripState['placeSchedule']>[number]) {
    setState((current) => ({ ...current, placeSchedule: { ...current.placeSchedule, [placeId]: schedule } }))
  }

  function removePlaceSchedule(placeId: number) {
    setState((current) => {
      const placeSchedule = { ...current.placeSchedule }
      delete placeSchedule[placeId]
      return { ...current, placeSchedule }
    })
  }

  function saveItineraryOverride(rowId: string, value: ItineraryRowOverride) {
    setItineraryOverrides((current) => ({ ...current, [rowId]: value }))
  }

  function applyItineraryProposal() {
    if (state.travelYear !== itinerary.year) return setNotice(`Esta propuesta corresponde a ${itinerary.year}; no se aplicó a otro año.`)
    const result = planAgendaApplication(places, itinerary.rows, state.dayAssignments, state.placeSchedule ?? {})
    setState((current) => ({ ...current, dayAssignments: result.dayAssignments, placeSchedule: result.placeSchedule }))
    const parts = [`Se añadieron ${result.added.length} visitas con horario sugerido a la agenda.`]
    const names = (ids: number[]) => ids.map((id) => places.find((place) => place.id === id)?.name ?? String(id)).join(', ')
    if (result.skippedManual.length) parts.push(`Se conservaron sin cambios tus asignaciones u horarios manuales: ${names(result.skippedManual)}.`)
    if (result.skippedConflict.length) parts.push(`Se omitieron por solapamiento: ${names(result.skippedConflict)}. Revisa la propuesta antes de volver a aplicarla.`)
    setNotice(parts.join(' '))
  }

  function resetLocalData() {
    if (!window.confirm('¿Borrar favoritos, estados, días, horarios, rutina y notas locales de tabla guardados en este navegador?')) return
    try { clearTripState(window.localStorage, city.storageKey) } catch { /* Se reemplazará por el estado vacío de React. */ }
    try { clearItineraryOverrides(window.localStorage, TABLE_STORAGE_KEY) } catch { /* Se reemplazarán las notas en React. */ }
    setState(emptyState)
    setItineraryOverrides({})
    setNotice('Se borraron los cambios locales de este navegador.')
  }

  function nav(tab: TabId) {
    setActiveTab(tab)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function navigateToBudgetPlace(placeId: number) {
    setSelectedMapPlace(placeId)
    nav('lugares')
  }

  function changeCity(nextCity: CityId) {
    if (nextCity === activeCity) return
    setActiveCity(nextCity)
    setSelectedPlanningDay(null)
    setSelectedAgendaDay(tripCities[nextCity].startDay)
    setSelectedMapPlace(undefined)
    setQuery('')
    setZone('Todas las zonas')
    setShowFavoritesOnly(false)
    setNotice(`Ahora estás viendo ${tripCities[nextCity].label}. Sus favoritos y agenda se guardan por separado en este dispositivo.`)
  }

  const mapProps = {
    city: city.id,
    cityLabel: city.label,
    places,
    itinerary: itineraryData,
    routeData: city.mapRoutes,
    selectedId: selectedMapPlace,
    onSelect: setSelectedMapPlace,
    selectedDay: selectedPlanningDay,
    onDayChange: (day: number | null) => { setSelectedPlanningDay(day); if (day !== null) setSelectedAgendaDay(day) },
    dayAssignments: state.dayAssignments,
    placeSchedule: state.placeSchedule,
    itineraryOverrides,
    travelYear: state.travelYear,
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="wordmark" href="#inicio" onClick={(event) => { event.preventDefault(); nav('itinerario') }} aria-label="Volver al inicio">
          <span className="wordmark-icon">✳</span>
          <span><b>mi itinerario</b><small>ATLAS DE VIAJE · BRASIL</small></span>
        </a>
        <div className="top-actions">
          <span className="sync-state"><i className={ready && loadedCity === activeCity ? 'sync-dot ready' : 'sync-dot'} />{ready && loadedCity === activeCity ? 'Guardado en este dispositivo' : 'Cargando tus cambios'}</span>
          <label className="city-selector">Ciudad<select aria-label="Elegir ciudad" value={activeCity} onChange={(event) => changeCity(event.target.value as CityId)}><option value="sao-paulo">São Paulo</option><option value="rio">Río de Janeiro</option></select></label>
          <button className="quiet-button" onClick={resetLocalData}>Reiniciar cambios</button>
        </div>
      </header>

      <nav className="main-nav" aria-label="Secciones del itinerario">
        {tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'nav-tab active' : 'nav-tab'} onClick={() => nav(tab.id)}>
          <span aria-hidden="true">{tab.icon}</span>{tab.label}
          {tab.id === 'lugares' && <span className="nav-count">{places.length}</span>}
        </button>)}
        <span className="trip-period">BRASIL <b>·</b> 02—23 DIC · mi agenda {state.travelYear}</span>
      </nav>

      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Cerrar aviso">×</button></div>}

      {activeTab === 'itinerario' && <>
        <section className={`hero ${activeCity === 'rio' ? 'hero-rio' : ''}`} id="inicio">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> {city.stage.toUpperCase()} <span>·</span> {city.label.toUpperCase()}</div>
            <h1>{activeCity === 'rio' ? <>Montañas, mar y<br /><em>una ciudad viva.</em></> : <>Una ciudad para<br /><em>perderse bien.</em></>}</h1>
            <p className="hero-description">{activeCity === 'rio' ? 'Cristo Redentor, barrios históricos y días flexibles; entradas y traslados siguen por confirmar.' : 'Lugares curiosos, días por construir y todo lo útil para empezar a recorrer São Paulo.'}</p>
            <div className="hero-tags"><span>⌖ Brasil</span><span>◷ {city.label} · {city.startDay}–{activeCity === 'rio' ? 13 : 8} dic · propuesta</span><span>✳ Mi agenda {state.travelYear} · Docs {itinerary.year}</span></div>
          </div>
          <div className="hero-stamp" aria-label={`${city.label}, Brasil`}>
            <div className="stamp-ring"><span>{activeCity === 'rio' ? '22°54′ S' : '23°33′ S'}</span><b>{activeCity === 'rio' ? 'RJ' : 'SP'}</b><span>{activeCity === 'rio' ? '43°12′ O' : '46°38′ O'}</span></div>
            <small>EST. PARA EXPLORAR</small>
          </div>
          <div className="hero-index"><span>ETAPA 01</span><i /></div>
        </section>

        <section className="trip-strip" aria-label="Fechas del viaje">
          <div className="strip-intro"><span className="tiny-label">DICIEMBRE · MI AGENDA {state.travelYear}</span><b>Tu viaje, a grandes rasgos</b><small>La agenda personal es editable; la fuente Docs conserva el año {itinerary.year}.</small></div>
          <div className="milestone"><span className="milestone-day">02</span><span><b>Vuelos en captura</b><small>Escalas; datos por confirmar</small></span></div>
          <div className="milestone current"><span className="milestone-day">03</span><span><b>Llegada a GRU · 09:10</b><small>Según captura compartida</small></span></div>
          <div className={`milestone ${activeCity === 'sao-paulo' ? 'open' : ''}`}><span className="milestone-day">03—08</span><span><b>São Paulo</b><small>{activeCity === 'sao-paulo' ? 'Etapa seleccionada' : 'Propuesta'}</small></span></div>
          <div className={`milestone ${activeCity === 'rio' ? 'open' : ''}`}><span className="milestone-day">09—13</span><span><b>Río · 5 noches</b><small>{activeCity === 'rio' ? 'Etapa seleccionada · no reservada' : 'Preferencia; traslado por decidir'}</small></span></div>
          <div className="strip-end"><span>VIAJE COMPLETO</span><b>02—23 DIC</b><small>Encuentro14 tentativo · GRU regreso23</small></div>
        </section>

        <div className="content-grid">
          <section className="main-column">
            <div className="section-heading"><div><span className="tiny-label">TU CUADERNO DE RUTA</span><h2>Arma tus días</h2></div><span className="section-mark">PLANEACIÓN</span></div>
            <div className="planning-note"><span>✳</span><p>{activeCity === 'sao-paulo' && <><b>Vuelos internacionales pagados · importe por informar.</b> </>}La tabla reúne horarios compartidos y propuestas de visitas o ventanas; confirma acceso, horarios operativos y reservas antes de salir. Puedes añadir a tu agenda solo lugares que aún no tengan una asignación manual.</p></div>
            <div className="date-board">
              <div className="date-board-head"><div><b>Etapa {city.label} · propuesta</b><span>{city.startDay}–{activeCity === 'rio' ? 13 : 8} dic · las reservas siguen pendientes</span><small>{tripFile.proposedPlan.pacePreference}</small></div><label className="year-select">AÑO DE MI AGENDA <select value={state.travelYear} onChange={(event) => setState((current) => ({ ...current, travelYear: Number(event.target.value) }))}>{supportedTravelYears.map((year) => <option key={year}>{year}</option>)}</select></label></div>
              <div className="personal-source-note"><b>Capas separadas:</b> tu agenda personal usa {state.travelYear}; la tabla oficial y el mapa de Google Docs usan {itinerary.year}. Cambiar este selector no mueve las fechas oficiales ni sus pines.</div>
              <div className="date-row">{calendar.map(({ day, date }) => {
                const isArrival = activeCity === 'sao-paulo' && day === 3
                const isPlanning = day >= city.startDay && day <= city.endDay
                const hasAssignment = Object.values(state.dayAssignments).includes(day)
                return <button key={day} className={`date-tile ${isArrival ? 'arrive' : ''} ${isPlanning ? 'planning' : ''} ${hasAssignment ? 'has-plan' : ''}`} onClick={() => {
                  setSelectedPlanningDay(day)
                  setSelectedAgendaDay(day)
                  const hasRows = itinerary.rows.some((row) => Number(row.date.slice(8, 10)) === day)
                  setNotice(hasRows ? `Día ${day} seleccionado. El mapa y la tabla muestran ${city.label}.` : `El ${day} dic no tiene paradas locales en esta etapa de ${city.label}; el resto del viaje sigue en construcción.`)
                }}>
                  <small>{formatWeekday(date)}</small><b>{String(day).padStart(2, '0')}</b><i>{isArrival ? 'llegada' : day === 2 ? 'salida' : day === 14 ? 'encuentro tentativo' : isPlanning ? (hasAssignment ? 'con plan' : 'por planear') : '—'}</i>
                </button>
              })}</div>
              <div className="date-board-foot"><span>● Fechas compartidas · Docs {itinerary.year}</span><span>○ {assignedPlaces.length} lugares con día elegido en mi agenda</span><span>Ciudad del encuentro pendiente</span></div>
            </div>

          </section>

          <section className="trip-map-wide">
            <div className="section-heading map-heading"><div><span className="tiny-label">RUTAS Y PARADAS · {selectedPlanningDay === null ? 'VISTA COMPLETA' : `${selectedPlanningDay} DIC`}</span><h2>Mapa de cada día</h2></div><button className="text-link" onClick={() => nav('lugares')}>Ver catálogo de lugares <span>↗</span></button></div>
            <MapView {...mapProps} />
          </section>

          <ItineraryTable
            data={itineraryData}
            places={places}
            city={activeCity}
            travelYear={state.travelYear}
            selectedDay={selectedPlanningDay}
            onDaySelect={(day) => { setSelectedPlanningDay(day); if (day !== null) setSelectedAgendaDay(day) }}
            state={state}
            overrides={itineraryOverrides}
            onSaveOverride={saveItineraryOverride}
            onApply={applyItineraryProposal}
            onNavigatePlace={navigateToBudgetPlace}
            onNavigateBudget={() => nav('presupuesto')}
          />

          <OptionalSection city={activeCity} rows={itinerary.optionalRows ?? []} items={itinerary.optionalItems ?? []} places={places} />

          <section className="main-column">

            <DaySchedule
              places={places}
              dayAssignments={state.dayAssignments}
              placeSchedule={state.placeSchedule ?? {}}
              routine={state.dailyRoutine ?? DEFAULT_DAILY_ROUTINE}
              selectedDay={selectedAgendaDay}
              days={calendar.map(({ day, date }) => ({ day, weekday: formatWeekday(date) }))}
              onSelectDay={setSelectedAgendaDay}
              onSavePlaceSchedule={savePlaceSchedule}
              onRemovePlaceSchedule={removePlaceSchedule}
              onSaveRoutine={(dailyRoutine) => setState((current) => ({ ...current, dailyRoutine }))}
              onChoosePlaces={(day) => { setSelectedPlanningDay(day); nav('lugares') }}
            />

            <div className="zone-summary">{Object.entries(places.reduce<Record<string, number>>((counts, place) => { counts[place.zone] = (counts[place.zone] ?? 0) + 1; return counts }, {})).map(([name, count]) => <button key={name} onClick={() => { setZone(name); nav('lugares') }}><b>{String(count).padStart(2, '0')}</b><span>{name}</span><i>↗</i></button>)}</div>

          </section>

          <aside className="side-column">
            <section className="side-card travel-card"><span className="tiny-label">RESUMEN DE LA ETAPA</span><div className="city-title"><span className="city-pin">⌖</span><div><b>{city.label}</b><small>Brasil · {city.stage.toLowerCase()}</small></div></div><div className="summary-stats"><div><b>{atlasPlaces.length}</b><small>referencias Atlas</small></div><div><b>{places.length - atlasPlaces.length}</b><small>complementos</small></div></div><p className="verify-callout">{draftPlaceCount} aparecen como visitables y {draftHistoricCount} como históricos/cerrados <b>en el borrador</b>. El acceso actual sigue por verificar.</p><button className="side-action" onClick={() => nav('lugares')}>Explorar los lugares <span>↗</span></button></section>
            <section className="side-card saved-card"><div className="side-title"><span className="tiny-label">TU LISTA</span><span className="favorite-count">{state.favorites.length}</span></div><h3>Lugares guardados</h3>{favorites.length ? <ul className="saved-list">{favorites.slice(0, 4).map((place) => <li key={place.id}><button onClick={() => { setSelectedMapPlace(place.id); nav('lugares') }}>{place.name}<span>↗</span></button></li>)}</ul> : <p>Guarda los sitios que te llamen la atención. Se quedarán en este dispositivo.</p>}<button className="side-action pale" onClick={() => { setShowFavoritesOnly(true); nav('lugares') }}>Ver mi lista <span>→</span></button></section>
            <section className="side-card friends-card"><span className="tiny-label">13 / 14 DICIEMBRE</span><div className="friend-icon">✳</div><h3>Encuentro con amigos</h3><p>La ciudad y el día siguen flexibles. Añade el dato cuando lo tengas; Río queda como opción por desarrollar.</p><button className="quiet-button" onClick={() => nav('documentos')}>Dejar una nota →</button></section>
            <div className="private-note"><span>▣</span><p><b>Tu privacidad</b><br />Los boletos, códigos y archivos personales no se guardan ni publican aquí.</p></div>
          </aside>
        </div>
      </>}

      {activeTab === 'lugares' && <section className="page-section places-page">
        <div className="page-title-row"><div><span className="tiny-label">LUGARES Y COMPLEMENTOS</span><h1>Lugares para descubrir</h1><p>{atlasPlaces.length} referencias de Atlas y {places.length - atlasPlaces.length} puntos complementarios; operación y acceso por confirmar.</p></div><span className="large-count">{places.length}<small>PUNTOS</small></span></div>
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
              <div className="place-card-bottom"><label>Mi estado <select value={savedState} onChange={(event) => setPlaceStatus(place.id, event.target.value as SavedPlaceState)}><option value="pendiente">Pendiente</option><option value="guardado">En mi lista</option><option value="visitado">Visitado</option><option value="descartado">Descartado</option></select></label><label>Mi día <select value={state.dayAssignments[place.id] ?? ''} onChange={(event) => assignPlace(place.id, event.target.value ? Number(event.target.value) : null)}><option value="">Sin asignar</option>{calendar.map(({ day, date }) => <option key={day} value={day}>{formatWeekday(date)} {day} dic</option>)}</select></label></div>
              <div className="place-links"><a href={place.sourceUrl ?? place.atlasUrl} target="_blank" rel="noreferrer">{place.sourceLabel === 'Atlas Obscura' ? 'Ficha Atlas Obscura ↗' : `${place.sourceLabel ?? 'Fuente pública'} ↗`}</a><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, ${place.addressFromDraft}, ${city.label}, Brasil`)}`} target="_blank" rel="noreferrer">Confirmar ubicación ↗</a><button onClick={() => setSelectedMapPlace(place.id)}>Ver en mapa ↓</button>{selectedPlanningDay !== null && <button className="assign-link" onClick={() => { assignPlace(place.id, selectedPlanningDay); setNotice(`${place.name} asignado al ${selectedPlanningDay} de diciembre.`) }}>Asignar al {selectedPlanningDay} dic +</button>}</div>
              {place.statusFromDraft === 'marcado-cerrado-o-historico' && <span className="historical-tag">EL BORRADOR LO MARCA HISTÓRICO / CERRADO</span>}
            </article>
          })}</div> : <div className="empty-state"><b>No encontramos lugares con esos filtros.</b><button onClick={() => { setQuery(''); setZone('Todas las zonas'); setShowFavoritesOnly(false); setShowHistorical(true) }}>Limpiar búsqueda</button></div>}
        </div><div className="places-map"><MapView {...mapProps} /><p>El mapa muestra el catálogo de {city.label} o los puntos del día seleccionado. Confirma accesos y direcciones antes de salir.</p></div></div>
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

      {activeTab === 'presupuesto' && <BudgetSection city={activeCity} onNavigatePlace={navigateToBudgetPlace} />}

      <footer className="footer"><a className="wordmark small-mark" href="#inicio" onClick={(event) => { event.preventDefault(); nav('itinerario') }}><span className="wordmark-icon">✳</span><span><b>mi itinerario</b><small>BRASIL · DICIEMBRE {state.travelYear}</small></span></a><p>Un plan hecho para cambiar de idea.<br /><span>Los datos prácticos se confirman antes de salir.</span></p><div className="footer-tools"><span>CAMBIOS GUARDADOS EN TU NAVEGADOR</span><button onClick={resetLocalData}>Borrar mis cambios</button></div></footer>
      <div className="mobile-nav" aria-label="Navegación móvil">{tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => nav(tab.id)}><span>{tab.icon}</span>{tab.label}</button>)}</div>
    </main>
  )
}
