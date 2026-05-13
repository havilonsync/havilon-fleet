import { NextRequest, NextResponse } from 'next/server'
import { VehicleStatus } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import prisma from '@/lib/prisma'


const CreateVehicleSchema = z.object({
  vin:             z.string().min(10),
  vehicleNumber:   z.string().min(1),
  licensePlate:    z.string().optional(),
  make:            z.string().min(1),
  model:           z.string().min(1),
  year:            z.number().int().min(2000).max(2030),
  odometerCurrent: z.number().optional(),
  estimatedValue:  z.number().optional(),
  acquisitionDate: z.string().optional(),
  driverId:        z.string().optional(),
  notes:           z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') as VehicleStatus | null
  const select = searchParams.get('select')

  // Minimal select for dropdowns
  if (select) {
    const vehicles = await prisma.vehicle.findMany({
      orderBy: { vehicleNumber: 'asc' },
      select: { id: true, vehicleNumber: true, vin: true, make: true, model: true, status: true },
    })
    return NextResponse.json({ vehicles })
  }

  const vehicles = await prisma.vehicle.findMany({
    where: status ? { status } : undefined,
    orderBy: { vehicleNumber: 'asc' },
    include: {
      driver: { select: { name: true, email: true } },
      _count: { select: { repairs: true } },
    },
  })

  return NextResponse.json({ vehicles })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role
  if (!['OWNER', 'OPS_MANAGER'].includes(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateVehicleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { acquisitionDate, driverId, ...rest } = parsed.data
  const vehicle = await prisma.vehicle.create({
    data: {
      vin:             rest.vin,
      vehicleNumber:   rest.vehicleNumber,
      licensePlate:    rest.licensePlate,
      make:            rest.make,
      model:           rest.model,
      year:            rest.year,
      odometerCurrent: rest.odometerCurrent ?? 0,
      estimatedValue:  rest.estimatedValue,
      notes:           rest.notes,
      driverId:        driverId,
      acquisitionDate: acquisitionDate ? new Date(acquisitionDate) : undefined,
    },
  })

  return NextResponse.json({ vehicle }, { status: 201 })
}
