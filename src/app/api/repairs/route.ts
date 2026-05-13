import { NextRequest, NextResponse } from 'next/server'
import { RepairStatus, RepairCategory  } from '@prisma/client'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { evaluateRepairFraud } from '@/services/fraud-engine'
import { determineTier } from '@/services/approval-engine'
import { createRepairFolder } from '@/services/google-workspace'
import { hasPermission } from '@/middleware/rbac'

import prisma from '@/lib/prisma'

const CreateRepairSchema = z.object({
  vehicleId: z.string(),
  shopId: z.string().optional(),
  category: z.nativeEnum(RepairCategory),
  description: z.string().min(10),
  damageType: z.string().optional(),
  estimatedCost: z.number().optional(),
  laborHours: z.number().optional(),
  laborRate: z.number().optional(),
  partsCost: z.number().optional(),
  routeIncidentNumber: z.string().optional(),
  driverId: z.string().optional(),
})

// GET /api/repairs — list with filters
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const vin = searchParams.get('vin')
  const vehicleId = searchParams.get('vehicleId')
  const status = searchParams.get('status') as RepairStatus | null
  const shopId = searchParams.get('shopId')
  const fraudFlagged = searchParams.get('fraudFlagged') === 'true'
  const limit = parseInt(searchParams.get('limit') ?? '50')
  const offset = parseInt(searchParams.get('offset') ?? '0')

  const where: any = {}
  if (vehicleId) where.vehicleId = vehicleId
  if (status) where.status = status
  if (shopId) where.shopId = shopId
  if (fraudFlagged) where.fraudScore = { gte: 50 }
  if (vin) where.vehicle = { vin: { contains: vin, mode: 'insensitive' } }

  const [repairs, total] = await Promise.all([
    prisma.repair.findMany({
      where,
      include: {
        vehicle: { select: { vin: true, vehicleNumber: true, make: true, model: true } },
        shop: { select: { id: true, name: true, fraudScore: true } },
        requestedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        approvalEvents: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [
        { fraudScore: 'desc' },
        { requestDate: 'desc' },
      ],
      take: limit,
      skip: offset,
    }),
    prisma.repair.count({ where }),
  ])

  return NextResponse.json({ repairs, total, limit, offset })
}

// POST /api/repairs — create new repair
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as any).role
  if (!hasPermission(role, 'repairs:create')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateRepairSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  // Generate repair number
  const count = await prisma.repair.count()
  const repairNumber = `R-${String(2000 + count + 1).padStart(4, '0')}`

  // Determine approval tier
  const estimatedCost = data.estimatedCost ?? 0
  const approvalTier = determineTier(estimatedCost)
  const requiresOwnerApproval = ['TIER_3_OWNER', 'TIER_4_EXECUTIVE'].includes(approvalTier)

  // Create repair record
  const repair = await prisma.repair.create({
    data: {
      repairNumber,
      vehicleId: data.vehicleId,
      shopId: data.shopId,
      requestedById: (session.user as any).id,
      category: data.category,
      description: data.description,
      damageType: data.damageType,
      estimatedCost: data.estimatedCost,
      laborHours: data.laborHours,
      laborRate: data.laborRate,
      partsCost: data.partsCost,
      totalCost: estimatedCost,
      driverId: data.driverId,
      routeIncidentNumber: data.routeIncidentNumber,
      approvalTier,
      requiresOwnerApproval,
      status: RepairStatus.PENDING_REVIEW,
    },
    include: { vehicle: true, shop: true },
  })

  // Create Google Drive folder structure
  try {
    const { repairFolderId, repairFolderUrl } = await createRepairFolder(
      repairNumber,
      repair.vehicle.vin,
      repair.vehicle.vehicleNumber
    )

    await prisma.repair.update({
      where: { id: repair.id },
      data: { driveFolderId: repairFolderId },
    })
  } catch (e) {
    console.error('Drive folder creation failed:', e)
    // Non-fatal — folder can be created manually
  }

  // Run fraud engine immediately
  const fraudResult = await evaluateRepairFraud(repair.id)

  return NextResponse.json({
    repair,
    fraudResult,
    message: `Repair ${repairNumber} created. Fraud score: ${fraudResult.score}/100.`,
  }, { status: 201 })
}
