import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const prisma = new PrismaClient()

const CreateDASchema = z.object({
  name:            z.string().min(1),
  email:           z.string().email().optional(),
  phone:           z.string().optional(),
  adpId:           z.string().optional(),
  badgeId:         z.string().optional(),
  transponderId:   z.string().optional(),
  driverLicense:   z.string().optional(),
  dlExpiry:        z.string().optional(),
  hireDate:        z.string().optional(),
  zipCode:         z.string().optional(),
  offDays:         z.array(z.string()).optional(),
  gasPin:          z.string().optional(),
  uniformShirtSize:z.string().optional(),
  notes:           z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const search = searchParams.get('search')

  const das = await prisma.dA.findMany({
    where: {
      ...(status ? { status: status as any } : {}),
      ...(search ? {
        OR: [
          { name:          { contains: search, mode: 'insensitive' } },
          { badgeId:       { contains: search, mode: 'insensitive' } },
          { transponderId: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    },
    include: {
      scorecards: { orderBy: { week: 'desc' }, take: 1 },
      alerts:     { where: { isResolved: false }, take: 3 },
      _count:     { select: { scorecards: true, disciplineLog: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ das })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['OWNER', 'OPS_MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateDASchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const da = await prisma.dA.create({
    data: {
      ...parsed.data,
      dlExpiry:  parsed.data.dlExpiry  ? new Date(parsed.data.dlExpiry)  : undefined,
      hireDate:  parsed.data.hireDate  ? new Date(parsed.data.hireDate)  : undefined,
    },
  })

  return NextResponse.json({ da }, { status: 201 })
}
