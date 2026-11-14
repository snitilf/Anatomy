import { act, fireEvent, render, screen } from '@testing-library/react'
import { SettingsMenu } from '../app/SettingsMenu'
import { press } from '../test/press'
import { Shellless } from '../test/Shellless'
import { AppStoreProvider } from '../app/AppStoreProvider'
import { afterEach, describe, expect, it } from 'vitest'
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
