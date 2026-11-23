import { Popover } from '@base-ui/react/popover'
import clsx from 'clsx'
import { Copy } from 'lucide-react'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CameraSlotContext } from '../canvas/cameraContext'
import { useCommand } from '../commands/context'
import { ariaShortcut } from '../commands/keys'
import { buildFeedback, serializeFeedback, unsentCount, type FeedbackDraft } from '../feedback/build'
import { summarize } from '../feedback/summary'
import { StatusGlyph } from '../status/StatusGlyph'
import { newId } from '../layer/edits'
import { writeAgentFiles } from './agentFiles'
import { downloadedPrompt, SEND_PROMPT } from './agentPrompts'
import buttons from './buttons.module.css'
import { copyText } from './clipboard'
import { downloadText } from './download'
import styles from './SendMenu.module.css'
import { useAppDispatch, useAppStore, useAppStoreApi } from './store'
import { Tip } from './Tip'
import { useUi, useUiApi } from './ui'
import { useWorkspace } from './workspaceContext'

const WHEN = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** What the popover shows after the user pressed Send. */
type Outcome =
  | { kind: 'sent'; count: number; prompt: string; copied: boolean; downloaded: boolean }
  | { kind: 'failed'; draft: FeedbackDraft; prompt: string }

/** The prompt box: read-only, so the user can still select it by hand when the copy fails, with a Copy button. */
function PromptBox({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState<boolean | undefined>()
  return (
    <div className={styles.promptBox}>
      <p className={styles.prompt} aria-label="Prompt">
        {prompt}
      </p>
      <Tip label={copied === false ? 'Could not copy' : copied ? 'Copied' : 'Copy prompt'}>
        <button
          type="button"
          className={clsx(buttons.button, buttons.quiet, buttons.icon, styles.copy)}
          aria-label="Copy prompt"
          onClick={() => void copyText(prompt).then(setCopied)}
        >
          <Copy size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </Tip>
    </div>
  )
}

/**
 * Send to agent: the top bar's primary action. The first press shows what will go, because a drawing that says nothing
 * can only be fixed before the send. Send copies the prompt first, while the press still allows it, then writes
 * `.anatomy/feedback.json` (or downloads feedback.json for a board opened as a file), then records the send.
 */
export function SendMenu({ className }: { className?: string | undefined }) {
  const view = useCommand('send')
  const open = useUi((u) => u.sendOpen)
  const uiApi = useUiApi()
  const store = useAppStoreApi()
  const dispatch = useAppDispatch()
  const camera = useContext(CameraSlotContext)
  // Only the user's items, so moving a card does not draw the top bar again. Positions are read when the draft is made.
  const items = useAppStore(
    useShallow((s) => ({
      board: s.board,
      notes: s.layer?.notes,
      links: s.layer?.links,
      marks: s.layer?.marks,
      proposals: s.layer?.proposals,
      reconnects: s.layer?.reconnects,
      archive: s.layer?.archive,
      answers: s.layer?.answers,
      sent: s.layer?.sent,
    })),
  )
  const board = items.board
  const { origin, folder, writeFolderFile } = useWorkspace()
  const [outcome, setOutcome] = useState<Outcome | undefined>()
  const [busy, setBusy] = useState(false)
  const suppressReturnFocus = useRef(false)
  const sendRef = useRef<HTMLButtonElement>(null)
  const sentRef = useRef<HTMLParagraphElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const inFolder = origin === 'folder' && folder?.state === 'open'
  const prompt = inFolder ? SEND_PROMPT : downloadedPrompt(board?.title ?? '')
  // What a send would hold now. The ID is a stand-in: the real one is made when the user sends.
  // Opening reads the map again, so the summary matches the lines on screen.
  const draft = useMemo(() => {
    const { board: b, layer: l } = store.getState()
    return b && l ? buildFeedback(b, l, { id: 'feedback-preview', now: new Date(0), scene: camera.get()?.scene() }) : undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, camera, store, open])
  const layer = store.getState().layer
  const count = draft ? unsentCount(draft) : 0

  // After a send, focus moves to the result, so the Send button leaving does not drop focus to the page.
  useEffect(() => {
    if (outcome?.kind === 'sent') sentRef.current?.focus()
  }, [outcome])

  if (!board || !layer || !view.visible) return null

  function consumeReturnFocus() {
    const suppressed = suppressReturnFocus.current
    suppressReturnFocus.current = false
    return suppressed
  }

  function setOpen(next: boolean) {
    if (next) setOutcome(undefined)
    else suppressReturnFocus.current = true
    uiApi.setSendOpen(next)
  }

  async function deliver(ready: FeedbackDraft, text: string, copying: Promise<boolean>, download: boolean) {
    const json = serializeFeedback(ready.feedback)
    if (download) {
      try {
        downloadText('feedback.json', json)
      } catch {
        setOutcome({ kind: 'failed', draft: ready, prompt: text })
        return
      }
    } else {
      await writeAgentFiles(writeFolderFile)
      if (!(await writeFolderFile('feedback.json', json))) {
        setOutcome({ kind: 'failed', draft: ready, prompt: text })
        return
      }
    }
    dispatch({ type: 'feedbackSent', sent: ready.sent })
    setOutcome({ kind: 'sent', count: ready.feedback.items.length + ready.feedback.withdrawn.length, prompt: text, copied: await copying, downloaded: download })
  }

  function send(download = !inFolder) {
    const { board: b, layer: l } = store.getState()
    if (!b || !l || busy) return
    // The copy starts inside the press, where the browser still allows it.
    const copying = copyText(prompt)
    const ready = buildFeedback(b, l, { id: newId('feedback'), now: new Date(), scene: camera.get()?.scene() })
    setBusy(true)
    void deliver(ready, prompt, copying, download).finally(() => setBusy(false))
  }

  function retry(download: boolean) {
    if (outcome?.kind !== 'failed' || busy) return
    const copying = copyText(outcome.prompt)
    setBusy(true)
    void deliver(outcome.draft, outcome.prompt, copying, download).finally(() => setBusy(false))
  }

  const rows = draft ? summarize(draft.feedback) : []
  const skipped = draft?.skipped ?? []
  const again = draft?.again.length ?? 0
  const lastSent = layer.sent?.at
  const firstSkipped = skipped.map((s) => s.id).find((id) => layer.marks.some((m) => m.id === id))

  const skippedLine = skipped.length > 0 && (
    <div className={styles.skipped}>
      <p className={styles.line}>
        {skipped.length === 1 ? '1 drawing left out. It has no note and touches nothing.' : `${skipped.length} drawings left out. They have no note and touch nothing.`}
      </p>
      {firstSkipped && (
        <button
          type="button"
          className={clsx(buttons.button, buttons.small)}
          onClick={() => {
            setOpen(false)
            dispatch({ type: 'select', selection: { type: 'mark', id: firstSkipped } })
          }}
        >
          Show
        </button>
      )}
    </div>
  )

  let body
  if (outcome?.kind === 'sent') {
    body = (
      <>
        <p ref={sentRef} className={styles.sentHead} role="status" tabIndex={-1}>
          <StatusGlyph state="sent" size={16} withWord />
          {outcome.count === 1 ? 'Sent 1 item' : `Sent ${outcome.count} items`}
        </p>
        {outcome.downloaded ? <p className={styles.line}>Downloaded feedback.json.</p> : <p className={styles.path}>.anatomy/feedback.json</p>}
        <PromptBox prompt={outcome.prompt} />
        <p className={styles.line}>{outcome.copied ? 'Prompt copied. Paste it to your agent.' : 'Could not copy. Select the prompt and copy it.'}</p>
      </>
    )
  } else if (outcome?.kind === 'failed') {
    body = (
      <>
        <p className={styles.error} role="alert">
          {inFolder ? 'Could not write .anatomy/feedback.json.' : 'Could not download feedback.json.'}
        </p>
        <div className={styles.actions}>
          <button type="button" className={clsx(buttons.button, buttons.small)} disabled={busy} onClick={() => retry(!inFolder)}>
            Try again
          </button>
          {inFolder && (
            <button type="button" className={clsx(buttons.button, buttons.quiet, buttons.small)} disabled={busy} onClick={() => retry(true)}>
              Download instead
            </button>
          )}
        </div>
      </>
    )
  } else if (count === 0) {
    body = (
      <>
        <p className={styles.nothing}>Nothing new to send.</p>
        {lastSent && <p className={styles.line}>Last sent {WHEN.format(new Date(lastSent))}.</p>}
        {lastSent && <PromptBox prompt={prompt} />}
        {again > 0 && (
          <div className={styles.foot}>
            <p className={styles.sentLine}>
              <StatusGlyph state="sent" />
              {again === 1 ? '1 item has no answer yet.' : `${again} items have no answer yet.`}
            </p>
            <button type="button" className={clsx(buttons.button, buttons.small)} disabled={busy} onClick={() => send()}>
              {inFolder ? 'Send again' : 'Download again'}
            </button>
          </div>
        )}
        {skippedLine}
      </>
    )
  } else {
    body = (
      <>
        <ul className={styles.rows} aria-label="What goes">
          {rows.map((r) => (
            <li key={r.label} className={styles.row}>
              <span>{r.label}</span>
              <span className={styles.count}>{r.count}</span>
            </li>
          ))}
        </ul>
        {again > 0 && (
          <p className={styles.sentLine}>
            <StatusGlyph state="sent" />
            {again === 1 ? 'Includes 1 item sent before that has no answer yet.' : `Includes ${again} items sent before that have no answer yet.`}
          </p>
        )}
        {skippedLine}
        <div className={styles.foot}>
          <p className={styles.line}>{inFolder ? 'Writes .anatomy/feedback.json and copies a prompt.' : 'Downloads feedback.json.'}</p>
          <button ref={sendRef} type="button" className={clsx(buttons.button, buttons.primary)} disabled={busy} onClick={() => send()}>
            {inFolder ? 'Send' : 'Download and copy'}
          </button>
        </div>
      </>
    )
  }

  const label = count > 0 ? `${view.label}, ${count} new` : view.label
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tip label={view.label} keys={view.shortcut} holdWhile={open} consumeReturnFocus={consumeReturnFocus}>
        <Popover.Trigger
          render={
            <button
              type="button"
              className={clsx(buttons.button, count > 0 && buttons.primary, styles.trigger, className)}
              aria-label={label}
              data-new={count > 0 ? '' : undefined}
              aria-keyshortcuts={ariaShortcut('Mod+Enter')}
            >
              <span className={styles.long}>{view.label}</span>
              <span className={styles.short}>Send</span>
              {count > 0 && <span className={styles.badge}>{count}</span>}
            </button>
          }
        />
      </Tip>
      <Popover.Portal>
        <Popover.Positioner className={styles.positioner} side="bottom" align="end" sideOffset={6} collisionPadding={8}>
          <Popover.Popup className={styles.panel} aria-label="Send to agent" initialFocus={() => sendRef.current ?? headingRef.current ?? true}>
            {outcome?.kind !== 'sent' && (
              <h2 ref={headingRef} className={styles.heading} tabIndex={-1}>
                Send to agent
              </h2>
            )}
            {body}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
