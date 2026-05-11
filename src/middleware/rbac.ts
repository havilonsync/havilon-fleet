/**
 * Havilon Fleet — Role-Based Access Control
 * Field-level and route-level permissions per role.
 */

import { UserRole } from '@prisma/client'
import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'

// ─── Permission Matrix ─────────────────────────────────────────────────────

export const PERMISSIONS = {
  // Repairs
  'repairs:create':          [UserRole.OWNER, UserRole.OPS_MANAGER, UserRole.MECHANIC],
  'repairs:edit':            [UserRole.OWNER, UserRole.OPS_MANAGER],
  'repairs:approve':         [UserRole.OWNER, UserRole.OPS_MANAGER, UserRole.ACCOUNTING],
  'repairs:reject':          [UserRole.OWNER, UserRole.OPS_MANAGER],
  'repairs:delete':          [UserRole.OWNER],
  'repairs:view_cost':       [UserRole.OWNER, UserRole.OPS_MANAGER, UserRole.ACCOUNTING],
  'repairs:upload_photos':   [UserRole.OWNER, UserRole.OPS_MANAGER, UserRole.MECHANIC],
  'repairs:view_fraud_flags':[UserRole.OWNER, UserRole.OPS_MANAGER],

  // Vehicles
  'vehicles:create':         [UserRole.OWNER, UserRole.OPS_MANAGER],
  'vehicles:edit':           [UserRole.OWNER, UserRole.OPS_MANAGER],
  'vehicles:ground':         [UserRole.OWNER, UserRole.OPS_MANAGER],
  'vehicles:view':           [UserRole.OWNER, UserRole.OPS_MANAGER, UserRole.MECHANIC, UserRole.ACCOUNTING, UserRole.AUDIT],

  // Parts
  'parts:create':            [UserRole.OWNER, UserRole.OPS_MANAGER],
  'parts:approve':           [UserRole.OWNER, UserRole.OPS_MANAGER],
  'parts:view':              [UserRole.OWNER, UserRole.OPS_MANAGER, UserRole.ACCOUNTING],

  // Fraud
  'fraud:view':              [UserRole.OWNER, UserRole.OPS_MANAGER],
  'fraud:resolve':           [UserRole.OWNER],
  'fraud:override':          [UserRole.OWNER],

  // Shops
  'shops:create':            [UserRole.OWNER, UserRole.OPS_MANAGER],
  'shops:edit':              [UserRole.OWNER, UserRole.OPS_MANAGER],
  'shops:blacklist':         [UserRole.OWNER],

  // Reports
  'reports:view':            [UserRole.OWNER, UserRole.OPS_MANAGER, UserRole.ACCOUNTING],
  'reports:export':          [UserRole.OWNER, UserRole.ACCOUNTING],
  'reports:financial':       [UserRole.OWNER, UserRole.ACCOUNTING],

  // Admin
  'users:manage':            [UserRole.OWNER],
  'settings:edit':           [UserRole.OWNER],
} as const

type Permission = keyof typeof PERMISSIONS

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const allowed = PERMISSIONS[permission] as readonly UserRole[]
  return allowed.includes(role)
}

// ─── API Route Guard ───────────────────────────────────────────────────────

export async function requirePermission(
  req: NextRequest,
  permission: Permission,
  authOptions: any
): Promise<{ session: any } | NextResponse> {
  const session = (await getServerSession(authOptions)) as Session | null

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = session.user.role as UserRole

  if (!hasPermission(role, permission)) {
    return NextResponse.json(
      { error: `Insufficient permissions. Required: ${permission}` },
      { status: 403 }
    )
  }

  return { session }
}

// ─── Field-level visibility ────────────────────────────────────────────────
// Strip sensitive fields based on role before returning to client

export function sanitizeRepairForRole(repair: any, role: UserRole) {
  // Mechanics can't see financial data
  if (role === UserRole.MECHANIC) {
    const { totalCost, laborCost, partsCost, laborRate, fraudScore, fraudFlags, ...safe } = repair
    return safe
  }

  // Audit role gets read-only, no fraud details
  if (role === UserRole.AUDIT) {
    const { fraudScore, fraudFlags, ...safe } = repair
    return safe
  }

  return repair
}

// ─── Tier-based approval guard ─────────────────────────────────────────────

export function canApproveAtTier(role: UserRole, tier: string): boolean {
  const tierApprovers: Record<string, UserRole[]> = {
    TIER_1_STANDARD:  [UserRole.OWNER, UserRole.OPS_MANAGER],
    TIER_2_SECONDARY: [UserRole.OWNER, UserRole.OPS_MANAGER, UserRole.ACCOUNTING],
    TIER_3_OWNER:     [UserRole.OWNER, UserRole.OPS_MANAGER],
    TIER_4_EXECUTIVE: [UserRole.OWNER],
  }
  return (tierApprovers[tier] ?? []).includes(role)
}
