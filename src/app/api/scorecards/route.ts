import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getISOWeek, getYear, subWeeks } from 'date-fns'

const prisma = new PrismaClient()

function weekStr(date: Date) {
  return `${getYear(date)}-W${String(getISOWeek(date)).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const week  = searchParams.get('week') ?? weekStr(subWeeks(new Date(), 1))
  const daId  = searchParams.get('daId')
  const role  = session.user.role
  const email = session.user.email

  // DAs only see their own scorecard
  let filterDaId = daId
  if (role === 'MECHANIC') {
    const da = await prisma.dA.findFirst({ where: { email } })
    filterDaId = da?.id ?? 'no-match'
  }

  const scorecards = await prisma.dAScorecard.findMany({
    where: {
      week,
      ...(filterDaId ? { daId: filterDaId } : {}),
    },
    include: {
      da: { select: { id: true, name: true, status: true } },
    },
    orderBy: { deliveryScore: 'desc' },
  })

  return NextResponse.json({ scorecards, week })
}
