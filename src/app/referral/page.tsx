'use client'

import { useState, useEffect } from 'react'
import { DollarSign, Share2, Copy, CheckCircle, Clock, Users, TrendingUp, Gift } from 'lucide-react'
import { format, addDays } from 'date-fns'

const BONUS_AMOUNT = 25
const HOLD_DAYS    = 30

const STATUS_STYLES: Record<string, string> = {
  NEW:       'badge-blue',
  QUOTED:    'badge-amber',
  CONVERTED: 'badge-green',
  DECLINED:  'badge-gray',
}

export default function ReferralPage() {
  const [data, setData]         = useState<any>(null)
  const [payouts, setPayouts]   = useState<any[]>([])
  const [allCodes, setAllCodes] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [copied, setCopied]     = useState(false)
  const [isOwner, setIsOwner]   = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [requestAmount, setRequestAmount] = useState('')
  const [showRequest, setShowRequest] = useState(false)

  const load = async () => {
    setLoading(true)
    const [meRes, myDataRes] = await Promise.all([
      fetch('/api/auth/session'),
      fetch('/api/referral'),
    ])

    if (meRes.ok) {
      const me = await meRes.json()
      const owner = me?.user?.role === 'OWNER'
      setIsOwner(owner)

      if (owner) {
        const [payoutRes, allRes] = await Promise.all([
          fetch('/api/referral?view=payouts'),
          fetch('/api/referral?view=all'),
        ])
        if (payoutRes.ok) setPayouts(await payoutRes.json().then(d => d.payouts ?? []))
        if (allRes.ok)    setAllCodes(await allRes.json().then(d => d.codes ?? []))
      }
    }

    if (myDataRes.ok) setData(await myDataRes.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const getMyCode = async () => {
    const res = await fetch('/api/referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_my_code' }),
    })
    const d = await res.json()
    setData((prev: any) => ({ ...prev, code: d.code }))
  }

  const copyLink = () => {
    const link = `${window.location.origin}/refer/${data.code.code}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareLink = () => {
    const link = `${window.location.origin}/refer/${data.code.code}`
    const text = `Hey! My employer Havilon LLC has an insurance agency that can save you money on auto, home, life and more. Get a free quote here — no obligation at all: ${link}`
    if (navigator.share) {
      navigator.share({ title: 'Free Insurance Quote', text, url: link })
    } else {
      navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const requestPayout = async () => {
    const amount = parseFloat(requestAmount)
    if (!amount || amount <= 0) return
    setRequesting(true)
    await fetch('/api/referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request_payout', amount }),
    })
    setShowRequest(false)
    setRequestAmount('')
    setRequesting(false)
    load()
  }

  const processPayout = async (payoutId: string, approve: boolean) => {
    await fetch('/api/referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'process_payout', payoutId, approve }),
    })
    load()
  }

  const markBound = async (referralId: string) => {
    await fetch('/api/referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_bound', referralId }),
    })
    load()
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading referral program…</div>

  const code      = data?.code
  const referrals = data?.code?.referrals ?? []
  const balance   = code?.balance ?? 0
  const earned    = code?.totalEarned ?? 0
  const paid      = code?.totalPaid ?? 0
  const pending   = referrals.filter((r: any) => r.status === 'CONVERTED' && !r.bonusPaid).length

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Gift size={20} className="text-blue-600" />
          Insurance Referral Program
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Earn ${BONUS_AMOUNT} for every friend or family member who gets a policy through D. Iwuagwu Insurance Agency
        </p>
      </div>

      {/* How it works */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
        <h3 className="font-semibold text-blue-900 mb-3">How it works</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { step: '1', icon: Share2,    label: 'Share your link', desc: 'Send your unique link to friends & family' },
            { step: '2', icon: DollarSign,label: 'They get a quote', desc: 'Free quote, zero obligation on their end' },
            { step: '3', icon: Gift,      label: `You earn $${BONUS_AMOUNT}`, desc: `Paid ${HOLD_DAYS} days after their policy binds` },
          ].map(item => {
            const Icon = item.icon
            return (
              <div key={item.step} className="text-center">
                <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mx-auto mb-2">
                  {item.step}
                </div>
                <Icon size={18} className="text-blue-600 mx-auto mb-1" />
                <p className="font-medium text-sm text-blue-900">{item.label}</p>
                <p className="text-xs text-blue-700 mt-0.5">{item.desc}</p>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-blue-600 text-center mt-4">
          ⏱ {HOLD_DAYS}-day hold applies — bonus releases after policy stays active for {HOLD_DAYS} days
        </p>
      </div>

      {/* My stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card border-green-200 bg-green-50">
          <p className="text-xs text-gray-500 mb-1">Available Balance</p>
          <p className="text-2xl font-bold text-green-600">${balance.toFixed(2)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Total Earned</p>
          <p className="text-2xl font-semibold">${earned.toFixed(2)}</p>
        </div>
        <div className="stat-card border-amber-200 bg-amber-50">
          <p className="text-xs text-gray-500 mb-1">Pending ({HOLD_DAYS}d)</p>
          <p className="text-2xl font-semibold text-amber-600">{pending}</p>
          <p className="text-xs text-gray-400 mt-0.5">policies in hold</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Total Paid Out</p>
          <p className="text-2xl font-semibold">${paid.toFixed(2)}</p>
        </div>
      </div>

      {/* Referral link */}
      <div className="card p-5">
        <h3 className="font-medium text-gray-900 mb-3">Your Referral Link</h3>
        {!code ? (
          <button onClick={getMyCode} className="btn-primary text-sm">
            Generate My Referral Link
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
              <code className="flex-1 text-sm text-blue-700 font-mono truncate">
                {typeof window !== 'undefined' ? window.location.origin : 'https://havilon-fleet.vercel.app'}/refer/{code.code}
              </code>
              <span className="badge badge-blue flex-shrink-0">{code.code}</span>
            </div>
            <div className="flex gap-3">
              <button onClick={copyLink} className="btn-secondary text-sm flex-1 justify-center">
                {copied ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy Link</>}
              </button>
              <button onClick={shareLink} className="btn-primary text-sm flex-1 justify-center">
                <Share2 size={14} /> Share
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Anyone who uses your link to request a quote will be tracked under your code automatically.
            </p>
          </div>
        )}
      </div>

      {/* Request payout */}
      {balance > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900">Request Payout</h3>
            <span className="text-sm text-green-600 font-medium">${balance.toFixed(2)} available</span>
          </div>
          {!showRequest ? (
            <button onClick={() => setShowRequest(true)} className="btn-primary text-sm">
              <DollarSign size={14} /> Request Payout
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  className="input pl-7"
                  placeholder={balance.toFixed(2)}
                  max={balance}
                  value={requestAmount}
                  onChange={e => setRequestAmount(e.target.value)}
                />
              </div>
              <button onClick={requestPayout} disabled={requesting} className="btn-primary text-sm">
                {requesting ? 'Submitting…' : 'Submit Request'}
              </button>
              <button onClick={() => setShowRequest(false)} className="btn-secondary text-sm">Cancel</button>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">
            Payout requests are reviewed and approved by the owner. You'll be notified when processed.
          </p>
        </div>
      )}

      {/* My referrals */}
      {referrals.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="section-title">My Referrals</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                {['Name', 'Type', 'Submitted', 'Status', 'Bonus', 'Eligible Date'].map(h => (
                  <th key={h} className="table-header text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {referrals.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{r.daName}</td>
                  <td className="table-cell text-xs">{r.insuranceTypes?.join(', ')}</td>
                  <td className="table-cell text-xs text-gray-500">
                    {format(new Date(r.createdAt), 'MMM d, yyyy')}
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${STATUS_STYLES[r.status] ?? 'badge-gray'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="table-cell">
                    {r.status === 'CONVERTED'
                      ? <span className={`font-medium ${r.bonusPaid ? 'text-green-600' : 'text-amber-600'}`}>
                          ${r.bonusAmount.toFixed(2)} {r.bonusPaid ? '✓' : '(pending)'}
                        </span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="table-cell text-xs text-gray-500">
                    {r.bonusEligibleAt
                      ? format(new Date(r.bonusEligibleAt), 'MMM d, yyyy')
                      : '—'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── OWNER VIEW ── */}
      {isOwner && (
        <>
          {/* Pending payout requests */}
          {payouts.length > 0 && (
            <div className="card p-5 border-amber-200 bg-amber-50">
              <h3 className="font-medium text-amber-800 mb-3">
                💰 Pending Payout Requests ({payouts.length})
              </h3>
              <div className="space-y-3">
                {payouts.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-200">
                    <div>
                      <p className="font-medium text-sm">{p.referralCode.name}</p>
                      <p className="text-xs text-gray-500">
                        Code: {p.referralCode.code} · Requested {format(new Date(p.requestedAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-green-600">${p.amount.toFixed(2)}</span>
                      <button onClick={() => processPayout(p.id, true)} className="btn-primary text-xs">Approve</button>
                      <button onClick={() => processPayout(p.id, false)} className="btn-danger text-xs">Deny</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leaderboard */}
          {allCodes.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="section-title flex items-center gap-2">
                  <TrendingUp size={15} className="text-blue-600" /> Referral Leaderboard
                </h3>
                <button
                  onClick={() => fetch('/api/referral', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'release_eligible' }) }).then(() => load())}
                  className="btn-secondary text-xs"
                >
                  ↻ Release Eligible Bonuses
                </button>
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    {['#', 'Staff Member', 'Code', 'Referrals', 'Converted', 'Total Earned', 'Balance'].map(h => (
                      <th key={h} className="table-header text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allCodes.map((c: any, i: number) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="table-cell font-bold text-gray-400">{i + 1}</td>
                      <td className="table-cell font-medium">{c.name}</td>
                      <td className="table-cell font-mono text-xs text-blue-600">{c.code}</td>
                      <td className="table-cell">{c.referrals.length}</td>
                      <td className="table-cell text-green-600 font-medium">
                        {c.referrals.filter((r: any) => r.status === 'CONVERTED').length}
                      </td>
                      <td className="table-cell font-medium">${c.totalEarned.toFixed(2)}</td>
                      <td className="table-cell">
                        <span className={`font-semibold ${c.balance > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          ${c.balance.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* All referrals for owner to mark as bound */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="section-title">All Referrals — Mark Policies as Bound</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  {['Referred By', 'Client Name', 'Types', 'Submitted', 'Status', 'Action'].map(h => (
                    <th key={h} className="table-header text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allCodes.flatMap((c: any) => c.referrals.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="table-cell text-sm font-medium">{c.name}</td>
                    <td className="table-cell">{r.daName}</td>
                    <td className="table-cell text-xs">{r.insuranceTypes?.join(', ')}</td>
                    <td className="table-cell text-xs text-gray-500">
                      {format(new Date(r.createdAt), 'MMM d')}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${STATUS_STYLES[r.status] ?? 'badge-gray'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="table-cell">
                      {r.status === 'NEW' || r.status === 'QUOTED' ? (
                        <button onClick={() => markBound(r.id)} className="btn-primary text-xs">
                          Mark Bound ✓
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">
                          {r.status === 'CONVERTED' ? `Bound ${r.bindDate ? format(new Date(r.bindDate), 'MMM d') : ''}` : r.status}
                        </span>
                      )}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
