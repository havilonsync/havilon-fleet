import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user || !['OWNER', 'OPS_MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const survey = await prisma.sentimentSurvey.findUnique({
    where: { id: params.id },
    include: { responses: { orderBy: { submittedAt: 'desc' } } },
  })

  if (!survey) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const responses = survey.responses
  const count = responses.length

  if (count === 0) {
    return NextResponse.json({ survey, responses: [], summary: null })
  }

  // Calculate averages
  const avg = (key: keyof typeof responses[0]) =>
    (responses.reduce((s, r) => s + (r[key] as number), 0) / count).toFixed(1)

  const wouldRecommendPct = Math.round(
    (responses.filter(r => r.wouldRecommend).length / count) * 100
  )

  const summary = {
    totalResponses:       count,
    overallSatisfaction:  avg('overallSatisfaction'),
    managementRating:     avg('managementRating'),
    workloadRating:       avg('workloadRating'),
    safetyRating:         avg('safetyRating'),
    communicationRating:  avg('communicationRating'),
    wouldRecommendPct,
    openFeedback: responses
      .filter(r => r.openFeedback)
      .map(r => r.openFeedback),
  }

  return NextResponse.json({ survey, responses: [], summary }) // Don't expose individual responses
}
