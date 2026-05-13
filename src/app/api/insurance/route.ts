import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'


const AGENCY_EMAIL = 'diwuagwuinsuranceagency@gmail.com'

export async function POST(req: NextRequest) {
  const body = await req.json()

  const {
    daName, email, phone, insuranceTypes,
    vehicleVin, vehicleYear, vehicleMake, vehicleModel,
    currentCarrier, currentRate, additionalNotes,
  } = body

  if (!daName || !email || !insuranceTypes?.length) {
    return NextResponse.json({ error: 'Name, email and at least one insurance type are required' }, { status: 400 })
  }

  const count = await prisma.insuranceReferral.count()
  const referralNumber = `INS-${String(count + 1).padStart(4, '0')}`

  // Try to link to a DA record
  const da = await prisma.dA.findFirst({ where: { email } })

  const referral = await prisma.insuranceReferral.create({
    data: {
      referralNumber,
      daId:           da?.id,
      daName,
      email,
      phone,
      insuranceTypes,
      vehicleVin,
      vehicleYear,
      vehicleMake,
      vehicleModel,
      currentCarrier,
      currentRate,
      additionalNotes,
    },
  })

  // Build the email body for the agency
  const typesLabel = insuranceTypes.map((t: string) => {
    const map: Record<string, string> = {
      AUTO: 'Auto Insurance', LIFE: 'Life Insurance', HEALTH: 'Health Insurance',
      RENTERS: "Renter's Insurance", HOME: 'Homeowners Insurance', UMBRELLA: 'Umbrella Policy',
    }
    return map[t] ?? t
  }).join(', ')

  const emailBody = `
NEW INSURANCE QUOTE REQUEST — ${referralNumber}

From: ${daName}
Email: ${email}
Phone: ${phone ?? 'Not provided'}
Types Requested: ${typesLabel}

${insuranceTypes.includes('AUTO') ? `
AUTO DETAILS:
  Vehicle: ${vehicleYear ?? ''} ${vehicleMake ?? ''} ${vehicleModel ?? ''}
  VIN: ${vehicleVin ?? 'Not provided'}
  Current Carrier: ${currentCarrier ?? 'Not provided'}
  Current Monthly Rate: ${currentRate ?? 'Not provided'}
` : ''}

${additionalNotes ? `Additional Notes: ${additionalNotes}` : ''}

---
This referral was submitted through the Havilon LLC Personnel Portal.
Reference: ${referralNumber}
  `.trim()

  // Send notification to owner
  const owners = await prisma.user.findMany({
    where: { role: 'OWNER', isActive: true },
  })

  for (const owner of owners) {
    await prisma.notification.create({
      data: {
        userId:     owner.id,
        type:       'INSURANCE_REFERRAL',
        title:      `🛡️ New Insurance Quote Request — ${daName} (${typesLabel})`,
        body:       `${daName} (${email}) has requested an insurance quote. Forward to ${AGENCY_EMAIL} or handle directly. Reference: ${referralNumber}`,
        channel:    'both',
        entityType: 'insurance',
        entityId:   referral.id,
      },
    })
  }

  return NextResponse.json({ referralNumber, success: true }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user || session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
  }

  const referrals = await prisma.insuranceReferral.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ referrals })
}
