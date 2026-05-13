import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 })

  const referralCode = await prisma.referralCode.findUnique({
    where: { code },
    select: { name: true, isActive: true },
  })

  if (!referralCode || !referralCode.isActive) {
    return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 })
  }

  // Only return first name for privacy
  const firstName = referralCode.name.split(' ')[0]
  return NextResponse.json({ name: firstName })
}
