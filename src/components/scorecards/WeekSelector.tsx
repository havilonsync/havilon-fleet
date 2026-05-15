'use client'

import { useRouter } from 'next/navigation'
import { getISOWeek, getYear, subWeeks } from 'date-fns'

function buildOptions(count = 12): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = subWeeks(new Date(), i)
    return `${getYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`
  })
}

export default function WeekSelector({ current }: { current: string }) {
  const router  = useRouter()
  const options = buildOptions()
  const all     = options.includes(current) ? options : [...options, current].sort().reverse()

  return (
    <select
      value={current}
      onChange={e => router.push(`/scorecards/upload?week=${e.target.value}`)}
      className="select text-sm font-mono w-36"
    >
      {all.map(w => (
        <option key={w} value={w}>{w}</option>
      ))}
    </select>
  )
}
