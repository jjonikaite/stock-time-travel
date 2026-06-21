import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export async function GET(req: Request) {
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

  const url = new URL(req.url)
  const symbolFilter = url.searchParams.get('symbol')?.trim() ?? ''

  let query = supabase
    .from('transactions')
    .select('executed_at, simulation_date, symbol, side, quantity, price')
    .eq('user_id', user.id)

  if (symbolFilter) {
    query = query.ilike('symbol', `%${symbolFilter}%`)
  }

  const { data: trades, error } = await query.order('executed_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Unable to load trade history' }, { status: 500 })
  }

  return NextResponse.json({
    trades: (trades || []).map((trade: any) => ({
      executed_at: trade.executed_at,
      simulation_date: trade.simulation_date,
      symbol: trade.symbol,
      side: trade.side,
      quantity: Number(trade.quantity ?? 0),
      price: Number(trade.price ?? 0),
      total_value: Number(trade.quantity ?? 0) * Number(trade.price ?? 0)
    }))
  })
}
