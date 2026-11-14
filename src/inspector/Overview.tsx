import { ArrowRight, Check, CircleHelp, Link2, Play, Shapes, SquarePlus, StickyNote, Spline, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { SourceNote } from '../app/SourceNote'
import { useAppStore } from '../app/store'
import { Tip } from '../app/Tip'
import type { Board } from '../board/schema'
import { useCommands } from '../commands/context'
import type { Layer } from '../layer/model'
import { wasSent } from '../layer/status'
import { targetName } from '../notes/targets'
import { Heading, OpenItems, Section, ShortList } from './bits'
import { partName } from './names'
import { NotesSection } from './notes'
import { usePanel } from './panelContext'
import type { Selection } from '../app/state'
import styles from './view.module.css'

/** More parts than this, and the lists get a filter field. */
const FILTER_FROM = 8
const YOURS_SHOWN = 5

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
    <Section title="Yours" count={rows.length}>
      <ul className={styles.rows}>
        {shown.map((row) => {
          const Icon = row.icon
          return (
            <li key={row.key}>
              <button type="button" className={`${styles.row} ${styles.yours}`} onClick={() => choose(row.select)}>
                <Icon className={styles.yoursIcon} size={14} strokeWidth={1.5} aria-hidden="true" />
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{row.text}</span>
                  <span className={styles.rowMeta}>{row.where}</span>
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
    </Section>
  )
}

function Walkthroughs({ board }: { board: Board }) {
  const { context } = useCommands()
  if (board.scenarios.length === 0) return null
  return (
    <Section title="Walkthroughs" count={board.scenarios.length}>
      <ul className={styles.rows}>
        {board.scenarios.map((s) => (
          <li key={s.id}>
            <button type="button" className={styles.row} aria-label={`Play ${s.title}`} onClick={() => context().shell.playWalkthrough(s.id)}>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{s.title}</span>
              </span>
              <span className={styles.rowEnd}>
                <Play className={styles.play} size={14} strokeWidth={1.5} aria-hidden="true" />
                {s.steps.length} {s.steps.length === 1 ? 'step' : 'steps'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/** Parts and connections, under one filter field once the board is large. */
function PartsAndConnections({ board }: { board: Board }) {
  const { choose } = usePanel()
  const [query, setQuery] = useState('')
  const names = new Map(board.components.map((c) => [c.id, c.label]))
  const groups = new Map(board.groups.map((g) => [g.id, g.label]))
  const q = query.trim().toLowerCase()
  const parts = board.components.filter((c) => q === '' || c.label.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q))
  const lines = board.relationships.filter((r) => q === '' || [r.label, names.get(r.from) ?? '', names.get(r.to) ?? ''].some((t) => t.toLowerCase().includes(q)))
  return (
    <>
      {board.components.length > FILTER_FROM && (
        <input className={styles.filter} type="search" placeholder="Filter" aria-label="Filter parts and connections" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      {parts.length + lines.length === 0 && <p className={styles.empty}>No parts or connections match "{query.trim()}".</p>}
      {parts.length > 0 && (
        <Section title="Parts" count={parts.length}>
          <ul className={styles.rows}>
            {parts.map((c) => (
              <li key={c.id}>
                <button type="button" className={styles.row} onClick={() => choose({ type: 'component', id: c.id })}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{c.label}</span>
                    {c.group && groups.get(c.group) && <span className={styles.rowMeta}>{groups.get(c.group)}</span>}
                  </span>
                  {c.source.kind !== 'agent-explanation' && <SourceNote kind={c.source.kind} className={styles.rowEnd} iconOnly />}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {lines.length > 0 && (
        <Section title="Connections" count={lines.length}>
          <ul className={styles.rows}>
            {lines.map((r) => (
              <li key={r.id}>
                <button type="button" className={styles.row} onClick={() => choose({ type: 'relationship', id: r.id })}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{r.label}</span>
                    <span className={styles.rowMeta}>
                      {names.get(r.from) ?? r.from}
                      <ArrowRight className={styles.inlineArrow} size={12} strokeWidth={1.5} aria-hidden="true" />
                      <span className="sr-only"> to </span>
                      {names.get(r.to) ?? r.to}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

export function Overview({ board }: { board: Board }) {
  const { layer } = useAppStore(useShallow((s) => ({ layer: s.layer })))
  const boardItems = board.items.filter((i) => i.about === undefined)
  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <Heading>{board.title}</Heading>
        <p className={styles.lead}>{board.goal}</p>
        <p className={styles.meta}>Revision {board.revision}</p>
      </div>
      <Walkthroughs board={board} />
      {layer && <Yours board={board} layer={layer} />}
      <PartsAndConnections board={board} />
      {board.scope.includes.length > 0 && (
        <Section title="Covers">
          <ShortList items={board.scope.includes} />
        </Section>
      )}
      {board.scope.excludes.length > 0 && (
        <Section title="Does not cover">
          <ShortList items={board.scope.excludes} />
        </Section>
      )}
      <OpenItems items={boardItems} />
      <NotesSection target={{ type: 'board' }} />
    </div>
  )
}
