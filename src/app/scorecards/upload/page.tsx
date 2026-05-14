'use client'

import { useState, useRef, ChangeEvent } from 'react'
import Link from 'next/link'
import { Upload, FileText, CheckCircle, AlertTriangle, ArrowLeft, FileSpreadsheet, Info } from 'lucide-react'

interface UploadResult {
  imported: number
  skipped:  number
  errors:   { row: number; name: string; reason: string }[]
  week:     string
  detectedColumns: { field: string; header: string }[]
}

const FILE_TYPES = [
  { label: 'Weekly Overview (CSV)',          hint: 'DSP_Overview_Dashboard_HAVL_DDF4_2026-Wnn.csv',     accept: '.csv' },
  { label: 'Weekly Overview 6-Week Trailing', hint: 'Weekly trailing CSV with multi-week DA scores',     accept: '.csv' },
  { label: 'At-Stop Safety (CSV)',            hint: 'Safety scores per DA for the week',                 accept: '.csv' },
  { label: 'PPS Daily (CSV)',                 hint: 'Packages Per Stop / daily delivery data per DA',    accept: '.csv' },
  { label: 'DVIC (XLSX)',                     hint: 'Daily Vehicle Inspection — vehicle data',           accept: '.xlsx,.xls' },
]

const FIELD_LABELS: Record<string, string> = {
  daName:        'DA Name',
  transponderId: 'Transporter ID',
  week:          'Week',
  standing:      'Standing',
  deliveryScore: 'DCR %',
  qualityScore:  'Quality Score',
  safetyScore:   'Safety Score',
  dnrRate:       'DNR Rate',
  dsbRate:       'DSB Rate',
}

export default function ScorecardUploadPage() {
  const fileRef  = useRef<HTMLInputElement>(null)
  const [file,    setFile]    = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<UploadResult | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [accept,  setAccept]  = useState('.csv,.xlsx,.xls')

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setResult(null)
    setError(null)
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const res  = await fetch('/api/scorecards/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        let msg = data.error ?? 'Upload failed'
        if (data.detectedHeaders?.length) msg += `\n\nDetected columns: ${data.detectedHeaders.join(', ')}`
        setError(msg)
      } else {
        setResult(data)
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setFile(null)
    setResult(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link href="/scorecards" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft size={14} /> Back to Scorecards
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Upload Amazon Scorecard Files</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload the weekly files from your Amazon DSP Portal to populate DA scorecards.
        </p>
      </div>

      {/* Which files to upload */}
      <div className="card p-5 bg-blue-50 border-blue-200">
        <p className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <Info size={15} /> Which files to upload
        </p>
        <div className="space-y-2">
          {FILE_TYPES.map(ft => (
            <div key={ft.label} className="flex items-start gap-3">
              <FileSpreadsheet size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-sm font-medium text-blue-900">{ft.label}</span>
                <span className="text-xs text-blue-600 ml-2">{ft.hint}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-blue-700 mt-3 border-t border-blue-200 pt-3">
          The <strong>Weekly Overview CSV</strong> is the most important — it contains per-DA scores for DCR, DSB, DNR, Safety, Quality, and Standing. Upload each file one at a time. The system merges data so uploading multiple files for the same week updates the same scorecard records.
        </p>
      </div>

      {/* Upload area */}
      {!result && (
        <div className="card p-6 space-y-4">
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={32} className="mx-auto text-gray-400 mb-3" />
            <p className="text-sm font-medium text-gray-700">
              {file ? file.name : 'Click to select a CSV or XLSX file'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {file
                ? `${(file.size / 1024).toFixed(1)} KB`
                : 'Accepts .csv, .xlsx, .xls — the system auto-detects the file type'}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 whitespace-pre-line">
              {error}
            </div>
          )}

          {file && (
            <div className="flex gap-3">
              <button onClick={handleUpload} disabled={loading} className="btn-primary">
                {loading ? 'Processing…' : `Import from "${file.name}"`}
              </button>
              <button onClick={reset} className="btn-secondary">Clear</button>
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-3">
            <CheckCircle size={22} className="text-green-600" />
            <div>
              <p className="font-semibold text-gray-900">Upload Complete — Week {result.week}</p>
              <p className="text-sm text-gray-500">{file?.name}</p>
            </div>
          </div>

          {/* Detected columns */}
          {result.detectedColumns.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-600 mb-2">Detected columns</p>
              <div className="flex flex-wrap gap-2">
                {result.detectedColumns.map(({ field, header }) => (
                  <span key={field} className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5">
                    <span className="text-gray-400">{FIELD_LABELS[field] ?? field}:</span> {header}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card border-green-200 bg-green-50">
              <p className="text-xs text-gray-500 mb-1">Imported</p>
              <p className="text-2xl font-semibold text-green-600">{result.imported}</p>
              <p className="text-xs text-gray-400 mt-1">DAs updated</p>
            </div>
            <div className="stat-card border-amber-200 bg-amber-50">
              <p className="text-xs text-gray-500 mb-1">Skipped</p>
              <p className="text-2xl font-semibold text-amber-600">{result.skipped}</p>
              <p className="text-xs text-gray-400 mt-1">Not in roster</p>
            </div>
            <div className="stat-card border-red-200 bg-red-50">
              <p className="text-xs text-gray-500 mb-1">Errors</p>
              <p className="text-2xl font-semibold text-red-600">{result.errors.length}</p>
            </div>
          </div>

          {result.skipped > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              {result.skipped} DA(s) were in the file but not found in your roster — make sure DAs are imported first with matching names or Transporter IDs.
            </p>
          )}

          {result.errors.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-500" /> Rows with errors
              </p>
              <div className="rounded-lg border border-red-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-red-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-red-700">Row</th>
                      <th className="px-3 py-2 text-left font-medium text-red-700">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-red-700">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} className="border-t border-red-100">
                        <td className="px-3 py-2 text-gray-600">{e.row}</td>
                        <td className="px-3 py-2 font-medium">{e.name}</td>
                        <td className="px-3 py-2 text-red-700">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Link href="/scorecards" className="btn-primary">View Scorecards</Link>
            <button onClick={reset} className="btn-secondary">Upload Another File</button>
          </div>
        </div>
      )}
    </div>
  )
}
