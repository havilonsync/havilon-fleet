/**
 * Havilon Fleet — Amazon Performance Data Service
 * 
 * Calls the exact API endpoints discovered from logistics.amazon.com:
 * /performance/api/v1/getData?dataSetId=...&dsp=HAVL&station=DDF4&timeFrame=Weekly
 * 
 * Dataset IDs confirmed from network inspection:
 * - da_dsp_station_weekly_dsb_dnr         → delivery success / did not return rates
 * - da_dsp_station_weekly_supplemental_quality → quality scores per DA
 * - page_notification                      → alerts and standing flags
 * 
 * Additional dataset IDs to probe (standard across all DSPs):
 * - da_dsp_station_weekly_safety           → safety scores
 * - da_dsp_station_weekly_productivity     → productivity / packages per hour
 * - da_dsp_station_da_list                 → full DA roster from Amazon's side
 */

import { callAmazonAPI } from './auth'
import { getISOWeek, getYear, subWeeks, format } from 'date-fns'

import prisma from '@/lib/prisma'

const DSP_CODE = process.env.AMAZON_DSP_CODE ?? 'HAVL'
const STATION_CODE = process.env.AMAZON_STATION_CODE ?? 'DDF4'

// ─── Week formatter ───────────────────────────────────────────────────────────
// Amazon uses format: 2026-W20

function formatWeek(date: Date): string {
  const week = getISOWeek(date)
  const year = getYear(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

function currentWeek(): string { return formatWeek(new Date()) }
function lastWeek(): string { return formatWeek(subWeeks(new Date(), 1)) }

// ─── Core API caller for performance data ─────────────────────────────────────

async function getPerformanceData(dataSetId: string, weekStr?: string): Promise<any> {
  const week = weekStr ?? currentWeek()
  
  return callAmazonAPI('/performance/api/v1/getData', {
    dataSetId,
    dsp: DSP_CODE,
    station: STATION_CODE,
    timeFrame: 'Weekly',
    from: week,
    to: week,
    page: 'delivery_associate',
  })
}

// ─── DA Scorecard Fetcher ─────────────────────────────────────────────────────

export interface DAScorecardRaw {
  daId: string           // Amazon DA ID (transponder ID format)
  daName: string
  deliveryScore: number  // Overall delivery score 0-100
  qualityScore: number
  safetyScore: number
  dnrRate: number        // Did Not Return rate (lower = better)
  dsbRate: number        // Delivered Successfully by Bucket rate
  week: string
  standing: 'FANTASTIC_PLUS' | 'FANTASTIC' | 'GREAT' | 'GOOD' | 'FAIR' | 'POOR'
}

export async function fetchDAScorecardsForWeek(weekStr?: string): Promise<DAScorecardRaw[]> {
  const week = weekStr ?? currentWeek()
  console.log(`📊 Fetching DA scorecards for week ${week}...`)

  try {
    // Fetch primary delivery metrics
    const [deliveryData, qualityData] = await Promise.allSettled([
      getPerformanceData('da_dsp_station_weekly_dsb_dnr', week),
      getPerformanceData('da_dsp_station_weekly_supplemental_quality', week),
    ])

    // Normalize data — Amazon's response structure varies but typically:
    // { data: { rows: [...], columns: [...] } } or { tableData: [...] }
    const delivery = deliveryData.status === 'fulfilled' ? deliveryData.value : null
    const quality = qualityData.status === 'fulfilled' ? qualityData.value : null

    return normalizeScorecardsResponse(delivery, quality, week)
  } catch (err) {
    console.error(`Failed to fetch scorecards for week ${week}:`, err)
    return []
  }
}

// ─── Response normalizer ──────────────────────────────────────────────────────
// Amazon's API response structure — normalize to our clean format
// Note: exact field names confirmed after first live run; may need minor adjustment

function normalizeScorecardsResponse(delivery: any, quality: any, week: string): DAScorecardRaw[] {
  const scorecards: Map<string, Partial<DAScorecardRaw>> = new Map()

  // Process delivery data (DSB/DNR)
  if (delivery) {
    const rows = delivery?.data?.rows ?? delivery?.rows ?? delivery?.tableData ?? []
    for (const row of rows) {
      const daId = row.daId ?? row.associateId ?? row.transporterId ?? row.id
      const daName = row.daName ?? row.name ?? row.associateName ?? 'Unknown'
      
      if (!daId) continue

      scorecards.set(daId, {
        daId,
        daName,
        week,
        dsbRate: parseFloat(row.dsbRate ?? row.dsb ?? row.deliverySuccessRate ?? 0),
        dnrRate: parseFloat(row.dnrRate ?? row.dnr ?? row.didNotReturnRate ?? 0),
        deliveryScore: parseFloat(row.score ?? row.deliveryScore ?? row.overallScore ?? 0),
        standing: normalizeStanding(row.standing ?? row.tier ?? row.performanceTier),
      })
    }
  }

  // Merge quality data
  if (quality) {
    const rows = quality?.data?.rows ?? quality?.rows ?? quality?.tableData ?? []
    for (const row of rows) {
      const daId = row.daId ?? row.associateId ?? row.transporterId ?? row.id
      if (!daId) continue

      const existing = scorecards.get(daId) ?? { daId, daName: row.daName ?? 'Unknown', week }
      scorecards.set(daId, {
        ...existing,
        qualityScore: parseFloat(row.qualityScore ?? row.quality ?? row.score ?? 0),
        safetyScore: parseFloat(row.safetyScore ?? row.safety ?? 0),
      })
    }
  }

  // Fill defaults for any missing fields
  return Array.from(scorecards.values()).map(s => ({
    daId: s.daId ?? '',
    daName: s.daName ?? '',
    week: s.week ?? week,
    deliveryScore: s.deliveryScore ?? 0,
    qualityScore: s.qualityScore ?? 0,
    safetyScore: s.safetyScore ?? 0,
    dnrRate: s.dnrRate ?? 0,
    dsbRate: s.dsbRate ?? 0,
    standing: s.standing ?? 'GOOD',
  }))
}

function normalizeStanding(raw: string | undefined): DAScorecardRaw['standing'] {
  if (!raw) return 'GOOD'
  const upper = raw.toUpperCase().replace(/\s+/g, '_')
  const valid = ['FANTASTIC_PLUS', 'FANTASTIC', 'GREAT', 'GOOD', 'FAIR', 'POOR']
  return valid.includes(upper) ? upper as DAScorecardRaw['standing'] : 'GOOD'
}

// ─── Persist scorecards to database ──────────────────────────────────────────

export async function syncScorecardsToDatabase(weekStr?: string): Promise<{
  synced: number
  matched: number
  unmatched: string[]
}> {
  const week = weekStr ?? lastWeek() // Default to last week since current week isn't final
  const scorecards = await fetchDAScorecardsForWeek(week)

  if (scorecards.length === 0) {
    console.log(`No scorecard data returned for week ${week}`)
    return { synced: 0, matched: 0, unmatched: [] }
  }

  let matched = 0
  const unmatched: string[] = []

  for (const sc of scorecards) {
    // Match Amazon DA to our DA record by transponder ID or name
    const da = await prisma.dA.findFirst({
      where: {
        OR: [
          { transponderId: sc.daId },
          { name: { equals: sc.daName, mode: 'insensitive' } },
        ],
      },
    })

    if (da) {
      // Upsert scorecard record
      await prisma.dAScorecard.upsert({
        where: { daId_week: { daId: da.id, week } },
        update: {
          deliveryScore: sc.deliveryScore,
          qualityScore: sc.qualityScore,
          safetyScore: sc.safetyScore,
          dnrRate: sc.dnrRate,
          dsbRate: sc.dsbRate,
          standing: sc.standing,
          syncedAt: new Date(),
        },
        create: {
          daId: da.id,
          week,
          amazonDaId: sc.daId,
          deliveryScore: sc.deliveryScore,
          qualityScore: sc.qualityScore,
          safetyScore: sc.safetyScore,
          dnrRate: sc.dnrRate,
          dsbRate: sc.dsbRate,
          standing: sc.standing,
          syncedAt: new Date(),
        },
      })

      // Flag low performers automatically
      if (sc.standing === 'FAIR' || sc.standing === 'POOR') {
        await prisma.dAAlert.upsert({
          where: { daId_week_type: { daId: da.id, week, type: 'LOW_PERFORMANCE' } },
          update: { details: `Standing: ${sc.standing}. Score: ${sc.deliveryScore}` },
          create: {
            daId: da.id,
            week,
            type: 'LOW_PERFORMANCE',
            severity: sc.standing === 'POOR' ? 'CRITICAL' : 'WARNING',
            details: `Standing: ${sc.standing}. Delivery: ${sc.deliveryScore}, Quality: ${sc.qualityScore}, Safety: ${sc.safetyScore}`,
          },
        })
      }

      matched++
    } else {
      unmatched.push(`${sc.daName} (${sc.daId})`)
    }
  }

  console.log(`✅ Synced ${matched}/${scorecards.length} scorecards for ${week}. Unmatched: ${unmatched.length}`)
  return { synced: scorecards.length, matched, unmatched }
}

// ─── Fetch multiple weeks of history ─────────────────────────────────────────

export async function syncScorecardsHistory(weeksBack: number = 8): Promise<void> {
  console.log(`📈 Syncing ${weeksBack} weeks of scorecard history...`)

  for (let i = 1; i <= weeksBack; i++) {
    const week = formatWeek(subWeeks(new Date(), i))
    await syncScorecardsToDatabase(week)
    // Small delay between API calls to be respectful
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log('✅ Historical scorecard sync complete')
}
