import { NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'
import prisma from '@/lib/prisma'


// GET — fetch active survey or results
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view')

  // Anyone can see the active survey (to fill it out)
  if (view === 'active') {
    const survey = await prisma.sentimentSurvey.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ survey })
  }

  // Results — management only
  const { getServerSession } = await import('next-auth')
  const { authOptions } = await import('@/lib/auth')
  const session = await getServerSession(authOptions) as any

  if (!session?.user || !['OWNER', 'OPS_MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const surveys = await prisma.sentimentSurvey.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { responses: true } } },
  })

  return NextResponse.json({ surveys })
}

// POST — submit a response (anonymous) or create a new survey (management)
export async function POST(req: NextRequest) {
  const body = await req.json()

  // Creating a new survey (management only)
  if (body.action === 'create') {
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
    const session = await getServerSession(authOptions) as any

    if (!session?.user || session.user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
    }

    // Close any existing active surveys
    await prisma.sentimentSurvey.updateMany({
      where: { isActive: true },
      data: { isActive: false, closedAt: new Date() },
    })

    const survey = await prisma.sentimentSurvey.create({
      data: {
        title:  body.title ?? `Monthly Sentiment Survey — ${format(new Date(), 'MMMM yyyy')}`,
        period: body.period ?? format(new Date(), 'MMMM yyyy'),
      },
    })

    return NextResponse.json({ survey }, { status: 201 })
  }

  // Submitting a response (anonymous — no auth required)
  const {
    surveyId, overallSatisfaction, managementRating,
    workloadRating, safetyRating, communicationRating,
    wouldRecommend, openFeedback
  } = body

  if (!surveyId) return NextResponse.json({ error: 'Survey ID required' }, { status: 400 })

  // Validate scores
  const scores = [overallSatisfaction, managementRating, workloadRating, safetyRating, communicationRating]
  if (scores.some(s => s < 1 || s > 5)) {
    return NextResponse.json({ error: 'All ratings must be between 1 and 5' }, { status: 400 })
  }

  await prisma.surveyResponse.create({
    data: {
      surveyId,
      overallSatisfaction:  parseInt(overallSatisfaction),
      managementRating:     parseInt(managementRating),
      workloadRating:       parseInt(workloadRating),
      safetyRating:         parseInt(safetyRating),
      communicationRating:  parseInt(communicationRating),
      wouldRecommend:       wouldRecommend === true || wouldRecommend === 'true',
      openFeedback:         openFeedback?.trim() || null,
    },
  })

  return NextResponse.json({ success: true, message: 'Thank you for your feedback.' }, { status: 201 })
}
