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
  high: { label: 'Yüksek', dot: 'bg-rose-400', badge: 'bg-rose-50 text-rose-600 ring-rose-200' },
  medium: { label: 'Orta', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-600 ring-amber-200' },
  low: { label: 'Düşük', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
}

const CATEGORY_PALETTE = [
  '#0f766e',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#059669',
  '#334155',
  '#0891b2',
]

function normalizeHexColor(value, fallback = '#0f766e') {
  if (typeof value !== 'string') return fallback
  const raw = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase()
  return fallback
}

function hexToRgba(hex, alpha) {
  const safe = normalizeHexColor(hex)
  const r = parseInt(safe.slice(1, 3), 16)
  const g = parseInt(safe.slice(3, 5), 16)
  const b = parseInt(safe.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function categoryBadgeStyle(color) {
  const base = normalizeHexColor(color)
  return {
    color: base,
    borderColor: hexToRgba(base, 0.3),
    backgroundColor: hexToRgba(base, 0.12),
  }
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
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editPriority, setEditPriority] = useState('medium')
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [categoryInput, setCategoryInput] = useState('')
  const [categoryColor, setCategoryColor] = useState(CATEGORY_PALETTE[0])
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

    const normalizedCategories = categories.map((category, index) => ({
      ...category,
      color: normalizeHexColor(category.color, CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]),
    }))

    setTodoCategories(normalizedCategories)
    setTasks(todoData || [])
    setNewCategory(prev => (prev && normalizedCategories.some(cat => cat.id === prev) ? prev : (normalizedCategories[0]?.id || '')))
    setActiveCategory(prev => (prev === 'all' || normalizedCategories.some(cat => cat.id === prev) ? prev : 'all'))
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
    if (data) setTasks(prev => prev.map(task => (task.id === id ? data[0] : task)))
  }

  async function handleDelete(id) {
    const { error } = await deleteTodo(id)
    if (!error) setTasks(prev => prev.filter(task => task.id !== id))
  }

  function startEdit(task) {
    const fallbackCategoryId = todoCategories.find(category => category.name === task.category_name)?.id || ''
    setEditId(task.id)
    setEditText(task.text)
    setEditCategoryId(task.category_id || fallbackCategoryId || todoCategories[0]?.id || '')
    setEditPriority(task.priority || 'medium')
  }

  function cancelEdit() {
    setEditId(null)
    setEditText('')
    setEditCategoryId('')
    setEditPriority('medium')
  }

  async function handleSaveEdit() {
    const text = editText.trim()
    if (!text) return
    const selectedCategory = todoCategories.find(category => category.id === editCategoryId) || null
    const selectedCategoryName = selectedCategory?.name || null
    const { data, error } = await updateTodo(editId, {
      text,
      category_id: editCategoryId || null,
      category: selectedCategoryName,
      priority: editPriority,
    })
    if (error) return

    const serverTask = data?.[0] || {}
    setTasks(prev => prev.map(task => (
      task.id === editId
        ? {
            ...task,
            ...serverTask,
            text,
            priority: editPriority,
            category_id: editCategoryId || task.category_id || null,
            category_name: selectedCategory?.name || serverTask.category_name || task.category_name,
            category_color: selectedCategory?.color || serverTask.category_color || task.category_color,
          }
        : task
    )))
    cancelEdit()
  }

  async function handleAddCategory() {
    const name = categoryInput.trim()
    if (!name) return
    setCategoryBusy(true)
    setCategoryError('')

    const { data, error } = await addTodoCategory(name, categoryColor)
    if (error) {
      setCategoryError(error.message || 'Kategori eklenemedi.')
      setCategoryBusy(false)
      return
    }

    const withColor = { ...data, color: normalizeHexColor(data?.color, categoryColor) }
    setTodoCategories(prev => [...prev, withColor])
    setNewCategory(withColor.id)
    setCategoryInput('')
    setCategoryColor(CATEGORY_PALETTE[0])
    setCategoryBusy(false)
  }

  async function handleDeleteCategory(categoryId) {
    const target = todoCategories.find(category => category.id === categoryId)
    if (!target || target.is_default) return

    const fallback = todoCategories.find(category => category.id !== categoryId)
    if (!fallback) {
      setCategoryError('Silmek için en az bir kategori kalmalı.')
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
        ? {
            ...task,
            category_id: fallback.id,
            category_name: fallback.name,
            category_color: fallback.color,
          }
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
          <button onClick={() => navigateToApp('home')} className="nav-button cursor-pointer">Ana menü</button>
          <div className="topbar-actions">
            <span className="topbar-email hidden sm:block">{session.user.email}</span>
            <button onClick={handleSignOut} title="Çıkış Yap" className="nav-button cursor-pointer">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Çıkış
            </button>
          </div>
        </div>

        <p className="app-hero-kicker">{today}</p>
        <h1 className="app-hero-title">Yapılacaklar</h1>
        <p className="app-hero-subtitle">
          {loadingTasks
            ? 'Yükleniyor...'
            : pendingCount > 0
              ? <><span className="text-white font-semibold">{pendingCount}</span> görev seni bekliyor</>
              : 'Tüm görevler tamamlandı'}
        </p>
      </div>

      <div className="todo-content -mt-10 pb-16 flex flex-col gap-6">
        <div className="panel-card">
          <textarea
            value={newTask}
            onChange={event => setNewTask(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleAddTask() } }}
            placeholder="Yeni görev ekle... (Enter ile kaydet)"
            rows={3}
            className="w-full text-slate-800 placeholder-slate-300 text-base resize-none focus:outline-none leading-relaxed"
          />
          <div className="toolbar-row border-t border-slate-100 mt-4 pt-4 flex items-center flex-wrap">
            <select value={newCategory} onChange={event => setNewCategory(event.target.value)} className="form-control text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-300 cursor-pointer">
              {todoCategories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <select value={newPriority} onChange={event => setNewPriority(event.target.value)} className="form-control text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-300 cursor-pointer">
              <option value="high">Yüksek</option>
              <option value="medium">Orta</option>
              <option value="low">Düşük</option>
            </select>
            <button onClick={() => setShowCategoryModal(true)} className="ghost-button cursor-pointer">Kategori yönet</button>
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
            <span>Tümü</span>
            {categoryCount('all') > 0 && <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activeCategory === 'all' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{categoryCount('all')}</span>}
          </button>
          {todoCategories.map(category => (
            <button key={category.id} onClick={() => setActiveCategory(category.id)} className={`filter-pill flex items-center gap-1.5 px-4 py-2 text-sm transition-all cursor-pointer ${activeCategory === category.id ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-300' : 'bg-white text-slate-500 border border-slate-200 hover:border-indigo-300 hover:text-indigo-500'}`}>
              <span>{category.name}</span>
              {categoryCount(category.id) > 0 && <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activeCategory === category.id ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{categoryCount(category.id)}</span>}
            </button>
          ))}
          <button onClick={() => setShowCompleted(prev => !prev)} className={`filter-pill text-sm px-4 py-2 border transition-all cursor-pointer whitespace-nowrap ${showCompleted ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}>
            {showCompleted ? 'Tamamlananları gizle' : 'Tamamlananları göster'}
          </button>
        </div>

        <div className="task-list space-y-5">
          {loadingTasks && (
            <div className="text-center py-20">
              <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mb-4" />
              <p className="text-slate-400 text-sm">Görevler yükleniyor...</p>
            </div>
          )}

          {!loadingTasks && filtered.length === 0 && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">Hedef</div>
              <p className="font-semibold text-slate-500 text-lg">Bekleyen görev yok</p>
              <p className="text-sm text-slate-400 mt-1">Yeni bir görev ekleyerek başla</p>
            </div>
          )}

          {!loadingTasks && filtered.map(task => {
            const mappedCategory = categoryMap[task.category_id]
            const categoryLabel = mappedCategory?.name || task.category_name || 'Kategorisiz'
            const categoryColor = mappedCategory?.color || task.category_color || '#0f766e'
            const priority = PRIORITY[task.priority] || PRIORITY.medium
            const dateLabel = task.created_at ? new Date(task.created_at).toLocaleDateString('tr-TR') : ''

            return (
              <div key={task.id} className={`task-card task-card-spacious group transition-all duration-200 ${task.completed ? 'border-slate-100 opacity-55' : 'border-slate-100 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-50'}`}>
                {editId === task.id ? (
                  <div className="p-5 space-y-3">
                    <input
                      autoFocus
                      value={editText}
                      onChange={event => setEditText(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') handleSaveEdit()
                        if (event.key === 'Escape') cancelEdit()
                      }}
                      className="w-full text-base px-4 py-2.5 rounded-xl border border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={editCategoryId}
                        onChange={event => setEditCategoryId(event.target.value)}
                        className="form-control text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-300 cursor-pointer"
                      >
                        {todoCategories.map(category => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                      <select
                        value={editPriority}
                        onChange={event => setEditPriority(event.target.value)}
                        className="form-control text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-300 cursor-pointer"
                      >
                        <option value="high">Yüksek</option>
                        <option value="medium">Orta</option>
                        <option value="low">Düşük</option>
                      </select>
                    </div>
                    <div className="flex gap-2 items-center">
                      <button onClick={handleSaveEdit} disabled={!editText.trim()} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 cursor-pointer">Kaydet</button>
                      <button onClick={cancelEdit} className="px-4 py-2.5 bg-slate-100 text-slate-500 rounded-xl text-sm hover:bg-slate-200 cursor-pointer">İptal</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 flex items-start gap-4">
                    <button onClick={() => handleToggle(task.id, task.completed)} className={`mt-0.5 w-6 h-6 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${task.completed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                      {task.completed && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className={`text-base leading-relaxed font-semibold ${task.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {task.text}
                      </p>
                      <div className="flex items-center gap-2.5 mt-3 flex-wrap">
                        <span className="category-chip" style={categoryBadgeStyle(categoryColor)}>{categoryLabel}</span>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ring-1 ${priority.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
                          {priority.label}
                        </span>
                        <span className="text-xs text-slate-500">{dateLabel}</span>
                      </div>
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => startEdit(task)} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer" title="Düzenle">
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

        {!loadingTasks && completedCount > 0 && (
          <p className="text-center text-sm text-slate-400">{completedCount} tamamlanmış görev</p>
        )}
      </div>

      {showCategoryModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold text-slate-900">Kategori yönetimi</h2>
              <button onClick={() => { setShowCategoryModal(false); setCategoryError('') }} className="soft-button cursor-pointer">Kapat</button>
            </div>
            <p className="text-sm text-slate-500 mt-2">Yeni kategori ekleyebilir, eklediğin kategorileri silebilirsin.</p>

            <div className="mt-4 space-y-3">
              <input
                value={categoryInput}
                onChange={event => setCategoryInput(event.target.value)}
                placeholder="Yeni kategori adı"
                className="form-control w-full px-3"
              />

              <div>
                <p className="text-xs font-bold uppercase text-slate-500 mb-2">Renk seç</p>
                <div className="flex items-center flex-wrap gap-2">
                  {CATEGORY_PALETTE.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setCategoryColor(color)}
                      className={`category-color-dot cursor-pointer ${categoryColor === color ? 'is-active' : ''}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>

              <button onClick={handleAddCategory} disabled={categoryBusy || !categoryInput.trim()} className="primary-button cursor-pointer disabled:opacity-50 w-fit">
                Kategori ekle
              </button>
            </div>

            {categoryError && <p className="mt-3 text-sm font-semibold text-rose-600">{categoryError}</p>}

            <div className="mt-5 space-y-2 max-h-64 overflow-auto">
              {todoCategories.map(category => (
                <div key={category.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
                    <span className="font-semibold text-slate-700">{category.name}</span>
                  </div>
                  {category.is_default ? (
                    <span className="text-xs font-bold text-slate-400">Varsayılan</span>
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
          <button onClick={onSignOut} className="ghost-button cursor-pointer">Çıkış</button>
        </div>
      </div>

      <div className="chooser-container">
        <div className="chooser-heading">
          <p className="section-kicker">Hoş geldin</p>
          <h1 className="section-title">Bugün neyi takip edelim?</h1>
          <p className="section-subtitle">Kullanmak istediğin alanı seç. Her modül kendi verisini saklar ve kaldığın yerden devam edersin.</p>
        </div>

        <div className="chooser-grid">
          <button onClick={() => onSelect('todos')} className="module-card cursor-pointer">
            <span className="module-index">1</span>
            <h2 className="mt-5 text-xl font-bold">Yapılacaklar</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Görevlerini kategori ve önceliklerle takip et.</p>
          </button>

          <button onClick={() => onSelect('office')} className="module-card cursor-pointer">
            <span className="module-index">2</span>
            <h2 className="mt-5 text-xl font-bold">Ofis Gidiş ve Masraf</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Ofise gittiğin günleri, otoparkı ve aylık ulaşım giderini gör.</p>
          </button>

          <div className="module-card module-card-disabled">
            <span className="module-index">3</span>
            <h2 className="mt-5 text-xl font-bold text-slate-500">Coming soon</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Bu alan şimdilik tıklanamaz. İleride yeni bir modül eklenecek.</p>
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
        <p className="text-sm font-bold uppercase tracking-wide text-rose-700">Supabase ayarı eksik</p>
        <h1 className="mt-3 text-2xl font-bold">Uygulama başlamak için `.env` dosyasını bekliyor.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Proje ana dizinine `.env` dosyası ekleyip Supabase proje bilgilerini yaz. Vite için `VITE_` adları önerilir; mevcut `NEXT_PUBLIC_` adları da desteklenir. Sonra geliştirme sunucusunu yeniden başlat.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm text-white">
{`VITE_SUPABASE_URL=https://proje-ref.supabase.co
VITE_SUPABASE_ANON_KEY=anon-public-key`}
        </pre>
      </div>
    </div>
  )
}
