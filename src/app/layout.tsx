import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SessionProvider } from '@/components/layout/SessionProvider'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Havilon Fleet Portal',
  description: 'Fleet Repair Oversight & Accountability System',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions) as any

  return (
    <html lang="en">
      <body className={inter.className}>
        <SessionProvider session={session}>
          {session ? (
            <div className="flex h-screen bg-gray-50 overflow-hidden">
              <Sidebar />
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Topbar />
                <main className="flex-1 overflow-y-auto p-6">
                  {children}
                </main>
              </div>
            </div>
          ) : (
            <>{children}</>
          )}
        </SessionProvider>
      </body>
    </html>
  )
}
