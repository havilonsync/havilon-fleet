import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendScorecardSMS, sendManagementAlert } from '@/services/sms'
import prisma from '@/lib/prisma'


// POST /api/sms/scorecard — send or resend scorecard texts
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['OWNER', 'OPS_MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Management access required' }, { status: 403 })
  }

  const body = await req.json()
  const { week, daId, action, message } = body

  // Send custom management alert to a specific DA
  if (action === 'alert' && daId && message) {
    const da = await prisma.dA.findUnique({ where: { id: daId } })
    if (!da?.phone) {
      return NextResponse.json({ error: 'DA has no phone number on file' }, { status: 400 })
    }
    const result = await sendManagementAlert(da.phone, da.name, message)
    return NextResponse.json(result)
  }

  // Send/resend scorecard texts for a specific week
  if (!week) {
    return NextResponse.json({ error: 'Week required (e.g. 2026-W20)' }, { status: 400 })
  }

  const where: any = { week }
  if (daId) where.daId = daId // Optionally limit to one DA

  const scorecards = await prisma.dAScorecard.findMany({
    where,
    include: { da: { select: { name: true, phone: true } } },
  })

  if (scorecards.length === 0) {
    return NextResponse.json({ error: `No scorecards found for week ${week}` }, { status: 404 })
  }

  const results = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] }

  for (const sc of scorecards) {
    if (!sc.da?.phone) { results.skipped++; continue }

    const result = await sendScorecardSMS(
      { name: sc.da.name, phone: sc.da.phone },
      sc
    )

    if (result.skipped)       results.skipped++
    else if (result.success)  results.sent++
    else {
      results.failed++
      if (result.error) results.errors.push(`${sc.da.name}: ${result.error}`)
    }

    await new Promise(r => setTimeout(r, 150))
  }

  return NextResponse.json({
    success: true,
    week,
    ...results,
    message: `Sent ${results.sent}, skipped ${results.skipped} (no phone), failed ${results.failed}`,
  })
}
