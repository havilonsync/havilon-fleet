import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Star, Users, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import prisma from '@/lib/prisma'
import SyncButton from '@/components/scorecards/SyncButton'

const STANDING_BG: Record<string, string> = {
  FANTASTIC_PLUS: 'bg-emerald-500',
  FANTASTIC:      'bg-green-500',
  GREAT:          'bg-blue-500',
  GOOD:           'bg-blue-400',
  FAIR:           'bg-amber-500',
  POOR:           'bg-red-500',
}
const STANDING_BADGE: Record<string, string> = {
  FANTASTIC_PLUS: 'badge-green',
  FANTASTIC:      'badge-green',
  GREAT:          'badge-blue',
  GOOD:           'badge-blue',
  FAIR:           'badge-amber',
  POOR:           'badge-red',
}

function formatStanding(s: string) {
  return s.replace(/_/g, ' ').replace('PLUS', '+')
}

function weekLabel(week: string): { num: string; year: string } {
  const [year, wpart] = week.split('-W')
  return { num: parseInt(wpart, 10).toString(), year }
}

function majorityStanding(standings: string[]): string {
  const counts: Record<string, number> = {}
  for (const s of standings) counts[s] = (counts[s] ?? 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'GOOD'
}

export default async function ScorecardsPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  // Pull all scorecard records (minimal fields) to build week summary
  const allScorecards = await prisma.dAScorecard.findMany({
    select: { week: true, standing: true, deliveryScore: true, daId: true },
    orderBy: { week: 'desc' },
  })

  // Group by week → { standing[], driverIds, totalScore }
  const weekMap = new Map<string, { standings: string[]; daIds: Set<string>; totalScore: number }>()
  for (const sc of allScorecards) {
    if (!weekMap.has(sc.week)) weekMap.set(sc.week, { standings: [], daIds: new Set(), totalScore: 0 })
    const entry = weekMap.get(sc.week)!
    entry.standings.push(sc.standing)
    entry.daIds.add(sc.daId)
    entry.totalScore += sc.deliveryScore
  }

  const weekSummaries = Array.from(weekMap.entries())
    .slice(0, 10)
    .map(([week, data]) => ({
      week,
      drivers: data.daIds.size,
      standing: majorityStanding(data.standings),
      avgScore: data.daIds.size > 0 ? (data.totalScore / data.daIds.size) : 0,
    }))

  const lastSync = await prisma.syncLog.findFirst({
    where: { type: { contains: 'SCORECARD' }, status: 'SUCCESS' },
    orderBy: { runAt: 'desc' },
  })

  // DA detail table for the most recent week with data
  const latestWeek = weekSummaries[0]?.week ?? ''
  const scorecards = latestWeek
    ? await prisma.dAScorecard.findMany({
        where: { week: latestWeek },
        include: { da: { select: { id: true, name: true, status: true } } },
        orderBy: { deliveryScore: 'desc' },
      })
    : []

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Star size={20} className="text-amber-500" />
            DA Scorecards
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Synced from Amazon DSP Portal
            {lastSync && (
              <span className="ml-2 text-xs text-green-600">
                · Last sync: {new Date(lastSync.runAt).toLocaleString()}
              </span>
            )}
          </p>
        </div>
        <SyncButton />
      </div>

      {/* Weekly overview cards — Amazon-style */}
      {weekSummaries.length > 0 ? (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Weekly Performance Overview
          </h2>
          <div className="grid grid-cols-5 gap-3 xl:grid-cols-10">
            {weekSummaries.map(({ week, drivers, standing, avgScore }) => {
              const { num, year } = weekLabel(week)
              const isLatest = week === latestWeek
              return (
                <div
                  key={week}
                  className={`card p-4 text-center transition-shadow ${isLatest ? 'ring-2 ring-blue-400 shadow-md' : 'hover:shadow-md'}`}
                >
                  {/* Week number — big, like Amazon's portal */}
                  <div className="mb-1">
                    <span className="text-4xl font-bold text-gray-900 leading-none">{num}</span>
                  </div>
                  <div className="text-xs text-gray-400 mb-2">{year}</div>

                  {/* Standing badge */}
                  <div className={`text-white text-xs font-bold px-2 py-0.5 rounded-full mb-3 ${STANDING_BG[standing] ?? 'bg-gray-400'}`}>
                    {formatStanding(standing)}
                  </div>

                  {/* Driver count */}
                  <div className="flex items-center justify-center gap-1 text-xs text-gray-500">
                    <Users size={11} />
                    <span className="font-medium text-gray-700">{drivers}</span>
                    <span>DAs</span>
                  </div>

                  {/* Avg score */}
                  <div className="text-xs text-gray-400 mt-1">
                    {avgScore.toFixed(0)}% avg
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="card p-10 text-center">
          <Star size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">No scorecard data yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Click Sync Now to pull data from Amazon DSP Portal,<br />
            or add individual scorecards from each DA's profile page.
          </p>
        </div>
      )}

      {/* DA detail table for selected week */}
      {latestWeek && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="section-title">Week {latestWeek} — Individual DA Scores</h3>
            <span className="text-xs text-gray-400">{scorecards.length} DAs</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['DA Name', 'Standing', 'DCR %', 'Quality', 'Safety', 'DNR DPMO', 'DSB Rate', 'Trend'].map(h => (
                    <th key={h} className="table-header text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scorecards.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="table-cell">
                      <Link href={`/da/${s.da.id}`} className="font-medium hover:text-blue-600">
                        {s.da.name}
                      </Link>
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${STANDING_BADGE[s.standing] ?? 'badge-gray'}`}>
                        {formatStanding(s.standing)}
                      </span>
                    </td>
                    <td className="table-cell">
                      <ScoreBar score={s.deliveryScore} />
                    </td>
                    <td className="table-cell">
                      <ScoreBar score={s.qualityScore} />
                    </td>
                    <td className="table-cell">
                      <ScoreBar score={s.safetyScore} />
                    </td>
                    <td className="table-cell text-sm">
                      <span className={s.dnrRate > 5 ? 'text-red-600 font-medium' : 'text-gray-600'}>
                        {s.dnrRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="table-cell text-sm">
                      <span className={s.dsbRate < 90 ? 'text-amber-600 font-medium' : 'text-gray-600'}>
                        {s.dsbRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="table-cell">
                      <TrendIcon score={s.deliveryScore} />
                    </td>
                  </tr>
                ))}
                {scorecards.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-sm text-gray-400">
                      No DA scorecard entries for week {latestWeek}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 90 ? 'risk-fill-low' : score >= 75 ? 'risk-fill-medium' : 'risk-fill-high'
  return (
    <div className="flex items-center gap-2">
      <div className="risk-bar w-14">
        <div className={`risk-fill ${color}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-xs font-medium">{score > 0 ? score.toFixed(0) : '—'}</span>
    </div>
  )
}

function TrendIcon({ score }: { score: number }) {
  if (score >= 90) return <TrendingUp size={14} className="text-green-500" />
  if (score <= 70) return <TrendingDown size={14} className="text-red-500" />
  return <Minus size={14} className="text-gray-400" />
}
