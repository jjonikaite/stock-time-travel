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

  try {
    const { data: rows, error } = await supabase
      .from('portfolio_snapshots')
      .select('total_value, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ series: [] })
    }

    const series = (rows || []).map((r: any) => ({
      date: String(r.created_at).split('T')[0],
      value: Number(r.total_value ?? 0)
    }))

    return NextResponse.json({ series })
  } catch (err) {
    return NextResponse.json({ series: [] })
  }
}
