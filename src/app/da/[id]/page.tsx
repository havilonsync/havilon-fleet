'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  User, Phone, Shield, Package, AlertTriangle, Star,
  ChevronLeft, Save, Truck, FileText, TrendingUp,
  TrendingDown, Minus, AlertCircle, CheckCircle,
  ClipboardList, Edit3, X, Plus, Calendar
} from 'lucide-react'
import { format } from 'date-fns'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const STANDING_COLORS: Record<string, string> = {
  FANTASTIC_PLUS: 'badge-green', FANTASTIC: 'badge-green',
  GREAT: 'badge-blue', GOOD: 'badge-blue',
  FAIR: 'badge-amber', POOR: 'badge-red',
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'badge-green', INACTIVE: 'badge-blue',
  ON_LEAVE: 'badge-amber', TERMINATED: 'badge-red',
}

const DISCIPLINE_COLORS: Record<string, string> = {
  VERBAL_WARNING: 'badge-blue', WRITTEN_WARNING: 'badge-amber',
  FINAL_WARNING: 'badge-red', TERMINATION: 'badge-red',
}

function Field({ label, value, editing, onChange, type = 'text' }: {
  label: string; value?: string | null; editing: boolean
  onChange?: (v: string) => void; type?: string
}) {
  return (
    <div>
      <p className="label">{label}</p>
      {editing && onChange
        ? <input type={type} className="input" value={value ?? ''} onChange={e => onChange(e.target.value)} />
        : <p className="text-sm text-gray-900">{value || <span className="text-gray-300">—</span>}</p>
      }
    </div>
  )
}

export default function DAProfilePage() {
  const params = useParams()
  const router = useRouter()
  const [da, setDa] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [showAddDisc, setShowAddDisc] = useState(false)
  const [disc, setDisc] = useState({
    type: 'VERBAL_WARNING', description: '', issuedBy: '',
    date: format(new Date(), 'yyyy-MM-dd')
  })
  const [showAddScore, setShowAddScore] = useState(false)
  const [scoreForm, setScoreForm] = useState({
    week: (() => {
      const d = new Date()
      const jan1 = new Date(d.getFullYear(), 0, 1)
      const w = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
      return `${d.getFullYear()}-W${String(w).padStart(2, '0')}`
    })(),
    standing: 'GREAT', deliveryScore: '', qualityScore: '', safetyScore: '', dnrRate: '', dsbRate: '',
  })

  const reload = () =>
    fetch(`/api/da/${params.id}`).then(r => r.json()).then(d => {
      setDa(d.da); setForm(d.da); setLoading(false)
    })

  useEffect(() => { reload() }, [params.id])

  const save = async () => {
    setSaving(true)
    const res = await fetch(`/api/da/${params.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setDa(data.da); setForm(data.da); setEditing(false); setSaving(false)
  }

  const addDiscipline = async () => {
    await fetch(`/api/da/${params.id}/discipline`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(disc),
    })
    setShowAddDisc(false)
    setDisc({ type: 'VERBAL_WARNING', description: '', issuedBy: '', date: format(new Date(), 'yyyy-MM-dd') })
    reload()
  }

  const set = (key: string, val: any) => setForm((f: any) => ({ ...f, [key]: val }))

  const addScorecard = async () => {
    await fetch(`/api/da/${params.id}/scorecard`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        week:          scoreForm.week,
        standing:      scoreForm.standing,
        deliveryScore: Number(scoreForm.deliveryScore),
        qualityScore:  Number(scoreForm.qualityScore),
        safetyScore:   Number(scoreForm.safetyScore),
        dnrRate:       Number(scoreForm.dnrRate),
        dsbRate:       Number(scoreForm.dsbRate),
      }),
    })
    setShowAddScore(false)
    reload()
  }

  const toggleOffDay = (day: string) => {
    const days = form.offDays ?? []
    set('offDays', days.includes(day) ? days.filter((d: string) => d !== day) : [...days, day])
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading profile…</div>
  if (!da) return <div className="p-8 text-sm text-gray-400">DA not found</div>

  const daysUntilDL = da.dlExpiry
    ? Math.ceil((new Date(da.dlExpiry).getTime() - Date.now()) / 86400000)
    : null

  const latestScore = da.scorecards?.[0]
  const openIncidents = (da.incidents ?? []).filter((i: any) => i.status === 'OPEN')
  const openAlerts = (da.alerts ?? []).filter((a: any) => !a.isResolved)
  const discCount = da.disciplineLog?.length ?? 0
  const incCount = da.incidents?.length ?? 0

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.back()} className="btn-secondary text-xs mt-1">
          <ChevronLeft size={14} /> Back
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold text-blue-700">
                {da.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
              </span>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{da.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`badge ${STATUS_COLORS[da.status] ?? 'badge-gray'}`}>
                  {da.status === 'INACTIVE' ? 'Onboarding' : da.status.toLowerCase().replace('_', ' ')}
                </span>
                {da.badgeId && <span className="badge badge-gray">Badge: {da.badgeId}</span>}
                {da.adpId && <span className="badge badge-gray">ADP: {da.adpId}</span>}
                {da.hireDate && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Calendar size={11} /> Hired {new Date(da.hireDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick metrics */}
        <div className="flex gap-2">
          {latestScore && (
            <div className="text-center bg-white border border-gray-200 rounded-xl px-3 py-2 min-w-[80px]">
              <p className="text-xs text-gray-400">Score</p>
              <p className={`text-2xl font-bold ${latestScore.deliveryScore >= 90 ? 'text-green-600' : latestScore.deliveryScore >= 75 ? 'text-amber-600' : 'text-red-600'}`}>
                {latestScore.deliveryScore.toFixed(0)}
              </p>
              <span className={`badge text-xs ${STANDING_COLORS[latestScore.standing] ?? 'badge-gray'}`}>
                {latestScore.standing.replace('_PLUS', '+').replace('_', ' ')}
              </span>
            </div>
          )}
          {openAlerts.length > 0 && (
            <div className="text-center bg-red-50 border border-red-200 rounded-xl px-3 py-2 min-w-[70px]">
              <p className="text-xs text-gray-400">Alerts</p>
              <p className="text-2xl font-bold text-red-600">{openAlerts.length}</p>
            </div>
          )}
          {openIncidents.length > 0 && (
            <div className="text-center bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 min-w-[70px]">
              <p className="text-xs text-gray-400">Incidents</p>
              <p className="text-2xl font-bold text-amber-600">{openIncidents.length}</p>
            </div>
          )}
          {discCount > 0 && (
            <div className="text-center bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 min-w-[70px]">
              <p className="text-xs text-gray-400">Discipline</p>
              <p className="text-2xl font-bold text-orange-600">{discCount}</p>
            </div>
          )}
        </div>

        {/* Edit controls */}
        {editing ? (
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setForm(da) }} className="btn-secondary text-sm">
              <X size={13} /> Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn-primary text-sm">
              <Save size={13} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="btn-secondary text-sm">
            <Edit3 size={13} /> Edit Profile
          </button>
        )}
      </div>

      {/* DL Warning Banner */}
      {daysUntilDL !== null && daysUntilDL < 90 && da.status === 'ACTIVE' && (
        <div className={`rounded-xl p-3 flex items-center gap-3 border ${daysUntilDL < 30 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <AlertTriangle size={16} className={daysUntilDL < 30 ? 'text-red-500' : 'text-amber-500'} />
          <p className={`text-sm font-medium ${daysUntilDL < 30 ? 'text-red-800' : 'text-amber-800'}`}>
            {daysUntilDL < 0
              ? `Driver license EXPIRED ${Math.abs(daysUntilDL)} days ago — do not dispatch this DA`
              : `Driver license expires in ${daysUntilDL} days (${new Date(da.dlExpiry).toLocaleDateString()}) — renew before expiry`
            }
          </p>
        </div>
      )}

      {/* Terminated banner with equipment checklist */}
      {da.status === 'TERMINATED' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="font-medium text-red-800 mb-3">⚠️ Terminated — Equipment Return Status</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'phoneAssigned', label: 'Phone', outstanding: da.phoneAssigned },
              { key: 'uniformVest',   label: 'Vest',  outstanding: da.uniformVest },
              { key: 'uniformPants',  label: 'Pants', outstanding: da.uniformPants },
              { key: 'uniformShorts', label: 'Shorts',outstanding: da.uniformShorts },
            ].map(item => (
              <div key={item.key} className={`flex items-center gap-2 p-2.5 rounded-lg border ${item.outstanding ? 'bg-red-100 border-red-300' : 'bg-green-50 border-green-200'}`}>
                {item.outstanding
                  ? <AlertCircle size={14} className="text-red-600 flex-shrink-0" />
                  : <CheckCircle size={14} className="text-green-600 flex-shrink-0" />
                }
                <span className="text-sm font-medium">
                  {item.outstanding ? `${item.label} — NOT RETURNED` : `${item.label} returned ✓`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {[
          { id: 'overview',    label: 'Overview',                                                 icon: User },
          { id: 'performance', label: 'Performance',                                              icon: Star },
          { id: 'incidents',   label: `Incidents${incCount > 0 ? ` (${incCount})` : ''}`,         icon: AlertCircle },
          { id: 'discipline',  label: `Discipline${discCount > 0 ? ` (${discCount})` : ''}`,      icon: ClipboardList },
          { id: 'equipment',   label: 'Equipment & Uniform',                                       icon: Package },
          { id: 'routes',      label: 'Route History',                                             icon: Truck },
        ].map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={13} /> {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-5">
          <div className="card p-5 space-y-3">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <Phone size={14} className="text-blue-600" /> Contact Info
            </h3>
            <Field label="Email"  value={form.email}  editing={editing} onChange={v => set('email', v)} />
            <Field label="Phone"  value={form.phone}  editing={editing} onChange={v => set('phone', v)} />
            <Field label="Zip Code" value={form.zipCode} editing={editing} onChange={v => set('zipCode', v)} />
            <Field label="Gas PIN"  value={form.gasPin}  editing={editing} onChange={v => set('gasPin', v)} />
            <hr className="border-gray-100" />
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Emergency Contact</p>
            <Field label="Name"  value={form.emergencyName}  editing={editing} onChange={v => set('emergencyName', v)} />
            <Field label="Phone" value={form.emergencyPhone} editing={editing} onChange={v => set('emergencyPhone', v)} />
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <Shield size={14} className="text-blue-600" /> Amazon & System IDs
            </h3>
            <Field label="Transponder ID" value={form.transponderId} editing={editing} onChange={v => set('transponderId', v)} />
            <Field label="Badge ID"       value={form.badgeId}       editing={editing} onChange={v => set('badgeId', v)} />
            <Field label="ADP ID"         value={form.adpId}         editing={editing} onChange={v => set('adpId', v)} />
            <Field label="Voxer ID"       value={form.voxerId}       editing={editing} onChange={v => set('voxerId', v)} />
            <Field label="Pickup Route"   value={form.amazonRouteId} editing={editing} onChange={v => set('amazonRouteId', v)} />
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <FileText size={14} className="text-blue-600" /> Driver License
            </h3>
            <Field label="DL Number" value={form.driverLicense} editing={editing} onChange={v => set('driverLicense', v)} />
            <div>
              <p className="label">Expiry Date</p>
              {editing
                ? <input type="date" className="input"
                    value={form.dlExpiry ? new Date(form.dlExpiry).toISOString().slice(0,10) : ''}
                    onChange={e => set('dlExpiry', e.target.value)} />
                : <p className={`text-sm font-medium ${daysUntilDL !== null && daysUntilDL < 30 ? 'text-red-600' : daysUntilDL !== null && daysUntilDL < 90 ? 'text-amber-600' : 'text-gray-900'}`}>
                    {da.dlExpiry ? new Date(da.dlExpiry).toLocaleDateString() : '—'}
                    {daysUntilDL !== null && daysUntilDL > 0 && (
                      <span className="text-xs text-gray-400 ml-2">({daysUntilDL} days remaining)</span>
                    )}
                  </p>
              }
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-medium text-gray-900">Scheduled Off Days</h3>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map(day => {
                const isOff = (form.offDays ?? []).includes(day)
                return (
                  <button key={day} disabled={!editing} onClick={() => toggleOffDay(day)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      isOff ? 'bg-red-100 text-red-700 border-red-200' : 'bg-gray-50 text-gray-600 border-gray-200'
                    } ${editing ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}>
                    {day}{isOff ? ' ✗' : ''}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-gray-400">Red = scheduled off, will be flagged on dispatch board</p>
          </div>

          <div className="card p-5 col-span-2">
            <h3 className="font-medium text-gray-900 mb-3">Internal Notes</h3>
            {editing
              ? <textarea className="input w-full min-h-[80px] resize-none" value={form.notes ?? ''}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="Internal notes — visible to management only…" />
              : <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {da.notes || <span className="text-gray-300">No notes on file</span>}
                </p>
            }
          </div>
        </div>
      )}

      {/* ── PERFORMANCE ── */}
      {activeTab === 'performance' && (
        <div className="space-y-5">

          {/* Manual entry */}
          <div className="flex justify-end">
            <button onClick={() => setShowAddScore(s => !s)} className="btn-secondary text-sm">
              {showAddScore ? 'Cancel' : '+ Add Scorecard Week'}
            </button>
          </div>

          {showAddScore && (
            <div className="card p-5 space-y-4">
              <h3 className="font-medium text-gray-900">Add / Update Scorecard</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Week (YYYY-Wnn)</label>
                  <input className="input font-mono" placeholder="e.g. 2025-W20"
                    value={scoreForm.week} onChange={e => setScoreForm(f => ({ ...f, week: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Standing</label>
                  <select className="select" value={scoreForm.standing}
                    onChange={e => setScoreForm(f => ({ ...f, standing: e.target.value }))}>
                    <option value="FANTASTIC_PLUS">Fantastic+</option>
                    <option value="FANTASTIC">Fantastic</option>
                    <option value="GREAT">Great</option>
                    <option value="GOOD">Good</option>
                    <option value="FAIR">Fair</option>
                    <option value="POOR">Poor</option>
                  </select>
                </div>
                <div>
                  <label className="label">DCR % (Delivery)</label>
                  <input type="number" className="input" min="0" max="100" placeholder="e.g. 96"
                    value={scoreForm.deliveryScore} onChange={e => setScoreForm(f => ({ ...f, deliveryScore: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Quality Score</label>
                  <input type="number" className="input" min="0" max="100" placeholder="e.g. 95"
                    value={scoreForm.qualityScore} onChange={e => setScoreForm(f => ({ ...f, qualityScore: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Safety Score</label>
                  <input type="number" className="input" min="0" max="100" placeholder="e.g. 98"
                    value={scoreForm.safetyScore} onChange={e => setScoreForm(f => ({ ...f, safetyScore: e.target.value }))} />
                </div>
                <div>
                  <label className="label">DNR DPMO</label>
                  <input type="number" className="input" min="0" placeholder="e.g. 2.4"
                    value={scoreForm.dnrRate} onChange={e => setScoreForm(f => ({ ...f, dnrRate: e.target.value }))} />
                </div>
                <div>
                  <label className="label">DSB DPMO</label>
                  <input type="number" className="input" min="0" max="100" placeholder="e.g. 94"
                    value={scoreForm.dsbRate} onChange={e => setScoreForm(f => ({ ...f, dsbRate: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={addScorecard}
                  disabled={!scoreForm.week || !scoreForm.deliveryScore}
                  className="btn-primary text-sm">
                  Save Scorecard
                </button>
                <button onClick={() => setShowAddScore(false)} className="btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          )}

          {da.scorecards?.length > 0 ? (
            <>
              {/* Averages */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { key: 'deliveryScore', label: 'Delivery (avg)' },
                  { key: 'qualityScore',  label: 'Quality (avg)' },
                  { key: 'safetyScore',   label: 'Safety (avg)' },
                ].map(m => {
                  const avg = da.scorecards.reduce((s: number, c: any) => s + (c[m.key] ?? 0), 0) / da.scorecards.length
                  return (
                    <div key={m.key} className="stat-card text-center">
                      <p className="text-xs text-gray-500 mb-2">{m.label}</p>
                      <p className={`text-3xl font-bold ${avg >= 90 ? 'text-green-600' : avg >= 75 ? 'text-amber-600' : 'text-red-600'}`}>
                        {avg.toFixed(0)}
                      </p>
                      <div className="risk-bar mt-2 mx-auto max-w-[80px]">
                        <div className={`risk-fill ${avg >= 90 ? 'risk-fill-low' : avg >= 75 ? 'risk-fill-medium' : 'risk-fill-high'}`}
                          style={{ width: `${avg}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Scorecard history table */}
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr>
                      {['Week','Standing','DCR %','Quality','Safety','DNR DPMO','DSB DPMO','Trend'].map(h => (
                        <th key={h} className="table-header text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {da.scorecards.map((sc: any, i: number) => {
                      const prev = da.scorecards[i + 1]
                      const delta = prev ? sc.deliveryScore - prev.deliveryScore : null
                      return (
                        <tr key={sc.id} className="hover:bg-gray-50">
                          <td className="table-cell font-mono text-xs">{sc.week}</td>
                          <td className="table-cell">
                            <span className={`badge ${STANDING_COLORS[sc.standing] ?? 'badge-gray'}`}>
                              {sc.standing.replace('_PLUS','+').replace('_',' ')}
                            </span>
                          </td>
                          <td className="table-cell font-medium">{sc.deliveryScore.toFixed(0)}</td>
                          <td className="table-cell">{sc.qualityScore.toFixed(0)}</td>
                          <td className="table-cell">{sc.safetyScore.toFixed(0)}</td>
                          <td className="table-cell">{sc.dnrRate.toFixed(1)}%</td>
                          <td className="table-cell">{sc.dsbRate.toFixed(1)}%</td>
                          <td className="table-cell">
                            {delta === null ? '—'
                              : delta > 0 ? <span className="text-green-600 flex items-center gap-1 text-xs"><TrendingUp size={11} />+{delta.toFixed(0)}</span>
                              : delta < 0 ? <span className="text-red-600 flex items-center gap-1 text-xs"><TrendingDown size={11} />{delta.toFixed(0)}</span>
                              : <span className="text-gray-400 flex items-center gap-1 text-xs"><Minus size={11} />0</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="card p-12 text-center text-sm text-gray-400">
              No scorecard data yet — sync from Amazon to populate performance history
            </div>
          )}

          {/* Active performance flags */}
          {openAlerts.filter((a: any) => a.type.includes('PERFORMANCE') || a.type.includes('SAFETY')).length > 0 && (
            <div className="card p-4">
              <h3 className="section-title mb-3">Active Performance Flags</h3>
              <div className="space-y-2">
                {openAlerts.map((alert: any) => (
                  <div key={alert.id} className={`p-3 rounded-lg border-l-4 ${alert.severity === 'CRITICAL' ? 'bg-red-50 border-l-red-500' : 'bg-amber-50 border-l-amber-400'}`}>
                    <p className="text-sm font-medium">{alert.type.replace(/_/g,' ')}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{alert.details}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Week: {alert.week}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── INCIDENTS ── */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">All accidents, vehicle damage, and workers comp claims involving this DA</p>
          {da.incidents?.length > 0 ? (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr>
                    {['Date','Type','Vehicle','Description','Police Report','Insurance Claim','Status'].map(h => (
                      <th key={h} className="table-header text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {da.incidents.map((inc: any) => (
                    <tr key={inc.id} className="hover:bg-gray-50">
                      <td className="table-cell text-sm font-medium">
                        {new Date(inc.date).toLocaleDateString()}
                      </td>
                      <td className="table-cell">
                        <span className={`badge ${inc.type === 'AUTO_COLLISION' ? 'badge-red' : inc.type === 'WORKERS_COMP' ? 'badge-amber' : 'badge-gray'}`}>
                          {inc.type.replace(/_/g,' ')}
                        </span>
                      </td>
                      <td className="table-cell text-sm">{inc.vehicleId ?? '—'}</td>
                      <td className="table-cell text-sm max-w-[200px]">
                        <p className="truncate" title={inc.description}>{inc.description}</p>
                      </td>
                      <td className="table-cell text-xs">{inc.policeReport ?? '—'}</td>
                      <td className="table-cell text-xs">{inc.insuranceClaim ?? '—'}</td>
                      <td className="table-cell">
                        <span className={`badge ${inc.status === 'OPEN' ? 'badge-red' : 'badge-green'}`}>
                          {inc.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card p-12 text-center">
              <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
              <p className="font-medium text-gray-900">No incidents on record</p>
              <p className="text-sm text-gray-500 mt-1">Clean record for this DA</p>
            </div>
          )}
        </div>
      )}

      {/* ── DISCIPLINE ── */}
      {activeTab === 'discipline' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Verbal warnings, written warnings, and formal disciplinary actions</p>
            <button onClick={() => setShowAddDisc(true)} className="btn-primary text-sm">
              <Plus size={13} /> Add Record
            </button>
          </div>

          {showAddDisc && (
            <div className="card p-5 border-blue-200 bg-blue-50 space-y-4">
              <h3 className="font-medium text-gray-900">New Discipline Record</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Type</label>
                  <select className="select" value={disc.type}
                    onChange={e => setDisc(d => ({ ...d, type: e.target.value }))}>
                    <option value="VERBAL_WARNING">Verbal Warning</option>
                    <option value="WRITTEN_WARNING">Written Warning</option>
                    <option value="FINAL_WARNING">Final Warning</option>
                    <option value="TERMINATION">Termination</option>
                  </select>
                </div>
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" value={disc.date}
                    onChange={e => setDisc(d => ({ ...d, date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Issued By</label>
                  <input className="input" placeholder="Manager name" value={disc.issuedBy}
                    onChange={e => setDisc(d => ({ ...d, issuedBy: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Reason / Description</label>
                  <input className="input" placeholder="Reason for disciplinary action"
                    value={disc.description}
                    onChange={e => setDisc(d => ({ ...d, description: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addDiscipline} className="btn-primary text-sm">Save Record</button>
                <button onClick={() => setShowAddDisc(false)} className="btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          )}

          {da.disciplineLog?.length > 0 ? (
            <div className="space-y-3">
              {da.disciplineLog.map((d: any) => (
                <div key={d.id} className={`card p-4 border-l-4 ${
                  d.type === 'TERMINATION' || d.type === 'FINAL_WARNING' ? 'border-l-red-500' :
                  d.type === 'WRITTEN_WARNING' ? 'border-l-amber-400' : 'border-l-blue-400'
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`badge ${DISCIPLINE_COLORS[d.type] ?? 'badge-gray'}`}>
                          {d.type.replace(/_/g,' ')}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(d.date).toLocaleDateString()} · Issued by {d.issuedBy}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{d.description}</p>
                    </div>
                    {d.documentUrl && (
                      <a href={d.documentUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline ml-4 flex-shrink-0">
                        View Doc →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-12 text-center">
              <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
              <p className="font-medium text-gray-900">No discipline records</p>
              <p className="text-sm text-gray-500 mt-1">Clean record for this DA</p>
            </div>
          )}
        </div>
      )}

      {/* ── EQUIPMENT ── */}
      {activeTab === 'equipment' && (
        <div className="grid grid-cols-2 gap-5">
          <div className="card p-5 space-y-4">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <Package size={14} className="text-blue-600" /> Phone Assignment
            </h3>
            <div>
              <p className="label">Phone Assigned</p>
              {editing ? (
                <div className="flex gap-4">
                  {[true, false].map(v => (
                    <label key={String(v)} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" checked={form.phoneAssigned === v}
                        onChange={() => set('phoneAssigned', v)} />
                      {v ? 'Yes — assigned' : 'No'}
                    </label>
                  ))}
                </div>
              ) : (
                <span className={`badge ${da.phoneAssigned ? 'badge-green' : 'badge-red'}`}>
                  {da.phoneAssigned ? '✓ Phone assigned' : '✗ No phone assigned'}
                </span>
              )}
            </div>
            <Field label="Phone IMEI" value={form.phoneImei} editing={editing}
              onChange={v => set('phoneImei', v)} />
            <p className="text-xs text-gray-400">IMEI is logged daily with route assignments for accountability</p>
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="font-medium text-gray-900">Uniform</h3>
            <Field label="Shirt Size" value={form.uniformShirtSize} editing={editing}
              onChange={v => set('uniformShirtSize', v)} />
            <div>
              <p className="label">Items Issued</p>
              <div className="flex gap-2 flex-wrap mt-1">
                {[
                  { key: 'uniformPants',  label: 'Pants' },
                  { key: 'uniformShorts', label: 'Shorts' },
                  { key: 'uniformVest',   label: 'Vest' },
                ].map(item => (
                  <label key={item.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                      form[item.key] ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'
                    } ${editing ? 'cursor-pointer' : 'cursor-default'}`}>
                    <input type="checkbox" checked={!!form[item.key]} disabled={!editing}
                      onChange={e => set(item.key, e.target.checked)} />
                    {item.label} {form[item.key] ? '✓' : ''}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="label">Health Insurance</p>
              {editing ? (
                <div className="flex gap-4">
                  {[true, false].map(v => (
                    <label key={String(v)} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" checked={form.hasHealthInsurance === v}
                        onChange={() => set('hasHealthInsurance', v)} />
                      {v ? 'Enrolled' : 'Not enrolled'}
                    </label>
                  ))}
                </div>
              ) : (
                <span className={`badge ${da.hasHealthInsurance ? 'badge-green' : 'badge-gray'}`}>
                  {da.hasHealthInsurance ? 'Enrolled' : 'Not enrolled'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ROUTE HISTORY ── */}
      {activeTab === 'routes' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Complete route history for {da.name} — stored permanently, no 6-month limit
          </p>
          {da.routeAssignments?.length > 0 ? (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr>
                    {['Date','Route Code','Type','Unit #','Stops','Packages','Departure','Status'].map(h => (
                      <th key={h} className="table-header text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {da.routeAssignments.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="table-cell">
                        <p className="font-medium text-sm">{format(new Date(r.date + 'T12:00:00'), 'MMM d, yyyy')}</p>
                        <p className="text-xs text-gray-400">{format(new Date(r.date + 'T12:00:00'), 'EEEE')}</p>
                      </td>
                      <td className="table-cell font-mono text-xs">{r.routeCode}</td>
                      <td className="table-cell">
                        <span className={`badge ${r.routeType === 'SURGE' ? 'badge-amber' : r.routeType === 'RESCUE' ? 'badge-red' : 'badge-gray'}`}>
                          {r.routeType.toLowerCase()}
                        </span>
                      </td>
                      <td className="table-cell">{r.vehicle?.vehicleNumber ?? '—'}</td>
                      <td className="table-cell">{r.stopCount ?? '—'}</td>
                      <td className="table-cell">{r.packageVolume ?? '—'}</td>
                      <td className="table-cell text-xs">{r.departureTime ?? '—'}</td>
                      <td className="table-cell">
                        <span className={`badge ${r.status === 'COMPLETED' ? 'badge-green' : 'badge-blue'}`}>
                          {r.status.toLowerCase().replace('_',' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card p-12 text-center text-sm text-gray-400">
              No route history yet — routes will appear here once dispatched through the portal
            </div>
          )}
        </div>
      )}
    </div>
  )
}
