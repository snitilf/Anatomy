import clsx from 'clsx'
import { ArrowLeft, ArrowLeftRight, ArrowRight, ChevronRight, Link2, Map as MapIcon, MoveRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { bundleSelection, type Selection } from '../app/state'
import { Tip } from '../app/Tip'
import type { Board } from '../board/schema'
import { endsOf } from '../inspector/flowRows'
import { partName } from '../inspector/names'
import type { Layer } from '../layer/model'
import type { OverviewActions } from './actions'
import { bundleWords, endName as nameOf, endRank } from '../canvas/bundleWords'
import { bundleGroups } from '../canvas/bundles'
import { innerConnections, type Bundle } from './innerConnections'
import { overviewMemory } from './memory'
import styles from './Overview.module.css'

/** The name of one end of a bundle: a group's label, or a part's name. */
const endName = (board: Board, layer: Layer, end: string) => nameOf(board, layer.proposals, end)

interface Row {
  id: string
  key: string
  label: string
  from: string
  to: string
  mine: boolean
  selection: Selection
}

/** What a pair opens on the map: the bundle, or the one connection it holds. */
function pairSelection(board: Board, pair: Bundle): Selection {
  const only = pair.count === 1 ? pair.connectionIds[0] : undefined
  if (only === undefined) return bundleSelection(pair.a, pair.b)
  return board.relationships.some((r) => r.id === only) ? { type: 'relationship', id: only } : { type: 'link', id: only }
}

/** How many pair rows show before the rest are folded away. */
const PAIRS_SHOWN = 8

function Connections({ board, layer, bundle, actions }: { board: Board; layer: Layer; bundle: Bundle; actions: OverviewActions }) {
  const rows = bundle.connectionIds.flatMap((id): Row[] => {
    const r = board.relationships.find((x) => x.id === id)
    if (r) {
      const now = endsOf(layer, r)
      return [{ id, key: `conn:${id}`, label: r.label, from: now.from, to: now.to, mine: false, selection: { type: 'relationship', id } as const }]
    }
    const l = layer.links.find((x) => x.id === id)
    return l ? [{ id, key: `conn:${id}`, label: l.label || 'Link', from: l.from, to: l.to, mine: true, selection: { type: 'link', id } as const }] : []
  })
  const name = (id: string) => partName(board, id, layer.proposals) ?? id
  return (
    <ul className={styles.list}>
      {rows.map((c) => (
        <li key={c.id}>
          <button type="button" className={styles.connection} data-row={c.key} data-yours={c.mine || undefined} onClick={() => actions.openOnMap(c.selection, c.key)}>
            {c.mine ? <Link2 className={styles.icon} size={14} strokeWidth={1.5} aria-hidden="true" /> : <MoveRight className={styles.icon} size={14} strokeWidth={1.5} aria-hidden="true" />}
            <span className={styles.grow}>{c.label}</span>
            <span className={styles.meta}>
              {name(c.from)} to {name(c.to)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * One row for each pair of groups that has connections between them, the busiest first. A row opens to its connections,
 * and each of those opens on the map. A part with no group stands for itself.
 */
export function BetweenSection({ board, layer, actions }: { board: Board; layer: Layer; actions: OverviewActions }) {
  const memory = overviewMemory(board.id)
  const [, redraw] = useState(0)
  // The busiest first. A part the user proposed is an end of its own.
  const bundles = useMemo(
    () => bundleGroups(board, layer.links, layer.reconnects, layer.proposals).sort((p, q) => q.count - p.count),
    [board, layer.links, layer.reconnects, layer.proposals],
  )
  const inner = useMemo(() => innerConnections(board, layer.links, layer.reconnects), [board, layer.links, layer.reconnects])
  if (bundles.length + inner.length === 0) return null
  const total = [...bundles, ...inner].reduce((n, b) => n + b.count, 0)
  // The busiest rows show first. The rest wait behind one row, and the inside-a-group rows stay in view.
  const all = memory.expanded.has('more')
  const shownPairs = all ? bundles : bundles.slice(0, PAIRS_SHOWN)
  const hidden = bundles.length - PAIRS_SHOWN
  const toggle = (key: string, open: boolean) => {
    if (open) memory.expanded.delete(key)
    else memory.expanded.add(key)
    redraw((n) => n + 1)
  }
  return (
    <section className={styles.section} aria-labelledby="ov-between" data-section="between">
      <h3 id="ov-between" className={styles.heading}>
        Connections <span className={styles.count}>{total}</span>
      </h3>
      <ul className={styles.list}>
        {shownPairs.map((b) => {
          const key = `${b.a}|${b.b}`
          const open = memory.expanded.has(key)
          // The ends read in the order of the board's groups.
          const first = endRank(board, b.a) <= endRank(board, b.b)
          const a = endName(board, layer, first ? b.a : b.b)
          const z = endName(board, layer, first ? b.b : b.a)
          // The arrow is the way the connections run, as the far view's tag says it.
          const words = bundleWords(board, layer.proposals, b)
          const Way = words.way === 'forward' ? ArrowRight : words.way === 'backward' ? ArrowLeft : ArrowLeftRight
          return (
            <li key={key} className={styles.pairItem}>
              <button
                type="button"
                className={clsx(styles.pair, styles.withMap)}
                data-row={`between:${key}`}
                data-yours={b.mine || undefined}
                aria-expanded={open}
                aria-label={words.spoken}
                onClick={() => toggle(key, open)}
              >
                <ChevronRight className={styles.chevron} size={14} strokeWidth={1.5} aria-hidden="true" data-open={open || undefined} />
                <span className={styles.pairEnds}>
                  <span>{a}</span>
                  <Way className={styles.icon} size={14} strokeWidth={1.5} aria-hidden="true" />
                  <span>{z}</span>
                </span>
                <span className={styles.end}>
                  <span className={styles.count}>{b.count}</span>
                </span>
              </button>
              <Tip label="Show on map" side="left">
                <button type="button" className={styles.mapButton} aria-label={`Show ${a} and ${z} on the map`} onClick={() => actions.openOnMap(pairSelection(board, b), `between:${key}`)}>
                  <MapIcon size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </Tip>
              {open && <Connections board={board} layer={layer} bundle={b} actions={actions} />}
            </li>
          )
        })}
        {hidden > 0 && (
          <li>
            <button type="button" className={styles.showMore} data-row="between:more" aria-expanded={all} onClick={() => toggle('more', all)}>
              {all ? 'Show fewer' : `Show ${hidden} more`}
            </button>
          </li>
        )}
        {inner.map((b) => {
          const key = `inside:${b.a}`
          const open = memory.expanded.has(key)
          const name = endName(board, layer, b.a)
          return (
            <li key={key}>
              <button
                type="button"
                className={styles.pair}
                data-row={`between:${key}`}
                data-yours={b.mine || undefined}
                aria-expanded={open}
                aria-label={`Inside ${name}, ${b.count} ${b.count === 1 ? 'connection' : 'connections'}`}
                onClick={() => toggle(key, open)}
              >
                <ChevronRight className={styles.chevron} size={14} strokeWidth={1.5} aria-hidden="true" data-open={open || undefined} />
                <span className={styles.pairEnds}>
                  <span>Inside {name}</span>
                </span>
                <span className={styles.end}>
                  <span className={styles.count}>{b.count}</span>
                </span>
              </button>
              {open && <Connections board={board} layer={layer} bundle={b} actions={actions} />}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
