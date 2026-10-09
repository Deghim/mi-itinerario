export type BudgetCategory = 'alojamiento' | 'traslados' | 'comida' | 'actividades' | 'otros'
export type BudgetStatus = 'estimado' | 'cotizado' | 'confirmado' | 'pagado' | 'sin-importe'
export type BudgetCurrency = 'BRL' | 'MXN'
export type RioNights = 4 | 5
export type LodgingScenario = 'privado-basico' | 'privado-ensuite' | 'compartido' | 'mixto'
export type RioTransferChoice = 'por-decidir' | 'autobus' | 'avion'

export type BudgetEntry = {
  id: string
  recordKind: 'override' | 'custom'
  name: string
  category: BudgetCategory
  amount: number | null
  unitAmount: number | null
  currency: BudgetCurrency | null
  quantity: number
  unit: string
  status: BudgetStatus
  date?: string
  sourceUrl?: string
  sourceLabel?: string
  sourceAsOf?: string
  assumption?: string
  placeId?: number
  tripLeg?: string
  includedInScenario?: boolean
}

export type BudgetLocalState = {
  rioNights: RioNights
  lodgingScenario: LodgingScenario
  rioTransferChoice: RioTransferChoice
  entries: BudgetEntry[]
}

export type CalculatedBudgetEntry = BudgetEntry & {
  amount: number | null
  lodgingAllocation?: string
  sourceScenario?: 'referencia' | 'escenario'
}
