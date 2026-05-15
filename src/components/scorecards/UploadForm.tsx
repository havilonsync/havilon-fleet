'use client'

import { useState, useRef, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle, AlertTriangle } from 'lucide-react'

interface UploadResult {
  imported:        number
  created:         number
  errors:          { row: number; name: string; reason: string }[]
  week:            string
  isPdf?:          boolean
  columnMapping:   { field: string; header: string; how: string }[]
  allHeaders:      string[]
  unmappedHeaders: string[]
}

const FIELD_LABELS: Record<string, string> = {
  daName: 'DA Name', transponderId: 'Transporter ID', week: 'Week',
  standing: 'Standing', deliveryScore: 'DCR %', qualityScore: 'Quality',
  safetyScore: 'Safety', dnrRate: 'DNR Rate', dsbRate: 'DSB Rate',
}

const FILE_TYPES = [
  { value: 'weekly_overview',  label: 'Weekly Overview',        ext: 'CSV'  },
  { value: 'weekly_trailing',  label: 'Weekly Overview 6-Week', ext: 'CSV'  },
  { value: 'at_stop_safety',   label: 'At-Stop Safety',         ext: 'CSV'  },
  { value: 'pps_daily',        label: 'PPS Daily',              ext: 'CSV'  },
  { value: 'dvic',             label: 'DVIC',                   ext: 'XLSX' },
  { value: 'scorecard_pdf',    label: 'Scorecard',              ext: 'PDF'  },
  { value: 'pod_quality',      label: 'POD Quality',            ext: 'PDF'  },
]

export default function UploadForm() {
  const router    = useRouter()
  const fileRef   = useRef<HTMLInputElement>(null)
  const [file,     setFile]     = useState<File | null>(null)
  const [fileType, setFileType] = useState<string>('')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<UploadResult | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setResult(null)
    setError(null)
  }

  const handleUpload = async () => {
    if (!file || !fileType) return
    setLoading(true)
    setError(null)
    setResult(null)
    const form = new FormData()
    form.append('file', file)
    form.append('fileType', fileType)
    try {
      const res  = await fetch('/api/scorecards/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        let msg = data.error ?? 'Upload failed'
        if (data.detectedHeaders?.length) msg += `\n\nDetected columns: ${data.detectedHeaders.join(', ')}`
        setError(msg)
      } else {
        setResult(data)
        router.refresh()
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setFile(null); setFileType(''); setResult(null); setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="card p-6 space-y-4">
      <h3 className="font-medium text-gray-900">Upload a File</h3>

      {!result ? (
        <>
          {/* Step 1: Select file type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              1. Select the file type
            </label>
            <select
              value={fileType}
              onChange={e => setFileType(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">— choose a file type —</option>
              {FILE_TYPES.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label} ({t.ext})
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Pick file */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              2. Choose the file
            </label>
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={24} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-700">
                {file ? file.name : 'Click to select a file'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : 'CSV, XLSX, or PDF'}
              </p>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={handleFile} />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 whitespace-pre-line">
              {error}
            </div>
          )}

          {file && !fileType && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              Select a file type above before uploading.
            </p>
          )}

          {file && (
            <div className="flex gap-3">
              <button onClick={handleUpload} disabled={loading || !fileType} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Processing…' : `Import "${file.name}"`}
              </button>
              <button onClick={reset} className="btn-secondary">Clear</button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle size={20} className="text-green-600" />
            <div>
              <p className="font-semibold text-gray-900">
                {result.isPdf ? 'PDF saved for reference' : `Upload complete — Week ${result.week}`}
              </p>
              <p className="text-sm text-gray-500">{file?.name}</p>
            </div>
          </div>

          {!result.isPdf && (
            <>
              {/* Column mapping — always shown so mismatches are visible */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-gray-600">Column mapping ({result.columnMapping.length} of {result.allHeaders.length} detected)</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.columnMapping.map(({ field, header }) => (
                    <span key={field} className="text-xs bg-green-50 border border-green-200 text-green-800 rounded px-2 py-0.5">
                      ✓ {FIELD_LABELS[field] ?? field} ← <span className="font-mono">{header}</span>
                    </span>
                  ))}
                </div>
                {result.unmappedHeaders?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Unrecognised columns (not imported):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.unmappedHeaders.map(h => (
                        <span key={h} className="text-xs bg-gray-100 border border-gray-200 text-gray-500 rounded px-2 py-0.5 font-mono">{h}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="stat-card border-green-200 bg-green-50">
                  <p className="text-xs text-gray-500 mb-1">Scorecards Saved</p>
                  <p className="text-2xl font-semibold text-green-600">{result.imported}</p>
                </div>
                <div className="stat-card border-blue-200 bg-blue-50">
                  <p className="text-xs text-gray-500 mb-1">New DAs Added</p>
                  <p className="text-2xl font-semibold text-blue-600">{result.created ?? 0}</p>
                </div>
                <div className="stat-card border-red-200 bg-red-50">
                  <p className="text-xs text-gray-500 mb-1">Errors</p>
                  <p className="text-2xl font-semibold text-red-600">{result.errors.length}</p>
                </div>
              </div>

              {(result.created ?? 0) > 0 && (
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                  {result.created} DA(s) were automatically added to your roster from this file. Visit the DA Roster to fill in any missing details.
                </p>
              )}

              {result.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 overflow-hidden text-xs">
                  <div className="bg-red-50 px-3 py-2 font-medium text-red-700 flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Rows with errors
                  </div>
                  <table className="w-full">
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={i} className="border-t border-red-100">
                          <td className="px-3 py-1.5 text-gray-500 w-12">Row {e.row}</td>
                          <td className="px-3 py-1.5 font-medium">{e.name}</td>
                          <td className="px-3 py-1.5 text-red-700">{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          <button onClick={reset} className="btn-secondary text-sm">Upload Another File</button>
        </div>
      )}
    </div>
  )
}
