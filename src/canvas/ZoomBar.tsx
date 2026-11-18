import { useStore } from '@xyflow/react'
import { useCommand, type CommandView } from '../commands/context'
import { Tip } from '../app/Tip'
import { useCamera, type ZoomCommand } from './cameraContext'
import { LineKey } from './Legend'
import styles from './ZoomBar.module.css'

function ZoomButton({ view, zoom, disabled }: { view: CommandView; zoom: ZoomCommand; disabled?: boolean }) {
  const camera = useCamera()
  const Icon = view.command.icon
  return (
    <Tip label={view.label} keys={view.shortcut} side="top">
      <button type="button" className={styles.button} data-zoom={zoom} onClick={() => camera.zoom(zoom, true)} disabled={disabled} aria-label={view.label}>
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </Tip>
  )
}

/** Zoom out, the zoom level (a click resets it to 100%), zoom in, and fit, with the line key beside them. */
export function ZoomBar() {
  const camera = useCamera()
  const percent = useStore((s) => Math.round(s.transform[2] * 100))
  const atMin = useStore((s) => s.transform[2] <= s.minZoom + 1e-3)
  const atMax = useStore((s) => s.transform[2] >= s.maxZoom - 1e-3)
  const zoomIn = useCommand('zoom.in')
  const zoomOut = useCommand('zoom.out')
  const reset = useCommand('zoom.reset')
  const fit = useCommand('zoom.fit')

  return (
    <div className={styles.dock}>
      <div className={styles.bar} role="toolbar" aria-label="Zoom">
        <span className={styles.steps}>
          <ZoomButton view={zoomOut} zoom="out" disabled={atMin} />
          <Tip label={reset.label} keys={reset.shortcut} side="top">
            <button type="button" className={styles.level} onClick={() => camera.zoom('reset', true)} aria-label={`Zoom ${percent}%, reset to 100%`}>
              {percent}%
            </button>
          </Tip>
          <ZoomButton view={zoomIn} zoom="in" disabled={atMax} />
          <span className={styles.divider} aria-hidden="true" />
        </span>
        <ZoomButton view={fit} zoom="fit" />
        <span className={styles.key}>
          <LineKey />
        </span>
      </div>
    </div>
  )
}
