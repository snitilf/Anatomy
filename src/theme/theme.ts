import { useSyncExternalStore } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

/** The same key that public/theme.js reads before the first paint. */
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

/**
 * The page offers a theme color for each color scheme, and a browser picks by the scheme of the system. The page may be in the other theme
 * (a stored choice, or the settings menu), so every theme-color meta takes the color of the theme in use. `public/theme.js` does the same before the first paint.
 */
function syncThemeColor(theme: Theme) {
  const metas = [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
  // The color of each scheme is remembered the first time, since the content is overwritten.
  for (const meta of metas) meta.dataset.color ??= meta.content
  const own = metas.find((m) => m.media.includes(theme))?.dataset.color
  if (own) for (const meta of metas) meta.content = own
}

function apply() {
  if (typeof document === 'undefined') return
  const theme = resolve()
  document.documentElement.dataset.theme = theme
  syncThemeColor(theme)
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

/** Brings `data-theme` in line with the stored choice. The script `public/theme.js` has usually done it already. */
export function initTheme() {
  mode = readMode()
  apply()
}
