import { SparklesIcon } from '@/components/icons'
import { Card } from '@/components/ui/Card'
import type { Recommendation, RecommendationTone } from '@/types'

const TONE_DOT: Record<RecommendationTone, string> = {
  info: 'bg-indigo-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
}

const TONE_TEXT: Record<RecommendationTone, string> = {
  info: 'text-slate-600',
  success: 'text-slate-600',
  warning: 'text-slate-700',
  danger: 'text-rose-700',
}

const TONE_CARD: Partial<Record<RecommendationTone, string>> = {
  danger: 'border-rose-200 bg-rose-50',
  warning: 'border-amber-200 bg-amber-50',
}

interface RecommendationsCardProps {
  recommendations: Recommendation[]
  title?: string
  description?: string
  className?: string
  emptyMessage?: string
}

/** Reused by Dashboard, Tasks and Goal Planner. */
export function RecommendationsCard({
  recommendations,
  title = 'Recommendations',
  description = 'Based on your attendance, tasks and goals',
  className,
  emptyMessage = 'Nothing to recommend right now.',
}: RecommendationsCardProps) {
  return (
    <Card
      title={title}
      description={description}
      className={className}
      action={<SparklesIcon className="h-5 w-5 text-indigo-500" />}
    >
      {recommendations.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <ul className="space-y-2.5">
          {recommendations.map((item) => (
            <li
              key={item.id}
              className={`flex items-start gap-2.5 rounded-xl px-3 py-2 ${
                TONE_CARD[item.tone] ?? 'bg-slate-50'
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[item.tone]}`}
              />
              <p className={`text-sm leading-relaxed ${TONE_TEXT[item.tone]}`}>
                {item.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
