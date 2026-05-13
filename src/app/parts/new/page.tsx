'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type VehicleOption = { id: string; vehicleNumber: string; make: string; model: string }
type RepairOption = { id: string; repairNumber: string; vehicleId: string }

export default function NewPartsOrderPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [repairs, setRepairs] = useState<RepairOption[]>([])
  const [form, setForm] = useState({
    vehicleId: '',
    repairId: '',
    partName: '',
    partNumber: '',
    quantity: '1',
    unitCost: '',
    totalCost: '',
    vendor: '',
    amazonOrderNumber: '',
    dateOrdered: new Date().toISOString().slice(0, 10),
    dateDelivered: '',
    notes: '',
  })

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  useEffect(() => {
    const loadOptions = async () => {
      setLoadingData(true)
      try {
        const [vehiclesRes, repairsRes] = await Promise.all([
          fetch('/api/vehicles?select=1'),
          fetch('/api/repairs?limit=100'),
        ])

        if (vehiclesRes.ok) {
          const data = await vehiclesRes.json()
          setVehicles(data.vehicles ?? [])
        }

        if (repairsRes.ok) {
          const data = await repairsRes.json()
          setRepairs(data.repairs ?? [])
        }
      } finally {
        setLoadingData(false)
      }
    }

    loadOptions()
  }, [])

  const filteredRepairs = useMemo(() => {
    if (!form.vehicleId) return repairs
    return repairs.filter(repair => repair.vehicleId === form.vehicleId)
  }, [repairs, form.vehicleId])

  const handleAutoTotal = () => {
    const quantity = Number(form.quantity) || 0
    const unitCost = Number(form.unitCost) || 0
    if (!quantity || !unitCost) return
    set('totalCost', (quantity * unitCost).toFixed(2))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: form.vehicleId,
          repairId: form.repairId || undefined,
          partName: form.partName.trim(),
          partNumber: form.partNumber.trim() || undefined,
          quantity: Number(form.quantity),
          unitCost: Number(form.unitCost),
          totalCost: Number(form.totalCost),
          vendor: form.vendor.trim(),
          amazonOrderNumber: form.amazonOrderNumber.trim() || undefined,
          dateOrdered: form.dateOrdered,
          dateDelivered: form.dateDelivered || undefined,
          notes: form.notes.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error?.formErrors?.[0] ?? data?.error ?? 'Failed to create parts order')
        return
      }

      router.push('/parts?created=true')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Log Parts Order</h1>
        <p className="text-sm text-gray-500 mt-0.5">Record new parts spend and link it to a vehicle or repair.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-5 space-y-4">
          <h2 className="font-medium text-gray-900">Order Details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Vehicle *</label>
              <select className="select" value={form.vehicleId} onChange={e => set('vehicleId', e.target.value)} required>
                <option value="">Select vehicle...</option>
                {vehicles.map(vehicle => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.vehicleNumber} - {vehicle.make} {vehicle.model}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Linked Repair (optional)</label>
              <select className="select" value={form.repairId} onChange={e => set('repairId', e.target.value)}>
                <option value="">No linked repair</option>
                {filteredRepairs.map(repair => (
                  <option key={repair.id} value={repair.id}>
                    {repair.repairNumber}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Part Name *</label>
              <input className="input" value={form.partName} onChange={e => set('partName', e.target.value)} required />
            </div>

            <div>
              <label className="label">Part Number</label>
              <input className="input" value={form.partNumber} onChange={e => set('partNumber', e.target.value)} />
            </div>

            <div>
              <label className="label">Vendor *</label>
              <input className="input" value={form.vendor} onChange={e => set('vendor', e.target.value)} required />
            </div>

            <div>
              <label className="label">Amazon Order Number</label>
              <input className="input" value={form.amazonOrderNumber} onChange={e => set('amazonOrderNumber', e.target.value)} />
            </div>

            <div>
              <label className="label">Quantity *</label>
              <input type="number" min={1} className="input" value={form.quantity} onChange={e => set('quantity', e.target.value)} onBlur={handleAutoTotal} required />
            </div>

            <div>
              <label className="label">Unit Cost ($) *</label>
              <input type="number" min={0} step="0.01" className="input" value={form.unitCost} onChange={e => set('unitCost', e.target.value)} onBlur={handleAutoTotal} required />
            </div>

            <div>
              <label className="label">Total Cost ($) *</label>
              <input type="number" min={0} step="0.01" className="input" value={form.totalCost} onChange={e => set('totalCost', e.target.value)} required />
            </div>

            <div>
              <label className="label">Date Ordered *</label>
              <input type="date" className="input" value={form.dateOrdered} onChange={e => set('dateOrdered', e.target.value)} required />
            </div>

            <div>
              <label className="label">Date Delivered</label>
              <input type="date" className="input" value={form.dateDelivered} onChange={e => set('dateDelivered', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input min-h-[96px] resize-none" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        {loadingData && (
          <div className="text-sm text-gray-500">Loading vehicles and repairs...</div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Parts Order'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}