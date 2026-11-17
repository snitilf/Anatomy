import { useCallback, useEffect, useRef, useState, type Ref } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { lastInputWasKeyboard } from '../app/inputMode'
import { useAppStore } from '../app/store'
import { Tip } from '../app/Tip'
import { useCommand, type CommandView } from '../commands/context'
import { currentStep } from './step'
import styles from './WalkthroughBar.module.css'

function StepButton({ view, label, disabled, buttonRef, quietFocus }: { view: CommandView; label: string; disabled?: boolean; buttonRef?: Ref<HTMLButtonElement>; quietFocus?: () => boolean }) {
  const Icon = view.command.icon
  return (
    <Tip label={label} keys={view.shortcut} side="top" {...(quietFocus ? { consumeReturnFocus: quietFocus } : {})}>
      <button ref={buttonRef} type="button" className={styles.button} aria-label={label} aria-disabled={disabled || undefined} onClick={() => !disabled && view.run()}>
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
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

  if (!step) return null
  const total = step.scenario.steps.length
  return (
    <section className={styles.bar} aria-label={`Walkthrough: ${step.scenario.title}`} data-instant={instant || undefined}>
      <p className={styles.caption} aria-live="polite" aria-atomic="true">
        {step.caption}
      </p>
      <div className={styles.controls}>
        <p className={styles.title}>{step.scenario.title}</p>
        <StepButton view={previous} label="Previous" disabled={step.index === 0} />
        <p className={styles.count}>
          <span aria-hidden="true">
            {step.index + 1} / {total}
          </span>
          <span className="sr-only">
            Step {step.index + 1} of {total}
          </span>
        </p>
        <StepButton view={next} label="Next" disabled={step.index === total - 1} buttonRef={nextButton} quietFocus={quietFocus} />
        <StepButton view={close} label="Close" />
      </div>
    </section>
  )
}
