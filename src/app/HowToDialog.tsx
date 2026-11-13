import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AppToaster } from './AppToaster'
import guideText from '../../docs/authoring-guide.md?raw'
import schemaText from '../../schema/board.v1.schema.json?raw'
import buttons from './buttons.module.css'
import styles from './HowToDialog.module.css'

const DIALOG_TOASTER = 'how-to'

export const AGENT_PROMPT = `Write an Anatomy board file that explains: [describe the plan, feature, or project here]

Follow the attached guide (authoring-guide.md) and JSON Schema (board.v1.schema.json).
Read only this material: [list the files or notes you allow].

Rules:
- Use 6 to 12 parts. Group them as Frontend, Backend, Infrastructure, or similar, one level only.
- Give every part and connection an honest source: user-stated for what I told you, agent-explanation for what you understood, agent-proposal for what you suggest, documented-intent only with a cited document.
- Never claim that you checked code or saw it running. Cited paths are shown as "cited, not checked".
- If a consequential detail is unknown, ask me first. Record what stays unknown as "unknown" or "question" items.
- Add 1 to 4 walkthroughs. Highlights name parts and connections only.
- Every ID is unique across the whole board, and every reference must point at something that exists.
- Return only the JSON.`

export function HowToDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [failed, setFailed] = useState(false)
  const prompt = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) {
      if (typeof el.showModal === 'function') el.showModal()
      else el.setAttribute('open', '')
    } else if (!open && el.open) {
      if (typeof el.close === 'function') el.close()
      else el.removeAttribute('open')
    }
  }, [open])

  async function copy() {
    let ok = false
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT)
      ok = true
    } catch {
      // Clipboard access can be blocked. Fall back to selecting the text and copying it.
      const area = prompt.current
      if (area) {
        area.focus()
        area.select()
        try {
          ok = document.execCommand('copy')
        } catch {
          ok = false
        }
      }
    }
    setFailed(!ok)
    // A modal dialog sits above the page, so this toast has its own toaster inside it.
    if (ok) toast('Copied', { toasterId: DIALOG_TOASTER })
  }

  function download(text: string, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="howto-title"
      onClose={() => {
        setFailed(false)
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose()
      }}
    >
      <div className={styles.body}>
        <div className={styles.head}>
          <h2 id="howto-title" className={styles.title}>
            How to make a board
          </h2>
          <button type="button" className={clsx(buttons.button, buttons.quiet)} onClick={onClose}>
            Close
          </button>
        </div>

        <ol className={styles.steps}>
          <li>
            <strong>Give your agent the guide and the schema.</strong> They describe the file Anatomy opens.
          </li>
          <li>
            <strong>Paste the prompt below,</strong> and say what you want explained.
          </li>
          <li>
            <strong>Save the JSON it writes,</strong> then open that file here.
          </li>
        </ol>

        <div className={styles.row}>
          <button type="button" className={buttons.button} onClick={() => download(guideText, 'authoring-guide.md', 'text/markdown')}>
            Download the guide
          </button>
          <button
            type="button"
            className={buttons.button}
            onClick={() => download(schemaText, 'board.v1.schema.json', 'application/json')}
          >
            Download JSON Schema
          </button>
        </div>

        <label className={styles.label} htmlFor="agent-prompt">
          Prompt for your agent
        </label>
        <textarea id="agent-prompt" ref={prompt} className={styles.prompt} readOnly rows={15} value={AGENT_PROMPT} />
        <div className={styles.row}>
          <button type="button" className={clsx(buttons.button, buttons.primary)} onClick={copy}>
            Copy prompt
          </button>
          <span role="status" className={styles.status}>
            {failed && 'Could not copy. Select the text and copy it yourself.'}
          </span>
        </div>
      </div>
      <AppToaster id={DIALOG_TOASTER} />
    </dialog>
  )
}
