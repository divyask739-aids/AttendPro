import { RecommendationsCard } from '@/components/RecommendationsCard'
import type { Suggestion } from '@/features/planner/types'

export function AiSuggestionsCard({ suggestions }: { suggestions: Suggestion[] }) {
  return (
    <RecommendationsCard
      title="Smart Suggestions"
      description="Generated from your attendance, tasks and goals"
      recommendations={suggestions}
      emptyMessage="No suggestions right now — you're on track."
    />
  )
}
