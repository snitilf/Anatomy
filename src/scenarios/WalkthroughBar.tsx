import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import buttons from '../app/buttons.module.css'
import { lastInputWasKeyboard } from '../app/inputMode'
import { useAppStore } from '../app/store'
import { Tip } from '../app/Tip'
import { useCommand, type CommandView } from '../commands/context'
import { currentStep } from './step'
import styles from './WalkthroughBar.module.css'

/** Previous and Close: quiet icon buttons. A button that is off keeps its place and its focus. */
function IconStep({ view, label, disabled }: { view: CommandView; label: string; disabled?: boolean }) {
  const Icon = view.command.icon
  return (
    <Tip label={label} keys={view.shortcut} side="top">
      <button
        type="button"
        className={clsx(buttons.button, buttons.quiet, buttons.small, buttons.icon)}
        aria-label={label}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && view.run()}
      >
        <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </Tip>
  )
}

/**
 * The walkthrough, one step at a time, as a compact bar over the bottom of the map.
 * The controls are its bottom row, so Next stays under the pointer when the caption changes length.
 * Playing moves the highlight on the map. It runs nothing.
 */
export function WalkthroughBar() {
  const { board, scenario } = useAppStore(useShallow((s) => ({ board: s.board, scenario: s.scenario })))
  const next = useCommand('walkthrough.next')
  const previous = useCommand('walkthrough.previous')
  const close = useCommand('walkthrough.close')
  const nextButton = useRef<HTMLButtonElement>(null)
  const [instant] = useState(lastInputWasKeyboard)
  const startedFocus = useRef(false)
  const step = currentStep({ board, scenario })
  const running = step !== undefined

  // Focus moves to Next, so the arrow keys and Enter work at once.
  useEffect(() => {
    if (!running) return
    // The focus that starts the walkthrough is not a request for the tooltip, which would cover the caption.
    startedFocus.current = true
    nextButton.current?.focus({ preventScroll: true })
    // If Next already had focus nothing opened, so the flag must not wait for a later, real keyboard focus.
    const settled = requestAnimationFrame(() => {
      startedFocus.current = false
    })
    return () => cancelAnimationFrame(settled)
  }, [running])
  const quietFocus = useCallback(() => {
    const was = startedFocus.current
    startedFocus.current = false
    return was
  }, [])

  // Toasts sit above the bar while it plays: it tells the toaster how much of the bottom it holds.
  const bar = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = bar.current
    if (!running || !el) return
    const root = document.documentElement
    const place = () => {
      const edge = el.parentElement?.getBoundingClientRect().bottom ?? window.innerHeight
      const gap = window.innerHeight - edge + (parseFloat(getComputedStyle(el).bottom) || 0)
      root.style.setProperty('--toast-floor', `${Math.ceil(gap + el.offsetHeight + 8)}px`)
    }
    place()
    const watch = new ResizeObserver(place)
    watch.observe(el)
    window.addEventListener('resize', place)
    return () => {
      watch.disconnect()
      window.removeEventListener('resize', place)
      root.style.removeProperty('--toast-floor')
    }
  }, [running, step?.index])

  if (!step) return null
  const total = step.scenario.steps.length
  const last = step.index === total - 1
  return (
    <section ref={bar} className={styles.bar} aria-label={`Walkthrough: ${step.scenario.title}`} data-instant={instant || undefined}>
      <p className={styles.caption} aria-live="polite" aria-atomic="true">
        {step.caption}
      </p>
      <p className={styles.note}>Teaching sequence. Nothing runs.</p>
      <div className={styles.controls}>
        <p className={styles.title}>{step.scenario.title}</p>
        <IconStep view={previous} label="Previous" disabled={step.index === 0} />
        <p className={styles.count}>
          <span aria-hidden="true">
            {step.index + 1} / {total}
          </span>
          <span className="sr-only">
            Step {step.index + 1} of {total}
          </span>
        </p>
        {/* One button for the main action, so it keeps its place and its focus from the first step to the last. */}
        <Tip label={last ? 'Done' : 'Next'} keys={(last ? close : next).shortcut} side="top" consumeReturnFocus={quietFocus}>
          <button
            ref={nextButton}
            type="button"
            className={clsx(buttons.button, buttons.primary, buttons.small, styles.main)}
            onClick={() => (last ? close : next).run()}
          >
            {last ? (
              'Done'
            ) : (
              <>
                Next
                <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
              </>
            )}
          </button>
        </Tip>
        <IconStep view={close} label="Close" />
      </div>
    </section>
  )
}
