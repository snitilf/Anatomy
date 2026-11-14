import { ChevronRight, GraduationCap } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Board, BoardComponent } from '../board/schema'
import { findLesson } from '../lessons/catalog'
import { LessonDialog } from '../lessons/LessonDialog'
import { BackButton, Cited, Explanation, Heading, OpenItems, Section, SourceLine } from './bits'
import { FlowBlock } from './Flow'
import { NotesSection } from './notes'
import styles from './view.module.css'

function Lesson({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const lesson = findLesson(id)
  if (!lesson) return null
  return (
    <Section title="Lesson">
      <ul className={styles.rows}>
        <li>
          <button ref={opener} type="button" className={`${styles.row} ${styles.lesson}`} onClick={() => setOpen(true)}>
            <GraduationCap className={styles.rowIcon} size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className={styles.rowMain}>
              <span className={styles.rowTitle}>{lesson.title}</span>
              <span className={styles.rowMeta}>{lesson.summary}</span>
            </span>
            <ChevronRight className={styles.rowIcon} size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </li>
      </ul>
      {open && (
        <LessonDialog
          lessonId={lesson.id}
          onClose={() => {
            setOpen(false)
            requestAnimationFrame(() => opener.current?.focus())
          }}
        />
      )}
    </Section>
  )
}

export function PartView({ board, component }: { board: Board; component: BoardComponent }) {
  const items = board.items.filter((i) => i.about === component.id)
  const group = board.groups.find((g) => g.id === component.group)
  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <BackButton />
        <Heading>{component.label}</Heading>
        {(group || component.source.kind !== 'agent-explanation') && (
          <p className={styles.meta}>
            {group && <span>{group.label}</span>}
            <SourceLine source={component.source} />
          </p>
        )}
      </div>
      <p className={styles.lead}>{component.summary}</p>
      <FlowBlock partId={component.id} />
      {component.explanation && <Explanation source={component.explanation} />}
      {component.lesson !== undefined && <Lesson id={component.lesson} />}
      <OpenItems items={items} />
      <Cited source={component.source} />
      <NotesSection target={{ type: 'component', id: component.id }} />
    </div>
  )
}
