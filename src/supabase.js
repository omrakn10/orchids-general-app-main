import { createClient } from '@supabase/supabase-js'

const DEFAULT_CATEGORY_COLORS = ['#0f766e', '#7c3aed', '#2563eb']
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
  'YÃ¼ksek': 'high',
  'DÃ¼ÅŸÃ¼k': 'low',
}

const LEGACY_TEXT_REPLACEMENTS = {
  'Ä°': 'İ',
  'Ä±': 'ı',
  'ÅŸ': 'ş',
  'Åž': 'Ş',
  'Ã¼': 'ü',
  'Ãœ': 'Ü',
  'Ã¶': 'ö',
  'Ã–': 'Ö',
  'Ã§': 'ç',
  'Ã‡': 'Ç',
  'ÄŸ': 'ğ',
  'Äž': 'Ğ',
}

export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
}

export const hasSupabaseConfig = Boolean(supabaseConfig.url && supabaseConfig.anonKey)

export const supabase = hasSupabaseConfig
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null

function normalizeLegacyText(value) {
  if (typeof value !== 'string') return value
  return Object.entries(LEGACY_TEXT_REPLACEMENTS).reduce(
    (next, [broken, fixed]) => next.replaceAll(broken, fixed),
    value,
  )
}

function normalizeHexColor(value, fallback = '#0f766e') {
  if (typeof value !== 'string') return fallback
  const raw = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase()
  return fallback
}

function missingConfigError() {
  return new Error('Supabase ayarları eksik. `.env` dosyasına VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY eklenmeli.')
}

function isMissingColumnError(error, columnName) {
  if (!error) return false
  const message = String(error.message || '')
  return error.code === '42703' || (columnName ? message.includes(columnName) : message.includes('column'))
}

function isMissingTableOrRelationError(error) {
  if (!error) return false
  const message = String(error.message || '')
  return error.code === '42P01' || error.code === 'PGRST200' || message.includes('does not exist') || message.includes('Could not find')
}

function isCategoryConstraintError(error) {
  if (!error) return false
  const message = String(error.message || '').toLowerCase()
  return message.includes('category') && (message.includes('constraint') || message.includes('check'))
}

function normalizeCategory(category, index = 0, fallbackColor = null) {
  return {
    ...category,
    name: normalizeLegacyText(category.name),
    color: normalizeHexColor(
      category.color,
      normalizeHexColor(fallbackColor || DEFAULT_CATEGORY_COLORS[index % DEFAULT_CATEGORY_COLORS.length]),
    ),
  }
}

function normalizeTodo(todo) {
  if (!todo) return todo
  return {
    ...todo,
    priority: PRIORITY_FROM_DB[todo.priority] || todo.priority,
    category_id: todo.category_id ?? null,
    category_name: normalizeLegacyText(todo.category_ref?.name || todo.category_name || todo.category || 'Kategorisiz'),
    category_color: normalizeHexColor(todo.category_ref?.color || todo.category_color || '#0f766e'),
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

async function getCategoryNameById(userId, categoryId) {
  if (!categoryId) return null
  const { data, error } = await supabase
    .from('todo_categories')
    .select('name')
    .eq('user_id', userId)
    .eq('id', categoryId)
    .single()
  if (error) return null
  return normalizeLegacyText(data?.name || null)
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

  const rowsWithColor = DEFAULT_CATEGORY_NAMES.map((name, index) => ({
    user_id: user.id,
    name,
    color: DEFAULT_CATEGORY_COLORS[index],
    is_default: true,
    sort_order: index,
  }))

  let upsertResult = await supabase
    .from('todo_categories')
    .upsert(rowsWithColor, { onConflict: 'user_id,name' })

  if (upsertResult.error && isMissingColumnError(upsertResult.error, 'color')) {
    const rowsWithoutColor = DEFAULT_CATEGORY_NAMES.map((name, index) => ({
      user_id: user.id,
      name,
      is_default: true,
      sort_order: index,
    }))
    upsertResult = await supabase
      .from('todo_categories')
      .upsert(rowsWithoutColor, { onConflict: 'user_id,name' })
  }

  if (upsertResult.error) return { data: [], error: upsertResult.error }
  return fetchTodoCategories()
}

export async function fetchTodoCategories() {
  if (!supabase) return { data: [], error: missingConfigError() }
  const { user, error: userError } = await getCurrentUser()
  if (userError || !user) return { data: [], error: userError }

  let queryResult = await supabase
    .from('todo_categories')
    .select('id,name,color,is_default,sort_order,created_at')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (queryResult.error && isMissingColumnError(queryResult.error, 'color')) {
    queryResult = await supabase
      .from('todo_categories')
      .select('id,name,is_default,sort_order,created_at')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
  }

  if (queryResult.error && isMissingTableOrRelationError(queryResult.error)) {
    return { data: [], error: null }
  }

  return { data: (queryResult.data || []).map(normalizeCategory), error: queryResult.error }
}

export async function addTodoCategory(name, color) {
  if (!supabase) return { data: null, error: missingConfigError() }
  const safeName = normalizeLegacyText(name?.trim())
  if (!safeName) return { data: null, error: new Error('Kategori adı boş olamaz.') }

  const { user, error: userError } = await getCurrentUser()
  if (userError || !user) return { data: null, error: userError }

  let insertResult = await supabase
    .from('todo_categories')
    .insert({
      user_id: user.id,
      name: safeName,
      color: normalizeHexColor(color),
      is_default: false,
      sort_order: 1000,
    })
    .select('id,name,color,is_default,sort_order,created_at')
    .single()

  const missingColorColumn = isMissingColumnError(insertResult.error, 'color')
  if (missingColorColumn) {
    insertResult = await supabase
      .from('todo_categories')
      .insert({
        user_id: user.id,
        name: safeName,
        is_default: false,
        sort_order: 1000,
      })
      .select('id,name,is_default,sort_order,created_at')
      .single()
  }

  return {
    data: insertResult.data ? normalizeCategory(insertResult.data, 0, color) : null,
    error: insertResult.error,
    warning: missingColorColumn
      ? 'Kategori eklendi fakat renk kolonu Supabase tarafında eksik görünüyor. `sql/todo_categories_color_migration.sql` dosyasını çalıştırmazsan seçilen renk kalıcı olmaz.'
      : null,
  }
}

export async function deleteTodoCategoryAndReassign(categoryId, fallbackCategoryId) {
  if (!supabase) return { error: missingConfigError() }
  const { user, error: userError } = await getCurrentUser()
  if (userError || !user) return { error: userError }
  if (!fallbackCategoryId) return { error: new Error('Silme için bir hedef kategori gerekli.') }

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

  let queryResult = await supabase
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
      category_ref:todo_categories!todos_category_id_fkey(id,name,color)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (queryResult.error && isMissingColumnError(queryResult.error, 'color')) {
    queryResult = await supabase
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
  }

  if (queryResult.error) {
    queryResult = await supabase
      .from('todos')
      .select('id,user_id,text,completed,priority,category,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
  }

  return { data: normalizeTodoList(queryResult.data), error: queryResult.error }
}

export async function addTodo(text, categoryId, priority) {
  if (!supabase) return { data: null, error: missingConfigError() }
  const { user, error: userError } = await getCurrentUser()
  if (userError || !user) return { data: null, error: userError || new Error('Kullanıcı oturumu bulunamadı.') }

  const categoryName = categoryId ? await getCategoryNameById(user.id, categoryId) : null

  let insertResult = await supabase
    .from('todos')
    .insert([{
      user_id: user.id,
      text,
      category_id: categoryId || null,
      ...(categoryName ? { category: categoryName } : {}),
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
      category_ref:todo_categories!todos_category_id_fkey(id,name,color)
    `)

  if (insertResult.error) {
    const missingCategoryId = isMissingColumnError(insertResult.error, 'category_id')
    const missingPriority = isMissingColumnError(insertResult.error, 'priority')
    const fallbackInsert = {
      user_id: user.id,
      text,
      completed: false,
    }

    if (!missingPriority) {
      fallbackInsert.priority = PRIORITY_TO_DB[priority] || priority
    }

    if (categoryId) {
      if (missingCategoryId) {
        if (categoryName) fallbackInsert.category = categoryName
      } else {
        fallbackInsert.category_id = categoryId
      }
    }

    insertResult = await supabase
      .from('todos')
      .insert([fallbackInsert])
      .select('id,user_id,text,completed,priority,category_id,category,created_at')

    if (insertResult.error && categoryId && isCategoryConstraintError(insertResult.error)) {
      return {
        data: null,
        error: new Error(
          'Seçilen kategori veritabanına kaydedilemedi. Supabase şeması eski görünüyor; `sql/todo_categories_migration.sql` dosyasını çalıştırıp `todos.category_id` alanını ve kategori kısıtlarını güncelleyin.',
        ),
      }
    }
  }

  if (insertResult.error && isMissingColumnError(insertResult.error, 'category_id') && !categoryId) {
    insertResult = await supabase
      .from('todos')
      .insert([{
        user_id: user.id,
        text,
        ...(priority ? { priority: PRIORITY_TO_DB[priority] || priority } : {}),
        completed: false,
      }])
      .select('id,user_id,text,completed,priority,category,created_at')
  }

  return { data: normalizeTodoList(insertResult.data), error: insertResult.error }
}

export async function updateTodo(id, fields) {
  if (!supabase) return { data: null, error: missingConfigError() }
  const mappedFields = mapTodoFieldsToDb(fields)

  const { data, error } = await supabase
    .from('todos')
    .update(mappedFields)
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
      category_ref:todo_categories!todos_category_id_fkey(id,name,color)
    `)

  if (!error) return { data: normalizeTodoList(data), error: null }

  const safeFields = { ...mappedFields }
  if (isMissingColumnError(error, 'category_id')) delete safeFields.category_id
  if (isMissingColumnError(error, 'priority')) delete safeFields.priority

  const fallback = await supabase
    .from('todos')
    .update(safeFields)
    .eq('id', id)
    .select('id,user_id,text,completed,priority,category,created_at')

  return { data: normalizeTodoList(fallback.data), error: fallback.error }
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
