import { Tabs } from '@base-ui/react/tabs'
import { ChevronLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import type { Selection } from '../app/state'
import { useAppDispatch, useAppStore, useAppStoreApi } from '../app/store'
import { SIDEBAR, useUi, useUiApi } from '../app/ui'
import { usePhone } from '../app/usePhone'
import { showView } from '../app/viewActions'
import { findItem } from '../layer/edits'
import type { Layer, Target } from '../layer/model'
import type { Board } from '../board/schema'
import { hasChanges, reviewCounts } from '../notes/review'
import { BundleView } from './BundleView'
import { ConnectionView } from './ConnectionView'
import { Overview } from './Overview'
import { PanelContext } from './panelContext'
import { PartView } from './PartView'
import { Composer } from './notes'
import { Review, ReviewFooter } from './Review'
import { Sheet } from './Sheet'
import { useSpotlightReset } from './spotlight'
import styles from './Sidebar.module.css'
import { LinkView, MarkView, ProposalView } from './YoursViews'

/** One toast at a time says a revision is open, and the Overview can dismiss it by this name. */
const REVISION_TOAST = 'revision-open'

const selectionKey = (s: Selection | undefined) => (s && s.type !== 'board' ? `${s.type}:${s.id}` : 'board')

/** What a note written in the panel is about: the part or connection shown, or the board. A user's own item has its own note field. */
function composerTarget(board: Board | undefined, layer: Layer | undefined, s: Selection | undefined): Target | undefined {
  if (!board) return undefined
  // A bundle is many connections, so a note has no one to be about.
  if (s?.type === 'bundle') return undefined
  if (s?.type === 'component' && board.components.some((c) => c.id === s.id)) return { type: 'component', id: s.id }
  if (s?.type === 'relationship' && board.relationships.some((r) => r.id === s.id)) return { type: 'relationship', id: s.id }
  if (s && layer && (s.type === 'link' || s.type === 'mark' || s.type === 'proposal') && findItem(layer, s.id)) return undefined
  return { type: 'board' }
}

const KIND_WORD = { board: 'Board', component: 'Part', relationship: 'Connection', link: 'Link', mark: 'Mark', proposal: 'New part', bundle: 'Bundle' } as const

/** The view for the selection: the overview, a part, a connection, or something the user made. */
function Details() {
  const { board, selection, layer } = useAppStore(useShallow((s) => ({ board: s.board, selection: s.selection, layer: s.layer })))
  if (!board) return null
  const s = selection
  if (s?.type === 'component') {
    const c = board.components.find((x) => x.id === s.id)
    if (c) return <PartView board={board} component={c} />
  } else if (s?.type === 'bundle') {
    return <BundleView key={s.id} board={board} a={s.a} b={s.b} />
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
  const phone = usePhone()
  // A row that goes away takes its spotlight with it.
  useSpotlightReset(key, tab, layer, board)

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

  // A new revision does not switch tabs. A toast says it is open and offers the review.
  // The Overview says the same in Needs you, so the toast stays away from it and goes when it opens.
  const view = useUi((u) => u.view)
  useEffect(() => {
    if (view === 'overview') toast.dismiss(REVISION_TOAST)
  }, [view])
  const revision = useRef(board ? `${board.id}:${board.revision}` : '')
  useEffect(() => {
    const now = board ? `${board.id}:${board.revision}` : ''
    if (revision.current === now) return
    const sameBoard = revision.current.split(':')[0] === board?.id
    revision.current = now
    // Answers count too: a revision can answer the user without changing a part.
    if (board && sameBoard && ui.store.getState().view === 'map' && (hasChanges(changes) || (board.responses?.items.length ?? 0) > 0)) {
      toast(`Revision ${board.revision} is open`, {
        id: REVISION_TOAST,
        action: {
          label: 'Review',
          onClick: () => {
            showView(ui, board.id, 'map')
            ui.setSidebarOpen(true)
            ui.setTab('review')
          },
        },
      })
    }
  }, [board, changes, ui])

  // A change of view made from inside the panel is also said aloud, because the heading it focuses is not a control.
  const [announced, setAnnounced] = useState('')
  useEffect(() => {
    if (!focusNext.current) return
    focusNext.current = false
    headingRef.current?.focus()
    const text = headingRef.current?.textContent
    setAnnounced(text ? `${KIND_WORD[selection?.type ?? 'board']}, ${text}` : '')
  }, [key, selection?.type])

  const panel = useMemo(() => ({ choose, headingRef }), [choose])
  const content = reviewing ? <Review /> : <Details />
  const target = composerTarget(board, layer, selection)
  const canBack = !reviewing && selection !== undefined && selection.type !== 'board'
  return (
    <PanelContext.Provider value={panel}>
      {header}
      <Tabs.Root className={styles.top} value={reviewing ? 'review' : 'details'} onValueChange={(value) => ui.setTab(value as 'details' | 'review')}>
        {phone && (
          <div className={styles.where}>
            {canBack ? (
              <button type="button" className={styles.back} onClick={() => choose({ type: 'board' })}>
                <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
                Board
              </button>
            ) : (
              <span className={styles.here}>{reviewing ? 'Review' : 'Board'}</span>
            )}
          </div>
        )}
        <Tabs.List className={styles.switch} aria-label="Sidebar">
          <Tabs.Tab className={styles.tab} value="details">
            Details
          </Tabs.Tab>
          <Tabs.Tab className={styles.tab} value="review" disabled={counts.total === 0}>
            Review
            {counts.decisions > 0 && (
              <span className={styles.tabCount} title={`${counts.decisions} need a decision`}>
                {counts.decisions}
              </span>
            )}
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.Root>
      <div ref={scroll} className={styles.scroll} data-scroll="">
        <div key={reviewing ? 'review' : key} className={styles.content}>
          {content}
        </div>
      </div>
      {reviewing ? <ReviewFooter /> : target && <Composer key={`${target.type}:${'id' in target ? target.id : ''}`} target={target} />}
      <div className="sr-only" aria-live="polite">
        {announced}
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
  // The Overview page covers the map, so the sidebar stays mounted but out of reach.
  const behind = useUi((u) => u.view === 'overview')
  if (phone) return <Sheet body={(header) => <Body header={header} />} inert={behind} />
  if (!open) return null
  return (
    <aside className={styles.panel} aria-label="Sidebar" data-testid="inspector" inert={behind}>
      <ResizeHandle />
      <Body />
    </aside>
  )
}
