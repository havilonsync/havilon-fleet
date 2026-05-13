import { NextRequest, NextResponse } from 'next/server'
import { TimeOffStatus } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

type Params = { params: { id: string } }

// PATCH /api/timeoff/[id] — approve, deny, or upload Dr note
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action, reviewNotes, drNoteUrl } = body

  const request = await prisma.timeOffRequest.findUnique({
    where: { id: params.id },
    include: { da: { select: { name: true, id: true } } },
  })

  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOpsOrOwner = ['OWNER', 'OPS_MANAGER'].includes(session.user.role)

  // ── Approve / Deny (management only) ─────────────────────────────────
  if (action === 'approve' || action === 'deny') {
    if (!isOpsOrOwner) {
      return NextResponse.json({ error: 'Management access required' }, { status: 403 })
    }

    const newStatus = action === 'approve'
      ? (request.requiresDrNote ? TimeOffStatus.PENDING_MEDICAL_CLEARANCE : TimeOffStatus.APPROVED)
      : TimeOffStatus.DENIED

    await prisma.timeOffRequest.update({
      where: { id: params.id },
      data: {
        status:      newStatus,
        reviewedBy:  session.user.name,
        reviewedAt:  new Date(),
        reviewNotes,
      },
    })

    // Notify the DA
    const daUser = await prisma.user.findFirst({
      where: { email: request.da.name },
    })

    if (action === 'approve' && request.requiresDrNote) {
      // Remind them about Dr note
      await prisma.notification.create({
        data: {
          userId:     session.user.id,
          type:       'TIME_OFF_APPROVED_DR_NOTE',
          title:      `✅ Time off approved — Dr's note required for return`,
          body:       `${request.da.name}'s time off request has been approved. A physician's return-to-work clearance note is required before they return to active duty.`,
          channel:    'in_app',
          entityType: 'time_off',
          entityId:   params.id,
        },
      })
    }

    return NextResponse.json({ success: true, status: newStatus })
  }

  // ── Upload Dr's Note ──────────────────────────────────────────────────
  if (action === 'dr_note_received') {
    if (!isOpsOrOwner) {
      return NextResponse.json({ error: 'Management access required' }, { status: 403 })
    }

    await prisma.timeOffRequest.update({
      where: { id: params.id },
      data: {
        drNoteReceived:    true,
        drNoteUrl,
        drNoteReceivedAt:  new Date(),
        returnToWorkCleared: true,
        status:            TimeOffStatus.APPROVED,
      },
    })

    return NextResponse.json({ success: true, message: 'Dr note recorded. DA is cleared to return.' })
  }

  // ── DA cancels their own request ──────────────────────────────────────
  if (action === 'cancel') {
    if (request.status !== 'PENDING') {
      return NextResponse.json({ error: 'Can only cancel pending requests' }, { status: 400 })
    }

    await prisma.timeOffRequest.update({
      where: { id: params.id },
      data: { status: TimeOffStatus.CANCELLED },
    })

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const request = await prisma.timeOffRequest.findUnique({
    where: { id: params.id },
    include: {
      da: { select: { id: true, name: true, phone: true, badgeId: true } },
    },
  })

  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ request })
}
