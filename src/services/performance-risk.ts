/**
 * Havilon Fleet — Performance Risk Engine
 * 
 * Automatically identifies DAs whose consistent poor performance
 * creates unacceptable operational or safety risk.
 * 
 * Risk Levels:
 *   WATCH        → Declining trend, monitor closely
 *   WARNING      → Consistently below threshold, coaching required
 *   NOT_RECOMMENDED → Do not assign routes until improvement shown
 *   FURLOUGH     → Immediate removal from schedule recommended
 * 
 * Runs every Sunday after scorecard sync.
 */

import { PrismaClient } from '@prisma/client'
import { subWeeks, getISOWeek, getYear } from 'date-fns'

const prisma = new PrismaClient()

// ─── Configurable Risk Thresholds ────────────────────────────────────────────

export const RISK_CONFIG = {
  // Minimum weeks of data needed before flagging
  MIN_WEEKS_FOR_ASSESSMENT: 3,

  // Score thresholds (0-100)
  POOR_DELIVERY_SCORE:  75,   // Below this = poor delivery
  POOR_QUALITY_SCORE:   75,   // Below this = poor quality
  POOR_SAFETY_SCORE:    80,   // Safety held to higher standard
  CRITICAL_SAFETY_SCORE: 60,  // Below this = immediate safety risk

  // How many consecutive poor weeks triggers each level
  WATCH_WEEKS:             2,  // 2 weeks poor = watch list
  WARNING_WEEKS:           3,  // 3 weeks poor = formal warning
  NOT_RECOMMENDED_WEEKS:   4,  // 4 weeks poor = pull from routes
  FURLOUGH_WEEKS:          5,  // 5 weeks poor with no improvement = furlough

  // Improvement detection — must improve by this much to exit flag
  IMPROVEMENT_THRESHOLD:  10,  // Score must rise by 10+ points to show improvement

  // Standing levels considered "poor"
  POOR_STANDINGS: ['FAIR', 'POOR'],

  // Safety is weighted heavier — this many poor safety weeks triggers immediate NOT_RECOMMENDED
  SAFETY_FAST_TRACK_WEEKS: 3,
}

// ─── Risk Assessment Types ────────────────────────────────────────────────────

export type RiskLevel = 'WATCH' | 'WARNING' | 'NOT_RECOMMENDED' | 'FURLOUGH'

export interface DAR iskAssessment {
  daId: string
  daName: string
  riskLevel: RiskLevel | null
  consecutivePoorWeeks: number
  avgDeliveryScore: number
  avgQualityScore: number
  avgSafetyScore: number
  trend: 'IMPROVING' | 'DECLINING' | 'FLAT'
  trendDelta: number        // Score change from first to last week assessed
  primaryConcern: string    // What's driving the flag
  recommendation: string    // What action to take
  weeklyScores: any[]       // Raw scorecard history
  lastStanding: string
  safetyRisk: boolean       // True if safety is the primary driver
}

// ─── Main Assessment Function ─────────────────────────────────────────────────

export async function assessDAPerformanceRisk(daId: string): Promise<DAR iskAssessment | null> {
  const da = await prisma.dA.findUnique({
    where: { id: daId },
    include: {
      scorecards: {
        orderBy: { week: 'desc' },
        take: 12, // Assess last 12 weeks
      },
    },
  })

  if (!da) return null

  const scorecards = da.scorecards
  if (scorecards.length < RISK_CONFIG.MIN_WEEKS_FOR_ASSESSMENT) return null

  // ── Calculate averages ────────────────────────────────────────────────────
  const avgDelivery = avg(scorecards.map(s => s.deliveryScore))
  const avgQuality  = avg(scorecards.map(s => s.qualityScore))
  const avgSafety   = avg(scorecards.map(s => s.safetyScore))

  // ── Detect trend ──────────────────────────────────────────────────────────
  // Compare first 3 weeks vs last 3 weeks
  const recentScores = scorecards.slice(0, 3).map(s => s.deliveryScore)
  const olderScores  = scorecards.slice(-3).map(s => s.deliveryScore)
  const recentAvg    = avg(recentScores)
  const olderAvg     = avg(olderScores)
  const trendDelta   = recentAvg - olderAvg

  const trend: DAR iskAssessment['trend'] =
    trendDelta >= RISK_CONFIG.IMPROVEMENT_THRESHOLD  ? 'IMPROVING' :
    trendDelta <= -RISK_CONFIG.IMPROVEMENT_THRESHOLD ? 'DECLINING'  : 'FLAT'

  // ── Count consecutive poor weeks ──────────────────────────────────────────
  let consecutivePoorDelivery = 0
  let consecutivePoorSafety   = 0
  let consecutivePoorQuality  = 0

  for (const sc of scorecards) {
    if (RISK_CONFIG.POOR_STANDINGS.includes(sc.standing) ||
        sc.deliveryScore < RISK_CONFIG.POOR_DELIVERY_SCORE) {
      consecutivePoorDelivery++
    } else break
  }

  for (const sc of scorecards) {
    if (sc.safetyScore < RISK_CONFIG.POOR_SAFETY_SCORE) {
      consecutivePoorSafety++
    } else break
  }

  for (const sc of scorecards) {
    if (sc.qualityScore < RISK_CONFIG.POOR_QUALITY_SCORE) {
      consecutivePoorQuality++
    } else break
  }

  const consecutivePoorWeeks = Math.max(consecutivePoorDelivery, consecutivePoorSafety, consecutivePoorQuality)
  const lastStanding = scorecards[0]?.standing ?? 'GOOD'
  const safetyRisk   = consecutivePoorSafety >= RISK_CONFIG.SAFETY_FAST_TRACK_WEEKS ||
                       (scorecards[0]?.safetyScore ?? 100) < RISK_CONFIG.CRITICAL_SAFETY_SCORE

  // ── Determine risk level ──────────────────────────────────────────────────
  let riskLevel: RiskLevel | null = null
  let primaryConcern = ''
  let recommendation = ''

  // Safety fast-tracks to NOT_RECOMMENDED regardless of other scores
  if (safetyRisk && consecutivePoorSafety >= RISK_CONFIG.SAFETY_FAST_TRACK_WEEKS) {
    riskLevel      = consecutivePoorSafety >= RISK_CONFIG.FURLOUGH_WEEKS ? 'FURLOUGH' : 'NOT_RECOMMENDED'
    primaryConcern = `Safety score has been below ${RISK_CONFIG.POOR_SAFETY_SCORE} for ${consecutivePoorSafety} consecutive weeks (avg: ${avgSafety.toFixed(0)}). This creates direct liability risk.`
    recommendation = riskLevel === 'FURLOUGH'
      ? 'Remove from all route assignments immediately. Schedule safety review meeting before reinstatement.'
      : 'Do not assign routes until safety score improves. Mandatory safety coaching required.'
  }
  // Standard performance-based assessment
  else if (consecutivePoorWeeks >= RISK_CONFIG.FURLOUGH_WEEKS && trend !== 'IMPROVING') {
    riskLevel      = 'FURLOUGH'
    primaryConcern = `${consecutivePoorWeeks} consecutive weeks of poor performance with no improvement. Trend: ${trend}.`
    recommendation = 'Recommend furlough pending formal performance review. Document all coaching attempts before action.'
  }
  else if (consecutivePoorWeeks >= RISK_CONFIG.NOT_RECOMMENDED_WEEKS && trend !== 'IMPROVING') {
    riskLevel      = 'NOT_RECOMMENDED'
    primaryConcern = `${consecutivePoorWeeks} consecutive weeks below threshold. Delivery: ${avgDelivery.toFixed(0)} | Quality: ${avgQuality.toFixed(0)} | Safety: ${avgSafety.toFixed(0)}.`
    recommendation = 'Do not assign routes until scores improve. Schedule coaching session this week.'
  }
  else if (consecutivePoorWeeks >= RISK_CONFIG.WARNING_WEEKS) {
    riskLevel      = 'WARNING'
    primaryConcern = `${consecutivePoorWeeks} consecutive weeks below threshold. ${trend === 'DECLINING' ? 'Scores are declining.' : 'No improvement shown.'}`
    recommendation = 'Issue formal written warning. Schedule performance improvement plan discussion.'
  }
  else if (consecutivePoorWeeks >= RISK_CONFIG.WATCH_WEEKS) {
    riskLevel      = 'WATCH'
    primaryConcern = `${consecutivePoorWeeks} weeks of declining or poor scores. Early intervention recommended.`
    recommendation = 'Have informal coaching conversation. Monitor closely next 2 weeks.'
  }

  // If improving, downgrade risk level one step
  if (trend === 'IMPROVING' && riskLevel && riskLevel !== 'WATCH') {
    const levels: RiskLevel[] = ['WATCH', 'WARNING', 'NOT_RECOMMENDED', 'FURLOUGH']
    const currentIndex = levels.indexOf(riskLevel)
    riskLevel = levels[Math.max(0, currentIndex - 1)]
    recommendation = `Showing improvement (+${trendDelta.toFixed(0)} pts). ` + recommendation
  }

  if (!riskLevel) return null // DA is performing acceptably

  return {
    daId,
    daName: da.name,
    riskLevel,
    consecutivePoorWeeks,
    avgDeliveryScore: Math.round(avgDelivery),
    avgQualityScore:  Math.round(avgQuality),
    avgSafetyScore:   Math.round(avgSafety),
    trend,
    trendDelta:       Math.round(trendDelta),
    primaryConcern,
    recommendation,
    weeklyScores:     scorecards.slice(0, 8),
    lastStanding,
    safetyRisk,
  }
}

// ─── Run assessment for all active DAs ───────────────────────────────────────

export async function runFullRiskAssessment(): Promise<{
  furlough:        DAR iskAssessment[]
  notRecommended:  DAR iskAssessment[]
  warning:         DAR iskAssessment[]
  watch:           DAR iskAssessment[]
}> {
  console.log('🔍 Running full DA performance risk assessment...')

  const activeDAs = await prisma.dA.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
  })

  const results = {
    furlough:       [] as DAR iskAssessment[],
    notRecommended: [] as DAR iskAssessment[],
    warning:        [] as DAR iskAssessment[],
    watch:          [] as DAR iskAssessment[],
  }

  for (const da of activeDAs) {
    const assessment = await assessDAPerformanceRisk(da.id)
    if (!assessment) continue

    // Save to database
    await prisma.dAPerformanceFlag.upsert({
      where: { daId: { daId: da.id } },
      update: {
        riskLevel:            assessment.riskLevel!,
        consecutivePoorWeeks: assessment.consecutivePoorWeeks,
        avgDeliveryScore:     assessment.avgDeliveryScore,
        avgQualityScore:      assessment.avgQualityScore,
        avgSafetyScore:       assessment.avgSafetyScore,
        trend:                assessment.trend,
        trendDelta:           assessment.trendDelta,
        primaryConcern:       assessment.primaryConcern,
        recommendation:       assessment.recommendation,
        safetyRisk:           assessment.safetyRisk,
        lastAssessed:         new Date(),
      },
      create: {
        daId:                 da.id,
        riskLevel:            assessment.riskLevel!,
        consecutivePoorWeeks: assessment.consecutivePoorWeeks,
        avgDeliveryScore:     assessment.avgDeliveryScore,
        avgQualityScore:      assessment.avgQualityScore,
        avgSafetyScore:       assessment.avgSafetyScore,
        trend:                assessment.trend,
        trendDelta:           assessment.trendDelta,
        primaryConcern:       assessment.primaryConcern,
        recommendation:       assessment.recommendation,
        safetyRisk:           assessment.safetyRisk,
        lastAssessed:         new Date(),
      },
    })

    // Categorize
    if      (assessment.riskLevel === 'FURLOUGH')        results.furlough.push(assessment)
    else if (assessment.riskLevel === 'NOT_RECOMMENDED') results.notRecommended.push(assessment)
    else if (assessment.riskLevel === 'WARNING')         results.warning.push(assessment)
    else if (assessment.riskLevel === 'WATCH')           results.watch.push(assessment)
  }

  // Notify owner of furlough and not-recommended DAs immediately
  if (results.furlough.length > 0 || results.notRecommended.length > 0) {
    await notifyOwnerOfRisk(results.furlough, results.notRecommended)
  }

  // Notify ops managers of all flags
  const allFlags = [...results.furlough, ...results.notRecommended, ...results.warning, ...results.watch]
  if (allFlags.length > 0) {
    await notifyOpsOfFlags(allFlags)
  }

  console.log(`✅ Risk assessment complete.`)
  console.log(`   Furlough: ${results.furlough.length} | Not Recommended: ${results.notRecommended.length} | Warning: ${results.warning.length} | Watch: ${results.watch.length}`)

  return results
}

// ─── Notifications ────────────────────────────────────────────────────────────

async function notifyOwnerOfRisk(furlough: DAR iskAssessment[], notRecommended: DAR iskAssessment[]) {
  const owners = await prisma.user.findMany({
    where: { role: 'OWNER', isActive: true },
  })

  const furloughList = furlough.map(d =>
    `• ${d.daName} — ${d.consecutivePoorWeeks} weeks poor | Safety: ${d.avgSafetyScore} | ${d.safetyRisk ? '⚠️ SAFETY RISK' : ''}`
  ).join('\n')

  const notRecList = notRecommended.map(d =>
    `• ${d.daName} — ${d.consecutivePoorWeeks} weeks poor | Trend: ${d.trend}`
  ).join('\n')

  for (const owner of owners) {
    await prisma.notification.create({
      data: {
        userId:     owner.id,
        type:       'PERFORMANCE_RISK',
        title:      `🚨 Performance Risk Alert — ${furlough.length + notRecommended.length} DA(s) require action`,
        body:       `FURLOUGH RECOMMENDED:\n${furloughList || 'None'}\n\nNOT RECOMMENDED FOR ROUTES:\n${notRecList || 'None'}\n\nReview in portal for full assessment and recommended actions.`,
        channel:    'both',
        entityType: 'performance_risk',
      },
    })
  }
}

async function notifyOpsOfFlags(flags: DAR iskAssessment[]) {
  const opsMgrs = await prisma.user.findMany({
    where: { role: 'OPS_MANAGER', isActive: true },
  })

  for (const ops of opsMgrs) {
    await prisma.notification.create({
      data: {
        userId:     ops.id,
        type:       'PERFORMANCE_FLAG',
        title:      `⚠️ ${flags.length} DA(s) flagged in weekly performance review`,
        body:       flags.map(d => `${d.daName}: ${d.riskLevel} — ${d.primaryConcern.slice(0, 80)}...`).join('\n'),
        channel:    'in_app',
        entityType: 'performance_flag',
      },
    })
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function getWeekStart(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4)
  const startOfFirstWeek = new Date(jan4)
  startOfFirstWeek.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
  const result = new Date(startOfFirstWeek)
  result.setDate(startOfFirstWeek.getDate() + (week - 1) * 7)
  return result
}
