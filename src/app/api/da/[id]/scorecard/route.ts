import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import prisma from '@/lib/prisma'

type Params = { params: { id: string } }

const ScorecardSchema = z.object({
  week:          z.string().regex(/^\d{4}-W\d{2}$/, 'Week must be in format YYYY-Wnn'),
  standing:      z.enum(['FANTASTIC_PLUS', 'FANTASTIC', 'GREAT', 'GOOD', 'FAIR', 'POOR']),
  deliveryScore: z.number().min(0).max(100),
  qualityScore:  z.number().min(0).max(100),
  safetyScore:   z.number().min(0).max(100),
  dnrRate:       z.number().min(0),
  dsbRate:       z.number().min(0).max(100),
})

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['OWNER', 'OPS_MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const da = await prisma.dA.findUnique({ where: { id: params.id } })
  if (!da) return NextResponse.json({ error: 'DA not found' }, { status: 404 })

  const body = await req.json()
  const parsed = ScorecardSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { week, standing, deliveryScore, qualityScore, safetyScore, dnrRate, dsbRate } = parsed.data

  // Upsert — if a scorecard for this week already exists, update it
  const scorecard = await prisma.dAScorecard.upsert({
    where:  { daId_week: { daId: params.id, week } },
    update: { standing, deliveryScore, qualityScore, safetyScore, dnrRate, dsbRate, syncedAt: new Date() },
    create: {
      daId: params.id,
      week, standing, deliveryScore, qualityScore, safetyScore, dnrRate, dsbRate,
    },
  })

  return NextResponse.json({ scorecard }, { status: 201 })
}
