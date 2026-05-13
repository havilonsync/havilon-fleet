'use client'

import { useState } from 'react'
import { Lock, Send, CheckCircle, AlertTriangle, Shield, Eye, EyeOff } from 'lucide-react'

const CATEGORIES = [
  { value: 'SAFETY',     label: '⚠️  Safety Concern',        desc: 'Unsafe driving, vehicle condition, or work environment' },
  { value: 'CONDUCT',    label: '👥  Workplace Conduct',      desc: 'Bullying, harassment, or inappropriate behavior' },
  { value: 'OPERATIONS', label: '📋  Operations Issue',       desc: 'Process problems, scheduling, or route concerns' },
  { value: 'FRAUD',      label: '🔍  Fraud or Misconduct',    desc: 'Theft, dishonesty, or policy violations' },
  { value: 'OTHER',      label: '💬  General Feedback',       desc: 'Anything else you want management to know' },
]

export default function TipsPage() {
  const [category, setCategory]     = useState('OTHER')
  const [message, setMessage]       = useState('')
  const [submitted, setSubmitted]   = useState(false)
  const [reference, setReference]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim().length < 10) {
      setError('Please provide more detail — at least a sentence or two helps us understand the situation.')
      return
    }
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/tips', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ category, message }),
    })

    const data = await res.json()

    if (res.ok) {
      setSubmitted(true)
      setReference(data.reference)
    } else {
      setError(data.error ?? 'Something went wrong. Please try again.')
    }
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto space-y-6 pt-8">
        <div className="card p-8 text-center">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Tip Submitted</h2>
          <p className="text-gray-600 mb-4">
            Your tip has been submitted confidentially and will be reviewed by management.
          </p>
          <div className="bg-gray-50 rounded-lg p-3 inline-block">
            <p className="text-xs text-gray-500 mb-1">Your reference number</p>
            <p className="font-mono font-bold text-gray-900 text-lg">{reference}</p>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Save this reference number if you want to follow up with management later.
            Your identity has not been recorded.
          </p>
          <button onClick={() => { setSubmitted(false); setMessage(''); setCategory('OTHER') }}
            className="btn-secondary text-sm mt-4">
            Submit Another Tip
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 pt-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Lock size={20} className="text-blue-600" />
          Confidential Tip Line
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Submit concerns anonymously — your identity is never recorded
        </p>
      </div>

      {/* Privacy guarantee */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="font-medium text-blue-800 mb-3 flex items-center gap-2">
          <Shield size={16} /> Your Privacy is Guaranteed
        </p>
        <div className="space-y-2 text-sm text-blue-700">
          <div className="flex items-start gap-2">
            <EyeOff size={14} className="flex-shrink-0 mt-0.5" />
            <p>Your name, employee ID, and login are <strong>never attached</strong> to your tip</p>
          </div>
          <div className="flex items-start gap-2">
            <Lock size={14} className="flex-shrink-0 mt-0.5" />
            <p>No one — including the owner — can trace a tip back to you through this system</p>
          </div>
          <div className="flex items-start gap-2">
            <Eye size={14} className="flex-shrink-0 mt-0.5" />
            <p>Tips are only visible to the company owner and senior management</p>
          </div>
        </div>
        <p className="text-xs text-blue-600 mt-3 italic">
          Note: Do not include identifying details about yourself in your message if you wish to remain anonymous.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={submit} className="card p-6 space-y-5">
        <div>
          <label className="label">What type of concern is this?</label>
          <div className="space-y-2 mt-1">
            {CATEGORIES.map(cat => (
              <label key={cat.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  category === cat.value
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}>
                <input type="radio" name="category" value={cat.value}
                  checked={category === cat.value}
                  onChange={() => setCategory(cat.value)}
                  className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">{cat.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{cat.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Your Message</label>
          <textarea
            className="input w-full min-h-[140px] resize-none mt-1"
            placeholder="Describe the situation in as much detail as you feel comfortable sharing. The more specific you can be, the better we can address it. Remember — do not include your own name or identifying details if you want to remain anonymous."
            value={message}
            onChange={e => setMessage(e.target.value)}
            required
          />
          <p className="text-xs text-gray-400 mt-1">{message.length} characters</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
          <Lock size={14} />
          {submitting ? 'Submitting…' : 'Submit Confidentially'}
        </button>

        <p className="text-xs text-center text-gray-400">
          By submitting you acknowledge this tip will be reviewed by Havilon LLC management.
          False or malicious tips are discouraged and may be subject to investigation.
        </p>
      </form>
    </div>
  )
}
