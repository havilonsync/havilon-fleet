'use client'

import { useState, useEffect } from 'react'
import { format, addDays, differenceInDays, differenceInHours } from 'date-fns'
import { Calendar, AlertTriangle, CheckCircle, Clock, Plus, X, FileText } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = {
  VACATION:          '🏖️  Vacation',
  PERSONAL:          '👤  Personal Day',
  MEDICAL_EMERGENCY: '🏥  Medical Emergency',
  BEREAVEMENT:       '🕊️  Bereavement',
  OTHER:             '📋  Other',
}

const STATUS_STYLES: Record<string, string> = {
  PENDING:                   'badge-amber',
  APPROVED:                  'badge-green',
  DENIED:                    'badge-red',
  CANCELLED:                 'badge-gray',
  PENDING_MEDICAL_CLEARANCE: 'badge-amber',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING:                   'Pending Review',
  APPROVED:                  'Approved',
  DENIED:                    'Denied',
  CANCELLED:                 'Cancelled',
  PENDING_MEDICAL_CLEARANCE: 'Approved — Dr Note Required',
}

export default function TimeOffPage() {
  const [requests, setRequests]     = useState<any[]>([])
  const [showForm, setShowForm]     = useState(false)
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]         = useState<any>(null)
  const [daList, setDaList]         = useState<any[]>([])
  const [isManager, setIsManager]   = useState(false)

  const [form, setForm] = useState({
    daId:        '',
    type:        'VACATION',
    startDate:   format(addDays(new Date(), 8), 'yyyy-MM-dd'),
    endDate:     format(addDays(new Date(), 8), 'yyyy-MM-dd'),
    reason:      '',
    isEmergency: false,
  })

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const load = async () => {
    setLoading(true)
    const [reqRes, meRes] = await Promise.all([
      fetch('/api/timeoff'),
      fetch('/api/auth/session'),
    ])
    if (reqRes.ok) setRequests(await reqRes.json().then(d => d.requests ?? []))
    if (meRes.ok) {
      const me = await meRes.json()
      const managerRoles = ['OWNER', 'OPS_MANAGER']
      setIsManager(managerRoles.includes(me?.user?.role))
      if (managerRoles.includes(me?.user?.role)) {
        const daRes = await fetch('/api/da?status=ACTIVE')
        if (daRes.ok) setDaList(await daRes.json().then(d => d.das ?? []))
      }
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setResult(null)

    const res = await fetch('/api/timeoff', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    })

    const data = await res.json()

    if (res.ok) {
      setResult({ success: true, ...data })
      setShowForm(false)
      load()
    } else {
      setResult({ success: false, ...data })
    }
    setSubmitting(false)
  }

  const approve = async (id: string) => {
    await fetch(`/api/timeoff/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'approve' }),
    })
    load()
  }

  const deny = async (id: string, notes: string) => {
    await fetch(`/api/timeoff/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'deny', reviewNotes: notes }),
    })
    load()
  }

  const drNoteReceived = async (id: string) => {
    await fetch(`/api/timeoff/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'dr_note_received' }),
    })
    load()
  }

  const pending       = requests.filter(r => r.status === 'PENDING')
  const drNotePending = requests.filter(r => r.status === 'PENDING_MEDICAL_CLEARANCE' && !r.drNoteReceived)
  const upcoming      = requests.filter(r => r.status === 'APPROVED' && new Date(r.startDate) >= new Date())

  const startDate = new Date(form.startDate + 'T12:00:00')
  const hoursUntil = differenceInHours(startDate, new Date())
  const daysUntil  = differenceInDays(startDate, new Date())

  const policyWarning = !form.isEmergency && form.type !== 'MEDICAL_EMERGENCY' && daysUntil < 7
  const tooLate       = !form.isEmergency && form.type !== 'MEDICAL_EMERGENCY' && hoursUntil < 48

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Calendar size={20} className="text-blue-600" />
            Time Off Requests
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Submit and track time off requests
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={15} /> Request Time Off
        </button>
      </div>

      {/* Policy reminder */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm font-medium text-blue-800 mb-2">📋 Time Off Policy</p>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Standard requests must be submitted <strong>at least 7 days in advance</strong></li>
          <li>• All requests must be submitted <strong>no later than 48 hours</strong> before the start date</li>
          <li>• Emergency requests bypass advance notice but require management approval</li>
          <li>• <strong>Medical emergencies require a physician's Return to Work clearance note</strong> before returning to active duty</li>
          <li>• The Dr's note only needs to confirm you are cleared — it does not need to reveal your diagnosis or condition</li>
        </ul>
      </div>

      {/* Dr note alerts */}
      {drNotePending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="font-medium text-amber-800 mb-2 flex items-center gap-2">
            <AlertTriangle size={16} /> {drNotePending.length} DA(s) need Dr's note before returning
          </p>
          <div className="space-y-2">
            {drNotePending.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-200">
                <div>
                  <p className="font-medium text-sm">{r.da?.name}</p>
                  <p className="text-xs text-gray-500">
                    Returns: {format(new Date(r.endDate), 'MMM d, yyyy')} · Request: {r.requestNumber}
                  </p>
                </div>
                {isManager && (
                  <button onClick={() => drNoteReceived(r.id)} className="btn-primary text-xs">
                    <FileText size={12} /> Mark Dr Note Received
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending approvals (manager view) */}
      {isManager && pending.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="section-title">Pending Approvals ({pending.length})</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {pending.map(r => (
              <div key={r.id} className={`p-4 ${r.isEmergency ? 'bg-red-50' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {r.isEmergency && <span className="badge badge-red">🚨 Emergency</span>}
                      <span className="font-medium text-gray-900">{r.da?.name}</span>
                      <span className="badge badge-gray">{TYPE_LABELS[r.type]}</span>
                      <span className="text-xs text-gray-500">{r.requestNumber}</span>
                    </div>
                    <p className="text-sm text-gray-700">
                      {format(new Date(r.startDate), 'MMM d')} — {format(new Date(r.endDate), 'MMM d, yyyy')}
                      <span className="text-gray-400 ml-2">({r.totalDays} day{r.totalDays > 1 ? 's' : ''})</span>
                    </p>
                    {r.reason && <p className="text-xs text-gray-500 mt-1">Reason: {r.reason}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      Submitted: {format(new Date(r.submittedAt), 'MMM d, yyyy h:mm a')}
                    </p>
                    {r.type === 'MEDICAL_EMERGENCY' && (
                      <p className="text-xs text-amber-700 mt-1 font-medium">
                        ⚕️ Medical emergency — Dr's return-to-work note will be required
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => deny(r.id, '')} className="btn-danger text-xs">Deny</button>
                    <button onClick={() => approve(r.id)} className="btn-primary text-xs">Approve</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result message */}
      {result && (
        <div className={`rounded-xl p-4 border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`font-medium text-sm ${result.success ? 'text-green-800' : 'text-red-800'}`}>
            {result.success ? `✅ ${result.message}` : `❌ ${result.error}`}
          </p>
          {result.success && result.drNoteRequired && (
            <div className="mt-3 bg-white rounded-lg p-4 border border-amber-200">
              <p className="font-medium text-amber-800 mb-2">⚕️ Important — Return to Work Requirements</p>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                {result.drNoteMessage}
              </pre>
            </div>
          )}
          {!result.success && result.canSubmitAsEmergency && (
            <button
              onClick={() => { set('isEmergency', true); setShowForm(true); setResult(null) }}
              className="btn-secondary text-xs mt-2"
            >
              Submit as Emergency Request instead
            </button>
          )}
        </div>
      )}

      {/* Request form */}
      {showForm && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-gray-900">New Time Off Request</h2>
            <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
          </div>

          <form onSubmit={submit} className="space-y-5">
            {/* DA selector (manager only) */}
            {isManager && (
              <div>
                <label className="label">Delivery Associate *</label>
                <select className="select" value={form.daId} onChange={e => set('daId', e.target.value)} required>
                  <option value="">Select DA…</option>
                  {daList.map(da => (
                    <option key={da.id} value={da.id}>{da.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Request Type *</label>
                <select className="select" value={form.type}
                  onChange={e => {
                    set('type', e.target.value)
                    if (e.target.value === 'MEDICAL_EMERGENCY') set('isEmergency', true)
                  }}
                  required>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.isEmergency}
                    onChange={e => set('isEmergency', e.target.checked)} />
                  <span className="font-medium text-red-700">This is an emergency request</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Start Date *</label>
                <input type="date" className="input" value={form.startDate}
                  onChange={e => set('startDate', e.target.value)} required />
              </div>
              <div>
                <label className="label">End Date *</label>
                <input type="date" className="input" value={form.endDate}
                  min={form.startDate}
                  onChange={e => set('endDate', e.target.value)} required />
              </div>
            </div>

            {/* Policy warnings */}
            {tooLate && !form.isEmergency && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Too late for standard request</p>
                  <p className="text-xs text-red-700 mt-0.5">
                    Your start date is only {hoursUntil} hours away. Standard requests require 48+ hours notice.
                    Check the emergency box if this is an urgent situation.
                  </p>
                </div>
              </div>
            )}

            {policyWarning && !tooLate && !form.isEmergency && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <Clock size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  This request is {daysUntil} days before your start date. We recommend requesting at least 7 days ahead.
                  It will still be submitted but may be harder to approve on short notice.
                </p>
              </div>
            )}

            {form.type === 'MEDICAL_EMERGENCY' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-800 mb-2">⚕️ Medical Emergency Policy</p>
                <p className="text-sm text-blue-700">
                  A physician's <strong>Return to Work clearance note</strong> is required before you can return to active duty.
                  Your doctor only needs to confirm you are cleared — they do not need to reveal your diagnosis or any personal medical details.
                  This complies with HIPAA privacy regulations.
                </p>
                <p className="text-sm text-blue-700 mt-2">
                  Your physician can contact your manager if they need a copy of your job duties to make their clearance decision.
                </p>
              </div>
            )}

            <div>
              <label className="label">Reason / Notes {form.type === 'MEDICAL_EMERGENCY' ? '' : '(optional)'}</label>
              <textarea className="input min-h-[70px] resize-none w-full"
                value={form.reason}
                onChange={e => set('reason', e.target.value)}
                placeholder={form.type === 'MEDICAL_EMERGENCY' ? 'Brief description of the situation (optional — you do not need to share medical details)' : 'Any additional context for your manager…'} />
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={submitting || (tooLate && !form.isEmergency)} className="btn-primary">
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* All requests table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="section-title">
            {isManager ? 'All Time Off Requests' : 'My Requests'}
          </h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : requests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {[
                    isManager ? 'DA' : null,
                    'Request #', 'Type', 'Dates', 'Days',
                    'Status', 'Dr Note', 'Submitted'
                  ].filter(Boolean).map(h => (
                    <th key={h!} className="table-header text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    {isManager && <td className="table-cell font-medium">{r.da?.name}</td>}
                    <td className="table-cell font-mono text-xs">{r.requestNumber}</td>
                    <td className="table-cell">
                      <span className="text-sm">{TYPE_LABELS[r.type]}</span>
                      {r.isEmergency && <span className="badge badge-red ml-1 text-xs">Emergency</span>}
                    </td>
                    <td className="table-cell text-sm">
                      {format(new Date(r.startDate), 'MMM d')} — {format(new Date(r.endDate), 'MMM d, yyyy')}
                    </td>
                    <td className="table-cell text-center">{r.totalDays}</td>
                    <td className="table-cell">
                      <span className={`badge ${STATUS_STYLES[r.status] ?? 'badge-gray'}`}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="table-cell">
                      {r.requiresDrNote ? (
                        r.drNoteReceived
                          ? <span className="badge badge-green text-xs">✓ Received</span>
                          : <span className="badge badge-amber text-xs">Required</span>
                      ) : (
                        <span className="text-gray-300 text-xs">N/A</span>
                      )}
                    </td>
                    <td className="table-cell text-xs text-gray-500">
                      {format(new Date(r.submittedAt), 'MMM d, yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-gray-400">
            No time off requests yet
          </div>
        )}
      </div>
    </div>
  )
}
