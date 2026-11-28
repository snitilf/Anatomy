import { lazy, Suspense } from 'react'
import { useAppStore } from '../app/store'

type Target = { type: 'board' } | { type: 'component' | 'relationship'; id: string }

/** The comparison loads the first time a changed part is opened, so a board that never changes does not carry it. */
const Body = lazy(() => import('./RevisionChangeBody'))

/**
 * What the latest revision changed in the part, connection, or board that is open, field by field: how it read before and how it
 * reads now, with the words that differ marked. It shows until the changes are marked reviewed.
 */
export function RevisionChange({ target }: { target: Target }) {
  const changed = useAppStore((s) => {
    const { changes, previousBoard } = s
    if (!changes || !previousBoard) return false
    if (target.type === 'board') return changes.boardChanged
    return (target.type === 'component' ? changes.changed.components : changes.changed.relationships).includes(target.id)
  })
  if (!changed) return null
  return (
    <Suspense fallback={null}>
      <Body target={target} />
    </Suspense>
  )
}
