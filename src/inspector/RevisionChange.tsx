import { lazy, Suspense } from 'react'
import { useAppStore } from '../app/store'
import { Group } from './bits'
import { fieldChanges } from './fieldChanges'

type Target = { type: 'board' } | { type: 'component' | 'relationship'; id: string }

/** The word comparison loads the first time a changed part is opened, so a board that never changes does not carry it. */
const Fields = lazy(() => import('./RevisionFields'))

/**
 * What the latest revision changed in the part, connection, or board that is open, field by field: how it read before and how it
 * reads now, with the words that differ marked. It shows until the changes are marked reviewed.
 */
export function RevisionChange({ target }: { target: Target }) {
  const board = useAppStore((s) => s.board)
  const previous = useAppStore((s) => s.previousBoard)
  const changes = useAppStore((s) => s.changes)
  const changed = !!changes && (target.type === 'board' ? changes.boardChanged : (target.type === 'component' ? changes.changed.components : changes.changed.relationships).includes(target.id))
  const fields = changed && board && previous ? fieldChanges(previous, board, target) : []
  if (!board || fields.length === 0) return null
  return (
    <Group name="revision-change" title={`Changed in revision ${board.revision}`}>
      <Suspense fallback={null}>
        <Fields fields={fields} />
      </Suspense>
    </Group>
  )
}
