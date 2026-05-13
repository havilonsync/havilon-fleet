'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewShopPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    contactPerson: '',
    email: '',
    categories: '',
    notes: '',
  })

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address.trim() || undefined,
          phone: form.phone.trim() || undefined,
          contactPerson: form.contactPerson.trim() || undefined,
          email: form.email.trim() || undefined,
          categories: form.categories
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
          notes: form.notes.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error?.formErrors?.[0] ?? data?.error ?? 'Failed to create shop')
        return
      }

      router.push('/shops?created=true')
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
        <h1 className="text-xl font-semibold text-gray-900">Add Repair Shop</h1>
        <p className="text-sm text-gray-500 mt-0.5">Register a new vendor in your repair network.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-5 space-y-4">
          <h2 className="font-medium text-gray-900">Vendor Profile</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Shop Name *</label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div>
              <label className="label">Contact Person</label>
              <input className="input" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Address</label>
              <input className="input" value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Categories</label>
              <input className="input" value={form.categories} onChange={e => set('categories', e.target.value)} placeholder="Collision, Tires, Electrical" />
              <p className="text-xs text-gray-400 mt-1">Comma-separated values.</p>
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
            {loading ? 'Creating...' : 'Create Shop'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}