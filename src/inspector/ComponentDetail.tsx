import { useRef, useState } from 'react'
import type { Board, BoardComponent } from '../board/schema'
import { findLesson } from '../lessons/catalog'
import { LessonDialog } from '../lessons/LessonDialog'
import { LinksSection } from '../notes/Links'
import { NotesSection } from '../notes/NotesSection'
import { Markdown } from '../text/markdown'
import { BackButton, BulletList, CitedSection, ConnectionButton, Disclosure, Heading, OpenItems, Section, SourceLine } from './parts'
import styles from './parts.module.css'

export function ComponentDetail({
  board,
  component,
}: {
  board: Board
  component: BoardComponent
}) {
  const [lessonOpen, setLessonOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const lesson = component.lesson === undefined ? undefined : findLesson(component.lesson)
  const outgoing = board.relationships.filter((r) => r.from === component.id)
  const incoming = board.relationships.filter((r) => r.to === component.id)
  const items = board.items.filter((i) => i.about === component.id)
  const group = board.groups.find((g) => g.id === component.group)

  return (
    <>
      <BackButton />
      <Heading>{component.label}</Heading>
      {(group || component.source.kind !== 'agent-explanation') && (
        <div className={styles.meta}>
          {group && <span>In {group.label}</span>}
          <SourceLine source={component.source} />
        </div>
      )}

      <p className={styles.lead}>{component.summary}</p>

      {(component.inputs.length > 0 || component.outputs.length > 0) && (
        <div className={styles.io}>
          {component.inputs.length > 0 && (
            <div>
              <h3 className={styles.sectionTitle}>Takes in</h3>
              <BulletList items={component.inputs} />
            </div>
          )}
          {component.outputs.length > 0 && (
            <div>
              <h3 className={styles.sectionTitle}>Hands out</h3>
              <BulletList items={component.outputs} />
            </div>
          )}
        </div>
      )}

      {component.lesson !== undefined && lesson && (
        <Section title="Lesson">
          <div className={styles.lessonCard}>
            <span className={styles.lessonTitle}>{lesson.title}</span>
            <p className={styles.lessonSummary}>{lesson.summary}</p>
            <button ref={opener} type="button" className={styles.primary} onClick={() => setLessonOpen(true)}>
              Open lesson
            </button>
          </div>
          {lessonOpen && (
            <LessonDialog
              lessonId={lesson.id}
              onClose={() => {
                setLessonOpen(false)
                requestAnimationFrame(() => opener.current?.focus())
              }}
            />
          )}
        </Section>
      )}
      {component.lesson !== undefined && !lesson && <p className={styles.quiet}>Lesson not available</p>}

      {outgoing.length > 0 && (
        <Section title="Goes to">
          <div className={styles.stack}>
            {outgoing.map((r) => (
              <ConnectionButton key={r.id} relationship={r} board={board} direction="out" />
            ))}
          </div>
        </Section>
      )}
      {incoming.length > 0 && (
        <Section title="Comes from">
          <div className={styles.stack}>
            {incoming.map((r) => (
              <ConnectionButton key={r.id} relationship={r} board={board} direction="in" />
            ))}
          </div>
        </Section>
      )}

      {component.explanation && (
        <Disclosure title="Explanation">
          <Markdown source={component.explanation} className={styles.prose ?? ''} />
        </Disclosure>
      )}
      <OpenItems items={items} />
      <CitedSection source={component.source} />
      <LinksSection componentId={component.id} />
      <NotesSection target={{ type: 'component', id: component.id }} />
    </>
  )
}
