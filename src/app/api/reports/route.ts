import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { subDays, startOfMonth, endOfMonth } from 'date-fns'
import prisma from '@/lib/prisma'


export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'overview'
  const days = parseInt(searchParams.get('days') ?? '30')

  const since = subDays(new Date(), days)

  if (type === 'overview') {
    const [
      totalVehicles,
      groundedVehicles,
      activeRepairs,
      pendingApprovals,
      activeFraudFlags,
      mtdSpend,
      partsSpend,
      repeatRepairs,
      openDisputes,
    ] = await Promise.all([
      prisma.vehicle.count(),
      prisma.vehicle.count({ where: { isGrounded: true } }),
      prisma.repair.count({ where: { status: { in: ['PENDING_REVIEW', 'AWAITING_ESTIMATE', 'APPROVED', 'IN_PROGRESS'] } } }),
      prisma.repair.count({ where: { status: { in: ['PENDING_REVIEW', 'AWAITING_ESTIMATE'] } } }),
      prisma.fraudEvent.count({ where: { isActive: true } }),
      prisma.repair.aggregate({
        where: { requestDate: { gte: startOfMonth(new Date()) }, status: { not: 'REJECTED' } },
        _sum: { totalCost: true },
      }),
      prisma.partsOrder.aggregate({
        where: { dateOrdered: { gte: startOfMonth(new Date()) } },
        _sum: { totalCost: true },
      }),
      prisma.repair.count({ where: { isRepeatRepair: true, requestDate: { gte: since } } }),
      prisma.repair.count({ where: { status: 'DISPUTED' } }),
    ])

    return NextResponse.json({
      totalVehicles,
      groundedVehicles,
      activeRepairs,
      pendingApprovals,
      activeFraudFlags,
      mtdSpend: mtdSpend._sum.totalCost ?? 0,
      partsSpend: partsSpend._sum.totalCost ?? 0,
      repeatRepairs,
      openDisputes,
    })
  }

  if (type === 'spend_by_vendor') {
    const shops = await prisma.repairShop.findMany({
      include: {
        repairs: {
          where: { requestDate: { gte: since }, status: { not: 'REJECTED' } },
          select: { totalCost: true },
        },
      },
    })

    return NextResponse.json(
      shops.map(s => ({
        id: s.id,
        name: s.name,
        fraudScore: s.fraudScore,
        spend: s.repairs.reduce((t, r) => t + (r.totalCost ?? 0), 0),
        count: s.repairs.length,
      })).sort((a, b) => b.spend - a.spend)
    )
  }

  if (type === 'spend_by_vehicle') {
    const vehicles = await prisma.vehicle.findMany({
      include: {
        repairs: {
          where: { requestDate: { gte: since }, status: { not: 'REJECTED' } },
          select: { totalCost: true, category: true, fraudScore: true },
        },
      },
    })

    return NextResponse.json(
      vehicles.map(v => ({
        id: v.id,
        vehicleNumber: v.vehicleNumber,
        vin: v.vin,
        totalSpend: v.repairs.reduce((t, r) => t + (r.totalCost ?? 0), 0),
        repairCount: v.repairs.length,
        avgFraudScore: v.repairs.length
          ? v.repairs.reduce((s, r) => s + r.fraudScore, 0) / v.repairs.length
          : 0,
        lifetimeSpend: v.totalLifetimeRepairCost,
      })).sort((a, b) => b.totalSpend - a.totalSpend)
    )
  }

  if (type === 'category_breakdown') {
    const repairs = await prisma.repair.groupBy({
      by: ['category'],
      where: { requestDate: { gte: since } },
      _count: { id: true },
      _sum: { totalCost: true },
      _avg: { totalCost: true },
    })

    return NextResponse.json(repairs)
  }

  if (type === 'fraud_trend') {
    const events = await prisma.fraudEvent.findMany({
      where: { detectedAt: { gte: since } },
      select: { severity: true, flagType: true, detectedAt: true, riskScore: true },
      orderBy: { detectedAt: 'asc' },
    })

    return NextResponse.json(events)
  }

  return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })
}
