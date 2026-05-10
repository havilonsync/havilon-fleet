import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient, UserRole } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const prisma = new PrismaClient()

type Params = { params: { id: string } }

// PATCH /api/staff/[id] — update role or deactivate
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'OWNER') {
    return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
  }

  // Prevent owner from locking themselves out
  if (params.id === (session.user as any).id) {
    return NextResponse.json({ error: "You can't modify your own account" }, { status: 400 })
  }

  const body = await req.json()
  const { role, isActive } = body

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(role && { role: role as UserRole }),
      ...(typeof isActive === 'boolean' && { isActive }),
    },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  })

  return NextResponse.json({ user: updated })
}

// DELETE /api/staff/[id] — deactivate (we never hard-delete for audit integrity)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'OWNER') {
    return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
  }

  if (params.id === (session.user as any).id) {
    return NextResponse.json({ error: "You can't deactivate yourself" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: params.id },
    data: { isActive: false },
  })

  return NextResponse.json({ message: 'User deactivated. Their login is blocked immediately.' })
}
