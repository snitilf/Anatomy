import { useEffect, useRef, useState } from 'react'
import schemaText from '../../schema/board.v1.schema.json?raw'
import buttons from './buttons.module.css'
import styles from './HowToDialog.module.css'

export const AGENT_PROMPT = `Write an Anatomy board file: one JSON file that follows the attached JSON Schema (board.v1.schema.json).

Explain: [describe the plan, feature, or project here]

Rules:
- Split it into parts and connections that a student could follow. Use 15 parts or fewer.
- Give every part and connection a source. Use agent-explanation for what you understand, agent-proposal for what you suggest, documented-intent only when a written document says it (cite its path in references), and user-stated for what I told you.
- Do not claim that anything was checked against code or seen running.
- List what you assumed, what you do not know, and open questions as items.
- Return only the JSON.`

export function HowToDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const prompt = useRef<HTMLTextAreaElement>(null)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')

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
    setCopied(ok ? 'copied' : 'failed')
    window.setTimeout(() => setCopied('idle'), 2000)
  }

  function download() {
    const url = URL.createObjectURL(new Blob([schemaText], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'board.v1.schema.json'
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
        setCopied('idle')
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
          <button type="button" className={`${buttons.button} ${buttons.quiet}`} onClick={onClose}>
            Close
          </button>
        </div>

        <ol className={styles.steps}>
          <li>
            <strong>Give your agent the schema.</strong> It describes the file Anatomy opens.
          </li>
          <li>
            <strong>Paste the prompt below,</strong> and say what you want explained.
          </li>
          <li>
            <strong>Save the JSON it writes,</strong> then open that file here.
          </li>
        </ol>

        <div className={styles.row}>
          <button type="button" className={buttons.button} onClick={download}>
            Download JSON Schema
          </button>
        </div>

        <label className={styles.label} htmlFor="agent-prompt">
          Prompt for your agent
        </label>
        <textarea id="agent-prompt" ref={prompt} className={styles.prompt} readOnly rows={15} value={AGENT_PROMPT} />
        <div className={styles.row}>
          <button type="button" className={`${buttons.button} ${buttons.primary}`} onClick={copy}>
            Copy prompt
          </button>
          <span role="status" className={styles.status}>
            {copied === 'copied' && 'Copied.'}
            {copied === 'failed' && 'Could not copy. Select the text and copy it yourself.'}
          </span>
        </div>
      </div>
    </dialog>
  )
}
