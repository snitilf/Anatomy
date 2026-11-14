import { useSyncExternalStore } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

/** The same key the inline script in index.html reads before the first paint. */
export const THEME_KEY = 'anatomy:theme'
const DARK = '(prefers-color-scheme: dark)'

function readMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function systemTheme(): Theme {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK).matches ? 'dark' : 'light'
}

let mode: ThemeMode = typeof window === 'undefined' ? 'system' : readMode()
const listeners = new Set<() => void>()

function resolve(): Theme {
  return mode === 'system' ? systemTheme() : mode
}

function apply() {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolve()
}

function notify() {
  apply()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window.matchMedia === 'function') {
    window.matchMedia(DARK).addEventListener?.('change', onSystemChange)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window.matchMedia === 'function') {
      window.matchMedia(DARK).removeEventListener?.('change', onSystemChange)
    }
  }
}

function onSystemChange() {
  if (mode === 'system') notify()
}

export function getThemeMode(): ThemeMode {
  return mode
}

export function setThemeMode(next: ThemeMode) {
  mode = next
  try {
    if (next === 'system') window.localStorage.removeItem(THEME_KEY)
    else window.localStorage.setItem(THEME_KEY, next)
  } catch {
    // Without storage the choice lasts until the page closes.
  }
  notify()
}

/** The chosen mode: system, light, or dark. */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getThemeMode, () => 'system')
}

/** The theme in use now, with the system setting resolved. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, resolve, () => 'light')
}

/** Brings `data-theme` in line with the stored choice. The inline script has usually done it already. */
export function initTheme() {
  mode = readMode()
  apply()
}
