import { Bot, FileText, Lightbulb, MessageSquareQuote, type LucideIcon } from 'lucide-react'
import type { SourceKind } from '../board/schema'
import { SOURCE_LABEL, SOURCE_MEANING } from './labels'

const ICON: Record<SourceKind, LucideIcon> = {
  'agent-explanation': Bot,
  'agent-proposal': Lightbulb,
  'documented-intent': FileText,
  'user-stated': MessageSquareQuote,
}

/** A small icon and quiet words for where something comes from. `iconOnly` keeps the words for screen readers. */
export function SourceNote({ kind, className, iconOnly = false }: { kind: SourceKind; className?: string | undefined; iconOnly?: boolean }) {
  const Icon = ICON[kind]
  return (
    <span className={className} data-source={kind} title={SOURCE_MEANING[kind]}>
      <Icon size={iconOnly ? 14 : 16} strokeWidth={1.5} aria-hidden="true" />
      {iconOnly ? <span className="sr-only">{SOURCE_LABEL[kind]}</span> : <span>{SOURCE_LABEL[kind]}</span>}
    </span>
  )
}
