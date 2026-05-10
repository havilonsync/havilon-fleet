'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, FileText, AlertTriangle, CheckCircle, ChevronDown } from 'lucide-react'

const CATEGORIES = [
  'TIRES', 'BRAKES', 'COLLISION', 'ENGINE', 'ELECTRICAL',
  'BODY', 'SUSPENSION', 'HVAC', 'GLASS', 'OTHER'
]

function getTierInfo(cost: number) {
  if (cost < 250) return { label: 'Tier 1 — Standard', color: 'green', desc: 'Ops Manager approval only', checks: ['Photos required'] }
  if (cost < 1000) return { label: 'Tier 2 — Secondary', color: 'blue', desc: 'Secondary approval required', checks: ['Photos required', 'Written estimate required'] }
  if (cost < 2500) return { label: 'Tier 3 — Owner Review', color: 'amber', desc: 'Owner must approve', checks: ['Photos required', 'Written estimate required', 'Line-item breakdown required'] }
  return { label: 'Tier 4 — Executive', color: 'red', desc: 'Full owner review + comparative quotes', checks: ['Photos required', 'Written estimate required', '2nd comparative estimate required', 'Line-item breakdown required', 'Owner sign-off required'] }
}

export default function NewRepairPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    vehicleId: '',
    shopId: '',
    category: '',
    description: '',
    damageType: '',
    estimatedCost: '',
    laborHours: '',
    laborRate: '',
    partsCost: '',
    routeIncidentNumber: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [vehicles, setVehicles] = useState<any[]>([])
  const [shops, setShops] = useState<any[]>([])
  const [dataLoaded, setDataLoaded] = useState(false)

  const cost = parseFloat(form.estimatedCost) || 0
  const tierInfo = getTierInfo(cost)

  const loadData = async () => {
    if (dataLoaded) return
    const [vRes, sRes] = await Promise.all([
      fetch('/api/vehicles?select=id,vehicleNumber,vin,make,model'),
      fetch('/api/shops'),
    ])
    if (vRes.ok) setVehicles(await vRes.json().then(d => d.vehicles ?? []))
    if (sRes.ok) setShops(await sRes.json().then(d => d.shops ?? []))
    setDataLoaded(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/repairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          estimatedCost: parseFloat(form.estimatedCost) || undefined,
          laborHours: parseFloat(form.laborHours) || undefined,
          laborRate: parseFloat(form.laborRate) || undefined,
          partsCost: parseFloat(form.partsCost) || undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setError(err.error ?? 'Failed to create repair')
        return
      }

      const data = await res.json()
      router.push(`/repairs/${data.repair.id}?created=true`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  const tierColors = { green: 'green', blue: 'blue', amber: 'amber', red: 'red' }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">New Repair Request</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          All repairs are tracked, fraud-scored, and routed for appropriate approval.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Vehicle + Shop */}
        <div className="card p-5 space-y-4">
          <h2 className="font-medium text-gray-900">Vehicle & Vendor</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Vehicle *</label>
              <select
                className="select"
                value={form.vehicleId}
                onChange={e => set('vehicleId', e.target.value)}
                onFocus={loadData}
                required
              >
                <option value="">Select vehicle…</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.vehicleNumber} — {v.make} {v.model}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Repair Shop</label>
              <select
                className="select"
                value={form.shopId}
                onChange={e => set('shopId', e.target.value)}
                onFocus={loadData}
              >
                <option value="">Select shop…</option>
                {shops.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.fraudScore >= 60 ? '⚠️ HIGH RISK' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Repair Details */}
        <div className="card p-5 space-y-4">
          <h2 className="font-medium text-gray-900">Repair Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category *</label>
              <select
                className="select"
                value={form.category}
                onChange={e => set('category', e.target.value)}
                required
              >
                <option value="">Select category…</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Damage Type</label>
              <input
                className="input"
                placeholder="e.g. Front panel impact"
                value={form.damageType}
                onChange={e => set('damageType', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Description *</label>
            <textarea
              className="input min-h-[80px] resize-none"
              placeholder="Detailed description of damage and required repairs…"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              required
              minLength={10}
            />
          </div>
          <div>
            <label className="label">Route/Incident Number</label>
            <input
              className="input"
              placeholder="If related to a delivery incident"
              value={form.routeIncidentNumber}
              onChange={e => set('routeIncidentNumber', e.target.value)}
            />
          </div>
        </div>

        {/* Cost Estimate */}
        <div className="card p-5 space-y-4">
          <h2 className="font-medium text-gray-900">Cost Estimate</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Labor Hours</label>
              <input
                type="number"
                step="0.5"
                className="input"
                placeholder="0.0"
                value={form.laborHours}
                onChange={e => set('laborHours', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Labor Rate ($/hr)</label>
              <input
                type="number"
                className="input"
                placeholder="0.00"
                value={form.laborRate}
                onChange={e => set('laborRate', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Parts Cost ($)</label>
              <input
                type="number"
                className="input"
                placeholder="0.00"
                value={form.partsCost}
                onChange={e => set('partsCost', e.target.value)}
              />
            </div>
          </div>
          <div className="max-w-xs">
            <label className="label">Total Estimated Cost ($) *</label>
            <input
              type="number"
              className="input"
              placeholder="0.00"
              value={form.estimatedCost}
              onChange={e => set('estimatedCost', e.target.value)}
              required
            />
          </div>

          {/* Approval tier preview */}
          {cost > 0 && (
            <div className={`rounded-lg p-3 bg-${tierInfo.color}-50 border border-${tierInfo.color}-200`}>
              <div className="flex items-center gap-2 mb-2">
                {cost >= 1000 ? (
                  <AlertTriangle size={14} className={`text-${tierInfo.color}-600`} />
                ) : (
                  <CheckCircle size={14} className={`text-${tierInfo.color}-600`} />
                )}
                <span className={`text-sm font-medium text-${tierInfo.color}-700`}>
                  {tierInfo.label}
                </span>
                <span className={`text-xs text-${tierInfo.color}-600`}>— {tierInfo.desc}</span>
              </div>
              <ul className="space-y-1">
                {tierInfo.checks.map(c => (
                  <li key={c} className={`text-xs text-${tierInfo.color}-700 flex items-center gap-1.5`}>
                    <CheckCircle size={10} />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Photo requirement reminder */}
        <div className="card p-5">
          <h2 className="font-medium text-gray-900 mb-3">Photo Evidence</h2>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800 flex items-center gap-2">
              <Camera size={15} className="flex-shrink-0" />
              <span>
                <strong>Before, during, and after photos are required.</strong> You can upload them after creating this request.
                Repairs without photos cannot be approved or paid.
              </span>
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Creating…' : 'Create Repair Request'}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
