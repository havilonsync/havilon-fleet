import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

import prisma from '@/lib/prisma'

const CreateShopSchema = z.object({
  name:          z.string().min(1),
  address:       z.string().optional(),
  phone:         z.string().optional(),
  contactPerson: z.string().optional(),
  email:         z.string().email().optional(),
  categories:    z.array(z.string()).optional(),
  notes:         z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shops = await prisma.repairShop.findMany({
    where: { isActive: true },
    orderBy: { fraudScore: 'desc' },
    include: { _count: { select: { repairs: true } } },
  })

  return NextResponse.json({ shops })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role
  if (!['OWNER', 'OPS_MANAGER'].includes(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateShopSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const shop = await prisma.repairShop.create({
    data: {
      name:          parsed.data.name ?? '',
      address:       parsed.data.address,
      phone:         parsed.data.phone,
      contactPerson: parsed.data.contactPerson,
      email:         parsed.data.email,
      categories:    parsed.data.categories ?? [],
      notes:         parsed.data.notes,
    },
  })
  return NextResponse.json({ shop }, { status: 201 })
}
