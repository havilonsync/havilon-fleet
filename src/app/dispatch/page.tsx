'use client'

import { useState, useEffect } from 'react'
import { format, addDays, subDays } from 'date-fns'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Truck, User, RotateCcw, CheckCircle } from 'lucide-react'

interface RouteRow {
  id?: string
  routeCode: string
  routeType: string
  daId?: string
  daName?: string
  vehicleId?: string
  vehicleNumber?: string
  stopCount?: number
  packageVolume?: number
  destination?: string
  stageLocation?: string
  departureTime?: string
  status: string
  phoneImei?: string
}

export default function DispatchPage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [routes, setRoutes] = useState<RouteRow[]>([])
  const [das, setDas] = useState<any[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [broadcasting, setBroadcasting] = useState(false)
  const [broadcastResult, setBroadcastResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null)

  const dayLabel = (() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
    if (date === today) return 'Today'
    if (date === tomorrow) return 'Tomorrow'
    return format(new Date(date + 'T12:00:00'), 'EEEE, MMM d')
  })()

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/routes?date=${date}`).then(r => r.json()),
      fetch('/api/da?status=ACTIVE').then(r => r.json()),
      fetch('/api/vehicles?status=ACTIVE').then(r => r.json()),
    ]).then(([routeData, daData, vehicleData]) => {
      setRoutes(routeData.routes ?? [])
      setDas(daData.das ?? [])
      setVehicles(vehicleData.vehicles ?? [])
      setLoading(false)
    })
  }, [date])

  const updateRoute = (index: number, field: string, value: any) => {
    setRoutes(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  const saveRoute = async (route: RouteRow, index: number) => {
    if (!route.routeCode) return
    setSaving(route.routeCode)

    await fetch('/api/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...route, date }),
    })

    setSaving(null)
    setSaved(route.routeCode)
    setTimeout(() => setSaved(null), 2000)
  }

  const addRoute = () => {
    setRoutes(prev => [...prev, {
      routeCode: `R${String(prev.length + 1).padStart(3, '0')}`,
      routeType: 'BASE',
      status: 'SCHEDULED',
    }])
  }

  const removeRoute = (index: number) => {
    setRoutes(prev => prev.filter((_, i) => i !== index))
  }

  const broadcast = async () => {
    setBroadcasting(true)
    setBroadcastResult(null)
    try {
      const res = await fetch('/api/dispatch/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const data = await res.json()
      setBroadcastResult(data)
    } catch {
      setBroadcastResult({ success: false, error: 'Network error — broadcast failed' })
    } finally {
      setBroadcasting(false)
    }
  }

  // Stats
  const assigned = routes.filter(r => r.daId).length
  const withVan  = routes.filter(r => r.vehicleId).length
  const total    = routes.length

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Daily Dispatch Board</h1>
          <p className="text-sm text-gray-500 mt-0.5">Assign DAs and vans to routes each morning</p>
        </div>

        {/* Date navigator */}
        <div className="flex items-center gap-3">
          <Link href="/dispatch/history" className="btn-secondary text-sm">
            📋 View History
          </Link>
          <button
            onClick={broadcast}
            disabled={broadcasting || assigned === 0}
            className="btn-primary text-sm"
          >
            {broadcasting ? 'Sending…' : `📢 Broadcast Schedule (${assigned} DAs)`}
          </button>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <button onClick={() => setDate(format(subDays(new Date(date + 'T12:00:00'), 1), 'yyyy-MM-dd'))}
            className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft size={16} />
          </button>
          <div className="text-center px-2">
            <p className="font-semibold text-sm text-gray-900">{dayLabel}</p>
            <p className="text-xs text-gray-500">{format(new Date(date + 'T12:00:00'), 'MM/dd/yyyy')}</p>
          </div>
          <button onClick={() => setDate(format(addDays(new Date(date + 'T12:00:00'), 1), 'yyyy-MM-dd'))}
            className="p-1 hover:bg-gray-100 rounded">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))}
            className="ml-1 text-xs text-blue-600 hover:underline">Today</button>
          </div>
        </div>
      </div>

      {/* Broadcast result */}
      {broadcastResult && (
        <div className={`rounded-xl p-3 border flex items-center gap-3 ${broadcastResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`text-sm font-medium ${broadcastResult.success ? 'text-green-800' : 'text-red-800'}`}>
            {broadcastResult.success
              ? `✅ ${broadcastResult.message}`
              : `❌ ${broadcastResult.error}`
            }
          </p>
          <button onClick={() => setBroadcastResult(null)} className="ml-auto text-gray-400 hover:text-gray-600 text-xs">dismiss</button>
        </div>
      )}

      {/* Progress bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">
            Dispatch Progress — {assigned}/{total} DAs assigned · {withVan}/{total} vans assigned
          </p>
          {assigned === total && total > 0 && (
            <span className="badge badge-green flex items-center gap-1">
              <CheckCircle size={12} /> Fully dispatched
            </span>
          )}
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: total > 0 ? `${(assigned / total) * 100}%` : '0%' }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{total} routes total</span>
          <span>{total - assigned} unassigned</span>
        </div>
      </div>

      {/* Dispatch table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="section-title">{dayLabel} Routes</h3>
          <button onClick={addRoute} className="btn-primary text-xs">
            + Add Route
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading dispatch board…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['Route', 'Type', 'Assigned DA', 'Van', 'Stops', 'Packages', 'Stage', 'Depart', 'Phone IMEI', ''].map(h => (
                    <th key={h} className="table-header text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routes.map((route, i) => (
                  <tr key={i} className={`hover:bg-gray-50 ${!route.daId ? 'bg-amber-50' : ''}`}>
                    <td className="table-cell">
                      <input
                        className="input text-xs w-20 py-1"
                        value={route.routeCode}
                        onChange={e => updateRoute(i, 'routeCode', e.target.value)}
                        onBlur={() => saveRoute(route, i)}
                      />
                    </td>
                    <td className="table-cell">
                      <select
                        className="select text-xs py-1 w-24"
                        value={route.routeType}
                        onChange={e => { updateRoute(i, 'routeType', e.target.value); saveRoute({ ...route, routeType: e.target.value }, i) }}
                      >
                        <option value="BASE">Base</option>
                        <option value="SURGE">Surge</option>
                        <option value="RESCUE">Rescue</option>
                      </select>
                    </td>
                    <td className="table-cell min-w-[160px]">
                      <select
                        className={`select text-xs py-1 w-full ${!route.daId ? 'border-amber-300 bg-amber-50' : ''}`}
                        value={route.daId ?? ''}
                        onChange={e => {
                          const da = das.find(d => d.id === e.target.value)
                          updateRoute(i, 'daId', e.target.value)
                          updateRoute(i, 'daName', da?.name)
                          saveRoute({ ...route, daId: e.target.value, daName: da?.name }, i)
                        }}
                      >
                        <option value="">— Assign DA —</option>
                        {das.map(da => (
                          <option key={da.id} value={da.id}>{da.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="table-cell min-w-[130px]">
                      <select
                        className={`select text-xs py-1 w-full ${!route.vehicleId ? 'border-amber-300 bg-amber-50' : ''}`}
                        value={route.vehicleId ?? ''}
                        onChange={e => {
                          const v = vehicles.find(v => v.id === e.target.value)
                          updateRoute(i, 'vehicleId', e.target.value)
                          updateRoute(i, 'vehicleNumber', v?.vehicleNumber)
                          saveRoute({ ...route, vehicleId: e.target.value, vehicleNumber: v?.vehicleNumber }, i)
                        }}
                      >
                        <option value="">— Assign Van —</option>
                        {vehicles.map(v => (
                          <option key={v.id} value={v.id}>{v.vehicleNumber}</option>
                        ))}
                      </select>
                    </td>
                    <td className="table-cell">
                      <input
                        type="number"
                        className="input text-xs w-16 py-1"
                        value={route.stopCount ?? ''}
                        placeholder="0"
                        onChange={e => updateRoute(i, 'stopCount', parseInt(e.target.value))}
                        onBlur={() => saveRoute(route, i)}
                      />
                    </td>
                    <td className="table-cell">
                      <input
                        type="number"
                        className="input text-xs w-20 py-1"
                        value={route.packageVolume ?? ''}
                        placeholder="0"
                        onChange={e => updateRoute(i, 'packageVolume', parseInt(e.target.value))}
                        onBlur={() => saveRoute(route, i)}
                      />
                    </td>
                    <td className="table-cell">
                      <input
                        className="input text-xs w-20 py-1"
                        value={route.stageLocation ?? ''}
                        placeholder="STG"
                        onChange={e => updateRoute(i, 'stageLocation', e.target.value)}
                        onBlur={() => saveRoute(route, i)}
                      />
                    </td>
                    <td className="table-cell">
                      <input
                        type="time"
                        className="input text-xs w-24 py-1"
                        value={route.departureTime ?? ''}
                        onChange={e => updateRoute(i, 'departureTime', e.target.value)}
                        onBlur={() => saveRoute(route, i)}
                      />
                    </td>
                    <td className="table-cell">
                      <input
                        className="input text-xs w-32 py-1 font-mono"
                        value={route.phoneImei ?? ''}
                        placeholder="IMEI"
                        onChange={e => updateRoute(i, 'phoneImei', e.target.value)}
                        onBlur={() => saveRoute(route, i)}
                      />
                    </td>
                    <td className="table-cell">
                      {saving === route.routeCode ? (
                        <span className="text-xs text-blue-500">Saving…</span>
                      ) : saved === route.routeCode ? (
                        <span className="text-xs text-green-600">✓ Saved</span>
                      ) : (
                        <button onClick={() => removeRoute(i)}
                          className="text-xs text-red-400 hover:text-red-600">
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {routes.length === 0 && !loading && (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-sm text-gray-400">
                      No routes for {dayLabel} yet.
                      <button onClick={addRoute} className="text-blue-600 hover:underline ml-2">
                        Add the first route →
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Unassigned DAs */}
      {das.length > 0 && (
        <div className="card p-4">
          <h3 className="section-title mb-3">Available DAs Not Yet Assigned Today</h3>
          <div className="flex flex-wrap gap-2">
            {das.filter(da => !routes.some(r => r.daId === da.id)).map(da => (
              <span key={da.id} className="badge badge-gray">
                {da.name}
                {da.offDays?.includes(format(new Date(date + 'T12:00:00'), 'EEE')) && (
                  <span className="ml-1 text-amber-600">(scheduled off)</span>
                )}
              </span>
            ))}
            {das.filter(da => !routes.some(r => r.daId === da.id)).length === 0 && (
              <span className="text-sm text-green-600">All active DAs are assigned ✓</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
