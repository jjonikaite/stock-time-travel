import { getCurrentPrice } from './twelveClient'
import type { SupabaseClient } from '@supabase/supabase-js'

export type AchievementKey =
  | 'first_trade'
  | 'investor'
  | 'market_veteran'
  | 'diversified'
  | 'rising_star'

export interface AchievementDefinition {
  key: AchievementKey
  name: string
  description: string
  icon: string
}

export interface AchievementRecord extends AchievementDefinition {
  id: number
  user_id: string
  achievement_key: AchievementKey
  achievement_name: string
  achievement_description: string
  unlocked_at: string
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    key: 'first_trade',
    name: 'First Trade',
    description: 'Congratulations on completing your first trade.',
    icon: '🎯'
  },
  {
    key: 'investor',
    name: 'Investor',
    description: 'You completed five trades and earned the Investor badge.',
    icon: '💰'
  },
  {
    key: 'market_veteran',
    name: 'Market Veteran',
    description: 'Twenty trades completed. You are gaining market experience.',
    icon: '📈'
  },
  {
    key: 'diversified',
    name: 'Diversified Portfolio',
    description: 'You currently hold three or more different stocks.',
    icon: '🌎'
  },
  {
    key: 'rising_star',
    name: 'Rising Star',
    description: 'Your portfolio return has surpassed 10%.',
    icon: '🚀'
  }
]

interface TransactionRow {
  id: number
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
  executed_at: string | null
}

interface PositionRow {
  symbol: string
  quantity: number
  avg_price: number
}

function getAchievementDefinition(key: AchievementKey): AchievementDefinition {
  const achievement = ACHIEVEMENT_DEFINITIONS.find((item) => item.key === key)
  if (!achievement) {
    throw new Error(`Unknown achievement key: ${key}`)
  }
  return achievement
}

async function loadExistingAchievements(client: SupabaseClient, userId: string): Promise<Set<AchievementKey>> {
  const { data, error } = await client
    .from('achievements')
    .select('achievement_key')
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Unable to load existing achievements: ${error.message}`)
  }

  return new Set<AchievementKey>((data ?? []).map((row: any) => row.achievement_key as AchievementKey))
}

function calculateCashBalanceFromTransactions(transactions: TransactionRow[]): number {
  const initialBalance = 10000
  return transactions.reduce((balance, transaction) => {
    const amount = Number(transaction.quantity) * Number(transaction.price)
    return transaction.side === 'buy' ? balance - amount : balance + amount
  }, initialBalance)
}

function calculateEligibleAchievements(
  transactionCount: number,
  distinctPositionCount: number,
  portfolioReturnPercent: number | null
): AchievementKey[] {
  const unlocked: AchievementKey[] = []

  if (transactionCount >= 1) {
    unlocked.push('first_trade')
  }

  if (transactionCount >= 5) {
    unlocked.push('investor')
  }

  if (transactionCount >= 20) {
    unlocked.push('market_veteran')
  }

  if (distinctPositionCount >= 3) {
    unlocked.push('diversified')
  }

  if (portfolioReturnPercent !== null && portfolioReturnPercent > 10) {
    unlocked.push('rising_star')
  }

  return unlocked
}

async function computePortfolioReturnPercent(
  transactions: TransactionRow[],
  positions: PositionRow[]
): Promise<number | null> {
  if (positions.length === 0) {
    return null
  }

  const symbols = Array.from(new Set(positions.map((position) => position.symbol)))

  try {
    const priceResults = await Promise.all(
      symbols.map(async (symbol) => {
        const quote = await getCurrentPrice(symbol)
        return {
          symbol,
          price: quote.price
        }
      })
    )

    const priceMap = new Map(priceResults.map((item) => [item.symbol, item.price]))
    const positionsValue = positions.reduce((sum, position) => {
      const currentPrice = priceMap.get(position.symbol) ?? 0
      return sum + Number(position.quantity) * currentPrice
    }, 0)

    const cashBalance = calculateCashBalanceFromTransactions(transactions)
    const totalPortfolioValue = cashBalance + positionsValue

    return ((totalPortfolioValue - 10000) / 10000) * 100
  } catch (error) {
    console.error('Unable to compute portfolio return for achievements:', error)
    return null
  }
}

export async function checkAchievements(
  client: SupabaseClient,
  userId: string
): Promise<AchievementRecord[]> {
  if (!userId) {
    throw new Error('Missing userId')
  }

  const [transactionsResult, positionsResult] = await Promise.all([
    client
      .from('transactions')
      .select('id, symbol, side, quantity, price, executed_at')
      .eq('user_id', userId),
    client
      .from('positions')
      .select('symbol, quantity, avg_price')
      .eq('user_id', userId)
  ])

  if (transactionsResult.error) {
    throw new Error(`Unable to load transactions: ${transactionsResult.error.message}`)
  }

  if (positionsResult.error) {
    throw new Error(`Unable to load positions: ${positionsResult.error.message}`)
  }

  const transactions = transactionsResult.data ?? []
  const positions = positionsResult.data ?? []
  const existingAchievementKeys = await loadExistingAchievements(client, userId)

  const transactionCount = transactions.length
  const distinctPositionCount = new Set(positions.map((position) => position.symbol)).size
  const portfolioReturnPercent = await computePortfolioReturnPercent(transactions, positions)

  const candidateKeys = calculateEligibleAchievements(transactionCount, distinctPositionCount, portfolioReturnPercent)
  const newKeys = candidateKeys.filter((key) => !existingAchievementKeys.has(key))

  if (newKeys.length === 0) {
    return []
  }

  const now = new Date().toISOString()
  const insertPayload = newKeys.map((key) => {
    const definition = getAchievementDefinition(key)
    return {
      user_id: userId,
      achievement_key: definition.key,
      achievement_name: definition.name,
      achievement_description: definition.description,
      icon: definition.icon,
      unlocked_at: now
    }
  })

  const { data: inserted, error: insertError } = await client
    .from('achievements')
    .insert(insertPayload)
    .select('*')

  if (insertError) {
    throw new Error(`Unable to insert new achievements: ${insertError.message}`)
  }

  return (inserted as AchievementRecord[]) ?? []
}
