import { PrismaAdapter } from '@auth/prisma-adapter'
import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

import prisma from '@/lib/prisma'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id
        session.user.role = (user as any).role
      }
      return session
    },
    async signIn({ user }) {
      if (!user.email) return false

      // Allow your own domain (owner + any @havilon.com accounts)
      const ownDomain = process.env.ALLOWED_EMAIL_DOMAIN ?? 'havilon.com'
      if (user.email.endsWith(`@${ownDomain}`)) return true

      // Allow any pre-approved personal Gmail (or any email) you've added
      // These are managed in your database — check if email exists and is active
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
        select: { isActive: true },
      })

      // If they're in the DB and active, let them in
      if (existingUser?.isActive) return true

      // Block everyone else — they must be invited first
      return false
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'database',
    maxAge: 8 * 60 * 60, // 8 hours — force re-auth daily
  },
}
