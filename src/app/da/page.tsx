import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, Plus, AlertTriangle, Phone, Shield } from 'lucide-react'
import prisma from '@/lib/prisma'


function daysUntil(date: Date | null): number | null {
  if (!date) return null
  return Math.ceil((date.getTime() - Date.now()) / 86400000)
}

function dlExpiryColor(days: number | null): string {
  if (days === null) return 'badge-gray'
  if (days < 0)   return 'badge-red'
  if (days < 30)  return 'badge-red'
  if (days < 90)  return 'badge-amber'
  return 'badge-green'
}

function dlExpiryLabel(days: number | null, date: Date | null): string {
  if (!date) return 'No DL on file'
  if (days === null) return 'No DL on file'
  if (days < 0)  return `EXPIRED ${Math.abs(days)}d ago`
  if (days < 30) return `Expires in ${days}d`
  return date.toLocaleDateString()
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:      'badge-green',
  INACTIVE:    'badge-gray',
  ON_LEAVE:    'badge-amber',
  TERMINATED:  'badge-red',
}

export default async function DAPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  const role = session.user.role
  if (!['OWNER', 'OPS_MANAGER'].includes(role)) redirect('/dashboard')

  const das = await prisma.dA.findMany({
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    include: {
      scorecards:   { orderBy: { week: 'desc' }, take: 1 },
      alerts:       { where: { isResolved: false }, take: 1 },
      _count:       { select: { disciplineLog: true } },
    },
  })

  const active      = das.filter(d => d.status === 'ACTIVE').length
  const onboarding  = das.filter(d => d.status === 'INACTIVE').length
  const terminated  = das.filter(d => d.status === 'TERMINATED').length

  // DL expiry alerts
  const dlExpiring = das.filter(d => {
    const days = daysUntil(d.dlExpiry)
    return days !== null && days < 90 && d.status === 'ACTIVE'
  })

  // Missing equipment
  const noPhone = das.filter(d =>
    d.status === 'ACTIVE' && !d.phoneAssigned
  ).length

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Users size={20} className="text-blue-600" />
            DA Roster
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Synced from Amazon DSP Portal · {active} active · {onboarding} onboarding
          </p>
        </div>
        <div className="flex gap-2">
          <form action="/api/amazon/sync" method="POST">
            <button className="btn-secondary text-sm">↻ Sync from Amazon</button>
          </form>
          <Link href="/da/new" className="btn-primary">
            <Plus size={15} /> Add DA
          </Link>
        </div>
      </div>

      {/* Alert strips */}
      {dlExpiring.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-medium text-red-800">
              {dlExpiring.length} driver license(s) expiring within 90 days
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {dlExpiring.map(d => {
                const days = daysUntil(d.dlExpiry)
                return (
                  <span key={d.id} className="badge badge-red">
                    {d.name} — {dlExpiryLabel(days, d.dlExpiry)}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="stat-card border-green-200 bg-green-50">
          <p className="text-xs text-gray-500 mb-1">Active DAs</p>
          <p className="text-2xl font-semibold text-green-600">{active}</p>
        </div>
        <div className="stat-card border-blue-200 bg-blue-50">
          <p className="text-xs text-gray-500 mb-1">Onboarding</p>
          <p className="text-2xl font-semibold text-blue-600">{onboarding}</p>
        </div>
        <div className="stat-card border-red-200 bg-red-50">
          <p className="text-xs text-gray-500 mb-1">DL Expiring</p>
          <p className="text-2xl font-semibold text-red-600">{dlExpiring.length}</p>
          <p className="text-xs text-gray-400 mt-1">Within 90 days</p>
        </div>
        <div className="stat-card border-amber-200 bg-amber-50">
          <p className="text-xs text-gray-500 mb-1">No Phone Assigned</p>
          <p className="text-2xl font-semibold text-amber-600">{noPhone}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Terminated</p>
          <p className="text-2xl font-semibold text-gray-600">{terminated}</p>
        </div>
      </div>

      {/* Roster table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="section-title">All DAs</h3>
          <div className="flex gap-2">
            <select className="select text-xs py-1 w-36">
              <option value="">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Onboarding</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="TERMINATED">Terminated</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Name', 'Badge / Transponder', 'Phone', 'Off Days', 'DL Expiry', 'Equipment', 'Score', 'Alerts', 'Status'].map(h => (
                  <th key={h} className="table-header text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {das.map(da => {
                const days = daysUntil(da.dlExpiry)
                const latestScore = da.scorecards[0]

                return (
                  <tr key={da.id} className={`hover:bg-gray-50 ${da.status === 'TERMINATED' ? 'opacity-50' : ''}`}>
                    <td className="table-cell">
                      <Link href={`/da/${da.id}`} className="font-medium text-blue-600 hover:underline">
                        {da.name}
                      </Link>
                      {da.voxerId && (
                        <div className="text-xs text-gray-400">{da.voxerId}</div>
                      )}
                    </td>
                    <td className="table-cell">
                      {da.badgeId && (
                        <div className="text-xs font-mono text-gray-600">{da.badgeId}</div>
                      )}
                      {da.transponderId && (
                        <div className="text-xs font-mono text-gray-400">{da.transponderId?.slice(0, 12)}…</div>
                      )}
                    </td>
                    <td className="table-cell text-sm">
                      {da.phone ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-cell text-xs text-gray-600">
                      {da.offDays?.length > 0
                        ? da.offDays.join(', ')
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${dlExpiryColor(days)}`}>
                        {dlExpiryLabel(days, da.dlExpiry)}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-1">
                        {da.phoneAssigned
                          ? <span className="badge badge-green text-xs">📱 Phone</span>
                          : <span className="badge badge-gray text-xs">No Phone</span>
                        }
                        {da.uniformVest && <span className="badge badge-blue text-xs">Vest</span>}
                      </div>
                    </td>
                    <td className="table-cell">
                      {latestScore ? (
                        <div className="flex items-center gap-1">
                          <div className="risk-bar w-10">
                            <div
                              className={`risk-fill ${latestScore.deliveryScore >= 90 ? 'risk-fill-low' : latestScore.deliveryScore >= 75 ? 'risk-fill-medium' : 'risk-fill-high'}`}
                              style={{ width: `${latestScore.deliveryScore}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium">
                            {latestScore.deliveryScore.toFixed(0)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">No data</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {da.alerts.length > 0 ? (
                        <span className="badge badge-red">{da.alerts.length} alert</span>
                      ) : (
                        <span className="badge badge-green">Clear</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${STATUS_COLORS[da.status] ?? 'badge-gray'}`}>
                        {da.status === 'INACTIVE' ? 'Onboarding' : da.status.toLowerCase().replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {das.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-sm text-gray-400">
                    No DAs yet — click "Sync from Amazon" to import your active roster
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
