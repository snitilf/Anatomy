import clsx from 'clsx'
import { CircleHelp, Link2, Shapes, SquarePlus, StickyNote, Spline, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import buttons from '../app/buttons.module.css'
import rowsCss from '../app/rows.module.css'
import { useAppStore } from '../app/store'
import { Tip } from '../app/Tip'
import { useUiApi } from '../app/ui'
import type { Board } from '../board/schema'
import { useCommands } from '../commands/context'
import type { Layer } from '../layer/model'
import { StatusGlyph } from '../status/StatusGlyph'
import { StatusKey } from '../status/StatusKey'
import { itemState, STATE_WORD, type ItemState } from '../status/state'
import { targetName } from '../notes/targets'
import { StartHere } from '../overview/StartHere'
import { startHereCount } from '../overview/model'
import { Group, Heading } from './bits'
import { boardMeta } from './boardMeta'
import { partName } from './names'
import { NotesSection } from './notes'
import { RevisionChange } from './RevisionChange'
import { spotOf, spotProps } from './spotlight'
import { usePanel } from './panelContext'
import type { Selection } from '../app/state'
import styles from './view.module.css'

const YOURS_SHOWN = 5

const MARK_WORD = { stroke: 'Drawing', rect: 'Rectangle', ellipse: 'Ellipse', arrow: 'Arrow', text: 'Text', sticky: 'Sticky note' } as const

interface YoursRow {
  key: string
  icon: LucideIcon
  text: string
  where: string
  state: ItemState
  select: Selection
}

/** Everything the user made, newest last, as one list. */
function yoursRows(board: Board, layer: Layer): YoursRow[] {
  const name = (id: string) => partName(board, id, layer.proposals) ?? id
  const rows: YoursRow[] = []
  for (const n of layer.notes) {
    const select: Selection = n.target.type === 'board' ? { type: 'board' } : { type: n.target.type, id: n.target.id }
    rows.push({ key: n.id, icon: n.kind === 'note' ? StickyNote : CircleHelp, text: n.text, where: targetName(board, n.target), state: itemState(board, layer, { type: 'note', item: n }), select })
  }
  for (const l of layer.links) {
    rows.push({ key: l.id, icon: Link2, text: l.label || 'Link', where: `${name(l.from)} to ${name(l.to)}`, state: itemState(board, layer, { type: 'link', item: l }), select: { type: 'link', id: l.id } })
  }
  for (const p of layer.proposals) {
    rows.push({ key: p.id, icon: SquarePlus, text: p.label, where: 'New part', state: itemState(board, layer, { type: 'proposal', item: p }), select: { type: 'proposal', id: p.id } })
  }
  for (const m of layer.marks) {
    const text = m.kind === 'text' || m.kind === 'sticky' ? m.text || MARK_WORD[m.kind] : (m.note ?? MARK_WORD[m.kind])
    rows.push({ key: m.id, icon: Shapes, text, where: MARK_WORD[m.kind], state: itemState(board, layer, { type: 'mark', item: m }), select: { type: 'mark', id: m.id } })
  }
  for (const e of layer.reconnects) {
    const r = board.relationships.find((x) => x.id === e.relationshipId)
    if (r) rows.push({ key: e.id, icon: Spline, text: r.label, where: 'Moved connection', state: itemState(board, layer, { type: 'reconnect', item: e }), select: { type: 'relationship', id: r.id } })
  }
  return rows
}

function Yours({ board, layer }: { board: Board; layer: Layer }) {
  const { choose } = usePanel()
  const [all, setAll] = useState(false)
  const rows = yoursRows(board, layer)
  if (rows.length === 0) return null
  const shown = all ? rows : rows.slice(0, YOURS_SHOWN)
  return (
    <Group name="yours" title="Yours" count={rows.length}>
      <ul className={styles.rows}>
        {shown.map((row) => {
          const Icon = row.icon
          return (
            <li key={row.key} {...spotProps(spotOf(row.select))}>
              <button type="button" className={clsx(rowsCss.row, rowsCss.sm, rowsCss.yours, styles.yoursRow)} onClick={() => choose(row.select)}>
                <Icon className={styles.yoursIcon} size={14} strokeWidth={1.5} aria-hidden="true" />
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{row.text}</span>
                  {row.where !== row.text && <span className={styles.rowMeta}>{row.where}</span>}
                </span>
                <Tip label={STATE_WORD[row.state]}>
                  <span className={styles.rowEnd}>
                    <StatusGlyph state={row.state} />
                  </span>
                </Tip>
              </button>
            </li>
          )
        })}
      </ul>
      <div className={styles.foot}>
        {rows.length > YOURS_SHOWN && (
          <button
            type="button"
            className={clsx(buttons.button, buttons.link, buttons.small, styles.more)}
            aria-expanded={all}
            onClick={() => setAll(!all)}
          >
            {all ? 'Show less' : `Show all ${rows.length}`}
          </button>
        )}
        <StatusKey />
      </div>
    </Group>
  )
}

function StartHereSection({ board }: { board: Board }) {
  const { context } = useCommands()
  const ui = useUiApi()
  const count = startHereCount(board)
  if (count === 0) return null
  return (
    <Group name="start-here" title="Start here" count={count}>
      <StartHere
        board={board}
        compact
        limit={5}
        onPlay={(id) => context().shell.playWalkthrough(id)}
        onOpenLesson={(lessonId, partId) => ui.openLesson(lessonId, partId)}
      />
    </Group>
  )
}

/** What the sidebar shows with nothing selected. The parts and connections are on the Overview page. */
export function Overview({ board }: { board: Board }) {
  const { layer } = useAppStore(useShallow((s) => ({ layer: s.layer })))
  const groups = board.groups.filter((g) => board.components.some((c) => c.group === g.id)).length
  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <Heading>{board.title}</Heading>
        <p className={styles.lead}>{board.goal}</p>
        <p className={styles.boardMeta}>{boardMeta(board.components.length, groups, board.relationships.length, board.revision)}</p>
      </div>
      <RevisionChange target={{ type: 'board' }} />
      <StartHereSection board={board} />
      {layer && <Yours board={board} layer={layer} />}
      <NotesSection target={{ type: 'board' }} />
    </div>
  )
}
