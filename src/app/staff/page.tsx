'use client'

import { useState, useEffect } from 'react'
import { UserPlus, Shield, Eye, Calculator, Wrench, Crown, Trash2, RefreshCw } from 'lucide-react'

const ROLES = [
  { value: 'OPS_MANAGER', label: 'Ops Manager', icon: Shield, color: 'blue', desc: 'Create/edit repairs, limited approval authority' },
  { value: 'MECHANIC', label: 'Mechanic / Staff', icon: Wrench, color: 'gray', desc: 'Upload photos, update repair status' },
  { value: 'ACCOUNTING', label: 'Accounting', icon: Calculator, color: 'green', desc: 'Invoice and payment visibility only' },
  { value: 'AUDIT', label: 'Auditor', icon: Eye, color: 'gray', desc: 'Read-only access — no edits' },
]

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'badge-red',
  OPS_MANAGER: 'badge-blue',
  MECHANIC: 'badge-gray',
  ACCOUNTING: 'badge-green',
  AUDIT: 'badge-gray',
}

export default function StaffPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', role: 'MECHANIC' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const loadUsers = async () => {
    setLoading(true)
    const res = await fetch('/api/staff')
    if (res.ok) setUsers(await res.json().then(d => d.users))
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (res.ok) {
      setMessage(`✅ ${form.name} added. An invite email has been sent to ${form.email}.`)
      setForm({ email: '', name: '', role: 'MECHANIC' })
      setShowInvite(false)
      loadUsers()
    } else {
      setMessage(`❌ ${data.error}`)
    }
    setSaving(false)
  }

  const updateRole = async (userId: string, role: string) => {
    await fetch(`/api/staff/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    loadUsers()
  }

  const deactivate = async (userId: string, name: string) => {
    if (!confirm(`Deactivate ${name}? They will be immediately blocked from logging in.`)) return
    await fetch(`/api/staff/${userId}`, { method: 'DELETE' })
    loadUsers()
  }

  const reactivate = async (userId: string) => {
    await fetch(`/api/staff/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    })
    loadUsers()
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Staff Access</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Staff log in with their personal Gmail — no separate password needed.
          </p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary">
          <UserPlus size={15} />
          Invite Staff Member
        </button>
      </div>

      {/* How it works banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800 font-medium mb-1">How access works</p>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>1. You add a staff member here with their Gmail address and assign their role</li>
          <li>2. They receive an invite email with a link to the portal</li>
          <li>3. They click "Sign in with Google" using that Gmail — one click, no password</li>
          <li>4. Their access is instant. You can change their role or deactivate them any time</li>
        </ul>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="card p-5">
          <h2 className="font-medium text-gray-900 mb-4">Invite New Staff Member</h2>
          <form onSubmit={invite} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Full Name *</label>
                <input
                  className="input"
                  placeholder="Marcus Williams"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">Their Gmail Address *</label>
                <input
                  className="input"
                  type="email"
                  placeholder="marcus@gmail.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Role *</label>
              <div className="grid grid-cols-2 gap-3">
                {ROLES.map(r => (
                  <label
                    key={r.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      form.role === r.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      checked={form.role === r.value}
                      onChange={() => setForm(f => ({ ...f, role: r.value }))}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{r.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{r.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Sending invite…' : 'Add & Send Invite Email'}
              </button>
              <button type="button" onClick={() => setShowInvite(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {message && (
        <div className={`rounded-lg p-3 text-sm ${message.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message}
        </div>
      )}

      {/* User table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="section-title">{users.length} Team Members</h2>
          <button onClick={loadUsers} className="btn-secondary text-xs">
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
        <table className="w-full">
          <thead>
            <tr>
              {['Name', 'Gmail / Email', 'Role', 'Last Login', 'Status', 'Actions'].map(h => (
                <th key={h} className="table-header text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-gray-400">Loading…</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className={`hover:bg-gray-50 ${!u.isActive ? 'opacity-50' : ''}`}>
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700">
                      {u.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <span className="font-medium">{u.name}</span>
                    {u.role === 'OWNER' && <Crown size={12} className="text-amber-500" />}
                  </div>
                </td>
                <td className="table-cell text-gray-500 font-mono text-xs">{u.email}</td>
                <td className="table-cell">
                  {u.role === 'OWNER' ? (
                    <span className="badge badge-red">Owner</span>
                  ) : (
                    <select
                      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      value={u.role}
                      onChange={e => updateRole(u.id, e.target.value)}
                      disabled={!u.isActive}
                    >
                      {ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="table-cell text-gray-500 text-xs">
                  {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never logged in'}
                </td>
                <td className="table-cell">
                  {u.isActive
                    ? <span className="badge badge-green">Active</span>
                    : <span className="badge badge-gray">Deactivated</span>
                  }
                </td>
                <td className="table-cell">
                  {u.role !== 'OWNER' && (
                    u.isActive ? (
                      <button
                        onClick={() => deactivate(u.id, u.name)}
                        className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                      >
                        <Trash2 size={12} />
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => reactivate(u.id)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Reactivate
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
