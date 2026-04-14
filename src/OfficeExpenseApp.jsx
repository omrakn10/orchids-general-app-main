import { useEffect, useMemo, useState } from 'react'

const FIXED_EXPENSES = [{ id: 'road', label: 'Yol ücreti', amount: 275 }]
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

function normalizeRecord(record) {
  return { went: Boolean(record?.went), parking: Math.max(0, Number(record?.parking) || 0) }
}

function roadTotal(went) {
  return went ? FIXED_EXPENSES.reduce((total, expense) => total + expense.amount, 0) : 0
}

export default function OfficeExpenseApp({ session, onBack, onSignOut }) {
  const today = new Date()
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth())
  const [selectedYear, setSelectedYear] = useState(today.getFullYear())
  const [records, setRecords] = useState({})
  const [activeDateKey, setActiveDateKey] = useState(null)
  const [formWent, setFormWent] = useState(true)
  const [formParking, setFormParking] = useState('')
  const storageKey = `office-expenses:${session.user.id}`

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      setRecords(saved ? JSON.parse(saved) : {})
    } catch {
      setRecords({})
    }
  }, [storageKey])

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(records))
  }, [records, storageKey])

  const days = useMemo(() => buildCalendarDays(selectedYear, selectedMonth), [selectedYear, selectedMonth])

  const monthRecords = useMemo(() => {
    return Object.entries(records)
      .filter(([dateKey, record]) => {
        const date = parseDateKey(dateKey)
        return date.year === selectedYear && date.monthIndex === selectedMonth && normalizeRecord(record).went
      })
      .map(([dateKey, record]) => {
        const normalized = normalizeRecord(record)
        const road = roadTotal(normalized.went)
        return { dateKey, parking: normalized.parking, road, total: normalized.parking + road }
      })
      .sort((first, second) => first.dateKey.localeCompare(second.dateKey))
  }, [records, selectedMonth, selectedYear])

  const summary = useMemo(() => {
    const officeDays = monthRecords.length
    const parkingTotal = monthRecords.reduce((total, record) => total + record.parking, 0)
    const road = monthRecords.reduce((total, record) => total + record.road, 0)
    const total = parkingTotal + road
    return { officeDays, parkingTotal, road, total, average: officeDays ? total / officeDays : 0 }
  }, [monthRecords])

  const years = useMemo(() => {
    const savedYears = Object.keys(records).map(dateKey => parseDateKey(dateKey).year)
    return Array.from(new Set([today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1, ...savedYears])).sort((a, b) => a - b)
  }, [records, today])

  function openDay(dateKey) {
    const record = normalizeRecord(records[dateKey])
    setActiveDateKey(dateKey)
    setFormWent(record.went || !records[dateKey])
    setFormParking(record.parking ? String(record.parking) : '')
  }

  function closeModal() {
    setActiveDateKey(null)
    setFormParking('')
  }

  function saveRecord(event) {
    event.preventDefault()
    const parking = Math.max(0, Number(formParking) || 0)
    setRecords(previous => ({
      ...previous,
      [activeDateKey]: { went: formWent, parking: formWent ? parking : 0 },
    }))
    closeModal()
  }

  function deleteRecord() {
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
  const modalRoad = roadTotal(formWent)
  const modalParking = formWent ? Math.max(0, Number(formParking) || 0) : 0

  return (
    <div className="min-h-screen bg-[#f6f7f4] text-slate-900">
      <header className="relative bg-[#0f766e] px-4 pb-10 pt-16 text-white">
        <HeaderActions session={session} onBack={onBack} onSignOut={onSignOut} />
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-100">Ofis ulaşım takibi</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Ofise gidiş günlerin ve masrafların</h1>
          <p className="mt-4 max-w-3xl text-teal-50">
            Takvimden gün seç, ofise gittiğini işaretle, otopark ücretini gir. Her ofis günü için {formatCurrency(roadTotal(true))} yol ücreti otomatik eklenir.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard label="Ofise gidilen gün" value={`${formatNumber(summary.officeDays)} gün`} text={`Bu ay ofise ${formatNumber(summary.officeDays)} kez gittin.`} />
          <SummaryCard label="Toplam otopark" value={formatCurrency(summary.parkingTotal)} text={`Toplam otopark masrafın ${formatCurrency(summary.parkingTotal)}.`} />
          <SummaryCard label="Toplam yol" value={formatCurrency(summary.road)} text={`Toplam yol masrafın ${formatCurrency(summary.road)}.`} />
          <SummaryCard label="Toplam gider" value={formatCurrency(summary.total)} text={`Bu ay toplam ofis ulaşım giderin ${formatCurrency(summary.total)}.`} />
          <SummaryCard label="Ortalama günlük gider" value={formatCurrency(summary.average)} text={`Ofise gittiğin günlerde ortalama günlük harcaman ${formatCurrency(summary.average)}.`} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">{MONTHS[selectedMonth]} {selectedYear}</h2>
                <p className="text-sm text-slate-500">Günlere tıklayarak kayıt ekle veya düzenle.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => shiftMonth(-1)} className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-teal-300">Önceki</button>
                <select value={selectedMonth} onChange={event => setSelectedMonth(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-300">
                  {MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}
                </select>
                <select value={selectedYear} onChange={event => setSelectedYear(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-300">
                  {years.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
                <button onClick={() => shiftMonth(1)} className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-teal-300">Sonraki</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px bg-slate-100 p-px">
              {WEEKDAYS.map(day => <div key={day} className="bg-slate-50 px-2 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-500">{day}</div>)}
              {days.map(item => {
                if (item.type === 'empty') return <div key={item.id} className="min-h-20 bg-white" />
                const record = normalizeRecord(records[item.dateKey])
                const dayTotal = record.went ? record.parking + roadTotal(true) : 0
                return (
                  <button key={item.dateKey} onClick={() => openDay(item.dateKey)} className={`min-h-20 cursor-pointer bg-white p-2 text-left transition-all hover:bg-teal-50 ${record.went ? 'bg-teal-50 ring-1 ring-inset ring-teal-300' : ''}`}>
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold ${record.went ? 'bg-teal-600 text-white' : 'text-slate-700'}`}>{item.day}</span>
                    {record.went && <span className="mt-2 block text-xs font-semibold text-teal-700">{formatCurrency(dayTotal)}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <aside className="space-y-4">
            <DailyList monthRecords={monthRecords} openDay={openDay} />
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold">Sabit giderler</h2>
              <p className="mt-1 text-sm text-slate-500">İleride yeni sabit giderler bu listeden genişletilebilir.</p>
              <div className="mt-4 space-y-2">
                {FIXED_EXPENSES.map(expense => (
                  <div key={expense.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
                    <span className="font-semibold text-slate-700">{expense.label}</span>
                    <span className="font-bold text-slate-900">{formatCurrency(expense.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </main>

      {activeDateKey && (
        <DayModal
          activeDate={activeDate}
          formWent={formWent}
          formParking={formParking}
          modalParking={modalParking}
          modalRoad={modalRoad}
          onClose={closeModal}
          onDelete={deleteRecord}
          onParkingChange={setFormParking}
          onSubmit={saveRecord}
          onWentChange={setFormWent}
        />
      )}
    </div>
  )
}

function HeaderActions({ session, onBack, onSignOut }) {
  return (
    <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-3">
      <button onClick={onBack} className="cursor-pointer rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-white/20">Ana menü</button>
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden max-w-[220px] truncate text-xs text-white/75 sm:block">{session.user.email}</span>
        <button onClick={onSignOut} className="cursor-pointer rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-white/20">Çıkış</button>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, text }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-3 text-sm leading-5 text-slate-600">{text}</p>
    </div>
  )
}

function DailyList({ monthRecords, openDay }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold">Günlük liste</h2>
      <p className="mt-1 text-sm text-slate-500">Seçilen ayda ofise gidilen günler.</p>
      <div className="mt-5 space-y-3">
        {monthRecords.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Bu ay için henüz kayıt yok.</p>
        ) : (
          monthRecords.map(record => (
            <button key={record.dateKey} onClick={() => openDay(record.dateKey)} className="w-full cursor-pointer rounded-lg border border-slate-200 p-4 text-left transition-all hover:border-teal-300 hover:bg-teal-50">
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

function DayModal({ activeDate, formWent, formParking, modalParking, modalRoad, onClose, onDelete, onParkingChange, onSubmit, onWentChange }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/50 px-4 py-6">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-teal-700">Gün kaydı</p>
            <h2 className="mt-1 text-2xl font-bold">{activeDate.day} {MONTHS[activeDate.monthIndex]} {activeDate.year}</h2>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">Kapat</button>
        </div>

        <label className="mt-6 flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
          <span>
            <span className="block font-semibold text-slate-800">Ofise gidildi mi?</span>
            <span className="block text-sm text-slate-500">Kapalıysa günlük harcama 0 TL olur.</span>
          </span>
          <input type="checkbox" checked={formWent} onChange={event => onWentChange(event.target.checked)} className="h-5 w-5 accent-teal-600" />
        </label>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-slate-700">Otopark ücreti</label>
          <div className="mt-2 flex items-center rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-teal-300">
            <input type="number" min="0" step="1" disabled={!formWent} value={formParking} onChange={event => onParkingChange(event.target.value)} placeholder="0" className="w-full rounded-lg px-4 py-3 text-slate-800 outline-none disabled:bg-slate-50 disabled:text-slate-400" />
            <span className="px-4 text-sm font-bold text-slate-500">TL</span>
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          <div className="flex justify-between"><span>Otopark</span><strong>{formatCurrency(modalParking)}</strong></div>
          <div className="mt-2 flex justify-between"><span>Yol ücreti</span><strong>{formatCurrency(modalRoad)}</strong></div>
          <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-base text-slate-900"><span>Günlük toplam</span><strong>{formatCurrency(modalParking + modalRoad)}</strong></div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button type="submit" className="cursor-pointer rounded-lg bg-teal-700 px-5 py-3 text-sm font-bold text-white hover:bg-teal-800">Kaydet</button>
          <button type="button" onClick={onDelete} className="cursor-pointer rounded-lg bg-rose-50 px-5 py-3 text-sm font-bold text-rose-700 hover:bg-rose-100">Kaydı sil</button>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer rounded-lg bg-slate-100 px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200">İptal</button>
        </div>
      </form>
    </div>
  )
}
