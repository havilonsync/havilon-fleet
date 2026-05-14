import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Star, Users, TrendingUp, TrendingDown, Minus, Upload, Trophy, AlertTriangle } from 'lucide-react'
import { getISOWeek, getYear, getMonth } from 'date-fns'
import prisma from '@/lib/prisma'
import SyncButton from '@/components/scorecards/SyncButton'

// ─── Standing helpers ─────────────────────────────────────────────────────────
const STANDING_BG: Record<string, string> = {
  FANTASTIC_PLUS: 'bg-emerald-500', FANTASTIC: 'bg-green-500',
  GREAT: 'bg-blue-500',             GOOD: 'bg-blue-400',
  FAIR: 'bg-amber-500',             POOR: 'bg-red-500',
}
const STANDING_BADGE: Record<string, string> = {
  FANTASTIC_PLUS: 'badge-green', FANTASTIC: 'badge-green',
  GREAT: 'badge-blue',           GOOD: 'badge-blue',
  FAIR: 'badge-amber',           POOR: 'badge-red',
}

function formatStanding(s: string) { return s.replace(/_/g, ' ').replace('PLUS', '+') }

function weekLabel(week: string) {
  const [year, wpart] = week.split('-W')
  return { num: parseInt(wpart, 10).toString(), year }
}

function majorityStanding(standings: string[]): string {
  const counts: Record<string, number> = {}
  for (const s of standings) counts[s] = (counts[s] ?? 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'GOOD'
}

// ISO week → which month does its Thursday fall in? (ISO standard)
function weekToMonth(weekStr: string): number {
  const [year, wNum] = weekStr.split('-W').map(Number)
  const jan4 = new Date(year, 0, 4)
  const dayOfWeek = jan4.getDay() || 7
  const monOfWeek1 = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000)
  const monday = new Date(monOfWeek1.getTime() + (wNum - 1) * 7 * 86400000)
  const thursday = new Date(monday.getTime() + 3 * 86400000)
  return thursday.getMonth() + 1 // 1–12
}

// ─── Coaching recommendation generator ───────────────────────────────────────
function coachingTips(sc: { deliveryScore: number; safetyScore: number; qualityScore: number; dnrRate: number; dsbRate: number; standing: string }): string[] {
  const tips: string[] = []
  if (sc.standing === 'POOR')          tips.push('Immediate Performance Improvement Plan (PIP) recommended — schedule urgent 1:1')
  else if (sc.standing === 'FAIR')     tips.push('Performance is below standard — schedule weekly check-ins and set clear targets')
  if (sc.deliveryScore < 85)           tips.push(`DCR at ${sc.deliveryScore.toFixed(0)}% — review route planning and time management`)
  else if (sc.deliveryScore < 90)      tips.push(`DCR at ${sc.deliveryScore.toFixed(0)}% — close to threshold, focus on reducing failed attempts`)
  if (sc.safetyScore > 0 && sc.safetyScore < 80)   tips.push(`Safety score ${sc.safetyScore.toFixed(0)} — mandatory safety coaching, review at-stop behaviors`)
  else if (sc.safetyScore > 0 && sc.safetyScore < 90) tips.push(`Safety score ${sc.safetyScore.toFixed(0)} — reinforce safe driving habits, monitor FICO score`)
  if (sc.qualityScore > 0 && sc.qualityScore < 85)  tips.push(`Quality score ${sc.qualityScore.toFixed(0)}% — retrain on POD photo requirements and delivery confirmation`)
  if (sc.dnrRate > 3)                  tips.push(`DNR rate ${sc.dnrRate.toFixed(1)}% is high — coach on package reconciliation before returning to station`)
  if (sc.dsbRate > 0 && sc.dsbRate < 90) tips.push(`DSB ${sc.dsbRate.toFixed(1)}% — review delivery location accuracy and customer-facing behaviors`)
  return tips.length ? tips : ['Maintain current performance — continue good habits']
}

const MEDAL = ['🥇', '🥈', '🥉']

export default async function ScorecardsPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  const now         = new Date()
  const currentMonth = getMonth(now) + 1 // 1–12

  // All scorecards with DA info
  const all = await prisma.dAScorecard.findMany({
    select: {
      id: true, week: true, standing: true,
      deliveryScore: true, qualityScore: true, safetyScore: true,
      dnrRate: true, dsbRate: true, daId: true,
      da: { select: { id: true, name: true, status: true } },
    },
    orderBy: { week: 'desc' },
  })

  // Group by week
  const weekMap = new Map<string, typeof all>()
  for (const sc of all) {
    if (!weekMap.has(sc.week)) weekMap.set(sc.week, [])
    weekMap.get(sc.week)!.push(sc)
  }

  const weekSummaries = Array.from(weekMap.entries())
    .slice(0, 10)
    .map(([week, scs]) => ({
      week,
      drivers:  new Set(scs.map(s => s.daId)).size,
      standing: majorityStanding(scs.map(s => s.standing)),
      avgScore: scs.length ? scs.reduce((t, s) => t + s.deliveryScore, 0) / scs.length : 0,
    }))

  const latestWeek = weekSummaries[0]?.week ?? ''
  const weekScorecards = weekMap.get(latestWeek) ?? []

  // ── Monthly scorecards (current month) ────────────────────────────────────
  const monthScorecards = all.filter(sc => weekToMonth(sc.week) === currentMonth)

  // Average per DA for monthly
  const monthByDA = new Map<string, { name: string; scores: number[]; safetyScores: number[]; qualityScores: number[]; dnrRates: number[]; dsbRates: number[]; standings: string[]; daId: string }>()
  for (const sc of monthScorecards) {
    if (!monthByDA.has(sc.daId)) {
      monthByDA.set(sc.daId, { name: sc.da.name, daId: sc.da.id, scores: [], safetyScores: [], qualityScores: [], dnrRates: [], dsbRates: [], standings: [] })
    }
    const e = monthByDA.get(sc.daId)!
    e.scores.push(sc.deliveryScore)
    e.safetyScores.push(sc.safetyScore)
    e.qualityScores.push(sc.qualityScore)
    e.dnrRates.push(sc.dnrRate)
    e.dsbRates.push(sc.dsbRate)
    e.standings.push(sc.standing)
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

  const monthlyRanked = Array.from(monthByDA.values())
    .map(e => ({
      daId: e.daId, name: e.name,
      deliveryScore: avg(e.scores),
      safetyScore:   avg(e.safetyScores),
      qualityScore:  avg(e.qualityScores),
      dnrRate:       avg(e.dnrRates),
      dsbRate:       avg(e.dsbRates),
      standing:      majorityStanding(e.standings),
      weeks:         e.scores.length,
    }))
    .sort((a, b) => b.deliveryScore - a.deliveryScore)

  // Weekly ranked (latest week only)
  const weeklyRanked = [...weekScorecards].sort((a, b) => b.deliveryScore - a.deliveryScore)

  const weekTop3    = weeklyRanked.slice(0, 3)
  const weekBottom3 = weeklyRanked.slice(-3).reverse()
  const monthTop3   = monthlyRanked.slice(0, 3)
  const monthBottom3 = monthlyRanked.slice(-3).reverse()

  const lastSync = await prisma.syncLog.findFirst({
    where: { type: { contains: 'SCORECARD' }, status: 'SUCCESS' },
    orderBy: { runAt: 'desc' },
  })

  const scorecards = weekScorecards.slice().sort((a, b) => b.deliveryScore - a.deliveryScore)

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Star size={20} className="text-amber-500" /> DA Scorecards
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
        <div className="flex gap-2">
          <Link href="/scorecards/upload" className="btn-secondary flex items-center gap-1.5 text-sm">
            <Upload size={14} /> Upload Files
          </Link>
          <SyncButton />
        </div>
      </div>

      {/* Weekly cards */}
      {weekSummaries.length > 0 ? (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Weekly Performance Overview</h2>
          <div className="grid grid-cols-5 gap-3 xl:grid-cols-10">
            {weekSummaries.map(({ week, drivers, standing, avgScore }) => {
              const { num, year } = weekLabel(week)
              return (
                <div key={week} className={`card p-4 text-center transition-shadow ${week === latestWeek ? 'ring-2 ring-blue-400 shadow-md' : 'hover:shadow-md'}`}>
                  <div className="mb-1">
                    <span className="text-4xl font-bold text-gray-900 leading-none">{num}</span>
                  </div>
                  <div className="text-xs text-gray-400 mb-2">{year}</div>
                  <div className={`text-white text-xs font-bold px-2 py-0.5 rounded-full mb-3 ${STANDING_BG[standing] ?? 'bg-gray-400'}`}>
                    {formatStanding(standing)}
                  </div>
                  <div className="flex items-center justify-center gap-1 text-xs text-gray-500">
                    <Users size={11} />
                    <span className="font-medium text-gray-700">{drivers}</span>
                    <span>DAs</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{avgScore.toFixed(0)}% avg</div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="card p-10 text-center">
          <Star size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">No scorecard data yet</p>
          <p className="text-xs text-gray-400 mt-1">Click Upload Files to import your Amazon DSP Portal exports.</p>
        </div>
      )}

      {/* Top 3 / Bottom 3 */}
      {(weekTop3.length > 0 || monthTop3.length > 0) && (
        <div className="grid grid-cols-2 gap-6">
          {/* Weekly Top 3 */}
          <PerformerCard title="Weekly Top 3" subtitle={`Week ${latestWeek}`} color="green" icon={<Trophy size={15} className="text-amber-500" />}>
            {weekTop3.map((s, i) => (
              <PerformerRow key={s.id} medal={MEDAL[i]} name={s.da.name} score={s.deliveryScore} standing={s.standing} daId={s.da.id} />
            ))}
          </PerformerCard>

          {/* Monthly Top 3 */}
          <PerformerCard title="Monthly Top 3" subtitle={`${now.toLocaleString('default', { month: 'long' })} ${getYear(now)}`} color="green" icon={<Trophy size={15} className="text-amber-500" />}>
            {monthTop3.map((s, i) => (
              <PerformerRow key={s.daId} medal={MEDAL[i]} name={s.name} score={s.deliveryScore} standing={s.standing} daId={s.daId} weeks={s.weeks} />
            ))}
          </PerformerCard>

          {/* Weekly Bottom 3 */}
          <PerformerCard title="Weekly Bottom 3" subtitle={`Week ${latestWeek} — Needs Coaching`} color="red" icon={<AlertTriangle size={15} className="text-red-500" />}>
            {weekBottom3.map((s, i) => (
              <CoachingRow key={s.id} rank={i + 1} name={s.da.name} score={s.deliveryScore} standing={s.standing} daId={s.da.id}
                tips={coachingTips({ deliveryScore: s.deliveryScore, safetyScore: s.safetyScore, qualityScore: s.qualityScore, dnrRate: s.dnrRate, dsbRate: s.dsbRate, standing: s.standing })} />
            ))}
          </PerformerCard>

          {/* Monthly Bottom 3 */}
          <PerformerCard title="Monthly Bottom 3" subtitle={`${now.toLocaleString('default', { month: 'long' })} — Needs Coaching`} color="red" icon={<AlertTriangle size={15} className="text-red-500" />}>
            {monthBottom3.map((s, i) => (
              <CoachingRow key={s.daId} rank={i + 1} name={s.name} score={s.deliveryScore} standing={s.standing} daId={s.daId} weeks={s.weeks}
                tips={coachingTips({ deliveryScore: s.deliveryScore, safetyScore: s.safetyScore, qualityScore: s.qualityScore, dnrRate: s.dnrRate, dsbRate: s.dsbRate, standing: s.standing })} />
            ))}
          </PerformerCard>
        </div>
      )}

      {/* Full DA table */}
      {latestWeek && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="section-title">Week {latestWeek} — All DAs</h3>
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
                      <Link href={`/da/${s.da.id}`} className="font-medium hover:text-blue-600">{s.da.name}</Link>
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${STANDING_BADGE[s.standing] ?? 'badge-gray'}`}>{formatStanding(s.standing)}</span>
                    </td>
                    <td className="table-cell"><ScoreBar score={s.deliveryScore} /></td>
                    <td className="table-cell"><ScoreBar score={s.qualityScore} /></td>
                    <td className="table-cell"><ScoreBar score={s.safetyScore} /></td>
                    <td className="table-cell text-sm">
                      <span className={s.dnrRate > 5 ? 'text-red-600 font-medium' : 'text-gray-600'}>{s.dnrRate.toFixed(1)}%</span>
                    </td>
                    <td className="table-cell text-sm">
                      <span className={s.dsbRate < 90 ? 'text-amber-600 font-medium' : 'text-gray-600'}>{s.dsbRate.toFixed(1)}%</span>
                    </td>
                    <td className="table-cell"><TrendIcon score={s.deliveryScore} /></td>
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function PerformerCard({ title, subtitle, color, icon, children }: {
  title: string; subtitle: string; color: 'green' | 'red'; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className={`card overflow-hidden border-t-4 ${color === 'green' ? 'border-t-green-400' : 'border-t-red-400'}`}>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        {icon}
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
      </div>
      <div className="divide-y divide-gray-50">{children}</div>
    </div>
  )
}

function PerformerRow({ medal, name, score, standing, daId, weeks }: {
  medal: string; name: string; score: number; standing: string; daId: string; weeks?: number
}) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <span className="text-xl w-7 text-center flex-shrink-0">{medal}</span>
      <div className="flex-1 min-w-0">
        <Link href={`/da/${daId}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block">{name}</Link>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`badge text-xs ${STANDING_BADGE[standing] ?? 'badge-gray'}`}>{formatStanding(standing)}</span>
          {weeks && <span className="text-xs text-gray-400">{weeks} week{weeks > 1 ? 's' : ''}</span>}
        </div>
      </div>
      <span className="text-lg font-bold text-gray-900 flex-shrink-0">{score.toFixed(0)}%</span>
    </div>
  )
}

function CoachingRow({ rank, name, score, standing, daId, tips, weeks }: {
  rank: number; name: string; score: number; standing: string; daId: string; tips: string[]; weeks?: number
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm font-bold text-gray-400 w-5">#{rank}</span>
        <div className="flex-1">
          <Link href={`/da/${daId}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">{name}</Link>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`badge text-xs ${STANDING_BADGE[standing] ?? 'badge-gray'}`}>{formatStanding(standing)}</span>
            {weeks && <span className="text-xs text-gray-400">{weeks}w avg</span>}
          </div>
        </div>
        <span className="text-base font-bold text-red-600">{score.toFixed(0)}%</span>
      </div>
      <ul className="space-y-1 ml-8">
        {tips.map((tip, i) => (
          <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
            <span className="text-amber-500 flex-shrink-0 mt-0.5">•</span>
            {tip}
          </li>
        ))}
      </ul>
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
