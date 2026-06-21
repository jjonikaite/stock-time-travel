import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentPrice, getHistoricalPrice } from '../../../lib/twelveClient'
import { checkAchievements } from '../../../lib/achievements'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

function getToday(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export async function POST(req: Request) {
  const body = await req.json()
  const { symbol, side, amountEUR, quantity, price, simulation_date } = body

  if (!symbol || !side) {
    return NextResponse.json({ error: 'Missing required trade fields' }, { status: 400 })
  }

  if (!['buy', 'sell'].includes(side)) {
    return NextResponse.json({ error: 'Invalid side, expected buy or sell' }, { status: 400 })
  }

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
    return NextResponse.json({ error: 'Unable to load profile balance' }, { status: 500 })
  }

  let currentBalance = 0
  if (!profileData) {
    const username = user.email ? user.email.split('@')[0] : `user-${userId.slice(0, 8)}`
    const { error: insertError } = await supabase.from('profiles').insert({
      user_id: userId,
      username,
      initial_balance: 10000,
      cash_balance: 10000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    if (insertError) {
      return NextResponse.json({ error: 'Unable to initialize profile' }, { status: 500 })
    }

    currentBalance = 10000
  } else {
    currentBalance = Number(profileData.cash_balance ?? 0)
  }

  // Determine execution price on the server to ensure consistent historical pricing
  let execPrice: number | undefined = price !== undefined && price !== null ? Number(price) : undefined
  try {
    if (!execPrice) {
      const today = getToday()
      const useCurrent = !simulation_date || simulation_date >= today
      
      if (useCurrent) {
        const pd = await getCurrentPrice(symbol)
        execPrice = pd.price
      } else {
        const pd = await getHistoricalPrice(symbol, simulation_date)
        execPrice = pd.price
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error fetching execution price'
    const errAny = err as any
    const status = errAny?.response?.status

    if (
      status === 429 ||
      message.includes('429') ||
      message.toLowerCase().includes('rate limit') ||
      message.toLowerCase().includes('too many requests')
    ) {
      return NextResponse.json({ error: 'API rate limit reached. Please wait and try again.' }, { status: 429 })
    }

    // Check if it's a "no historical price" error
    if (message.includes('No historical price available')) {
      return NextResponse.json(
        { error: 'No historical market data for this date. Try an earlier trading day.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: 'Unable to fetch execution price' }, { status: 500 })
  }

  const tradeAmount = Number(amountEUR ?? (quantity ? Number(quantity) * execPrice : 0))
  const tradeQuantity = Number(quantity ?? (amountEUR ? Number(amountEUR) / Number(execPrice) : 0))

  if (tradeQuantity <= 0 || tradeAmount <= 0) {
    return NextResponse.json({ error: 'Trade amount or quantity must be greater than zero' }, { status: 400 })
  }

  const transactionPayload = {
    user_id: userId,
    symbol,
    side,
    quantity: tradeQuantity,
    price: execPrice,
    simulation_date: simulation_date ?? null,
    fee: 0,
    executed_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  }

  if (side === 'buy') {
    if (tradeAmount > currentBalance) {
      return NextResponse.json({ error: 'Insufficient cash balance' }, { status: 400 })
    }

    const { data: existingPosition, error: positionError } = await supabase
      .from('positions')
      .select('id, quantity, avg_price')
      .eq('user_id', userId)
      .eq('symbol', symbol)
      .maybeSingle()

    if (positionError) {
      return NextResponse.json({ error: 'Unable to load existing position' }, { status: 500 })
    }

    const newBalance = currentBalance - tradeAmount

    if (existingPosition) {
      const existingQuantity = Number(existingPosition.quantity)
      const existingAvgPrice = Number(existingPosition.avg_price)
      const totalCost = existingQuantity * existingAvgPrice + tradeQuantity * execPrice
      const updatedQuantity = existingQuantity + tradeQuantity
      const updatedAvgPrice = updatedQuantity ? totalCost / updatedQuantity : execPrice

      const { error: positionUpdateError } = await supabase
        .from('positions')
        .update({ quantity: updatedQuantity, avg_price: updatedAvgPrice, updated_at: new Date().toISOString() })
        .eq('id', existingPosition.id)

      if (positionUpdateError) {
        return NextResponse.json({ error: 'Unable to update existing position' }, { status: 500 })
      }
    } else {
      const { error: positionInsertError } = await supabase.from('positions').insert({
        user_id: userId,
        symbol,
        quantity: tradeQuantity,
        avg_price: execPrice,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      if (positionInsertError) {
        return NextResponse.json({ error: 'Unable to create position' }, { status: 500 })
      }
    }

    const { error: balanceUpdateError } = await supabase
      .from('profiles')
      .update({ cash_balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId)

    if (balanceUpdateError) {
      return NextResponse.json({ error: 'Unable to update cash balance' }, { status: 500 })
    }
  } else {
    const { data: existingPosition, error: positionError } = await supabase
      .from('positions')
      .select('id, quantity, avg_price')
      .eq('user_id', userId)
      .eq('symbol', symbol)
      .maybeSingle()

    if (positionError) {
      return NextResponse.json({ error: 'Unable to load existing position' }, { status: 500 })
    }

    // If there is no position for this symbol, user cannot sell
    if (!existingPosition) {
      return NextResponse.json({ error: 'Insufficient shares to sell' }, { status: 400 })
    }

    const existingQuantity = Number(existingPosition.quantity ?? 0)
    if (existingQuantity <= 0 || existingQuantity < tradeQuantity) {
      return NextResponse.json({ error: 'Insufficient shares to sell' }, { status: 400 })
    }

    const newQuantity = existingQuantity - tradeQuantity
    const newBalance = currentBalance + tradeAmount

    if (newQuantity <= 0) {
      const { error: positionDeleteError } = await supabase.from('positions').delete().eq('id', existingPosition.id)
      if (positionDeleteError) {
        return NextResponse.json({ error: 'Unable to remove position' }, { status: 500 })
      }
    } else {
      const { error: positionUpdateError } = await supabase
        .from('positions')
        .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
        .eq('id', existingPosition.id)

      if (positionUpdateError) {
        return NextResponse.json({ error: 'Unable to update position quantity' }, { status: 500 })
      }
    }

    const { error: balanceUpdateError } = await supabase
      .from('profiles')
      .update({ cash_balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId)

    if (balanceUpdateError) {
      return NextResponse.json({ error: 'Unable to update cash balance' }, { status: 500 })
    }
  }

  const { error: transactionError } = await supabase.from('transactions').insert(transactionPayload)
  if (transactionError) {
    return NextResponse.json({ error: 'Failed to record trade' }, { status: 500 })
  }

  // Record portfolio snapshot after successful trade
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('cash_balance')
      .eq('user_id', userId)
      .single()

    const { data: allPositions, error: positionsError } = await supabase
      .from('positions')
      .select('quantity, avg_price')
      .eq('user_id', userId)

    if (!profile || profileError || !allPositions || positionsError) {
      throw new Error('Unable to load portfolio snapshot data')
    }

    const cashBalance = Number(profile.cash_balance ?? 0)
    const positionsValue = allPositions.reduce((sum, pos) => {
      return sum + Number(pos.quantity ?? 0) * Number(pos.avg_price ?? 0)
    }, 0)

    const totalValue = cashBalance + positionsValue

    await supabase.from('portfolio_snapshots').insert({
      user_id: userId,
      total_value: totalValue,
      cash_balance: cashBalance,
      positions_value: positionsValue,
      created_at: new Date().toISOString(),
      metadata: null
    })
    try {
      await checkAchievements(supabase, userId)
    } catch (achievementError) {
      console.error('Failed to check achievements:', achievementError)
    }
  } catch (snapshotErr) {
    console.error('Failed to record portfolio snapshot:', snapshotErr)
  }

  return NextResponse.json({ success: true })
}
