'use client'

import { useState, useEffect } from 'react'
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { History, Search, Download, ChevronDown, ChevronUp } from 'lucide-react'

interface HistoryRow {
  id: string
  date: string
  routeCode: string
  routeType: string
  daName?: string
  vehicleNumber?: string
  stopCount?: number
  packageVolume?: number
  stageLocation?: string
  departureTime?: string
  phoneImei?: string
  status: string
}

interface Summary {
  totalRoutes: number
  uniqueDAs: number
  uniqueVans: number
  totalStops: number
  totalPackages: number
  avgStopsPerRoute: number
}

const QUICK_RANGES = [
  { label: 'Last 7 days',   from: () => format(subDays(new Date(), 7), 'yyyy-MM-dd'),           to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'Last 30 days',  from: () => format(subDays(new Date(), 30), 'yyyy-MM-dd'),          to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'Last 90 days',  from: () => format(subDays(new Date(), 90), 'yyyy-MM-dd'),          to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'This month',    from: () => format(startOfMonth(new Date()), 'yyyy-MM-dd'),         to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'Last month',    from: () => format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), to: () => format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd') },
  { label: 'All time',      from: () => '2020-01-01',                                           to: () => format(new Date(), 'yyyy-MM-dd') },
]

export default function DispatchHistoryPage() {
  const [from, setFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [to, setTo]     = useState(format(new Date(), 'yyyy-MM-dd'))
  const [daFilter, setDaFilter]       = useState('')
  const [vanFilter, setVanFilter]     = useState('')
  const [routeFilter, setRouteFilter] = useState('')
  const [rows, setRows]       = useState<HistoryRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [sortField, setSortField] = useState('date')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc')
  const [page, setPage]     = useState(1)
  const [total, setTotal]   = useState(0)
  const PER_PAGE = 50

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams({
      from, to,
      da:    daFilter,
      van:   vanFilter,
      route: routeFilter,
      sort:  sortField,
      dir:   sortDir,
      page:  String(page),
      limit: String(PER_PAGE),
    })
    const res = await fetch(`/api/routes/history?${params}`)
    if (res.ok) {
      const data = await res.json()
      setRows(data.rows)
      setTotal(data.total)
      setSummary(data.summary)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [from, to, daFilter, vanFilter, routeFilter, sortField, sortDir, page])

  const applyRange = (range: typeof QUICK_RANGES[0]) => {
    setFrom(range.from())
    setTo(range.to())
    setPage(1)
  }

  const sort = (field: string) => {
    if (sortField === field) setDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }
  const setDir = setSortDir

  const exportCSV = async () => {
    const params = new URLSearchParams({ from, to, da: daFilter, van: vanFilter, route: routeFilter, export: 'csv' })
    const res = await fetch(`/api/routes/history?${params}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dispatch-history-${from}-to-${to}.csv`
    a.click()
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="inline ml-1 text-blue-600" />
      : <ChevronDown size={12} className="inline ml-1 text-blue-600" />
  }

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <History size={20} className="text-blue-600" />
            Dispatch History
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Complete historical log — stored forever, no 6-month limit
          </p>
        </div>
        <button onClick={exportCSV} className="btn-secondary text-sm">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-4">
        {/* Quick ranges */}
        <div className="flex flex-wrap gap-2">
          {QUICK_RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => applyRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                from === r.from() && to === r.to()
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Custom date range + search filters */}
        <div className="grid grid-cols-5 gap-3">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={from}
              onChange={e => { setFrom(e.target.value); setPage(1) }} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={to}
              onChange={e => { setTo(e.target.value); setPage(1) }} />
          </div>
          <div>
            <label className="label">DA Name</label>
            <input className="input" placeholder="Search DA…" value={daFilter}
              onChange={e => { setDaFilter(e.target.value); setPage(1) }} />
          </div>
          <div>
            <label className="label">Van #</label>
            <input className="input" placeholder="e.g. VAN-014" value={vanFilter}
              onChange={e => { setVanFilter(e.target.value); setPage(1) }} />
          </div>
          <div>
            <label className="label">Route Code</label>
            <input className="input" placeholder="e.g. R001" value={routeFilter}
              onChange={e => { setRouteFilter(e.target.value); setPage(1) }} />
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: 'Total Routes',      value: summary.totalRoutes.toLocaleString() },
            { label: 'Unique DAs',        value: summary.uniqueDAs },
            { label: 'Unique Vans',       value: summary.uniqueVans },
            { label: 'Total Stops',       value: summary.totalStops.toLocaleString() },
            { label: 'Total Packages',    value: summary.totalPackages.toLocaleString() },
            { label: 'Avg Stops/Route',   value: summary.avgStopsPerRoute.toFixed(0) },
          ].map(s => (
            <div key={s.label} className="stat-card text-center">
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className="text-xl font-semibold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Results table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="section-title">
            {loading ? 'Loading…' : `${total.toLocaleString()} route assignments`}
          </h3>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="btn-secondary text-xs py-1 disabled:opacity-40">← Prev</button>
              <span className="text-gray-500">Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                className="btn-secondary text-xs py-1 disabled:opacity-40">Next →</button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {[
                  { label: 'Date',     field: 'date' },
                  { label: 'Route',    field: 'routeCode' },
                  { label: 'Type',     field: 'routeType' },
                  { label: 'DA',       field: 'daName' },
                  { label: 'Van',      field: 'vehicleNumber' },
                  { label: 'Stops',    field: 'stopCount' },
                  { label: 'Packages', field: 'packageVolume' },
                  { label: 'Stage',    field: 'stageLocation' },
                  { label: 'Depart',   field: 'departureTime' },
                  { label: 'Phone',    field: 'phoneImei' },
                  { label: 'Status',   field: 'status' },
                ].map(col => (
                  <th
                    key={col.field}
                    className="table-header text-left cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => sort(col.field)}
                  >
                    {col.label}<SortIcon field={col.field} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="text-center py-12 text-sm text-gray-400">Loading…</td></tr>
              ) : rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium text-gray-900">
                    {format(new Date(row.date + 'T12:00:00'), 'MMM d, yyyy')}
                    <div className="text-xs text-gray-400">
                      {format(new Date(row.date + 'T12:00:00'), 'EEEE')}
                    </div>
                  </td>
                  <td className="table-cell font-mono text-xs">{row.routeCode}</td>
                  <td className="table-cell">
                    <span className={`badge ${
                      row.routeType === 'SURGE'  ? 'badge-amber' :
                      row.routeType === 'RESCUE' ? 'badge-red'   : 'badge-gray'
                    }`}>
                      {row.routeType.toLowerCase()}
                    </span>
                  </td>
                  <td className="table-cell font-medium">
                    {row.daName ?? <span className="text-gray-300">Unassigned</span>}
                  </td>
                  <td className="table-cell">
                    {row.vehicleNumber ?? <span className="text-gray-300">No van</span>}
                  </td>
                  <td className="table-cell">{row.stopCount ?? '—'}</td>
                  <td className="table-cell">{row.packageVolume ?? '—'}</td>
                  <td className="table-cell text-xs text-gray-600">{row.stageLocation ?? '—'}</td>
                  <td className="table-cell text-xs">{row.departureTime ?? '—'}</td>
                  <td className="table-cell font-mono text-xs text-gray-500">
                    {row.phoneImei ? row.phoneImei.slice(-6) : '—'}
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${
                      row.status === 'COMPLETED' ? 'badge-green' :
                      row.status === 'IN_PROGRESS' ? 'badge-blue' : 'badge-gray'
                    }`}>
                      {row.status.toLowerCase().replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-sm text-gray-400">
                    No dispatch records found for this date range.
                    {from === format(subDays(new Date(), 30), 'yyyy-MM-dd') && (
                      <p className="mt-1 text-xs">Records will appear here once your dispatchers start using the Dispatch Board daily.</p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
