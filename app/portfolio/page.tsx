'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts'

interface PortfolioPosition {
  symbol: string
  quantity: number
  avgPrice: number
  currentPrice: number
  positionValue: number
  profitLossEur: number
  profitLossPercent: number
}

interface PortfolioResponse {
  cashBalance: number
  totalPositionValue: number
  totalPortfolioValue: number
  positions: PortfolioPosition[]
}

export default function PortfolioPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState('')
  const [cashBalance, setCashBalance] = useState<number | null>(null)
  const [totalPositionValue, setTotalPositionValue] = useState<number | null>(null)
  const [totalPortfolioValue, setTotalPortfolioValue] = useState<number | null>(null)
  const [positions, setPositions] = useState<PortfolioPosition[]>([])
  const [lastUpdated, setLastUpdated] = useState('')
  const [simulationDate, setSimulationDate] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<{ date: string; value: number }[] | null>(null)
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [snapshotsError, setSnapshotsError] = useState('')
  const [achievements, setAchievements] = useState<{ achievement_key: string; unlocked_at: string | null }[] | null>(null)
  const [achievementsError, setAchievementsError] = useState('')

  useEffect(() => {
    async function loadAuthSession() {
      setError('')
      setLoading(true)

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session) {
        setIsAuthenticated(false)
        setLoading(false)
        return
      }

      const token = sessionData.session.access_token
      setAccessToken(token)
      setIsAuthenticated(true)
    }

    loadAuthSession()
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      return
    }

    async function loadPortfolio(background = false) {
      setError('')
      if (background) {
        setIsUpdating(true)
      } else {
      setLoading(true)
      }

      try {
        const url = simulationDate ? `/api/portfolio?date=${encodeURIComponent(simulationDate)}` : '/api/portfolio'
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        })

        const json = await response.json()
        const data = json as PortfolioResponse | { error: string }

        if (!response.ok) {
          throw new Error('error' in data ? data.error : 'Unable to load portfolio')
        }

        // Narrow to PortfolioResponse now that response.ok is true
        const pr = data as PortfolioResponse

        setCashBalance(pr.cashBalance)
        setTotalPositionValue(pr.totalPositionValue)
        setTotalPortfolioValue(pr.totalPortfolioValue)
        setPositions(pr.positions)
        setLastUpdated(new Date().toLocaleTimeString('en-GB', { hour12: false }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error loading portfolio')
      } finally {
        if (background) {
          setIsUpdating(false)
        } else {
        setLoading(false)
        }
      }
    }

    loadPortfolio()

    const intervalId = setInterval(() => {
      loadPortfolio(true)
    }, 60000)

    return () => {
      clearInterval(intervalId)
    }
  }, [accessToken, isAuthenticated, simulationDate])

  useEffect(() => {
    async function loadSnapshots() {
      if (!accessToken) return
      setSnapshotsError('')
      setSnapshotsLoading(true)
      try {
        const response = await fetch('/api/portfolio-snapshots', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load snapshots')
        }
        setSnapshots(data.series || [])
      } catch (err) {
        setSnapshots(null)
        setSnapshotsError(err instanceof Error ? err.message : 'Unknown error loading snapshots')
      } finally {
        setSnapshotsLoading(false)
      }
    }

    loadSnapshots()
  }, [accessToken])

  useEffect(() => {
    async function loadAchievements() {
      if (!accessToken) return
      setAchievementsError('')
      try {
        const res = await fetch('/api/achievements', { headers: { Authorization: `Bearer ${accessToken}` } })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load achievements')
        setAchievements(data || [])
      } catch (err) {
        setAchievements(null)
        setAchievementsError(err instanceof Error ? err.message : 'Unknown error')
      }
    }

    loadAchievements()
  }, [accessToken])

  const displayProfitLossClass = (value: number) => {
    if (value > 0) return 'text-emerald-400'
    if (value < 0) return 'text-rose-400'
    return 'text-slate-300'
  }

  const profitLossSnapshots = useMemo(() => {
    return (snapshots || []).map((snapshot) => ({
      date: snapshot.date,
      profitLoss: Number(snapshot.value ?? 0) - 10000
    }))
  }, [snapshots])

  const getTodayString = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const handleSigninRedirect = () => {
    router.push('/trade')
  }

  if (loading) {
    return (
      <section>
        <h1 className="text-2xl font-semibold mb-4 text-white">Portfolio</h1>
        <div className="rounded-[1.75rem] border border-slate-700 bg-slate-900/90 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.7)]">
          <p className="text-slate-300">Loading portfolio...</p>
        </div>
      </section>
    )
  }

  if (!isAuthenticated) {
    return (
      <section>
        <h1 className="text-2xl font-semibold mb-4 text-white">Portfolio</h1>
        <div className="rounded-[1.75rem] border border-slate-700 bg-slate-900/90 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.7)] space-y-4">
          <p className="text-slate-300">You need to sign in to view your portfolio.</p>
          <button
            type="button"
            onClick={handleSigninRedirect}
            className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            Go to Trade / Sign In
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-8 pb-12">
      <div className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-slate-700/60 bg-slate-950/75 p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Portfolio</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Your premium Stock Time Travel dashboard for live and historical portfolio performance.</p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 shadow-[0_0_40px_-24px_rgba(0,212,255,0.6)]">
              {simulationDate ? 'Historical Time Travel Mode' : 'Live Trading Mode'}
            </div>
            {simulationDate ? (
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200 shadow-[0_0_30px_-20px_rgba(0,255,157,0.4)]">
                Date: {simulationDate}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-[1.75rem] border border-slate-700/70 bg-slate-900/80 px-4 py-3 shadow-[0_18px_45px_-30px_rgba(0,212,255,0.35)]">
            <input
              type="date"
              value={simulationDate}
              onChange={(e) => setSimulationDate(e.target.value)}
              max={getTodayString()}
              className="rounded-3xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            />
            <button
              type="button"
              onClick={() => setSimulationDate('')}
              className="rounded-3xl bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
            >
              Use Today
            </button>
            <div className="text-sm text-slate-300">{simulationDate ? 'Historical' : 'Today'}</div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-[1.75rem] border border-rose-500/20 bg-rose-500/10 p-4 text-rose-100 shadow-[0_20px_60px_-40px_rgba(255,94,122,0.35)]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="glass-card p-6">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Portfolio Summary</h2>
                <p className="text-sm text-slate-400">Large financial metrics with live updates.</p>
              </div>
              <div className="text-sm text-slate-400">{lastUpdated ? `Last Updated: ${lastUpdated}` : 'Last Updated: -'}</div>
            </div>
            {isUpdating ? <p className="mb-4 text-sm text-cyan-200">Refreshing market data...</p> : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.75rem] border border-slate-700/70 bg-slate-900/80 p-5 text-center shadow-glow-cyan">
                <p className="text-sm text-slate-400">Cash Balance</p>
                <p className="mt-3 text-3xl font-semibold text-slate-100">{cashBalance !== null ? `€${cashBalance.toFixed(2)}` : '-'}</p>
              </div>
              <div className="rounded-[1.75rem] border border-slate-700/70 bg-slate-900/80 p-5 text-center shadow-[0_20px_60px_-35px_rgba(0,212,255,0.4)]">
                <p className="text-sm text-slate-400">Position Value</p>
                <p className="mt-3 text-3xl font-semibold text-slate-100">{totalPositionValue !== null ? `€${totalPositionValue.toFixed(2)}` : '-'}</p>
              </div>
              <div className="rounded-[1.75rem] border border-slate-700/70 bg-slate-900/80 p-5 text-center shadow-[0_20px_60px_-35px_rgba(0,255,157,0.35)]">
                <p className="text-sm text-slate-400">Total Value</p>
                <p className="mt-3 text-3xl font-semibold text-slate-100">{totalPortfolioValue !== null ? `€${totalPortfolioValue.toFixed(2)}` : '-'}</p>
              </div>
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Positions</h2>
                <p className="text-sm text-slate-400">Open trades and current position performance.</p>
              </div>
              <p className="text-sm text-slate-400">{positions.length} open position{positions.length === 1 ? '' : 's'}</p>
            </div>

            {positions.length === 0 ? (
              <div className="rounded-[1.75rem] border border-dashed border-slate-700/60 bg-slate-900/80 p-12 text-center text-sm text-slate-400">No positions yet</div>
            ) : (
              <div className="overflow-hidden rounded-[1.75rem] border border-slate-700/70 bg-slate-950/80 shadow-[0_30px_90px_-40px_rgba(0,212,255,0.35)]">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-slate-900 text-left text-xs uppercase tracking-[0.15em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Symbol</th>
                      <th className="px-4 py-3">Quantity</th>
                      <th className="px-4 py-3">Avg Buy</th>
                      <th className="px-4 py-3">Current</th>
                      <th className="px-4 py-3">Value</th>
                      <th className="px-4 py-3">P/L EUR</th>
                      <th className="px-4 py-3">P/L %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-950">
                    {positions.map((position) => (
                      <tr key={position.symbol} className="transition hover:bg-slate-900/90">
                        <td className="px-4 py-4 font-semibold text-slate-100">{position.symbol}</td>
                        <td className="px-4 py-4 text-slate-300">{position.quantity.toFixed(6)}</td>
                        <td className="px-4 py-4 text-slate-300">€{position.avgPrice.toFixed(2)}</td>
                        <td className="px-4 py-4 text-slate-300">€{position.currentPrice.toFixed(2)}</td>
                        <td className="px-4 py-4 text-slate-300">€{position.positionValue.toFixed(2)}</td>
                        <td className={`px-4 py-4 font-semibold ${displayProfitLossClass(position.profitLossEur)}`}>
                          €{position.profitLossEur.toFixed(2)}
                        </td>
                        <td className={`px-4 py-4 font-semibold ${displayProfitLossClass(position.profitLossPercent)}`}>
                          {position.profitLossPercent.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-card p-6">
            <h2 className="text-xl font-semibold text-slate-100 mb-2">Snapshot</h2>
            <p className="text-sm text-slate-400 mb-4">Live market prices are loaded from Twelve Data for each holding.</p>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="flex justify-between rounded-3xl border border-slate-700/70 bg-slate-900/80 px-4 py-3">
                <span>Positions</span>
                <span>{positions.length}</span>
              </div>
              <div className="flex justify-between rounded-3xl border border-slate-700/70 bg-slate-900/80 px-4 py-3">
                <span>Cash</span>
                <span>{cashBalance !== null ? `€${cashBalance.toFixed(2)}` : '-'}</span>
              </div>
              <div className="flex justify-between rounded-3xl border border-slate-700/70 bg-slate-900/80 px-4 py-3">
                <span>Portfolio Value</span>
                <span>{totalPortfolioValue !== null ? `€${totalPortfolioValue.toFixed(2)}` : '-'}</span>
              </div>
            </div>
            <div className="mt-4 rounded-[1.75rem] border border-slate-700/70 bg-slate-950/90 p-4 shadow-[0_30px_80px_-40px_rgba(0,212,255,0.3)]">
              {snapshotsLoading ? (
                <div className="text-sm text-slate-400">Loading snapshots...</div>
              ) : snapshotsError ? (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{snapshotsError}</div>
              ) : snapshots && snapshots.length > 0 ? (
                <div style={{ width: '100%', height: 160 }}>
                  <ResponsiveContainer>
                    <LineChart data={snapshots.map((s) => ({ date: s.date, value: s.value }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} itemStyle={{ color: '#00d4ff' }} />
                      <Line type="monotone" dataKey="value" stroke="#00ff9d" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-sm text-slate-400">No portfolio snapshots yet</div>
              )}
            </div>
          </div>

          <div className="glass-card p-6">
            <h2 className="text-xl font-semibold text-slate-100 mb-2">Achievements</h2>
            <p className="text-sm text-slate-400 mb-4">Unlock achievements by reaching milestones in your trading journey.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {/** Define full achievement list inline to avoid importing server code */}
              {[
                { key: 'first_trade', icon: '🎯', title: 'First Trade' },
                { key: 'investor', icon: '💰', title: 'Investor' },
                { key: 'market_veteran', icon: '📈', title: 'Market Veteran' },
                { key: 'diversified', icon: '🌎', title: 'Diversified Portfolio' },
                { key: 'rising_star', icon: '🚀', title: 'Rising Star' }
              ].map((ach) => {
                const unlocked = (achievements || []).some((a) => a.achievement_key === ach.key)
                const record = (achievements || []).find((a) => a.achievement_key === ach.key)
                return (
                  <div
                    key={ach.key}
                    className={
                      `flex items-center gap-3 rounded-xl border p-3 ` +
                      (unlocked
                        ? 'border-cyan-500/30 bg-cyan-500/6 shadow-[0_8px_30px_-16px_rgba(0,212,255,0.25)]'
                        : 'border-slate-700/50 bg-slate-900/60 opacity-60')
                    }
                  >
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg ${unlocked ? 'bg-cyan-500/10 text-cyan-200' : 'bg-slate-800 text-slate-400'}`}>
                      {unlocked ? ach.icon : '🔒'}
                    </div>
                    <div className="flex flex-col">
                      <div className={unlocked ? 'text-sm font-semibold text-slate-100' : 'text-sm font-semibold text-slate-400'}>{ach.title}</div>
                      <div className="text-xs text-slate-400">{unlocked && record?.unlocked_at ? new Date(record.unlocked_at).toLocaleString() : (unlocked ? '' : 'Locked')}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="glass-card p-6">
            <h2 className="text-xl font-semibold text-slate-100 mb-2">Profit / Loss</h2>
            <p className="text-sm text-slate-400 mb-4">Profit and loss is calculated from the initial €10,000 starting capital.</p>
            <div className="rounded-[1.75rem] border border-slate-700/70 bg-slate-950/90 p-4 shadow-[0_30px_80px_-40px_rgba(0,212,255,0.3)]">
              {profitLossSnapshots && profitLossSnapshots.length > 0 ? (
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer>
                    <LineChart data={profitLossSnapshots}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(value: number) => [`€${value.toFixed(2)}`, 'P/L']}
                        labelFormatter={(label) => `Date: ${label}`}
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                        itemStyle={{ color: '#00d4ff' }}
                      />
                      <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="profitLoss" stroke="#00ff9d" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-sm text-slate-400">No profit/loss snapshot data available</div>
              )}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-700 bg-slate-900/90 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.7)]">
            <h2 className="text-lg font-medium mb-2 text-slate-100">Notes</h2>
            <p className="text-sm text-slate-300">This view uses the same Supabase auth session as the trade page and fetches current quotes via the existing Twelve Data integration.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
