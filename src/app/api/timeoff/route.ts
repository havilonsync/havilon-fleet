/**
 * Havilon LLC — Time Off Request API
 * 
 * Policy rules enforced automatically:
 * - Standard requests must be submitted at least 7 days in advance
 * - All requests must be submitted at least 48 hours before start date
 * - Emergency/medical requests bypass advance notice requirement
 * - Medical emergencies require Dr's note before return to work
 * - Dr's note only needs to confirm clearance, not reveal medical details
 */

import { NextRequest, NextResponse } from 'next/server'
import { TimeOffType, TimeOffStatus } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { differenceInDays, differenceInHours, format } from 'date-fns'
import prisma from '@/lib/prisma'


// ─── Policy Constants ──────────────────────────────────────────────────────
const POLICY = {
  STANDARD_ADVANCE_DAYS: 7,    // Must request 7 days ahead
  MINIMUM_ADVANCE_HOURS: 48,   // No requests within 48 hours
  EMERGENCY_BYPASS: true,       // Emergencies bypass advance notice
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const daId    = searchParams.get('daId')
  const status  = searchParams.get('status') as TimeOffStatus | null
  const pending = searchParams.get('pending') === 'true'

  const isOpsOrOwner = ['OWNER', 'OPS_MANAGER'].includes(session.user.role)

  // DAs can only see their own requests
  let filterDaId = daId
  if (!isOpsOrOwner) {
    const da = await prisma.dA.findFirst({ where: { email: session.user.email } })
    filterDaId = da?.id ?? 'no-match'
  }

  const requests = await prisma.timeOffRequest.findMany({
    where: {
      ...(filterDaId ? { daId: filterDaId } : {}),
      ...(status ? { status } : {}),
      ...(pending ? { status: { in: ['PENDING', 'PENDING_MEDICAL_CLEARANCE'] } } : {}),
    },
    include: {
      da: { select: { id: true, name: true, phone: true, email: true } },
    },
    orderBy: { submittedAt: 'desc' },
  })

  return NextResponse.json({ requests })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { daId, type, startDate, endDate, reason, isEmergency } = body

  // Find the DA
  const da = await prisma.dA.findUnique({ where: { id: daId } })
  if (!da) return NextResponse.json({ error: 'DA not found' }, { status: 404 })

  const start  = new Date(startDate)
  const end    = new Date(endDate)
  const now    = new Date()
  const hoursUntilStart = differenceInHours(start, now)
  const daysUntilStart  = differenceInDays(start, now)
  const totalDays = differenceInDays(end, start) + 1

  // ── Policy validation ──────────────────────────────────────────────────
  const isMedical   = type === 'MEDICAL_EMERGENCY'
  const isUrgent    = isEmergency || isMedical

  if (!isUrgent) {
    // Standard requests need 48 hours minimum
    if (hoursUntilStart < POLICY.MINIMUM_ADVANCE_HOURS) {
      return NextResponse.json({
        error: `Standard time off requests must be submitted at least 48 hours before the start date. You submitted ${hoursUntilStart} hours before. For emergencies, select "Emergency Request".`,
        code: 'TOO_LATE',
      }, { status: 400 })
    }

    // Standard requests need 7 days for proper scheduling
    if (daysUntilStart < POLICY.STANDARD_ADVANCE_DAYS) {
      return NextResponse.json({
        error: `Time off requests should be submitted at least 7 days in advance to allow scheduling adjustments. Your request is ${daysUntilStart} day(s) before the start date. If this is an emergency situation, please select "Emergency Request".`,
        code: 'INSUFFICIENT_NOTICE',
        daysUntilStart,
        canSubmitAsEmergency: true,
      }, { status: 400 })
    }
  }

  // Generate request number
  const count = await prisma.timeOffRequest.count()
  const requestNumber = `TOR-${String(count + 1).padStart(4, '0')}`

  // Medical emergencies automatically require Dr's note for return
  const requiresDrNote = isMedical

  const request = await prisma.timeOffRequest.create({
    data: {
      requestNumber,
      daId,
      type:          type as TimeOffType,
      status:        TimeOffStatus.PENDING,
      startDate:     start,
      endDate:       end,
      totalDays,
      reason,
      isEmergency:   isUrgent,
      requiresDrNote,
      submittedAt:   now,
    },
    include: {
      da: { select: { name: true, email: true } },
    },
  })

  // Notify ops managers and owner
  await notifyManagement(request, da)

  // If medical emergency — notify DA about Dr's note requirement
  const drNoteMessage = requiresDrNote
    ? buildDrNoteMessage(da.name)
    : null

  return NextResponse.json({
    request,
    message: `Time off request ${requestNumber} submitted successfully.`,
    drNoteRequired: requiresDrNote,
    drNoteMessage,
    policyReminder: isUrgent
      ? 'Emergency request submitted. Management has been notified immediately.'
      : `Request submitted. Requires approval ${daysUntilStart} days before your start date.`,
  }, { status: 201 })
}

// ─── Notification helpers ─────────────────────────────────────────────────

async function notifyManagement(request: any, da: any) {
  const managers = await prisma.user.findMany({
    where: { role: { in: ['OWNER', 'OPS_MANAGER'] }, isActive: true },
  })

  const urgencyLabel = request.isEmergency ? '🚨 EMERGENCY — ' : ''
  const typeLabel = request.type.replace('_', ' ')

  for (const mgr of managers) {
    await prisma.notification.create({
      data: {
        userId:     mgr.id,
        type:       'TIME_OFF_REQUEST',
        title:      `${urgencyLabel}Time Off Request — ${da.name} — ${typeLabel}`,
        body:       `${da.name} has requested ${request.totalDays} day(s) off from ${format(new Date(request.startDate), 'MMM d')} to ${format(new Date(request.endDate), 'MMM d, yyyy')}. ${request.reason ? `Reason: ${request.reason}` : ''} Review in the Time Off section.`,
        channel:    request.isEmergency ? 'both' : 'in_app',
        entityType: 'time_off',
        entityId:   request.id,
      },
    })
  }
}

// ─── Dr's Note Message ────────────────────────────────────────────────────

function buildDrNoteMessage(daName: string): string {
  return `
RETURN TO WORK CLEARANCE REQUIREMENT
Havilon LLC — Personnel & Fleet Management
For: ${daName}

Because this is a medical emergency leave request, a physician's Return to Work clearance note is REQUIRED before you can return to active duty as a Delivery Associate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT YOUR DOCTOR NEEDS TO PROVIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ A brief note on their official letterhead or prescription pad
✓ A statement that you are CLEARED to return to your regular job duties
✓ The specific date you are cleared to return
✓ The physician's signature and contact information

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT THE NOTE DOES NOT NEED TO INCLUDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✗ Your diagnosis or medical condition
✗ Treatment details or medications
✗ Any personal health information

This complies with HIPAA privacy regulations. We only need confirmation that you are cleared — not details of your condition.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR JOB DUTIES (Share this with your doctor)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your physician may use the following description to assess your clearance:

POSITION: Delivery Associate — Havilon LLC (Amazon DSP)
WORK LOCATION: Field/On Road — Mansfield, TX area

Physical Requirements:
• Driving a delivery van on highways and local streets for up to 10.5 hours per day
• Safely lifting, carrying, and delivering packages weighing up to 50 lbs, on multiple stops daily
• Walking and carrying packages up multiple flights of stairs as needed
• Loading and unloading packages into a delivery van
• Standing and walking for extended periods throughout the shift

Cognitive/Technology Requirements:
• Using GPS navigation and Android delivery applications during deliveries
• Managing 150+ delivery stops per day following predetermined routes
• Communicating professionally with customers and company staff via phone and handheld device
• Following all traffic laws and safety protocols at all times
• Using E-mentor driver monitoring system throughout the shift

Schedule Requirements:
• Shift lengths typically 7-10 hours; up to 10.5 hours maximum
• Work may include weekends and holidays
• Must be available to begin work at designated times assigned by supervisor

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT STEPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. See your physician before your scheduled return date
2. Request the clearance note using the job description above
3. Provide the note to your Operations Manager OR upload it through the portal
4. You will receive confirmation once your clearance is on file and you are approved to return

If your physician has questions about the role, they may contact Havilon LLC Operations:
Phone: Contact your assigned Operations Manager
Email: havilon@gmail.com

You will NOT be scheduled for routes until this clearance is received and confirmed.
`.trim()
}
