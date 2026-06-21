import { NextResponse } from 'next/server'
import { getCurrentPrice, getHistoricalPrice } from '../../../lib/twelveClient'

function getToday(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol')
  const date = searchParams.get('date')

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol query parameter' }, { status: 400 })
  }

  try {
    const today = getToday()
    
    // If no date provided or date is today/future, use current price
    const useCurrent = !date || date >= today
    const priceData = useCurrent
      ? await getCurrentPrice(symbol)
      : await getHistoricalPrice(symbol, date)

    return NextResponse.json(priceData)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error fetching price'
    const errAny = error as any
    const status = errAny?.response?.status

    // Rate limit handling
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

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
