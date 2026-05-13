'use client'

import { useState, useEffect } from 'react'
import { Shield, CheckCircle, DollarSign, Phone, Mail, Car, Home, Heart, Umbrella, AlertCircle } from 'lucide-react'
import Image from 'next/image'

const INSURANCE_TYPES = [
  { value: 'AUTO',     label: 'Auto Insurance',      icon: '🚗', desc: 'Car, truck, or van coverage' },
  { value: 'LIFE',     label: 'Life Insurance',       icon: '❤️', desc: 'Term, whole, or universal life' },
  { value: 'HEALTH',   label: 'Health Insurance',     icon: '🏥', desc: 'Individual or family health plans' },
  { value: 'RENTERS',  label: "Renter's Insurance",   icon: '🏠', desc: 'Protect your belongings at home' },
  { value: 'HOME',     label: 'Homeowners Insurance', icon: '🏡', desc: 'Coverage for your home' },
  { value: 'UMBRELLA', label: 'Umbrella Policy',      icon: '☂️', desc: 'Extra liability protection' },
]

export default function InsurancePage() {
  const [step, setStep]               = useState(1) // 1=intro, 2=form, 3=submitted
  const [selectedTypes, setSelected]  = useState<string[]>([])
  const [submitting, setSubmitting]   = useState(false)
  const [referralNum, setReferralNum] = useState('')
  const [session, setSession]         = useState<any>(null)

  const [form, setForm] = useState({
    daName:        '',
    email:         '',
    phone:         '',
    vehicleVin:    '',
    vehicleYear:   '',
    vehicleMake:   '',
    vehicleModel:  '',
    currentCarrier:'',
    currentRate:   '',
    additionalNotes: '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => {
      setSession(s)
      if (s?.user?.name)  set('daName', s.user.name)
      if (s?.user?.email) set('email', s.user.email)
    })
  }, [])

  const toggleType = (type: string) => {
    setSelected(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedTypes.length === 0) {
      alert('Please select at least one type of insurance to get quoted.')
      return
    }
    setSubmitting(true)

    const res = await fetch('/api/insurance', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...form, insuranceTypes: selectedTypes }),
    })

    const data = await res.json()
    if (res.ok) {
      setReferralNum(data.referralNumber)
      setStep(3)
    }
    setSubmitting(false)
  }

  // ── Step 3: Submitted ──────────────────────────────────────────────────────
  if (step === 3) {
    return (
      <div className="max-w-lg mx-auto pt-8 space-y-6">
        <div className="card p-8 text-center">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Quote Request Submitted!</h2>
          <p className="text-gray-600 mb-4">
            Your information has been sent to <strong>D. Iwuagwu Insurance Agency</strong>.
            We'll review your details and send you a personalized quote by email.
          </p>
          <div className="bg-gray-50 rounded-lg p-3 inline-block mb-4">
            <p className="text-xs text-gray-500 mb-1">Reference Number</p>
            <p className="font-mono font-bold text-gray-900">{referralNum}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
            <p className="text-sm font-medium text-blue-800 mb-2">What happens next:</p>
            <ol className="text-sm text-blue-700 space-y-1">
              <li>1. Your quote request goes directly to <strong>diwuagwuinsuranceagency@gmail.com</strong></li>
              <li>2. Desmond will run your quote personally using BOLT & First Connect</li>
              <li>3. You'll receive your quote by email — usually within 1 business day</li>
              <li>4. No pressure — just compare and decide what works for you</li>
            </ol>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Questions? Contact the agency directly at diwuagwuinsuranceagency@gmail.com
          </p>
        </div>
      </div>
    )
  }

  // ── Step 1: Introduction ───────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="max-w-lg mx-auto pt-4 space-y-6">

        {/* Agency header */}
        <div className="card p-6 text-center">
          <div className="flex justify-center mb-4">
            <Image src="/havilon-logo.jpg" alt="Havilon LLC" width={64} height={64} className="rounded" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">D. Iwuagwu Insurance Agency</h1>
          <p className="text-sm text-gray-500 mt-1">Serving Havilon LLC staff — Auto · Life · Health · Home & More</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="badge badge-blue text-xs">BOLT</span>
            <span className="badge badge-blue text-xs">First Connect</span>
            <span className="badge badge-green text-xs">Licensed Agent</span>
          </div>
        </div>

        {/* Value proposition */}
        <div className="space-y-3">
          {[
            { icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50 border-green-200', title: 'You could save money', desc: 'Many of our DAs are overpaying for auto insurance. We shop multiple carriers to find you the best rate.' },
            { icon: Shield,     color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-200',   title: 'Trusted by your employer', desc: 'Desmond Iwuagwu personally handles every quote. Same person you work for, same commitment to your wellbeing.' },
            { icon: Phone,      color: 'text-purple-600',bg: 'bg-purple-50 border-purple-200',title: 'No pressure, no hassle', desc: 'Request a quote, compare it to what you have, and decide for yourself. Zero obligation.' },
          ].map(item => {
            const Icon = item.icon
            return (
              <div key={item.title} className={`rounded-xl p-4 border flex items-start gap-3 ${item.bg}`}>
                <div className={`flex-shrink-0 mt-0.5 ${item.color}`}><Icon size={20} /></div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{item.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{item.desc}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* What we offer */}
        <div className="card p-5">
          <h3 className="font-medium text-gray-900 mb-3">What we can quote for you:</h3>
          <div className="grid grid-cols-2 gap-2">
            {INSURANCE_TYPES.map(t => (
              <div key={t.value} className="flex items-center gap-2 text-sm text-gray-700 p-2 bg-gray-50 rounded-lg">
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => setStep(2)} className="btn-primary w-full justify-center text-base py-3">
          Get My Free Quote →
        </button>

        <p className="text-xs text-center text-gray-400">
          This is a service offered by D. Iwuagwu Insurance Agency, a separate business from Havilon LLC.
          Participation is completely voluntary and has no effect on your employment.
        </p>
      </div>
    )
  }

  // ── Step 2: Quote Form ─────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto pt-4 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => setStep(1)} className="btn-secondary text-xs">← Back</button>
        <h1 className="text-lg font-semibold text-gray-900">Request Your Free Quote</h1>
      </div>

      <form onSubmit={submit} className="space-y-5">

        {/* Insurance types */}
        <div className="card p-5">
          <h3 className="font-medium text-gray-900 mb-3">What would you like quoted? *</h3>
          <p className="text-xs text-gray-500 mb-3">Select all that apply — we'll include everything in one quote</p>
          <div className="grid grid-cols-2 gap-2">
            {INSURANCE_TYPES.map(t => {
              const isSelected = selectedTypes.includes(t.value)
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => toggleType(t.value)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-lg mb-1">{t.icon}</div>
                  <div className="text-xs font-medium text-gray-900">{t.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{t.desc}</div>
                  {isSelected && <div className="text-xs text-blue-600 font-medium mt-1">✓ Selected</div>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Contact info */}
        <div className="card p-5 space-y-4">
          <h3 className="font-medium text-gray-900">Your Contact Info</h3>
          <div>
            <label className="label">Full Name *</label>
            <input className="input" value={form.daName} onChange={e => set('daName', e.target.value)} required placeholder="Your full name" />
          </div>
          <div>
            <label className="label">Email Address *</label>
            <input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} required placeholder="Where to send your quote" />
          </div>
          <div>
            <label className="label">Phone Number</label>
            <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Optional — for faster follow up" />
          </div>
        </div>

        {/* Auto details - shown if AUTO selected */}
        {selectedTypes.includes('AUTO') && (
          <div className="card p-5 space-y-4">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              🚗 Auto Insurance Details
            </h3>
            <p className="text-xs text-gray-500">Help us give you the most accurate quote</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Vehicle Year</label>
                <input className="input" value={form.vehicleYear} onChange={e => set('vehicleYear', e.target.value)} placeholder="e.g. 2019" />
              </div>
              <div>
                <label className="label">Make</label>
                <input className="input" value={form.vehicleMake} onChange={e => set('vehicleMake', e.target.value)} placeholder="e.g. Toyota" />
              </div>
            </div>
            <div>
              <label className="label">Model</label>
              <input className="input" value={form.vehicleModel} onChange={e => set('vehicleModel', e.target.value)} placeholder="e.g. Camry" />
            </div>
            <div>
              <label className="label">VIN (optional but helps accuracy)</label>
              <input className="input font-mono" value={form.vehicleVin} onChange={e => set('vehicleVin', e.target.value)} placeholder="17-character VIN" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Current Insurance Company</label>
                <input className="input" value={form.currentCarrier} onChange={e => set('currentCarrier', e.target.value)} placeholder="e.g. Geico, State Farm" />
              </div>
              <div>
                <label className="label">Current Monthly Rate</label>
                <input className="input" value={form.currentRate} onChange={e => set('currentRate', e.target.value)} placeholder="e.g. $120/mo" />
              </div>
            </div>
          </div>
        )}

        {/* Additional notes */}
        <div className="card p-5">
          <label className="label">Anything else we should know? (optional)</label>
          <textarea
            className="input w-full min-h-[70px] resize-none mt-1"
            value={form.additionalNotes}
            onChange={e => set('additionalNotes', e.target.value)}
            placeholder="Number of drivers, home address city, specific coverage needs, etc."
          />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Your information will be sent securely to <strong>diwuagwuinsuranceagency@gmail.com</strong> for quoting.
            This is a separate service from Havilon LLC. Your employment is not affected in any way by this request.
          </p>
        </div>

        <button type="submit" disabled={submitting || selectedTypes.length === 0} className="btn-primary w-full justify-center py-3">
          {submitting ? 'Submitting…' : `Submit Quote Request for ${selectedTypes.length || 0} Type${selectedTypes.length !== 1 ? 's' : ''}`}
        </button>
      </form>
    </div>
  )
}
