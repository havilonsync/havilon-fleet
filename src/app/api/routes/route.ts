import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { format } from 'date-fns'
import prisma from '@/lib/prisma'


export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? format(new Date(), 'yyyy-MM-dd')

  const routes = await prisma.routeAssignment.findMany({
    where: { date },
    include: {
      da:      { select: { name: true, badgeId: true } },
      vehicle: { select: { vehicleNumber: true } },
    },
    orderBy: { routeCode: 'asc' },
  })

  return NextResponse.json({ routes, date })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['OWNER', 'OPS_MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const { date, routeCode, routeType, daId, vehicleId, stopCount, packageVolume, destination, stageLocation, departureTime } = body

  const route = await prisma.routeAssignment.upsert({
    where: { date_routeCode: { date, routeCode } },
    update: { daId, vehicleId, stopCount, packageVolume, destination, stageLocation, departureTime, routeType },
    create: { date, routeCode, routeType: routeType ?? 'BASE', daId, vehicleId, stopCount, packageVolume, destination, stageLocation, departureTime },
  })

  return NextResponse.json({ route }, { status: 201 })
}
