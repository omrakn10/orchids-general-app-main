import { useEffect, useMemo, useState } from 'react'
import { deleteOfficeEntry, fetchOfficeEntries, upsertOfficeEntry } from './supabase'

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function formatCurrency(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value)
}

function formatNumber(value) {
  return new Intl.NumberFormat('tr-TR').format(value)
}

function toDateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return { year, monthIndex: month - 1, day }
}

function buildCalendarDays(year, monthIndex) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const firstDay = new Date(year, monthIndex, 1).getDay()
  const startOffset = firstDay === 0 ? 6 : firstDay - 1
  return [
    ...Array.from({ length: startOffset }, (_, index) => ({ type: 'empty', id: `empty-${index}` })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({
      type: 'day',
      day: index + 1,
      dateKey: toDateKey(year, monthIndex, index + 1),
    })),
  ]
}

function normalizeDbEntry(entry) {
  const went = Boolean(entry?.went_to_office)
  return {
    id: entry?.id,
    went,
    parking: Math.max(0, Number(entry?.parking_fee) || 0),
    road: went ? Math.max(0, Number(entry?.transport_fee) || 0) : 0,
    total: Math.max(0, Number(entry?.total_fee) || 0),
  }
}

function entriesToRecordMap(entries) {
  return entries.reduce((map, entry) => {
    map[entry.entry_date] = normalizeDbEntry(entry)
    return map
  }, {})
}

export default function OfficeExpenseSupabaseApp({ session, onBack, onSignOut }) {
  const today = useMemo(() => new Date(), [])
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth())
  const [selectedYear, setSelectedYear] = useState(today.getFullYear())
  const [records, setRecords] = useState({})
  const [previousMonthTotal, setPreviousMonthTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeDateKey, setActiveDateKey] = useState(null)
  const [formWent, setFormWent] = useState(true)
  const [formParking, setFormParking] = useState('')
  const [formTransport, setFormTransport] = useState('')

  useEffect(() => {
    loadEntries()
  }, [selectedMonth, selectedYear])

  async function loadEntries() {
    setLoading(true)
    setError('')
    const previousMonthDate = new Date(selectedYear, selectedMonth - 1, 1)
    const [
      { data, error: fetchError },
      { data: previousData, error: previousError },
    ] = await Promise.all([
      fetchOfficeEntries(selectedYear, selectedMonth),
      fetchOfficeEntries(previousMonthDate.getFullYear(), previousMonthDate.getMonth()),
    ])

    if (fetchError) {
      setError(fetchError.message || 'Ofis kayıtları yüklenemedi.')
      setRecords({})
    } else {
      setRecords(entriesToRecordMap(data || []))
    }

    if (previousError) {
      setPreviousMonthTotal(0)
    } else {
      setPreviousMonthTotal((previousData || []).reduce((total, entry) => total + Number(entry.total_fee || 0), 0))
    }

    setLoading(false)
  }

  const days = useMemo(() => buildCalendarDays(selectedYear, selectedMonth), [selectedYear, selectedMonth])

  const monthRecords = useMemo(() => {
    return Object.entries(records)
      .filter(([, record]) => record.went)
      .map(([dateKey, record]) => ({ dateKey, ...record }))
      .sort((first, second) => first.dateKey.localeCompare(second.dateKey))
  }, [records])

  const summary = useMemo(() => {
    const officeDays = monthRecords.length
    const parkingTotal = monthRecords.reduce((total, record) => total + record.parking, 0)
    const road = monthRecords.reduce((total, record) => total + record.road, 0)
    const total = monthRecords.reduce((sum, record) => sum + record.total, 0)
    return { officeDays, parkingTotal, road, total }
  }, [monthRecords])

  const years = useMemo(() => (
    Array.from(new Set([today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1, selectedYear]))
      .sort((a, b) => a - b)
  ), [selectedYear, today])

  function openDay(dateKey) {
    const record = records[dateKey]
    setActiveDateKey(dateKey)
    setFormWent(record ? record.went : true)
    setFormParking(record?.parking ? String(record.parking) : '')
    setFormTransport(record?.road ? String(record.road) : '')
    setError('')
  }

  function closeModal() {
    setActiveDateKey(null)
    setFormParking('')
    setFormTransport('')
    setSaving(false)
  }

  async function saveRecord(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const parking = Math.max(0, Number(formParking) || 0)
    const transport = Math.max(0, Number(formTransport) || 0)
    const { data, error: saveError } = await upsertOfficeEntry(activeDateKey, formWent, parking, transport)

    if (saveError) {
      setError(saveError.message || 'Kayıt kaydedilemedi.')
      setSaving(false)
      return
    }

    setRecords(previous => ({ ...previous, [data.entry_date]: normalizeDbEntry(data) }))
    closeModal()
  }

  async function removeRecord() {
    const record = records[activeDateKey]
    if (!record?.id) {
      closeModal()
      return
    }

    setSaving(true)
    setError('')
    const { error: deleteError } = await deleteOfficeEntry(record.id)

    if (deleteError) {
      setError(deleteError.message || 'Kayıt silinemedi.')
      setSaving(false)
      return
    }

    setRecords(previous => {
      const next = { ...previous }
      delete next[activeDateKey]
      return next
    })
    closeModal()
  }

  function shiftMonth(delta) {
    const next = new Date(selectedYear, selectedMonth + delta, 1)
    setSelectedYear(next.getFullYear())
    setSelectedMonth(next.getMonth())
  }

  const activeDate = activeDateKey ? parseDateKey(activeDateKey) : null
  const modalRoad = formWent ? Math.max(0, Number(formTransport) || 0) : 0
  const modalParking = formWent ? Math.max(0, Number(formParking) || 0) : 0
  const todayDateKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate())

  return (
    <div className="app-page">
      <header className="app-hero">
        <HeaderActions session={session} onBack={onBack} onSignOut={onSignOut} />
        <div className="app-container">
          <p className="app-hero-kicker">Ofis ulaşım takibi</p>
          <h1 className="app-hero-title">Ofise gidiş günlerin ve masrafların</h1>
          <p className="app-hero-subtitle">
            Takvimden gün seç, ofise gittiğini işaretle, otopark ve yol ücretini ayrı ayrı gir.
          </p>
        </div>
      </header>

      <main className="office-main space-y-8">
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

        <section className="summary-grid">
          <SummaryCard label="Ofise gidilen gün" value={`${formatNumber(summary.officeDays)} gün`} text={`Bu ay ofise ${formatNumber(summary.officeDays)} kez gittin.`} />
          <SummaryCard label="Toplam otopark" value={formatCurrency(summary.parkingTotal)} text={`Toplam otopark masrafın ${formatCurrency(summary.parkingTotal)}.`} />
          <SummaryCard label="Toplam yol" value={formatCurrency(summary.road)} text={`Toplam yol masrafın ${formatCurrency(summary.road)}.`} />
          <SummaryCard label="Toplam gider" value={formatCurrency(summary.total)} text={`Bu ay toplam ofis ulaşım giderin ${formatCurrency(summary.total)}.`} />
          <SummaryCard label="Geçen ay toplam gider" value={formatCurrency(previousMonthTotal)} text={`Geçen ay toplam ofis ulaşım giderin ${formatCurrency(previousMonthTotal)}.`} />
        </section>

        <section className="office-layout">
          <div className="calendar-card">
            <div className="calendar-header">
              <div>
                <h2 className="text-xl font-bold">{MONTHS[selectedMonth]} {selectedYear}</h2>
                <p className="text-sm text-slate-500">{loading ? 'Kayıtlar yükleniyor...' : 'Günlere tıklayarak kayıt ekle veya düzenle.'}</p>
              </div>
              <div className="month-controls">
                <button onClick={() => shiftMonth(-1)} className="soft-button cursor-pointer">Önceki ay</button>
                <select value={selectedMonth} onChange={event => setSelectedMonth(Number(event.target.value))} className="form-control px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300">
                  {MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}
                </select>
                <select value={selectedYear} onChange={event => setSelectedYear(Number(event.target.value))} className="form-control px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300">
                  {years.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
                <button onClick={() => shiftMonth(1)} className="soft-button cursor-pointer">Sonraki ay</button>
              </div>
            </div>

            <div className="calendar-grid">
              {WEEKDAYS.map(day => <div key={day} className="weekday-cell">{day}</div>)}
              {days.map(item => {
                if (item.type === 'empty') return <div key={item.id} className="calendar-empty" />
                const record = records[item.dateKey]
                const isToday = item.dateKey === todayDateKey
                return (
                  <button key={item.dateKey} onClick={() => openDay(item.dateKey)} className={`calendar-day cursor-pointer ${record?.went ? 'calendar-day-active' : ''} ${isToday ? 'calendar-day-today' : ''}`}>
                    <span className="day-number">{item.day}</span>
                    {record?.went && <span className="day-amount">{formatCurrency(record.total)}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <aside className="side-column">
            <DailyList loading={loading} monthRecords={monthRecords} openDay={openDay} />
          </aside>
        </section>
      </main>

      {activeDateKey && (
        <DayModal
          activeDate={activeDate}
          formWent={formWent}
          formParking={formParking}
          formTransport={formTransport}
          modalParking={modalParking}
          modalRoad={modalRoad}
          saving={saving}
          onClose={closeModal}
          onDelete={removeRecord}
          onParkingChange={setFormParking}
          onTransportChange={setFormTransport}
          onSubmit={saveRecord}
          onWentChange={setFormWent}
        />
      )}
    </div>
  )
}

function HeaderActions({ session, onBack, onSignOut }) {
  return (
    <div className="app-topbar">
      <button onClick={onBack} className="nav-button cursor-pointer">Ana menü</button>
      <div className="topbar-actions">
        <span className="topbar-email hidden sm:block">{session.user.email}</span>
        <button onClick={onSignOut} className="nav-button cursor-pointer">Çıkış</button>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, text }) {
  return (
    <div className="summary-card">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-3 text-sm leading-5 text-slate-600">{text}</p>
    </div>
  )
}

function DailyList({ loading, monthRecords, openDay }) {
  return (
    <div className="side-card">
      <h2 className="text-xl font-bold">Günlük liste</h2>
      <p className="mt-1 text-sm text-slate-500">Seçilen ayda ofise gidilen günler.</p>
      <div className="mt-5 space-y-3">
        {loading ? (
          <p className="empty-state">Kayıtlar yükleniyor...</p>
        ) : monthRecords.length === 0 ? (
          <p className="empty-state">Bu ay için henüz kayıt yok.</p>
        ) : (
          monthRecords.map(record => (
            <button key={record.dateKey} onClick={() => openDay(record.dateKey)} className="daily-entry cursor-pointer text-left transition-all hover:border-teal-300 hover:bg-teal-50">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-slate-800">{new Date(record.dateKey).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}</span>
                <span className="font-bold text-teal-700">{formatCurrency(record.total)}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                <span>Otopark: {formatCurrency(record.parking)}</span>
                <span>Yol: {formatCurrency(record.road)}</span>
                <span>Toplam: {formatCurrency(record.total)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function DayModal({ activeDate, formWent, formParking, formTransport, modalParking, modalRoad, saving, onClose, onDelete, onParkingChange, onTransportChange, onSubmit, onWentChange }) {
  return (
    <div className="modal-backdrop">
      <form onSubmit={onSubmit} className="modal-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-teal-700">Gün kaydı</p>
            <h2 className="mt-1 text-2xl font-bold">{activeDate.day} {MONTHS[activeDate.monthIndex]} {activeDate.year}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="soft-button cursor-pointer disabled:opacity-50">Kapat</button>
        </div>

        <label className="mt-6 flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
          <span>
            <span className="block font-semibold text-slate-800">Ofise gidildi mi?</span>
            <span className="block text-sm text-slate-500">Kapalıysa günlük harcama 0 TL olur.</span>
          </span>
          <input type="checkbox" checked={formWent} disabled={saving} onChange={event => onWentChange(event.target.checked)} className="h-5 w-5 accent-teal-600" />
        </label>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-slate-700">Otopark ücreti</label>
          <div className="mt-2 flex items-center rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-teal-300">
            <input type="number" min="0" step="1" disabled={!formWent || saving} value={formParking} onChange={event => onParkingChange(event.target.value)} placeholder="0" className="w-full rounded-lg px-4 py-3 text-slate-800 outline-none disabled:bg-slate-50 disabled:text-slate-400" />
            <span className="px-4 text-sm font-bold text-slate-500">TL</span>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-slate-700">Yol ücreti</label>
          <div className="mt-2 flex items-center rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-teal-300">
            <input type="number" min="0" step="1" disabled={!formWent || saving} value={formTransport} onChange={event => onTransportChange(event.target.value)} placeholder="0" className="w-full rounded-lg px-4 py-3 text-slate-800 outline-none disabled:bg-slate-50 disabled:text-slate-400" />
            <span className="px-4 text-sm font-bold text-slate-500">TL</span>
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          <div className="flex justify-between"><span>Otopark</span><strong>{formatCurrency(modalParking)}</strong></div>
          <div className="mt-2 flex justify-between"><span>Yol ücreti</span><strong>{formatCurrency(modalRoad)}</strong></div>
          <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-base text-slate-900"><span>Günlük toplam</span><strong>{formatCurrency(modalParking + modalRoad)}</strong></div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button type="submit" disabled={saving} className="primary-button cursor-pointer disabled:opacity-50">{saving ? 'Kaydediliyor...' : 'Kaydet'}</button>
          <button type="button" onClick={onDelete} disabled={saving} className="danger-button cursor-pointer disabled:opacity-50">Kaydı sil</button>
          <button type="button" onClick={onClose} disabled={saving} className="soft-button ml-auto cursor-pointer disabled:opacity-50">İptal</button>
        </div>
      </form>
    </div>
  )
}
