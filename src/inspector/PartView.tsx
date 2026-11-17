import { ChevronRight, GraduationCap } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Board, BoardComponent } from '../board/schema'
import { findLesson } from '../lessons/catalog'
import { LessonDialog } from '../lessons/LessonDialog'
import { Cited, Explanation, Group, Heading, OpenItems, Prop, Props, SourceLine } from './bits'
import { FlowBlock } from './Flow'
import { usePlainFlow } from './hooks'
import { NotesSection } from './notes'
import styles from './view.module.css'

function Lesson({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const lesson = findLesson(id)
  if (!lesson) return null
  return (
    <Group name="lesson" title="Lesson">
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
    </Group>
  )
}

/** What a part takes in and gives out that no connection names, as prose. */
function Takes({ plain }: { plain: ReturnType<typeof usePlainFlow> }) {
  return (
    <>
      {([['Takes in', plain.in], ['Gives out', plain.out]] as const).map(([label, list]) =>
        list.length === 0 ? null : (
          <div key={label} className={styles.takes}>
            <p className={styles.takesLabel}>{label}</p>
            <ul className={styles.plainList}>
              {list.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          </div>
        ),
      )}
    </>
  )
}

export function PartView({ board, component }: { board: Board; component: BoardComponent }) {
  const items = board.items.filter((i) => i.about === component.id)
  const group = board.groups.find((g) => g.id === component.group)
  const plain = usePlainFlow(component.id)
  const hasPlain = plain.in.length + plain.out.length > 0
  const hasSource = component.source.kind !== 'agent-explanation'
  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <Heading>{component.label}</Heading>
        <p className={styles.lead}>{component.summary}</p>
      </div>
      {(group || hasSource) && (
        <Props>
          {group && <Prop label="Group">{group.label}</Prop>}
          {hasSource && (
            <Prop label="Source">
              <SourceLine source={component.source} />
            </Prop>
          )}
        </Props>
      )}
      <FlowBlock partId={component.id} />
      {(component.explanation || hasPlain) && <Explanation source={component.explanation ?? ''} extra={<Takes plain={plain} />} />}
      {component.lesson !== undefined && <Lesson id={component.lesson} />}
      <OpenItems items={items} />
      <Cited source={component.source} />
      <NotesSection target={{ type: 'component', id: component.id }} />
    </div>
  )
}
