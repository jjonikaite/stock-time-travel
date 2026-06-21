'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import supabase from '../lib/supabase'

export default function Header() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    async function loadSession() {
      const { data, error } = await supabase.auth.getSession()
      if (!error && data?.session) {
        setIsAuthenticated(true)
      } else {
        setIsAuthenticated(false)
      }
    }

    loadSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.access_token))
    })

    return () => {
      authListener?.subscription.unsubscribe()
    }
  }, [])

  const clearDemoStorage = () => {
    if (typeof window === 'undefined') return

    Object.keys(window.localStorage).forEach((key) => {
      if (key.includes('supabase') || key.includes('sb:auth')) {
        window.localStorage.removeItem(key)
      }
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    clearDemoStorage()
    setIsAuthenticated(false)
    router.push('/trade')
  }

  return (
    <header className="bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-xl shadow-[0_25px_80px_-40px_rgba(0,212,255,0.45)]">
      <div className="container flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Link href="/" className="inline-flex items-center gap-3 text-2xl font-bold tracking-tight text-cyan-200 hover:text-cyan-100">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200 shadow-[0_0_30px_-16px_rgba(0,212,255,0.6)]">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                <path d="M4 16L10 10L14 14L20 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 20L20 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            Stock Time Travel
          </Link>
          <p className="max-w-xl text-sm leading-6 text-slate-400">Travel through market history and test investment decisions.</p>
        </div>

        <nav className="flex flex-wrap items-center gap-4">
          <Link href="/portfolio" className="text-sm text-slate-300 transition hover:text-cyan-200">
            Portfolio
          </Link>
          <Link href="/trade" className="text-sm text-slate-300 transition hover:text-cyan-200">
            Trade
          </Link>
          <Link href="/history" className="text-sm text-slate-300 transition hover:text-cyan-200">
            History
          </Link>
          {isAuthenticated ? (
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-cyan-100 transition hover:bg-cyan-500/20"
            >
              Logout
            </button>
          ) : null}
        </nav>
      </div>
    </header>
  )
}
