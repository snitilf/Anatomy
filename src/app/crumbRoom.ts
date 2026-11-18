import { useEffect, useState, type RefObject } from 'react'

/** A truncated middle segment narrower than this shows too few letters to be worth its room: about six characters and the padding. */
export const MIDDLE_MIN = 58

/** How much more room the crumb needs before it tries the unfolded form again, so it does not flicker at the edge. */
export const UNFOLD_MARGIN = 60

const margins = (el: Element) => {
  const s = getComputedStyle(el)
  return Number.parseFloat(s.marginLeft) + Number.parseFloat(s.marginRight)
}

/**
 * The width the crumb may take in its bar: the bar less its padding and everything beside the crumb.
 * Nothing beside it depends on the crumb, so a change of the crumb never changes the answer.
 */
export function useCrumbRoom(nav: RefObject<HTMLElement | null>): number | undefined {
  const [room, setRoom] = useState<number | undefined>(undefined)
  useEffect(() => {
    const el = nav.current
    const bar = el?.parentElement
    if (!el || !bar || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const style = getComputedStyle(bar)
      const others = [...bar.children].filter((c) => c !== el && getComputedStyle(c).display !== 'none')
      const used = others.reduce((sum, c) => sum + (c as HTMLElement).offsetWidth + margins(c), 0)
      setRoom(bar.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) - used)
    }
    const watch = new ResizeObserver(measure)
    watch.observe(bar)
    for (const c of bar.children) if (c !== el) watch.observe(c)
    measure()
    return () => watch.disconnect()
  }, [nav])
  return room
}
