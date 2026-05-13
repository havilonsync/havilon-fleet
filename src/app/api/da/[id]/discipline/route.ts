import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'


type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['OWNER', 'OPS_MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const { type, description, date } = body

  if (!description || !type) {
    return NextResponse.json({ error: 'Type and description are required' }, { status: 400 })
  }

  const record = await prisma.disciplineRecord.create({
    data: {
      daId:        params.id,
      type,
      description,
      date:        date ? new Date(date) : new Date(),
      issuedBy:    session.user.name ?? session.user.email,
    },
  })

  return NextResponse.json({ record }, { status: 201 })
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const records = await prisma.disciplineRecord.findMany({
    where: { daId: params.id },
    orderBy: { date: 'desc' },
  })

  return NextResponse.json({ records })
}
