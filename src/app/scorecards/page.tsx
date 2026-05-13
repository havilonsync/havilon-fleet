import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getISOWeek, getYear, subWeeks } from 'date-fns'
import Link from 'next/link'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Star } from 'lucide-react'
import prisma from '@/lib/prisma'


function currentWeekStr() {
  const now = new Date()
  return `${getYear(now)}-W${String(getISOWeek(now)).padStart(2, '0')}`
}

function lastWeekStr() {
  const d = subWeeks(new Date(), 1)
  return `${getYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`
}

const STANDING_ORDER = ['FANTASTIC_PLUS', 'FANTASTIC', 'GREAT', 'GOOD', 'FAIR', 'POOR']
const STANDING_COLORS: Record<string, string> = {
  FANTASTIC_PLUS: 'badge-green',
  FANTASTIC: 'badge-green',
  GREAT: 'badge-blue',
  GOOD: 'badge-blue',
  FAIR: 'badge-amber',
  POOR: 'badge-red',
}

function formatStanding(s: string) {
  return s.replace(/_/g, ' ').replace('PLUS', '+')
}

export default async function ScorecardsPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  const week = lastWeekStr()

  // @ts-ignore - models available after prisma generate
  const [scorecards, lastSync, weeklyAlerts] = await Promise.all([
    prisma.dAScorecard.findMany({
      where: { week },
      include: {
        da: {
          select: {
            id: true, name: true, status: true,
            _count: { select: { scorecards: true } },
          },
        },
      },
      orderBy: { deliveryScore: 'desc' },
    }),
    prisma.syncLog.findFirst({
      where: { type: { contains: 'SCORECARD' }, status: 'SUCCESS' },
      orderBy: { runAt: 'desc' },
    }),
    prisma.dAAlert.findMany({
      where: { week, type: 'LOW_PERFORMANCE', isResolved: false },
      include: { da: { select: { name: true } } },
    }),
  ])

  const fantastic = scorecards.filter(s => ['FANTASTIC_PLUS', 'FANTASTIC'].includes(s.standing))
  const atRisk = scorecards.filter(s => ['FAIR', 'POOR'].includes(s.standing))
  const avgScore = scorecards.length
    ? (scorecards.reduce((t, s) => t + s.deliveryScore, 0) / scorecards.length).toFixed(1)
    : '—'

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Star size={20} className="text-amber-500" />
            DA Scorecards
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Week {week} · Auto-synced from Amazon DSP Portal
            {lastSync && (
              <span className="ml-2 text-xs text-green-600">
                · Last sync: {new Date(lastSync.runAt).toLocaleString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <form action="/api/amazon/sync" method="POST">
            <button className="btn-secondary text-sm">↻ Sync Now</button>
          </form>
        </div>
      </div>

      {/* Alert strip for low performers */}
      {atRisk.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-medium text-red-800">
              {atRisk.length} DA{atRisk.length > 1 ? 's' : ''} at risk this week
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              {atRisk.map(s => (
                <span key={s.id} className="badge badge-red">
                  {s.da.name} — {formatStanding(s.standing)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">DAs Scored</p>
          <p className="text-2xl font-semibold">{scorecards.length}</p>
          <p className="text-xs text-gray-400 mt-1">Week {week}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Avg Delivery Score</p>
          <p className="text-2xl font-semibold">{avgScore}</p>
        </div>
        <div className="stat-card border-green-200 bg-green-50">
          <p className="text-xs text-gray-500 mb-1">Fantastic / Fantastic+</p>
          <p className="text-2xl font-semibold text-green-600">{fantastic.length}</p>
        </div>
        <div className="stat-card border-red-200 bg-red-50">
          <p className="text-xs text-gray-500 mb-1">Fair / Poor</p>
          <p className="text-2xl font-semibold text-red-600">{atRisk.length}</p>
          <p className="text-xs text-gray-400 mt-1">Need coaching</p>
        </div>
      </div>

      {/* Scorecard table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="section-title">Week {week} — All DAs</h3>
          {scorecards.length === 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              No data yet — sync needed
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['DA Name', 'Standing', 'Delivery', 'Quality', 'Safety', 'DNR Rate', 'DSB Rate', 'Trend'].map(h => (
                  <th key={h} className="table-header text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scorecards.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <Link href={`/staff/da/${s.da.id}`} className="font-medium hover:text-blue-600">
                      {s.da.name}
                    </Link>
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${STANDING_COLORS[s.standing] ?? 'badge-gray'}`}>
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
                  <td className="table-cell">
                    <span className={s.dnrRate > 5 ? 'text-red-600 font-medium' : 'text-gray-600'}>
                      {s.dnrRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="table-cell">
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
                    <div className="space-y-2">
                      <p>No scorecard data for week {week}</p>
                      <p className="text-xs">
                        Create your Amazon sync account and run the initial sync to populate this table automatically.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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
