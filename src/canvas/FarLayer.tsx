import { useStore, ViewportPortal } from '@xyflow/react'
import { memo, useMemo, type CSSProperties } from 'react'
import type { Rect } from '../layout/geometry'
import { visibleArrows, type Bundle } from './bundleRoutes'
import { farLabelScale } from './far'
import { groupNameRect, placeCounts } from './farLabels'
import styles from './FarLayer.module.css'

export interface FarGroup {
  id: string
  label: string
  count: number
  area: Rect
}

/**
 * What the map draws in the far view, in board coordinates: the name and part count of each group, and the bundled lines between groups with their counts and arrowheads. All of
 * it is counter-scaled by `--label-scale`, so it holds a size on screen. Where each count sits is worked out for the
 * label scale, so it never lands on a name or a tile, and a count with no room is left out.
 */
export const FarLayer = memo(function FarLayer({
  groups,
  bundles,
  tiles,
  onPick,
}: {
  groups: readonly FarGroup[]
  bundles: readonly Bundle[]
  /** Every card, which a count keeps off. */
  tiles: readonly Rect[]
  onPick: (id: string) => void
}) {
  const scale = useStore((s) => farLabelScale(s.transform[2]))
  const placed = useMemo(() => {
    const groupNames = groups.map((g) => groupNameRect(g.area, g.label, g.count, scale))
    return placeCounts(bundles, [...tiles, ...groupNames], scale)
  }, [groups, bundles, tiles, scale])
  // Heads that would pile into a ladder at a block's edge are dropped. This follows the quantized scale, so it runs on a
  // threshold crossing and never per frame.
  const heads = useMemo(() => visibleArrows(bundles, scale), [bundles, scale])
  return (
    <ViewportPortal>
      <div className={styles.layer}>
        <svg className={styles.lines} width="1" height="1" aria-hidden="true">
          {bundles.map((b) => (
            <path key={b.id} d={b.d} className={styles.bundle} data-bundle="" data-mine={b.mine || undefined} style={{ strokeWidth: b.width }} />
          ))}
        </svg>
        {bundles.map((b) =>
          b.arrow && heads.has(b.id) ? (
            <div key={`arrow:${b.id}`} className={styles.arrow} data-bundle="" data-mine={b.mine || undefined} aria-hidden="true" style={{ left: b.arrow.at.x, top: b.arrow.at.y, '--angle': `${b.arrow.angle}deg` } as CSSProperties}>
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M0 0 L-7 -3.5 L-7 3.5 Z" />
              </svg>
            </div>
          ) : null,
        )}
        {bundles.map((b) => {
          const at = placed.get(b.id)
          return at ? (
            <div key={b.id} className={styles.count} data-bundle="" aria-hidden="true" style={{ left: at.x, top: at.y }}>
              <span data-far-label="">{b.count}</span>
            </div>
          ) : null
        })}
        {groups.map((g) => (
          <div key={g.id} className={styles.anchor} style={{ left: g.area.x, top: g.area.y }}>
            <button type="button" className={styles.name} data-far-label="" title={g.label} aria-label={`${g.label}, ${g.count} ${g.count === 1 ? 'part' : 'parts'}. Zoom to this group.`} onClick={() => onPick(g.id)}>
              <span className={styles.text}>{g.label}</span>
              <span className={styles.number}>{g.count}</span>
            </button>
          </div>
        ))}
      </div>
    </ViewportPortal>
  )
})
