export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, Clock, Info } from 'lucide-react'
import { getISOWeek, getYear, subWeeks } from 'date-fns'
import prisma from '@/lib/prisma'
import UploadForm from '@/components/scorecards/UploadForm'

const CHECKLIST: { type: string; label: string; hint: string; ext: string; critical: boolean }[] = [
  { type: 'weekly_overview',  label: 'Weekly Overview',          hint: 'DSP_Overview_Dashboard_HAVL_DDF4_2026-Wnn.csv',   ext: 'CSV',  critical: true  },
  { type: 'weekly_trailing',  label: 'Weekly Overview 6-Week',   hint: 'Trailing_Six_Week CSV',                            ext: 'CSV',  critical: true  },
  { type: 'at_stop_safety',   label: 'At-Stop Safety',           hint: 'At-stop / safety scores per DA',                  ext: 'CSV',  critical: true  },
  { type: 'pps_daily',        label: 'PPS Daily',                hint: 'Packages Per Stop daily CSV',                     ext: 'CSV',  critical: false },
  { type: 'dvic',             label: 'DVIC',                     hint: 'Daily Vehicle Inspection XLSX',                   ext: 'XLSX', critical: false },
  { type: 'scorecard_pdf',    label: 'Scorecard',                hint: 'Weekly Scorecard PDF (reference only)',            ext: 'PDF',  critical: false },
  { type: 'pod_quality',      label: 'POD Quality',              hint: 'POD quality report PDF (reference only)',          ext: 'PDF',  critical: false },
]

function lastWeekStr(): string {
  const d = subWeeks(new Date(), 1)
  return `${getYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`
}

export default async function ScorecardUploadPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  // Pick the week with the most distinct file types uploaded — this is the
  // week the user is actively working on. Falls back to the single most
  // recent file's week, then to last week.
  const recentFiles = await prisma.scorecardFile.findMany({
    orderBy: { createdAt: 'desc' },
    select:  { week: true, fileType: true },
    take:    50,
  })

  let week = lastWeekStr()
  if (recentFiles.length > 0) {
    const weekScore = new Map<string, Set<string>>()
    for (const f of recentFiles) {
      if (!weekScore.has(f.week)) weekScore.set(f.week, new Set())
      weekScore.get(f.week)!.add(f.fileType)
    }
    // Prefer the week with the most distinct file types; tie-break by recency
    // (recentFiles is already sorted desc so the first occurrence wins ties)
    let bestWeek = recentFiles[0].week
    let bestCount = weekScore.get(bestWeek)?.size ?? 0
    for (const [w, types] of weekScore) {
      if (types.size > bestCount) { bestWeek = w; bestCount = types.size }
    }
    week = bestWeek
  }

  // All uploads for the active checklist week
  const weekUploads = await prisma.scorecardFile.findMany({
    where:   { week },
    select:  { fileType: true, filename: true, rowsImported: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  // Most recent upload per file type
  const uploadedTypes = new Map<string, typeof weekUploads[0]>()
  for (const u of weekUploads) {
    if (!uploadedTypes.has(u.fileType)) uploadedTypes.set(u.fileType, u)
  }

  // All other weeks (for the history section)
  const allOtherUploads = await prisma.scorecardFile.findMany({
    where:   { week: { not: week } },
    select:  { week: true, fileType: true, filename: true, rowsImported: true, createdAt: true },
    orderBy: [{ week: 'desc' }, { createdAt: 'desc' }],
    take:    60,
  })

  const pastByWeek = new Map<string, typeof allOtherUploads>()
  for (const u of allOtherUploads) {
    if (!pastByWeek.has(u.week)) pastByWeek.set(u.week, [])
    pastByWeek.get(u.week)!.push(u)
  }

  const uploadedCount = CHECKLIST.filter(c => uploadedTypes.has(c.type)).length
  const criticalDone  = CHECKLIST.filter(c => c.critical && uploadedTypes.has(c.type)).length
  const criticalTotal = CHECKLIST.filter(c => c.critical).length

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <Link href="/scorecards" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft size={14} /> Back to Scorecards
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Weekly Scorecard Files</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Showing checklist for week <span className="font-mono font-medium">{week}</span>
          {recentFiles.length > 0 ? ' (most recent upload)' : ' (last week)'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: checklist */}
        <div className="col-span-1 space-y-4">
          {/* Progress */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Week {week}</span>
              <span className="text-xs text-gray-500">{uploadedCount} / {CHECKLIST.length} files</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${(uploadedCount / CHECKLIST.length) * 100}%` }}
              />
            </div>
            {criticalDone === criticalTotal ? (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2 flex items-center gap-1.5">
                <CheckCircle size={12} /> All required files uploaded
              </p>
            ) : (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-center gap-1.5">
                <Info size={12} /> {criticalTotal - criticalDone} required file(s) still needed
              </p>
            )}
          </div>

          {/* Checklist */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-700">Required Files</h3>
            </div>
            <ul className="divide-y divide-gray-50">
              {CHECKLIST.map(item => {
                const upload = uploadedTypes.get(item.type)
                return (
                  <li key={item.type} className="px-4 py-3 flex items-start gap-3">
                    {upload ? (
                      <CheckCircle size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <Clock size={18} className={`flex-shrink-0 mt-0.5 ${item.critical ? 'text-amber-400' : 'text-gray-300'}`} />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm font-medium ${upload ? 'text-gray-900' : 'text-gray-500'}`}>
                          {item.label}
                        </span>
                        <span className="text-xs font-mono text-gray-400 bg-gray-100 rounded px-1">{item.ext}</span>
                        {item.critical && !upload && (
                          <span className="text-xs text-amber-600 font-medium">required</span>
                        )}
                      </div>
                      {upload ? (
                        <p className="text-xs text-green-600 truncate mt-0.5">
                          {upload.filename}
                          {upload.rowsImported > 0 && ` · ${upload.rowsImported} DAs`}
                          {' · '}{new Date(upload.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-0.5">{item.hint}</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {/* Right: upload form */}
        <div className="col-span-2 space-y-4">
          <UploadForm />

          <div className="card p-4 bg-blue-50 border-blue-200">
            <p className="text-xs font-medium text-blue-900 mb-1 flex items-center gap-1.5">
              <Info size={13} /> Upload tips
            </p>
            <p className="text-xs text-blue-800">
              Always select the correct file type from the dropdown before uploading —
              Amazon filenames don&apos;t always match what the portal expects.
              The week is detected from the filename (e.g. <span className="font-mono">..._2026-W19.csv</span>).
              The checklist updates automatically after each successful upload.
            </p>
          </div>
        </div>
      </div>

      {/* Past uploads history */}
      {pastByWeek.size > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="section-title">Past Uploads — Historical Reference</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {Array.from(pastByWeek.entries()).map(([w, files]) => {
              const typesUploaded = new Set(files.map(f => f.fileType))
              return (
                <div key={w} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 font-mono">{w}</span>
                    <span className="text-xs text-gray-400">{typesUploaded.size} / {CHECKLIST.length} files</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {CHECKLIST.map(item => {
                      const f = files.find(u => u.fileType === item.type)
                      return (
                        <span key={item.type} className={`flex items-center gap-1 text-xs rounded px-2 py-0.5 ${
                          f ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-gray-50 border border-gray-200 text-gray-400'
                        }`}>
                          {f ? <CheckCircle size={10} /> : <Clock size={10} />}
                          {item.label}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
