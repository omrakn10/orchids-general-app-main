import { createClient } from '@supabase/supabase-js'

export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
}

export const hasSupabaseConfig = Boolean(supabaseConfig.url && supabaseConfig.anonKey)

export const supabase = hasSupabaseConfig
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null

const DEFAULT_CATEGORY_NAMES = ['İş', 'Kişisel', 'Günlük']

const PRIORITY_TO_DB = {
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
}

const PRIORITY_FROM_DB = {
  Yüksek: 'high',
  Orta: 'medium',
  Düşük: 'low',
}

function missingConfigError() {
  return new Error('Supabase ayarlari eksik. .env dosyasina VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY eklenmeli.')
}

function normalizeTodo(todo) {
  if (!todo) return todo
  return {
    ...todo,
    priority: PRIORITY_FROM_DB[todo.priority] || todo.priority,
    category_id: todo.category_id || null,
    category_name: todo.category_ref?.name || todo.category_name || todo.category || 'Kategorisiz',
  }
}

function normalizeTodoList(todos) {
  return (todos || []).map(normalizeTodo)
}

function mapTodoFieldsToDb(fields) {
  return {
    ...fields,
    ...(fields.priority ? { priority: PRIORITY_TO_DB[fields.priority] || fields.priority } : {}),
  }
}

async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}

export async function signUp(email, password) {
  if (!supabase) return { data: null, error: missingConfigError() }
  const { data, error } = await supabase.auth.signUp({ email, password })
  return { data, error }
}

export async function signIn(email, password) {
  if (!supabase) return { data: null, error: missingConfigError() }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signOut() {
  if (!supabase) return { error: missingConfigError() }
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function ensureDefaultTodoCategories() {
  if (!supabase) return { data: [], error: missingConfigError() }
  const { user, error: userError } = await getCurrentUser()
  if (userError || !user) return { data: [], error: userError }

  const rows = DEFAULT_CATEGORY_NAMES.map((name, index) => ({
    user_id: user.id,
    name,
    is_default: true,
    sort_order: index,
  }))

  const { error } = await supabase
    .from('todo_categories')
    .upsert(rows, { onConflict: 'user_id,name' })

  if (error) return { data: [], error }
  return fetchTodoCategories()
}

export async function fetchTodoCategories() {
  if (!supabase) return { data: [], error: missingConfigError() }
  const { user, error: userError } = await getCurrentUser()
  if (userError || !user) return { data: [], error: userError }

  const { data, error } = await supabase
    .from('todo_categories')
    .select('id,name,is_default,sort_order,created_at')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  return { data: data || [], error }
}

export async function addTodoCategory(name) {
  if (!supabase) return { data: null, error: missingConfigError() }
  const safeName = name?.trim()
  if (!safeName) return { data: null, error: new Error('Kategori adi bos olamaz.') }

  const { user, error: userError } = await getCurrentUser()
  if (userError || !user) return { data: null, error: userError }

  const { data, error } = await supabase
    .from('todo_categories')
    .insert({
      user_id: user.id,
      name: safeName,
      is_default: false,
      sort_order: 1000,
    })
    .select('id,name,is_default,sort_order,created_at')
    .single()

  return { data, error }
}

export async function deleteTodoCategoryAndReassign(categoryId, fallbackCategoryId) {
  if (!supabase) return { error: missingConfigError() }
  const { user, error: userError } = await getCurrentUser()
  if (userError || !user) return { error: userError }
  if (!fallbackCategoryId) return { error: new Error('Silme icin bir hedef kategori gerekli.') }

  const { error: updateError } = await supabase
    .from('todos')
    .update({ category_id: fallbackCategoryId })
    .eq('user_id', user.id)
    .eq('category_id', categoryId)

  if (updateError) return { error: updateError }

  const { error: deleteError } = await supabase
    .from('todo_categories')
    .delete()
    .eq('user_id', user.id)
    .eq('id', categoryId)
    .eq('is_default', false)

  return { error: deleteError }
}

export async function fetchTodos() {
  if (!supabase) return { data: [], error: missingConfigError() }
  const { user, error: userError } = await getCurrentUser()
  if (userError || !user) return { data: [], error: userError || null }

  const { data, error } = await supabase
    .from('todos')
    .select(`
      id,
      user_id,
      text,
      completed,
      priority,
      category_id,
      category,
      created_at,
      category_ref:todo_categories!todos_category_id_fkey(id,name)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return { data: normalizeTodoList(data), error }
}

export async function addTodo(text, categoryId, priority) {
  if (!supabase) return { data: null, error: missingConfigError() }
  const { user, error: userError } = await getCurrentUser()
  if (userError || !user) return { data: null, error: userError || new Error('Kullanici oturumu bulunamadi.') }

  const { data, error } = await supabase
    .from('todos')
    .insert([{
      user_id: user.id,
      text,
      category_id: categoryId || null,
      ...mapTodoFieldsToDb({ priority }),
      completed: false,
    }])
    .select(`
      id,
      user_id,
      text,
      completed,
      priority,
      category_id,
      category,
      created_at,
      category_ref:todo_categories!todos_category_id_fkey(id,name)
    `)

  return { data: normalizeTodoList(data), error }
}

export async function updateTodo(id, fields) {
  if (!supabase) return { data: null, error: missingConfigError() }
  const { data, error } = await supabase
    .from('todos')
    .update(mapTodoFieldsToDb(fields))
    .eq('id', id)
    .select(`
      id,
      user_id,
      text,
      completed,
      priority,
      category_id,
      category,
      created_at,
      category_ref:todo_categories!todos_category_id_fkey(id,name)
    `)

  return { data: normalizeTodoList(data), error }
}

export async function deleteTodo(id) {
  if (!supabase) return { error: missingConfigError() }
  const { error } = await supabase.from('todos').delete().eq('id', id)
  return { error }
}

export async function fetchOfficeEntries(year, monthIndex) {
  if (!supabase) return { data: [], error: missingConfigError() }
  const { user, error: userError } = await getCurrentUser()
  if (userError || !user) return { data: [], error: userError }

  const startDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`
  const nextYear = monthIndex === 11 ? year + 1 : year
  const nextMonth = monthIndex === 11 ? '01' : String(monthIndex + 2).padStart(2, '0')

  const { data, error } = await supabase
    .from('office_entries')
    .select('id, entry_date, went_to_office, parking_fee, transport_fee, total_fee')
    .eq('user_id', user.id)
    .gte('entry_date', startDate)
    .lt('entry_date', `${nextYear}-${nextMonth}-01`)
    .order('entry_date', { ascending: true })

  return { data, error }
}

export async function upsertOfficeEntry(entryDate, wentToOffice, parkingFee, transportFee = 0) {
  if (!supabase) return { data: null, error: missingConfigError() }
  const { user, error: userError } = await getCurrentUser()
  if (userError || !user) return { data: null, error: userError || new Error('Kullanici oturumu bulunamadi.') }

  const { data, error } = await supabase
    .from('office_entries')
    .upsert({
      user_id: user.id,
      entry_date: entryDate,
      went_to_office: wentToOffice,
      parking_fee: wentToOffice ? Math.max(0, Number(parkingFee) || 0) : 0,
      transport_fee: wentToOffice ? Math.max(0, Number(transportFee) || 0) : 0,
    }, { onConflict: 'user_id,entry_date' })
    .select('id, entry_date, went_to_office, parking_fee, transport_fee, total_fee')
    .single()

  return { data, error }
}

export async function deleteOfficeEntry(id) {
  if (!supabase) return { error: missingConfigError() }
  const { error } = await supabase.from('office_entries').delete().eq('id', id)
  return { error }
}
