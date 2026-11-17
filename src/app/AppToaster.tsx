import type { CSSProperties } from 'react'
import { Toaster } from 'sonner'
import { useTheme } from '../theme/theme'

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
  return (
    <Toaster
      {...(id ? { id } : {})}
      position="bottom-center"
      offset={{ bottom: 'var(--toast-floor)' }}
      mobileOffset={{ bottom: 'var(--toast-floor)' }}
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
