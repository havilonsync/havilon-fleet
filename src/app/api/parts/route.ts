import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { evaluatePartsFraud } from '@/services/fraud-engine'

import prisma from '@/lib/prisma'

const CreatePartsSchema = z.object({
  vehicleId:         z.string(),
  repairId:          z.string().optional(),
  partName:          z.string().min(1),
  partNumber:        z.string().optional(),
  quantity:          z.number().int().min(1).default(1),
  unitCost:          z.number().min(0),
  totalCost:         z.number().min(0),
  vendor:            z.string().min(1),
  amazonOrderNumber: z.string().optional(),
  dateOrdered:       z.string(),
  dateDelivered:     z.string().optional(),
  notes:             z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const vehicleId = searchParams.get('vehicleId')
  const repairId  = searchParams.get('repairId')
  const flagged   = searchParams.get('flagged') === 'true'

  const parts = await prisma.partsOrder.findMany({
    where: {
      ...(vehicleId ? { vehicleId } : {}),
      ...(repairId  ? { repairId  } : {}),
      ...(flagged   ? { isDuplicateFlag: true } : {}),
    },
    include: {
      vehicle:   { select: { vehicleNumber: true } },
      repair:    { select: { repairNumber: true } },
      orderedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ parts })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role
  if (!['OWNER', 'OPS_MANAGER'].includes(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreatePartsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const count = await prisma.partsOrder.count()
  const orderNumber = `PO-${String(400 + count + 1).padStart(3, '0')}`

  const { dateOrdered, dateDelivered, vehicleId, repairId, ...rest } = parsed.data
  const order = await prisma.partsOrder.create({
    data: {
      orderNumber,
      orderedById:       session.user.id,
      vehicleId:         vehicleId ?? '',
      partName:          rest.partName,
      partNumber:        rest.partNumber,
      quantity:          rest.quantity ?? 1,
      unitCost:          rest.unitCost,
      totalCost:         rest.totalCost,
      vendor:            rest.vendor,
      amazonOrderNumber: rest.amazonOrderNumber,
      notes:             rest.notes,
      repairId:          repairId,
      dateOrdered:       new Date(dateOrdered),
      dateDelivered:     dateDelivered ? new Date(dateDelivered) : undefined,
    },
  })

  // Run fraud check
  await evaluatePartsFraud(order.id)

  return NextResponse.json({ order }, { status: 201 })
}
