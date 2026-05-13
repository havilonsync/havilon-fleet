'use client'

import { useState, useEffect } from 'react'
import { BarChart3, CheckCircle, Plus, Star } from 'lucide-react'
import { format } from 'date-fns'

const QUESTIONS = [
  { key: 'overallSatisfaction',  label: 'Overall, how satisfied are you working at Havilon LLC?',        low: 'Very Dissatisfied', high: 'Very Satisfied' },
  { key: 'managementRating',     label: 'How do you rate communication and support from management?',     low: 'Very Poor',         high: 'Excellent' },
  { key: 'workloadRating',       label: 'How manageable is your daily workload and schedule?',            low: 'Overwhelming',      high: 'Very Manageable' },
  { key: 'safetyRating',         label: 'How safe do you feel in your work environment and on the road?', low: 'Very Unsafe',       high: 'Very Safe' },
  { key: 'communicationRating',  label: 'How well does the team communicate and work together?',          low: 'Very Poor',         high: 'Excellent' },
]

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-2 mt-2">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="transition-transform hover:scale-110"
        >
          <Star
            size={28}
            className={`transition-colors ${
              n <= (hover || value)
                ? 'text-amber-400 fill-amber-400'
                : 'text-gray-300'
            }`}
          />
        </button>
      ))}
      <span className="text-sm text-gray-500 self-center ml-1">
        {value === 1 ? 'Very Poor' : value === 2 ? 'Poor' : value === 3 ? 'OK' : value === 4 ? 'Good' : value === 5 ? 'Excellent' : ''}
      </span>
    </div>
  )
}

function ScoreBar({ label, value }: { label: string; value: string }) {
  const num = parseFloat(value)
  const pct = (num / 5) * 100
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-700">{label}</span>
        <span className={`font-semibold ${num >= 4 ? 'text-green-600' : num >= 3 ? 'text-amber-600' : 'text-red-600'}`}>
          {value}/5
        </span>
      </div>
      <div className="risk-bar">
        <div
          className={`risk-fill ${num >= 4 ? 'risk-fill-low' : num >= 3 ? 'risk-fill-medium' : 'risk-fill-high'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function SurveyPage() {
  const [activeSurvey, setActiveSurvey] = useState<any>(null)
  const [surveys, setSurveys]           = useState<any[]>([])
  const [selectedSurvey, setSelected]   = useState<any>(null)
  const [results, setResults]           = useState<any>(null)
  const [isManager, setIsManager]       = useState(false)
  const [submitted, setSubmitted]       = useState(false)
  const [submitting, setSubmitting]     = useState(false)
  const [loading, setLoading]           = useState(true)
  const [creating, setCreating]         = useState(false)

  const [form, setForm] = useState({
    overallSatisfaction: 0, managementRating: 0,
    workloadRating: 0, safetyRating: 0, communicationRating: 0,
    wouldRecommend: null as boolean | null,
    openFeedback: '',
  })

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const load = async () => {
    setLoading(true)
    const [activeRes, meRes] = await Promise.all([
      fetch('/api/surveys?view=active'),
      fetch('/api/auth/session'),
    ])

    if (activeRes.ok) {
      const d = await activeRes.json()
      setActiveSurvey(d.survey)
    }

    if (meRes.ok) {
      const me = await meRes.json()
      const mgr = ['OWNER', 'OPS_MANAGER'].includes(me?.user?.role)
      setIsManager(mgr)

      if (mgr) {
        const listRes = await fetch('/api/surveys')
        if (listRes.ok) setSurveys(await listRes.json().then(d => d.surveys ?? []))
      }
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const loadResults = async (id: string) => {
    const res = await fetch(`/api/surveys/${id}`)
    if (res.ok) {
      const data = await res.json()
      setSelected(data.survey)
      setResults(data.summary)
    }
  }

  const createSurvey = async () => {
    setCreating(true)
    await fetch('/api/surveys', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'create' }),
    })
    setCreating(false)
    load()
  }

  const submitSurvey = async (e: React.FormEvent) => {
    e.preventDefault()
    const missing = QUESTIONS.find(q => !form[q.key as keyof typeof form])
    if (missing || form.wouldRecommend === null) {
      alert('Please answer all questions before submitting.')
      return
    }

    setSubmitting(true)
    const res = await fetch('/api/surveys', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...form, surveyId: activeSurvey.id }),
    })

    if (res.ok) setSubmitted(true)
    setSubmitting(false)
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 size={20} className="text-blue-600" />
            Team Sentiment Survey
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Monthly internal survey — anonymous, separate from Amazon's survey
          </p>
        </div>
        {isManager && (
          <button onClick={createSurvey} disabled={creating} className="btn-primary text-sm">
            <Plus size={14} /> {creating ? 'Creating…' : 'Start New Survey'}
          </button>
        )}
      </div>

      {/* Manager view — results */}
      {isManager && (
        <div className="space-y-4">
          {surveys.length > 0 && (
            <div className="card p-4">
              <h3 className="section-title mb-3">Survey History</h3>
              <div className="space-y-2">
                {surveys.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                    onClick={() => loadResults(s.id)}>
                    <div>
                      <p className="font-medium text-sm text-gray-900">{s.title}</p>
                      <p className="text-xs text-gray-500">
                        {s._count.responses} responses · {s.isActive ? '🟢 Active' : `Closed ${s.closedAt ? format(new Date(s.closedAt), 'MMM d, yyyy') : ''}`}
                      </p>
                    </div>
                    <span className="text-xs text-blue-600 hover:underline">View Results →</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results panel */}
          {results && selectedSurvey && (
            <div className="card p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{selectedSurvey.title} — Results</h3>
                <span className="badge badge-blue">{results.totalResponses} responses</span>
              </div>

              <div className="space-y-4">
                <ScoreBar label="Overall Satisfaction"  value={results.overallSatisfaction} />
                <ScoreBar label="Management Support"    value={results.managementRating} />
                <ScoreBar label="Workload & Schedule"   value={results.workloadRating} />
                <ScoreBar label="Safety"                value={results.safetyRating} />
                <ScoreBar label="Team Communication"    value={results.communicationRating} />
              </div>

              <div className={`p-4 rounded-xl border ${results.wouldRecommendPct >= 70 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <p className="text-sm font-medium">
                  {results.wouldRecommendPct}% of respondents would recommend working at Havilon LLC
                </p>
              </div>

              {results.openFeedback?.length > 0 && (
                <div>
                  <h4 className="section-title mb-3">Open Feedback (Anonymous)</h4>
                  <div className="space-y-2">
                    {results.openFeedback.map((f: string, i: number) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-3 border-l-2 border-blue-300">
                        <p className="text-sm text-gray-700 italic">"{f}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Staff view — fill out survey */}
      {!isManager && (
        <>
          {!activeSurvey ? (
            <div className="card p-12 text-center text-sm text-gray-400">
              No active survey right now. Check back next month.
            </div>
          ) : submitted ? (
            <div className="card p-10 text-center">
              <CheckCircle size={40} className="text-green-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Thank You</h2>
              <p className="text-sm text-gray-600">
                Your response has been submitted anonymously. Your feedback helps us improve the workplace for everyone.
              </p>
            </div>
          ) : (
            <form onSubmit={submitSurvey} className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-sm text-blue-800">
                  🔒 This survey is <strong>completely anonymous</strong>. Your responses cannot be traced back to you.
                  This is separate from Amazon's survey and is just for internal Havilon LLC use.
                </p>
              </div>

              <div className="card p-5 space-y-6">
                <h2 className="font-semibold text-gray-900">{activeSurvey.title}</h2>

                {QUESTIONS.map(q => (
                  <div key={q.key}>
                    <p className="text-sm font-medium text-gray-800">{q.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{q.low} → {q.high}</p>
                    <StarRating
                      value={form[q.key as keyof typeof form] as number}
                      onChange={v => set(q.key, v)}
                    />
                  </div>
                ))}

                <div>
                  <p className="text-sm font-medium text-gray-800 mb-2">
                    Would you recommend working at Havilon LLC to a friend?
                  </p>
                  <div className="flex gap-3">
                    {[true, false].map(v => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => set('wouldRecommend', v)}
                        className={`px-5 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          form.wouldRecommend === v
                            ? v ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {v ? '👍  Yes' : '👎  No'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label">
                    Anything else you want management to know? (optional)
                  </label>
                  <textarea
                    className="input w-full min-h-[80px] resize-none mt-1"
                    placeholder="Share any thoughts, suggestions, or concerns. This is anonymous."
                    value={form.openFeedback}
                    onChange={e => set('openFeedback', e.target.value)}
                  />
                </div>

                <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
                  {submitting ? 'Submitting…' : 'Submit Survey Anonymously'}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  )
}
