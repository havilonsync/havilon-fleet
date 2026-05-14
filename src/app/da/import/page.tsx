'use client'

import { useState, useRef, ChangeEvent } from 'react'
import Link from 'next/link'
import { Upload, FileText, CheckCircle, AlertTriangle, ArrowLeft, Download } from 'lucide-react'

interface ImportResult {
  imported: number
  skipped:  number
  errors:   { row: number; name: string; reason: string }[]
}

const TEMPLATE_HEADERS = 'Name,Email,Phone,ADP ID,Badge ID,Transponder ID,Driver License,DL Expiry,Hire Date,Zip Code,Status'
const TEMPLATE_ROWS = [
  'John Smith,jsmith@example.com,555-0101,EE001,B-1001,T-2001,D1234567,2026-08-15,2022-03-01,30301,Active',
  'Maria Garcia,mgarcia@example.com,555-0102,EE002,B-1002,T-2002,D7654321,2025-12-01,2021-06-15,30302,Active',
]
const TEMPLATE_CSV = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS].join('\n')

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'da-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function parsePreview(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (!lines.length) return { headers: [], rows: [] }
  const split = (l: string) => l.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
  return {
    headers: split(lines[0]),
    rows:    lines.slice(1, 6).filter(Boolean).map(split),
  }
}

export default function DAImportPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file,    setFile]    = useState<File | null>(null)
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<ImportResult | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setResult(null)
    setError(null)
    const reader = new FileReader()
    reader.onload = ev => {
      setPreview(parsePreview(ev.target?.result as string))
    }
    reader.readAsText(f)
  }

  const handleImport = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const res  = await fetch('/api/da/import', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        let msg = data.error ?? 'Import failed'
        if (data.detectedHeaders) msg += `\n\nDetected columns: ${data.detectedHeaders.join(', ')}`
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
    setPreview(null)
    setResult(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/da" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft size={14} /> Back to DA Roster
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">Import DAs from Amazon Portal</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Export your DA roster from the Amazon DSP portal as CSV, then upload it here.
          </p>
        </div>
        <button onClick={downloadTemplate} className="btn-secondary flex items-center gap-2 text-sm">
          <Download size={14} /> Download Template
        </button>
      </div>

      {/* How-to */}
      <div className="card p-5 bg-blue-50 border-blue-200">
        <p className="text-sm font-medium text-blue-900 mb-2">How to export from Amazon DSP Portal</p>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Log in to your Amazon DSP portal</li>
          <li>Go to <strong>Workforce Management → Delivery Associates</strong></li>
          <li>Click <strong>Export</strong> or <strong>Download CSV</strong></li>
          <li>Upload the downloaded file below</li>
        </ol>
        <p className="text-xs text-blue-700 mt-3">
          Accepted columns: <span className="font-mono">Name, Email, Phone, ADP ID, Badge ID, Transponder ID, Driver License, DL Expiry, Hire Date, Zip Code, Status</span>
          <br />DAs already in the roster (matched by email or ADP ID) are skipped automatically.
        </p>
      </div>

      {/* Upload */}
      {!result && (
        <div className="card p-6 space-y-4">
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={32} className="mx-auto text-gray-400 mb-3" />
            <p className="text-sm font-medium text-gray-700">
              {file ? file.name : 'Click to select a CSV file'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {file ? `${(file.size / 1024).toFixed(1)} KB` : 'CSV files only'}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 whitespace-pre-line">
              {error}
            </div>
          )}

          {preview && preview.headers.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <FileText size={14} /> Preview — first {preview.rows.length} rows
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {preview.headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, ri) => (
                      <tr key={ri} className="border-t border-gray-100">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-gray-700 whitespace-nowrap">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {file && (
            <div className="flex gap-3">
              <button onClick={handleImport} disabled={loading} className="btn-primary">
                {loading ? 'Importing…' : `Import DAs from "${file.name}"`}
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
              <p className="font-semibold text-gray-900">Import Complete</p>
              <p className="text-sm text-gray-500">{file?.name}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card border-green-200 bg-green-50">
              <p className="text-xs text-gray-500 mb-1">Imported</p>
              <p className="text-2xl font-semibold text-green-600">{result.imported}</p>
            </div>
            <div className="stat-card border-amber-200 bg-amber-50">
              <p className="text-xs text-gray-500 mb-1">Skipped (already exist)</p>
              <p className="text-2xl font-semibold text-amber-600">{result.skipped}</p>
            </div>
            <div className="stat-card border-red-200 bg-red-50">
              <p className="text-xs text-gray-500 mb-1">Errors</p>
              <p className="text-2xl font-semibold text-red-600">{result.errors.length}</p>
            </div>
          </div>

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
            <Link href="/da" className="btn-primary">View DA Roster</Link>
            <button onClick={reset} className="btn-secondary">Import Another File</button>
          </div>
        </div>
      )}
    </div>
  )
}
