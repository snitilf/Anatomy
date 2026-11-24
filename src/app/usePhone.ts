import { useSyncExternalStore } from 'react'

const PHONE = '(max-width: 760px)'

function subscribePhone(listener: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(PHONE)
  query.addEventListener?.('change', listener)
  return () => query.removeEventListener?.('change', listener)
}

/** True at phone width, where the sidebar is a bottom sheet. */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribePhone, () => typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches, () => false)
}

/** The same answer outside a component, for a command that asks when it runs. */
export function onPhone(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches
}
