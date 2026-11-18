import { useEffect, useRef } from 'react'

/** Room kept between a name tag and the edge of the map, in screen pixels. */
const MARGIN = 6

/**
 * Keeps a far-view name tag inside the map's visible box. It shifts the tag sideways, or flips it below its tile when
 * the top would be cut off. The tag is placed by CSS, so this only sets `--tip-dx` and `data-flip` after it has drawn.
 * `shown` is true while the tag shows without the pointer (selected, or highlighted by a walkthrough). The pointer case
 * is handled on `mouseenter`. A camera glide takes a moment, so a shown tag is measured again as the view settles.
 */
export function useTipClamp(far: boolean, shown: boolean) {
  const tip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = tip.current
    const node = el?.closest<HTMLElement>('.react-flow__node')
    if (!el || !node || !far) return
    const place = () => {
      el.style.removeProperty('--tip-dx')
      delete el.dataset.flip
      if (getComputedStyle(el).display === 'none') return
      const map = node.closest('.react-flow')?.getBoundingClientRect()
      if (!map) return
      let rect = el.getBoundingClientRect()
      if (rect.top < map.top + MARGIN) {
        el.dataset.flip = ''
        rect = el.getBoundingClientRect()
      }
      const zoom = node.offsetWidth > 0 ? node.getBoundingClientRect().width / node.offsetWidth : 1
      let dx = 0
      if (rect.left < map.left + MARGIN) dx = map.left + MARGIN - rect.left
      else if (rect.right > map.right - MARGIN) dx = map.right - MARGIN - rect.right
      if (dx !== 0 && zoom > 0) el.style.setProperty('--tip-dx', `${dx / zoom}px`)
    }
    node.addEventListener('mouseenter', place)
    const timers = shown ? [0, 120, 320, 720].map((ms) => window.setTimeout(place, ms)) : []
    return () => {
      node.removeEventListener('mouseenter', place)
      timers.forEach(window.clearTimeout)
    }
  }, [far, shown])

  return tip
}
