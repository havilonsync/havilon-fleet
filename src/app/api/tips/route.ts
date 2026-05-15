/**
 * Anonymous Tips API
 * 
 * IMPORTANT: No employee identity is ever stored with a tip.
 * Tips are completely anonymous — even admins cannot trace who submitted them.
 * This is by design to encourage honest reporting.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { sendTipNotification } from '@/lib/email'


export async function POST(req: NextRequest) {
  // No auth required — anonymous submission
  const body = await req.json()
  const { category, message } = body

  if (!message || message.trim().length < 10) {
    return NextResponse.json({ error: 'Please provide more detail in your message' }, { status: 400 })
  }

  const count = await prisma.anonymousTip.count()
  const tipNumber = `TIP-${String(count + 1).padStart(4, '0')}`

  // Store with NO user identity — completely anonymous
  await prisma.anonymousTip.create({
    data: {
      tipNumber,
      category: category ?? 'OTHER',
      message:  message.trim(),
    },
  })

  // Send email to tip line address (fire-and-forget — don't block the response)
  sendTipNotification({ tipNumber, category: category ?? 'OTHER', message: message.trim() }).catch(() => {})

  // Notify owner immediately
  const owners = await prisma.user.findMany({
    where: { role: 'OWNER', isActive: true },
  })

  for (const owner of owners) {
    await prisma.notification.create({
      data: {
        userId:     owner.id,
        type:       'ANONYMOUS_TIP',
        title:      `🔒 New Anonymous Tip — ${category ?? 'General'}`,
        body:       `A confidential tip has been submitted. Reference: ${tipNumber}. Review in the Tips section.`,
        channel:    'both',
        entityType: 'tip',
        entityId:   tipNumber,
      },
    })
  }

  return NextResponse.json({
    success: true,
    reference: tipNumber,
    message: 'Your tip has been submitted confidentially. Reference number: ' + tipNumber,
  }, { status: 201 })
}

export async function GET(req: NextRequest) {
  // Only owner and ops managers can read tips
  const { getServerSession } = await import('next-auth')
  const { authOptions } = await import('@/lib/auth')
  const session = await getServerSession(authOptions) as any

  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['OWNER', 'OPS_MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const tips = await prisma.anonymousTip.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ tips })
}

export async function PATCH(req: NextRequest) {
  const { getServerSession } = await import('next-auth')
  const { authOptions } = await import('@/lib/auth')
  const session = await getServerSession(authOptions) as any

  if (!session?.user || session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
  }

  const body = await req.json()
  const { id, isRead, isActedOn, actionNotes } = body

  await prisma.anonymousTip.update({
    where: { id },
    data: { isRead, isActedOn, actionNotes },
  })

  return NextResponse.json({ success: true })
}
