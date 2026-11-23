import { useStore, useStoreApi, ViewportPortal } from '@xyflow/react'
import { memo, useCallback, useEffect, useMemo, useRef, type CSSProperties, type FocusEvent, type MouseEvent, type PointerEvent } from 'react'
import type { Point, Rect } from '../layout/geometry'
import { type BundleWords } from './bundleWords'
import { middleOf, nearestBundle, visibleArrows, type Bundle } from './bundleRoutes'
import { spotlight } from './emphasis'
import { farLabelScale } from './far'
import { YOURS_DASH, YOURS_FAR_DASH } from './kinds'
import { groupNameRect, isMixed, nameRoom, placeCounts } from './farLabels'
import { clampTip } from './useTipClamp'
import styles from './FarLayer.module.css'

export interface FarGroup {
  id: string
  label: string
  count: number
  area: Rect
}

/** How far a press may travel and still count as a click, in screen pixels. Past it, the map was being dragged. */
const CLICK_SLOP = 4

/** How far from a line a tap still picks it, in screen pixels: half the width of its touch target. */
const TOUCH_REACH = 12

const unitOf = (target: EventTarget | null): HTMLElement | null => (target instanceof Element ? target.closest<HTMLElement>('[data-unit]') : null)

/**
 * What the map draws in the far view, in board coordinates: the name and part count of each group, and the bundled lines between groups with their counts and arrowheads. All of
 * it is counter-scaled by `--label-scale`, so it holds a size on screen. Where each count sits is worked out for the
 * label scale, so it never lands on a name or a tile, and a count with no room is left out.
 *
 * Each bundle is one unit: its line with a wide invisible stroke for the pointer, its arrowhead, and one button, which is
 * the count where there is room for it and a hidden one where there is not. The pointer and the keyboard lift a bundle
 * and its two ends and name it in one shared tag. That is done on the elements, not in state, so the pointer moving over
 * the lines never renders the layer.
 */
export const FarLayer = memo(function FarLayer({
  groups,
  bundles,
  tiles,
  selected,
  selectedEnds,
  words,
  onPick,
  onOpen,
}: {
  groups: readonly FarGroup[]
  bundles: readonly Bundle[]
  /** Every card, which a count keeps off. */
  tiles: readonly Rect[]
  /** The key of the selected bundle. */
  selected?: string | undefined
  /** The two ends of the selected bundle. The names of the other groups step back. */
  selectedEnds?: readonly string[] | undefined
  /** How a bundle reads, for its tag and its button. */
  words: (bundle: Bundle) => BundleWords
  onPick: (id: string) => void
  /** Selects a bundle, or the connection it holds when it holds one. */
  onOpen: (bundle: Bundle) => void
}) {
  const scale = useStore((s) => farLabelScale(s.transform[2]))
  const flow = useStoreApi()
  const room = useMemo(() => nameRoom(groups, scale), [groups, scale])
  const placed = useMemo(() => {
    const groupNames = groups.map((g) => groupNameRect(g.area, g.label, g.count, scale, room.get(g.id)))
    return placeCounts(bundles, [...tiles, ...groupNames], scale)
  }, [groups, bundles, tiles, scale, room])
  // Heads that would pile into a ladder at a block's edge are dropped. This follows the quantized scale, so it runs on a
  // threshold crossing and never per frame.
  const heads = useMemo(() => visibleArrows(bundles, scale), [bundles, scale])
  const said = useMemo(() => new Map(bundles.map((b) => [b.id, words(b)])), [bundles, words])
  const byId = useMemo(() => new Map(bundles.map((b) => [b.id, b])), [bundles])

  const layer = useRef<HTMLDivElement>(null)
  const anchor = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const shown = useRef<string | undefined>(undefined)
  const pressed = useRef<{ x: number; y: number } | undefined>(undefined)

  /** Names a bundle in the shared tag at a point of the board, inside the map, and lifts its two ends. */
  const show = useCallback(
    (id: string, at: Point) => {
      const bundle = byId.get(id)
      const el = tip.current
      const spot = anchor.current
      if (!bundle || !el || !spot) return
      shown.current = id
      el.textContent = said.get(id)?.tag ?? ''
      spot.style.left = `${at.x}px`
      spot.style.top = `${at.y}px`
      el.dataset.show = ''
      const map = layer.current?.closest('.react-flow')?.getBoundingClientRect()
      if (map) clampTip(el, map, flow.getState().transform[2])
      const ends = [bundle.a, bundle.b]
      spotlight({ groups: ends.filter((e) => e.startsWith('group:')), parts: ends.filter((e) => !e.startsWith('group:')) })
    },
    [byId, said, flow],
  )
  const hide = useCallback(() => {
    if (shown.current === undefined) return
    shown.current = undefined
    if (tip.current) delete tip.current.dataset.show
    spotlight(undefined)
  }, [])

  // A bundle that goes while its tag is up (a link added, a layout that changed) takes the tag and the lift with it.
  useEffect(() => {
    if (shown.current !== undefined && !byId.has(shown.current)) hide()
  }, [byId, hide])

  // The layer goes with the far view. A tag and a lift it left behind go too.
  useEffect(
    () => () => {
      if (shown.current !== undefined) spotlight(undefined)
    },
    [],
  )

  const onOver = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    const unit = unitOf(event.target)
    const id = unit?.dataset.unit
    if (!id || id === shown.current) return
    // The tag is at the pointer, in board pixels: the layer sits at the board's origin.
    const origin = layer.current?.getBoundingClientRect()
    const zoom = flow.getState().transform[2]
    if (!origin || zoom <= 0) return
    show(id, { x: (event.clientX - origin.left) / zoom, y: (event.clientY - origin.top) / zoom })
  }
  const onOut = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    const unit = unitOf(event.target)
    if (unit && unitOf(event.relatedTarget) === unit) return
    if (unit) hide()
  }
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const id = unitOf(event.target)?.dataset.unit
    // A press focuses the button too, and the pointer has shown the tag already.
    if (!id || !(event.target as Element).matches(':focus-visible')) return
    const bundle = byId.get(id)
    if (bundle) show(id, placed.get(id) ?? middleOf(bundle.points))
  }
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (unitOf(event.target)) hide()
  }
  const onPress = (event: PointerEvent<HTMLDivElement>) => {
    pressed.current = { x: event.clientX, y: event.clientY }
  }
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    let id = unitOf(event.target)?.dataset.unit
    if (!id) return
    // A finger covers several lines at once and the browser gives the touch to the one drawn last. Give it to the line nearest the finger.
    // A count is a button of its own, and a tap on it stays with its bundle.
    if ((event.nativeEvent as globalThis.PointerEvent).pointerType === 'touch' && !(event.target instanceof Element && event.target.closest('button'))) {
      const origin = layer.current?.getBoundingClientRect()
      const zoom = flow.getState().transform[2]
      if (origin && zoom > 0) id = nearestBundle(bundles, { x: (event.clientX - origin.left) / zoom, y: (event.clientY - origin.top) / zoom }, TOUCH_REACH / zoom) ?? id
    }
    // A click on a bundle is not a click on the map behind it, which would clear the selection.
    event.stopPropagation()
    const start = pressed.current
    pressed.current = undefined
    // A drag that began on a line pans the map. It does not pick the bundle where it ends.
    if (start && event.detail !== 0 && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) return
    const bundle = byId.get(id)
    if (bundle) onOpen(bundle)
  }

  return (
    <ViewportPortal>
      <div ref={layer} className={styles.layer} onPointerOver={onOver} onPointerOut={onOut} onPointerDown={onPress} onFocus={onFocus} onBlur={onBlur} onClick={onClick}>
        {groups.map((g) => (
          <div key={g.id} className={styles.anchor} style={{ left: g.area.x, top: g.area.y }}>
            <button type="button" className={styles.name} style={{ maxWidth: room.get(g.id) }} data-far-label="" data-quiet={selectedEnds && !selectedEnds.includes(`group:${g.id}`) ? '' : undefined} title={g.label} aria-label={`${g.label}, ${g.count} ${g.count === 1 ? 'part' : 'parts'}. Zoom to this group.`} onClick={() => onPick(g.id)}>
              <span className={styles.text}>{g.label}</span>
              <span className={styles.number}>{g.count}</span>
            </button>
          </div>
        ))}
        {bundles.map((b) => {
          const at = placed.get(b.id)
          const mine = b.mine || undefined
          const on = selected === b.id || undefined
          const say = said.get(b.id)
          const hint = b.count === 1 ? 'Open it.' : 'Show them.'
          const label = `${say?.spoken ?? ''}. ${hint}`
          const head = b.arrow
          return (
            <div key={b.id} className={styles.unit} data-unit={b.id} data-mine={mine} data-on={on}>
              <svg className={styles.lines} width="1" height="1" aria-hidden="true">
                <path d={b.d} className={styles.bundle} data-bundle="" data-mine={mine} data-on={on} style={{ '--w': b.width, ...(mine ? { '--far-dash': YOURS_FAR_DASH } : {}) } as CSSProperties} />
                <path d={b.d} className={styles.hit} data-hit="" />
              </svg>
              {head && (
                <div
                  className={styles.arrow}
                  data-bundle=""
                  data-mine={mine}
                  data-on={on}
                  data-dropped={heads.has(b.id) ? undefined : ''}
                  aria-hidden="true"
                  style={{ left: head.at.x, top: head.at.y, '--angle': `${head.angle}deg` } as CSSProperties}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <path d="M0 0 L-7 -3.5 L-7 3.5 Z" />
                  </svg>
                </div>
              )}
              {at ? (
                <button type="button" className={styles.count} data-bundle="" data-mine={mine} data-on={on} aria-label={label} style={{ left: at.x, top: at.y }}>
                  {b.count}
                  {/* A bundle that holds a link of the user's among the agent's lines: one dash and dot of theirs under the count. */}
                  {isMixed(b) && (
                    <svg className={styles.yoursTick} width="13" height="4" viewBox="0 0 13 4" aria-hidden="true">
                      <line x1="0.75" y1="2" x2="12.5" y2="2" strokeDasharray={YOURS_DASH} />
                    </svg>
                  )}
                </button>
              ) : (
                <button type="button" className={styles.reach} aria-label={label} style={{ left: middleOf(b.points).x, top: middleOf(b.points).y }} />
              )}
            </div>
          )
        })}
        <div ref={anchor} className={styles.tipAnchor}>
          <div ref={tip} className={styles.tip} data-bundle-tip="" aria-hidden="true" />
        </div>
      </div>
    </ViewportPortal>
  )
})
