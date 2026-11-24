import { act, fireEvent, render, screen } from '@testing-library/react'
import { SettingsMenu } from '../app/SettingsMenu'
import { press } from '../test/press'
import { Shellless } from '../test/Shellless'
import { AppStoreProvider } from '../app/AppStoreProvider'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THEME_KEY, getThemeMode, initTheme, setThemeMode, useTheme } from './theme'

function Shown() {
  return <p>{useTheme()}</p>
}

afterEach(() => {
  setThemeMode('system')
})

describe('theme', () => {
  it('starts from the system setting and stores nothing', () => {
    window.localStorage.removeItem(THEME_KEY)
    initTheme()
    expect(getThemeMode()).toBe('system')
    // The test setup reports a light system theme.
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('applies and remembers a chosen theme, and forgets it for system', () => {
    render(<Shown />)
    act(() => setThemeMode('dark'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(screen.getByText('dark')).toBeInTheDocument()

    act(() => setThemeMode('system'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('reads a stored choice on start', () => {
    window.localStorage.setItem(THEME_KEY, 'dark')
    initTheme()
    expect(getThemeMode()).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('theme color of the page', () => {
  const COLORS = { light: '#d8dade', dark: '#0b0c11' }
  const metas = () => [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]

  beforeEach(() => {
    for (const meta of metas()) meta.remove()
    for (const [scheme, content] of Object.entries(COLORS)) {
      const meta = document.createElement('meta')
      meta.name = 'theme-color'
      meta.content = content
      meta.media = `(prefers-color-scheme: ${scheme})`
      document.head.append(meta)
    }
  })

  afterEach(() => {
    for (const meta of metas()) meta.remove()
  })

  it('follows a chosen theme, whatever the system theme is, so the bar of the browser matches the page', () => {
    act(() => setThemeMode('dark'))
    expect(metas().map((m) => m.content)).toEqual([COLORS.dark, COLORS.dark])
    act(() => setThemeMode('light'))
    expect(metas().map((m) => m.content)).toEqual([COLORS.light, COLORS.light])
  })

  it('goes back to the color of each scheme when the choice is the system theme', () => {
    act(() => setThemeMode('dark'))
    act(() => setThemeMode('system'))
    // The test setup reports a light system theme.
    expect(metas().map((m) => m.content)).toEqual([COLORS.light, COLORS.light])
  })
})

describe('settings menu', () => {
  it('switches the theme from the settings menu', async () => {
    render(
      <AppStoreProvider>
        <Shellless>
          <SettingsMenu />
        </Shellless>
      </AppStoreProvider>,
    )
    press(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(getThemeMode()).toBe('dark')
  })
})
