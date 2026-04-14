import { useState, useEffect } from 'react'
import './index.css'
import { supabase, signOut, fetchTodos, addTodo, updateTodo, deleteTodo } from './supabase'
import AuthScreen from './AuthScreen'
import OfficeExpenseApp from './OfficeExpenseSupabaseApp'

const CATEGORIES = [
  { id: 'all', label: 'Tümü', emoji: '✦' },
  { id: 'work', label: 'İş', emoji: '💼' },
  { id: 'personal', label: 'Kişisel', emoji: '🚀' },
  { id: 'daily', label: 'Günlük', emoji: '📅' },
]

const PRIORITY = {
  high: { label: 'Yüksek', dot: 'bg-rose-400', badge: 'bg-rose-50 text-rose-600 ring-rose-200' },
  medium: { label: 'Orta', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-600 ring-amber-200' },
  low: { label: 'Düşük', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [activeApp, setActiveApp] = useState('home')
  const [tasks, setTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [activeCategory, setActiveCategory] = useState('all')
  const [showCompleted, setShowCompleted] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [newCategory, setNewCategory] = useState('work')
  const [newPriority, setNewPriority] = useState('medium')
  const [editId, setEditId] = useState(null)
  const [editText, setEditText] = useState('')

  // Session listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setActiveApp('home')
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load todos when session changes
  useEffect(() => {
    if (session) loadTasks()
    else setTasks([])
  }, [session])

  async function loadTasks() {
    setLoadingTasks(true)
    const { data } = await fetchTodos()
    if (data) setTasks(data)
    setLoadingTasks(false)
  }

  async function handleAddTask() {
    const text = newTask.trim()
    if (!text) return
    const { data } = await addTodo(text, newCategory, newPriority)
    if (data) {
      setTasks(prev => [data[0], ...prev])
      setNewTask('')
    }
  }

  async function handleToggle(id, current) {
    const { data } = await updateTodo(id, { completed: !current })
    if (data) setTasks(prev => prev.map(t => t.id === id ? data[0] : t))
  }

  async function handleDelete(id) {
    const { error } = await deleteTodo(id)
    if (!error) setTasks(prev => prev.filter(t => t.id !== id))
  }

  async function handleSaveEdit() {
    const text = editText.trim()
    if (!text) return
    const { data } = await updateTodo(editId, { text })
    if (data) {
      setTasks(prev => prev.map(t => t.id === editId ? data[0] : t))
      setEditId(null)
    }
  }

  async function handleSignOut() {
    await signOut()
  }

  // Still checking session
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#f4f4f7] flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  // Not logged in
  if (!session) return <AuthScreen />

  if (activeApp === 'home') {
    return <AppChooser session={session} onSelect={setActiveApp} onSignOut={handleSignOut} />
  }

  if (activeApp === 'office') {
    return <OfficeExpenseApp session={session} onBack={() => setActiveApp('home')} onSignOut={handleSignOut} />
  }

  const filtered = tasks.filter(t => {
    if (!showCompleted && t.completed) return false
    if (activeCategory !== 'all' && t.category !== activeCategory) return false
    return true
  })

  const pendingCount = tasks.filter(t => !t.completed).length
  const completedCount = tasks.filter(t => t.completed).length
  const catCount = (cat) =>
    tasks.filter(t => !t.completed && (cat === 'all' || t.category === cat)).length

  const today = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="min-h-screen bg-[#f4f4f7] flex flex-col items-center">

      {/* Hero Header */}
      <div className="w-full bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 px-4 pt-12 pb-20 text-center relative">
        {/* Sign out button */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2">
          <button
            onClick={() => setActiveApp('home')}
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-all cursor-pointer border border-white/20"
          >
            Ana menü
          </button>
          <div className="flex items-center gap-2">
            <span className="text-indigo-200 text-xs hidden sm:block">{session.user.email}</span>
            <button
              onClick={handleSignOut}
              title="Çıkış Yap"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-all cursor-pointer border border-white/20"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Çıkış
            </button>
          </div>
        </div>

        <p className="text-indigo-200 text-sm font-medium tracking-widest uppercase mb-3">{today}</p>
        <h1 className="text-5xl font-bold text-white tracking-tight mb-2">Yapılacaklar</h1>
        <p className="text-indigo-200 text-base">
          {loadingTasks
            ? 'Yükleniyor…'
            : pendingCount > 0
              ? <><span className="text-white font-semibold">{pendingCount}</span> görev seni bekliyor</>
              : 'Tüm görevler tamamlandı 🎉'}
        </p>
        {!loadingTasks && completedCount > 0 && tasks.length > 0 && (
          <div className="mt-5 mx-auto w-52">
            <div className="h-1.5 bg-indigo-400/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${(completedCount / tasks.length) * 100}%` }}
              />
            </div>
            <p className="text-xs text-indigo-200 mt-1.5">{completedCount}/{tasks.length} tamamlandı</p>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="w-full max-w-xl px-4 -mt-10 pb-16 flex flex-col gap-5">

        {/* Add Task Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-indigo-100/70 p-5 border border-white">
          <textarea
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTask() } }}
            placeholder="Yeni görev ekle… (Enter ile kaydet)"
            rows={3}
            className="w-full text-slate-800 placeholder-slate-300 text-base resize-none focus:outline-none leading-relaxed"
          />
          <div className="border-t border-slate-100 mt-3 pt-3 flex items-center gap-2 flex-wrap">
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 cursor-pointer"
            >
              {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
              ))}
            </select>
            <select
              value={newPriority}
              onChange={e => setNewPriority(e.target.value)}
              className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 cursor-pointer"
            >
              <option value="high">🔴 Yüksek</option>
              <option value="medium">🟡 Orta</option>
              <option value="low">🟢 Düşük</option>
            </select>
            <button
              onClick={handleAddTask}
              disabled={!newTask.trim()}
              className="ml-auto flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold rounded-xl shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-300 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Ekle
            </button>
          </div>
        </div>

        {/* Category + toggle row */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-300'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-indigo-300 hover:text-indigo-500'
              }`}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
              {catCount(cat.id) > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  activeCategory === cat.id ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  {catCount(cat.id)}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => setShowCompleted(p => !p)}
            className={`text-sm px-4 py-2 rounded-full border transition-all cursor-pointer whitespace-nowrap ${
              showCompleted
                ? 'bg-slate-700 text-white border-slate-700'
                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'
            }`}
          >
            {showCompleted ? '✓ Gizle' : '✓ Göster'}
          </button>
        </div>

        {/* Task List */}
        <div className="space-y-3">
          {loadingTasks && (
            <div className="text-center py-20">
              <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mb-4" />
              <p className="text-slate-400 text-sm">Görevler yükleniyor…</p>
            </div>
          )}

          {!loadingTasks && filtered.length === 0 && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🎯</div>
              <p className="font-semibold text-slate-500 text-lg">Bekleyen görev yok</p>
              <p className="text-sm text-slate-400 mt-1">Yeni bir görev ekleyerek başla</p>
            </div>
          )}

          {!loadingTasks && filtered.map(task => {
            const cat = CATEGORIES.find(c => c.id === task.category)
            const pri = PRIORITY[task.priority] || PRIORITY.medium
            const dateLabel = task.created_at
              ? new Date(task.created_at).toLocaleDateString('tr-TR')
              : ''
            return (
              <div
                key={task.id}
                className={`group bg-white rounded-2xl border transition-all duration-200 ${
                  task.completed
                    ? 'border-slate-100 opacity-50'
                    : 'border-slate-100 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-50'
                }`}
              >
                {editId === task.id ? (
                  <div className="p-4 flex gap-2 items-center">
                    <input
                      autoFocus
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditId(null) }}
                      className="flex-1 text-base px-4 py-2.5 rounded-xl border border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    <button onClick={handleSaveEdit} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 cursor-pointer">Kaydet</button>
                    <button onClick={() => setEditId(null)} className="px-4 py-2.5 bg-slate-100 text-slate-500 rounded-xl text-sm hover:bg-slate-200 cursor-pointer">İptal</button>
                  </div>
                ) : (
                  <div className="p-4 flex items-start gap-4">
                    <button
                      onClick={() => handleToggle(task.id, task.completed)}
                      className={`mt-0.5 w-6 h-6 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${
                        task.completed
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                      }`}
                    >
                      {task.completed && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className={`text-base leading-relaxed font-medium ${
                        task.completed ? 'line-through text-slate-400' : 'text-slate-700'
                      }`}>
                        {task.text}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <span>{cat?.emoji}</span>
                          <span>{cat?.label}</span>
                        </span>
                        <span className="text-slate-200">·</span>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ring-1 ${pri.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} />
                          {pri.label}
                        </span>
                        <span className="text-slate-200">·</span>
                        <span className="text-xs text-slate-400">{dateLabel}</span>
                      </div>
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => { setEditId(task.id); setEditText(task.text) }}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer"
                        title="Düzenle"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Sil"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {!loadingTasks && completedCount > 0 && (
          <p className="text-center text-sm text-slate-400">
            {completedCount} tamamlanmış görev
          </p>
        )}
      </div>
    </div>
  )
}

function AppChooser({ session, onSelect, onSignOut }) {
  return (
    <div className="min-h-screen bg-[#f6f7f4] text-slate-900 relative px-4 py-20">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <span className="text-slate-500 text-xs hidden sm:block">{session.user.email}</span>
        <button
          onClick={onSignOut}
          className="px-3 py-2 rounded-lg bg-white text-slate-600 text-xs font-semibold border border-slate-200 hover:border-rose-300 transition-all cursor-pointer"
        >
          Çıkış
        </button>
      </div>

      <div className="mx-auto max-w-5xl">
        <div className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Hoş geldin</p>
          <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight">Bugün neyi takip edelim?</h1>
          <p className="mt-4 max-w-2xl text-slate-600">
            Kullanmak istediğin alanı seç. Her modül kendi verisini saklar ve kaldığın yerden devam edersin.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <button
            onClick={() => onSelect('todos')}
            className="text-left bg-white border border-slate-200 rounded-lg p-6 shadow-sm hover:-translate-y-1 hover:border-emerald-300 hover:shadow-lg transition-all cursor-pointer"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-bold">1</span>
            <h2 className="mt-5 text-xl font-bold">Yapılacaklar</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Görevlerini kategori ve önceliklerle takip et.</p>
          </button>

          <button
            onClick={() => onSelect('office')}
            className="text-left bg-white border border-slate-200 rounded-lg p-6 shadow-sm hover:-translate-y-1 hover:border-sky-300 hover:shadow-lg transition-all cursor-pointer"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 font-bold">2</span>
            <h2 className="mt-5 text-xl font-bold">Ofis Gidiş ve Masraf</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Ofise gittiğin günleri, otoparkı ve aylık ulaşım giderini gör.</p>
          </button>

          <div className="text-left bg-slate-100 border border-slate-200 rounded-lg p-6 opacity-70">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-slate-500 font-bold">3</span>
            <h2 className="mt-5 text-xl font-bold text-slate-500">Coming soon</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Bu alan şimdilik tıklanamaz. İleride yeni bir modül eklenecek.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
