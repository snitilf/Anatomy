import { useEffect, useRef, type KeyboardEvent } from 'react'
import { useAppDispatch, useAppState } from '../app/appContext'
import styles from './ScenarioPlayer.module.css'
import { currentStep } from './step'

/**
 * The bar that walks through one scenario, one step at a time.
 * A scenario is a written sequence. Playing it moves the highlight on the map and runs nothing.
 */
export function ScenarioPlayer({ onClose }: { onClose: () => void }) {
  const { board, scenario } = useAppState()
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
        <button type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>
      <p className={styles.caption} aria-live="polite" aria-atomic="true">
        {step.caption}
      </p>
      <div className={styles.foot}>
        <p className={styles.note}>Teaching sequence. Nothing runs.</p>
        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.step}
            aria-disabled={atStart || undefined}
            onClick={() => dispatch({ type: 'scenarioPrevious' })}
          >
            Previous
          </button>
          <button
            ref={next}
            type="button"
            className={`${styles.step} ${styles.forward}`}
            aria-disabled={atEnd || undefined}
            onClick={() => dispatch({ type: 'scenarioNext' })}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )
}
