'use client'

import { useEffect, useMemo, useState } from 'react'
import placesData from '@/docs/data/lugares-sao-paulo.json'
import { applyBudgetOverrides, calculateBudgetScenario, calculateBudgetTotals, getBudgetExchangeRate, getBudgetScenario, getDefaultBudgetState, planningMarginPercent } from '@/lib/budget-model'
import { BUDGET_STORAGE_KEY, clearBudgetState, readBudgetState, writeBudgetState } from '@/lib/budget-storage'
import type { BudgetCategory, BudgetEntry, BudgetLocalState, BudgetStatus, CalculatedBudgetEntry, LodgingScenario } from '@/types/budget'
import type { Place } from '@/types/place'

const categories: { id: BudgetCategory; label: string }[] = [
  { id: 'alojamiento', label: 'Alojamiento' },
  { id: 'traslados', label: 'Traslados' },
  { id: 'comida', label: 'Comida' },
  { id: 'actividades', label: 'Actividades' },
  { id: 'otros', label: 'Otros' },
]
const statuses: { id: BudgetStatus; label: string }[] = [
  { id: 'estimado', label: 'Estimado' },
  { id: 'cotizado', label: 'Cotizado' },
  { id: 'confirmado', label: 'Confirmado' },
  { id: 'pagado', label: 'Pagado' },
  { id: 'sin-importe', label: 'Sin importe' },
]
const lodgingOptions: { id: LodgingScenario; label: string }[] = [
  { id: 'privado-basico', label: 'Privado básico' },
  { id: 'privado-ensuite', label: 'Privado con baño' },
  { id: 'compartido', label: 'Compartido' },
  { id: 'mixto', label: 'Mixto' },
]
const places = (placesData.places as Place[]).map((place) => ({ id: place.id, name: place.name }))
const initialBudgetState = getDefaultBudgetState()

type Props = { onNavigatePlace: (placeId: number) => void }
type EditorForm = {
  name: string
  category: BudgetCategory
  unitAmount: string
  currency: 'BRL' | 'MXN'
  quantity: string
  unit: string
  status: BudgetStatus
  date: string
  sourceUrl: string
  sourceLabel: string
  placeId: string
  assumption: string
}

function currencyAmount(amount: number, currency: 'BRL' | 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}

function fmtMxn(amount: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(amount)
}

function getFormFromEntry(entry: Partial<BudgetEntry>): EditorForm {
  return {
    name: entry.name ?? '',
    category: entry.category ?? 'otros',
    unitAmount: entry.unitAmount === null || entry.unitAmount === undefined ? '' : String(entry.unitAmount),
    currency: entry.currency === 'MXN' ? 'MXN' : 'BRL',
    quantity: entry.quantity === undefined ? '1' : String(entry.quantity),
    unit: entry.unit ?? 'gasto',
    status: entry.status ?? 'estimado',
    date: entry.date ?? '',
    sourceUrl: entry.sourceUrl ?? '',
    sourceLabel: entry.sourceLabel ?? '',
    placeId: entry.placeId === undefined ? '' : String(entry.placeId),
    assumption: entry.assumption ?? '',
  }
}

function expenseId() {
  return `custom:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function BudgetEditor({ entry, isNew, onSave, onCancel, onRestore }: {
  entry: CalculatedBudgetEntry | BudgetEntry
  isNew: boolean
  onSave: (entry: BudgetEntry) => void
  onCancel: () => void
  onRestore?: () => void
}) {
  const [form, setForm] = useState(() => getFormFromEntry(entry))
  const [error, setError] = useState('')
  const update = <K extends keyof EditorForm>(key: K, value: EditorForm[K]) => setForm((current) => ({ ...current, [key]: value }))

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const quantity = Number(form.quantity)
    const unitAmount = form.unitAmount.trim() === '' ? null : Number(form.unitAmount)
    if (!form.name.trim() || form.name.trim().length > 120) return setError('Escribe un concepto de hasta 120 caracteres.')
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) return setError('La cantidad debe ser mayor que cero.')
    if (unitAmount !== null && (!Number.isFinite(unitAmount) || unitAmount < 0)) return setError('Escribe un precio válido o deja el campo vacío para indicar importe desconocido.')
    if (form.sourceUrl.trim() && !/^https:\/\//i.test(form.sourceUrl.trim())) return setError('El enlace de fuente debe empezar con https://.')
    const amount = unitAmount === null ? null : unitAmount * quantity
    const saved: BudgetEntry = {
      id: entry.id || expenseId(),
      recordKind: isNew ? 'custom' : entry.recordKind,
      name: form.name.trim(), category: form.category,
      amount, unitAmount, currency: unitAmount === null ? null : form.currency,
      quantity, unit: form.unit.trim() || 'gasto', status: unitAmount === null && form.status !== 'pagado' ? 'sin-importe' : form.status,
      ...(form.date ? { date: form.date } : {}),
      ...(form.sourceUrl.trim() ? { sourceUrl: form.sourceUrl.trim() } : {}),
      ...(form.sourceLabel.trim() ? { sourceLabel: form.sourceLabel.trim() } : {}),
      ...(form.placeId ? { placeId: Number(form.placeId) } : {}),
      ...(form.assumption.trim() ? { assumption: form.assumption.trim() } : {}),
    }
    onSave(saved)
  }

  return <form className="budget-editor" onSubmit={save}>
    <div className="budget-editor-heading"><b>{isNew ? 'Agregar un gasto' : 'Editar este gasto'}</b><button type="button" className="budget-icon-button" onClick={onCancel} aria-label="Cerrar edición">×</button></div>
    <p className="budget-editor-note">{isNew ? 'Gasto adicional: revisa que no repita alojamiento, vuelos o traslados ya listados.' : 'Puedes completar un importe desconocido o actualizar esta estimación. El cambio se guarda solo en este dispositivo.'}</p>
    <div className="budget-form-grid">
      <label className="budget-field budget-field-wide">Concepto<input maxLength={120} required value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
      <label className="budget-field">Categoría<select value={form.category} onChange={(event) => update('category', event.target.value as BudgetCategory)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
      <label className="budget-field">Estado<select value={form.status} onChange={(event) => update('status', event.target.value as BudgetStatus)}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
      <label className="budget-field">Precio por unidad<input inputMode="decimal" type="number" min="0" step="0.01" placeholder="Vacío = sin importe" value={form.unitAmount} onChange={(event) => update('unitAmount', event.target.value)} /></label>
      <label className="budget-field">Moneda<select value={form.currency} onChange={(event) => update('currency', event.target.value as 'BRL' | 'MXN')}><option value="BRL">BRL · reales</option><option value="MXN">MXN · pesos</option></select></label>
      <label className="budget-field">Cantidad<input inputMode="decimal" type="number" min="0.01" step="0.01" required value={form.quantity} onChange={(event) => update('quantity', event.target.value)} /></label>
      <label className="budget-field">Unidad<input maxLength={80} value={form.unit} onChange={(event) => update('unit', event.target.value)} placeholder="noche, pasaje, entrada…" /></label>
      <label className="budget-field">Fecha (opcional)<input type="date" min="2026-12-02" max="2026-12-23" value={form.date} onChange={(event) => update('date', event.target.value)} /></label>
      <label className="budget-field">Lugar relacionado<select value={form.placeId} onChange={(event) => update('placeId', event.target.value)}><option value="">Sin lugar relacionado</option>{places.map((place) => <option key={place.id} value={place.id}>{String(place.id).padStart(2, '0')} · {place.name}</option>)}</select></label>
      <label className="budget-field budget-field-wide">Enlace de fuente (opcional)<input type="url" placeholder="https://…" value={form.sourceUrl} onChange={(event) => update('sourceUrl', event.target.value)} /></label>
      <label className="budget-field budget-field-wide">Nota o supuesto<textarea maxLength={600} rows={2} value={form.assumption} onChange={(event) => update('assumption', event.target.value)} placeholder="Por ejemplo, tarifa por persona o precio que aún puede cambiar." /></label>
    </div>
    {error && <p className="budget-form-error" role="alert">{error}</p>}
    <div className="budget-form-actions"><button className="budget-primary-button" type="submit">Guardar en este dispositivo</button>{onRestore && <button className="budget-secondary-button" type="button" onClick={onRestore}>Restaurar referencia</button>}<button className="budget-secondary-button" type="button" onClick={onCancel}>Cancelar</button></div>
  </form>
}

function BudgetRow({ row, edited, onEdit, onRemove, onNavigatePlace }: {
  row: CalculatedBudgetEntry
  edited: boolean
  onEdit: () => void
  onRemove: () => void
  onNavigatePlace: (id: number) => void
}) {
  const amount = row.amount === null || row.currency === null ? null : currencyAmount(row.amount, row.currency)
  const unitAmount = row.unitAmount === null || row.currency === null ? null : currencyAmount(row.unitAmount, row.currency)
  const statusLabel = statuses.find((status) => status.id === row.status)?.label ?? row.status
  return <article className={`budget-line ${row.status === 'pagado' ? 'is-paid' : ''}`}>
    <div className="budget-line-main">
      <div className="budget-line-title"><h3>{row.name}</h3><span className={`budget-status status-${row.status}`}>{statusLabel}</span></div>
      {row.amount === null || row.currency === null
        ? <p className="budget-unknown">{row.status === 'pagado' ? 'Pagado; importe no informado' : 'Importe pendiente de informar'}</p>
        : <p className="budget-line-math"><span>{unitAmount} × {row.quantity} {row.unit}</span><b>{amount}</b></p>}
      {row.lodgingAllocation && <small className="budget-allocation">{row.lodgingAllocation}</small>}
      {row.tripLeg && <small className="budget-trip-leg">{row.tripLeg}</small>}
      {row.sourceLabel && <small className="budget-source-label">{row.sourceLabel}{row.sourceAsOf ? ` · consultado ${row.sourceAsOf}` : ''}</small>}
      {row.assumption && <p className="budget-assumption">{row.assumption}</p>}
      <div className="budget-line-links">
        {row.sourceUrl && <a href={row.sourceUrl} target="_blank" rel="noreferrer">Ver fuente ↗</a>}
        {row.placeId && <button type="button" onClick={() => onNavigatePlace(row.placeId!)}>Ver lugar {String(row.placeId).padStart(2, '0')} ↗</button>}
        {edited && <span>Editado en este dispositivo</span>}
      </div>
    </div>
    <div className="budget-line-actions"><button type="button" className="budget-edit-button" onClick={onEdit}>{row.status === 'sin-importe' || (row.status === 'pagado' && row.amount === null) ? 'Completar importe' : 'Editar gasto'}</button>{edited && <button type="button" className="budget-remove-button" onClick={onRemove}>{row.recordKind === 'custom' ? 'Eliminar gasto' : 'Restaurar referencia'}</button>}</div>
  </article>
}

export default function BudgetSection({ onNavigatePlace }: Props) {
  const [state, setState] = useState<BudgetLocalState>(initialBudgetState)
  const [ready, setReady] = useState(false)
  const [newExpenseOpen, setNewExpenseOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [storageWarning, setStorageWarning] = useState('')

  useEffect(() => {
    let mounted = true
    window.queueMicrotask(() => {
      if (!mounted) return
      try { setState(readBudgetState(window.localStorage, BUDGET_STORAGE_KEY, initialBudgetState)) }
      catch { setStorageWarning('El navegador no permitió abrir el presupuesto guardado.') }
      finally { setReady(true) }
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!ready) return
    try { writeBudgetState(window.localStorage, BUDGET_STORAGE_KEY, state) }
    catch { window.queueMicrotask(() => setStorageWarning('No se pudieron guardar tus cambios de presupuesto en este navegador.')) }
  }, [ready, state])

  const baseRows = useMemo(() => calculateBudgetScenario({ rioNights: state.rioNights, lodgingScenario: state.lodgingScenario, rioTransferChoice: state.rioTransferChoice }), [state.rioNights, state.lodgingScenario, state.rioTransferChoice])
  const rows = useMemo(() => applyBudgetOverrides(baseRows, state.entries), [baseRows, state.entries])
  const fx = getBudgetExchangeRate()
  const totals = calculateBudgetTotals(rows, fx.rate)
  const reserveMxn = totals.pendingKnownMxn * (planningMarginPercent / 100)
  const scenario = getBudgetScenario(state.rioNights)
  const lodgingRows = rows.filter((row) => row.category === 'alojamiento')
  const categoryRows = categories.map((category) => ({ ...category, rows: rows.filter((row) => row.category === category.id) })).filter((group) => group.rows.length)
  const edited = new Set(state.entries.map((entry) => entry.id))

  function saveEntry(entry: BudgetEntry) {
    setState((current) => ({ ...current, entries: [...current.entries.filter((item) => item.id !== entry.id), entry] }))
    setEditingId(null)
    setNewExpenseOpen(false)
    setNotice('Gasto guardado solo en este dispositivo.')
  }

  function removeEntry(row: CalculatedBudgetEntry) {
    const message = row.recordKind === 'custom' ? '¿Eliminar este gasto del presupuesto guardado en este dispositivo?' : '¿Restaurar la referencia original para este renglón?'
    if (!window.confirm(message)) return
    setState((current) => ({ ...current, entries: current.entries.filter((entry) => entry.id !== row.id) }))
    setEditingId(null)
  }

  function clearLocalBudget() {
    if (!window.confirm('¿Borrar solo los gastos y elecciones de presupuesto guardados en este dispositivo? Los favoritos y el itinerario se conservarán.')) return
    try { clearBudgetState(window.localStorage, BUDGET_STORAGE_KEY) } catch { /* El estado se limpia también en React. */ }
    setState(initialBudgetState)
    setNotice('Se borraron los cambios locales del presupuesto. El itinerario y los favoritos se conservaron.')
  }

  return <section className="page-section budget-page">
    <div className="page-title-row budget-title-row">
      <div><span className="tiny-label">PLAN DE GASTOS · ESCENARIO 2026 PROVISIONAL</span><h1>Presupuesto del viaje</h1><p>Compara opciones de costo sin cambiar las fechas del itinerario ni el selector de año del calendario.</p></div>
      <div className="budget-total-badge"><span>IMPORTE CONOCIDO · PARCIAL</span><b>{fmtMxn(totals.pendingKnownMxn)}</b><small>{currencyAmount(totals.pendingKnownBrl, 'BRL')} aprox.</small></div>
    </div>

    <div className="budget-notice-card"><span>◷</span><div><b>Escenario para comparar; no cambia el itinerario.</b><p>El regreso a São Paulo el 22 es una propuesta. El encuentro del 14 es provisional y la ciudad de las ocho noches siguientes sigue por definir. No hay reservas agregadas aquí.</p></div></div>

    <div className="budget-summary-grid">
      <article className="budget-summary-card"><span className="tiny-label">IMPORTE CONOCIDO SIN PAGAR</span><b>{fmtMxn(totals.pendingKnownMxn)}</b><small>{currencyAmount(totals.pendingKnownBrl, 'BRL')} · alojamiento y opciones con precio</small></article>
      <article className="budget-summary-card margin-card"><span className="tiny-label">COLCHÓN DE PLANEACIÓN · {planningMarginPercent}%</span><b>+{fmtMxn(reserveMxn)}</b><small>Reserva aparte; no es un gasto ni una tarifa.</small></article>
      <article className="budget-summary-card"><span className="tiny-label">META PROVISIONAL CON COLCHÓN</span><b>{fmtMxn(totals.pendingKnownMxn + reserveMxn)}</b><small>Solo importes conocidos; no es el costo completo.</small></article>
      <article className="budget-summary-card paid-card">
        <span className="tiny-label">{totals.unpricedPaid > 0 ? totals.paidKnownCount > 0 ? 'YA PAGADO · SUBTOTAL CONOCIDO' : 'YA PAGADO · IMPORTE POR INFORMAR' : 'YA PAGADO · TOTAL CONOCIDO'}</span>
        <b>{totals.unpricedPaid > 0 && totals.paidKnownCount === 0 ? 'Sin importe' : fmtMxn(totals.paidTotalMxn)}</b>
        <small>{totals.unpricedPaid > 0
          ? totals.paidKnownCount > 0
            ? `Subtotal de ${totals.paidKnownCount} pago(s) con importe; ${totals.unpricedPaid} pago(s) sin importe.`
            : `${totals.unpricedPaid} gasto(s) pagado(s) sin importe; no se cuenta como cero.`
          : totals.paidKnownCount > 0
            ? `Suma de ${totals.paidKnownCount} gasto(s) pagado(s) con importe registrado.`
            : 'No hay gastos pagados registrados.'}</small>
      </article>
    </div>
    <p className="budget-partial-banner" role="status">Presupuesto parcial: {totals.unpricedPending} gastos pendientes sin importe. La comida, entradas, transporte local y varios trayectos aún no tienen precio.</p>

    <div className="budget-controls-grid">
      <fieldset className="budget-selector-card">
        <legend>¿Cuántas noches comparar en Río?</legend>
        <p>La salida el 14 y el encuentro de ese día siguen provisionales.</p>
        <div className="budget-choice-row">{([4, 5] as const).map((nights) => {
          const option = getBudgetScenario(nights)
          return <label key={nights} className={state.rioNights === nights ? 'budget-choice selected' : 'budget-choice'}><input type="radio" name="rio-nights" checked={state.rioNights === nights} onChange={() => setState((current) => ({ ...current, rioNights: nights }))} /><span><b>{nights} noches</b><small>{option.arrivalDate.slice(8)}–13 dic · llegada {option.arrivalDate.slice(8)}</small></span></label>
        })}</div>
        <small className="budget-scenario-explanation">{scenario.note} El año 2026 es provisional.</small>
      </fieldset>
      <fieldset className="budget-selector-card">
        <legend>Tipo de alojamiento a comparar</legend>
        <p>Las cuatro alternativas son excluyentes; se calcula solo la seleccionada.</p>
        <div className="lodging-choice-grid">{lodgingOptions.map((option) => <label key={option.id} className={state.lodgingScenario === option.id ? 'lodging-choice selected' : 'lodging-choice'}><input type="radio" name="lodging-scenario" checked={state.lodgingScenario === option.id} onChange={() => setState((current) => ({ ...current, lodgingScenario: option.id }))} />{option.label}</label>)}</div>
      </fieldset>
    </div>

    <div className="budget-breakdown-heading"><div><span className="tiny-label">DESGLOSE DE LA OPCIÓN ACTIVA</span><h2>Qué compone este importe</h2><p>{lodgingRows.reduce((sum, row) => sum + row.quantity, 0)} noches de alojamiento representadas en la alternativa actual.</p></div><button type="button" className="budget-secondary-button" onClick={clearLocalBudget}>Borrar mis cambios de presupuesto</button></div>
    {storageWarning && <p className="budget-form-error" role="alert">{storageWarning}</p>}
    {notice && <p className="budget-local-notice" role="status">{notice}</p>}

    <div className="budget-transfer-selector">
      <div><span className="tiny-label">TRASLADO A RÍO</span><h3>Elige qué alternativa incluir</h3><p>Autobús y avión no se suman. La opción sin elegir conserva el trayecto pendiente.</p></div>
      <label><input type="radio" name="rio-transfer" checked={state.rioTransferChoice === 'por-decidir'} onChange={() => setState((current) => ({ ...current, rioTransferChoice: 'por-decidir' }))} /> Por decidir</label>
      <label><input type="radio" name="rio-transfer" checked={state.rioTransferChoice === 'autobus'} onChange={() => setState((current) => ({ ...current, rioTransferChoice: 'autobus' }))} /> Autobús</label>
      <label><input type="radio" name="rio-transfer" checked={state.rioTransferChoice === 'avion'} onChange={() => setState((current) => ({ ...current, rioTransferChoice: 'avion' }))} /> Avión</label>
    </div>
    {state.rioTransferChoice === 'autobus' && <div className="budget-bus-note">{state.rioNights === 4 ? <><b>Salida nocturna · escenario de 4 noches:</b> referencia Tietê 00:05 del 10 dic; ir a la terminal la noche del 9 reduce una noche de hospedaje en São Paulo.</> : <><b>Salida diurna · escenario de 5 noches:</b> consulta del 9 dic: candidato cercano a 08:30–15:00, ClickBus mostró R$98.99 promocional / R$109.99 referencia; no elimina noche de hospedaje.</>} Horario, precio y disponibilidad pueden cambiar. Es una comparación, no una reserva.</div>}

    {categoryRows.map((group) => <section className="budget-category" key={group.id}>
      <div className="budget-category-head"><h2>{group.label}</h2><span>{group.rows.length} {group.rows.length === 1 ? 'renglón' : 'renglones'}</span></div>
      <div className="budget-line-list">{group.rows.map((row) => <div key={row.id}>
        <BudgetRow row={row} edited={edited.has(row.id)} onEdit={() => { setNewExpenseOpen(false); setEditingId(row.id) }} onRemove={() => removeEntry(row)} onNavigatePlace={onNavigatePlace} />
        {editingId === row.id && <BudgetEditor entry={row} isNew={false} onSave={saveEntry} onCancel={() => setEditingId(null)} onRestore={edited.has(row.id) ? () => removeEntry(row) : undefined} />}
      </div>)}</div>
    </section>)}

    <div className="budget-add-section"><div><span className="tiny-label">TU REGISTRO LOCAL</span><h2>Agregar otro gasto</h2><p>Solo tú lo verás en este navegador. Verifica antes que no duplique un renglón anterior.</p></div><button className="budget-primary-button" type="button" onClick={() => { setEditingId(null); setNewExpenseOpen((open) => !open) }}>{newExpenseOpen ? 'Cerrar formulario' : '＋ Añadir gasto'}</button></div>
    {newExpenseOpen && <BudgetEditor entry={{ id: expenseId(), recordKind: 'custom', name: '', category: 'otros', amount: null, unitAmount: null, currency: null, quantity: 1, unit: 'gasto', status: 'sin-importe' }} isNew onSave={saveEntry} onCancel={() => setNewExpenseOpen(false)} />}

    <aside className="budget-method-note"><b>Cómo leer las cifras</b><p>Las tarifas de alojamiento son referencias “desde”, no cotizaciones para tus fechas. Curitiba solo sirve como referencia de precio para las ocho noches cuyo destino no está definido. El cambio fijo de R$1 = MXN$3,63 se consultó el {fx.asOf}; la reserva de {planningMarginPercent}% se calcula solo sobre importes pendientes conocidos. Las filas sin importe no entran al subtotal. Este presupuesto se guarda localmente y no se sincroniza con la página pública.</p><a href={fx.sourceUrl} target="_blank" rel="noreferrer">Ver fuente del tipo de cambio ↗</a></aside>
    <div className="budget-source-footnote">Fuente de escenarios: tarifas públicas de alojamientos y consulta ClickBus; cada importe conserva su enlace y supuesto. Cambiar esta comparación no modifica los días asignados ni los favoritos.</div>
    {!ready && <span className="sr-only" role="status">Cargando presupuesto guardado en este dispositivo…</span>}
  </section>
}
