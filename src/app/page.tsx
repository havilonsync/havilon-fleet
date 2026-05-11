import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function RootPage() {
  const session = await getServerSession(authOptions) as any
  if (session) {
    redirect('/dashboard')
  } else {
    redirect('/auth/signin')
  }
}
