'use client'

import { useSession } from 'next-auth/react'
import { Bell, Search } from 'lucide-react'
import { usePathname } from 'next/navigation'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':  'Fleet Dashboard',
  '/approvals':  'Approval Queue',
  '/fraud':      'Fraud Intelligence',
  '/vehicles':   'Vehicle Registry',
  '/repairs':    'Repair Records',
  '/parts':      'Parts Procurement',
  '/shops':      'Repair Shops',
  '/scorecards': 'DA Scorecards',
  '/staff':      'Staff Access',
  '/reports':    'Analytics & Reports',
}

export function Topbar() {
  const { data: session } = useSession()
  const pathname = usePathname()

  const title = Object.entries(PAGE_TITLES).find(([path]) =>
    pathname.startsWith(path)
  )?.[1] ?? 'Havilon Fleet'

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-4 flex-shrink-0">
      <h1 className="text-base font-semibold text-gray-900 flex-1">{title}</h1>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 w-52">
          <Search size={14} />
          <span>Search VIN, driver, shop…</span>
        </div>

        <button className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700">
            {(session?.user?.name ?? 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
          </div>
        </div>
      </div>
    </header>
  )
}
