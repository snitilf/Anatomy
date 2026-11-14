import { useEffect, useRef, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppDispatch, useAppStore } from '../app/store'
import styles from './ScenarioPlayer.module.css'
import { currentStep } from './step'

/**
 * The bar that walks through one scenario, one step at a time.
 * Playing a scenario moves the highlight on the map. It runs nothing.
 */
export function ScenarioPlayer({ onClose }: { onClose: () => void }) {
  const { board, scenario } = useAppStore(useShallow((s) => ({ board: s.board, scenario: s.scenario })))
  const dispatch = useAppDispatch()
  const next = useRef<HTMLButtonElement>(null)
  const step = currentStep({ board, scenario })
  const running = step !== undefined

  // Keyboard users start the walkthrough from the Play button. Move focus to the controls so the arrow keys work at once.
  useEffect(() => {
    if (running) next.current?.focus()
  }, [running])

  if (!step) return null
  const total = step.scenario.steps.length
  const atStart = step.index === 0
  const atEnd = step.index === total - 1

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      dispatch({ type: 'scenarioNext' })
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      dispatch({ type: 'scenarioPrevious' })
    }
  }

  return (
    <section className={styles.bar} aria-label={`Walkthrough: ${step.scenario.title}`} onKeyDown={onKeyDown}>
      <div className={styles.head}>
        <p className={styles.title}>{step.scenario.title}</p>
        <p className={styles.count}>
          Step {step.index + 1} of {total}
        </p>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close" title="Close">
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      <p className={styles.caption} aria-live="polite" aria-atomic="true">
        {step.caption}
      </p>
      <div className={styles.foot}>
        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.step}
            aria-disabled={atStart || undefined}
            onClick={() => dispatch({ type: 'scenarioPrevious' })}
          >
            <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" />
            Previous
          </button>
          <button
            ref={next}
            type="button"
            className={clsx(styles.step, styles.forward)}
            aria-disabled={atEnd || undefined}
            onClick={() => dispatch({ type: 'scenarioNext' })}
          >
            Next
            <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}
