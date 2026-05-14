/**
 * Havilon Fleet — Amazon Sync Orchestrator
 * 
 * Master scheduler that runs all Amazon data syncs.
 * 
 * Schedule:
 *   6:00 AM daily  → Route assignments for today (dispatch pre-population)
 *   11:00 PM daily → DA scorecards for completed week
 *   Sunday 1:00 AM → Full week history sync + roster audit
 * 
 * Run manually: npx tsx src/services/amazon/sync-runner.ts
 * Deploy as: Railway cron job or Vercel cron
 */

import { syncScorecardsToDatabase, syncScorecardsHistory } from './performance'
import { syncDailyRoutesToDatabase, auditRosterAgainstAmazon } from './scheduling'
import { invalidateSession } from './auth'
import { sendWeeklyScorecardTexts } from '@/services/sms'
import prisma from '@/lib/prisma'


// ─── Sync log ────────────────────────────────────────────────────────────────

async function logSync(type: string, result: any, error?: string) {
  await prisma.syncLog.create({
    data: {
      type,
      status: error ? 'FAILED' : 'SUCCESS',
      result: error ? { error } : result,
      runAt: new Date(),
    },
  })
}

// ─── Individual sync jobs ─────────────────────────────────────────────────────

export async function runMorningSync() {
  console.log('🌅 Running morning sync (route pre-population)...')
  try {
    const result = await syncDailyRoutesToDatabase()
    await logSync('MORNING_ROUTES', result)
    console.log('✅ Morning sync complete')
  } catch (err: any) {
    await logSync('MORNING_ROUTES', null, err.message)
    console.error('❌ Morning sync failed:', err.message)
  }
}

export async function runNightlySync(): Promise<{ synced: number; matched: number; unmatched: string[] }> {
  console.log('🌙 Running nightly sync (scorecards)...')
  try {
    const result = await syncScorecardsToDatabase()
    await logSync('NIGHTLY_SCORECARDS', result)

    // Also re-sync last week in case of late data updates
    const lastWeekResult = await syncScorecardsToDatabase(formatLastWeek())
    await logSync('NIGHTLY_SCORECARDS_PREV', lastWeekResult)

    // Send weekly scorecard texts (non-critical)
    try {
      const { getISOWeek, getYear, subWeeks } = await import('date-fns')
      const lastWeek = subWeeks(new Date(), 1)
      const weekStr = `${getYear(lastWeek)}-W${String(getISOWeek(lastWeek)).padStart(2, '0')}`

      const scorecards = await prisma.dAScorecard.findMany({
        where: { week: weekStr },
        include: { da: { select: { name: true, phone: true } } },
      })

      if (scorecards.length > 0) {
        const smsTargets = scorecards
          .filter(sc => sc.da?.phone)
          .map(sc => ({ da: sc.da, scorecard: sc }))
        const smsResult = await sendWeeklyScorecardTexts(smsTargets)
        console.log(`📱 SMS: ${smsResult.sent} sent, ${smsResult.skipped} skipped, ${smsResult.failed} failed`)
      }
    } catch (smsErr) {
      console.error('SMS send failed (non-critical):', smsErr)
    }

    console.log('✅ Nightly sync complete')
    return result
  } catch (err: any) {
    await logSync('NIGHTLY_SCORECARDS', null, err.message)
    console.error('❌ Nightly sync failed:', err.message)
    invalidateSession()
    return { synced: 0, matched: 0, unmatched: [] }
  }
}

export async function runWeeklySync() {
  console.log('📅 Running weekly full sync...')
  try {
    // Pull 8 weeks of history
    await syncScorecardsHistory(8)
    await logSync('WEEKLY_HISTORY', { weeksBack: 8 })

    // Audit roster vs Amazon
    const audit = await auditRosterAgainstAmazon()
    await logSync('ROSTER_AUDIT', audit)

    // Alert if discrepancies found
    if (audit.newInAmazon.length > 0 || audit.missingFromAmazon.length > 0) {
      await createRosterAuditAlerts(audit)
    }

    console.log('✅ Weekly sync complete')
  } catch (err: any) {
    await logSync('WEEKLY_SYNC', null, err.message)
    console.error('❌ Weekly sync failed:', err.message)
  }
}

// ─── Manual full sync (for initial setup) ────────────────────────────────────

export async function runInitialSync() {
  console.log('🚀 Running initial full sync...')
  console.log('   This will pull 12 weeks of scorecard history and todays routes.')
  console.log('   Estimated time: 3-5 minutes\n')

  await runMorningSync()
  await syncScorecardsHistory(12)
  await auditRosterAgainstAmazon()

  console.log('\n✅ Initial sync complete. Amazon data is now in your portal.')
}

// ─── Alerts for roster discrepancies ─────────────────────────────────────────

async function createRosterAuditAlerts(audit: {
  newInAmazon: any[]
  missingFromAmazon: any[]
}) {
  const owners = await prisma.user.findMany({
    where: { role: { in: ['OWNER', 'OPS_MANAGER'] }, isActive: true },
  })

  for (const owner of owners) {
    if (audit.newInAmazon.length > 0) {
      await prisma.notification.create({
        data: {
          userId: owner.id,
          type: 'ROSTER_AUDIT',
          title: `⚠️ ${audit.newInAmazon.length} new DA(s) in Amazon not in your portal`,
          body: `Found in Amazon but missing from portal: ${audit.newInAmazon.map(a => a.name).join(', ')}. Add them to the DA roster.`,
          channel: 'both',
        },
      })
    }

    if (audit.missingFromAmazon.length > 0) {
      await prisma.notification.create({
        data: {
          userId: owner.id,
          type: 'ROSTER_AUDIT',
          title: `⚠️ ${audit.missingFromAmazon.length} DA(s) active in portal but missing from Amazon`,
          body: `May have been terminated in Amazon: ${audit.missingFromAmazon.map((d: any) => d.name).join(', ')}. Verify and update their status.`,
          channel: 'both',
        },
      })
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLastWeek(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  const week = getISOWeek(d)
  const year = d.getFullYear()
  return `${year}-W${String(week).padStart(2, '0')}`
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// ─── CLI runner ───────────────────────────────────────────────────────────────

if (require.main === module) {
  const arg = process.argv[2]

  const jobs: Record<string, () => Promise<any>> = {
    morning: runMorningSync,
    nightly: runNightlySync,
    weekly: runWeeklySync,
    initial: runInitialSync,
  }

  const job = jobs[arg]
  if (!job) {
    console.log('Usage: npx tsx sync-runner.ts [morning|nightly|weekly|initial]')
    console.log('  morning  → Pull todays route assignments')
    console.log('  nightly  → Pull this weeks DA scorecards')
    console.log('  weekly   → Pull 8 weeks history + roster audit')
    console.log('  initial  → Full setup sync (run this first)')
    process.exit(1)
  }

  job()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1) })
}
