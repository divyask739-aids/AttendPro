import { useMemo } from 'react'

import { SparklesIcon } from '@/components/icons'
import { Card } from '@/components/ui/Card'
import { getSuggestions } from '@/features/planner/plannerEngine'
import type { Suggestion } from '@/features/planner/types'

const DOT_TONE = {
  info: 'bg-indigo-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
} as const

interface AiSuggestionsCardProps {
  goals: Parameters<typeof getSuggestions>[0]
  attendancePercent: number
  plan: Parameters<typeof getSuggestions>[2]
}

export function AiSuggestionsCard({ goals, attendancePercent, plan }: AiSuggestionsCardProps) {
  const suggestions = useMemo<Suggestion[]>(
    () => getSuggestions(goals, attendancePercent, plan),
    [goals, attendancePercent, plan],
  )

  return (
    <Card
      title="AI Suggestions"
      description="Rule-based for now, AI-ready"
      action={<SparklesIcon className="h-5 w-5 text-indigo-500" />}
    >
      {suggestions.length === 0 ? (
        <p className="text-sm text-slate-500">You are all caught up. No tips right now.</p>
      ) : (
        <ul className="space-y-3">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_TONE[suggestion.tone]}`}
              />
              <p className="text-sm leading-relaxed text-slate-600">{suggestion.message}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
