'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewVehiclePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    vin: '',
    vehicleNumber: '',
    licensePlate: '',
    make: '',
    model: '',
    year: new Date().getFullYear().toString(),
    odometerCurrent: '',
    estimatedValue: '',
    acquisitionDate: '',
    notes: '',
  })

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vin: form.vin.trim(),
          vehicleNumber: form.vehicleNumber.trim(),
          licensePlate: form.licensePlate.trim() || undefined,
          make: form.make.trim(),
          model: form.model.trim(),
          year: Number(form.year),
          odometerCurrent: form.odometerCurrent ? Number(form.odometerCurrent) : undefined,
          estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : undefined,
          acquisitionDate: form.acquisitionDate || undefined,
          notes: form.notes.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error?.formErrors?.[0] ?? data?.error ?? 'Failed to create vehicle')
        return
      }

      router.push('/vehicles?created=true')
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
        <h1 className="text-xl font-semibold text-gray-900">Add Vehicle</h1>
        <p className="text-sm text-gray-500 mt-0.5">Create a new fleet vehicle record.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-5 space-y-4">
          <h2 className="font-medium text-gray-900">Vehicle Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Vehicle Number *</label>
              <input className="input" value={form.vehicleNumber} onChange={e => set('vehicleNumber', e.target.value)} required />
            </div>
            <div>
              <label className="label">VIN *</label>
              <input className="input" value={form.vin} onChange={e => set('vin', e.target.value)} minLength={10} required />
            </div>
            <div>
              <label className="label">Make *</label>
              <input className="input" value={form.make} onChange={e => set('make', e.target.value)} required />
            </div>
            <div>
              <label className="label">Model *</label>
              <input className="input" value={form.model} onChange={e => set('model', e.target.value)} required />
            </div>
            <div>
              <label className="label">Year *</label>
              <input type="number" className="input" min={2000} max={2030} value={form.year} onChange={e => set('year', e.target.value)} required />
            </div>
            <div>
              <label className="label">License Plate</label>
              <input className="input" value={form.licensePlate} onChange={e => set('licensePlate', e.target.value)} />
            </div>
            <div>
              <label className="label">Current Odometer</label>
              <input type="number" className="input" min={0} value={form.odometerCurrent} onChange={e => set('odometerCurrent', e.target.value)} />
            </div>
            <div>
              <label className="label">Estimated Value ($)</label>
              <input type="number" className="input" min={0} step="0.01" value={form.estimatedValue} onChange={e => set('estimatedValue', e.target.value)} />
            </div>
            <div className="col-span-2 max-w-xs">
              <label className="label">Acquisition Date</label>
              <input type="date" className="input" value={form.acquisitionDate} onChange={e => set('acquisitionDate', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input min-h-[96px] resize-none" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Vehicle'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}