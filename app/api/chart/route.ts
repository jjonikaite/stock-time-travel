import { NextResponse } from 'next/server'
import { fetchTimeSeries } from '../../../lib/twelveClient'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol query parameter' }, { status: 400 })
  }

  try {
    const endDate = new Date()
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - 60)

    const formattedStart = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`
    const formattedEnd = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`

    const values = await fetchTimeSeries(symbol, formattedStart, formattedEnd)

    // Map to { date, close } and sort ascending
    const series = values
      .map((v) => ({ date: v.datetime.split(' ')[0], close: Number(v.close) }))
      .sort((a, b) => a.date.localeCompare(b.date))

    if (!series || series.length === 0) {
      return NextResponse.json({ error: 'No time series data available for this symbol' }, { status: 404 })
    }

    return NextResponse.json({ symbol, series })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error fetching chart data'
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

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
