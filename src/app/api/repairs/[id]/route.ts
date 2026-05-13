import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { evaluateRepairFraud } from '@/services/fraud-engine'
import { processApproval, validateApprovalReadiness } from '@/services/approval-engine'
import { uploadPhotoToDrive } from '@/services/google-workspace'
import { generateInvoiceHash } from '@/services/fraud-engine'
import { hasPermission } from '@/middleware/rbac'
import { z } from 'zod'
import prisma from '@/lib/prisma'


type Params = { params: { id: string } }

// GET /api/repairs/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const repair = await prisma.repair.findUnique({
    where: { id: params.id },
    include: {
      vehicle: true,
      shop: true,
      requestedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true } },
      approvalEvents: {
        include: { actor: { select: { name: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
      fraudEvents: { where: { isActive: true } },
      partsOrders: true,
    },
  })

  if (!repair) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { ready, blockers, tier } = await validateApprovalReadiness(params.id)

  return NextResponse.json({ repair, approvalReadiness: { ready, blockers, tier } })
}

// PATCH /api/repairs/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as any).role
  if (!hasPermission(role, 'repairs:edit')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()

  const updated = await prisma.repair.update({
    where: { id: params.id },
    data: body,
  })

  // Re-run fraud engine if cost or shop changed
  if (body.totalCost || body.shopId || body.laborHours) {
    await evaluateRepairFraud(params.id)
  }

  return NextResponse.json({ repair: updated })
}

// POST /api/repairs/[id]/approve
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const action = url.pathname.split('/').pop()

  if (action === 'approve' || action === 'reject' || action === 'request_info') {
    const body = await req.json()

    if (!hasPermission((session.user as any).role, 'repairs:approve')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const result = await processApproval({
      repairId: params.id,
      actorId: (session.user as any).id,
      action: action as any,
      reason: body.reason,
      notes: body.notes,
    })

    return NextResponse.json(result)
  }

  if (action === 'upload-photo') {
    if (!hasPermission((session.user as any).role, 'repairs:upload_photos')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const photoType = formData.get('type') as string // before | during | after | invoice | estimate

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())

    const repair = await prisma.repair.findUnique({ where: { id: params.id } })
    if (!repair?.driveFolderId) {
      return NextResponse.json({ error: 'Drive folder not set up for this repair' }, { status: 400 })
    }

    // Map photo type to subfolder
    const subfolderMap: Record<string, string> = {
      before: '01_Before',
      during: '02_During',
      after: '03_After',
      invoice: '04_Invoices',
      estimate: '05_Estimates',
    }

    const { viewUrl } = await uploadPhotoToDrive(
      buffer,
      file.name,
      file.type,
      `${repair.driveFolderId}/${subfolderMap[photoType] ?? ''}`
    )

    // Update the appropriate photos array
    const updateField: Record<string, any> = {
      before: { photosBefore: { push: viewUrl } },
      during: { photosDuring: { push: viewUrl } },
      after: { photosAfter: { push: viewUrl } },
      invoice: {
        invoiceUrl: viewUrl,
        invoiceHash: generateInvoiceHash(buffer),
      },
      estimate: !repair.estimate1Url
        ? { estimate1Url: viewUrl }
        : { estimate2Url: viewUrl },
    }

    await prisma.repair.update({
      where: { id: params.id },
      data: updateField[photoType] ?? {},
    })

    // Re-run fraud engine after invoice upload (hash check)
    if (photoType === 'invoice') {
      await evaluateRepairFraud(params.id)
    }

    return NextResponse.json({ url: viewUrl, type: photoType })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
