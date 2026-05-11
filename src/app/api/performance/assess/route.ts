import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// POST /api/performance/assess — run full risk assessment
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
  }

  try {
    const { runFullRiskAssessment } = await import('@/services/performance-risk')
    const results = await runFullRiskAssessment()
    return NextResponse.json({
      success: true,
      summary: {
        furlough:       results.furlough.length,
        notRecommended: results.notRecommended.length,
        warning:        results.warning.length,
        watch:          results.watch.length,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
