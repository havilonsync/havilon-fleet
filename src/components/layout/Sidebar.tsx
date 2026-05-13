'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  LayoutDashboard, CheckSquare, ShieldAlert, Truck,
  Wrench, Package, Building2, FileText, BarChart3,
  Star, AlertTriangle, Route, Users, LogOut, MapPin, ClipboardList, Package2, CalendarOff, Lock, BarChart3, ShieldCheck, Gift
} from 'lucide-react'
import { signOut } from 'next-auth/react'

const navSections = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard',        label: 'Dashboard',        icon: LayoutDashboard },
      { href: '/approvals',        label: 'Approvals',        icon: CheckSquare,  badge: 'approvals' },
      { href: '/fraud',            label: 'Fraud Flags',      icon: ShieldAlert,  badge: 'fraud' },
    ],
  },
  {
    label: 'Fleet',
    items: [
      { href: '/vehicles',         label: 'Vehicles',         icon: Truck },
      { href: '/repairs',          label: 'Repairs',          icon: Wrench },
      { href: '/parts',            label: 'Parts Orders',     icon: Package },
    ],
  },
  {
    label: 'Vendors',
    items: [
      { href: '/shops',            label: 'Repair Shops',     icon: Building2 },
      { href: '/invoices',         label: 'Invoices',         icon: FileText },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/da',               label: 'DA Roster',        icon: Users },
      { href: '/dispatch',         label: 'Dispatch Board',   icon: MapPin },
      { href: '/scorecards',       label: 'DA Scorecards',    icon: Star },
      { href: '/performance-risk', label: 'Performance Risk', icon: AlertTriangle },
      { href: '/timeoff',          label: 'Time Off',         icon: CalendarOff },
      { href: '/tips',             label: 'Tip Line',         icon: Lock },
      { href: '/survey',           label: 'Team Survey',      icon: BarChart3 },
      { href: '/staff',            label: 'Staff Access',     icon: ClipboardList },
    ],
  },
  {
    label: 'Insurance',
    items: [
      { href: '/insurance',        label: 'Get a Quote',      icon: ShieldCheck },
      { href: '/referral',          label: 'Refer & Earn',     icon: Gift },
    ],
  },
  {
    label: 'Reporting',
    items: [
      { href: '/reports',          label: 'Analytics',        icon: BarChart3 },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user as any
  const role = user?.role?.toLowerCase().replace('_', ' ') ?? 'viewer'

  // Hide performance risk and staff from non-managers
  const filteredSections = navSections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (item.href === '/performance-risk' || item.href === '/staff') {
        return ['owner', 'ops manager', 'ops_manager'].includes(role)
      }
      if (item.href === '/fraud') {
        return ['owner', 'ops manager', 'ops_manager'].includes(role)
      }
      return true
    }),
  })).filter(section => section.items.length > 0)

  return (
    <div className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Truck size={14} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">HAVILON LLC</div>
            <div className="text-xs text-gray-500">Personnel & Fleet Management</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
        {filteredSections.map((section) => (
          <div key={section.label}>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2 mb-1">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={isActive ? 'nav-item-active' : 'nav-item'}
                  >
                    <Icon size={16} className="flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {(item as any).badge === 'fraud' && (
                      <span className="text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                        !
                      </span>
                    )}
                    {(item as any).badge === 'approvals' && (
                      <span className="text-xs bg-amber-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                        !
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer group">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-blue-700">
              {user?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) ?? 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-900 truncate">{user?.name ?? 'User'}</div>
            <div className="text-xs text-gray-500 capitalize">{role}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            title="Sign out"
          >
            <LogOut size={14} className="text-gray-400 hover:text-red-500" />
          </button>
        </div>
      </div>
    </div>
  )
}
