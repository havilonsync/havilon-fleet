/**
 * Havilon Fleet — Employee Recognition Engine
 * 
 * Automatically calculates:
 * - Employee of the Week   (every Sunday night after scorecard sync)
 * - Employee of the Month  (last day of each month)
 * - Employee of the Quarter (end of Q1/Q2/Q3/Q4)
 * - Employee of the Year   (Dec 31)
 * 
 * Scoring formula:
 *   Performance Score  = 50% weight (from Amazon scorecard)
 *   Attendance Score   = 30% weight (no call-outs, on time)
 *   Reliability Score  = 20% weight (completed routes, no incidents)
 * 
 *   Final Score = (performance * 0.5) + (attendance * 0.3) + (reliability * 0.2)
 */

import { PrismaClient } from '@prisma/client'
import { getISOWeek, getYear, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, format, subWeeks } from 'date-fns'

const prisma = new PrismaClient()

// ─── Scoring Weights ──────────────────────────────────────────────────────────

const WEIGHTS = {
  performance: 0.50,  // Amazon delivery score
  attendance:  0.30,  // No call-outs / no shows
  reliability: 0.20,  // Completed routes, no incidents
}

const STANDING_SCORES: Record<string, number> = {
  FANTASTIC_PLUS: 100,
  FANTASTIC:       95,
  GREAT:           85,
  GOOD:            75,
  FAIR:            55,
  POOR:            30,
}

// ─── Core scoring function ────────────────────────────────────────────────────

async function calculateDAScore(daId: string, fromDate: string, toDate: string): Promise<{
  daId: string
  name: string
  performanceScore: number
  attendanceScore: number
  reliabilityScore: number
  finalScore: number
  standing: string
  scorecardCount: number
  details: string
}> {
  const da = await prisma.dA.findUnique({
    where: { id: daId },
    include: {
      scorecards: {
        where: { week: { gte: fromDate, lte: toDate } },
        orderBy: { week: 'desc' },
      },
      alerts: {
        where: {
          createdAt: { gte: new Date(fromDate), lte: new Date(toDate) },
          type: { in: ['CALL_OUT', 'NO_SHOW', 'LATE'] },
        },
      },
    },
  })

  if (!da) throw new Error(`DA ${daId} not found`)

  // Performance score — average of Amazon scores in period
  const scorecards = da.scorecards
  let performanceScore = 0
  let standing = 'GOOD'

  if (scorecards.length > 0) {
    const avgDelivery = scorecards.reduce((s, c) => s + c.deliveryScore, 0) / scorecards.length
    const avgQuality  = scorecards.reduce((s, c) => s + c.qualityScore,  0) / scorecards.length
    const avgSafety   = scorecards.reduce((s, c) => s + c.safetyScore,   0) / scorecards.length
    performanceScore = (avgDelivery * 0.5) + (avgQuality * 0.3) + (avgSafety * 0.2)
    standing = scorecards[0].standing
  }

  // Attendance score — deduct points for call-outs and no-shows
  const callOuts = da.alerts.filter(a => a.type === 'CALL_OUT').length
  const noShows  = da.alerts.filter(a => a.type === 'NO_SHOW').length
  const lates    = da.alerts.filter(a => a.type === 'LATE').length
  const attendanceScore = Math.max(0, 100 - (noShows * 20) - (callOuts * 10) - (lates * 5))

  // Reliability score — based on completed routes vs assigned
  const assignedRoutes = await prisma.routeAssignment.count({
    where: {
      daId,
      date: { gte: fromDate, lte: toDate },
    },
  })
  const completedRoutes = await prisma.routeAssignment.count({
    where: {
      daId,
      date: { gte: fromDate, lte: toDate },
      status: 'COMPLETED',
    },
  })
  const reliabilityScore = assignedRoutes > 0
    ? Math.round((completedRoutes / assignedRoutes) * 100)
    : 75 // Default if no route data yet

  // Final weighted score
  const finalScore = Math.round(
    (performanceScore * WEIGHTS.performance) +
    (attendanceScore  * WEIGHTS.attendance)  +
    (reliabilityScore * WEIGHTS.reliability)
  )

  return {
    daId,
    name: da.name,
    performanceScore: Math.round(performanceScore),
    attendanceScore,
    reliabilityScore,
    finalScore,
    standing,
    scorecardCount: scorecards.length,
    details: `Delivery: ${Math.round(performanceScore)} | Attendance: ${attendanceScore} | Reliability: ${reliabilityScore} | Call-outs: ${callOuts} | No-shows: ${noShows}`,
  }
}

// ─── Award Calculator ─────────────────────────────────────────────────────────

async function calculateAward(
  type: 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR',
  fromDate: string,
  toDate: string,
  label: string
) {
  console.log(`🏆 Calculating ${type} award for ${label}...`)

  // Get all active DAs who worked during this period
  const activeDAs = await prisma.dA.findMany({
    where: {
      status: 'ACTIVE',
      scorecards: {
        some: { week: { gte: fromDate, lte: toDate } },
      },
    },
    select: { id: true, name: true },
  })

  if (activeDAs.length === 0) {
    console.log(`No active DAs with scorecards for ${label}`)
    return null
  }

  // Score all DAs
  const scores = await Promise.all(
    activeDAs.map(da => calculateDAScore(da.id, fromDate, toDate))
  )

  // Sort by final score descending
  scores.sort((a, b) => b.finalScore - a.finalScore)

  const winner = scores[0]
  const runnerUp = scores[1] ?? null
  const thirdPlace = scores[2] ?? null

  // Only award if winner has minimum scorecards (was actually working)
  if (winner.scorecardCount === 0 && type !== 'WEEK') {
    console.log(`Winner ${winner.name} has no scorecard data — skipping award`)
    return null
  }

  // Save award to database
  const award = await prisma.employeeAward.upsert({
    where: { type_period: { type, period: label } },
    update: {
      winnerId: winner.daId,
      winnerName: winner.name,
      winnerScore: winner.finalScore,
      runnerUpName: runnerUp?.name,
      runnerUpScore: runnerUp?.finalScore,
      thirdPlaceName: thirdPlace?.name,
      thirdPlaceScore: thirdPlace?.finalScore,
      scoreBreakdown: scores.slice(0, 10) as any,
      calculatedAt: new Date(),
    },
    create: {
      type,
      period: label,
      winnerId: winner.daId,
      winnerName: winner.name,
      winnerScore: winner.finalScore,
      runnerUpName: runnerUp?.name,
      runnerUpScore: runnerUp?.finalScore,
      thirdPlaceName: thirdPlace?.name,
      thirdPlaceScore: thirdPlace?.finalScore,
      scoreBreakdown: scores.slice(0, 10) as any,
      calculatedAt: new Date(),
    },
  })

  // Notify owner and ops managers
  await notifyAward(award, winner, type, label)

  console.log(`✅ ${type} Award: ${winner.name} (${winner.finalScore}/100)`)
  return award
}

// ─── Scheduled Award Runs ─────────────────────────────────────────────────────

export async function runWeeklyAward() {
  const lastWeek = subWeeks(new Date(), 1)
  const week = `${getYear(lastWeek)}-W${String(getISOWeek(lastWeek)).padStart(2, '0')}`
  await calculateAward('WEEK', week, week, week)
}

export async function runMonthlyAward() {
  const lastMonth = new Date()
  lastMonth.setMonth(lastMonth.getMonth() - 1)
  const from = format(startOfMonth(lastMonth), 'yyyy-MM-dd')
  const to   = format(endOfMonth(lastMonth),   'yyyy-MM-dd')
  const label = format(lastMonth, 'MMMM yyyy')
  await calculateAward('MONTH', from, to, label)
}

export async function runQuarterlyAward() {
  const lastQuarter = new Date()
  lastQuarter.setMonth(lastQuarter.getMonth() - 3)
  const from = format(startOfQuarter(lastQuarter), 'yyyy-MM-dd')
  const to   = format(endOfQuarter(lastQuarter),   'yyyy-MM-dd')
  const q = Math.floor(lastQuarter.getMonth() / 3) + 1
  const label = `Q${q} ${getYear(lastQuarter)}`
  await calculateAward('QUARTER', from, to, label)
}

export async function runYearlyAward() {
  const lastYear = new Date()
  lastYear.setFullYear(lastYear.getFullYear() - 1)
  const from = format(startOfYear(lastYear), 'yyyy-MM-dd')
  const to   = format(endOfYear(lastYear),   'yyyy-MM-dd')
  const label = `${getYear(lastYear)}`
  await calculateAward('YEAR', from, to, label)
}

// ─── Notification ─────────────────────────────────────────────────────────────

async function notifyAward(award: any, winner: any, type: string, label: string) {
  const typeLabels: Record<string, string> = {
    WEEK: 'Employee of the Week',
    MONTH: 'Employee of the Month',
    QUARTER: 'Employee of the Quarter',
    YEAR: 'Employee of the Year',
  }
  const title = `🏆 ${typeLabels[type]} — ${label}`
  const body  = `${winner.name} has been selected with a score of ${winner.finalScore}/100. Performance: ${winner.performanceScore} | Attendance: ${winner.attendanceScore} | Reliability: ${winner.reliabilityScore}`

  const recipients = await prisma.user.findMany({
    where: { role: { in: ['OWNER', 'OPS_MANAGER'] }, isActive: true },
  })

  for (const user of recipients) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'EMPLOYEE_AWARD',
        title,
        body,
        channel: 'both',
      },
    })
  }
}
