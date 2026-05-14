'use client'

import { useState, useRef, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle, AlertTriangle, FileText } from 'lucide-react'

interface UploadResult {
  imported: number
  skipped:  number
  errors:   { row: number; name: string; reason: string }[]
  week:     string
  isPdf?:   boolean
  detectedColumns: { field: string; header: string }[]
}

const FIELD_LABELS: Record<string, string> = {
  daName: 'DA Name', transponderId: 'Transporter ID', week: 'Week',
  standing: 'Standing', deliveryScore: 'DCR %', qualityScore: 'Quality',
  safetyScore: 'Safety', dnrRate: 'DNR Rate', dsbRate: 'DSB Rate',
}

export default function UploadForm() {
  const router   = useRouter()
  const fileRef  = useRef<HTMLInputElement>(null)
  const [file,    setFile]    = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<UploadResult | null>(null)
  const [error,   setError]   = useState<string | null>(null)

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
        router.refresh()
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setFile(null); setResult(null); setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="card p-6 space-y-4">
      <h3 className="font-medium text-gray-900">Upload a File</h3>

      {!result ? (
        <>
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={28} className="mx-auto text-gray-400 mb-3" />
            <p className="text-sm font-medium text-gray-700">
              {file ? file.name : 'Click to select a file'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {file ? `${(file.size / 1024).toFixed(1)} KB` : 'CSV, XLSX, or PDF — system auto-detects the file type'}
            </p>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={handleFile} />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 whitespace-pre-line">
              {error}
            </div>
          )}

          {file && (
            <div className="flex gap-3">
              <button onClick={handleUpload} disabled={loading} className="btn-primary">
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
              {result.detectedColumns.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">Columns detected</p>
                  <div className="flex flex-wrap gap-2">
                    {result.detectedColumns.map(({ field, header }) => (
                      <span key={field} className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5">
                        <span className="text-gray-400">{FIELD_LABELS[field] ?? field}:</span> {header}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="stat-card border-green-200 bg-green-50">
                  <p className="text-xs text-gray-500 mb-1">DAs Updated</p>
                  <p className="text-2xl font-semibold text-green-600">{result.imported}</p>
                </div>
                <div className="stat-card border-amber-200 bg-amber-50">
                  <p className="text-xs text-gray-500 mb-1">Not in Roster</p>
                  <p className="text-2xl font-semibold text-amber-600">{result.skipped}</p>
                </div>
                <div className="stat-card border-red-200 bg-red-50">
                  <p className="text-xs text-gray-500 mb-1">Errors</p>
                  <p className="text-2xl font-semibold text-red-600">{result.errors.length}</p>
                </div>
              </div>

              {result.skipped > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  {result.skipped} DA(s) in the file were not found in your roster — ensure DAs are imported first with matching names or Transporter IDs.
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
