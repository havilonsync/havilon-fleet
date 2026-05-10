/**
 * Havilon Fleet — Approval Workflow Engine
 * Enforces tiered approval rules and blocks payments until conditions are met.
 */

import { PrismaClient, ApprovalTier, RepairStatus, UserRole } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Tier Definitions ──────────────────────────────────────────────────────
export const APPROVAL_TIERS = {
  TIER_1_STANDARD: {
    label: 'Standard',
    maxAmount: 250,
    requiredRoles: [UserRole.OPS_MANAGER] as UserRole[],
    requiresEstimate: false,
    requiresPhotos: true,
    requiresOwner: false,
    requiresLineItems: false,
    requiresComparativeQuotes: false,
    description: 'Under $250 — Ops Manager approval only',
  },
  TIER_2_SECONDARY: {
    label: 'Secondary',
    maxAmount: 1000,
    requiredRoles: [UserRole.OPS_MANAGER, UserRole.ACCOUNTING] as UserRole[],
    requiresEstimate: true,
    requiresPhotos: true,
    requiresOwner: false,
    requiresLineItems: false,
    requiresComparativeQuotes: false,
    description: '$250–$1,000 — Secondary approval required',
  },
  TIER_3_OWNER: {
    label: 'Owner Review',
    maxAmount: 2500,
    requiredRoles: [UserRole.OPS_MANAGER, UserRole.OWNER] as UserRole[],
    requiresEstimate: true,
    requiresPhotos: true,
    requiresOwner: true,
    requiresLineItems: true,
    requiresComparativeQuotes: false,
    description: '$1,000–$2,500 — Owner approval required',
  },
  TIER_4_EXECUTIVE: {
    label: 'Executive',
    maxAmount: Infinity,
    requiredRoles: [UserRole.OWNER] as UserRole[],
    requiresEstimate: true,
    requiresPhotos: true,
    requiresOwner: true,
    requiresLineItems: true,
    requiresComparativeQuotes: true,
    description: 'Over $2,500 — Full executive review + comparative quotes',
  },
} as const

// ─── Determine tier from cost ─────────────────────────────────────────────
export function determineTier(cost: number): ApprovalTier {
  if (cost < 250) return ApprovalTier.TIER_1_STANDARD
  if (cost < 1000) return ApprovalTier.TIER_2_SECONDARY
  if (cost < 2500) return ApprovalTier.TIER_3_OWNER
  return ApprovalTier.TIER_4_EXECUTIVE
}

// ─── Validate if repair is ready for approval ────────────────────────────
export async function validateApprovalReadiness(repairId: string): Promise<{
  ready: boolean
  blockers: string[]
  tier: ApprovalTier
}> {
  const repair = await prisma.repair.findUnique({
    where: { id: repairId },
    include: { vehicle: true, shop: true },
  })

  if (!repair) throw new Error('Repair not found')

  const cost = repair.estimatedCost ?? repair.totalCost ?? 0
  const tier = determineTier(cost)
  const tierConfig = APPROVAL_TIERS[tier]
  const blockers: string[] = []

  if (tierConfig.requiresPhotos) {
    if (repair.photosBefore.length === 0) blockers.push('Before photos are required')
    if (repair.photosAfter.length === 0 && repair.status !== 'PENDING_REVIEW') {
      blockers.push('After photos are required')
    }
  }

  if (tierConfig.requiresEstimate && !repair.estimate1Url) {
    blockers.push('Written estimate from repair shop is required')
  }

  if (tierConfig.requiresComparativeQuotes && !repair.estimate2Url) {
    blockers.push('Second comparative estimate is required for repairs over $2,500')
  }

  if (!repair.shopId) blockers.push('Repair shop must be assigned')
  if (!repair.description || repair.description.length < 20) {
    blockers.push('Detailed repair description is required')
  }

  return { ready: blockers.length === 0, blockers, tier }
}

// ─── Process Approval Action ──────────────────────────────────────────────
export async function processApproval(params: {
  repairId: string
  actorId: string
  action: 'approve' | 'reject' | 'request_info'
  reason?: string
  notes?: string
}) {
  const { repairId, actorId, action, reason, notes } = params

  const [repair, actor] = await Promise.all([
    prisma.repair.findUnique({
      where: { id: repairId },
      include: { vehicle: true },
    }),
    prisma.user.findUnique({ where: { id: actorId } }),
  ])

  if (!repair || !actor) throw new Error('Repair or actor not found')

  const cost = repair.estimatedCost ?? repair.totalCost ?? 0
  const tier = repair.approvalTier ?? determineTier(cost)
  const tierConfig = APPROVAL_TIERS[tier]

  // Authorization check
  const canAct = tierConfig.requiredRoles.includes(actor.role as UserRole)
  if (!canAct) {
    throw new Error(`User role ${actor.role} is not authorized to act on ${tier} repairs`)
  }

  let newStatus: RepairStatus
  let ownerApproved = repair.ownerApproved

  if (action === 'approve') {
    if (actor.role === UserRole.OWNER) ownerApproved = true

    const needsOwner = tierConfig.requiresOwner && !ownerApproved
    newStatus = needsOwner ? RepairStatus.AWAITING_ESTIMATE : RepairStatus.APPROVED
  } else if (action === 'reject') {
    newStatus = RepairStatus.REJECTED
  } else {
    newStatus = RepairStatus.AWAITING_ESTIMATE
  }

  // Write approval event (immutable)
  await prisma.approvalEvent.create({
    data: {
      repairId,
      actorId,
      action: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'requested_info',
      approvalTier: tier,
      reason,
      notes,
    },
  })

  // Update repair
  await prisma.repair.update({
    where: { id: repairId },
    data: {
      status: newStatus,
      approvedById: action === 'approve' ? actorId : undefined,
      ownerApproved,
      approvalTier: tier,
    },
  })

  // Notify relevant parties
  await notifyApprovalAction(repair, actor.name, action, newStatus, tier)

  return { newStatus, tier, ownerApproved }
}

// ─── Notification Helper ──────────────────────────────────────────────────
async function notifyApprovalAction(
  repair: any,
  actorName: string,
  action: string,
  newStatus: RepairStatus,
  tier: ApprovalTier
) {
  const owners = await prisma.user.findMany({
    where: { role: { in: ['OWNER', 'OPS_MANAGER'] }, isActive: true },
  })

  const messages: Record<string, string> = {
    approve: `✅ ${repair.repairNumber} approved by ${actorName}. New status: ${newStatus}.`,
    reject: `❌ ${repair.repairNumber} rejected by ${actorName}.`,
    request_info: `ℹ️ Additional information requested for ${repair.repairNumber} by ${actorName}.`,
  }

  for (const user of owners) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'APPROVAL_ACTION',
        title: `Repair ${repair.repairNumber} — ${action.replace('_', ' ').toUpperCase()}`,
        body: messages[action] ?? '',
        entityId: repair.id,
        entityType: 'repair',
        repairId: repair.id,
        channel: tier === 'TIER_4_EXECUTIVE' ? 'both' : 'in_app',
      },
    })
  }
}

// ─── Overdue Repair Scanner ────────────────────────────────────────────────
export async function flagOverdueRepairs() {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const overdueRepairs = await prisma.repair.findMany({
    where: {
      status: { in: ['PENDING_REVIEW', 'AWAITING_ESTIMATE', 'IN_PROGRESS'] },
      requestDate: { lte: sevenDaysAgo },
    },
    include: { vehicle: true },
  })

  const owners = await prisma.user.findMany({
    where: { role: { in: ['OWNER', 'OPS_MANAGER'] }, isActive: true },
  })

  for (const repair of overdueRepairs) {
    const daysSince = Math.floor((Date.now() - repair.requestDate.getTime()) / 86400000)

    for (const user of owners) {
      const exists = await prisma.notification.findFirst({
        where: { userId: user.id, repairId: repair.id, type: 'OVERDUE_REPAIR', isResolved: false },
      })

      if (!exists) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: 'OVERDUE_REPAIR',
            title: `⏰ Overdue: ${repair.repairNumber} — ${daysSince} days open`,
            body: `${repair.vehicle.vehicleNumber} repair has been in "${repair.status}" status for ${daysSince} days without resolution.`,
            entityId: repair.id,
            entityType: 'repair',
            repairId: repair.id,
            channel: 'both',
          },
        })
      }
    }
  }
}
