'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/db'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function login() {
    if (!email || !password) { setError('Bitte E-Mail und Passwort eingeben.'); return }
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError('E-Mail oder Passwort falsch.'); setLoading(false); return }
    router.push('/admin')
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-[#FFBF00] rounded-2xl px-8 py-7 mb-4">
          <p className="text-[10px] font-bold tracking-widest uppercase text-black/50 mb-1">Sportmedizin Arlberg</p>
          <h1 className="text-xl font-extrabold text-black">Admin-Bereich</h1>
          <p className="text-black/50 text-xs mt-1">Nur für autorisierte Benutzer</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">E-Mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()} placeholder="admin@example.com"
              className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00] focus:ring-2 focus:ring-[#FFBF00]/20 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Passwort</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()} placeholder="••••••••"
              className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00] focus:ring-2 focus:ring-[#FFBF00]/20 transition-all" />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>}
          <button onClick={login} disabled={loading}
            className="w-full bg-[#FFBF00] hover:bg-[#FFD54F] disabled:bg-gray-200 disabled:text-gray-400 text-black font-bold py-3 rounded-xl transition-all text-sm">
            {loading ? 'Anmelden…' : 'Anmelden'}
          </button>
        </div>
      </div>
    </main>
  )
}
