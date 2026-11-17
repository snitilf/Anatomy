import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { useAppStore } from '../app/store'
import { useUi, useUiApi, type UiState } from '../app/ui'
import { prefersStillness } from '../canvas/cameraContext'
import styles from './Sheet.module.css'
import { findItem } from '../layer/edits'

/** The header and handle, which is all the sheet shows at its lowest stop. */
export const PEEK = 64
/** Faster than this, in px per ms, a release goes on to the next stop in that direction. */
const FLICK = 0.11
/** Less movement than this is a tap on the header. */
const TAP = 4

type Stop = UiState['sheet']

/** How far down the sheet sits at each stop: its header only, half the screen, or all of it. */
function offsets(height: number): Record<Stop, number> {
  return { 0: Math.max(0, height - PEEK), 1: Math.round(height / 2), 2: 0 }
}

/** Past either end the sheet moves a fifth of the finger's distance. */
function rubber(offset: number, max: number): number {
  if (offset < 0) return offset * 0.2
  if (offset > max) return max + (offset - max) * 0.2
  return offset
}

/** A short name for what the sidebar shows, for the sheet's header on a phone. */
function useSidebarTitle(): string {
  return useAppStore((s) => {
    const board = s.board
    const sel = s.selection
    if (!board) return ''
    if (sel?.type === 'component') return board.components.find((c) => c.id === sel.id)?.label ?? board.title
    if (sel?.type === 'relationship') return board.relationships.find((r) => r.id === sel.id)?.label ?? board.title
    if (sel && s.layer && sel.type !== 'board') {
      const found = findItem(s.layer, sel.id)
      if (found?.type === 'link') return found.item.label || 'Link'
      if (found?.type === 'proposal') return found.item.label
      if (found?.type === 'mark') return 'Mark'
    }
    return board.title
  })
}

/**
 * The sidebar on a phone: a sheet over the map with three stops. Only its header drags, so the content scrolls freely.
 * While the finger is down the sheet follows it exactly. On release it settles on a stop, or goes on to the next one
 * after a flick. It moves by transform only.
 */
export function Sheet({ body }: { body: (header: ReactNode) => ReactNode }) {
  const ui = useUiApi()
  const stop = useUi((u) => u.sheet)
  const title = useSidebarTitle()
  const playing = useAppStore((s) => s.scenario !== undefined)
  const selected = useAppStore((s) => (s.selection && s.selection.type !== 'board' ? `${s.selection.type}:${s.selection.id}` : undefined))
  const sheet = useRef<HTMLElement>(null)
  const [height, setHeight] = useState(0)
  const drag = useRef<{ y: number; start: number; samples: { y: number; t: number }[] } | undefined>(undefined)

  // The sheet is as tall as the space under the top bar.
  useLayoutEffect(() => {
    const parent = sheet.current?.parentElement
    if (!parent) return
    const measure = () => setHeight(parent.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  const place = (offset: number, settle: boolean, rest = true) => {
    const el = sheet.current
    if (!el) return
    if (settle && !prefersStillness()) el.dataset.settling = ''
    else delete el.dataset.settling
    el.style.transform = `translate3d(0, ${offset}px, 0)`
    // The part below the screen is padding, so the list and the composer end at the bottom edge of the screen.
    if (rest) el.style.setProperty('--hidden', `${offset}px`)
  }

  useLayoutEffect(() => {
    if (height > 0 && !drag.current) place(offsets(height)[stop], true)
  }, [stop, height])

  // A selection raises the sheet to half, so its details show. A walkthrough lowers it, so the map shows.
  useEffect(() => {
    if (selected && !playing && ui.store.getState().sheet === 0) ui.setSheet(1)
  }, [selected, playing, ui])
  useEffect(() => {
    if (playing) ui.setSheet(0)
  }, [playing, ui])

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || height === 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    // A drag with a pointer leaves no focus ring. The keyboard brings it back.
    event.currentTarget.dataset.pointer = ''
    drag.current = { y: event.clientY, start: offsets(height)[stop], samples: [{ y: event.clientY, t: event.timeStamp }] }
  }
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    d.samples.push({ y: event.clientY, t: event.timeStamp })
    if (d.samples.length > 6) d.samples.shift()
    place(rubber(d.start + event.clientY - d.y, offsets(height)[0]), false, false)
  }
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current
    drag.current = undefined
    if (!d) return
    const moved = event.clientY - d.y
    const all = offsets(height)
    if (Math.abs(moved) < TAP) {
      const next: Stop = stop === 0 ? 1 : 0
      ui.setSheet(next)
      place(all[next], true)
      return
    }
    // Only the last 100 ms count, so a finger that stopped before it lifted does not fling.
    const recent = d.samples.filter((x) => event.timeStamp - x.t <= 100)
    const first = recent[0]
    const velocity = first && event.timeStamp > first.t ? (event.clientY - first.y) / (event.timeStamp - first.t) : 0
    const at = d.start + moved
    const stops = ([0, 1, 2] as const).map((s) => ({ s, y: all[s] }))
    let next: Stop
    if (Math.abs(velocity) > FLICK) {
      // A flick goes to the next stop in its direction from where the sheet is now.
      const ahead = stops.filter((x) => (velocity > 0 ? x.y > at : x.y < at)).sort((a, b) => Math.abs(a.y - at) - Math.abs(b.y - at))
      next = ahead[0]?.s ?? (velocity > 0 ? 0 : 2)
    } else {
      next = stops.reduce((best, x) => (Math.abs(x.y - at) < Math.abs(best.y - at) ? x : best)).s
    }
    ui.setSheet(next)
    place(all[next], true)
  }

  const header = (
    <button
      type="button"
      className={styles.header}
      aria-expanded={stop > 0}
      aria-label={`${title}. ${stop === 0 ? 'Show details' : 'Lower the sheet'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(event) => delete event.currentTarget.dataset.pointer}
      onBlur={(event) => delete event.currentTarget.dataset.pointer}
      onClick={(event) => {
        // A pointer press is handled on release. Enter and Space arrive as a click with no pointer.
        if (event.detail !== 0) return
        ui.setSheet(stop === 0 ? 1 : 0)
      }}
    >
      <span className={styles.handle} aria-hidden="true" />
      <span className={styles.title}>{title}</span>
    </button>
  )

  return (
    <section ref={sheet} className={styles.sheet} aria-label="Sidebar" data-testid="inspector" data-stop={stop}>
      {body(header)}
    </section>
  )
}
