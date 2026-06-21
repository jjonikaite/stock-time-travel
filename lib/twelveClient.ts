import axios from 'axios'

const API_BASE = 'https://api.twelvedata.com'
const API_KEY = process.env.TWELVE_DATA_API_KEY

if (!API_KEY) {
  throw new Error('Missing TWELVE_DATA_API_KEY environment variable')
}

interface CurrentPriceResult {
  symbol: string
  price: number
  datetime: string
}

interface HistoricalPriceResult {
  symbol: string
  price: number
  date: string
}

interface TwelveQuoteResponse {
  symbol?: string
  close?: string
  datetime?: string
  status?: string
  message?: string
}

interface TwelveTimeSeriesValue {
  datetime: string
  close: string
}

interface TwelveTimeSeriesResponse {
  symbol?: string
  values?: TwelveTimeSeriesValue[]
  status?: string
  message?: string
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function assertQuoteResponse(data: TwelveQuoteResponse, symbol: string): asserts data is Required<TwelveQuoteResponse> {
  if (data.status === 'error') {
    throw new Error(`Twelve Data quote error for ${symbol}: ${data.message || 'unknown error'}`)
  }

  if (!data.symbol || !data.close || !data.datetime) {
    throw new Error(`Invalid quote response for ${symbol}`)
  }
}

function assertTimeSeriesResponse(data: TwelveTimeSeriesResponse, symbol: string): asserts data is Required<TwelveTimeSeriesResponse> {
  if (data.status === 'error') {
    throw new Error(`Twelve Data time series error for ${symbol}: ${data.message || 'unknown error'}`)
  }

  if (!data.values || data.values.length === 0) {
    throw new Error('No historical data returned')
  }
}

export async function fetchTimeSeries(symbol: string, startDate: string, endDate: string): Promise<TwelveTimeSeriesValue[]> {
  const url = `${API_BASE}/time_series`
  const params = {
    symbol,
    interval: '1day',
    start_date: startDate,
    end_date: endDate,
    apikey: API_KEY,
    format: 'JSON',
    outputsize: 10
  }

  const response = await axios.get<TwelveTimeSeriesResponse>(url, { params })
  const data = response.data

  console.log('TWELVE REQUEST:', params)
  console.log('TWELVE RESPONSE:', JSON.stringify(data, null, 2))

  if (data.status === 'error') {
    throw new Error(data.message || 'Twelve Data API error')
  }

  assertTimeSeriesResponse(data, symbol)
  return data.values
}

export async function getCurrentPrice(symbol: string): Promise<CurrentPriceResult> {
  try {
    const url = `${API_BASE}/quote`
    const params = {
      symbol,
      apikey: API_KEY
    }

    const response = await axios.get<TwelveQuoteResponse>(url, { params })
    const data = response.data

    assertQuoteResponse(data, symbol)

    return {
      symbol: data.symbol,
      price: Number(data.close),
      datetime: data.datetime
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error fetching current price'
    throw new Error(`Failed to fetch current price for ${symbol}: ${message}`)
  }
}

export async function getHistoricalPrice(symbol: string, date: string): Promise<HistoricalPriceResult> {
  try {
    const requestedDate = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(requestedDate.getTime())) {
      throw new Error(`Invalid date format: ${date}`)
    }

    // Calculate start_date as 10 calendar days before the requested date
    const startDate = new Date(requestedDate)
    startDate.setUTCDate(startDate.getUTCDate() - 10)
    
    const formattedStartDate = formatDate(startDate)
    const formattedEndDate = formatDate(requestedDate)

    const values = await fetchTimeSeries(symbol, formattedStartDate, formattedEndDate)

    if (values.length === 0) {
      throw new Error(`No historical price available for ${symbol} on or before ${date}`)
    }

    // Sort values by date in descending order to find the most recent
    const sortedValues = [...values].sort((a, b) => {
      const dateA = a.datetime.split(' ')[0] ?? ''
      const dateB = b.datetime.split(' ')[0] ?? ''
      return dateB.localeCompare(dateA)
    })

    // Find the most recent value where datetime <= requested date
    const targetDate = date
    let bestValue: TwelveTimeSeriesValue | null = null

    for (const value of sortedValues) {
      const valueDate = value.datetime.split(' ')[0]
      if (valueDate && valueDate <= targetDate) {
        bestValue = value
        break
      }
    }

    if (!bestValue) {
      throw new Error(`No historical price available for ${symbol} on or before ${date}`)
    }

    return {
      symbol,
      price: Number(bestValue.close),
      date: bestValue.datetime.split(' ')[0] ?? formattedEndDate
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error fetching historical price'
    throw new Error(`Failed to fetch historical price for ${symbol}: ${message}`)
  }
}
