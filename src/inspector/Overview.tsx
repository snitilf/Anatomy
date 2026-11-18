import { Check, CircleHelp, Link2, Play, Shapes, SquarePlus, StickyNote, Spline, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../app/store'
import { Tip } from '../app/Tip'
import type { Board } from '../board/schema'
import { useCommands } from '../commands/context'
import type { Layer } from '../layer/model'
import { wasSent } from '../layer/status'
import { targetName } from '../notes/targets'
import { Group, Heading, OpenItems, Prop, Props, ShortList } from './bits'
import { partName } from './names'
import { NotesSection } from './notes'
import { usePanel } from './panelContext'
import type { Selection } from '../app/state'
import styles from './view.module.css'

const YOURS_SHOWN = 5
const WALKTHROUGHS_SHOWN = 5

const MARK_WORD = { stroke: 'Drawing', rect: 'Rectangle', ellipse: 'Ellipse', arrow: 'Arrow', text: 'Text', sticky: 'Sticky note' } as const

interface YoursRow {
  key: string
  icon: LucideIcon
  text: string
  where: string
  sent: boolean
  select: Selection
}

/** Everything the user made, newest last, as one list. */
function yoursRows(board: Board, layer: Layer): YoursRow[] {
  const name = (id: string) => partName(board, id, layer.proposals) ?? id
  const rows: YoursRow[] = []
  for (const n of layer.notes) {
    const select: Selection = n.target.type === 'board' ? { type: 'board' } : { type: n.target.type, id: n.target.id }
    rows.push({ key: n.id, icon: n.kind === 'note' ? StickyNote : CircleHelp, text: n.text, where: targetName(board, n.target), sent: wasSent(layer, n), select })
  }
  for (const l of layer.links) {
    rows.push({ key: l.id, icon: Link2, text: l.label || 'Link', where: `${name(l.from)} to ${name(l.to)}`, sent: wasSent(layer, l), select: { type: 'link', id: l.id } })
  }
  for (const p of layer.proposals) {
    rows.push({ key: p.id, icon: SquarePlus, text: p.label, where: 'New part', sent: wasSent(layer, p), select: { type: 'proposal', id: p.id } })
  }
  for (const m of layer.marks) {
    const text = m.kind === 'text' || m.kind === 'sticky' ? m.text || MARK_WORD[m.kind] : (m.note ?? MARK_WORD[m.kind])
    rows.push({ key: m.id, icon: Shapes, text, where: MARK_WORD[m.kind], sent: wasSent(layer, m), select: { type: 'mark', id: m.id } })
  }
  for (const e of layer.reconnects) {
    const r = board.relationships.find((x) => x.id === e.relationshipId)
    if (r) rows.push({ key: e.id, icon: Spline, text: r.label, where: 'Moved connection', sent: wasSent(layer, e), select: { type: 'relationship', id: r.id } })
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
            <li key={row.key}>
              <button type="button" className={`${styles.row} ${styles.yours}`} onClick={() => choose(row.select)}>
                <Icon className={styles.yoursIcon} size={14} strokeWidth={1.5} aria-hidden="true" />
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{row.text}</span>
                  {row.where !== row.text && <span className={styles.rowMeta}>{row.where}</span>}
                </span>
                {row.sent && (
                  <Tip label="Sent">
                    <span className={styles.rowEnd}>
                      <Check size={14} strokeWidth={1.5} aria-hidden="true" />
                      <span className="sr-only">Sent</span>
                    </span>
                  </Tip>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {rows.length > YOURS_SHOWN && (
        <button type="button" className={styles.more} aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show less' : `Show all ${rows.length}`}
        </button>
      )}
    </Group>
  )
}

function Walkthroughs({ board }: { board: Board }) {
  const { context } = useCommands()
  const [all, setAll] = useState(false)
  const found = board.scenarios
  if (found.length === 0) return null
  const shown = all ? found : found.slice(0, WALKTHROUGHS_SHOWN)
  return (
    <Group name="walkthroughs" title="Walkthroughs" count={found.length}>
      <ul className={styles.rows}>
        {shown.map((s) => (
          <li key={s.id}>
            <button type="button" className={styles.row} aria-label={`Play ${s.title}`} onClick={() => context().shell.playWalkthrough(s.id)}>
              <Play className={styles.play} size={14} strokeWidth={1.5} aria-hidden="true" />
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{s.title}</span>
              </span>
              <span className={styles.rowEnd}>
                {s.steps.length} {s.steps.length === 1 ? 'step' : 'steps'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {found.length > WALKTHROUGHS_SHOWN && (
        <button type="button" className={styles.more} aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show less' : `Show ${found.length - WALKTHROUGHS_SHOWN} more`}
        </button>
      )}
    </Group>
  )
}

/** What the sidebar shows with nothing selected. The parts and connections are on the Overview page. */
export function Overview({ board }: { board: Board }) {
  const { layer } = useAppStore(useShallow((s) => ({ layer: s.layer })))
  const boardItems = board.items.filter((i) => i.about === undefined)
  const groups = board.groups.filter((g) => board.components.some((c) => c.group === g.id)).length
  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <Heading>{board.title}</Heading>
        <p className={styles.lead}>{board.goal}</p>
      </div>
      <Props>
        <Prop label="Revision">{board.revision}</Prop>
        <Prop label="Parts">
          {board.components.length}
          {groups > 0 && ` in ${groups} ${groups === 1 ? 'group' : 'groups'}`}
        </Prop>
        {board.relationships.length > 0 && <Prop label="Connections">{board.relationships.length}</Prop>}
      </Props>
      <Walkthroughs board={board} />
      {layer && <Yours board={board} layer={layer} />}
      {board.scope.includes.length > 0 && (
        <Group name="covers" title="Covers" defaultOpen={false}>
          <ShortList items={board.scope.includes} />
        </Group>
      )}
      {board.scope.excludes.length > 0 && (
        <Group name="does-not-cover" title="Does not cover" defaultOpen={false}>
          <ShortList items={board.scope.excludes} />
        </Group>
      )}
      <OpenItems items={boardItems} />
      <NotesSection target={{ type: 'board' }} />
    </div>
  )
}
