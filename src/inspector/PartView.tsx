import clsx from 'clsx'
import { GraduationCap } from 'lucide-react'
import buttons from '../app/buttons.module.css'
import type { Board, BoardComponent } from '../board/schema'
import { frameGroup } from '../canvas/groupFrame'
import { useCommands } from '../commands/context'
import { findLesson } from '../lessons/catalog'
import { useUiApi } from '../app/ui'
import { Cited, Explanation, Heading, OpenItems, SourceLine } from './bits'
import { FlowBlock } from './Flow'
import { usePlainFlow } from './hooks'
import { NotesSection } from './notes'
import { RevisionChange } from './RevisionChange'
import styles from './view.module.css'

/** One raised row for the part's interactive lesson, directly under the summary. The whole row is the button. */
function Lesson({ id, part }: { id: string; part: string }) {
  const ui = useUiApi()
  const lesson = findLesson(id)
  if (!lesson) return null
  return (
    <section className={styles.lessonSection} aria-label="Lesson">
      <h3 className="sr-only">Lesson</h3>
      <button
        type="button"
        className={styles.lessonCard}
        data-lesson-opener={part}
        onClick={() => ui.openLesson(lesson.id, part)}
      >
        <GraduationCap className={styles.lessonIcon} size={14} strokeWidth={1.5} aria-hidden="true" />
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{lesson.title}</span>
          <span className={styles.rowMeta}>{lesson.summary}</span>
        </span>
        <span className={clsx(buttons.button, buttons.small, styles.lessonAction)} aria-hidden="true">
          Open lesson
        </span>
      </button>
    </section>
  )
}

/** What a part takes in and gives out that no connection names, as prose. */
function Takes({ plain }: { plain: ReturnType<typeof usePlainFlow> }) {
  return (
    <>
      {(
        [
          ['Takes in', plain.in],
          ['Gives out', plain.out],
        ] as const
      ).map(([label, list]) =>
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
  const { context } = useCommands()
  const items = board.items.filter((i) => i.about === component.id)
  const group = board.groups.find((g) => g.id === component.group)
  const plain = usePlainFlow(component.id)
  const hasPlain = plain.in.length + plain.out.length > 0
  const frame = () => {
    const camera = context().camera
    if (camera && group) frameGroup(camera, board, group.id)
  }
  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <p className={styles.eyebrow}>
          <span>Part</span>
          {group && (
            <>
              <span aria-hidden="true"> · </span>
              <button type="button" className={clsx(buttons.button, buttons.link, buttons.small, styles.eyebrowGroup)} title={group.label} onClick={frame}>
                <span className={styles.clip}>{group.label}</span>
              </button>
            </>
          )}
        </p>
        <Heading>{component.label}</Heading>
        <p className={styles.lead}>{component.summary}</p>
        <SourceLine source={component.source} className={styles.partSource} />
      </div>
      <RevisionChange target={{ type: 'component', id: component.id }} />
      {component.lesson !== undefined && <Lesson id={component.lesson} part={component.id} />}
      {(component.explanation || hasPlain) && <Explanation source={component.explanation ?? ''} extra={<Takes plain={plain} />} />}
      <FlowBlock partId={component.id} />
      <OpenItems items={items} />
      <Cited source={component.source} />
      <NotesSection target={{ type: 'component', id: component.id }} />
    </div>
  )
}
