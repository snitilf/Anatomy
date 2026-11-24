import clsx from 'clsx'
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import styles from './Segmented.module.css'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  /** A figure after the label, such as how many entries a tab holds. */
  count?: number
  disabled?: boolean
  /** The ID of the panel a tab controls. Only for tabs. */
  controls?: string
}

interface SegmentedProps<T extends string> {
  /** `tabs` switches between views of the same thing. `choice` picks one value for a field. */
  kind: 'tabs' | 'choice'
  /** The name of the group, for a screen reader. */
  label: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  /** `md` is 28 high and the default. `sm` is 24 high, for a control that sits beside a field. */
  size?: 'md' | 'sm'
  className?: string | undefined
}

/**
 * One segmented control for the app: a track with a raised thumb under the selected segment.
 * It is a tablist or a radiogroup, with one stop in the tab order. The arrow keys move focus and the selection together,
 * skip a disabled segment, and wrap; Home and End jump to the ends.
 */
export function Segmented<T extends string>({ kind, label, value, options, onChange, size = 'md', className }: SegmentedProps<T>) {
  const segments = useRef<(HTMLButtonElement | null)[]>([])
  const tabs = kind === 'tabs'
  const enabled = options.flatMap((option, index) => (option.disabled ? [] : [index]))
  // The selected segment is the one stop in the tab order. If it is off, the first one that is on takes its place.
  const selected = options.findIndex((option) => option.value === value)
  const stop = selected >= 0 && !options[selected]?.disabled ? selected : enabled[0]

  function move(event: KeyboardEvent<HTMLButtonElement>, from: number) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || enabled.length === 0) return
    const at = enabled.indexOf(from)
    let to: number | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') to = enabled[(at + 1) % enabled.length]
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') to = enabled[(at - 1 + enabled.length) % enabled.length]
    else if (event.key === 'Home') to = enabled[0]
    else if (event.key === 'End') to = enabled[enabled.length - 1]
    if (to === undefined) return
    event.preventDefault()
    const next = options[to]
    if (!next) return
    segments.current[to]?.focus()
    if (next.value !== value) onChange(next.value)
  }

  return (
    <div role={tabs ? 'tablist' : 'radiogroup'} aria-label={label} className={clsx(styles.track, size === 'sm' && styles.small, className)}>
      {options.map((option, index) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => {
              segments.current[index] = el
            }}
            type="button"
            role={tabs ? 'tab' : 'radio'}
            {...(tabs ? { 'aria-selected': on, 'aria-controls': option.controls } : { 'aria-checked': on })}
            className={styles.segment}
            disabled={option.disabled}
            tabIndex={index === stop ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {option.label}
            {option.count !== undefined && (
              <>
                {' '}
                <span className={styles.count}>{option.count}</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
