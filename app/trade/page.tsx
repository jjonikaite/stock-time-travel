'use client'

import { useEffect, useMemo, useState } from 'react'
import supabase from '../../lib/supabase'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

type Side = 'buy' | 'sell'

export default function TradePage() {
  const DEFAULT_STARTING_BALANCE = 10000
  const DEMO_EMAIL = 'demo@stock-simulator.local'
  const DEMO_PASSWORD = 'Demo1234!'

  const [symbol, setSymbol] = useState('AAPL')
  const [side, setSide] = useState<Side>('buy')
  const [amountEUR, setAmountEUR] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState<number | null>(null)
  const [datetime, setDatetime] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false)
  const [simulationDate, setSimulationDate] = useState('')
  const [cashBalance, setCashBalance] = useState<number | null>(null)
  const [positionQuantity, setPositionQuantity] = useState<number | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [authEmail, setAuthEmail] = useState(DEMO_EMAIL)
  const [authPassword, setAuthPassword] = useState(DEMO_PASSWORD)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [chartData, setChartData] = useState<{ date: string; close: number }[] | null>(null)
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState('')

  const formattedQuantity = useMemo(() => {
    if (!price) return ''
    if (amountEUR) {
      const numeric = Number(amountEUR)
      if (Number.isFinite(numeric) && numeric > 0) {
        return (numeric / price).toFixed(6)
      }
    }
    return quantity
  }, [amountEUR, price, quantity])

  const createProfileUsername = (currentUserId: string, email?: string | null) => {
    if (email) {
      const prefix = email.split('@')[0].trim()
      if (prefix.length > 0) {
        return prefix
      }
    }
    return `user-${currentUserId.slice(0, 8)}`
  }

  const ensureProfileExists = async (currentUserId: string, email?: string | null) => {
    const username = createProfileUsername(currentUserId, email)

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: currentUserId,
          username,
          initial_balance: DEFAULT_STARTING_BALANCE,
          cash_balance: DEFAULT_STARTING_BALANCE,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )

    if (profileError) {
      throw profileError
    }
  }

  useEffect(() => {
    async function loadChart() {
      if (!symbol) return
      setChartError('')
      setChartLoading(true)
      try {
        const response = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}`)
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch chart data')
        }
        setChartData(data.series || [])
      } catch (err) {
        setChartData(null)
        setChartError('Market data temporarily unavailable.')
      } finally {
        setChartLoading(false)
      }
    }

    loadChart()
  }, [symbol])

  useEffect(() => {
    async function loadAuth() {
      setAuthError('')
      setError('')
      setLoading(true)

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session) {
        setLoading(false)
        return
      }

      setAccessToken(sessionData.session.access_token)

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) {
        setAuthError('Unable to resolve auth user')
        setLoading(false)
        return
      }

      try {
        await ensureProfileExists(userData.user.id, userData.user.email)
      } catch (err) {
        setAuthError('Unable to initialize profile')
        setLoading(false)
        return
      }

      setUserId(userData.user.id)
      setLoading(false)
    }

    loadAuth()
  }, [])

  const handleAuth = async (mode: 'login' | 'register') => {
    setAuthError('')
    setAuthLoading(true)
    setLoading(true)

    try {
      if (mode === 'register') {
        const { error: signUpError } = await supabase.auth.signUp({ email: authEmail, password: authPassword })
        if (signUpError) {
          throw signUpError
        }
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword
      })

      if (signInError || !signInData.session) {
        throw signInError ?? new Error('Unable to sign in')
      }

      setAccessToken(signInData.session.access_token)

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) {
        throw userError ?? new Error('Unable to resolve auth user')
      }

      await ensureProfileExists(userData.user.id, userData.user.email)
      setUserId(userData.user.id)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setAuthLoading(false)
      setLoading(false)
    }
  }

  const handleUseDemoAccount = async () => {
    setAuthEmail(DEMO_EMAIL)
    setAuthPassword(DEMO_PASSWORD)
    setAuthError('')
    setAuthLoading(true)
    setLoading(true)

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD
      })

      if (signInError || !signInData.session) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD
        })

        if (signUpError) {
          throw signUpError
        }

        const { data: retrySignInData, error: retrySignInError } = await supabase.auth.signInWithPassword({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD
        })

        if (retrySignInError || !retrySignInData.session) {
          throw retrySignInError ?? new Error('Unable to sign in demo account')
        }

        setAccessToken(retrySignInData.session.access_token)
      } else {
        setAccessToken(signInData.session.access_token)
      }

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) {
        throw userError ?? new Error('Unable to resolve auth user')
      }

      await ensureProfileExists(userData.user.id, userData.user.email)
      setUserId(userData.user.id)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in demo account')
    } finally {
      setAuthLoading(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    async function loadPrice(background = false) {
      if (!symbol) return
      setError('')
      if (background) {
        setIsUpdatingPrice(true)
      } else {
      setLoading(true)
      }

      try {
        const dateParam = simulationDate ? `&date=${encodeURIComponent(simulationDate)}` : ''
        const response = await fetch(`/api/twelve?symbol=${encodeURIComponent(symbol)}${dateParam}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch price')
        }

        setPrice(data.price)
        setDatetime(data.datetime)
        setLastUpdated(new Date().toLocaleTimeString('en-GB', { hour12: false }))
      } catch (err) {
        setPrice(null)
        setDatetime('')
        setError(err instanceof Error ? err.message : 'Unknown error loading price')
      } finally {
        if (background) {
          setIsUpdatingPrice(false)
        } else {
        setLoading(false)
        }
      }
    }

    loadPrice()

    const intervalId = setInterval(() => {
      loadPrice(true)
    }, 60000)

    return () => {
      clearInterval(intervalId)
    }
  }, [symbol, simulationDate])

  const loadPortfolio = async (currentUserId: string, currentSymbol: string) => {
    setError('')
    setLoading(true)

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('cash_balance')
      .eq('user_id', currentUserId)
      .single()

    if (profileError || !profileData) {
      setError('Unable to load profile balance')
    } else {
      setCashBalance(Number(profileData.cash_balance ?? 0))
    }

    const { data: positionData, error: positionError } = await supabase
      .from('positions')
      .select('quantity')
      .eq('user_id', currentUserId)
      .eq('symbol', currentSymbol)
      .maybeSingle()

    if (positionError) {
      setError('Unable to load position for this symbol')
    } else {
      setPositionQuantity(positionData ? Number(positionData.quantity) : 0)
    }

    setLoading(false)
  }

  useEffect(() => {
    if (!userId) return
    loadPortfolio(userId, symbol)
  }, [userId, symbol])

  const totalValue = useMemo(() => {
    const qty = Number(formattedQuantity)
    return price && Number.isFinite(qty) ? qty * price : 0
  }, [formattedQuantity, price])

  const getTodayString = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    if (!userId || !accessToken) {
      setError('User is not authenticated')
      return
    }

    if (!price) {
      setError('No price available')
      return
    }

    const requestedQuantity = Number(formattedQuantity)
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      setError('Invalid quantity')
      return
    }

    const requestedAmount = amountEUR ? Number(amountEUR) : requestedQuantity * price
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      setError('Invalid amount')
      return
    }

    if (side === 'buy' && cashBalance !== null && requestedAmount > cashBalance) {
      setError('Insufficient cash balance')
      return
    }

    setLoading(true)

    const response = await fetch('/api/trade', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        symbol,
        side,
        amountEUR: amountEUR ? Number(amountEUR) : undefined,
        quantity: requestedQuantity,
        simulation_date: simulationDate || undefined
      })
    })

    const data = await response.json()
    if (!response.ok) {
      setError(data.error || 'Trade failed')
    } else {
      setError('')
      setAmountEUR('')
      setQuantity('')
      if (cashBalance !== null) {
        setCashBalance(side === 'buy' ? cashBalance - requestedAmount : cashBalance + requestedAmount)
      }
      if (userId) {
        await loadPortfolio(userId, symbol)
      }
    }

    setLoading(false)
  }

  if (!userId) {
    return (
      <section>
        <h1 className="text-2xl font-semibold mb-4 text-white">Sign in to trade</h1>
        <div className="max-w-md space-y-6 rounded-[1.75rem] border border-slate-700 bg-slate-900/90 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.7)]">
          <div>
            <p className="text-sm text-slate-300">Use the demo account or register with email and password.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-200">Email</label>
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                className="mt-1 block w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-white placeholder-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="demo@stock-simulator.local"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200">Password</label>
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                className="mt-1 block w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-white placeholder-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="Demo1234!"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => handleAuth('login')}
                disabled={authLoading}
                className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {authLoading ? 'Signing in...' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={() => handleAuth('register')}
                disabled={authLoading}
                className="inline-flex items-center justify-center rounded-full bg-slate-800 border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-800"
              >
                {authLoading ? 'Registering...' : 'Register'}
              </button>
            </div>

            <button
              type="button"
              onClick={handleUseDemoAccount}
              disabled={authLoading}
              className="inline-flex w-full items-center justify-center rounded-full border border-cyan-500 bg-slate-800 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
            >
              {authLoading ? 'Using demo account...' : 'Use demo account'}
            </button>

            {(authError || error) ? (
              <p className="text-sm text-rose-400">{authError || error}</p>
            ) : null}

            <p className="text-sm text-slate-400">Demo account credentials are prefilled. Registered accounts will receive a profile with €10,000 starting cash.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-8 pb-12">
      <div className="space-y-6 rounded-[1.75rem] border border-slate-700 bg-slate-900/90 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.7)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-white">Trade</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-400">Trade live or travel through market history with premium execution tools.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="date"
              value={simulationDate}
              onChange={(e) => setSimulationDate(e.target.value)}
              max={getTodayString()}
              className="rounded-3xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            />
            <button
              type="button"
              onClick={() => setSimulationDate('')}
              className="rounded-3xl border border-cyan-500/20 bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
            >
              Use Today
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-[1.75rem] border border-slate-700/70 bg-slate-950/85 px-4 py-3 shadow-[0_18px_45px_-30px_rgba(0,212,255,0.35)]">
          <span className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1.5 text-sm font-semibold text-cyan-100 shadow-[0_0_30px_-24px_rgba(0,212,255,0.55)]">
            {simulationDate ? '⏳ Time Travel Active' : '🟢 Live Market (Today)'}
          </span>
          {simulationDate ? <span className="text-sm text-slate-300">Date: {simulationDate}</span> : null}
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6">
        <div className="rounded-[2rem] border border-slate-700/60 bg-slate-950/80 p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)]">
          <h2 className="text-xl font-semibold mb-4 text-slate-100">Order Entry</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-200">Symbol</label>
              <input
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                className="mt-1 block w-full rounded-3xl border border-slate-700 bg-slate-900 px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="AAPL"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200">Side</label>
              <select
                value={side}
                onChange={(event) => setSide(event.target.value as Side)}
                className="mt-1 block w-full rounded-3xl border border-slate-700 bg-slate-900 px-4 py-3 text-white focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              >
                <option value="buy">BUY</option>
                <option value="sell">SELL</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200">Amount (EUR)</label>
              <input
                type="number"
                step="0.01"
                value={amountEUR}
                onChange={(event) => setAmountEUR(event.target.value)}
                className="mt-1 block w-full rounded-3xl border border-slate-700 bg-slate-900 px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200">Shares</label>
              <input
                type="number"
                step="0.000001"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="mt-1 block w-full rounded-3xl border border-slate-700 bg-slate-900 px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="0.15"
              />
            </div>

            <div className="rounded-[1.75rem] border border-slate-700/70 bg-slate-900/80 p-4">
              <div className="flex justify-between text-sm text-slate-400">
                <span>Price</span>
                <span>{price ? `€${price.toFixed(2)}` : '-'}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-400">
                <span>Quantity</span>
                <span>{formattedQuantity || '-'}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-slate-100 mt-2">
                <span>Total</span>
                <span>{price ? `€${totalValue.toFixed(2)}` : '-'}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-400 mt-2">
                <span>Last Updated</span>
                <span>{lastUpdated || '-'}</span>
              </div>
              {isUpdatingPrice ? (
                <p className="mt-2 text-sm text-cyan-200">Updating market data...</p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-full bg-cyan-400 px-6 py-4 text-base font-semibold uppercase tracking-[0.02em] text-slate-950 shadow-[0_24px_60px_-30px_rgba(0,212,255,0.75)] transition hover:bg-cyan-300 hover:shadow-[0_28px_80px_-40px_rgba(0,212,255,0.85)] focus:outline-none focus:ring-2 focus:ring-cyan-400/30 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-950 text-cyan-100">
                <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {loading ? 'Processing...' : 'Execute Trade'}
            </button>

            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          </form>
        </div>

        <div className="rounded-[2rem] border border-slate-700/60 bg-slate-950/80 p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)]">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Market Data</h2>
              <p className="text-sm text-slate-400">{datetime ? `Last price time: ${datetime}` : 'Loading current price...'}</p>

              <div className="mt-4 rounded-[1.75rem] border border-slate-700/70 bg-slate-900/80 p-4">
                {chartLoading ? (
                  <div className="text-sm text-slate-400">Loading chart...</div>
                ) : chartError ? (
                  <div className="rounded-[1.75rem] border border-amber-400/20 bg-amber-500/10 p-4 shadow-[0_20px_60px_-40px_rgba(251,191,36,0.4)]">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
                        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                          <path d="M12 8v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M12 14h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M12 21c4.9706 0 9-4.0294 9-9s-4.0294-9-9-9-9 4.0294-9 9 4.0294 9 9 9z" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-amber-100">Market data temporarily unavailable.</p>
                        <p className="mt-1 text-sm text-slate-400">Please try again in a moment.</p>
                      </div>
                    </div>
                  </div>
                ) : chartData && chartData.length > 0 ? (
                  <div style={{ width: '100%', height: 200 }}>
                    <ResponsiveContainer>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} itemStyle={{ color: '#00d4ff' }} />
                        <Line type="monotone" dataKey="close" stroke="#00ff9d" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">No chart data</div>
                )}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-700/70 bg-slate-900/80 p-4">
              <h2 className="text-xl font-semibold text-slate-100">Portfolio Snapshot</h2>
              <p className="text-sm text-slate-400 mt-2">Cash balance: {cashBalance !== null ? `€${cashBalance.toFixed(2)}` : '-'}</p>
              <p className="text-sm text-slate-400">Current position: {positionQuantity !== null ? `${positionQuantity.toFixed(6)} shares` : 'Load from your portfolio'}</p>
            </div>

            <div className="rounded-[1.75rem] border border-slate-700/70 bg-slate-900/80 p-4">
              <h2 className="text-xl font-semibold text-slate-100">Simulation Mode</h2>
              <p className="text-sm text-slate-400 mt-2"><strong>Mode:</strong> {simulationDate ? 'Time Travel Active' : 'Live Market (Today)'}</p>
              {simulationDate ? (
                <p className="text-sm text-slate-400"><strong>Simulation date:</strong> {simulationDate}</p>
              ) : null}
              <p className="text-sm text-slate-400"><strong>Price source:</strong> {simulationDate ? `Historical price for ${simulationDate}` : 'Current market price from Twelve Data'}</p>
              {datetime && <p className="text-sm text-slate-400"><strong>Price datetime:</strong> {datetime}</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
