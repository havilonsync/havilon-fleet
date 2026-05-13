import { NextRequest, NextResponse } from 'next/server'
import { FraudSeverity } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runNightlyFraudScan, recalculateShopRiskScore } from '@/services/fraud-engine'
import prisma from '@/lib/prisma'


// GET /api/fraud — dashboard summary + active flags
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entityType')
  const severity = searchParams.get('severity') as FraudSeverity | null

  const where: any = { isActive: true }
  if (entityType) where.entityType = entityType
  if (severity) where.severity = severity

  const [activeFlags, shops, criticalCount, warningCount] = await Promise.all([
    prisma.fraudEvent.findMany({
      where,
      include: {
        repair: {
          include: {
            vehicle: { select: { vehicleNumber: true, vin: true } },
            shop: { select: { name: true } },
          },
        },
      },
      orderBy: [{ severity: 'asc' }, { detectedAt: 'desc' }],
    }),
    prisma.repairShop.findMany({
      where: { isActive: true },
      orderBy: { fraudScore: 'desc' },
      take: 10,
      select: {
        id: true, name: true, fraudScore: true, fraudFlags: true,
        totalRepairs: true, avgRepairCost: true, repeatRepairRate: true,
      },
    }),
    prisma.fraudEvent.count({ where: { isActive: true, severity: FraudSeverity.CRITICAL } }),
    prisma.fraudEvent.count({ where: { isActive: true, severity: FraudSeverity.WARNING } }),
  ])

  // Estimate financial leakage from active flags
  const leakageEstimate = await estimateLeakage()

  return NextResponse.json({
    activeFlags,
    shops,
    summary: { criticalCount, warningCount, leakageEstimate },
  })
}

// POST /api/fraud/[id]/resolve
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const segments = url.pathname.split('/')
  const fraudEventId = segments[segments.indexOf('fraud') + 1]
  const action = segments[segments.length - 1]

  if (action === 'resolve') {
    const body = await req.json()

    await prisma.fraudEvent.update({
      where: { id: fraudEventId },
      data: {
        isActive: false,
        resolvedAt: new Date(),
        resolvedById: (session.user as any).id,
        resolutionNotes: body.notes,
      },
    })

    return NextResponse.json({ success: true })
  }

  if (action === 'scan') {
    // Manual trigger for fraud scan (owner only)
    if ((session.user as any).role !== 'OWNER') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
    }

    await runNightlyFraudScan()
    return NextResponse.json({ success: true, message: 'Fraud scan complete' })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

async function estimateLeakage(): Promise<number> {
  const flaggedRepairs = await prisma.repair.findMany({
    where: { fraudScore: { gte: 50 } },
    select: { totalCost: true, fraudScore: true },
  })

  // Rough estimate: leakage = % of cost proportional to fraud score above 50
  return flaggedRepairs.reduce((total, r) => {
    const excessPct = ((r.fraudScore - 50) / 100)
    return total + ((r.totalCost ?? 0) * excessPct)
  }, 0)
}
