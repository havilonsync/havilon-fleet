import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role
  if (!['OWNER', 'OPS_MANAGER'].includes(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    // Dynamic import to avoid build-time issues
    const { runNightlySync } = await import('@/services/amazon/sync-runner')
    const result = await runNightlySync()
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    console.error('Amazon sync failed:', err)
    return NextResponse.json({ error: err.message ?? 'Sync failed' }, { status: 500 })
  }
}
