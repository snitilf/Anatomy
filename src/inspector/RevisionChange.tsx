import { lazy, Suspense } from 'react'
import { useAppStore } from '../app/store'
import { Group } from './bits'
import { fieldChanges } from './fieldChanges'
import { loadRevisionFields } from './loadRevisionFields'

type Target = { type: 'board' } | { type: 'component' | 'relationship'; id: string }

/** The word comparison loads when a revision arrives or a changed part opens, so a board that never changes does not carry it. */
const Fields = lazy(loadRevisionFields)

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
    // The whole group waits for the comparison, so its heading never shows with nothing under it.
    <Suspense fallback={null}>
      <Group name="revision-change" title={`Changed in revision ${board.revision}`} label={`Changed in revision ${board.revision}, before and after`}>
        <Fields fields={fields} />
      </Group>
    </Suspense>
  )
}
