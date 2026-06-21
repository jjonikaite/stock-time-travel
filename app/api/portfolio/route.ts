import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentPrice, getHistoricalPrice } from '../../../lib/twelveClient'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

interface PortfolioApiPosition {
  symbol: string
  quantity: number
  avgPrice: number
  currentPrice: number
  positionValue: number
  profitLossEur: number
  profitLossPercent: number
}

interface PortfolioApiResponse {
  cashBalance: number
  totalPositionValue: number
  totalPortfolioValue: number
  positions: PortfolioApiPosition[]
}

function getToday(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const simDate = searchParams.get('date') ?? undefined
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  const accessToken = authHeader.replace('Bearer ', '')
  const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 })
  }

  const userId = user.id

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('cash_balance')
    .eq('user_id', userId)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: 'Unable to load profile' }, { status: 500 })
  }

  let cashBalance = Number(profileData?.cash_balance ?? 0)

  if (!profileData) {
    const username = user.email ? user.email.split('@')[0] : `user-${userId.slice(0, 8)}`
    const { data: insertData, error: insertError } = await supabase
      .from('profiles')
      .insert({
        user_id: userId,
        username,
        initial_balance: 10000,
        cash_balance: 10000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .single()

    if (insertError || !insertData) {
      return NextResponse.json({ error: 'Unable to initialize profile' }, { status: 500 })
    }

    cashBalance = 10000
  }

  const { data: positionsData, error: positionsError } = await supabase
    .from('positions')
    .select('symbol, quantity, avg_price')
    .eq('user_id', userId)

  if (positionsError) {
    return NextResponse.json({ error: 'Unable to load positions' }, { status: 500 })
  }

  const positions = positionsData ?? []

  if (positions.length === 0) {
    const response: PortfolioApiResponse = {
      cashBalance,
      totalPositionValue: 0,
      totalPortfolioValue: cashBalance,
      positions: []
    }

    return NextResponse.json(response)
  }

  const symbols = Array.from(
    new Set(
      positions
        .map((position) => String((position as any)?.symbol ?? '').trim())
        .filter((s) => s.length > 0)
    )
  )

  try {
    const today = getToday()
    const useCurrent = !simDate || simDate >= today
    
    const priceResults = await Promise.all(
      symbols.map(async (symbol) => {
        const priceData = useCurrent
          ? await getCurrentPrice(symbol)
          : await getHistoricalPrice(symbol, simDate!)
        return {
          symbol,
          price: priceData.price
        }
      })
    )

    const priceMap = new Map(priceResults.map((item) => [item.symbol, item.price]))

    const formattedPositions: PortfolioApiPosition[] = positions.map((position) => {
      const quantity = Number(position.quantity ?? 0)
      const avgPrice = Number(position.avg_price ?? 0)
      const currentPrice = priceMap.get(position.symbol) ?? 0
      const positionValue = currentPrice * quantity
      const profitLossEur = (currentPrice - avgPrice) * quantity
      const profitLossPercent = avgPrice !== 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0

      return {
        symbol: position.symbol,
        quantity,
        avgPrice,
        currentPrice,
        positionValue,
        profitLossEur,
        profitLossPercent
      }
    })

    const totalPositionValue = formattedPositions.reduce((sum, position) => sum + position.positionValue, 0)
    const response: PortfolioApiResponse = {
      cashBalance,
      totalPositionValue,
      totalPortfolioValue: cashBalance + totalPositionValue,
      positions: formattedPositions
    }

    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error fetching market prices'
    
    // Check if it's a "no historical price" error
    if (message.includes('No historical price available')) {
      return NextResponse.json(
        { error: 'No historical market data for this date. Try an earlier trading day.' },
        { status: 400 }
      )
    }
    
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
