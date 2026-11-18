import { useStore, ViewportPortal } from '@xyflow/react'
import { memo, useMemo, type CSSProperties } from 'react'
import type { Rect } from '../layout/geometry'
import type { Bundle } from './bundleRoutes'
import { farLabelScale } from './far'
import { groupNameRect, placeCounts, placeNames, type NamedTile } from './farLabels'
import styles from './FarLayer.module.css'

export interface FarGroup {
  id: string
  label: string
  count: number
  area: Rect
}

/**
 * What the map draws in the far view, in board coordinates: the name and part count of each group, a name under each
 * part that has no group and room for it, and the bundled lines between groups with their counts and arrowheads. All of
 * it is counter-scaled by `--label-scale`, so it holds a size on screen. Where each label sits is worked out for the
 * label scale, so a count never lands on a name, and a label with no room is left out.
 */
export const FarLayer = memo(function FarLayer({
  groups,
  bundles,
  tiles,
  obstacles,
  onPick,
}: {
  groups: readonly FarGroup[]
  bundles: readonly Bundle[]
  /** The parts that have no group, and the proposed parts. */
  tiles: readonly NamedTile[]
  /** Every card and every group area, which a name keeps off. */
  obstacles: readonly Rect[]
  onPick: (id: string) => void
}) {
  const scale = useStore((s) => farLabelScale(s.transform[2]))
  const placed = useMemo(() => {
    const groupNames = groups.map((g) => groupNameRect(g.area, g.label, g.count, scale))
    const names = placeNames(tiles, [...obstacles, ...groupNames], scale)
    const counts = placeCounts(bundles, [...obstacles, ...groupNames, ...names.map((n) => n.box)], scale)
    return { names, counts }
  }, [groups, bundles, tiles, obstacles, scale])
  return (
    <ViewportPortal>
      <div className={styles.layer}>
        <svg className={styles.lines} width="1" height="1" aria-hidden="true">
          {bundles.map((b) => (
            <path key={b.id} d={b.d} className={styles.bundle} data-bundle="" data-mine={b.mine || undefined} style={{ strokeWidth: b.width }} />
          ))}
        </svg>
        {bundles.map((b) =>
          b.arrow ? (
            <div key={`arrow:${b.id}`} className={styles.arrow} data-bundle="" data-mine={b.mine || undefined} aria-hidden="true" style={{ left: b.arrow.at.x, top: b.arrow.at.y, '--angle': `${b.arrow.angle}deg` } as CSSProperties}>
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M0 0 L-9 -4.5 L-9 4.5 Z" />
              </svg>
            </div>
          ) : null,
        )}
        {bundles.map((b) => {
          const at = placed.counts.get(b.id)
          return at ? (
            <div key={b.id} className={styles.count} data-bundle="" aria-hidden="true" style={{ left: at.x, top: at.y }}>
              <span data-far-label="">{b.count}</span>
            </div>
          ) : null
        })}
        {placed.names.map((n) => {
          const tile = tiles.find((t) => t.id === n.id)
          return tile ? (
            <div key={n.id} className={styles.tile} data-below={n.box.y >= tile.rect.y + tile.rect.height || undefined} data-above={n.box.y < tile.rect.y || undefined} aria-hidden="true" style={{ left: n.at.x, top: n.at.y }}>
              <span data-far-label="" style={{ maxWidth: n.max }}>{tile.label}</span>
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
