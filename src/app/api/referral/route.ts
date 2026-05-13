/**
 * Havilon LLC — Insurance Referral Program API
 *
 * Bonus policy:
 * - Flat rate per bound policy
 * - 30-day hold before bonus becomes eligible
 * - Staff requests payout through portal
 * - Owner approves and marks as paid
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { addDays, isAfter } from 'date-fns'
import prisma from '@/lib/prisma'


// Configurable bonus amount — change this anytime
const BONUS_PER_BIND = 25.00 // $25 per bound policy
const HOLD_DAYS      = 30    // Days before bonus is eligible

// ─── GET — fetch referral data ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view')

  const isOwner = session.user.role === 'OWNER'

  // Owner sees all referrals and leaderboard
  if (view === 'all' && isOwner) {
    const codes = await prisma.referralCode.findMany({
      orderBy: { totalEarned: 'desc' },
      include: {
        referrals: { orderBy: { createdAt: 'desc' }, take: 5 },
        payouts:   { orderBy: { requestedAt: 'desc' }, take: 3 },
      },
    })
    return NextResponse.json({ codes })
  }

  // Payout requests for owner approval
  if (view === 'payouts' && isOwner) {
    const payouts = await prisma.referralPayout.findMany({
      where: { status: 'REQUESTED' },
      orderBy: { requestedAt: 'asc' },
      include: {
        referralCode: { select: { name: true, code: true } },
      },
    })
    return NextResponse.json({ payouts })
  }

  // Individual staff member's own referral data
  const code = await prisma.referralCode.findFirst({
    where: {
      OR: [
        { userId: session.user.id },
        { daId: session.user.id },
      ],
    },
    include: {
      referrals: { orderBy: { createdAt: 'desc' } },
      payouts:   { orderBy: { requestedAt: 'desc' } },
    },
  })

  // Auto-create code if they don't have one yet
  if (!code) {
    const newCode = await createReferralCode(session.user.id, session.user.name)
    return NextResponse.json({ code: newCode, referrals: [], payouts: [] })
  }

  return NextResponse.json({ code })
}

// ─── POST — various actions ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action } = body

  // Generate or get referral code for current user
  if (action === 'get_my_code') {
    const existing = await prisma.referralCode.findFirst({
      where: { userId: session.user.id },
    })
    if (existing) return NextResponse.json({ code: existing })

    const code = await createReferralCode(session.user.id, session.user.name)
    return NextResponse.json({ code })
  }

  // Request a payout
  if (action === 'request_payout') {
    const { amount } = body
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const code = await prisma.referralCode.findFirst({
      where: { userId: session.user.id },
    })

    if (!code) return NextResponse.json({ error: 'No referral code found' }, { status: 404 })
    if (code.balance < amount) {
      return NextResponse.json({ error: `Insufficient balance. Available: $${code.balance.toFixed(2)}` }, { status: 400 })
    }

    // Check for pending payout already
    const pending = await prisma.referralPayout.findFirst({
      where: { referralCodeId: code.id, status: 'REQUESTED' },
    })
    if (pending) {
      return NextResponse.json({ error: 'You already have a pending payout request' }, { status: 400 })
    }

    const payout = await prisma.referralPayout.create({
      data: {
        referralCodeId: code.id,
        amount,
        status: 'REQUESTED',
      },
    })

    // Notify owner
    const owners = await prisma.user.findMany({ where: { role: 'OWNER', isActive: true } })
    for (const owner of owners) {
      await prisma.notification.create({
        data: {
          userId:     owner.id,
          type:       'REFERRAL_PAYOUT_REQUEST',
          title:      `💰 Referral Payout Request — ${session.user.name} — $${amount.toFixed(2)}`,
          body:       `${session.user.name} has requested a $${amount.toFixed(2)} referral bonus payout. Review in the Referral Program section.`,
          channel:    'both',
          entityType: 'referral',
          entityId:   payout.id,
        },
      })
    }

    return NextResponse.json({ success: true, payout })
  }

  // Owner: mark a referral as bound (policy was sold)
  if (action === 'mark_bound') {
    if (session.user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
    }

    const { referralId } = body
    const referral = await prisma.insuranceReferral.findUnique({
      where: { id: referralId },
      include: { codeRef: true },
    })

    if (!referral) return NextResponse.json({ error: 'Referral not found' }, { status: 404 })

    const bindDate        = new Date()
    const bonusEligibleAt = addDays(bindDate, HOLD_DAYS)

    await prisma.insuranceReferral.update({
      where: { id: referralId },
      data: {
        status:          'CONVERTED',
        bindDate,
        bonusAmount:     BONUS_PER_BIND,
        bonusEligibleAt,
      },
    })

    return NextResponse.json({
      success: true,
      bonusAmount: BONUS_PER_BIND,
      eligibleDate: bonusEligibleAt,
      message: `Policy bound. $${BONUS_PER_BIND} bonus will be eligible on ${bonusEligibleAt.toLocaleDateString()}`,
    })
  }

  // Owner: process payout (approve/deny)
  if (action === 'process_payout') {
    if (session.user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
    }

    const { payoutId, approve, notes } = body

    const payout = await prisma.referralPayout.findUnique({
      where: { id: payoutId },
      include: { referralCode: true },
    })

    if (!payout) return NextResponse.json({ error: 'Payout not found' }, { status: 404 })

    if (approve) {
      // Deduct from balance
      await prisma.referralCode.update({
        where: { id: payout.referralCodeId },
        data: {
          balance:   { decrement: payout.amount },
          totalPaid: { increment: payout.amount },
        },
      })

      await prisma.referralPayout.update({
        where: { id: payoutId },
        data: { status: 'PAID', processedAt: new Date(), processedBy: session.user.name, notes },
      })
    } else {
      await prisma.referralPayout.update({
        where: { id: payoutId },
        data: { status: 'DENIED', processedAt: new Date(), processedBy: session.user.name, notes },
      })
    }

    return NextResponse.json({ success: true })
  }

  // Cron: release eligible bonuses (run daily)
  if (action === 'release_eligible') {
    if (session.user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
    }

    const now = new Date()
    const eligible = await prisma.insuranceReferral.findMany({
      where: {
        status:          'CONVERTED',
        bonusPaid:       false,
        bonusEligibleAt: { lte: now },
        referralCodeId:  { not: null },
      },
    })

    let released = 0
    for (const ref of eligible) {
      if (!ref.referralCodeId) continue

      await prisma.referralCode.update({
        where: { id: ref.referralCodeId },
        data: {
          balance:      { increment: ref.bonusAmount },
          totalEarned:  { increment: ref.bonusAmount },
        },
      })

      await prisma.insuranceReferral.update({
        where: { id: ref.id },
        data:  { bonusPaid: true },
      })

      released++
    }

    return NextResponse.json({ success: true, released, message: `${released} bonuses released` })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function createReferralCode(userId: string, name: string) {
  const firstName = name.split(' ')[0].toUpperCase()
  const suffix    = Math.random().toString(36).substring(2, 6).toUpperCase()
  const code      = `${firstName}-${suffix}`

  return prisma.referralCode.create({
    data: { code, userId, name },
  })
}
