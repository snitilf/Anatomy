import type { CSSProperties } from 'react'
import { Toaster } from 'sonner'
import { useTheme } from '../theme/theme'

/**
 * How far up from the bottom of the window a toast sits. The map sets `--toast-base`: right above its bottom controls, in the
 * room a fit keeps free. A walkthrough bar sets `--toast-floor`, which wins, so a toast sits above the bar.
 */
const FLOOR = 'var(--toast-floor, var(--toast-base))'

const LOOK = {
  '--normal-bg': 'var(--raised)',
  '--normal-text': 'var(--fg)',
  '--normal-border': 'var(--border)',
  '--border-radius': 'var(--radius-md)',
  '--width': 'max-content',
  fontFamily: 'inherit',
} as CSSProperties

/**
 * Short confirmations only. Errors and the save status stay on the page, because they must stay until read.
 * Sonner follows the app theme and skips its motion when the system asks for less.
 */
export function AppToaster({ id }: { id?: string }) {
  const theme = useTheme()
  // A toaster in a dialog sits at a fixed height, since the map behind the dialog does not set where it goes.
  const floor = id ? '72px' : FLOOR
  return (
    <Toaster
      {...(id ? { id } : {})}
      position="bottom-center"
      // The toaster of the page follows the map. The one inside a dialog stays centered in the window.
      {...(id ? {} : { className: 'map-toaster' })}
      offset={{ bottom: floor }}
      mobileOffset={{ bottom: floor }}
      theme={theme}
      duration={2500}
      visibleToasts={1}
      richColors={false}
      closeButton={false}
      style={LOOK}
      toastOptions={{
        style: { padding: '8px 14px', fontSize: 13, lineHeight: '20px', fontWeight: 500, boxShadow: 'var(--shadow-float)' },
        // The way back, such as Undo, reads as a quiet text button in the accent.
        actionButtonStyle: { background: 'transparent', color: 'var(--accent-text)', fontSize: 13, fontWeight: 500, padding: '0 4px', height: 24 },
      }}
    />
  )
}
