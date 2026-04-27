import { useEffect, useState } from 'react'
import './index.css'
import {
  supabase,
  hasSupabaseConfig,
  signOut,
  fetchTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  fetchTodoCategories,
  ensureDefaultTodoCategories,
  addTodoCategory,
  deleteTodoCategoryAndReassign,
} from './supabase'
import AuthScreen from './AuthScreen'
import OfficeExpenseApp from './OfficeExpenseSupabaseApp'

const PRIORITY = {
  high: { label: 'Yuksek', dot: 'bg-rose-400', badge: 'bg-rose-50 text-rose-600 ring-rose-200' },
  medium: { label: 'Orta', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-600 ring-amber-200' },
  low: { label: 'Dusuk', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [activeApp, setActiveApp] = useState('home')
  const [tasks, setTasks] = useState([])
  const [todoCategories, setTodoCategories] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [activeCategory, setActiveCategory] = useState('all')
  const [showCompleted, setShowCompleted] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [editId, setEditId] = useState(null)
  const [editText, setEditText] = useState('')
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [categoryInput, setCategoryInput] = useState('')
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [categoryError, setCategoryError] = useState('')

  useEffect(() => {
    if (!hasSupabaseConfig) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setActiveApp('home')
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    const params = new URLSearchParams(window.location.search)
    const view = params.get('view')
    if (view === 'todos' || view === 'office') setActiveApp(view)
    else setActiveApp('home')
  }, [session])

  useEffect(() => {
    if (!session) return
    function handlePopState() {
      const view = new URLSearchParams(window.location.search).get('view')
      setActiveApp(view === 'todos' || view === 'office' ? view : 'home')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [session])

  useEffect(() => {
    if (!hasSupabaseConfig || !session) {
      setTasks([])
      setTodoCategories([])
      return
    }
    loadTodoData()
  }, [session])

  async function loadTodoData() {
    setLoadingTasks(true)
    const [{ data: todoData }, { data: categoryData, error: categoryErrorRes }] = await Promise.all([
      fetchTodos(),
      fetchTodoCategories(),
    ])

    let categories = categoryData || []
    if (!categoryErrorRes && categories.length === 0) {
      const { data: ensured } = await ensureDefaultTodoCategories()
      categories = ensured || []
    }

    setTodoCategories(categories)
    setTasks(todoData || [])
    setNewCategory(prev => (prev && categories.some(cat => cat.id === prev) ? prev : (categories[0]?.id || '')))
    setActiveCategory(prev => (prev === 'all' || categories.some(cat => cat.id === prev) ? prev : 'all'))
    setLoadingTasks(false)
  }

  async function handleAddTask() {
    const text = newTask.trim()
    if (!text || !newCategory) return
    const { data } = await addTodo(text, newCategory, newPriority)
    if (data) {
      setTasks(prev => [data[0], ...prev])
      setNewTask('')
    }
  }

  async function handleToggle(id, current) {
    const { data } = await updateTodo(id, { completed: !current })
    if (data) setTasks(prev => prev.map(task => task.id === id ? data[0] : task))
  }

  async function handleDelete(id) {
    const { error } = await deleteTodo(id)
    if (!error) setTasks(prev => prev.filter(task => task.id !== id))
  }

  async function handleSaveEdit() {
    const text = editText.trim()
    if (!text) return
    const { data } = await updateTodo(editId, { text })
    if (data) {
      setTasks(prev => prev.map(task => task.id === editId ? data[0] : task))
      setEditId(null)
    }
  }

  async function handleAddCategory() {
    const name = categoryInput.trim()
    if (!name) return
    setCategoryBusy(true)
    setCategoryError('')

    const { data, error } = await addTodoCategory(name)
    if (error) {
      setCategoryError(error.message || 'Kategori eklenemedi.')
      setCategoryBusy(false)
      return
    }

    setTodoCategories(prev => [...prev, data])
    setNewCategory(data.id)
    setCategoryInput('')
    setCategoryBusy(false)
  }

  async function handleDeleteCategory(categoryId) {
    const target = todoCategories.find(category => category.id === categoryId)
    if (!target || target.is_default) return

    const fallback = todoCategories.find(category => category.id !== categoryId)
    if (!fallback) {
      setCategoryError('Silmek icin en az bir kategori kalmali.')
      return
    }

    setCategoryBusy(true)
    setCategoryError('')
    const { error } = await deleteTodoCategoryAndReassign(categoryId, fallback.id)
    if (error) {
      setCategoryError(error.message || 'Kategori silinemedi.')
      setCategoryBusy(false)
      return
    }

    setTasks(prev => prev.map(task => (
      task.category_id === categoryId
        ? { ...task, category_id: fallback.id, category_name: fallback.name }
        : task
    )))
    setTodoCategories(prev => prev.filter(category => category.id !== categoryId))
    setActiveCategory(prev => (prev === categoryId ? 'all' : prev))
    setNewCategory(prev => (prev === categoryId ? fallback.id : prev))
    setCategoryBusy(false)
  }

  async function handleSignOut() {
    await signOut()
  }

  function navigateToApp(nextApp) {
    const nextUrl = nextApp === 'home' ? window.location.pathname : `${window.location.pathname}?view=${nextApp}`
    window.history.pushState({}, '', nextUrl)
    setActiveApp(nextApp)
  }

  if (!hasSupabaseConfig) return <MissingConfigScreen />

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#f4f4f7] flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return <AuthScreen />

  if (activeApp === 'home') {
    return <AppChooser session={session} onSelect={navigateToApp} onSignOut={handleSignOut} />
  }

  if (activeApp === 'office') {
    return <OfficeExpenseApp session={session} onBack={() => navigateToApp('home')} onSignOut={handleSignOut} />
  }

  const filtered = tasks.filter(task => {
    if (!showCompleted && task.completed) return false
    if (activeCategory !== 'all' && task.category_id !== activeCategory) return false
    return true
  })

  const pendingCount = tasks.filter(task => !task.completed).length
  const completedCount = tasks.filter(task => task.completed).length
  const categoryCount = (categoryId) => tasks.filter(task => !task.completed && (categoryId === 'all' || task.category_id === categoryId)).length
  const today = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
  const categoryMap = Object.fromEntries(todoCategories.map(category => [category.id, category]))

  return (
    <div className="app-page flex flex-col items-center">
      <div className="app-hero">
        <div className="app-topbar">
          <button onClick={() => navigateToApp('home')} className="nav-button cursor-pointer">Ana menu</button>
          <div className="topbar-actions">
            <span className="topbar-email hidden sm:block">{session.user.email}</span>
            <button onClick={handleSignOut} title="Cikis Yap" className="nav-button cursor-pointer">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Cikis
            </button>
          </div>
        </div>

        <p className="app-hero-kicker">{today}</p>
        <h1 className="app-hero-title">Yapilacaklar</h1>
        <p className="app-hero-subtitle">
          {loadingTasks
            ? 'Yukleniyor...'
            : pendingCount > 0
              ? <><span className="text-white font-semibold">{pendingCount}</span> gorev seni bekliyor</>
              : 'Tum gorevler tamamlandi'}
        </p>
        {!loadingTasks && completedCount > 0 && tasks.length > 0 && (
          <div className="mt-5 mx-auto w-52">
            <div className="h-1.5 bg-indigo-400/40 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${(completedCount / tasks.length) * 100}%` }} />
            </div>
            <p className="text-xs text-indigo-200 mt-1.5">{completedCount}/{tasks.length} tamamlandi</p>
          </div>
        )}
      </div>

      <div className="todo-content -mt-10 pb-16 flex flex-col gap-5">
        <div className="panel-card">
          <textarea
            value={newTask}
            onChange={event => setNewTask(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleAddTask() } }}
            placeholder="Yeni gorev ekle... (Enter ile kaydet)"
            rows={3}
            className="w-full text-slate-800 placeholder-slate-300 text-base resize-none focus:outline-none leading-relaxed"
          />
          <div className="toolbar-row border-t border-slate-100 mt-3 pt-3 flex items-center flex-wrap">
            <select value={newCategory} onChange={event => setNewCategory(event.target.value)} className="form-control text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-300 cursor-pointer">
              {todoCategories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <select value={newPriority} onChange={event => setNewPriority(event.target.value)} className="form-control text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-300 cursor-pointer">
              <option value="high">Yuksek</option>
              <option value="medium">Orta</option>
              <option value="low">Dusuk</option>
            </select>
            <button onClick={() => setShowCategoryModal(true)} className="ghost-button cursor-pointer">Kategori yonet</button>
            <button onClick={handleAddTask} disabled={!newTask.trim() || !newCategory} className="primary-button ml-auto disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Ekle
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button onClick={() => setActiveCategory('all')} className={`filter-pill flex items-center gap-1.5 px-4 py-2 text-sm transition-all cursor-pointer ${activeCategory === 'all' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-300' : 'bg-white text-slate-500 border border-slate-200 hover:border-indigo-300 hover:text-indigo-500'}`}>
            <span>Tumu</span>
            {categoryCount('all') > 0 && <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activeCategory === 'all' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{categoryCount('all')}</span>}
          </button>
          {todoCategories.map(category => (
            <button key={category.id} onClick={() => setActiveCategory(category.id)} className={`filter-pill flex items-center gap-1.5 px-4 py-2 text-sm transition-all cursor-pointer ${activeCategory === category.id ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-300' : 'bg-white text-slate-500 border border-slate-200 hover:border-indigo-300 hover:text-indigo-500'}`}>
              <span>{category.name}</span>
              {categoryCount(category.id) > 0 && <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activeCategory === category.id ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{categoryCount(category.id)}</span>}
            </button>
          ))}
          <button onClick={() => setShowCompleted(prev => !prev)} className={`filter-pill text-sm px-4 py-2 border transition-all cursor-pointer whitespace-nowrap ${showCompleted ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}>
            {showCompleted ? 'Tamamlananlari gizle' : 'Tamamlananlari goster'}
          </button>
        </div>

        <div className="space-y-3">
          {loadingTasks && (
            <div className="text-center py-20">
              <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mb-4" />
              <p className="text-slate-400 text-sm">Gorevler yukleniyor...</p>
            </div>
          )}

          {!loadingTasks && filtered.length === 0 && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">Hedef</div>
              <p className="font-semibold text-slate-500 text-lg">Bekleyen gorev yok</p>
              <p className="text-sm text-slate-400 mt-1">Yeni bir gorev ekleyerek basla</p>
            </div>
          )}

          {!loadingTasks && filtered.map(task => {
            const categoryLabel = categoryMap[task.category_id]?.name || task.category_name || 'Kategorisiz'
            const priority = PRIORITY[task.priority] || PRIORITY.medium
            const dateLabel = task.created_at ? new Date(task.created_at).toLocaleDateString('tr-TR') : ''

            return (
              <div key={task.id} className={`task-card group transition-all duration-200 ${task.completed ? 'border-slate-100 opacity-50' : 'border-slate-100 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-50'}`}>
                {editId === task.id ? (
                  <div className="p-4 flex gap-2 items-center">
                    <input
                      autoFocus
                      value={editText}
                      onChange={event => setEditText(event.target.value)}
                      onKeyDown={event => { if (event.key === 'Enter') handleSaveEdit(); if (event.key === 'Escape') setEditId(null) }}
                      className="flex-1 text-base px-4 py-2.5 rounded-xl border border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    <button onClick={handleSaveEdit} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 cursor-pointer">Kaydet</button>
                    <button onClick={() => setEditId(null)} className="px-4 py-2.5 bg-slate-100 text-slate-500 rounded-xl text-sm hover:bg-slate-200 cursor-pointer">Iptal</button>
                  </div>
                ) : (
                  <div className="p-4 flex items-start gap-4">
                    <button onClick={() => handleToggle(task.id, task.completed)} className={`mt-0.5 w-6 h-6 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${task.completed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                      {task.completed && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className={`text-base leading-relaxed font-medium ${task.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {task.text}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-xs text-slate-400">{categoryLabel}</span>
                        <span className="text-slate-200">|</span>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ring-1 ${priority.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
                          {priority.label}
                        </span>
                        <span className="text-slate-200">|</span>
                        <span className="text-xs text-slate-400">{dateLabel}</span>
                      </div>
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => { setEditId(task.id); setEditText(task.text) }} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer" title="Duzenle">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(task.id)} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer" title="Sil">
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

        {!loadingTasks && completedCount > 0 && <p className="text-center text-sm text-slate-400">{completedCount} tamamlanmis gorev</p>}
      </div>

      {showCategoryModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold text-slate-900">Kategori yonetimi</h2>
              <button onClick={() => { setShowCategoryModal(false); setCategoryError('') }} className="soft-button cursor-pointer">Kapat</button>
            </div>
            <p className="text-sm text-slate-500 mt-2">Yeni kategori ekleyebilir, ekledigin kategorileri silebilirsin.</p>

            <div className="mt-4 flex gap-2">
              <input
                value={categoryInput}
                onChange={event => setCategoryInput(event.target.value)}
                placeholder="Yeni kategori adi"
                className="form-control flex-1 px-3"
              />
              <button onClick={handleAddCategory} disabled={categoryBusy || !categoryInput.trim()} className="primary-button cursor-pointer disabled:opacity-50">Ekle</button>
            </div>

            {categoryError && <p className="mt-3 text-sm font-semibold text-rose-600">{categoryError}</p>}

            <div className="mt-5 space-y-2 max-h-64 overflow-auto">
              {todoCategories.map(category => (
                <div key={category.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="font-semibold text-slate-700">{category.name}</span>
                  {category.is_default ? (
                    <span className="text-xs font-bold text-slate-400">Varsayilan</span>
                  ) : (
                    <button onClick={() => handleDeleteCategory(category.id)} disabled={categoryBusy} className="danger-button cursor-pointer disabled:opacity-50">
                      Sil
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AppChooser({ session, onSelect, onSignOut }) {
  return (
    <div className="app-page chooser-page">
      <div className="app-topbar app-topbar-light">
        <span />
        <div className="topbar-actions">
          <span className="topbar-email hidden sm:block">{session.user.email}</span>
          <button onClick={onSignOut} className="ghost-button cursor-pointer">Cikis</button>
        </div>
      </div>

      <div className="chooser-container">
        <div className="chooser-heading">
          <p className="section-kicker">Hos geldin</p>
          <h1 className="section-title">Bugun neyi takip edelim?</h1>
          <p className="section-subtitle">Kullanmak istedigin alani sec. Her modul kendi verisini saklar ve kaldigin yerden devam edersin.</p>
        </div>

        <div className="chooser-grid">
          <button onClick={() => onSelect('todos')} className="module-card cursor-pointer">
            <span className="module-index">1</span>
            <h2 className="mt-5 text-xl font-bold">Yapilacaklar</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Gorevlerini kategori ve onceliklerle takip et.</p>
          </button>

          <button onClick={() => onSelect('office')} className="module-card cursor-pointer">
            <span className="module-index">2</span>
            <h2 className="mt-5 text-xl font-bold">Ofis Gidis ve Masraf</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Ofise gittigin gunleri, otoparki ve aylik ulasim giderini gor.</p>
          </button>

          <div className="module-card module-card-disabled">
            <span className="module-index">3</span>
            <h2 className="mt-5 text-xl font-bold text-slate-500">Coming soon</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Bu alan simdilik tiklanamaz. Ileride yeni bir modul eklenecek.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MissingConfigScreen() {
  return (
    <div className="min-h-screen bg-[#f6f7f4] px-4 py-16 text-slate-900">
      <div className="mx-auto max-w-xl rounded-lg border border-rose-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wide text-rose-700">Supabase ayari eksik</p>
        <h1 className="mt-3 text-2xl font-bold">Uygulama baslamak icin `.env` dosyasini bekliyor.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Proje ana dizinine `.env` dosyasi ekleyip Supabase proje bilgilerini yaz. Vite icin `VITE_` adlari onerilir; mevcut `NEXT_PUBLIC_` adlari da desteklenir. Sonra gelistirme sunucusunu yeniden baslat.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm text-white">
{`VITE_SUPABASE_URL=https://proje-ref.supabase.co
VITE_SUPABASE_ANON_KEY=anon-public-key`}
        </pre>
      </div>
    </div>
  )
}
