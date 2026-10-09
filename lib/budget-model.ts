import budgetData from '../docs/data/presupuesto.json' with { type: 'json' }
import type { BudgetEntry, BudgetLocalState, CalculatedBudgetEntry, LodgingScenario, RioNights, RioTransferChoice } from '@/types/budget'

type BudgetData = typeof budgetData
type Rate = { amount: number; currency: 'BRL'; unit: string; status: 'estimado'; sourceLabel: string; sourceUrl?: string; assumption?: string }
type TransferItem = { amount: number | null; currency: 'BRL'; status: 'cotizado' | 'sin-importe'; label: string; unit: string; date?: string; sourceAsOf?: string; sourceLabel?: string; sourceUrl?: string; assumption: string; departureTime?: string; arrivalTime?: string; removesLodgingNight?: boolean; referenceAmount?: number }

const data = budgetData as BudgetData

export function getDefaultBudgetState(): BudgetLocalState {
  return {
    rioNights: data.default.rioNights as RioNights,
    lodgingScenario: data.default.lodgingScenario as LodgingScenario,
    rioTransferChoice: data.default.rioTransferChoice as RioTransferChoice,
    entries: [],
  }
}

function rateEntry(id: string, name: string, rate: Rate, quantity: number, tripLeg: string, allocation?: string): CalculatedBudgetEntry {
  return {
    id,
    recordKind: 'override',
    name,
    category: 'alojamiento',
    amount: quantity === 0 ? 0 : rate.amount * quantity,
    unitAmount: rate.amount,
    currency: rate.currency,
    quantity,
    unit: rate.unit,
    status: rate.status,
    sourceLabel: rate.sourceLabel,
    ...(rate.sourceUrl ? { sourceUrl: rate.sourceUrl } : {}),
    ...(rate.assumption ? { assumption: rate.assumption } : {}),
    tripLeg,
    lodgingAllocation: allocation,
    sourceScenario: 'escenario',
  }
}

function unknownEntry(item: (typeof budgetData.unknownCosts)[number]): CalculatedBudgetEntry {
  return {
    id: `unknown:${item.id}`,
    recordKind: 'override',
    name: item.name,
    category: item.category as BudgetEntry['category'],
    amount: null,
    unitAmount: null,
    currency: null,
    quantity: 1,
    unit: item.unit,
    status: 'sin-importe',
    assumption: item.assumption,
    tripLeg: item.id,
    sourceScenario: 'referencia',
  }
}

function paidEntry(item: (typeof budgetData.paidItems)[number]): CalculatedBudgetEntry {
  return {
    id: `paid:${item.id}`,
    recordKind: 'override',
    name: item.name,
    category: item.category as BudgetEntry['category'],
    amount: null,
    unitAmount: null,
    currency: null,
    quantity: item.quantity,
    unit: item.unit,
    status: 'pagado',
    sourceLabel: item.sourceLabel,
    assumption: item.assumption,
    tripLeg: item.id,
    sourceScenario: 'referencia',
  }
}

function transferEntry(nights: RioNights, choice: RioTransferChoice): CalculatedBudgetEntry {
  const item = (choice === 'autobus'
    ? data.transfers.rio.autobus[String(nights) as '4' | '5']
    : choice === 'avion'
      ? data.transfers.rio.avion[String(nights) as '4' | '5']
      : data.transfers.rio['por-decidir']) as TransferItem
  return {
    id: `transfer:sp-rio:${nights}:${choice}`,
    recordKind: 'override',
    name: item.label,
    category: 'traslados',
    amount: item.amount,
    unitAmount: item.amount,
    currency: item.currency as 'BRL',
    quantity: 1,
    unit: item.unit,
    status: item.status as BudgetEntry['status'],
    ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
    ...('sourceAsOf' in item && item.sourceAsOf ? { sourceAsOf: item.sourceAsOf } : {}),
    ...('sourceLabel' in item && item.sourceLabel ? { sourceLabel: item.sourceLabel } : {}),
    ...('date' in item && item.date ? { date: item.date } : {}),
    ...('removesLodgingNight' in item && item.removesLodgingNight ? { removesLodgingNight: true } : {}),
    ...('referenceAmount' in item && item.referenceAmount ? { referenceAmount: item.referenceAmount } : {}),
    assumption: item.assumption,
    tripLeg: 'Sao Paulo-Rio',
    sourceScenario: item.amount !== null && item.status === 'cotizado' ? 'escenario' : 'referencia',
  }
}

export function calculateBudgetScenario(state: Omit<BudgetLocalState, 'entries'>): CalculatedBudgetEntry[] {
  const scenario = data.scenarios.find((item) => item.rioNights === state.rioNights)
  if (!scenario) return []
  const selectedTransfer = (state.rioTransferChoice === 'autobus'
    ? data.transfers.rio.autobus[String(state.rioNights) as '4' | '5']
    : state.rioTransferChoice === 'avion'
      ? data.transfers.rio.avion[String(state.rioNights) as '4' | '5']
      : data.transfers.rio['por-decidir']) as TransferItem
  const removesLodgingNight = state.rioTransferChoice !== 'por-decidir' && selectedTransfer.removesLodgingNight === true
  const initialSpNights = Math.max(0, scenario.spInitialNights - (removesLodgingNight ? 1 : 0))
  const friendCity = 'Destino del encuentro (Curitiba solo referencia)'
  const rows: CalculatedBudgetEntry[] = []

  if (state.lodgingScenario === 'mixto') {
    const rates = data.lodgingScenarios.mixto.rates
    const initialSpPrivate = Math.ceil(scenario.spInitialNights / 2)
    let initialSpShared = scenario.spInitialNights - initialSpPrivate
    if (removesLodgingNight && initialSpShared > 0) initialSpShared -= 1
    else if (removesLodgingNight) {
      // The mixed scenario specifies that a bus removes a shared night. Keep the model safe if changed.
      initialSpShared = 0
    }
    const spPrivateTotal = initialSpPrivate + scenario.spReturnNights
    const friendPrivate = 4
    const rioPrivate = Math.max(0, 10 - spPrivateTotal - friendPrivate)
    const rioShared = Math.max(0, scenario.rioNights - rioPrivate)
    const friendShared = scenario.friendNights - friendPrivate
    rows.push(rateEntry(`lodging:${scenario.rioNights}:mixto:sp-initial-private`, 'São Paulo · estancia inicial · privado', rates.saoPauloPrivate as Rate, initialSpPrivate, `3–${scenario.rioNights === 4 ? 9 : 8} dic`, `${initialSpPrivate} noches privadas`))
    rows.push(rateEntry(`lodging:${scenario.rioNights}:mixto:sp-initial-shared`, 'São Paulo · estancia inicial · compartido', rates.saoPauloShared as Rate, initialSpShared, 'Estancia inicial hasta salir a Río', `${initialSpShared} camas/noches compartidas${removesLodgingNight ? ' (una noche menos por autobús nocturno)' : ''}`))
    rows.push(rateEntry(`lodging:${scenario.rioNights}:mixto:sp-return`, 'São Paulo · noche propuesta del 22', rates.saoPauloPrivate as Rate, scenario.spReturnNights, '22 dic · propuesta sin confirmar', '1 noche privada'))
    rows.push(rateEntry(`lodging:${scenario.rioNights}:mixto:rio-private`, 'Río · privado', rates.rioPrivate as Rate, rioPrivate, `${scenario.arrivalDate.slice(8)}–13 dic`, `${rioPrivate} noches privadas`))
    rows.push(rateEntry(`lodging:${scenario.rioNights}:mixto:rio-shared`, 'Río · compartido', rates.rioShared as Rate, rioShared, `${scenario.arrivalDate.slice(8)}–13 dic`, `${rioShared} camas/noches compartidas`))
    rows.push(rateEntry(`lodging:${scenario.rioNights}:mixto:friend-private`, friendCity + ' · privado', rates.friendPrivate as Rate, friendPrivate, '14–21 dic · destino pendiente', `${friendPrivate} noches privadas`))
    rows.push(rateEntry(`lodging:${scenario.rioNights}:mixto:friend-shared`, friendCity + ' · compartido', rates.friendShared as Rate, friendShared, '14–21 dic · destino pendiente', `${friendShared} camas/noches compartidas`))
  } else {
    const lodging = data.lodgingScenarios[state.lodgingScenario]
    const rates = lodging.rates as { saoPaulo: Rate; rio: Rate; friendCity: Rate }
    const note = lodging.note
    rows.push(rateEntry(`lodging:${scenario.rioNights}:${state.lodgingScenario}:sp-initial`, 'São Paulo · estancia inicial', rates.saoPaulo, initialSpNights, `3–${scenario.rioNights === 4 ? 9 : 8} dic`, `${initialSpNights} noches`))
    rows.push(rateEntry(`lodging:${scenario.rioNights}:${state.lodgingScenario}:sp-return`, 'São Paulo · noche propuesta del 22', rates.saoPaulo, scenario.spReturnNights, '22 dic · propuesta sin confirmar', '1 noche'))
    rows.push(rateEntry(`lodging:${scenario.rioNights}:${state.lodgingScenario}:rio`, 'Río', rates.rio, scenario.rioNights, `${scenario.arrivalDate.slice(8)}–13 dic`, `${scenario.rioNights} noches`))
    rows.push(rateEntry(`lodging:${scenario.rioNights}:${state.lodgingScenario}:friend`, friendCity, rates.friendCity, scenario.friendNights, '14–21 dic · destino pendiente', `${scenario.friendNights} noches`))
    if (note) rows[0] = { ...rows[0], assumption: `${rows[0].assumption ?? ''} ${note}`.trim() }
  }

  rows.push(transferEntry(state.rioNights, state.rioTransferChoice))
  rows.push(...data.unknownCosts.map(unknownEntry))
  rows.push(...data.paidItems.map(paidEntry))
  return rows
}

function normalizedAmount(entry: BudgetEntry): number | null {
  if (entry.unitAmount === null || entry.unitAmount === undefined) return null
  return entry.unitAmount * entry.quantity
}

export function applyBudgetOverrides(baseRows: CalculatedBudgetEntry[], savedEntries: BudgetEntry[]): CalculatedBudgetEntry[] {
  const savedById = new Map(savedEntries.map((entry) => [entry.id, entry]))
  const rows = baseRows.map((base) => {
    const saved = savedById.get(base.id)
    if (!saved) return base
    savedById.delete(base.id)
    return { ...base, ...saved, amount: normalizedAmount(saved) }
  })
  for (const entry of savedById.values()) {
    if (entry.recordKind === 'custom') rows.push({ ...entry, amount: normalizedAmount(entry), sourceScenario: 'referencia' })
  }
  return rows
}

export function calculateBudgetTotals(rows: CalculatedBudgetEntry[], mxnPerBrl: number) {
  const amountInMxn = (row: CalculatedBudgetEntry) => {
    if (row.amount === null || row.currency === null) return null
    return row.currency === 'BRL' ? row.amount * mxnPerBrl : row.amount
  }
  const knownTotalMxn = rows.reduce((sum, row) => sum + (amountInMxn(row) ?? 0), 0)
  const paidTotalMxn = rows.reduce((sum, row) => row.status === 'pagado' ? sum + (amountInMxn(row) ?? 0) : sum, 0)
  const pendingKnownMxn = rows.reduce((sum, row) => row.status !== 'pagado' ? sum + (amountInMxn(row) ?? 0) : sum, 0)
  const pendingKnownBrl = pendingKnownMxn / mxnPerBrl
  const paidKnownBrl = paidTotalMxn / mxnPerBrl
  const unpricedPending = rows.filter((row) => row.status !== 'pagado' && (row.amount === null || row.currency === null)).length
  const paidRows = rows.filter((row) => row.status === 'pagado')
  const paidKnownCount = paidRows.filter((row) => row.amount !== null && row.currency !== null).length
  const unpricedPaid = paidRows.length - paidKnownCount
  return { knownTotalMxn, paidTotalMxn, paidKnownBrl, pendingKnownMxn, pendingKnownBrl, unpricedPending, paidKnownCount, unpricedPaid }
}

export function getBudgetExchangeRate() {
  return { rate: data.currency.mxnPerBrl, asOf: data.currency.asOf, sourceUrl: data.currency.sourceUrl, note: data.currency.note }
}

export function getBudgetScenario(nights: RioNights) {
  return data.scenarios.find((scenario) => scenario.rioNights === nights) ?? data.scenarios[0]
}

export const planningMarginPercent = data.planningMarginPercent
