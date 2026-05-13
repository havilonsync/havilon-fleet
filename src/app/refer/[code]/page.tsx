'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Shield, CheckCircle, DollarSign, AlertCircle } from 'lucide-react'
import Image from 'next/image'

const INSURANCE_TYPES = [
  { value: 'AUTO',     label: 'Auto Insurance',      icon: '🚗' },
  { value: 'LIFE',     label: 'Life Insurance',       icon: '❤️' },
  { value: 'HEALTH',   label: 'Health Insurance',     icon: '🏥' },
  { value: 'RENTERS',  label: "Renter's Insurance",   icon: '🏠' },
  { value: 'HOME',     label: 'Homeowners Insurance', icon: '🏡' },
  { value: 'UMBRELLA', label: 'Umbrella Policy',      icon: '☂️' },
]

export default function ReferralLandingPage() {
  const params  = useParams()
  const code    = params.code as string
  const [referrerName, setReferrerName] = useState<string | null>(null)
  const [step, setStep]       = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedTypes, setSelected] = useState<string[]>([])
  const [form, setForm] = useState({
    daName: '', email: '', phone: '',
    vehicleYear: '', vehicleMake: '', vehicleModel: '', vehicleVin: '',
    currentCarrier: '', currentRate: '', additionalNotes: '',
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    // Look up referrer name from code
    fetch(`/api/referral/lookup?code=${code}`)
      .then(r => r.json())
      .then(d => { if (d.name) setReferrerName(d.name) })
      .catch(() => {})
  }, [code])

  const toggleType = (type: string) =>
    setSelected(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTypes.length) { alert('Please select at least one type of insurance.'); return }
    setSubmitting(true)

    await fetch('/api/insurance', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...form, insuranceTypes: selectedTypes, referralCode: code }),
    })

    setSubmitted(true)
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-lg">
          <CheckCircle size={56} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">You're all set!</h2>
          <p className="text-gray-600 mb-6">
            Your quote request has been sent to <strong>D. Iwuagwu Insurance Agency</strong>.
            Desmond will review your details and send your personalized quote by email — usually within 1 business day.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left">
            <p className="text-sm font-medium text-blue-800 mb-2">What happens next:</p>
            <ol className="text-sm text-blue-700 space-y-1">
              <li>1. Desmond reviews your information</li>
              <li>2. Quotes are run across multiple carriers</li>
              <li>3. You receive your quote by email</li>
              <li>4. No pressure — compare and decide</li>
            </ol>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Questions? Email diwuagwuinsuranceagency@gmail.com
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
            <span className="text-white font-bold text-sm">H</span>
          </div>
          <div>
            <p className="font-bold text-gray-900">D. Iwuagwu Insurance Agency</p>
            <p className="text-xs text-gray-500">Auto · Life · Health · Home & More</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Referral banner */}
        {referrerName && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <Shield size={20} className="text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800">
              <strong>{referrerName}</strong> thinks we can save you money on insurance. Get a free quote — zero obligation.
            </p>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="card p-5 text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Get a Free Insurance Quote</h1>
              <p className="text-gray-600 mb-4">
                We shop multiple carriers to find you the best rate. Takes 2 minutes.
              </p>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { icon: DollarSign, label: 'Save Money',       desc: 'We compare multiple carriers' },
                  { icon: Shield,     label: 'Licensed Agent',   desc: 'Texas licensed, fully insured' },
                  { icon: CheckCircle,label: 'No Obligation',    desc: 'Compare and decide for yourself' },
                ].map(item => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="text-center">
                      <Icon size={20} className="text-blue-600 mx-auto mb-1" />
                      <p className="text-xs font-medium text-gray-900">{item.label}</p>
                      <p className="text-xs text-gray-500">{item.desc}</p>
                    </div>
                  )
                })}
              </div>
              <button onClick={() => setStep(2)} className="btn-primary w-full justify-center py-3 text-base">
                Get My Free Quote →
              </button>
            </div>

            <div className="card p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">We quote all types of insurance</p>
              <div className="grid grid-cols-3 gap-2">
                {INSURANCE_TYPES.map(t => (
                  <div key={t.value} className="text-center p-2 bg-gray-50 rounded-lg">
                    <div className="text-xl mb-1">{t.icon}</div>
                    <div className="text-xs text-gray-700">{t.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <form onSubmit={submit} className="space-y-5">
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-1">What would you like quoted?</h2>
              <p className="text-xs text-gray-500 mb-3">Select all that apply</p>
              <div className="grid grid-cols-2 gap-2">
                {INSURANCE_TYPES.map(t => {
                  const sel = selectedTypes.includes(t.value)
                  return (
                    <button key={t.value} type="button" onClick={() => toggleType(t.value)}
                      className={`p-3 rounded-lg border text-left transition-all ${sel ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400' : 'bg-white border-gray-200'}`}>
                      <div className="text-lg">{t.icon}</div>
                      <div className="text-xs font-medium text-gray-900 mt-1">{t.label}</div>
                      {sel && <div className="text-xs text-blue-600 font-medium">✓ Selected</div>}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="card p-5 space-y-4">
              <h3 className="font-medium text-gray-900">Your Contact Info</h3>
              <div>
                <label className="label">Full Name *</label>
                <input className="input" required value={form.daName} onChange={e => set('daName', e.target.value)} placeholder="Your full name" />
              </div>
              <div>
                <label className="label">Email *</label>
                <input type="email" className="input" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="Where to send your quote" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Optional" />
              </div>
            </div>

            {selectedTypes.includes('AUTO') && (
              <div className="card p-5 space-y-3">
                <h3 className="font-medium text-gray-900">🚗 Your Vehicle</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Year</label>
                    <input className="input" value={form.vehicleYear} onChange={e => set('vehicleYear', e.target.value)} placeholder="2020" />
                  </div>
                  <div>
                    <label className="label">Make</label>
                    <input className="input" value={form.vehicleMake} onChange={e => set('vehicleMake', e.target.value)} placeholder="Toyota" />
                  </div>
                </div>
                <div>
                  <label className="label">Model</label>
                  <input className="input" value={form.vehicleModel} onChange={e => set('vehicleModel', e.target.value)} placeholder="Camry" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Current Insurer</label>
                    <input className="input" value={form.currentCarrier} onChange={e => set('currentCarrier', e.target.value)} placeholder="Geico, State Farm…" />
                  </div>
                  <div>
                    <label className="label">Monthly Rate</label>
                    <input className="input" value={form.currentRate} onChange={e => set('currentRate', e.target.value)} placeholder="$120/mo" />
                  </div>
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Your info goes to <strong>diwuagwuinsuranceagency@gmail.com</strong> for quoting only. No spam, no selling your data.
              </p>
            </div>

            <button type="submit" disabled={submitting || !selectedTypes.length}
              className="btn-primary w-full justify-center py-3 text-base">
              {submitting ? 'Submitting…' : 'Submit Quote Request'}
            </button>

            <button type="button" onClick={() => setStep(1)} className="btn-secondary w-full justify-center text-sm">
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
