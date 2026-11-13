import { useCallback, useEffect, useRef } from 'react'
import { useAppDispatch, useAppState } from '../app/appContext'
import type { Selection } from '../app/state'
import { ComponentDetail } from './ComponentDetail'
import styles from './Inspector.module.css'
import { Overview } from './Overview'
import { PanelContext } from './panelContext'
import { RelationshipDetail } from './RelationshipDetail'

export interface InspectorProps {
  /** When given, a part that has a lesson shows an "Open lesson" button. */
  onOpenLesson?: ((lessonId: string) => void) | undefined
}

export function Inspector({ onOpenLesson }: InspectorProps) {
  const { board, selection } = useAppState()
  const dispatch = useAppDispatch()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusNext = useRef(false)
  const key = selection ? (selection.type === 'board' ? 'board' : `${selection.type}:${selection.id}`) : 'board'

  // A choice made inside this panel replaces the panel's content, so focus moves to the new heading.
  const choose = useCallback(
    (next: Selection) => {
      focusNext.current = true
      dispatch({ type: 'select', selection: next })
    },
    [dispatch],
  )

  useEffect(() => {
    if (!focusNext.current) return
    focusNext.current = false
    headingRef.current?.focus()
  }, [key])

  if (!board) return null

  let content
  if (selection?.type === 'component') {
    const component = board.components.find((c) => c.id === selection.id)
    content = component ? <ComponentDetail board={board} component={component} onOpenLesson={onOpenLesson} /> : <Overview board={board} />
  } else if (selection?.type === 'relationship') {
    const relationship = board.relationships.find((r) => r.id === selection.id)
    content = relationship ? <RelationshipDetail board={board} relationship={relationship} /> : <Overview board={board} />
  } else {
    content = <Overview board={board} />
  }

  return (
    <PanelContext.Provider value={{ choose, headingRef }}>
      <aside className={styles.panel} aria-label="Details" data-testid="inspector">
        <div key={key} className={styles.content}>
          {content}
        </div>
      </aside>
    </PanelContext.Provider>
  )
}
