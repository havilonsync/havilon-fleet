import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { broadcastDailySchedule } from '@/services/dispatch-broadcast'
import { format } from 'date-fns'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['OWNER', 'OPS_MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Management access required' }, { status: 403 })
  }

  const body = await req.json()
  const date = body.date ?? format(new Date(), 'yyyy-MM-dd')

  try {
    const result = await broadcastDailySchedule(date)

    return NextResponse.json({
      success: true,
      date,
      sms:   result.sms,
      email: result.email,
      total: result.total,
      message: `Broadcast sent to ${result.total} DAs — ${result.sms.sent} texts, ${result.email.sent} emails`,
    })
  } catch (err: any) {
    console.error('Broadcast failed:', err)
    return NextResponse.json({ error: err.message ?? 'Broadcast failed' }, { status: 500 })
  }
}
