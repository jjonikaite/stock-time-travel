'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'

interface TradeRecord {
  executed_at: string | null
  simulation_date: string | null
  symbol: string
  side: string
  quantity: number
  price: number
  total_value: number
}

export default function HistoryPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [trades, setTrades] = useState<TradeRecord[]>([])
  const [symbolFilter, setSymbolFilter] = useState('')
  const [accessToken, setAccessToken] = useState<string | null>(null)

  useEffect(() => {
    async function loadSession() {
      setError('')
      setLoading(true)

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session) {
        setAccessToken(null)
        setLoading(false)
        return
      }

      setAccessToken(sessionData.session.access_token)
      setLoading(false)
    }

    loadSession()
  }, [])

  useEffect(() => {
    async function loadHistory() {
      if (!accessToken) return

      setError('')
      setLoading(true)

      try {
        const params = symbolFilter ? `?symbol=${encodeURIComponent(symbolFilter)}` : ''
        const response = await fetch(`/api/history${params}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Unable to load trade history')
        }

        setTrades(data.trades || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error loading trade history')
        setTrades([])
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [accessToken, symbolFilter])

  const handleFilterChange = (value: string) => {
    setSymbolFilter(value.toUpperCase())
  }

  const handleSignInRedirect = () => {
    router.push('/trade')
  }

  return (
    <section className="space-y-8 pb-12">
      <div className="glass-card p-6 shadow-glow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-100">History</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">Explore your executed trades with filtering and market accuracy.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100">
              Stock Time Travel history log
            </div>
            <div className="rounded-full border border-slate-700/70 bg-slate-900/80 px-4 py-2 text-sm text-slate-300">
              {trades.length} records
            </div>
          </div>
        </div>

        {!accessToken ? (
          <div className="glass-panel p-8 text-center">
            <p className="text-slate-200">You need to sign in to view your trade history.</p>
            <button
              type="button"
              onClick={handleSignInRedirect}
              className="mt-6 inline-flex items-center justify-center rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Go to Trade / Sign In
            </button>
          </div>
        ) : (
          <div className="glass-panel p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Trade History</h2>
                <p className="text-sm text-slate-400">Trades are shown newest first.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="text-sm text-slate-300">
                  Symbol filter
                  <input
                    type="text"
                    value={symbolFilter}
                    onChange={(e) => handleFilterChange(e.target.value)}
                    placeholder="AAPL"
                    className="ml-2 rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 shadow-[0_10px_20px_-10px_rgba(0,0,0,0.7)] focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                  />
                </label>
              </div>
            </div>

            {loading ? (
              <div className="rounded-[1.75rem] border border-slate-700/70 bg-slate-900/80 p-6 text-sm text-slate-400">Loading trade history...</div>
            ) : error ? (
              <div className="rounded-[1.75rem] border border-rose-500/20 bg-rose-500/10 p-6 text-sm text-rose-200">{error}</div>
            ) : trades.length === 0 ? (
              <div className="rounded-3xl border border-slate-700/70 bg-slate-900/80 p-6 text-sm text-slate-400">No trades yet</div>
            ) : (
              <div className="overflow-x-auto rounded-[1.75rem] border border-slate-700/70 bg-slate-950/90 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)]">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-slate-900 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-4 py-4">Executed At</th>
                      <th className="px-4 py-4">Simulation Date</th>
                      <th className="px-4 py-4">Symbol</th>
                      <th className="px-4 py-4">Side</th>
                      <th className="px-4 py-4">Quantity</th>
                      <th className="px-4 py-4">Price</th>
                      <th className="px-4 py-4">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-950">
                    {trades.map((trade, index) => (
                      <tr key={`${trade.executed_at}-${trade.symbol}-${index}`} className="transition hover:bg-slate-900/90">
                        <td className="px-4 py-4 text-slate-300">{trade.executed_at ? new Date(trade.executed_at).toLocaleString('en-GB', { hour12: false }) : '-'}</td>
                        <td className="px-4 py-4 text-slate-300">{trade.simulation_date ?? '-'}</td>
                        <td className="px-4 py-4 font-semibold text-slate-100">{trade.symbol}</td>
                        <td className={`px-4 py-4 font-semibold ${trade.side.toLowerCase() === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {trade.side.toUpperCase()}
                        </td>
                        <td className="px-4 py-4 text-slate-300">{trade.quantity.toFixed(6)}</td>
                        <td className="px-4 py-4 text-slate-300">€{trade.price.toFixed(2)}</td>
                        <td className="px-4 py-4 text-slate-300">€{trade.total_value.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
