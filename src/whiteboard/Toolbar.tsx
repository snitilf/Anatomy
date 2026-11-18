import { Menu } from '@base-ui/react/menu'
import { Check, ChevronDown } from 'lucide-react'
import { Fragment, useRef, useState, type KeyboardEvent } from 'react'
import menu from '../app/menu.module.css'
import { Tip } from '../app/Tip'
import { useUi } from '../app/ui'
import { useCommand } from '../commands/context'
import type { Tool } from './tools'
import styles from './Toolbar.module.css'

/** The shapes one Shape button stands for. Each keeps its own tool and key. */
const SHAPES = ['rect', 'ellipse', 'arrow'] as const
type Shape = (typeof SHAPES)[number]
const isShape = (tool: Tool): tool is Shape => (SHAPES as readonly Tool[]).includes(tool)

/** The tools in groups, split by thin dividers: moving around, drawing, writing, and proposing. 'shape' is the Shape button. */
const GROUPS: readonly (readonly (Tool | 'shape')[])[] = [['select', 'hand'], ['pen', 'shape'], ['text', 'sticky'], ['part']]

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

function ShapeItem({ shape, current }: { shape: Shape; current: boolean }) {
  const view = useCommand(`tool.${shape}`)
  const Icon = view.command.icon
  return (
    <Menu.Item className={menu.item} onClick={view.run}>
      <Icon className={menu.icon} size={16} strokeWidth={1.5} aria-hidden="true" />
      <span className={menu.itemText}>{view.label}</span>
      <kbd className={styles.menuKey}>{view.shortcut}</kbd>
      <span className={menu.check} style={{ visibility: current ? 'visible' : 'hidden' }}>
        <Check size={16} strokeWidth={1.5} aria-hidden="true" />
      </span>
    </Menu.Item>
  )
}

/** One button for rectangle, ellipse, and arrow. It shows the last shape used; the chevron beside it picks another. */
function ShapeTool({ tool, active }: { tool: Tool; active: boolean }) {
  const [last, setLast] = useState<Shape>('rect')
  // The shape in use is the one remembered.
  if (isShape(tool) && tool !== last) setLast(tool)
  return (
    <div className={styles.split} data-active={active ? '' : undefined}>
      <ToolButton tool={last} active={active} />
      <Menu.Root>
        <Tip label="More shapes" side="top">
          <Menu.Trigger className={styles.more} aria-label="More shapes" tabIndex={-1}>
            <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" />
          </Menu.Trigger>
        </Tip>
        <Menu.Portal>
          <Menu.Positioner className={menu.positioner} side="top" align="center" sideOffset={8} collisionPadding={8}>
            <Menu.Popup className={menu.popup} data-dismissible>
              {SHAPES.map((shape) => (
                <ShapeItem key={shape} shape={shape} current={shape === last} />
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
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
    // Keys inside the shape menu bubble here through the portal. They are the menu's.
    if (!bar.current?.contains(event.target as Node)) return
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
          {group.map((t) => (t === 'shape' ? <ShapeTool key={t} tool={active} active={isShape(active)} /> : <ToolButton key={t} tool={t} active={active === t} />))}
        </Fragment>
      ))}
    </div>
  )
}
