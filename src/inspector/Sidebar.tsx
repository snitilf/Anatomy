import { Tabs } from '@base-ui/react/tabs'
import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import type { Selection } from '../app/state'
import { useAppDispatch, useAppStore, useAppStoreApi } from '../app/store'
import { SIDEBAR, useUi, useUiApi } from '../app/ui'
import { usePhone } from '../app/usePhone'
import { findItem } from '../layer/edits'
import { hasChanges, reviewCounts } from '../notes/review'
import { ConnectionView } from './ConnectionView'
import { Overview } from './Overview'
import { PanelContext } from './panelContext'
import { PartView } from './PartView'
import { Review } from './Review'
import { Sheet } from './Sheet'
import styles from './Sidebar.module.css'
import { LinkView, MarkView, ProposalView } from './YoursViews'

const selectionKey = (s: Selection | undefined) => (s && s.type !== 'board' ? `${s.type}:${s.id}` : 'board')

/** The view for the selection: the overview, a part, a connection, or something the user made. */
function Details() {
  const { board, selection, layer } = useAppStore(useShallow((s) => ({ board: s.board, selection: s.selection, layer: s.layer })))
  if (!board) return null
  const s = selection
  if (s?.type === 'component') {
    const c = board.components.find((x) => x.id === s.id)
    if (c) return <PartView board={board} component={c} />
  } else if (s?.type === 'relationship') {
    const r = board.relationships.find((x) => x.id === s.id)
    if (r) return <ConnectionView board={board} relationship={r} />
  } else if (s && layer && (s.type === 'link' || s.type === 'mark' || s.type === 'proposal')) {
    const found = findItem(layer, s.id)
    if (found?.type === 'link') return <LinkView key={s.id} board={board} link={found.item} />
    if (found?.type === 'mark') return <MarkView key={s.id} board={board} mark={found.item} />
    if (found?.type === 'proposal') return <ProposalView key={s.id} board={board} proposal={found.item} />
  }
  return <Overview board={board} />
}

/** The Details and Review tabs, and what they hold. The tab row shows only while Review has entries. */
function Body({ header }: { header?: ReactNode }) {
  const dispatch = useAppDispatch()
  const store = useAppStoreApi()
  const ui = useUiApi()
  const tab = useUi((u) => u.tab)
  const { board, layer, changes, selection } = useAppStore(useShallow((s) => ({ board: s.board, layer: s.layer, changes: s.changes, selection: s.selection })))
  const counts = useMemo(() => reviewCounts(board, layer, changes), [board, layer, changes])
  const reviewing = counts.total > 0 && tab === 'review'
  const scroll = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusNext = useRef(false)
  const fromReview = useRef(false)
  const key = selectionKey(selection)

  // A choice made inside the panel replaces its content, so focus moves to the new heading.
  // A choice made in Review selects on the map and stays in Review.
  const choose = useCallback(
    (next: Selection) => {
      if (store.getState().board === undefined) return
      if (ui.store.getState().tab === 'review') fromReview.current = true
      else focusNext.current = true
      dispatch({ type: 'select', selection: next })
    },
    [dispatch, store, ui],
  )

  // A selection made anywhere else, such as on the map, shows its details.
  const lastKey = useRef(key)
  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    if (fromReview.current) fromReview.current = false
    else ui.setTab('details')
  }, [key, ui])

  // A new selection or a new board starts at the top of the panel.
  useEffect(() => {
    if (!reviewing) scroll.current?.scrollTo?.({ top: 0 })
  }, [key, board?.id, reviewing])

  useEffect(() => {
    if (!focusNext.current) return
    focusNext.current = false
    headingRef.current?.focus()
  }, [key])

  // A new revision does not switch tabs. A toast says it is open and offers the review.
  const revision = useRef(board ? `${board.id}:${board.revision}` : '')
  useEffect(() => {
    const now = board ? `${board.id}:${board.revision}` : ''
    if (revision.current === now) return
    const sameBoard = revision.current.split(':')[0] === board?.id
    revision.current = now
    if (board && sameBoard && hasChanges(changes)) {
      toast(`Revision ${board.revision} is open`, {
        action: {
          label: 'Review',
          onClick: () => {
            ui.setSidebarOpen(true)
            ui.setTab('review')
          },
        },
      })
    }
  }, [board, changes, ui])

  const panel = useMemo(() => ({ choose, headingRef }), [choose])
  const content = reviewing ? <Review /> : <Details />
  return (
    <PanelContext.Provider value={panel}>
      {header}
      {counts.total > 0 && (
        <Tabs.Root value={reviewing ? 'review' : 'details'} onValueChange={(value) => ui.setTab(value as 'details' | 'review')}>
          <Tabs.List className={styles.tabs} aria-label="Sidebar">
            <Tabs.Tab className={styles.tab} value="details">
              Details
            </Tabs.Tab>
            <Tabs.Tab className={styles.tab} value="review">
              Review
              {counts.decisions > 0 && <span className={styles.tabCount}>{counts.decisions}</span>}
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      )}
      <div ref={scroll} className={styles.scroll} data-scroll="">
        <div key={reviewing ? 'review' : key} className={styles.content}>
          {content}
        </div>
      </div>
    </PanelContext.Provider>
  )
}

/** The left edge of the sidebar: drag to resize, double-click to reset, or use the arrow keys. */
function ResizeHandle() {
  const ui = useUiApi()
  const width = useUi((u) => u.sidebar.width)
  const drag = useRef<{ x: number; width: number; main: HTMLElement | null; last: number } | undefined>(undefined)

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, width, main: event.currentTarget.closest('main'), last: width }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const next = Math.round(Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, d.width - (event.clientX - d.x))))
    d.last = next
    // Written straight to the layout while the pointer moves. The store, and storage, take it on release.
    d.main?.style.setProperty('--sidebar-width', `${next}px`)
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = undefined
    if (d) ui.setSidebarWidth(d.last)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 64 : 16
    if (event.key === 'ArrowLeft') ui.setSidebarWidth(width + step)
    else if (event.key === 'ArrowRight') ui.setSidebarWidth(width - step)
    else if (event.key === 'Home') ui.setSidebarWidth(SIDEBAR.max)
    else if (event.key === 'End') ui.setSidebarWidth(SIDEBAR.min)
    else return
    event.preventDefault()
  }
  return (
    <div
      className={styles.resize}
      role="separator"
      aria-orientation="vertical"
      aria-label="Sidebar width"
      aria-valuemin={SIDEBAR.min}
      aria-valuemax={SIDEBAR.max}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => ui.setSidebarWidth(SIDEBAR.width)}
      onKeyDown={onKeyDown}
    />
  )
}

/** The right sidebar on a wide screen, and a bottom sheet on a phone. */
export function Sidebar() {
  const open = useUi((u) => u.sidebar.open)
  const phone = usePhone()
  if (phone) return <Sheet body={(header) => <Body header={header} />} />
  if (!open) return null
  return (
    <aside className={styles.panel} aria-label="Sidebar" data-testid="inspector">
      <ResizeHandle />
      <Body />
    </aside>
  )
}
