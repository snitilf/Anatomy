import { Link2, MoveRight } from 'lucide-react'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../app/store'
import { useUi } from '../app/ui'
import { usePhone } from '../app/usePhone'
import type { Board } from '../board/schema'
import { MANUAL_PREFIX } from '../canvas/buildGraph'
import { frameConnection } from '../canvas/bundleFrame'
import { bundleWords } from '../canvas/bundleWords'
import { bundleGroups } from '../canvas/bundles'
import { useCommands } from '../commands/context'
import { StatusGlyph } from '../status/StatusGlyph'
import { itemState, STATE_WORD, type ItemState } from '../status/state'
import { Tip } from '../app/Tip'
import type { Selection } from '../app/state'
import type { Layer } from '../layer/model'
import { Heading } from './bits'
import { endsOf } from './flowRows'
import { partName } from './names'
import { usePanel } from './panelContext'
import { spotProps } from './spotlight'
import styles from './view.module.css'

interface Row {
  id: string
  label: string
  from: string
  to: string
  mine: boolean
  state?: ItemState
  select: Selection
  edge: string
}

function rowsOf(board: Board, layer: Layer | undefined, ids: readonly string[]): Row[] {
  return ids.flatMap((id): Row[] => {
    const r = board.relationships.find((x) => x.id === id)
    if (r) {
      const now = endsOf(layer, r)
      return [{ id, label: r.label, from: now.from, to: now.to, mine: false, select: { type: 'relationship', id }, edge: id }]
    }
    const l = layer?.links.find((x) => x.id === id)
    if (!l) return []
    const state = layer ? itemState(board, layer, { type: 'link', item: l }) : undefined
    return [{ id, label: l.label || 'Link', from: l.from, to: l.to, mine: true, ...(state ? { state } : {}), select: { type: 'link', id }, edge: `${MANUAL_PREFIX}${id}` }]
  })
}

/** What the sidebar shows for a bundle: the pair, how many connections it holds, and each one as a row that opens it on the map. */
export function BundleView({ board, a, b }: { board: Board; a: string; b: string }) {
  const { layer } = useAppStore(useShallow((s) => ({ layer: s.layer })))
  const { choose } = usePanel()
  const { context } = useCommands()
  const phone = usePhone()
  const stop = useUi((u) => u.sheet)
  const links = layer?.links
  const reconnects = layer?.reconnects
  const made = layer?.proposals
  const pair = useMemo(() => bundleGroups(board, links ?? [], reconnects ?? [], made ?? []).find((p) => p.a === a && p.b === b), [board, links, reconnects, made, a, b])
  if (!pair) return null
  const proposals = made ?? []
  const words = bundleWords(board, proposals, pair)
  const rows = rowsOf(board, layer, pair.connectionIds)
  const name = (id: string) => partName(board, id, proposals) ?? id
  /** Opens the connection: selects it and frames it so its text reads. On a phone the sheet hides the lower half. */
  const open = (row: Row) => {
    choose(row.select)
    requestAnimationFrame(() => {
      const camera = context().camera
      if (camera) frameConnection(camera, camera.rectOf(row.from), camera.rectOf(row.to), phone && stop === 1 ? 0.5 : 0)
    })
  }
  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <Heading>{words.title}</Heading>
        <p className={styles.lead}>{pair.count === 1 ? '1 connection' : `${pair.count} connections`}</p>
      </div>
      <ul className={styles.rows}>
        {rows.map((row) => (
          <li key={row.id} {...spotProps({ parts: [row.from, row.to], edges: [row.edge] })}>
            <button type="button" className={`${styles.row} ${row.mine ? styles.yours : ''}`} data-row={`conn:${row.id}`} onClick={() => open(row)}>
              {row.mine ? <Link2 className={styles.yoursIcon} size={14} strokeWidth={1.5} aria-hidden="true" /> : <MoveRight className={styles.rowIcon} size={14} strokeWidth={1.5} aria-hidden="true" />}
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{row.label}</span>
                <span className={styles.rowMeta}>
                  {name(row.from)} to {name(row.to)}
                </span>
              </span>
              {row.state && (
                <Tip label={STATE_WORD[row.state]}>
                  <span className={styles.rowEnd}>
                    <StatusGlyph state={row.state} />
                  </span>
                </Tip>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
