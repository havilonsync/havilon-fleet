import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { subDays, startOfMonth } from 'date-fns'
import { DashboardClient } from './DashboardClient'

const prisma = new PrismaClient()

export default async function DashboardPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  const since30 = subDays(new Date(), 30)
  const monthStart = startOfMonth(new Date())

  const [
    totalVehicles, groundedVehicles, activeRepairs,
    pendingApprovals, activeFraudFlags, mtdSpend,
    partsSpend, repeatRepairs, openDisputes,
    spendByVendor, recentRepairs, fraudEvents,
    categoryBreakdown,
  ] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { isGrounded: true } }),
    prisma.repair.count({
      where: { status: { in: ['PENDING_REVIEW', 'AWAITING_ESTIMATE', 'APPROVED', 'IN_PROGRESS'] } }
    }),
    prisma.repair.count({
      where: { status: { in: ['PENDING_REVIEW', 'AWAITING_ESTIMATE'] } }
    }),
    prisma.fraudEvent.count({ where: { isActive: true } }),
    prisma.repair.aggregate({
      where: { requestDate: { gte: monthStart }, status: { not: 'REJECTED' } },
      _sum: { totalCost: true },
    }),
    prisma.partsOrder.aggregate({
      where: { dateOrdered: { gte: monthStart } },
      _sum: { totalCost: true },
    }),
    prisma.repair.count({ where: { isRepeatRepair: true, requestDate: { gte: since30 } } }),
    prisma.repair.count({ where: { status: 'DISPUTED' } }),

    // Spend by vendor (last 30 days)
    prisma.repairShop.findMany({
      include: {
        repairs: {
          where: { requestDate: { gte: since30 }, status: { not: 'REJECTED' } },
          select: { totalCost: true },
        },
      },
      take: 6,
    }),

    // Recent repairs with fraud info
    prisma.repair.findMany({
      where: { requestDate: { gte: since30 } },
      include: {
        vehicle: { select: { vehicleNumber: true, vin: true } },
        shop: { select: { name: true } },
      },
      orderBy: [{ fraudScore: 'desc' }, { requestDate: 'desc' }],
      take: 8,
    }),

    // Active fraud flags
    prisma.fraudEvent.findMany({
      where: { isActive: true },
      include: {
        repair: {
          include: {
            vehicle: { select: { vehicleNumber: true } },
            shop: { select: { name: true } },
          },
        },
      },
      orderBy: { riskScore: 'desc' },
      take: 5,
    }),

    // Category breakdown
    prisma.repair.groupBy({
      by: ['category'],
      where: { requestDate: { gte: since30 } },
      _count: { id: true },
      _sum: { totalCost: true },
    }),
  ])

  const vendorSpend = spendByVendor
    .map(s => ({
      id: s.id,
      name: s.name,
      fraudScore: s.fraudScore,
      spend: s.repairs.reduce((t, r) => t + (r.totalCost ?? 0), 0),
      count: s.repairs.length,
    }))
    .sort((a, b) => b.spend - a.spend)

  return (
    <DashboardClient
      stats={{
        totalVehicles,
        groundedVehicles,
        activeRepairs,
        pendingApprovals,
        activeFraudFlags,
        mtdSpend: mtdSpend._sum.totalCost ?? 0,
        partsSpend: partsSpend._sum.totalCost ?? 0,
        repeatRepairs,
        openDisputes,
      }}
      vendorSpend={vendorSpend}
      recentRepairs={recentRepairs}
      fraudEvents={fraudEvents}
      categoryBreakdown={categoryBreakdown}
    />
  )
}
