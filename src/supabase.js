import { createClient } from '@supabase/supabase-js'

export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
}

export const hasSupabaseConfig = Boolean(supabaseConfig.url && supabaseConfig.anonKey)

export const supabase = hasSupabaseConfig
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null

const CATEGORY_TO_DB = {
  work: 'İş',
  personal: 'Kişisel',
  daily: 'Günlük',
}

const CATEGORY_FROM_DB = {
  İş: 'work',
  Kişisel: 'personal',
  Günlük: 'daily',
}

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

function normalizeTodo(todo) {
  if (!todo) return todo
  return {
    ...todo,
    category: CATEGORY_FROM_DB[todo.category] || todo.category,
    priority: PRIORITY_FROM_DB[todo.priority] || todo.priority,
  }
}

function normalizeTodoList(todos) {
  return (todos || []).map(normalizeTodo)
}

function mapTodoFieldsToDb(fields) {
  return {
    ...fields,
    ...(fields.category ? { category: CATEGORY_TO_DB[fields.category] || fields.category } : {}),
    ...(fields.priority ? { priority: PRIORITY_TO_DB[fields.priority] || fields.priority } : {}),
  }
}

function missingConfigError() {
  return new Error('Supabase ayarları eksik. .env dosyasına VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY eklenmeli.')
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

export async function fetchTodos() {
  if (!supabase) return { data: [], error: missingConfigError() }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: null }
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  return { data: normalizeTodoList(data), error }
}

export async function addTodo(text, category, priority) {
  if (!supabase) return { data: null, error: missingConfigError() }
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('Kullanıcı oturumu bulunamadı.')
  const { data, error } = await supabase
    .from('todos')
    .insert([{ user_id: user.id, text, ...mapTodoFieldsToDb({ category, priority }), completed: false }])
    .select()
  return { data: normalizeTodoList(data), error }
}

export async function updateTodo(id, fields) {
  if (!supabase) return { data: null, error: missingConfigError() }
  const { data, error } = await supabase
    .from('todos')
    .update(mapTodoFieldsToDb(fields))
    .eq('id', id)
    .select()
  return { data: normalizeTodoList(data), error }
}

export async function deleteTodo(id) {
  if (!supabase) return { error: missingConfigError() }
  const { error } = await supabase.from('todos').delete().eq('id', id)
  return { error }
}

export async function fetchOfficeEntries(year, monthIndex) {
  if (!supabase) return { data: [], error: missingConfigError() }
  const { data: { user }, error: userError } = await supabase.auth.getUser()
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
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { data: null, error: userError || new Error('Kullanıcı oturumu bulunamadı.') }

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
