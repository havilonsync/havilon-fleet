import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AlertTriangle, ShieldAlert, TrendingDown, TrendingUp, Minus, Eye } from 'lucide-react'
import prisma from '@/lib/prisma'


const RISK_COLORS: Record<string, string> = {
  FURLOUGH:        'red',
  NOT_RECOMMENDED: 'red',
  WARNING:         'amber',
  WATCH:           'blue',
}

const RISK_LABELS: Record<string, string> = {
  FURLOUGH:        '🚨 Furlough Recommended',
  NOT_RECOMMENDED: '⛔ Not Recommended for Routes',
  WARNING:         '⚠️ Formal Warning Required',
  WATCH:           '👁️ Watch List',
}

const TREND_ICONS: Record<string, any> = {
  IMPROVING: TrendingUp,
  DECLINING: TrendingDown,
  FLAT:      Minus,
}

const TREND_COLORS: Record<string, string> = {
  IMPROVING: 'text-green-600',
  DECLINING: 'text-red-600',
  FLAT:      'text-gray-400',
}

export default async function PerformanceRiskPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  const userRole = (session.user as any).role
  if (!['OWNER', 'OPS_MANAGER'].includes(userRole)) redirect('/dashboard')

  // @ts-ignore - models available after prisma generate
  const [flags, overtimeAlerts, hoursThisWeek] = await Promise.all([
    prisma.dAPerformanceFlag.findMany({
      where: { isResolved: false },
      orderBy: [
        { riskLevel: 'asc' }, // FURLOUGH first (alphabetically happens to work)
        { consecutivePoorWeeks: 'desc' },
      ],
    }),
    prisma.dAHoursLog.findMany({
      where: {
        status: { in: ['OVERTIME', 'CRITICAL', 'WARNING'] },
      },
      orderBy: { weeklyHoursWorked: 'desc' },
      take: 20,
    }),
    prisma.dAHoursLog.findMany({
      where: { status: { not: 'NORMAL' } },
      orderBy: { weeklyHoursWorked: 'desc' },
    }),
  ])

  const furloughFlags       = flags.filter(f => f.riskLevel === 'FURLOUGH')
  const notRecommendedFlags = flags.filter(f => f.riskLevel === 'NOT_RECOMMENDED')
  const warningFlags        = flags.filter(f => f.riskLevel === 'WARNING')
  const watchFlags          = flags.filter(f => f.riskLevel === 'WATCH')
  const safetyFlags         = flags.filter(f => f.safetyRisk)
  const overtimeWorkers     = hoursThisWeek.filter(h => h.status === 'OVERTIME' || h.status === 'CRITICAL')

  return (
    <div className="space-y-6 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <ShieldAlert size={20} className="text-red-600" />
            Performance Risk Center
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Auto-assessed weekly from Amazon scorecard data
          </p>
        </div>
        {userRole === 'OWNER' && (
          <form action="/api/performance/assess" method="POST">
            <button className="btn-secondary text-sm">↻ Run Assessment Now</button>
          </form>
        )}
      </div>

      {/* Critical banner */}
      {(furloughFlags.length > 0 || safetyFlags.length > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
          <div className="flex-1">
            <p className="font-semibold text-red-800">Immediate action required</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {furloughFlags.map(f => (
                <span key={f.id} className="badge badge-red">
                  {f.daId} — Furlough {f.safetyRisk ? '⚠️ Safety Risk' : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="stat-card border-red-200 bg-red-50">
          <p className="text-xs text-gray-500 mb-1">Furlough</p>
          <p className="text-2xl font-semibold text-red-600">{furloughFlags.length}</p>
          <p className="text-xs text-gray-400 mt-1">Immediate action</p>
        </div>
        <div className="stat-card border-red-200 bg-red-50">
          <p className="text-xs text-gray-500 mb-1">Not Recommended</p>
          <p className="text-2xl font-semibold text-red-600">{notRecommendedFlags.length}</p>
          <p className="text-xs text-gray-400 mt-1">Pull from routes</p>
        </div>
        <div className="stat-card border-amber-200 bg-amber-50">
          <p className="text-xs text-gray-500 mb-1">Formal Warning</p>
          <p className="text-2xl font-semibold text-amber-600">{warningFlags.length}</p>
          <p className="text-xs text-gray-400 mt-1">Coaching required</p>
        </div>
        <div className="stat-card border-blue-200 bg-blue-50">
          <p className="text-xs text-gray-500 mb-1">Watch List</p>
          <p className="text-2xl font-semibold text-blue-600">{watchFlags.length}</p>
          <p className="text-xs text-gray-400 mt-1">Monitor closely</p>
        </div>
        <div className="stat-card border-amber-200 bg-amber-50">
          <p className="text-xs text-gray-500 mb-1">In Overtime</p>
          <p className="text-2xl font-semibold text-amber-600">{overtimeWorkers.length}</p>
          <p className="text-xs text-gray-400 mt-1">This week</p>
        </div>
      </div>

      {/* Performance risk flags */}
      <div>
        <h2 className="section-title mb-3">Performance Flags</h2>
        <div className="space-y-3">
          {flags.length === 0 ? (
            <div className="card p-10 text-center text-sm text-gray-400">
              No performance flags — all DAs are within acceptable thresholds.
            </div>
          ) : flags.map(flag => {
            const color = RISK_COLORS[flag.riskLevel] ?? 'gray'
            const TrendIcon = TREND_ICONS[flag.trend] ?? Minus

            return (
              <div
                key={flag.id}
                className={`card p-4 border-l-4 ${
                  flag.riskLevel === 'FURLOUGH' || flag.riskLevel === 'NOT_RECOMMENDED'
                    ? 'border-l-red-500'
                    : flag.riskLevel === 'WARNING'
                    ? 'border-l-amber-400'
                    : 'border-l-blue-400'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">

                    {/* DA name + risk level */}
                    <div className="flex items-center gap-3 flex-wrap mb-2">
                      <span className="font-semibold text-gray-900">{flag.daId}</span>
                      <span className={`badge badge-${color}`}>
                        {RISK_LABELS[flag.riskLevel]}
                      </span>
                      {flag.safetyRisk && (
                        <span className="badge badge-red">⚠️ Safety Risk</span>
                      )}
                      <span className={`flex items-center gap-1 text-xs ${TREND_COLORS[flag.trend]}`}>
                        <TrendIcon size={12} />
                        {flag.trend}
                        {flag.trendDelta !== 0 && (
                          <span>({flag.trendDelta > 0 ? '+' : ''}{flag.trendDelta} pts)</span>
                        )}
                      </span>
                    </div>

                    {/* Score summary */}
                    <div className="flex gap-4 mb-2">
                      <ScorePill label="Delivery" score={flag.avgDeliveryScore} threshold={75} />
                      <ScorePill label="Quality"  score={flag.avgQualityScore}  threshold={75} />
                      <ScorePill label="Safety"   score={flag.avgSafetyScore}   threshold={80} />
                      <span className="text-xs text-gray-500 self-center">
                        {flag.consecutivePoorWeeks} consecutive poor weeks
                      </span>
                    </div>

                    {/* Concern */}
                    <p className="text-sm text-gray-600 mb-1">
                      <span className="font-medium">Issue:</span> {flag.primaryConcern}
                    </p>

                    {/* Recommendation */}
                    <p className={`text-sm font-medium ${
                      flag.riskLevel === 'FURLOUGH' || flag.riskLevel === 'NOT_RECOMMENDED'
                        ? 'text-red-700'
                        : 'text-amber-700'
                    }`}>
                      → {flag.recommendation}
                    </p>
                  </div>

                  {/* Actions */}
                  {userRole === 'OWNER' && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <form action={`/api/performance/resolve/${flag.id}`} method="POST">
                        <button className="btn-secondary text-xs w-full">Mark Resolved</button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Overtime section */}
      {hoursThisWeek.length > 0 && (
        <div>
          <h2 className="section-title mb-3">Overtime & Hours Alerts</h2>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  {['DA', 'Hours Worked', 'Projected', 'OT Hours', 'Status'].map(h => (
                    <th key={h} className="table-header text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hoursThisWeek.map(h => (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{h.daId}</td>
                    <td className="table-cell">
                      <span className={h.weeklyHoursWorked >= 40 ? 'text-red-600 font-semibold' : 'text-amber-600 font-medium'}>
                        {h.weeklyHoursWorked.toFixed(1)} hrs
                      </span>
                    </td>
                    <td className="table-cell text-gray-600">
                      {h.projectedWeeklyHours.toFixed(1)} hrs
                    </td>
                    <td className="table-cell">
                      {h.overtimeHours > 0 ? (
                        <span className="text-red-600 font-medium">+{h.overtimeHours.toFixed(1)} OT</span>
                      ) : '—'}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${
                        h.status === 'CRITICAL'  ? 'badge-red'   :
                        h.status === 'OVERTIME'  ? 'badge-red'   :
                        h.status === 'WARNING'   ? 'badge-amber' : 'badge-gray'
                      }`}>
                        {h.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ScorePill({ label, score, threshold }: { label: string; score: number; threshold: number }) {
  const bad = score < threshold
  return (
    <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${
      bad ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-50 text-gray-600 border border-gray-200'
    }`}>
      <span>{label}:</span>
      <span className="font-semibold">{score}</span>
    </div>
  )
}
