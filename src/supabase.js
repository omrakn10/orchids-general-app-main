import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  return { data, error }
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function fetchTodos() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: null }
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function addTodo(text, category, priority) {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('Kullanıcı oturumu bulunamadı.')
  const { data, error } = await supabase
    .from('todos')
    .insert([{ user_id: user.id, text, category, priority, completed: false }])
    .select()
  return { data, error }
}

export async function updateTodo(id, fields) {
  const { data, error } = await supabase
    .from('todos')
    .update(fields)
    .eq('id', id)
    .select()
  return { data, error }
}

export async function deleteTodo(id) {
  const { error } = await supabase.from('todos').delete().eq('id', id)
  return { error }
}

export async function fetchOfficeEntries(year, monthIndex) {
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

export async function upsertOfficeEntry(entryDate, wentToOffice, parkingFee, transportFee = 275) {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { data: null, error: userError || new Error('Kullanıcı oturumu bulunamadı.') }

  const { data, error } = await supabase
    .from('office_entries')
    .upsert({
      user_id: user.id,
      entry_date: entryDate,
      went_to_office: wentToOffice,
      parking_fee: wentToOffice ? Math.max(0, Number(parkingFee) || 0) : 0,
      transport_fee: transportFee,
    }, { onConflict: 'user_id,entry_date' })
    .select('id, entry_date, went_to_office, parking_fee, transport_fee, total_fee')
    .single()

  return { data, error }
}

export async function deleteOfficeEntry(id) {
  const { error } = await supabase.from('office_entries').delete().eq('id', id)
  return { error }
}
