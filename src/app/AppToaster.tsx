import type { CSSProperties } from 'react'
import { Toaster } from 'sonner'

const LOOK = {
  '--normal-bg': 'var(--surface)',
  '--normal-text': 'var(--ink)',
  '--normal-border': 'var(--line)',
  '--border-radius': 'var(--radius-m)',
  '--width': 'max-content',
  fontFamily: 'inherit',
} as CSSProperties

/**
 * Short confirmations only. Errors and the save status stay on the page, because they must stay until read.
 * Sonner follows the system theme and skips its motion when the system asks for less.
 */
export function AppToaster({ id }: { id?: string }) {
  return (
    <Toaster
      {...(id ? { id } : {})}
      position="bottom-center"
      theme="system"
      duration={2500}
      visibleToasts={1}
      richColors={false}
      closeButton={false}
      style={LOOK}
      toastOptions={{ style: { padding: '10px 16px', fontSize: 14, fontWeight: 600, boxShadow: 'var(--lift)' } }}
    />
  )
}
