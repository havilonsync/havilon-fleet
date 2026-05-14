'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react'

interface SyncResult {
  synced: number
  matched: number
  unmatched: string[]
}

export default function SyncButton() {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sync = async () => {
    setSyncing(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/amazon/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Sync failed')
      } else {
        setResult(data)
        router.refresh()
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
          <CheckCircle size={12} />
          Synced {result.matched} of {result.synced} DAs
          {result.unmatched.length > 0 && ` · ${result.unmatched.length} unmatched`}
        </span>
      )}
      {error && (
        <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          <AlertTriangle size={12} />
          {error}
        </span>
      )}
      <button
        onClick={sync}
        disabled={syncing}
        className="btn-secondary text-sm flex items-center gap-1.5"
      >
        <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
        {syncing ? 'Syncing…' : 'Sync Now'}
      </button>
    </div>
  )
}
