import type { BudgetCategory, BudgetEntry, BudgetLocalState, BudgetStatus, LodgingScenario, RioNights, RioTransferChoice } from '@/types/budget'

export interface BudgetStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const BUDGET_STORAGE_KEY = 'mi-itinerario:budget:v1'
const categories = new Set<BudgetCategory>(['alojamiento', 'traslados', 'comida', 'actividades', 'otros'])
const statuses = new Set<BudgetStatus>(['estimado', 'cotizado', 'confirmado', 'pagado', 'sin-importe'])
const currencies = new Set(['BRL', 'MXN'])
const lodgingScenarios = new Set<LodgingScenario>(['privado-basico', 'privado-ensuite', 'compartido', 'mixto'])
const transferChoices = new Set<RioTransferChoice>(['por-decidir', 'autobus', 'avion'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteAmount(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
}

function parseEntry(value: unknown): BudgetEntry | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || value.id.length > 160) return null
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120) return null
  if (typeof value.category !== 'string' || !categories.has(value.category as BudgetCategory)) return null
  if (typeof value.status !== 'string' || !statuses.has(value.status as BudgetStatus)) return null
  if (value.recordKind !== 'override' && value.recordKind !== 'custom') return null
  if (!finiteAmount(value.unitAmount) || !finiteAmount(value.amount)) return null
  if (value.currency !== null && (typeof value.currency !== 'string' || !currencies.has(value.currency))) return null
  if (typeof value.quantity !== 'number' || !Number.isFinite(value.quantity) || value.quantity <= 0 || value.quantity > 10000) return null
  if (typeof value.unit !== 'string' || !value.unit.trim() || value.unit.length > 80) return null
  const entry: BudgetEntry = {
    id: value.id,
    recordKind: value.recordKind,
    name: value.name.trim(),
    category: value.category as BudgetCategory,
    amount: value.amount,
    unitAmount: value.unitAmount,
    currency: value.currency as BudgetEntry['currency'],
    quantity: value.quantity,
    unit: value.unit.trim(),
    status: value.status as BudgetStatus,
  }
  if (typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date)) entry.date = value.date
  if (typeof value.sourceUrl === 'string' && /^https:\/\//i.test(value.sourceUrl)) entry.sourceUrl = value.sourceUrl.slice(0, 500)
  if (typeof value.sourceLabel === 'string') entry.sourceLabel = value.sourceLabel.slice(0, 160)
  if (typeof value.sourceAsOf === 'string') entry.sourceAsOf = value.sourceAsOf.slice(0, 40)
  if (typeof value.assumption === 'string') entry.assumption = value.assumption.slice(0, 600)
  if (typeof value.tripLeg === 'string') entry.tripLeg = value.tripLeg.slice(0, 120)
  if (typeof value.placeId === 'number' && Number.isInteger(value.placeId) && value.placeId >= 1 && value.placeId <= 36) entry.placeId = value.placeId
  if (typeof value.includedInScenario === 'boolean') entry.includedInScenario = value.includedInScenario
  return entry
}

export function readBudgetState(storage: BudgetStorageLike, key: string, fallback: BudgetLocalState): BudgetLocalState {
  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return fallback
    const rioNights: RioNights = parsed.rioNights === 5 ? 5 : 4
    const lodgingScenario = typeof parsed.lodgingScenario === 'string' && lodgingScenarios.has(parsed.lodgingScenario as LodgingScenario)
      ? parsed.lodgingScenario as LodgingScenario
      : fallback.lodgingScenario
    const rioTransferChoice = typeof parsed.rioTransferChoice === 'string' && transferChoices.has(parsed.rioTransferChoice as RioTransferChoice)
      ? parsed.rioTransferChoice as RioTransferChoice
      : fallback.rioTransferChoice
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.slice(0, 150).map(parseEntry).filter((entry): entry is BudgetEntry => entry !== null)
      : []
    return { rioNights, lodgingScenario, rioTransferChoice, entries }
  } catch {
    return fallback
  }
}

export function writeBudgetState(storage: BudgetStorageLike, key: string, state: BudgetLocalState): void {
  storage.setItem(key, JSON.stringify(state))
}

export function clearBudgetState(storage: BudgetStorageLike, key: string): void {
  storage.removeItem(key)
}
