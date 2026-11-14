import { useReactFlow, useStore } from '@xyflow/react'
import { Maximize, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import { stepZoom, zoomAround } from './camera'
import { GLIDE_MS, prefersStillness, useCamera } from './cameraContext'
import { LineKey } from './Legend'
import { zoomCommand } from './zoomKeys'
import styles from './ZoomBar.module.css'

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
const MOD = mac ? 'Cmd' : 'Ctrl'

/** Zoom out, the zoom level (a click resets it to 100%), zoom in, and fit, with the line key beside them. */
export function ZoomBar() {
  const flow = useReactFlow()
  const camera = useCamera()
  const percent = useStore((s) => Math.round(s.transform[2] * 100))
  const atMin = useStore((s) => s.transform[2] <= s.minZoom + 1e-3)
  const atMax = useStore((s) => s.transform[2] >= s.maxZoom - 1e-3)

  const zoomTo = useCallback(
    (zoom: number, animate: boolean) => {
      const size = camera.size()
      const middle = { x: size.width / 2, y: size.top + (size.height - size.top) / 2 }
      camera.move(zoomAround(flow.getViewport(), zoom, middle), animate && !prefersStillness() ? GLIDE_MS : 0)
    },
    [camera, flow],
  )
  const run = useCallback(
    (command: 'in' | 'out' | 'reset' | 'fit', animate: boolean) => {
      const duration = animate && !prefersStillness() ? GLIDE_MS : 0
      if (command === 'fit') camera.frame({}, duration)
      else if (command === 'reset') zoomTo(1, animate)
      else zoomTo(stepZoom(flow.getViewport().zoom, command === 'in' ? 1 : -1, camera.limits()), animate)
    },
    [camera, flow, zoomTo],
  )

  // Keys move the camera at once: they repeat, and a glide would lag behind them.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = zoomCommand(event)
      if (!command || event.defaultPrevented) return
      event.preventDefault()
      run(command, false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run])

  return (
    <div className={styles.dock}>
      <div className={styles.bar} role="toolbar" aria-label="Zoom">
        <button type="button" className={styles.button} onClick={() => run('out', true)} disabled={atMin} aria-label="Zoom out" title={`Zoom out (${MOD}+-)`}>
          <Minus size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button type="button" className={styles.level} onClick={() => run('reset', true)} aria-label={`Zoom ${percent}%, reset to 100%`} title={`Reset to 100% (${MOD}+0)`}>
          {percent}%
        </button>
        <button type="button" className={styles.button} onClick={() => run('in', true)} disabled={atMax} aria-label="Zoom in" title={`Zoom in (${MOD}+=)`}>
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <span className={styles.divider} aria-hidden="true" />
        <button type="button" className={styles.button} onClick={() => run('fit', true)} aria-label="Fit to screen" title="Fit to screen (Shift+1)">
          <Maximize size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      <LineKey />
    </div>
  )
}
