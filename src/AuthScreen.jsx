import { useState } from 'react'
import { signIn, signUp } from './supabase'

export default function AuthScreen() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    if (mode === 'login') {
      const { error } = await signIn(email, password)
      if (error) setError(error.message)
    } else {
      const { error } = await signUp(email, password)
      if (error) {
        setError(error.message)
      } else {
        setInfo('Kayıt başarılı! E-postanı kontrol et ve onay linkine tıkla, ardından giriş yap.')
        setMode('login')
      }
    }
    setLoading(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-[#0f766e] shadow-lg shadow-teal-100 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Yapılacaklar</h1>
          <p className="text-slate-500 text-sm mt-1">
            {mode === 'login' ? 'Hesabına giriş yap' : 'Yeni hesap oluştur'}
          </p>
        </div>

        <div className="auth-form-card">
          <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setInfo('') }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Giriş Yap
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); setInfo('') }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Kayıt Ol
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">E-posta</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ornek@email.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 placeholder-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Şifre</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="En az 6 karakter"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 placeholder-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-sm rounded-xl px-4 py-3">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {info && (
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="primary-button w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm mt-1"
            >
              {loading
                ? (mode === 'login' ? 'Giriş yapılıyor...' : 'Hesap oluşturuluyor...')
                : (mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          Görevlerini güvende tut, her cihazdan eriş.
        </p>
      </div>
    </div>
  )
}
