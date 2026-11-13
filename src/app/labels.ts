import type { RelationshipKind, SourceKind } from '../board/schema'

/** Short label on a card or badge. Always shown as text, never as color alone. */
export const SOURCE_LABEL: Record<SourceKind, string> = {
  'agent-explanation': 'Agent explanation',
  'agent-proposal': 'Agent proposal',
  'documented-intent': 'Documented',
  'user-stated': 'You said',
}

/** One plain sentence about how far to trust a source. */
export const SOURCE_MEANING: Record<SourceKind, string> = {
  'agent-explanation': 'Your agent describes this as it understands it.',
  'agent-proposal': 'Your agent suggests this. Nobody has decided it yet.',
  'documented-intent': 'A written plan or spec says this.',
  'user-stated': 'You told your agent this.',
}

/** The kind, as words that fit between two part names. */
export const KIND_WORDS: Record<RelationshipKind, string> = {
  calls: 'calls',
  'sends-data-to': 'sends data to',
  'stores-in': 'stores data in',
  'reads-from': 'reads data from',
  'depends-on': 'depends on',
  triggers: 'triggers',
  unknown: 'Meaning unknown',
}

export const KIND_ORDER: readonly RelationshipKind[] = [
  'calls',
  'triggers',
  'sends-data-to',
  'stores-in',
  'reads-from',
  'depends-on',
  'unknown',
]

export const ITEM_LABEL = { assumption: 'Assumption', unknown: 'Unknown', question: 'Question' } as const
