import { Fragment, useRef, type KeyboardEvent } from 'react'
import { Tip } from '../app/Tip'
import { useUi } from '../app/ui'
import { useCommand } from '../commands/context'
import type { Tool } from './tools'
import styles from './Toolbar.module.css'

/** The tools in groups, split by thin dividers: moving around, drawing, writing, and proposing. */
const GROUPS: readonly (readonly Tool[])[] = [['select', 'hand'], ['pen', 'rect', 'ellipse', 'arrow'], ['text', 'sticky'], ['part']]

function ToolButton({ tool, active }: { tool: Tool; active: boolean }) {
  const view = useCommand(`tool.${tool}`)
  const Icon = view.command.icon
  return (
    <Tip label={view.label} keys={view.shortcut} side="top">
      <button
        type="button"
        className={styles.button}
        data-tool={tool}
        aria-pressed={active}
        aria-label={view.label}
        tabIndex={active ? 0 : -1}
        onClick={view.run}
      >
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </Tip>
  )
}

/**
 * The whiteboard tool bar at the bottom of the map. Arrow keys move between the tools; each tool's key works anywhere.
 * Holding Space shows Hand while it pans.
 */
export function Toolbar() {
  const tool = useUi((u) => u.tool)
  const spaceHand = useUi((u) => u.spaceHand)
  const active = spaceHand ? 'hand' : tool
  const bar = useRef<HTMLDivElement>(null)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0 && event.key !== 'Home' && event.key !== 'End') return
    const buttons = [...(bar.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + step + buttons.length) % buttons.length
    event.preventDefault()
    event.stopPropagation()
    buttons[next]?.focus()
  }

  return (
    <div ref={bar} className={styles.bar} role="toolbar" aria-label="Whiteboard tools" onKeyDown={onKeyDown}>
      {GROUPS.map((group, i) => (
        <Fragment key={group[0]}>
          {i > 0 && <span className={styles.divider} aria-hidden="true" />}
          {group.map((t) => (
            <ToolButton key={t} tool={t} active={active === t} />
          ))}
        </Fragment>
      ))}
    </div>
  )
}
