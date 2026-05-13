import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const da = await prisma.dA.findUnique({
    where: { id: params.id },
    include: {
      // Performance history — last 12 weeks
      scorecards: {
        orderBy: { week: 'desc' },
        take: 12,
      },
      // Active alerts
      alerts: {
        where: { isResolved: false },
        orderBy: { createdAt: 'desc' },
      },
      // Discipline records — all time
      disciplineLog: {
        orderBy: { date: 'desc' },
      },
      // Route history — last 90 assignments
      routeAssignments: {
        orderBy: { date: 'desc' },
        take: 90,
        include: {
          vehicle: { select: { vehicleNumber: true } },
        },
      },
    },
  })

  if (!da) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Also fetch incidents linked to this DA
  const incidents = await prisma.incident.findMany({
    where: { daId: params.id },
    orderBy: { date: 'desc' },
  })

  return NextResponse.json({ da: { ...da, incidents } })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['OWNER', 'OPS_MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()

  // Remove relation fields
  const { scorecards, alerts, disciplineLog, routeAssignments, incidents, id, createdAt, updatedAt, ...data } = body

  // Convert date strings
  if (data.dlExpiry)    data.dlExpiry    = new Date(data.dlExpiry)
  if (data.hireDate)    data.hireDate    = new Date(data.hireDate)
  if (data.dateOfBirth) data.dateOfBirth = new Date(data.dateOfBirth)
  if (data.terminationDate) data.terminationDate = new Date(data.terminationDate)

  const da = await prisma.dA.update({
    where: { id: params.id },
    data,
  })

  return NextResponse.json({ da })
}
