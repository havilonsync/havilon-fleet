/**
 * Staff Management API
 * Owner-only. Invite staff by Gmail, assign roles, deactivate access.
 *
 * POST /api/staff          — Invite a new user by email
 * GET  /api/staff          — List all users
 * PATCH /api/staff/[id]    — Update role or deactivate
 */

import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient, UserRole } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { sendStaffInviteEmail } from '@/services/google-workspace'

const prisma = new PrismaClient()

const InviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  role: z.nativeEnum(UserRole),
})

// GET — list all staff
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'OWNER') {
    return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: {
      id: true, email: true, name: true, role: true,
      isActive: true, createdAt: true, lastLogin: true,
    },
  })

  return NextResponse.json({ users })
}

// POST — invite new staff member
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'OWNER') {
    return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = InviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { email, name, role } = parsed.data

  // Check if already exists
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    // Reactivate if they were deactivated
    if (!existing.isActive) {
      await prisma.user.update({
        where: { email },
        data: { isActive: true, role, name },
      })
      return NextResponse.json({ message: 'User reactivated', email })
    }
    return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 })
  }

  // Create the user — they'll be able to log in with their Gmail on first visit
  const user = await prisma.user.create({
    data: { email, name, role, isActive: true },
  })

  // Send them an invite email
  try {
    await sendStaffInviteEmail({
      to: email,
      name,
      role,
      portalUrl: process.env.NEXTAUTH_URL ?? 'https://havilon-fleet.vercel.app',
      invitedBy: (session.user as any).name ?? 'Havilon Owner',
    })
  } catch (e) {
    console.error('Invite email failed (non-fatal):', e)
  }

  return NextResponse.json({ user, message: `${name} invited. They can now log in with ${email}.` }, { status: 201 })
}
