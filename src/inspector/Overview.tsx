import { ArrowRight, Check, CircleHelp, Link2, Play, Shapes, SquarePlus, StickyNote, Spline, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { SourceNote } from '../app/SourceNote'
import { useAppStore } from '../app/store'
import { Tip } from '../app/Tip'
import type { Board, BoardComponent } from '../board/schema'
import { useCommands } from '../commands/context'
import type { Layer } from '../layer/model'
import { wasSent } from '../layer/status'
import { targetName } from '../notes/targets'
import { Group, Heading, OpenItems, Prop, Props, ShortList, SubHead } from './bits'
import { partName } from './names'
import { NotesSection } from './notes'
import { usePanel } from './panelContext'
import type { Selection } from '../app/state'
import styles from './view.module.css'

/** More parts than this, and the lists get a filter field. */
const FILTER_FROM = 8
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

function Walkthroughs({ board, query }: { board: Board; query: string }) {
  const { context } = useCommands()
  const [all, setAll] = useState(false)
  const found = board.scenarios.filter((s) => query === '' || s.title.toLowerCase().includes(query))
  if (found.length === 0) return null
  const shown = all ? found : found.slice(0, WALKTHROUGHS_SHOWN)
  return (
    <Group name="walkthroughs" title="Walkthroughs" count={found.length} forceOpen={query !== ''}>
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

/** The parts under their group's name, in the order of the board's groups. Parts with no group come last. */
function byGroup(board: Board, parts: readonly BoardComponent[]): { key: string; label: string | undefined; parts: BoardComponent[] }[] {
  if (board.groups.length === 0) return [{ key: '', label: undefined, parts: [...parts] }]
  const sections = board.groups.map((g) => ({ key: g.id, label: g.label as string | undefined, parts: parts.filter((c) => c.group === g.id) }))
  const known = new Set(board.groups.map((g) => g.id))
  const other = parts.filter((c) => c.group === undefined || !known.has(c.group))
  if (other.length > 0) sections.push({ key: '', label: 'Other', parts: other })
  return sections.filter((s) => s.parts.length > 0)
}

function PartRows({ board, parts }: { board: Board; parts: readonly BoardComponent[] }) {
  const { choose } = usePanel()
  return (
    <>
      {byGroup(board, parts).map((section) => (
        <div key={section.key || 'other'}>
          {section.label !== undefined && <SubHead>{section.label}</SubHead>}
          <ul className={styles.rows}>
            {section.parts.map((c) => (
              <li key={c.id}>
                <button type="button" className={styles.row} onClick={() => choose({ type: 'component', id: c.id })}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{c.label}</span>
                  </span>
                  {c.source.kind !== 'agent-explanation' && <SourceNote kind={c.source.kind} className={styles.rowEnd} iconOnly />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

/** Parts and connections, under one filter field once the board is large. */
function PartsAndConnections({ board, query }: { board: Board; query: string }) {
  const { choose } = usePanel()
  const names = new Map(board.components.map((c) => [c.id, c.label]))
  const q = query.trim().toLowerCase()
  const parts = board.components.filter((c) => q === '' || c.label.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q))
  const lines = board.relationships.filter((r) => q === '' || [r.label, names.get(r.from) ?? '', names.get(r.to) ?? ''].some((t) => t.toLowerCase().includes(q)))
  return (
    <>
      {parts.length + lines.length === 0 && <p className={styles.empty}>No parts or connections match "{query.trim()}".</p>}
      {parts.length > 0 && (
        <Group name="parts" title="Parts" count={parts.length} forceOpen={q !== ''}>
          <PartRows board={board} parts={parts} />
        </Group>
      )}
      {lines.length > 0 && (
        <Group name="connections" title="Connections" count={lines.length} defaultOpen={false} forceOpen={q !== ''}>
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
        </Group>
      )}
    </>
  )
}

export function Overview({ board }: { board: Board }) {
  const { layer } = useAppStore(useShallow((s) => ({ layer: s.layer })))
  const [query, setQuery] = useState('')
  const boardItems = board.items.filter((i) => i.about === undefined)
  const q = query.trim().toLowerCase()
  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <Heading>{board.title}</Heading>
        <p className={styles.lead}>{board.goal}</p>
      </div>
      <Props>
        <Prop label="Revision">{board.revision}</Prop>
        <Prop label="Parts">{board.components.length}</Prop>
        <Prop label="Connections">{board.relationships.length}</Prop>
      </Props>
      {board.components.length > FILTER_FROM && (
        <div className={styles.filterBar}>
          <input className={styles.filter} type="search" name="filter" placeholder="Filter" aria-label="Filter parts and connections" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      <Walkthroughs board={board} query={q} />
      {layer && <Yours board={board} layer={layer} />}
      <PartsAndConnections board={board} query={query} />
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
