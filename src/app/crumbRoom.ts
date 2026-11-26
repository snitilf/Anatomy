import { useEffect, useState, type RefObject } from 'react'

/** A truncated middle segment narrower than this shows too few letters to be worth its room: about six characters and the padding. */
export const MIDDLE_MIN = 58

/** How much more room the crumb needs before it tries the unfolded form again, so it does not flicker at the edge. */
export const UNFOLD_MARGIN = 60

const margins = (el: Element) => {
  const s = getComputedStyle(el)
  return (Number.parseFloat(s.marginLeft) || 0) + (Number.parseFloat(s.marginRight) || 0)
}

/**
 * The width the trail may take inside the bar's left zone: the zone's inner width less any visible
 * siblings beside the trail (such as the save status). Because the bar is a three-zone grid, the
 * left zone already excludes the center view switch and the right controls.
 */
export function measureCrumbRoom(zone: HTMLElement, nav: HTMLElement): number {
  const style = getComputedStyle(zone)
  const padLeft = Number.parseFloat(style.paddingLeft) || 0
  const padRight = Number.parseFloat(style.paddingRight) || 0
  const others = [...zone.children].filter((c) => c !== nav && getComputedStyle(c).display !== 'none')
  const used = others.reduce((sum, c) => sum + (c as HTMLElement).offsetWidth + margins(c), 0)
  return Math.max(0, zone.clientWidth - padLeft - padRight - used)
}

/**
 * Tracks the width the trail may take inside the bar's left zone.
 * Nothing beside the trail in that zone depends on the trail, so a change of the trail never changes the answer.
 */
export function useCrumbRoom(nav: RefObject<HTMLElement | null>): number | undefined {
  const [room, setRoom] = useState<number | undefined>(undefined)
  useEffect(() => {
    const el = nav.current
    const zone = el?.parentElement
    if (!el || !zone || typeof ResizeObserver === 'undefined') return
    const measure = () => setRoom(measureCrumbRoom(zone, el))
    const watch = new ResizeObserver(measure)
    watch.observe(zone)
    for (const c of zone.children) if (c !== el) watch.observe(c)
    measure()
    return () => watch.disconnect()
  }, [nav])
  return room
}
